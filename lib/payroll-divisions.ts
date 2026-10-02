import { departmentAllocationsForEmployee } from "./helpers";
import { filterFacts, filterValues, scaleFact, type AnalyticsFilters, type MonthlyEmployeeFact } from "./monthly-analytics";
import type { Department, Employee, EmployeeDepartmentAllocation, Position } from "./types";

// Payroll-report grouping into Business Units vs Shared Services.
//
// Departments carry their own division (MLM / Cosmetics / Darofy are
// Business Units; Operations, HR, Finance, Accounting are Shared Services).
// The Board ("BOD - Shared Services") is split by position: the Chairman
// and Presidents count as Business Units — a "President for <unit>" fully in
// that unit, the Chairman spread equally across the business-unit
// departments so each one shows them when filtered — while
// everyone else there (Vice Chairperson, Chemist, …) stays Shared Services.
//
// These report-only allocations don't touch employee_department_allocations,
// which also controls which dept heads can see an employee's record.

const BOARD_DEPARTMENT_ID = "dp-bod";
const UNASSIGNED_DEPARTMENT_ID = "dp-unassigned";

export type PayrollDivision = "business_units" | "shared_services" | "unassigned";

export const DIVISION_LABEL: Record<PayrollDivision, string> = {
  business_units: "Business Units",
  shared_services: "Shared Services",
  unassigned: "Unassigned",
};

export function reportAllocations(
  employees: Employee[],
  allocations: EmployeeDepartmentAllocation[],
  departments: Department[],
  positions: Position[],
): EmployeeDepartmentAllocation[] {
  const businessUnits = departments.filter((d) => d.division === "business_units");
  const businessUnitBoardPositions = new Set(
    positions.filter((p) => p.departmentId === BOARD_DEPARTMENT_ID && /^(chairman|president)\b/i.test(p.title)).map((p) => p.id),
  );
  const extra: EmployeeDepartmentAllocation[] = [];
  if (businessUnits.length === 0) return allocations;
  const titleOf = new Map(positions.map((p) => [p.id, p.title]));
  for (const e of employees) {
    if (e.departmentId !== BOARD_DEPARTMENT_ID || !businessUnitBoardPositions.has(e.positionId)) continue;
    if (allocations.some((a) => a.employeeId === e.id)) continue; // an explicit split wins
    const own = ownBusinessUnit(titleOf.get(e.positionId) ?? "", businessUnits);
    if (own) extra.push({ employeeId: e.id, departmentId: own.id, percent: 100 });
    else for (const d of businessUnits) extra.push({ employeeId: e.id, departmentId: d.id, percent: 100 / businessUnits.length });
  }
  return [...allocations, ...extra];
}

// "President for Darofy" → the Darofy Department. Null when the title names
// no single business unit (e.g. Chairman), who is then spread equally.
function ownBusinessUnit(title: string, businessUnits: Department[]): Department | null {
  const m = /\bfor\s+(.+)$/i.exec(title);
  if (!m) return null;
  const key = m[1].replace(/\s+department$/i, "").trim().toLowerCase();
  const matches = businessUnits.filter((d) => d.name.replace(/\s+department$/i, "").trim().toLowerCase() === key);
  return matches.length === 1 ? matches[0] : null;
}

export function divisionOf(departmentId: string, departments: Department[]): PayrollDivision {
  if (departmentId === UNASSIGNED_DEPARTMENT_ID) return "unassigned";
  return departments.find((d) => d.id === departmentId)?.division === "business_units" ? "business_units" : "shared_services";
}

// Like filterFacts, but the department filter includes everyone with a
// share in that department, scaled to their share — so totals under a
// department filter add up with the per-department table.
export function filterFactsWithShares(
  facts: MonthlyEmployeeFact[],
  employees: Employee[],
  filters: AnalyticsFilters,
  allocations: EmployeeDepartmentAllocation[],
): MonthlyEmployeeFact[] {
  const { departmentId, ...rest } = filters;
  const base = filterFacts(facts, employees, rest);
  const departmentIds = filterValues(departmentId);
  if (!departmentIds.length) return base;
  const byId = new Map(employees.map((e) => [e.id, e]));
  const out: MonthlyEmployeeFact[] = [];
  for (const f of base) {
    const emp = byId.get(f.employeeId);
    // Their combined share in the chosen departments (e.g. 50% MLM + 50%
    // Darofy with both chosen = all of them).
    const percent = emp
      ? departmentAllocationsForEmployee(emp, allocations)
          .filter((a) => departmentIds.includes(a.departmentId))
          .reduce((t, a) => t + a.percent, 0)
      : 0;
    if (percent > 0) out.push(percent >= 100 ? f : scaleFact(f, percent / 100));
  }
  return out;
}

// Sums per-department payroll rows into division totals.
export function groupByDivision<P extends { employeeCount: number }>(rows: { departmentId: string; payroll: P }[], departments: Department[]) {
  const totals = new Map<PayrollDivision, P>();
  for (const row of rows) {
    const division = divisionOf(row.departmentId, departments);
    const acc = totals.get(division);
    if (!acc) {
      totals.set(division, { ...row.payroll });
      continue;
    }
    const sum = acc as Record<string, number>;
    for (const [k, v] of Object.entries(row.payroll as Record<string, number>)) sum[k] = (sum[k] ?? 0) + v;
  }
  return (["business_units", "shared_services", "unassigned"] as PayrollDivision[])
    .filter((d) => totals.has(d))
    .map((division) => {
      const payroll = totals.get(division)!;
      return { division, label: DIVISION_LABEL[division], payroll: { ...payroll, employeeCount: Math.round(payroll.employeeCount * 100) / 100 } };
    });
}
