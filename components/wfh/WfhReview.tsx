"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { Modal } from "@/components/Modal";
import { fullName } from "@/lib/helpers";
import type { Employee } from "@/lib/types";
import {
  WEEKDAYS,
  describeDay,
  explainWfh,
  hm,
  isoWeekday,
  removeWfhSchedule,
  saveWfhSchedule,
  summarize,
  type WfhDay,
  type WfhEvent,
  type WfhSchedule,
  type WfhSession,
} from "@/lib/wfh";

const time = (iso: string) => new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit" }).format(new Date(iso));
const KIND: Record<WfhEvent["kind"], string> = {
  idle: "Idle (no keyboard / mouse)",
  locked: "Screen locked",
  offline: "HRIS tab closed",
  check_ok: "Presence check answered",
  check_missed: "Presence check missed",
};

// One day's log per work-from-home employee.
export function WfhDayLog({
  date,
  schedules,
  employees,
  sessions,
  events,
  meId,
  onChanged,
}: {
  date: string;
  schedules: WfhSchedule[];
  employees: Employee[];
  sessions: WfhSession[];
  events: WfhEvent[];
  meId: string | undefined;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  if (!schedules.length) return <div className="text-sm text-[var(--text-muted)]">No one is set up to work from home.</div>;
  return (
    <div className="space-y-2">
      {schedules.map((sch) => {
        const e = employees.find((x) => x.id === sch.employeeId);
        const ss = sessions.filter((s) => s.employeeId === sch.employeeId);
        const ev = events.filter((x) => x.employeeId === sch.employeeId);
        const sum = summarize(ss, ev);
        const day = sch.days[String(isoWeekday(date))];
        const isOpen = open[sch.employeeId] ?? sch.employeeId === meId;
        return (
          <div key={sch.employeeId} className="rounded-lg border border-[var(--border-hairline)]">
            <button onClick={() => setOpen((o) => ({ ...o, [sch.employeeId]: !isOpen }))} className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2 text-left text-sm">
              {isOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
              <span className="min-w-40 font-medium text-[var(--text-primary)]">{e ? fullName(e) : sch.employeeId}</span>
              <span className="text-xs text-[var(--text-muted)]">Scheduled: {describeDay(day)}</span>
              {ss.length ? (
                <span className="text-xs text-[var(--text-secondary)]">
                  In {time(sum.firstIn!)} · {sum.open ? "still working" : `Out ${time(sum.lastOut!)}`} · Active <b>{hm(sum.active)}</b> · Idle {hm(sum.idle)}
                  {sum.offline ? ` · Tab closed ${hm(sum.offline)}` : ""} · Checks {sum.checksOk}✓{sum.checksMissed ? ` ${sum.checksMissed}✗` : ""}
                </span>
              ) : (
                <span className="text-xs text-[var(--status-warning)]">{day ? "No work-from-home time logged" : "Not scheduled"}</span>
              )}
            </button>
            {isOpen && ss.length > 0 && (
              <div className="space-y-3 border-t border-[var(--gridline)] px-3 py-3 text-sm">
                {ss.map((s) => (
                  <div key={s.id}>
                    <div className="text-xs font-medium text-[var(--text-secondary)]">
                      Worked {time(s.startedAt)} – {s.endedAt ? time(s.endedAt) : `still open (last seen ${time(s.lastSeenAt)})`}
                    </div>
                    <ul className="mt-1 space-y-1">
                      {ev
                        .filter((x) => x.sessionId === s.id)
                        .map((x) => (
                          <EventRow key={x.id} event={x} mine={x.employeeId === meId} onChanged={onChanged} />
                        ))}
                    </ul>
                    {s.report && (
                      <div className="mt-2 rounded-md bg-[var(--gridline)]/25 px-3 py-2 text-xs whitespace-pre-wrap text-[var(--text-primary)]">
                        <div className="mb-1 font-medium text-[var(--text-secondary)]">Accomplishment report</div>
                        {s.report}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function EventRow({ event: x, mine, onChanged }: { event: WfhEvent; mine: boolean; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [reason, setReason] = useState(x.reason ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bad = x.kind !== "check_ok";
  const explainable = ["idle", "locked", "offline"].includes(x.kind);
  async function save() {
    setBusy(true);
    setError(null);
    try {
      await explainWfh(x.id, reason);
      setEditing(false);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save.");
    } finally {
      setBusy(false);
    }
  }
  const dur = x.endedAt ? Math.round((new Date(x.endedAt).getTime() - new Date(x.startedAt).getTime()) / 60_000) : null;
  return (
    <li className="text-xs">
      <span className={bad ? "text-[var(--status-warning)]" : "text-[var(--status-good)]"}>●</span>{" "}
      <span className="text-[var(--text-primary)]">
        {time(x.startedAt)}
        {x.endedAt ? `–${time(x.endedAt)}` : ""}
      </span>{" "}
      <span className="text-[var(--text-secondary)]">
        {KIND[x.kind]}
        {dur !== null ? ` (${hm(dur)})` : ""}
      </span>
      {x.reason && !editing && <span className="text-[var(--text-muted)]"> — {x.reason}</span>}
      {mine && explainable && !editing && (
        <button onClick={() => setEditing(true)} className="ml-2 text-[var(--series-1)] hover:underline">
          {x.reason ? "Edit reason" : "Add reason"}
        </button>
      )}
      {editing && (
        <span className="mt-1 flex gap-2">
          <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder="e.g. Zoom call with a client" className="flex-1 rounded-md border border-[var(--border-hairline)] bg-[var(--surface-1)] px-2 py-1 text-xs" />
          <button onClick={save} disabled={busy} className="rounded-md bg-[var(--series-1)] px-2 py-1 text-xs font-medium text-[var(--on-accent)] disabled:opacity-50">
            {busy ? <Loader2 size={12} className="animate-spin" /> : "Save"}
          </button>
          <button onClick={() => setEditing(false)} className="text-xs text-[var(--text-muted)]">
            Cancel
          </button>
        </span>
      )}
      {error && <span className="ml-2 text-[var(--status-critical)]">{error}</span>}
    </li>
  );
}

// ---- HR: who works from home, and when ---------------------------------------------

export function WfhSchedules({ schedules, employees, onChanged }: { schedules: WfhSchedule[]; employees: Employee[]; onChanged: () => void }) {
  const [editing, setEditing] = useState<WfhSchedule | null>(null);
  return (
    <div>
      <div className="space-y-1.5">
        {schedules.map((s) => {
          const e = employees.find((x) => x.id === s.employeeId);
          const days = WEEKDAYS.map((w, i) => (s.days[String(i + 1)] ? `${w.slice(0, 3)} ${describeDay(s.days[String(i + 1)])}` : null)).filter(Boolean);
          return (
            <div key={s.employeeId} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[var(--gridline)]/20 px-3 py-2 text-sm">
              <div>
                <span className="font-medium text-[var(--text-primary)]">{e ? fullName(e) : s.employeeId}</span>
                <span className="ml-2 text-xs text-[var(--text-secondary)]">{days.join(" · ") || "No days set"}</span>
                {!s.acknowledgedAt && <span className="ml-2 text-xs text-[var(--status-warning)]">Notice not yet acknowledged</span>}
              </div>
              <button onClick={() => setEditing(s)} className="flex items-center gap-1 rounded-md border border-[var(--border-hairline)] px-2 py-1 text-xs text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40">
                <Pencil size={12} /> Edit
              </button>
            </div>
          );
        })}
      </div>
      <button onClick={() => setEditing({ employeeId: "", days: {}, acknowledgedAt: null })} className="mt-2 flex items-center gap-1 text-xs text-[var(--series-1)] hover:underline">
        <Plus size={13} /> Add a work-from-home employee
      </button>
      {editing && <ScheduleModal schedule={editing} existing={schedules} employees={employees} onClose={() => setEditing(null)} onChanged={onChanged} />}
    </div>
  );
}

type DayMode = "off" | "hours" | "flex";
function ScheduleModal({ schedule, existing, employees, onClose, onChanged }: { schedule: WfhSchedule; existing: WfhSchedule[]; employees: Employee[]; onClose: () => void; onChanged: () => void }) {
  const [employeeId, setEmployeeId] = useState(schedule.employeeId);
  const [days, setDays] = useState<Partial<Record<string, WfhDay>>>(schedule.days);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mode = (d: WfhDay | undefined): DayMode => (!d ? "off" : "minutes" in d ? "flex" : "hours");
  const input = "rounded-md border border-[var(--border-hairline)] bg-[var(--surface-1)] px-2 py-1 text-xs";
  const choices = employees.filter((e) => (e.status === "active" || e.status === "on_leave") && (e.id === schedule.employeeId || !existing.some((s) => s.employeeId === e.id))).sort((a, b) => fullName(a).localeCompare(fullName(b)));

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await saveWfhSchedule(employeeId, days);
      onChanged();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save.");
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await removeWfhSchedule(employeeId);
      onChanged();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't remove.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={() => !busy && onClose()} title="Work-from-home schedule">
      <div className="space-y-3 text-sm">
        <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} disabled={!!schedule.employeeId} className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-2 text-sm">
          <option value="">Choose an employee…</option>
          {choices.map((e) => (
            <option key={e.id} value={e.id}>
              {fullName(e)}
            </option>
          ))}
        </select>
        <div className="space-y-1.5">
          {WEEKDAYS.map((w, i) => {
            const k = String(i + 1);
            const d = days[k];
            const m = mode(d);
            return (
              <div key={k} className="flex flex-wrap items-center gap-2">
                <span className="w-24 text-xs text-[var(--text-secondary)]">{w}</span>
                <select
                  value={m}
                  onChange={(e) => {
                    const v = e.target.value as DayMode;
                    setDays((x) => ({ ...x, [k]: v === "off" ? undefined : v === "hours" ? { start: "08:00", end: "17:00" } : { minutes: 120 } }));
                  }}
                  className={input}
                >
                  <option value="off">No WFH</option>
                  <option value="hours">Set hours</option>
                  <option value="flex">Number of hours, any time</option>
                </select>
                {d && "start" in d && (
                  <>
                    <input type="time" value={d.start} onChange={(e) => setDays((x) => ({ ...x, [k]: { ...d, start: e.target.value } }))} className={input} />
                    <span className="text-xs">to</span>
                    <input type="time" value={d.end} onChange={(e) => setDays((x) => ({ ...x, [k]: { ...d, end: e.target.value } }))} className={input} />
                  </>
                )}
                {d && "minutes" in d && (
                  <>
                    <input type="number" min={0.5} max={12} step={0.5} value={d.minutes / 60} onChange={(e) => setDays((x) => ({ ...x, [k]: { minutes: Math.round((Number(e.target.value) || 0) * 60) } }))} className={`${input} w-20`} />
                    <span className="text-xs">hours</span>
                  </>
                )}
              </div>
            );
          })}
        </div>
        {error && <div className="text-xs text-[var(--status-critical)]">{error}</div>}
        <div className="flex justify-between gap-2">
          {schedule.employeeId ? (
            <button onClick={remove} disabled={busy} className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm text-[var(--status-critical)] hover:bg-[var(--gridline)]/40">
              <Trash2 size={14} /> Remove from WFH
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button onClick={onClose} disabled={busy} className="rounded-lg px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40">
              Cancel
            </button>
            <button onClick={save} disabled={busy || !employeeId} className="rounded-lg bg-[var(--series-1)] px-3 py-1.5 text-sm font-medium text-[var(--on-accent)] disabled:opacity-40">
              {busy ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
