import { getSupabaseClient } from "./supabase/client";

// Work From Home activity log (supabase/migrate_phase58_work_from_home.sql):
// the employee clicks Start working; while the HRIS tab is open, idle
// stretches (no keyboard / mouse anywhere on the computer for
// WFH_IDLE_MINUTES, or the screen locked — Chrome/Edge Idle Detection) and
// random "Are you there?" checks are logged; Stop working asks for the
// day's accomplishment report. HR and the supervisor review each day.

export const WFH_IDLE_MINUTES = 5;
export const WFH_CHECK_RESPONSE_MINUTES = 3;

// 1 = Monday … 7 = Sunday. Hours ("08:00"–"17:00") or expected minutes.
export type WfhDay = { start: string; end: string } | { minutes: number };
export interface WfhSchedule {
  employeeId: string;
  days: Partial<Record<string, WfhDay>>;
  acknowledgedAt: string | null;
}

export interface WfhSession {
  id: string;
  employeeId: string;
  workDate: string;
  startedAt: string;
  lastSeenAt: string;
  endedAt: string | null;
  report: string | null;
}

export type WfhEventKind = "idle" | "locked" | "offline" | "check_ok" | "check_missed";
export interface WfhEvent {
  id: string;
  sessionId: string;
  employeeId: string;
  kind: WfhEventKind;
  startedAt: string;
  endedAt: string | null;
  reason: string | null;
}

export const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

// ISO weekday (1 = Monday) of a YYYY-MM-DD date.
export const isoWeekday = (d: string) => ((new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;
const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
export const scheduledMinutes = (day: WfhDay | undefined) => (!day ? 0 : "minutes" in day ? day.minutes : Math.max(0, toMin(day.end) - toMin(day.start)));
export const describeDay = (day: WfhDay | undefined) => (!day ? "—" : "minutes" in day ? `${(day.minutes / 60).toLocaleString("en-PH", { maximumFractionDigits: 1 })} hours (any time)` : `${fmt12(day.start)} – ${fmt12(day.end)}`);
export function fmt12(t: string) {
  const h = Number(t.slice(0, 2));
  return `${((h + 11) % 12) + 1}:${t.slice(3, 5)} ${h < 12 ? "AM" : "PM"}`;
}

// Random "Are you there?" checks for a session: about one per 2 scheduled
// hours (1–4), at random minutes from now until the scheduled end.
export function planChecks(day: WfhDay | undefined, now: Date, workDate: string): Date[] {
  const minutes = scheduledMinutes(day);
  if (!minutes) return [];
  const count = Math.min(4, Math.max(1, Math.round(minutes / 120)));
  const end =
    day && "start" in day ? new Date(`${workDate}T${day.end}:00+08:00`).getTime() : now.getTime() + minutes * 60_000;
  const from = now.getTime() + 10 * 60_000;
  if (end - from < 15 * 60_000) return [];
  const out: Date[] = [];
  for (let i = 0; i < count; i++) {
    const a = from + ((end - from) * i) / count;
    const b = from + ((end - from) * (i + 1)) / count;
    out.push(new Date(a + Math.random() * (b - a)));
  }
  return out;
}

const mins = (a: string, b: string) => Math.max(0, (new Date(b).getTime() - new Date(a).getTime()) / 60_000);

// A day's totals for one employee.
export function summarize(sessions: WfhSession[], events: WfhEvent[], nowIso = new Date().toISOString()) {
  let worked = 0;
  for (const s of sessions) worked += mins(s.startedAt, s.endedAt ?? (s.lastSeenAt > nowIso ? nowIso : s.lastSeenAt));
  const sum = (k: WfhEventKind[]) => events.filter((e) => k.includes(e.kind)).reduce((t, e) => t + (e.endedAt ? mins(e.startedAt, e.endedAt) : 0), 0);
  const idle = sum(["idle", "locked"]);
  const offline = sum(["offline"]);
  return {
    firstIn: sessions.map((s) => s.startedAt).sort()[0] ?? null,
    lastOut: sessions.every((s) => s.endedAt) ? (sessions.map((s) => s.endedAt!).sort().pop() ?? null) : null,
    open: sessions.some((s) => !s.endedAt),
    worked,
    idle,
    offline,
    active: Math.max(0, worked - idle - offline),
    checksOk: events.filter((e) => e.kind === "check_ok").length,
    checksMissed: events.filter((e) => e.kind === "check_missed").length,
  };
}

export const hm = (m: number) => {
  const r = Math.round(m);
  return r >= 60 ? `${Math.floor(r / 60)}h ${String(r % 60).padStart(2, "0")}m` : `${r}m`;
};

// ---- Data -------------------------------------------------------------------------

type Row = Record<string, unknown>;
type Query = PromiseLike<{ data: unknown; error: { message: string } | null }> & {
  select: (c?: string) => Query;
  upsert: (v: Row) => Query;
  delete: () => Query;
  eq: (c: string, v: string) => Query;
  gte: (c: string, v: string) => Query;
  lte: (c: string, v: string) => Query;
  in: (c: string, v: string[]) => Query;
  order: (c: string, o?: { ascending: boolean }) => Query;
};
type Client = { from: (t: string) => Query; rpc: (fn: string, a?: Row) => PromiseLike<{ data: unknown; error: { message: string } | null }> };
const client = () => getSupabaseClient() as unknown as Client;

const SETUP = "Work from home isn't set up yet — ask HR to run the latest database update.";
const friendly = (msg: string) => (/wfh_/i.test(msg) && /exist|find|not found|schema cache/i.test(msg) ? SETUP : msg);

export async function fetchWfhSchedules(): Promise<WfhSchedule[]> {
  const { data, error } = await client().from("wfh_schedules").select("*");
  if (error) throw new Error(friendly(error.message));
  return (data as Row[]).map((r) => ({ employeeId: String(r.employee_id), days: (r.days as WfhSchedule["days"]) ?? {}, acknowledgedAt: (r.acknowledged_at as string | null) ?? null }));
}

export async function saveWfhSchedule(employeeId: string, days: WfhSchedule["days"]): Promise<void> {
  const { error } = await client().from("wfh_schedules").upsert({ employee_id: employeeId, days, updated_at: new Date().toISOString() });
  if (error) throw new Error(friendly(error.message));
}

export async function removeWfhSchedule(employeeId: string): Promise<void> {
  const { error } = await client().from("wfh_schedules").delete().eq("employee_id", employeeId);
  if (error) throw new Error(friendly(error.message));
}

export async function fetchWfhDay(from: string, to: string): Promise<{ sessions: WfhSession[]; events: WfhEvent[] }> {
  const { data, error } = await client().from("wfh_sessions").select("*").gte("work_date", from).lte("work_date", to).order("started_at");
  if (error) throw new Error(friendly(error.message));
  const sessions = (data as Row[]).map((r) => ({
    id: String(r.id),
    employeeId: String(r.employee_id),
    workDate: String(r.work_date),
    startedAt: String(r.started_at),
    lastSeenAt: String(r.last_seen_at),
    endedAt: (r.ended_at as string | null) ?? null,
    report: (r.report as string | null) ?? null,
  }));
  if (!sessions.length) return { sessions, events: [] };
  const ev = await client().from("wfh_events").select("*").in("session_id", sessions.map((s) => s.id)).order("started_at");
  if (ev.error) throw new Error(friendly(ev.error.message));
  const events = (ev.data as Row[]).map((r) => ({
    id: String(r.id),
    sessionId: String(r.session_id),
    employeeId: String(r.employee_id),
    kind: r.kind as WfhEventKind,
    startedAt: String(r.started_at),
    endedAt: (r.ended_at as string | null) ?? null,
    reason: (r.reason as string | null) ?? null,
  }));
  return { sessions, events };
}

async function call(fn: string, args: Row = {}): Promise<unknown> {
  const { data, error } = await client().rpc(fn, args);
  if (error) throw new Error(friendly(error.message));
  return data;
}

export const acknowledgeWfh = () => call("wfh_acknowledge").then(() => undefined);
export const startWfh = async () => String(await call("wfh_start"));
export const beatWfh = (session: string) => call("wfh_beat", { p_session: session }).then(() => undefined);
export const logWfh = (session: string, kind: "idle" | "locked" | "check_ok" | "check_missed", startedAt: Date) =>
  call("wfh_log", { p_session: session, p_kind: kind, p_started: startedAt.toISOString() }).then(() => undefined);
export const stopWfh = (session: string, report: string) => call("wfh_stop", { p_session: session, p_report: report }).then(() => undefined);
export const explainWfh = (event: string, reason: string) => call("wfh_explain", { p_event: event, p_reason: reason }).then(() => undefined);
