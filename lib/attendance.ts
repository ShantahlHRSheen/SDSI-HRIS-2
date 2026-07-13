import type { DailyAttendanceRecord, Employee } from "./types";
import type { MonthlyEmployeeFact } from "./monthly-analytics";

// ---------------------------------------------------------------------------
// Derives a day-level Daily Time Record from the existing monthly attendance
// fact (see lib/monthly-analytics.ts) — there is no biometric/DTR backend in
// this demo, so the daily view is a deterministic expansion of the same
// present/late/absent/leave/OT totals already shown on the dashboards and
// reports, rather than a second, disconnected source of numbers.
// ---------------------------------------------------------------------------

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const SHIFT_START = "08:00";
const SHIFT_END = "17:00";

function hash(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function addMinutesToTime(hhmm: string, minutes: number): string {
  const [h, m] = hhmm.split(":").map(Number);
  const total = h * 60 + m + minutes;
  const hh = Math.floor(total / 60) % 24;
  const mm = total % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

export function workingDaysInMonth(monthKey: string): string[] {
  const [y, m] = monthKey.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const dates: string[] = [];
  for (let day = 1; day <= daysInMonth; day++) {
    const d = new Date(Date.UTC(y, m - 1, day));
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

export function buildDailyRecords(employee: Employee, fact: MonthlyEmployeeFact): DailyAttendanceRecord[] {
  const days = workingDaysInMonth(fact.monthKey);
  const n = days.length;
  const seed = `${employee.id}-${fact.monthKey}`;

  const absentCount = Math.min(fact.absentDays, n);
  const leaveCount = Math.min(fact.leaveDays, Math.max(n - absentCount, 0));
  const lateCount = Math.min(fact.lateDays, Math.max(n - absentCount - leaveCount, 0));

  const byShuffle = (salt: string, pool: number[]) =>
    [...pool].sort((a, b) => hash(`${seed}-${salt}-${a}`) - hash(`${seed}-${salt}-${b}`));

  const order = byShuffle("day", days.map((_, i) => i));
  const absentSet = new Set(order.slice(0, absentCount));
  const leaveSet = new Set(order.slice(absentCount, absentCount + leaveCount));
  const lateSet = new Set(order.slice(absentCount + leaveCount, absentCount + leaveCount + lateCount));

  const presentIndices = days.map((_, i) => i).filter((i) => !absentSet.has(i) && !leaveSet.has(i));
  const otDayCount = fact.otHours > 0 ? Math.min(Math.ceil(fact.otHours / 4), presentIndices.length) : 0;
  const otOrder = byShuffle("ot", presentIndices);
  const otDays = new Set(otOrder.slice(0, otDayCount));
  const otHoursPerDay = otDayCount > 0 ? Math.round((fact.otHours / otDayCount) * 10) / 10 : 0;

  return days.map((date, i) => {
    const dayLabel = DAY_NAMES[new Date(date + "T00:00:00Z").getUTCDay()];
    if (absentSet.has(i)) {
      return { date, dayLabel, status: "absent", timeIn: null, timeOut: null, lateMinutes: 0, otHours: 0 };
    }
    if (leaveSet.has(i)) {
      return { date, dayLabel, status: "leave", timeIn: null, timeOut: null, lateMinutes: 0, otHours: 0 };
    }
    const isLate = lateSet.has(i);
    const lateMinutes = isLate ? 5 + (hash(`${seed}-${i}-lm`) % 40) : 0;
    const dayOt = otDays.has(i) ? otHoursPerDay : 0;
    return {
      date,
      dayLabel,
      status: isLate ? "late" : "present",
      timeIn: addMinutesToTime(SHIFT_START, lateMinutes),
      timeOut: addMinutesToTime(SHIFT_END, Math.round(dayOt * 60)),
      lateMinutes,
      otHours: dayOt,
    };
  });
}
