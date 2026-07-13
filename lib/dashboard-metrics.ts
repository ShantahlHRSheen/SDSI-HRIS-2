import type { Employee, EmploymentStatus } from "./types";
import { TODAY, daysBetween } from "./mock-data";
import { branchName, fullName } from "./helpers";

export function activeEmployees(employees: Employee[]): Employee[] {
  return employees.filter((e) => e.status === "active" || e.status === "on_leave");
}

export function employmentStatusCounts(employees: Employee[]): Record<EmploymentStatus, number> {
  const base: Record<EmploymentStatus, number> = {
    regular: 0, probationary: 0, project_based: 0, freelance: 0, consultant: 0, intern: 0,
  };
  activeEmployees(employees).forEach((e) => {
    base[e.employmentStatus] += 1;
  });
  return base;
}

export function newHires(employees: Employee[], withinDays = 60) {
  return activeEmployees(employees)
    .filter((e) => daysBetween(e.dateHired, TODAY) <= withinDays && daysBetween(e.dateHired, TODAY) >= 0)
    .sort((a, b) => daysBetween(a.dateHired, TODAY) - daysBetween(b.dateHired, TODAY));
}

export function recentResignations(employees: Employee[], withinDays = 30) {
  return employees
    .filter((e) => (e.status === "resigned" || e.status === "terminated") && e.statusChangedAt && daysBetween(e.statusChangedAt, TODAY) <= withinDays)
    .sort((a, b) => daysBetween(a.statusChangedAt ?? TODAY, TODAY) - daysBetween(b.statusChangedAt ?? TODAY, TODAY));
}

export function dueForRegularization(employees: Employee[], withinDays = 45) {
  return activeEmployees(employees)
    .filter((e) => e.employmentStatus === "probationary" && e.probationEndsAt)
    .map((e) => ({ employee: e, daysUntil: daysBetween(TODAY, e.probationEndsAt as string) }))
    .filter((x) => x.daysUntil <= withinDays)
    .sort((a, b) => a.daysUntil - b.daysUntil);
}

export function expiringContracts(employees: Employee[], withinDays = 45) {
  return activeEmployees(employees)
    .filter((e) => (e.employmentStatus === "freelance" || e.employmentStatus === "project_based" || e.employmentStatus === "consultant") && e.contractEnd)
    .map((e) => ({ employee: e, daysUntil: daysBetween(TODAY, e.contractEnd as string) }))
    .filter((x) => x.daysUntil <= withinDays)
    .sort((a, b) => a.daysUntil - b.daysUntil);
}

function nextBirthdayDays(birthdate: string): number {
  const [, mm, dd] = birthdate.split("-").map(Number);
  const todayDate = new Date(TODAY + "T00:00:00Z");
  const year = todayDate.getUTCFullYear();
  let next = new Date(Date.UTC(year, mm - 1, dd));
  const todayMidnight = new Date(Date.UTC(todayDate.getUTCFullYear(), todayDate.getUTCMonth(), todayDate.getUTCDate()));
  if (next.getTime() < todayMidnight.getTime()) {
    next = new Date(Date.UTC(year + 1, mm - 1, dd));
  }
  return Math.round((next.getTime() - todayMidnight.getTime()) / 86400000);
}

export function upcomingBirthdays(employees: Employee[], withinDays = 30) {
  return activeEmployees(employees)
    .map((e) => ({ employee: e, daysUntil: nextBirthdayDays(e.birthdate) }))
    .filter((x) => x.daysUntil <= withinDays)
    .sort((a, b) => a.daysUntil - b.daysUntil);
}

export function monthlyCostEquivalent(e: Employee): number {
  if (e.monthlySalary) return e.monthlySalary;
  if (e.dailyRate) return e.dailyRate * 22;
  return 0;
}

export function payrollExpenseByBranch(employees: Employee[]) {
  const map = new Map<string, number>();
  activeEmployees(employees).forEach((e) => {
    map.set(e.branchId, (map.get(e.branchId) ?? 0) + monthlyCostEquivalent(e));
  });
  return Array.from(map.entries())
    .map(([branchId, value]) => ({ label: branchName(branchId), value: Math.round(value) }))
    .sort((a, b) => b.value - a.value);
}

export function headcountByDepartment(employees: Employee[]) {
  const map = new Map<string, number>();
  activeEmployees(employees).forEach((e) => {
    map.set(e.departmentId, (map.get(e.departmentId) ?? 0) + 1);
  });
  return map;
}

export function totalMonthlyPayrollExpense(employees: Employee[]): number {
  return activeEmployees(employees).reduce((sum, e) => sum + monthlyCostEquivalent(e), 0);
}

// Illustrative employer-mandated contribution estimate. Rates are PLACEHOLDERS —
// see the note surfaced in the UI: real SSS/PhilHealth/Pag-IBIG brackets must be
// configured (and periodically re-verified) in System Administration.
export function estimatedEmployerContributions(employees: Employee[]) {
  const base = totalMonthlyPayrollExpense(employees);
  return {
    sss: Math.round(base * 0.095),
    philhealth: Math.round(base * 0.025),
    pagibig: Math.round(base * 0.02),
  };
}

export function attendanceSnapshot(employees: Employee[]) {
  const total = activeEmployees(employees).length;
  const present = Math.round(total * 0.91);
  const late = Math.round(total * 0.05);
  const absent = Math.max(total - present - late, 0);
  const rate = total ? Math.round((present / total) * 1000) / 10 : 0;
  return { total, present, late, absent, rate, otHours: Math.round(total * 1.8) };
}

export function attendanceTrend() {
  const base = [0.93, 0.9, 0.94, 0.88, 0.91, 0.95, 0.89, 0.92];
  const labels = ["Jun 1", "Jun 8", "Jun 15", "Jun 22", "Jun 29", "Jul 6", "Jul 8", "Jul 13"];
  return base.map((r, i) => ({ label: labels[i], value: Math.round(r * 1000) / 10 }));
}

export function employeeDisplayName(e: Employee) {
  return fullName(e);
}
