import type { Holiday, LateDayDetail, LeaveRequest, UndertimeDayDetail } from "../types";

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
//   * days after the file's last date aren't counted at all (the file was
//     downloaded before the cut-off ended), and on the day it was downloaded
//     a time in without a time out isn't a missing punch (still at work).

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
  absentDates: string[];
  missingPunches: MissingPunch[];
  // Days with punches outside the cut-off are ignored; this counts days in it.
  daysWithPunches: number;
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
  let lastDate: string | null = null;
  for (const p of people) for (const [d, t] of p.days) if (t.length && (!lastDate || d > lastDate)) lastDate = d;
  if (!lastDate) return { lastDate: null, lastDateInProgress: false };
  const midpoint = (minutes(schedule.timeIn) + minutes(schedule.timeOut)) / 2;
  const that = people.map((p) => distinctPunches(p.days.get(lastDate!) ?? [])).filter((t) => t.length);
  const onlyIn = that.filter((t) => t.length === 1 && minutes(t[0]) < midpoint).length;
  return { lastDate, lastDateInProgress: that.length > 0 && onlyIn / that.length >= 0.5 };
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
    absentDates: [],
    missingPunches: [],
    daysWithPunches: 0,
  };
  const hired = input.dateHired?.slice(0, 10) ?? null;

  const end = input.fileLastDate && input.fileLastDate < periodEnd ? input.fileLastDate : periodEnd;
  for (const d of datesBetween(periodStart, end)) {
    const punches = distinctPunches(input.days.get(d) ?? []);
    if (isWorkDay(d) && regularHolidays.has(d)) out.holidayDays++;
    out.vlDays += vl.get(d) ?? 0;
    out.slDays += sl.get(d) ?? 0;

    if (punches.length === 0) {
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
      if (!stillAtWork) out.missingPunches.push({ date: d, missing: timeIn === null ? "in" : "out", punch: punches[0] });
    } else {
      timeIn = minutes(punches[0]);
      timeOut = minutes(punches[punches.length - 1]);
    }
    if (!isWorkDay(d)) continue; // Sunday work: counted as a day, no late/undertime.
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
  out.vlDays = Math.round(out.vlDays * 100) / 100;
  out.slDays = Math.round(out.slDays * 100) / 100;
  return out;
}
