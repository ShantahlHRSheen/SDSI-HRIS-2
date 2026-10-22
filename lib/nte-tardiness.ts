import { TARDINESS_GRACE_MINUTES } from "./tardiness-absenteeism";
import type { AttendancePeriodRecord, DisciplinaryRecord, Employee, PayrollPeriod } from "./types";

// Notice To Explain for habitual tardiness, once a month's attendance is
// complete: everyone late (by the grace period or more) on 5 or more days of
// that month gets one, listing each day and its minutes (HR's NTE format).

export const NTE_TARDINESS_MIN_DAYS = 5;
export const NTE_TARDINESS_RE = "Notice To Explain - Habitual Tardiness";

export interface TardyDay {
  date: string;
  minutes: number;
}

export interface TardinessNteCandidate {
  employee: Employee;
  days: TardyDay[];
  // Tardiness NTEs issued to them before this month's (1 = first offense).
  offense: number;
  suggestedPenalty: string;
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// "2026-09" → "September 2026".
export function monthLabel(month: string): string {
  return `${MONTHS[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`;
}

function monthEnd(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

// A month's attendance is complete when every day of it is in a cut-off,
// each of those cut-offs has attendance and none is still open.
export function monthAttendanceComplete(month: string, periods: PayrollPeriod[], records: AttendancePeriodRecord[]): boolean {
  const first = `${month}-01`;
  const last = monthEnd(month);
  const inMonth = periods.filter((p) => p.end >= first && p.start <= last).sort((a, b) => a.start.localeCompare(b.start));
  if (!inMonth.length || inMonth[0].start > first || inMonth[inMonth.length - 1].end < last) return false;
  for (let i = 1; i < inMonth.length; i++) if (inMonth[i].start > addDay(inMonth[i - 1].end)) return false;
  return inMonth.every((p) => p.status !== "open" && records.some((r) => r.periodId === p.id));
}

const addDay = (iso: string) => new Date(Date.parse(`${iso}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);

// The months whose attendance is complete, latest first.
export function completeMonths(periods: PayrollPeriod[], records: AttendancePeriodRecord[]): string[] {
  const months = [...new Set(periods.map((p) => p.start.slice(0, 7)))].sort().reverse();
  return months.filter((m) => monthAttendanceComplete(m, periods, records));
}

// The month a tardiness NTE is for ("… (September 2026)…" → "2026-09").
export function nteMonth(description: string): string | null {
  if (!description.startsWith(NTE_TARDINESS_RE)) return null;
  const m = /\(([A-Za-z]+) (\d{4})\)/.exec(description);
  const i = m ? MONTHS.findIndex((x) => x.toLowerCase() === m[1].toLowerCase()) : -1;
  return m && i >= 0 ? `${m[2]}-${String(i + 1).padStart(2, "0")}` : null;
}

// The NTE for this employee and month, if one was issued already.
export function issuedTardinessNte(records: DisciplinaryRecord[], employeeId: string, month: string): DisciplinaryRecord | undefined {
  const tag = `(${monthLabel(month)})`;
  return records.find((r) => r.employeeId === employeeId && r.type === "nte" && r.description.startsWith(NTE_TARDINESS_RE) && r.description.includes(tag));
}

// Company policy: the penalty by days late in the month and offense number.
const PENALTIES: { label: string; min: number; steps: string[] }[] = [
  { label: "More than 20 days late in a month", min: 21, steps: ["30 days suspension", "Termination"] },
  { label: "More than 10 Days Late in a month", min: 11, steps: ["3 days suspension", "6 days suspension", "30 days suspension", "Termination"] },
  { label: "10  days late in a month", min: 10, steps: ["Stern warning", "3 days suspension", "6 days suspension", "30 days suspension"] },
  { label: "5 days late in a month", min: 5, steps: ["Verbal Warning", "Written Warning", "Stern Warning", "3 days suspension"] },
];
export const PENALTY_TABLE = [...PENALTIES].reverse();
// Every sanction in the policy, mildest first.
export const SANCTION_CHOICES = ["Verbal Warning", "Written Warning", "Stern Warning", "3 days suspension", "6 days suspension", "30 days suspension", "Termination"];

export function suggestedPenalty(daysLate: number, offense: number): string {
  const row = PENALTIES.find((r) => daysLate >= r.min);
  if (!row) return "";
  return row.steps[Math.min(offense, row.steps.length) - 1];
}

export function tardinessNteCandidates(input: {
  month: string;
  employees: Employee[];
  records: AttendancePeriodRecord[];
  discipline: DisciplinaryRecord[];
  // Offenses from tardiness NTEs given before the HRIS, by employee.
  prior?: Record<string, number>;
}): TardinessNteCandidate[] {
  const { month } = input;
  const byEmployee = new Map<string, Map<string, number>>();
  // Every cut-off's day-by-day record (a day settled in the next cut-off keeps its own date).
  for (const rec of input.records)
    for (const d of rec.lateDayDetails ?? []) {
      if (!d.date.startsWith(month) || d.lateRawMinutes < TARDINESS_GRACE_MINUTES) continue;
      const days = byEmployee.get(rec.employeeId) ?? new Map<string, number>();
      days.set(d.date, Math.max(days.get(d.date) ?? 0, d.lateRawMinutes));
      byEmployee.set(rec.employeeId, days);
    }
  const out: TardinessNteCandidate[] = [];
  for (const [employeeId, days] of byEmployee) {
    if (days.size < NTE_TARDINESS_MIN_DAYS) continue;
    const employee = input.employees.find((e) => e.id === employeeId);
    if (!employee) continue;
    // Offenses before: their tardiness NTEs for earlier months.
    const before =
      (input.prior?.[employeeId] ?? 0) + input.discipline.filter((r) => r.employeeId === employeeId && r.type === "nte" && (nteMonth(r.description) ?? "9999") < month).length;
    const list = [...days].map(([date, minutes]) => ({ date, minutes })).sort((a, b) => a.date.localeCompare(b.date));
    out.push({ employee, days: list, offense: before + 1, suggestedPenalty: suggestedPenalty(list.length, before + 1) });
  }
  return out.sort((a, b) => b.days.length - a.days.length);
}

const ONES = ["ZERO", "ONE", "TWO", "THREE", "FOUR", "FIVE", "SIX", "SEVEN", "EIGHT", "NINE", "TEN", "ELEVEN", "TWELVE", "THIRTEEN", "FOURTEEN", "FIFTEEN", "SIXTEEN", "SEVENTEEN", "EIGHTEEN", "NINETEEN"];
const TENS = ["", "", "TWENTY", "THIRTY", "FORTY", "FIFTY"];
// 12 → "TWELVE", 23 → "TWENTY-THREE".
export function numberWords(n: number): string {
  if (n < 20) return ONES[n];
  return `${TENS[Math.floor(n / 10)]}${n % 10 ? `-${ONES[n % 10]}` : ""}`;
}

// Late days HR accepted to excuse on this NTE, with their reasons.
export function excusedDays(r: DisciplinaryRecord): { date: string; reason: string }[] {
  return (r.excuseRequests ?? []).filter((x) => x.status === "accepted").flatMap((x) => x.items.map((i) => ({ date: i.date, reason: i.reason })));
}

// The record's description (shown in Discipline and My Notices).
export function tardinessNteDescription(month: string, days: TardyDay[]): string {
  return `${NTE_TARDINESS_RE} (${monthLabel(month)}): late ${days.length} days — ${days.map((d) => `${Number(d.date.slice(5, 7))}/${Number(d.date.slice(8, 10))} (${d.minutes}m)`).join(", ")}. Please submit a written explanation.`;
}
