import {
  BRANCHES,
  DEPARTMENTS,
  POSITIONS,
  daysBetween,
  TODAY,
} from "./mock-data";
import type { Employee, EmployeeDepartmentAllocation, Role } from "./types";
import { ROLE_LABELS } from "./types";

// Standard HRIS display format: "Surname - Name - Middle Initial." — e.g.
// "Dela Cruz - Juan - A." A blank middle name simply omits that segment.
export function fullName(e: Employee): string {
  const mi = e.middleName?.trim();
  const middlePart = mi ? ` - ${mi.charAt(0).toUpperCase()}.` : "";
  return `${e.lastName} - ${e.firstName}${middlePart}`;
}

// Next free "EMP-####" number: one past the highest in use, so gaps and
// legacy SDSI-#### numbers never cause a collision.
export function nextEmployeeNumber(employees: Pick<Employee, "employeeNumber">[]): string {
  const max = employees.reduce((m, e) => {
    const match = /^EMP-(\d+)$/.exec(e.employeeNumber);
    return match ? Math.max(m, Number(match[1])) : m;
  }, 0);
  return `EMP-${String(max + 1).padStart(4, "0")}`;
}

// The branch / department / position lists the name helpers below read.
// They start as the demo lists and are replaced by whatever the app has
// loaded (the live database for real accounts) via setReferenceData, which
// the store calls on every render — so names added in System
// Administration (e.g. a new position) show up everywhere.
let refBranches: { id: string; name: string }[] = BRANCHES;
let refDepartments: { id: string; name: string }[] = DEPARTMENTS;
let refPositions: { id: string; title: string }[] = POSITIONS;

export function setReferenceData(data: {
  branches: { id: string; name: string }[];
  departments: { id: string; name: string }[];
  positions: { id: string; title: string }[];
}): void {
  refBranches = data.branches;
  refDepartments = data.departments;
  refPositions = data.positions;
}

export function branchName(branchId: string): string {
  return refBranches.find((b) => b.id === branchId)?.name ?? "—";
}

export function departmentName(departmentId: string): string {
  return refDepartments.find((d) => d.id === departmentId)?.name ?? "—";
}

export function positionTitle(positionId: string): string {
  return refPositions.find((p) => p.id === positionId)?.title ?? "—";
}

export function hasAnyRole(userRoles: Role[], allowed: Role[]): boolean {
  return userRoles.some((r) => allowed.includes(r));
}

// Roles that see company-wide employee data regardless of department —
// every other role that reaches these pages (dept_head being the one that
// doesn't) sees everything, same as before this scoping existed.
const COMPANY_WIDE_ROLES: Role[] = [
  "hr_admin", "upper_management", "sys_admin", "payroll_officer",
  "sr_accounting_assistant", "treasurer", "cfo",
];

// The single place that reconciles an employee's plain departmentId with any
// explicit split rows in employee_department_allocations. Most employees
// have no allocation rows at all — they're fully (100%) attributed to their
// departmentId, unchanged from before this concept existed. An employee who
// does have rows (e.g. a role genuinely shared between two departments) is
// represented by those rows instead, which should sum to 100%.
export function departmentAllocationsForEmployee(
  employee: Employee,
  allocations: EmployeeDepartmentAllocation[],
): { departmentId: string; percent: number }[] {
  const rows = allocations.filter((a) => a.employeeId === employee.id);
  if (rows.length > 0) return rows.map((a) => ({ departmentId: a.departmentId, percent: a.percent }));
  return [{ departmentId: employee.departmentId, percent: 100 }];
}

// Department Heads only see their own department's employees and records —
// used by the Employee Directory, Performance Evaluations, Discipline, and
// the Attendance/Overtime/Tardiness/Absenteeism reports so a dept_head can't
// browse another department's people or data. Any other role that can reach
// these pages sees company-wide data, unchanged. An employee split across
// departments (see departmentAllocationsForEmployee) is visible to every
// dept_head they're allocated to, not just one.
export function scopeEmployeesForViewer(
  employees: Employee[],
  viewerRoles: Role[],
  viewerEmployee: Employee | null,
  allocations: EmployeeDepartmentAllocation[] = [],
): Employee[] {
  if (hasAnyRole(viewerRoles, COMPANY_WIDE_ROLES)) return employees;
  if (viewerRoles.includes("dept_head") && viewerEmployee) {
    return employees.filter((e) =>
      departmentAllocationsForEmployee(e, allocations).some((a) => a.departmentId === viewerEmployee.departmentId),
    );
  }
  return employees;
}

export function roleBadgeLabel(role: Role): string {
  return ROLE_LABELS[role];
}

export function formatCurrency(n: number | null): string {
  if (n === null) return "—";
  return `₱${n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Whole-peso formatting for aggregate figures (stat tiles, chart labels) where
// centavo precision only adds width without adding information.
export function formatCurrencyCompact(n: number | null): string {
  if (n === null) return "—";
  return `₱${Math.round(n).toLocaleString("en-PH")}`;
}

export function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  // Bare "YYYY-MM-DD" dates need a time appended to parse as UTC midnight;
  // full ISO timestamps (e.g. Supabase timestamptz columns) already have one.
  const iso = dateStr.includes("T") ? dateStr : `${dateStr}T00:00:00Z`;
  const d = new Date(iso);
  return d.toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}

export function relativeDays(dateStr: string): number {
  return daysBetween(TODAY, dateStr);
}

export function dueSoonLabel(days: number): { label: string; tone: "critical" | "warning" | "good" | "muted" } {
  if (days < 0) return { label: `Overdue by ${Math.abs(days)}d`, tone: "critical" };
  if (days <= 15) return { label: `Due in ${days}d`, tone: "warning" };
  if (days <= 45) return { label: `Due in ${days}d`, tone: "good" };
  return { label: `Due in ${days}d`, tone: "muted" };
}

// Deterministic masked-format government ID for demo purposes only (SSS,
// PhilHealth, Pag-IBIG/HDMF, TIN). Shared by the 201 file profile page and
// the BIR forms so the same employee always shows the same value everywhere.
export function maskedGovId(seed: string, groups: number[]): string {
  const digits = seed.replace(/\D/g, "").padEnd(10, "0");
  let i = 0;
  return groups.map((g) => digits.slice(i, (i += g))).join("-");
}

export function employeeTIN(employeeNumber: string): string {
  return maskedGovId(employeeNumber + "4", [3, 3, 3]);
}

export function employeeSssNumber(employeeNumber: string): string {
  return maskedGovId(employeeNumber + "1", [2, 7, 1]);
}

export function employeePhilHealthNumber(employeeNumber: string): string {
  return maskedGovId(employeeNumber + "2", [2, 9, 1]);
}

export function employeeHdmfNumber(employeeNumber: string): string {
  return maskedGovId(employeeNumber + "3", [4, 4, 4]);
}

// Inclusive count of Mon–Fri days between two dates, used to compute leave
// duration from a filed start/end date range.
export function businessDaysBetween(start: string, end: string): number {
  const startDate = new Date(start + "T00:00:00Z");
  const endDate = new Date(end + "T00:00:00Z");
  if (endDate < startDate) return 0;
  let count = 0;
  const cursor = new Date(startDate);
  while (cursor <= endDate) {
    const dow = cursor.getUTCDay();
    if (dow !== 0 && dow !== 6) count += 1;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return count;
}

export function initialsOf(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}
