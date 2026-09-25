import type { LeaveRequest, LeaveType } from "./types";

// Leave credit rules:
// - Vacation and Sick Leave: the yearly credits are split in two halves —
//   half for January–June, half for July–December. Unused days don't carry
//   over to the next half.
// - Every other leave type: its yearly credits per calendar year.
// Approved and pending requests both count as used, so the same days can't
// be filed twice while waiting for approval.

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

// Weekdays of a request, split by credit period. A request's recorded
// `days` (e.g. 0.5 for a half day) is spread over its weekdays evenly.
function daysByPeriod(leaveTypeId: string, startDate: string, endDate: string, days: number): Map<string, { period: CreditPeriod; days: number }> {
  const weekdays: string[] = [];
  const cursor = new Date(startDate + "T00:00:00Z");
  const end = new Date(endDate + "T00:00:00Z");
  while (cursor <= end) {
    const dow = cursor.getUTCDay();
    if (dow !== 0 && dow !== 6) weekdays.push(cursor.toISOString().slice(0, 10));
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

export function balanceFor(requests: LeaveRequest[], employeeId: string, leaveType: LeaveType, onDate: string): PeriodBalance {
  const period = creditPeriodOf(leaveType.id, onDate);
  const credits = creditsPerPeriod(leaveType);
  const used = usedInPeriod(requests, employeeId, leaveType.id, period.key);
  return { period, credits, used, remaining: Math.max(credits - used, 0) };
}

// null when the request fits the employee's remaining credits, otherwise a
// message explaining the shortfall.
export function checkLeaveRequest(
  requests: LeaveRequest[],
  input: { employeeId: string; leaveType: LeaveType; startDate: string; endDate: string; days: number },
): string | null {
  const credits = creditsPerPeriod(input.leaveType);
  for (const { period, days } of daysByPeriod(input.leaveType.id, input.startDate, input.endDate, input.days).values()) {
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
