"use client";

import { useCallback, useEffect, useState } from "react";
import { House } from "lucide-react";
import { useHris } from "@/lib/store";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { WfhTracker } from "@/components/wfh/WfhTracker";
import { WfhDayLog, WfhSchedules } from "@/components/wfh/WfhReview";
import { WfhLive } from "@/components/wfh/WfhLive";
import { WfhCutoffLog } from "@/components/wfh/WfhCutoffLog";
import { todayInManila } from "@/lib/leave-policy";
import { fetchWfhDay, fetchWfhSchedules, type WfhEvent, type WfhSchedule, type WfhSession } from "@/lib/wfh";

// Work From Home: the employee's Start / Stop working with activity
// tracking; the day's log for them, their supervisor and HR; HR sets who
// works from home and when.
export default function WfhPage() {
  const { currentUser, currentEmployee, employees, isRealAccount } = useHris();
  const isHr = !!currentUser?.roles.includes("hr_admin");
  const me = currentEmployee?.id;
  const today = todayInManila();
  const [date, setDate] = useState(today);
  const [schedules, setSchedules] = useState<WfhSchedule[] | null>(null);
  const [day, setDay] = useState<{ sessions: WfhSession[]; events: WfhEvent[] }>({ sessions: [], events: [] });
  const [open, setOpen] = useState<WfhSession | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!isRealAccount) return;
    Promise.all([fetchWfhSchedules(), fetchWfhDay(date, date), me ? fetchWfhDay(addDays(today, -7), today) : Promise.resolve({ sessions: [], events: [] })]).then(
      ([s, d, recent]) => {
        setSchedules(s);
        setDay(d);
        // Only today's open session is continued; an older one is closed on Start working.
        setOpen(recent.sessions.find((x) => x.employeeId === me && !x.endedAt && x.workDate === today) ?? null);
        setError(null);
      },
      (e: Error) => setError(e.message),
    );
  }, [isRealAccount, date, me, today]);
  useEffect(() => load(), [load]);

  const mine = schedules?.find((s) => s.employeeId === me) ?? null;
  const others = (schedules ?? []).filter((s) => s.employeeId !== me);

  if (!isRealAccount) {
    return (
      <div>
        <PageHeader title="Work From Home" subtitle="Work-from-home time and activity." />
        <EmptyState icon={House} title="Not available in the demo" description="Sign in with your employee account." />
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Work From Home" subtitle="Start and stop your work-from-home time; your supervisor and HR see each day's activity log." />
      {error && <div className="mb-4 rounded-lg border border-[var(--status-critical)]/40 px-3 py-2 text-sm text-[var(--status-critical)]">{error}</div>}

      {mine && <WfhTracker schedule={mine} openSession={open} onChanged={load} />}

      {/* HR, Upper Management and supervisors: who's working right now. */}
      {schedules && others.length > 0 && <WfhLive schedules={others} employees={employees} />}

      {schedules && !mine && !others.length && !isHr && <EmptyState icon={House} title="You aren't set up for work from home" description="HR sets who works from home. Ask HR if you need to." />}

      {schedules && (mine || others.length > 0 || isHr) && (
        <div className="mb-4 rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-1)] p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm font-medium text-[var(--text-primary)]">{mine && !others.length ? "My work-from-home log" : "Work-from-home log"}</div>
            <input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value || today)} className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-1.5 text-xs" />
          </div>
          <WfhDayLog date={date} schedules={schedules} employees={employees} sessions={day.sessions} events={day.events} meId={me} onChanged={load} />
        </div>
      )}

      {schedules && (mine || others.length > 0 || isHr) && (
        <div className="mb-4 rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-1)] p-4">
          <div className="mb-3 text-sm font-medium text-[var(--text-primary)]">{mine && !others.length ? "My log per cut-off" : "Log per cut-off"}</div>
          <WfhCutoffLog schedules={schedules} employees={employees} today={today} />
        </div>
      )}

      {isHr && schedules && (
        <div className="mb-4 rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-1)] p-4">
          <div className="mb-3 text-sm font-medium text-[var(--text-primary)]">Who works from home</div>
          <WfhSchedules schedules={schedules} employees={employees} onChanged={load} />
        </div>
      )}
    </div>
  );
}

function addDays(d: string, n: number) {
  const t = new Date(`${d}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
}
