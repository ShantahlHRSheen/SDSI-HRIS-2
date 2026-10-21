import type { AttendanceCorrectionRequest, AttendancePeriodRecord, BiometricCarryOver, BiometricDetail, Employee, Holiday, LeaveRequest, PayrollPeriod } from "../types";
import { computeAttendance } from "./compute";

// Attendance worked out from a biometrics import, with the employee's
// approved attendance corrections applied: a correction's time in / out
// replaces that day's punches (time in = the morning punch, time out = the
// afternoon one; a correction giving only one of them keeps the other).
// Recomputing from the saved punches each time makes this safe to repeat,
// and a correction that's later withdrawn simply drops out.

export type AttendanceRow = Omit<AttendancePeriodRecord, "id" | "periodId" | "source" | "updatedBy" | "updatedAt">;

const hhmm = (t: string | null | undefined) => (t && /^\d{1,2}:\d{2}/.test(t) ? t.slice(0, 5).padStart(5, "0") : null);
const minutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

export function applyCorrections(detail: BiometricDetail, corrections: AttendanceCorrectionRequest[], period: { start: string; end: string }): { days: Map<string, string[]>; applied: string[] } {
  const days = new Map(Object.entries(detail.days).map(([d, t]) => [d, [...t]]));
  const midpoint = (minutes(detail.schedule.timeIn) + minutes(detail.schedule.timeOut)) / 2;
  const applied: string[] = [];
  for (const c of [...corrections].sort((a, b) => a.filedAt.localeCompare(b.filedAt))) {
    const d = c.date.slice(0, 10);
    if (c.status !== "approved" || d < period.start || d > period.end) continue;
    const tin = hhmm(c.requestedTimeIn);
    const tout = hhmm(c.requestedTimeOut);
    if (!tin && !tout) continue;
    const base = days.get(d) ?? [];
    const morning = base.filter((t) => minutes(t) < midpoint);
    const afternoon = base.filter((t) => minutes(t) >= midpoint);
    const next = [...(tin ? [tin] : morning), ...(tout ? [tout] : afternoon)].sort();
    days.set(d, next);
    applied.push(c.id);
  }
  return { days, applied };
}

// The previous cut-off's pending days, as this cut-off's file shows them:
// absences, lates and undertime there (and the pending time out's
// undertime). Days the file doesn't cover stay "unsettled" (still present).
export function settlePending(input: {
  employee: Employee;
  prior: NonNullable<BiometricDetail["prior"]>;
  corrections: AttendanceCorrectionRequest[];
  holidays: Holiday[];
  leaves: LeaveRequest[];
}): BiometricCarryOver {
  const { prior } = input;
  const covered = new Set(prior.covered);
  const wanted = [...prior.dates, ...(prior.timeOutDate ? [prior.timeOutDate] : [])];
  const settle = wanted.filter((d) => covered.has(d)).sort();
  const carry: BiometricCarryOver = { periodId: prior.periodId, absentDates: [], lateDayDetails: [], undertimeDayDetails: [], missingPunches: [], unsettled: wanted.filter((d) => !covered.has(d)) };
  if (!settle.length) return carry;
  const { days } = applyCorrections(
    { branchId: "", schedule: prior.schedule, exempt: false, days: prior.days, fileLastDate: null, lastDateInProgress: false },
    input.corrections.filter((c) => c.employeeId === input.employee.id),
    { start: prior.start, end: prior.end },
  );
  const c = computeAttendance({
    days,
    schedule: prior.schedule,
    periodStart: settle[0],
    periodEnd: settle[settle.length - 1],
    holidays: input.holidays,
    approvedLeaves: input.leaves.filter((l) => l.status === "approved" && l.employeeId === input.employee.id),
    dateHired: input.employee.dateHired,
  });
  const full = new Set(prior.dates.filter((d) => covered.has(d)));
  const outOnly = prior.timeOutDate && covered.has(prior.timeOutDate) ? prior.timeOutDate : null;
  carry.absentDates = c.absentDates.filter((d) => full.has(d));
  // The pending time-out day's late was counted already: only its undertime.
  carry.lateDayDetails = c.lateDayDetails.filter((x) => full.has(x.date));
  carry.undertimeDayDetails = c.undertimeDayDetails.filter((x) => full.has(x.date) || x.date === outOnly);
  carry.missingPunches = c.missingPunches.filter((m) => full.has(m.date) || (m.date === outOnly && m.missing === "out"));
  return carry;
}

const dayAfter = (iso: string) => new Date(Date.parse(`${iso}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);

// The previous cut-off (the one ending the day before this one starts).
export function previousPeriod(period: PayrollPeriod, periods: PayrollPeriod[]): PayrollPeriod | undefined {
  return periods.find((p) => dayAfter(p.end) === period.start);
}

// The detail with the previous cut-off's pending days attached (from this
// file's earlier days), once that cut-off is locked / closed. An open one is
// re-imported instead.
export function withPrior(detail: BiometricDetail, prevPeriod: PayrollPeriod | undefined, prevRecord: AttendancePeriodRecord | undefined): BiometricDetail {
  const pend = prevRecord?.biometricDetail?.pending;
  if (!prevPeriod || prevPeriod.status === "open" || !pend || detail.exempt || !detail.earlier) {
    const { prior: _prior, ...rest } = detail;
    void _prior;
    return rest;
  }
  const wanted = new Set([...pend.dates, ...(pend.timeOutDate ? [pend.timeOutDate] : [])]);
  if (!wanted.size) return detail;
  return {
    ...detail,
    prior: {
      periodId: prevPeriod.id,
      start: prevPeriod.start,
      end: prevPeriod.end,
      dates: pend.dates,
      timeOutDate: pend.timeOutDate,
      schedule: prevRecord!.biometricDetail!.schedule,
      days: Object.fromEntries(Object.entries(detail.earlier.days).filter(([d]) => wanted.has(d))),
      covered: detail.earlier.covered.filter((d) => wanted.has(d)),
    },
  };
}

export function biometricsAttendance(input: {
  employee: Employee;
  period: PayrollPeriod;
  detail: BiometricDetail;
  corrections: AttendanceCorrectionRequest[];
  holidays: Holiday[];
  leaves: LeaveRequest[];
  notes: string;
}): AttendanceRow {
  const { employee, period, detail } = input;
  const { days, applied } = applyCorrections(
    detail,
    input.corrections.filter((c) => c.employeeId === employee.id),
    period,
  );
  const c = computeAttendance({
    days,
    schedule: detail.schedule,
    periodStart: period.start,
    periodEnd: period.end,
    holidays: input.holidays,
    approvedLeaves: input.leaves.filter((l) => l.status === "approved" && l.employeeId === employee.id),
    dateHired: employee.dateHired,
    fileLastDate: detail.fileLastDate,
    lastDateInProgress: detail.lastDateInProgress,
    marks: detail.marks ? new Map(Object.entries(detail.marks)) : undefined,
  });
  // The previous cut-off's pending days, settled here: absences come off the
  // days worked, lates / undertime add to the minutes (fixed-rate: none).
  const carryOver = detail.prior ? settlePending({ employee, prior: detail.prior, corrections: input.corrections, holidays: input.holidays, leaves: input.leaves }) : undefined;
  const sum = (xs: { lateRawMinutes?: number; undertimeRawMinutes?: number }[]) => xs.reduce((t, x) => t + (x.lateRawMinutes ?? x.undertimeRawMinutes ?? 0), 0);
  const carryDays = carryOver?.absentDates.length ?? 0;
  const carryLate = carryOver ? sum(carryOver.lateDayDetails) : 0;
  const carryUnder = carryOver ? sum(carryOver.undertimeDayDetails) : 0;
  const pending = c.pendingDates.length || c.pendingTimeOut ? { dates: c.pendingDates, timeOutDate: c.pendingTimeOut } : undefined;
  return {
    employeeId: employee.id,
    daysWorked: detail.exempt ? 0 : Math.max(0, c.daysWorked - carryDays),
    holidayDays: c.holidayDays,
    slDays: c.slDays,
    vlDays: c.vlDays,
    lateMinutes: detail.exempt ? 0 : c.lateMinutes + carryLate,
    undertimeMinutes: detail.exempt ? 0 : c.undertimeMinutes + carryUnder,
    notes: input.notes,
    // The day-by-day record includes the settled days (with their own dates).
    lateInstances: c.lateInstances + (carryOver?.lateDayDetails.length ?? 0),
    lateDayDetails: [...(carryOver?.lateDayDetails ?? []), ...c.lateDayDetails],
    undertimeInstances: c.undertimeInstances + (carryOver?.undertimeDayDetails.length ?? 0),
    undertimeDayDetails: [...(carryOver?.undertimeDayDetails ?? []), ...c.undertimeDayDetails],
    halfDayInstances: c.halfDayInstances,
    halfDayDates: c.halfDayDates,
    absenceInstances: c.absenceInstances + carryDays,
    absentDates: [...(carryOver?.absentDates ?? []), ...c.absentDates],
    missingPunches: [...(carryOver?.missingPunches ?? []), ...c.missingPunches],
    biometricDetail: { ...detail, correctionIds: applied, pending, carryOver },
  };
}

// JSON with object keys sorted: the database (jsonb) doesn't keep key order.
function stable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
  if (v && typeof v === "object")
    return `{${Object.keys(v)
      .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`)
      .join(",")}}`;
  return JSON.stringify(v ?? null);
}

// True when the recomputed figures differ from what's saved.
export function attendanceChanged(saved: AttendancePeriodRecord, next: AttendanceRow): boolean {
  const pick = (r: Partial<AttendanceRow>) =>
    stable([r.daysWorked, r.holidayDays, r.slDays, r.vlDays, r.lateMinutes, r.undertimeMinutes, r.absentDates ?? [], r.missingPunches ?? [], r.lateDayDetails ?? [], r.undertimeDayDetails ?? [], r.biometricDetail?.correctionIds ?? [], r.biometricDetail?.carryOver ?? null]);
  return pick(saved) !== pick(next);
}
