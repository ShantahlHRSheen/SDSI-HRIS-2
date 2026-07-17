import type { AttendancePeriodRecord, Employee } from "./types";

// ---------------------------------------------------------------------------
// Aggregates the real, imported/entered AttendancePeriodRecord data (not the
// synthetic monthly-analytics fact table the Executive Dashboard's other
// widgets use) into per-employee instance counts across whichever periods
// the caller selects, for the Tardiness and Absenteeism reports.
// ---------------------------------------------------------------------------

export const TARDINESS_THRESHOLD = 5;
export const ABSENTEEISM_THRESHOLD = 5;

export interface TardinessDay {
  periodId: string;
  date: string;
  lateRawMinutes: number;
}

export interface TardinessRow {
  employee: Employee;
  lateInstances: number;
  lateDays: TardinessDay[];
}

export interface AbsenteeismDay {
  periodId: string;
  date: string;
}

export interface AbsenteeismRow {
  employee: Employee;
  absenceInstances: number;
  halfDayInstances: number;
  totalInstances: number;
  absentDays: AbsenteeismDay[];
  halfDays: AbsenteeismDay[];
}

export function buildTardinessRows(records: AttendancePeriodRecord[], employees: Employee[]): TardinessRow[] {
  const byEmployee = new Map<string, TardinessRow>();
  for (const rec of records) {
    if (!rec.lateInstances) continue;
    const employee = employees.find((e) => e.id === rec.employeeId);
    if (!employee) continue;
    const row = byEmployee.get(employee.id) ?? { employee, lateInstances: 0, lateDays: [] };
    row.lateInstances += rec.lateInstances;
    (rec.lateDayDetails ?? []).forEach((d) => row.lateDays.push({ periodId: rec.periodId, date: d.date, lateRawMinutes: d.lateRawMinutes }));
    byEmployee.set(employee.id, row);
  }
  return Array.from(byEmployee.values())
    .map((row) => ({ ...row, lateDays: row.lateDays.slice().sort((a, b) => (a.date < b.date ? -1 : 1)) }))
    .sort((a, b) => b.lateInstances - a.lateInstances);
}

export function buildAbsenteeismRows(records: AttendancePeriodRecord[], employees: Employee[]): AbsenteeismRow[] {
  const byEmployee = new Map<string, AbsenteeismRow>();
  for (const rec of records) {
    const absenceInstances = rec.absenceInstances ?? 0;
    const halfDayInstances = rec.halfDayInstances ?? 0;
    if (!absenceInstances && !halfDayInstances) continue;
    const employee = employees.find((e) => e.id === rec.employeeId);
    if (!employee) continue;
    const row = byEmployee.get(employee.id) ?? { employee, absenceInstances: 0, halfDayInstances: 0, totalInstances: 0, absentDays: [], halfDays: [] };
    row.absenceInstances += absenceInstances;
    row.halfDayInstances += halfDayInstances;
    row.totalInstances = row.absenceInstances + row.halfDayInstances;
    (rec.absentDates ?? []).forEach((date) => row.absentDays.push({ periodId: rec.periodId, date }));
    (rec.halfDayDates ?? []).forEach((date) => row.halfDays.push({ periodId: rec.periodId, date }));
    byEmployee.set(employee.id, row);
  }
  return Array.from(byEmployee.values())
    .map((row) => ({
      ...row,
      absentDays: row.absentDays.slice().sort((a, b) => (a.date < b.date ? -1 : 1)),
      halfDays: row.halfDays.slice().sort((a, b) => (a.date < b.date ? -1 : 1)),
    }))
    .sort((a, b) => b.totalInstances - a.totalInstances);
}

export function flaggedTardiness(rows: TardinessRow[]): TardinessRow[] {
  return rows.filter((r) => r.lateInstances >= TARDINESS_THRESHOLD);
}

export function flaggedAbsenteeism(rows: AbsenteeismRow[]): AbsenteeismRow[] {
  return rows.filter((r) => r.totalInstances >= ABSENTEEISM_THRESHOLD);
}
