"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { fullName } from "@/lib/helpers";
import { todayInManila } from "@/lib/leave-policy";
import type { Employee } from "@/lib/types";
import { describeDay, fetchWfhDay, hm, isoWeekday, summarize, type WfhEvent, type WfhSchedule, type WfhSession } from "@/lib/wfh";

// "Who's working now": each work-from-home employee's status, refreshed
// every minute. A clocked-in tab not heard from for over 2½ minutes (it
// reports every minute) counts as offline.
const OFFLINE_AFTER_MS = 150_000;
const time = (iso: string) => new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit" }).format(new Date(iso));

type Status = { label: string; detail: string; tone: "good" | "warning" | "critical" | "muted" };

function statusOf(sessions: WfhSession[], now: number): Status {
  const open = sessions.filter((s) => !s.endedAt).sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
  if (!open) {
    const last = sessions.map((s) => s.endedAt!).sort().pop();
    return last ? { label: "Done for today", detail: `Stopped working at ${time(last)}`, tone: "muted" } : { label: "Not clocked in", detail: "", tone: "muted" };
  }
  if (now - new Date(open.lastSeenAt).getTime() > OFFLINE_AFTER_MS) return { label: "Offline", detail: `HRIS tab closed since ${time(open.lastSeenAt)}`, tone: "critical" };
  if (open.state === "idle" && open.stateSince) return { label: "Idle", detail: `No keyboard / mouse since ${time(open.stateSince)} (${hm((now - new Date(open.stateSince).getTime()) / 60_000)})`, tone: "warning" };
  if (open.state === "locked" && open.stateSince) return { label: "Screen locked", detail: `Since ${time(open.stateSince)} (${hm((now - new Date(open.stateSince).getTime()) / 60_000)})`, tone: "warning" };
  return { label: "Working", detail: `Since ${time(open.startedAt)}`, tone: "good" };
}

const TONE: Record<Status["tone"], string> = {
  good: "bg-[var(--status-good)]/15 text-[var(--status-good)]",
  warning: "bg-[var(--status-warning)]/15 text-[var(--status-warning)]",
  critical: "bg-[var(--status-critical)]/15 text-[var(--status-critical)]",
  muted: "bg-[var(--gridline)]/40 text-[var(--text-muted)]",
};

export function WfhLive({ schedules, employees }: { schedules: WfhSchedule[]; employees: Employee[] }) {
  const today = todayInManila();
  const [data, setData] = useState<{ sessions: WfhSession[]; events: WfhEvent[] } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    fetchWfhDay(today, today).then(
      (d) => {
        setData(d);
        setNow(Date.now());
        setError(null);
      },
      (e: Error) => setError(e.message),
    );
  }, [today]);
  useEffect(() => {
    load();
    const t = window.setInterval(load, 60_000);
    return () => window.clearInterval(t);
  }, [load]);

  return (
    <div className="mb-4 rounded-xl border border-[var(--series-1)]/40 bg-[var(--surface-1)] p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-medium text-[var(--text-primary)]">Who&rsquo;s working now</div>
          <div className="text-xs text-[var(--text-muted)]">Updates every minute{data ? ` · as of ${time(new Date(now).toISOString())}` : ""}</div>
        </div>
        <button onClick={load} className="flex items-center gap-1 rounded-md border border-[var(--border-hairline)] px-2 py-1 text-xs text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40">
          <RefreshCw size={12} /> Refresh
        </button>
      </div>
      {error && <div className="mb-2 text-xs text-[var(--status-critical)]">{error}</div>}
      <div className="grid gap-2 sm:grid-cols-2">
        {schedules.map((sch) => {
          const e = employees.find((x) => x.id === sch.employeeId);
          const ss = (data?.sessions ?? []).filter((s) => s.employeeId === sch.employeeId);
          const st = statusOf(ss, now);
          const sum = ss.length ? summarize(ss, (data?.events ?? []).filter((x) => x.employeeId === sch.employeeId), new Date(now).toISOString()) : null;
          const day = sch.days[String(isoWeekday(today))];
          return (
            <div key={sch.employeeId} className="rounded-lg border border-[var(--border-hairline)] px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-[var(--text-primary)]">{e ? fullName(e) : sch.employeeId}</span>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${TONE[st.tone]}`}>● {st.label}</span>
              </div>
              <div className="mt-1 text-xs text-[var(--text-secondary)]">{st.detail || (day ? `Scheduled today: ${describeDay(day)}` : "Not scheduled today")}</div>
              {sum && (
                <div className="mt-0.5 text-xs text-[var(--text-muted)]">
                  Today: active {hm(sum.active)} · idle {hm(sum.idle)}
                  {sum.offline ? ` · tab closed ${hm(sum.offline)}` : ""} · checks {sum.checksOk}✓{sum.checksMissed ? ` ${sum.checksMissed}✗` : ""}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
