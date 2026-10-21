import type { AttendanceCorrectionRequest, AttendancePeriodRecord, BiometricDetail, Employee, Holiday, LeaveRequest, PayrollPeriod } from "../types";
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
  return {
    employeeId: employee.id,
    daysWorked: detail.exempt ? 0 : c.daysWorked,
    holidayDays: c.holidayDays,
    slDays: c.slDays,
    vlDays: c.vlDays,
    lateMinutes: detail.exempt ? 0 : c.lateMinutes,
    undertimeMinutes: detail.exempt ? 0 : c.undertimeMinutes,
    notes: input.notes,
    lateInstances: c.lateInstances,
    lateDayDetails: c.lateDayDetails,
    undertimeInstances: c.undertimeInstances,
    undertimeDayDetails: c.undertimeDayDetails,
    halfDayInstances: c.halfDayInstances,
    halfDayDates: c.halfDayDates,
    absenceInstances: c.absenceInstances,
    absentDates: c.absentDates,
    missingPunches: c.missingPunches,
    biometricDetail: { ...detail, correctionIds: applied },
  };
}

// True when the recomputed figures differ from what's saved.
export function attendanceChanged(saved: AttendancePeriodRecord, next: AttendanceRow): boolean {
  const pick = (r: Partial<AttendanceRow>) =>
    JSON.stringify([r.daysWorked, r.holidayDays, r.slDays, r.vlDays, r.lateMinutes, r.undertimeMinutes, r.absentDates ?? [], r.missingPunches ?? [], r.lateDayDetails ?? [], r.undertimeDayDetails ?? [], r.biometricDetail?.correctionIds ?? []]);
  return pick(saved) !== pick(next);
}
