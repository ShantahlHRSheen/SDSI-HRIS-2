import { departmentAllocationsForEmployee } from "./helpers";
import { filterFacts, scaleFact, type AnalyticsFilters, type MonthlyEmployeeFact } from "./monthly-analytics";
import type { Department, Employee, EmployeeDepartmentAllocation, Position } from "./types";

// Payroll-report grouping into Business Units vs Shared Services.
//
// Departments carry their own division (MLM / Cosmetics / Darofy are
// Business Units; Operations, HR, Finance, Accounting are Shared Services).
// The Board ("BOD - Shared Services") is split by position: the Chairman
// and Presidents count as Business Units — spread equally across the
// business-unit departments so each one shows them when filtered — while
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
  for (const e of employees) {
    if (e.departmentId !== BOARD_DEPARTMENT_ID || !businessUnitBoardPositions.has(e.positionId)) continue;
    if (allocations.some((a) => a.employeeId === e.id)) continue; // an explicit split wins
    for (const d of businessUnits) extra.push({ employeeId: e.id, departmentId: d.id, percent: 100 / businessUnits.length });
  }
  return [...allocations, ...extra];
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
  if (!departmentId) return base;
  const byId = new Map(employees.map((e) => [e.id, e]));
  const out: MonthlyEmployeeFact[] = [];
  for (const f of base) {
    const emp = byId.get(f.employeeId);
    const share = emp ? departmentAllocationsForEmployee(emp, allocations).find((a) => a.departmentId === departmentId) : undefined;
    if (share) out.push(share.percent === 100 ? f : scaleFact(f, share.percent / 100));
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
