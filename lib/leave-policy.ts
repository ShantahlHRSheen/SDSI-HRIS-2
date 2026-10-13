import type { LeaveRequest, LeaveType } from "./types";
import { CALENDAR_DAY_LEAVE_TYPES } from "./helpers";

// Leave credit rules:
// - Vacation and Sick Leave: the yearly credits are split in two halves —
//   half for January–June, half for July–December. Unused days don't carry
//   over to the next half.
// - Every other leave type: its yearly credits per calendar year.
// Approved and pending requests both count as used, so the same days can't
// be filed twice while waiting for approval.
// - Vacation and Sick Leave with pay start after 1 year of service (from the
//   date hired); before that the credits are 0 — file without pay.
// - HR's leave credit adjustments (leave_credit_adjustments, e.g. balances
//   brought in from the leave balance sheet) add to or take from a period's
//   credits.

const SEMIANNUAL_TYPES = new Set(["lt-vl", "lt-sl"]);
const COUNTED_STATUSES = new Set(["approved", "pending"]);

export function isSemiannual(leaveTypeId: string): boolean {
  return SEMIANNUAL_TYPES.has(leaveTypeId);
}

// Today in the Philippines, as YYYY-MM-DD.
export function todayInManila(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export interface CreditPeriod {
  key: string; // "2026-H1", "2026-H2" or "2026"
  label: string; // "Jan–Jun 2026", "Jul–Dec 2026" or "2026"
}

export function creditPeriodOf(leaveTypeId: string, date: string): CreditPeriod {
  const year = date.slice(0, 4);
  if (!isSemiannual(leaveTypeId)) return { key: year, label: year };
  const firstHalf = Number(date.slice(5, 7)) <= 6;
  return firstHalf ? { key: `${year}-H1`, label: `Jan–Jun ${year}` } : { key: `${year}-H2`, label: `Jul–Dec ${year}` };
}

export function creditsPerPeriod(leaveType: LeaveType): number {
  return isSemiannual(leaveType.id) ? leaveType.defaultCredits / 2 : leaveType.defaultCredits;
}

// Weekdays of a request (every day for calendar-day leave such as
// maternity), split by credit period. A request's recorded `days` (e.g. 0.5
// for a half day) is spread over those days evenly.
function daysByPeriod(leaveTypeId: string, startDate: string, endDate: string, days: number): Map<string, { period: CreditPeriod; days: number }> {
  const weekdays: string[] = [];
  const calendarDays = CALENDAR_DAY_LEAVE_TYPES.has(leaveTypeId);
  const cursor = new Date(startDate + "T00:00:00Z");
  const end = new Date(endDate + "T00:00:00Z");
  while (cursor <= end) {
    const dow = cursor.getUTCDay();
    if (calendarDays || (dow !== 0 && dow !== 6)) weekdays.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  const out = new Map<string, { period: CreditPeriod; days: number }>();
  if (weekdays.length === 0) return out;
  const perDay = days / weekdays.length;
  for (const d of weekdays) {
    const period = creditPeriodOf(leaveTypeId, d);
    const cur = out.get(period.key);
    out.set(period.key, { period, days: (cur?.days ?? 0) + perDay });
  }
  return out;
}

export function usedInPeriod(requests: LeaveRequest[], employeeId: string, leaveTypeId: string, periodKey: string, excludeRequestId?: string): number {
  let used = 0;
  for (const r of requests) {
    if (r.employeeId !== employeeId || r.leaveTypeId !== leaveTypeId || !COUNTED_STATUSES.has(r.status) || r.id === excludeRequestId) continue;
    used += daysByPeriod(r.leaveTypeId, r.startDate, r.endDate, r.days).get(periodKey)?.days ?? 0;
  }
  return Math.round(used * 100) / 100;
}

export interface PeriodBalance {
  period: CreditPeriod;
  credits: number;
  used: number;
  remaining: number;
}

// ---- Per-employee context (set by the store, like the reference data) ---------

export interface LeaveCreditAdjustment {
  employeeId: string;
  leaveTypeId: string;
  periodKey: string;
  days: number;
  note: string;
}

let hireDates = new Map<string, string | null>();
let adjustments = new Map<string, number>();
const adjKey = (employeeId: string, leaveTypeId: string, periodKey: string) => `${employeeId}|${leaveTypeId}|${periodKey}`;

export function setLeaveCreditContext(data: { employees: { id: string; dateHired: string | null }[]; adjustments: LeaveCreditAdjustment[] }): void {
  hireDates = new Map(data.employees.map((e) => [e.id, e.dateHired]));
  adjustments = new Map(data.adjustments.map((a) => [adjKey(a.employeeId, a.leaveTypeId, a.periodKey), a.days]));
}

// The first day Vacation / Sick Leave with pay can be used (1 year after the
// date hired), or null when it doesn't apply (other leave types, or no date
// hired on file).
export function paidLeaveEligibleFrom(employeeId: string, leaveTypeId: string): string | null {
  const hired = hireDates.get(employeeId);
  if (!isSemiannual(leaveTypeId) || !hired) return null;
  const d = new Date(hired.slice(0, 10) + "T00:00:00Z");
  d.setUTCFullYear(d.getUTCFullYear() + 1);
  return d.toISOString().slice(0, 10);
}

// An employee's credits for the period `onDate` falls in.
export function creditsFor(employeeId: string, leaveType: LeaveType, onDate: string): number {
  const from = paidLeaveEligibleFrom(employeeId, leaveType.id);
  if (from && onDate < from) return 0;
  const period = creditPeriodOf(leaveType.id, onDate);
  return creditsPerPeriod(leaveType) + (adjustments.get(adjKey(employeeId, leaveType.id, period.key)) ?? 0);
}

export function balanceFor(requests: LeaveRequest[], employeeId: string, leaveType: LeaveType, onDate: string, excludeRequestId?: string): PeriodBalance {
  const period = creditPeriodOf(leaveType.id, onDate);
  const credits = creditsFor(employeeId, leaveType, onDate);
  const used = usedInPeriod(requests, employeeId, leaveType.id, period.key, excludeRequestId);
  return { period, credits, used, remaining: Math.max(credits - used, 0) };
}

// null when the request fits the employee's remaining credits, otherwise a
// message explaining the shortfall.
export function checkLeaveRequest(
  requests: LeaveRequest[],
  input: { employeeId: string; leaveType: LeaveType; startDate: string; endDate: string; days: number },
): string | null {
  const from = paidLeaveEligibleFrom(input.employeeId, input.leaveType.id);
  if (from && input.startDate < from) {
    const on = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", year: "numeric", month: "long", day: "numeric" }).format(new Date(from + "T00:00:00Z"));
    return `${input.leaveType.name} with pay starts after 1 year of service (on ${on}). File it as leave without pay.`;
  }
  for (const { period, days } of daysByPeriod(input.leaveType.id, input.startDate, input.endDate, input.days).values()) {
    // A date in the period on or after the start (credits differ only by period).
    const periodStart = period.key.length === 4 ? `${period.key}-01-01` : `${period.key.slice(0, 4)}-${period.key.endsWith("H1") ? "01" : "07"}-01`;
    const credits = creditsFor(input.employeeId, input.leaveType, input.startDate > periodStart ? input.startDate : periodStart);
    const remaining = Math.max(credits - usedInPeriod(requests, input.employeeId, input.leaveType.id, period.key), 0);
    if (days > remaining + 1e-9) {
      const fmt = (n: number) => String(Math.round(n * 100) / 100);
      const lwop = input.leaveType.id === "lt-lwop" ? "" : " File the extra days as Leave Without Pay.";
      return remaining > 0
        ? `You only have ${fmt(remaining)} day(s) of ${input.leaveType.name} left for ${period.label}, but this request uses ${fmt(days)}.${lwop}`
        : `You have no ${input.leaveType.name} left for ${period.label}.${lwop}`;
    }
  }
  return null;
}
