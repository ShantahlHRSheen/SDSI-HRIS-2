import type { BiometricDayMark, Holiday, LateDayDetail, LeaveRequest, UndertimeDayDetail } from "../types";

// Attendance for one person and one payroll cut-off, worked out from their
// biometrics punches and their branch's schedule:
//   * work days are Monday–Saturday (Saturday is a full day), Sunday is rest;
//   * no grace period: late = minutes after the scheduled time in, undertime
//     = minutes before the scheduled time out;
//   * a day's first punch is the time in and its last punch the time out
//     (taps within 3 minutes count once);
//   * a day with a single punch is a "missing punch": counted as worked, and
//     flagged for HR and the employee (no late/undertime is guessed for the
//     side that's missing);
//   * a work day with no punch is an absence — unless it is a holiday, or the
//     employee has an approved leave that day;
//   * approved Vacation / Sick Leave (with pay) days fill in VL / SL days;
//   * regular holidays on work days count as holiday days (paid);
//   * days after the file's last date (the file was downloaded before the
//     cut-off ended) count as present, with no late / undertime — "pending":
//     the next cut-off's file settles them (see settlePending in
//     corrections.ts); on the day it was downloaded a time in without a time
//     out isn't a missing punch (still at work) and its time out is pending;
//   * a day marked instead of punched (HR's sheet): SL / VL fill in a leave
//     day, unpaid leave isn't an absence, a half day counts ½ day, and work
//     at another branch / outside counts as a day worked.

export interface BranchSchedule {
  timeIn: string; // "08:00"
  timeOut: string; // "17:00"
}

export interface MissingPunch {
  date: string;
  missing: "in" | "out";
  punch: string; // the one time recorded
}

export interface ComputedAttendance {
  daysWorked: number;
  holidayDays: number;
  slDays: number;
  vlDays: number;
  lateMinutes: number;
  undertimeMinutes: number;
  lateInstances: number;
  lateDayDetails: LateDayDetail[];
  undertimeInstances: number;
  undertimeDayDetails: UndertimeDayDetail[];
  absenceInstances: number;
  // Days in after mid-shift or out before it — a record only: those days
  // still count as worked, with the late / undertime minutes as usual.
  halfDayInstances: number;
  halfDayDates: string[];
  absentDates: string[];
  missingPunches: MissingPunch[];
  // Days with punches outside the cut-off are ignored; this counts days in it.
  daysWithPunches: number;
  // Days after the file's last date, counted as present until the next file
  // shows them; and the download day whose time out isn't in the file yet.
  pendingDates: string[];
  pendingTimeOut: string | null;
}

const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const weekday = (iso: string) => new Date(`${iso}T00:00:00Z`).getUTCDay(); // 0 = Sunday
const isWorkDay = (iso: string) => weekday(iso) !== 0;

function datesBetween(start: string, end: string): string[] {
  const out: string[] = [];
  for (let d = start; d <= end && out.length < 400; d = addDays(d, 1)) out.push(d);
  return out;
}

// Taps a few minutes apart (pressing twice) count as one punch.
function distinctPunches(times: string[]): string[] {
  const out: string[] = [];
  for (const t of [...times].sort()) if (!out.length || minutes(t) - minutes(out[out.length - 1]) > 3) out.push(t);
  return out;
}

// Paid VL/SL days of an approved leave, spread over its work days.
function leaveDayWeights(leave: LeaveRequest, holidays: Set<string>): Map<string, number> {
  const days = datesBetween(leave.startDate.slice(0, 10), leave.endDate.slice(0, 10)).filter((d) => isWorkDay(d) && !holidays.has(d));
  const per = days.length ? Math.min(1, leave.days / days.length) : 0;
  return new Map(days.map((d) => [d, per]));
}

// The file's last date with punches, and whether most people only have a
// time in that day (the file was downloaded mid-shift).
export function fileCoverage(people: { days: Map<string, string[]> }[], schedule: BranchSchedule): { lastDate: string | null; lastDateInProgress: boolean } {
  // The last day a fair share of people punched: a stray punch or two on a
  // later day (file downloaded that morning) doesn't stretch the file.
  const perDay = new Map<string, number>();
  for (const p of people) for (const [d, t] of p.days) if (t.length) perDay.set(d, (perDay.get(d) ?? 0) + 1);
  const busiest = Math.max(0, ...perDay.values());
  let lastDate: string | null = null;
  for (const [d, n] of perDay) if (n >= busiest * 0.25 && (!lastDate || d > lastDate)) lastDate = d;
  if (!lastDate) return { lastDate: null, lastDateInProgress: false };
  const midpoint = (minutes(schedule.timeIn) + minutes(schedule.timeOut)) / 2;
  const that = people.map((p) => distinctPunches(p.days.get(lastDate!) ?? [])).filter((t) => t.length);
  const onlyIn = that.filter((t) => t.length === 1 && minutes(t[0]) < midpoint).length;
  return { lastDate, lastDateInProgress: that.length > 0 && onlyIn / that.length >= 0.5 };
}

// The shift someone actually kept, from their days with both a time in and
// a time out: of the branch schedules, the one closest to their usual
// (median) time in and time out. Their own branch's schedule is kept unless
// another fits better by over an hour a day — so habitual lateness still
// counts. Null with fewer than 3 such days.
export function inferSchedule(days: Map<string, string[]>, candidates: BranchSchedule[], preferred?: BranchSchedule): BranchSchedule | null {
  const ins: number[] = [];
  const outs: number[] = [];
  for (const t of days.values()) {
    const p = distinctPunches(t);
    if (p.length < 2) continue;
    ins.push(minutes(p[0]));
    outs.push(minutes(p[p.length - 1]));
  }
  if (ins.length < 3) return null;
  const median = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
  const mi = median(ins);
  const mo = median(outs);
  const cost = (s: BranchSchedule) => Math.abs(mi - minutes(s.timeIn)) + Math.abs(mo - minutes(s.timeOut));
  const best = [...candidates].sort((a, b) => cost(a) - cost(b))[0];
  if (preferred && (!best || cost(preferred) - cost(best) <= 60)) return preferred;
  return best ?? null;
}

export function computeAttendance(input: {
  days: Map<string, string[]>;
  schedule: BranchSchedule;
  periodStart: string;
  periodEnd: string;
  holidays: Holiday[];
  approvedLeaves: LeaveRequest[];
  dateHired?: string | null;
  // Last date the file has punches for (anyone's), and whether that day was
  // still in progress when the file was downloaded.
  fileLastDate?: string | null;
  lastDateInProgress?: boolean;
  marks?: Map<string, BiometricDayMark>;
}): ComputedAttendance {
  const { schedule, periodStart, periodEnd } = input;
  const schedIn = minutes(schedule.timeIn);
  const schedOut = minutes(schedule.timeOut);
  const midpoint = (schedIn + schedOut) / 2;
  const holidayDates = new Set(input.holidays.map((h) => h.date.slice(0, 10)));
  const regularHolidays = new Set(input.holidays.filter((h) => h.type === "regular").map((h) => h.date.slice(0, 10)));

  const vl = new Map<string, number>();
  const sl = new Map<string, number>();
  const onLeave = new Set<string>();
  for (const l of input.approvedLeaves) {
    const weights = leaveDayWeights(l, holidayDates);
    for (const [d, w] of weights) {
      onLeave.add(d);
      if (l.leaveTypeId === "lt-vl") vl.set(d, (vl.get(d) ?? 0) + w);
      if (l.leaveTypeId === "lt-sl") sl.set(d, (sl.get(d) ?? 0) + w);
    }
  }

  const out: ComputedAttendance = {
    daysWorked: 0,
    holidayDays: 0,
    slDays: 0,
    vlDays: 0,
    lateMinutes: 0,
    undertimeMinutes: 0,
    lateInstances: 0,
    lateDayDetails: [],
    undertimeInstances: 0,
    undertimeDayDetails: [],
    absenceInstances: 0,
    halfDayInstances: 0,
    halfDayDates: [],
    absentDates: [],
    missingPunches: [],
    daysWithPunches: 0,
    pendingDates: [],
    pendingTimeOut: null,
  };
  const hired = input.dateHired?.slice(0, 10) ?? null;

  const end = input.fileLastDate && input.fileLastDate < periodEnd ? input.fileLastDate : periodEnd;
  for (const d of datesBetween(periodStart, end)) {
    const punches = distinctPunches(input.days.get(d) ?? []);
    if (isWorkDay(d) && regularHolidays.has(d)) out.holidayDays++;
    out.vlDays += vl.get(d) ?? 0;
    out.slDays += sl.get(d) ?? 0;

    const mark = input.marks?.get(d);
    if (punches.length === 0 && mark && isWorkDay(d)) {
      if (mark === "SL" && !onLeave.has(d)) out.slDays++;
      if (mark === "VL" && !onLeave.has(d)) out.vlDays++;
      if (mark === "half") {
        out.daysWorked += 0.5;
        out.halfDayInstances++;
        out.halfDayDates.push(d);
      }
      if (mark === "field") out.daysWorked++;
      continue; // "unpaid" / "holiday": not an absence

    }
    if (punches.length === 0) {
      // The download day, before this person's shift had started: pending too.
      if (input.lastDateInProgress && d === input.fileLastDate && isWorkDay(d) && !holidayDates.has(d) && !onLeave.has(d) && !(hired && d < hired)) {
        out.daysWorked++;
        out.pendingDates.push(d);
        continue;
      }
      if (isWorkDay(d) && !holidayDates.has(d) && !onLeave.has(d) && !(hired && d < hired)) {
        out.absenceInstances++;
        out.absentDates.push(d);
      }
      continue;
    }

    out.daysWorked++;
    out.daysWithPunches++;
    let timeIn: number | null = null;
    let timeOut: number | null = null;
    if (punches.length === 1) {
      const t = minutes(punches[0]);
      if (t < midpoint) timeIn = t;
      else timeOut = t;
      const stillAtWork = timeOut === null && input.lastDateInProgress && d === input.fileLastDate;
      if (stillAtWork) out.pendingTimeOut = d;
      if (!stillAtWork && mark !== "half") out.missingPunches.push({ date: d, missing: timeIn === null ? "in" : "out", punch: punches[0] });
    } else {
      timeIn = minutes(punches[0]);
      timeOut = minutes(punches[punches.length - 1]);
    }
    if (!isWorkDay(d)) continue; // Sunday work: counted as a day, no late/undertime.
    // A day the file marks as a half day is one, whatever its punches.
    if (mark === "half" || (timeIn !== null && timeOut !== null && (timeIn >= midpoint || timeOut <= midpoint))) {
      out.halfDayInstances++;
      out.halfDayDates.push(d);
    }
    if (timeIn !== null && timeIn > schedIn) {
      const late = timeIn - schedIn;
      out.lateMinutes += late;
      out.lateInstances++;
      out.lateDayDetails.push({ date: d, lateRawMinutes: late });
    }
    if (timeOut !== null && timeOut < schedOut) {
      const under = schedOut - timeOut;
      out.undertimeMinutes += under;
      out.undertimeInstances++;
      out.undertimeDayDetails.push({ date: d, undertimeRawMinutes: under });
    }
  }
  // Days the file doesn't reach yet: present (paid), settled next cut-off.
  if (end < periodEnd)
    for (const d of datesBetween(addDays(end, 1), periodEnd)) {
      if (isWorkDay(d) && regularHolidays.has(d)) out.holidayDays++;
      out.vlDays += vl.get(d) ?? 0;
      out.slDays += sl.get(d) ?? 0;
      if (!isWorkDay(d) || holidayDates.has(d) || onLeave.has(d) || (hired && d < hired)) continue;
      out.daysWorked++;
      out.pendingDates.push(d);
    }
  out.vlDays = Math.round(out.vlDays * 100) / 100;
  out.slDays = Math.round(out.slDays * 100) / 100;
  return out;
}

// Dates a file really covers: days a fair share of its people punched.
export function coveredDates(people: { days: Map<string, string[]> }[]): string[] {
  const perDay = new Map<string, number>();
  for (const p of people) for (const [d, t] of p.days) if (t.length) perDay.set(d, (perDay.get(d) ?? 0) + 1);
  const busiest = Math.max(0, ...perDay.values());
  return [...perDay].filter(([, n]) => n >= busiest * 0.25).map(([d]) => d).sort();
}
