"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { useHris } from "@/lib/store";
import { formatDate, fullName } from "@/lib/helpers";
import type { Employee } from "@/lib/types";
import { describeDay, fetchWfhDay, hm, isoWeekday, scheduledMinutes, summarize, type WfhEvent, type WfhSchedule, type WfhSession } from "@/lib/wfh";

// Every work-from-home day in a payroll cut-off, per employee: time in / out,
// active, idle, tab closed, presence checks and the accomplishment report,
// with the cut-off's totals. Downloadable as CSV.

const time = (iso: string) => new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit" }).format(new Date(iso));
const dayLabel = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-PH", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" });

function datesBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let t = new Date(`${from}T00:00:00Z`); t.toISOString().slice(0, 10) <= to; t.setUTCDate(t.getUTCDate() + 1)) out.push(t.toISOString().slice(0, 10));
  return out;
}

interface DayRow {
  date: string;
  scheduled: number;
  scheduleText: string;
  sessions: WfhSession[];
  sum: ReturnType<typeof summarize>;
  report: string;
}

export function WfhCutoffLog({ schedules, employees, today }: { schedules: WfhSchedule[]; employees: Employee[]; today: string }) {
  const { payrollPeriods } = useHris();
  const periods = useMemo(() => [...payrollPeriods].filter((p) => p.start <= today).sort((a, b) => b.start.localeCompare(a.start)), [payrollPeriods, today]);
  const [periodId, setPeriodId] = useState("");
  const period = periods.find((p) => p.id === periodId) ?? periods.find((p) => p.start <= today && today <= p.end) ?? periods[0];
  // Loaded per cut-off; another cut-off's data shows as loading.
  const [loaded, setLoaded] = useState<{ key: string; sessions: WfhSession[]; events: WfhEvent[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const key = period ? `${period.start}|${period.end}` : "";
  const data = loaded?.key === key ? loaded : null;

  useEffect(() => {
    if (!key) return;
    const [from, to] = key.split("|");
    fetchWfhDay(from, to).then(
      (d) => (setLoaded({ key, ...d }), setError(null)),
      (e: Error) => setError(e.message),
    );
  }, [key]);

  if (!period) return <div className="text-sm text-[var(--text-muted)]">No payroll cut-offs yet.</div>;

  const dates = datesBetween(period.start, period.end > today ? today : period.end);
  const people = schedules
    .map((sch) => {
      const e = employees.find((x) => x.id === sch.employeeId);
      const rows: DayRow[] = dates
        .map((date) => {
          const day = sch.days[String(isoWeekday(date))];
          const ss = (data?.sessions ?? []).filter((s) => s.employeeId === sch.employeeId && s.workDate === date);
          const ids = new Set(ss.map((s) => s.id));
          const ev = (data?.events ?? []).filter((x) => ids.has(x.sessionId));
          return {
            date,
            scheduled: scheduledMinutes(day),
            scheduleText: day ? describeDay(day) : "",
            sessions: ss,
            sum: summarize(ss, ev),
            report: ss
              .map((s) => s.report?.trim())
              .filter(Boolean)
              .join("\n\n"),
          };
        })
        .filter((r) => r.scheduled > 0 || r.sessions.length > 0);
      const worked = rows.filter((r) => r.sessions.length);
      const total = (k: "active" | "idle" | "offline" | "checksOk" | "checksMissed") => worked.reduce((t, r) => t + r.sum[k], 0);
      return {
        id: sch.employeeId,
        name: e ? fullName(e) : sch.employeeId,
        rows,
        totals: {
          scheduledDays: rows.filter((r) => r.scheduled > 0).length,
          workedDays: worked.length,
          missedDays: rows.filter((r) => r.scheduled > 0 && !r.sessions.length).length,
          scheduled: rows.reduce((t, r) => t + r.scheduled, 0),
          active: total("active"),
          idle: total("idle"),
          offline: total("offline"),
          checksOk: total("checksOk"),
          checksMissed: total("checksMissed"),
        },
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  function downloadCsv() {
    const q = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const lines = [["Employee", "Date", "Scheduled", "Time in", "Time out", "Active (min)", "Idle (min)", "Tab closed (min)", "Checks answered", "Checks missed", "Accomplishment report"].map(q).join(",")];
    for (const p of people)
      for (const r of p.rows)
        lines.push(
          [
            p.name,
            r.date,
            r.scheduleText || "Not scheduled",
            r.sum.firstIn ? time(r.sum.firstIn) : "",
            r.sum.open ? "still working" : r.sum.lastOut ? time(r.sum.lastOut) : "",
            Math.round(r.sum.active),
            Math.round(r.sum.idle),
            Math.round(r.sum.offline),
            r.sum.checksOk,
            r.sum.checksMissed,
            r.report,
          ]
            .map(q)
            .join(","),
        );
    const url = URL.createObjectURL(new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: `WFH log ${period.start} to ${period.end}.csv` });
    a.click();
    URL.revokeObjectURL(url);
  }

  const th = "px-2 py-1.5 text-left font-medium";
  const td = "px-2 py-1.5 align-top";
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <select value={period.id} onChange={(e) => setPeriodId(e.target.value)} className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-1.5 text-xs" aria-label="Cut-off">
          {periods.map((p) => (
            <option key={p.id} value={p.id}>
              {formatDate(p.start)} – {formatDate(p.end)}
            </option>
          ))}
        </select>
        <button
          onClick={downloadCsv}
          disabled={!data}
          className="ml-auto flex items-center gap-1.5 rounded-lg border border-[var(--border-hairline)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40 disabled:opacity-40"
        >
          <Download size={13} /> Download CSV
        </button>
      </div>
      {error && <div className="mb-2 text-xs text-[var(--status-critical)]">{error}</div>}
      {!data && !error && (
        <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
          <Loader2 size={14} className="animate-spin" /> Loading…
        </div>
      )}
      {data && !people.length && <div className="text-sm text-[var(--text-muted)]">No one is set up to work from home.</div>}
      {data && (
        <div className="space-y-4">
          {people.map((p) => (
            <div key={p.id} className="rounded-lg border border-[var(--border-hairline)]">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-[var(--gridline)] px-3 py-2 text-sm">
                <span className="font-medium text-[var(--text-primary)]">{p.name}</span>
                <span className="text-xs text-[var(--text-secondary)]">
                  Worked {p.totals.workedDays} of {p.totals.scheduledDays} scheduled day{p.totals.scheduledDays === 1 ? "" : "s"} · Active <b>{hm(p.totals.active)}</b>
                  {p.totals.scheduled ? ` of ${hm(p.totals.scheduled)} scheduled` : ""} · Idle {hm(p.totals.idle)}
                  {p.totals.offline ? ` · Tab closed ${hm(p.totals.offline)}` : ""} · Checks {p.totals.checksOk}✓{p.totals.checksMissed ? ` ${p.totals.checksMissed}✗` : ""}
                </span>
                {p.totals.missedDays > 0 && <span className="text-xs text-[var(--status-warning)]">{p.totals.missedDays} scheduled day{p.totals.missedDays === 1 ? "" : "s"} with no time logged</span>}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-xs">
                  <thead className="text-[var(--text-muted)]">
                    <tr className="border-b border-[var(--gridline)]">
                      <th className={th}>Date</th>
                      <th className={th}>Scheduled</th>
                      <th className={th}>In</th>
                      <th className={th}>Out</th>
                      <th className={`${th} text-right`}>Active</th>
                      <th className={`${th} text-right`}>Idle</th>
                      <th className={`${th} text-right`}>Tab closed</th>
                      <th className={`${th} text-right`}>Checks</th>
                      <th className={th}>Accomplishment report</th>
                    </tr>
                  </thead>
                  <tbody>
                    {p.rows.map((r) => (
                      <tr key={r.date} className="border-b border-[var(--gridline)] last:border-0">
                        <td className={`${td} whitespace-nowrap text-[var(--text-primary)]`}>{dayLabel(r.date)}</td>
                        <td className={`${td} text-[var(--text-secondary)]`}>{r.scheduleText || "Not scheduled"}</td>
                        {r.sessions.length ? (
                          <>
                            <td className={`${td} whitespace-nowrap`}>{time(r.sum.firstIn!)}</td>
                            <td className={`${td} whitespace-nowrap`}>{r.sum.open ? "still working" : time(r.sum.lastOut!)}</td>
                            <td className={`${td} tabular text-right font-semibold text-[var(--text-primary)]`}>{hm(r.sum.active)}</td>
                            <td className={`${td} tabular text-right`}>{hm(r.sum.idle)}</td>
                            <td className={`${td} tabular text-right`}>{r.sum.offline ? hm(r.sum.offline) : "—"}</td>
                            <td className={`${td} tabular text-right`}>
                              {r.sum.checksOk}✓{r.sum.checksMissed ? <span className="text-[var(--status-critical)]"> {r.sum.checksMissed}✗</span> : ""}
                            </td>
                            <td className={`${td} max-w-[280px] whitespace-pre-wrap text-[var(--text-secondary)]`}>{r.report || "—"}</td>
                          </>
                        ) : (
                          <td colSpan={7} className={`${td} text-[var(--status-warning)]`}>
                            No work-from-home time logged
                          </td>
                        )}
                      </tr>
                    ))}
                    {!p.rows.length && (
                      <tr>
                        <td colSpan={9} className={`${td} text-[var(--text-muted)]`}>
                          No scheduled or logged days in this cut-off.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
