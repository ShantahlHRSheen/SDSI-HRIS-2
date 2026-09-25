import type { AttendancePeriodRecord, Employee, EmployeeDepartmentAllocation, OvertimeRequest, PayrollLineOverride, PayrollPeriod } from "./types";
import { TODAY } from "./mock-data";
import { branchName, departmentAllocationsForEmployee, departmentName, fullName } from "./helpers";
import { computePayrollForPeriod, type PayrollLine } from "./payroll";

// ---------------------------------------------------------------------------
// Monthly attendance / overtime / payroll-expense analytics.
//
// This module aggregates the real, per-payroll-period figures produced by
// lib/payroll.ts's computePayrollForPeriod — the same engine behind Payroll
// Processing, Payslips, and Vouchers — into a per-employee, per-calendar-month
// "fact table" (same idea as a data-warehouse fact table), so every
// report/chart/BIR form built on top of it is a pure aggregation over that
// table. Payroll periods are semi-monthly (1st-15th, 16th-end); a calendar
// month's fact for an employee is the sum of whichever of its (up to two)
// periods actually have an attendance record on file for them — so someone
// only has a fact for the months they were actually employed, with no
// separate status/hire-date/resignation-date filtering needed.
// ---------------------------------------------------------------------------

const MONTHS_BACK = 12;

export interface MonthMeta {
  key: string; // "2026-02"
  label: string; // "Feb 2026"
  monthIndex: number; // 1-12
  year: number;
}

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function getMonthsList(): MonthMeta[] {
  const [y, m] = TODAY.split("-").map(Number);
  const months: MonthMeta[] = [];
  for (let i = MONTHS_BACK - 1; i >= 0; i--) {
    let monthIndex = m - i;
    let year = y;
    while (monthIndex <= 0) {
      monthIndex += 12;
      year -= 1;
    }
    months.push({ key: `${year}-${String(monthIndex).padStart(2, "0")}`, label: `${MONTH_NAMES[monthIndex - 1]} ${year}`, monthIndex, year });
  }
  return months;
}

export const CURRENT_MONTH_KEY = getMonthsList()[MONTHS_BACK - 1].key;

export interface MonthlyEmployeeFact {
  employeeId: string;
  monthKey: string;
  workingDays: number;
  presentDays: number;
  lateDays: number;
  absentDays: number;
  leaveDays: number;
  otHours: number;
  basicSalary: number;
  allowances: number;
  overtimePay: number;
  holidayPay: number;
  leavePay: number;
  employerSSS: number;
  employerHDMF: number;
  employerPhilHealth: number;
  totalEmployerExpense: number;

  // --- Employee-side tax & mandatory deductions (for BIR forms / tax ledger) ---
  employeeSSS: number;
  employeeHDMF: number;
  employeePhilHealth: number;
  thirteenthMonthAccrual: number;
  deMinimisBenefits: number;
  otherBenefits: number;
  grossCompensation: number;
  nonTaxableCompensation: number;
  taxableCompensation: number;
  withholdingTax: number;
  netPay: number;
}

// Standard working days in a payroll period: every calendar day except
// Sunday, matching the 6-day-work-week convention already used for
// daily-rate employees' "Basis of Mandatories" (lib/payroll.ts's 313
// days/year figure).
function workingDaysInPeriod(period: PayrollPeriod): number {
  let count = 0;
  const end = new Date(period.end + "T00:00:00");
  for (const d = new Date(period.start + "T00:00:00"); d <= end; d.setDate(d.getDate() + 1)) {
    if (d.getDay() !== 0) count++;
  }
  return count;
}

const round = (n: number) => Math.round(n * 100) / 100;

function buildFact(
  employee: Employee,
  month: MonthMeta,
  lines: PayrollLine[],
  records: AttendancePeriodRecord[],
  periods: PayrollPeriod[],
): MonthlyEmployeeFact {
  const sumLines = (f: (l: PayrollLine) => number) => round(lines.reduce((s, l) => s + f(l), 0));

  const workingDays = periods.reduce((s, p) => s + workingDaysInPeriod(p), 0);
  const presentDays = records.reduce((s, r) => s + r.daysWorked, 0);
  const lateDays = records.reduce((s, r) => s + (r.lateInstances ?? 0), 0);
  const absentDays = records.reduce((s, r) => s + (r.absenceInstances ?? 0), 0);
  const leaveDays = records.reduce((s, r) => s + r.vlDays + r.slDays, 0);
  const otHours = sumLines((l) => l.otHours);

  const basicSalary = Math.round(sumLines((l) => l.basicSalaryLessLate));
  const allowances = sumLines((l) => l.netAllowances);
  const overtimePay = sumLines((l) => l.otPay);
  const holidayPay = sumLines((l) => l.holidayPay);
  const leavePay = sumLines((l) => l.vlPay + l.slPay);

  const employerSSS = sumLines((l) => l.employerSSS + l.employerSSSWisp);
  const employerHDMF = sumLines((l) => l.employerHDMF);
  const employerPhilHealth = sumLines((l) => l.employerPhilHealth);
  const totalEmployerExpense = sumLines((l) => l.employerExpense);

  const employeeSSS = sumLines((l) => l.sssContribution + l.sssWisp);
  const employeeHDMF = sumLines((l) => l.hdmfContribution);
  const employeePhilHealth = sumLines((l) => l.philHealthContribution);
  // Summed from the real per-period semi-monthly withholding tax — the same
  // number actually withheld in Payroll Processing — rather than recomputed
  // from a separate monthly bracket table.
  const withholdingTax = sumLines((l) => l.withholdingTax);
  const netPay = sumLines((l) => l.netPay);

  // 13th-month accrual off the employee's real standing monthly compensation
  // ("Basis of Mandatories" — the same figure computePayrollForPeriod uses
  // for statutory contributions), only for months they actually have a
  // payroll line. De minimis / other benefits have no dedicated field
  // anywhere in this system yet — de minimis uses the common statutory
  // ceiling as a default, other benefits stays 0 rather than invent a figure.
  const basis = lines[0]?.basisOfMandatories ?? 0;
  const thirteenthMonthAccrual = lines.length ? Math.round(basis / 12) : 0;
  const deMinimisBenefits = lines.length ? 1500 : 0;
  const otherBenefits = 0;

  const grossCompensation = Math.round(
    basicSalary + allowances + overtimePay + holidayPay + leavePay + thirteenthMonthAccrual + otherBenefits + deMinimisBenefits,
  );
  // Non-taxable: mandatory employee contributions, de minimis (within
  // statutory ceilings), and 13th-month/other-benefits accrual (exempt up to
  // the ₱90,000 annual cap — simplified here, as elsewhere in this build).
  const nonTaxableCompensation = round(employeeSSS + employeeHDMF + employeePhilHealth + deMinimisBenefits + thirteenthMonthAccrual);
  const taxableCompensation = Math.max(round(grossCompensation - nonTaxableCompensation), 0);

  return {
    employeeId: employee.id,
    monthKey: month.key,
    workingDays,
    presentDays,
    lateDays,
    absentDays,
    leaveDays,
    otHours,
    basicSalary,
    allowances,
    overtimePay,
    holidayPay,
    leavePay,
    employerSSS,
    employerHDMF,
    employerPhilHealth,
    totalEmployerExpense,
    employeeSSS,
    employeeHDMF,
    employeePhilHealth,
    thirteenthMonthAccrual,
    deMinimisBenefits,
    otherBenefits,
    grossCompensation,
    nonTaxableCompensation,
    taxableCompensation,
    withholdingTax,
    netPay,
  };
}

let cachedFacts: MonthlyEmployeeFact[] | null = null;
let cachedInputs: unknown[] | null = null;

function sameInputs(a: unknown[], b: unknown[]) {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

export function getMonthlyFacts(
  employees: Employee[],
  attendanceRecords: AttendancePeriodRecord[],
  overtimeRequests: OvertimeRequest[],
  overrides: PayrollLineOverride[],
  payrollPeriods: PayrollPeriod[],
): MonthlyEmployeeFact[] {
  const inputs = [employees, attendanceRecords, overtimeRequests, overrides, payrollPeriods];
  if (cachedFacts && cachedInputs && sameInputs(cachedInputs, inputs)) return cachedFacts;

  const months = getMonthsList();
  const facts: MonthlyEmployeeFact[] = [];

  for (const month of months) {
    const periodsInMonth = payrollPeriods.filter((p) => p.start.slice(0, 7) === month.key);
    if (periodsInMonth.length === 0) continue;

    const linesByEmployee = new Map<string, PayrollLine[]>();
    const recordsByEmployee = new Map<string, AttendancePeriodRecord[]>();
    const periodsByEmployee = new Map<string, PayrollPeriod[]>();

    for (const period of periodsInMonth) {
      const lines = computePayrollForPeriod(period, employees, attendanceRecords, overtimeRequests, overrides);
      for (const line of lines) {
        const arr = linesByEmployee.get(line.employeeId) ?? [];
        arr.push(line);
        linesByEmployee.set(line.employeeId, arr);
      }
      for (const rec of attendanceRecords.filter((r) => r.periodId === period.id)) {
        const recArr = recordsByEmployee.get(rec.employeeId) ?? [];
        recArr.push(rec);
        recordsByEmployee.set(rec.employeeId, recArr);
        const perArr = periodsByEmployee.get(rec.employeeId) ?? [];
        perArr.push(period);
        periodsByEmployee.set(rec.employeeId, perArr);
      }
    }

    for (const [employeeId, lines] of linesByEmployee) {
      const employee = employees.find((e) => e.id === employeeId);
      if (!employee) continue;
      facts.push(buildFact(employee, month, lines, recordsByEmployee.get(employeeId) ?? [], periodsByEmployee.get(employeeId) ?? []));
    }
  }

  cachedFacts = facts;
  cachedInputs = inputs;
  return facts;
}

export interface AnalyticsFilters {
  monthKey?: string;
  year?: number;
  branchId?: string;
  departmentId?: string;
  employeeId?: string;
}

export function filterFacts(facts: MonthlyEmployeeFact[], employees: Employee[], filters: AnalyticsFilters) {
  const byId = new Map(employees.map((e) => [e.id, e]));
  return facts.filter((f) => {
    const emp = byId.get(f.employeeId);
    if (!emp) return false;
    if (filters.monthKey && f.monthKey !== filters.monthKey) return false;
    if (filters.year && Number(f.monthKey.split("-")[0]) !== filters.year) return false;
    if (filters.branchId && emp.branchId !== filters.branchId) return false;
    if (filters.departmentId && emp.departmentId !== filters.departmentId) return false;
    if (filters.employeeId && emp.id !== filters.employeeId) return false;
    return true;
  });
}

export function summarizeAttendance(facts: MonthlyEmployeeFact[]) {
  const totalPresent = facts.reduce((s, f) => s + f.presentDays, 0);
  const totalLate = facts.reduce((s, f) => s + f.lateDays, 0);
  const totalAbsent = facts.reduce((s, f) => s + f.absentDays, 0);
  const totalLeave = facts.reduce((s, f) => s + f.leaveDays, 0);
  const totalWorkingDays = facts.reduce((s, f) => s + f.workingDays, 0);
  const attendanceRate = totalWorkingDays ? Math.round((totalPresent / totalWorkingDays) * 1000) / 10 : 0;
  return { totalPresent, totalLate, totalAbsent, totalLeave, attendanceRate };
}

export function summarizeOvertime(facts: MonthlyEmployeeFact[]) {
  const totalOtHours = facts.reduce((s, f) => s + f.otHours, 0);
  const totalOtPay = facts.reduce((s, f) => s + f.overtimePay, 0);
  return { totalOtHours, totalOtPay };
}

export function summarizePayroll(facts: MonthlyEmployeeFact[]) {
  return {
    employeeCount: new Set(facts.map((f) => f.employeeId)).size,
    basicSalary: facts.reduce((s, f) => s + f.basicSalary, 0),
    allowances: facts.reduce((s, f) => s + f.allowances, 0),
    overtimePay: facts.reduce((s, f) => s + f.overtimePay, 0),
    holidayPay: facts.reduce((s, f) => s + f.holidayPay, 0),
    leavePay: facts.reduce((s, f) => s + f.leavePay, 0),
    employerSSS: facts.reduce((s, f) => s + f.employerSSS, 0),
    employerHDMF: facts.reduce((s, f) => s + f.employerHDMF, 0),
    employerPhilHealth: facts.reduce((s, f) => s + f.employerPhilHealth, 0),
    totalEmployerExpense: facts.reduce((s, f) => s + f.totalEmployerExpense, 0),
  };
}

export function summarizeTax(facts: MonthlyEmployeeFact[]) {
  return {
    employeeCount: new Set(facts.map((f) => f.employeeId)).size,
    grossCompensation: facts.reduce((s, f) => s + f.grossCompensation, 0),
    nonTaxableCompensation: facts.reduce((s, f) => s + f.nonTaxableCompensation, 0),
    taxableCompensation: facts.reduce((s, f) => s + f.taxableCompensation, 0),
    employeeSSS: facts.reduce((s, f) => s + f.employeeSSS, 0),
    employeeHDMF: facts.reduce((s, f) => s + f.employeeHDMF, 0),
    employeePhilHealth: facts.reduce((s, f) => s + f.employeePhilHealth, 0),
    thirteenthMonthAccrual: facts.reduce((s, f) => s + f.thirteenthMonthAccrual, 0),
    deMinimisBenefits: facts.reduce((s, f) => s + f.deMinimisBenefits, 0),
    otherBenefits: facts.reduce((s, f) => s + f.otherBenefits, 0),
    withholdingTax: facts.reduce((s, f) => s + f.withholdingTax, 0),
    netPay: facts.reduce((s, f) => s + f.netPay, 0),
  };
}

export function attendanceTrendByMonth(facts: MonthlyEmployeeFact[], employees: Employee[], filters: AnalyticsFilters = {}) {
  return getMonthsList().map((m) => {
    const monthFacts = filterFacts(facts, employees, { ...filters, monthKey: m.key });
    const s = summarizeAttendance(monthFacts);
    return { label: m.label, monthKey: m.key, value: s.attendanceRate, ...s };
  });
}

export function overtimeTrendByMonth(facts: MonthlyEmployeeFact[], employees: Employee[], filters: AnalyticsFilters = {}) {
  return getMonthsList().map((m) => {
    const monthFacts = filterFacts(facts, employees, { ...filters, monthKey: m.key });
    const s = summarizeOvertime(monthFacts);
    return { label: m.label, monthKey: m.key, value: s.totalOtHours, ...s };
  });
}

export function payrollExpenseTrendByMonth(facts: MonthlyEmployeeFact[], employees: Employee[], filters: AnalyticsFilters = {}) {
  return getMonthsList().map((m) => {
    const monthFacts = filterFacts(facts, employees, { ...filters, monthKey: m.key });
    const s = summarizePayroll(monthFacts);
    return { label: m.label, monthKey: m.key, value: s.totalEmployerExpense, ...s };
  });
}

export function groupByBranch(facts: MonthlyEmployeeFact[], employees: Employee[], branches: { id: string }[]) {
  const byId = new Map(employees.map((e) => [e.id, e]));
  return branches
    .map((b) => {
      const branchFacts = facts.filter((f) => byId.get(f.employeeId)?.branchId === b.id);
      const payroll = summarizePayroll(branchFacts);
      const attendance = summarizeAttendance(branchFacts);
      const overtime = summarizeOvertime(branchFacts);
      return { branchId: b.id, label: branchName(b.id), payroll, attendance, overtime };
    })
    .filter((row) => row.payroll.employeeCount > 0);
}

// Multiplies every numeric field of a fact by `weight` — used to attribute
// a split employee's figures proportionally to each department they're
// allocated to (a full-time-equivalent-style convention: all of their
// numbers count fractionally toward each department, not just pay).
export function scaleFact(f: MonthlyEmployeeFact, weight: number): MonthlyEmployeeFact {
  const scaled = { ...f };
  for (const key of Object.keys(scaled) as (keyof MonthlyEmployeeFact)[]) {
    const value = scaled[key];
    if (typeof value === "number") (scaled[key] as number) = value * weight;
  }
  return scaled;
}

export function groupByDepartment(
  facts: MonthlyEmployeeFact[],
  employees: Employee[],
  departments: { id: string }[],
  allocations: EmployeeDepartmentAllocation[] = [],
) {
  const byId = new Map(employees.map((e) => [e.id, e]));
  return departments
    .map((d) => {
      const scaledFacts: MonthlyEmployeeFact[] = [];
      const seenEmployeeIds = new Set<string>();
      let headcountWeight = 0;
      for (const f of facts) {
        const emp = byId.get(f.employeeId);
        if (!emp) continue;
        const alloc = departmentAllocationsForEmployee(emp, allocations).find((a) => a.departmentId === d.id);
        if (!alloc) continue;
        const weight = alloc.percent / 100;
        scaledFacts.push(scaleFact(f, weight));
        if (!seenEmployeeIds.has(f.employeeId)) {
          seenEmployeeIds.add(f.employeeId);
          headcountWeight += weight;
        }
      }
      const payroll = { ...summarizePayroll(scaledFacts), employeeCount: Math.round(headcountWeight * 100) / 100 };
      const attendance = summarizeAttendance(scaledFacts);
      const overtime = summarizeOvertime(scaledFacts);
      return { departmentId: d.id, label: departmentName(d.id), payroll, attendance, overtime };
    })
    .filter((row) => row.payroll.employeeCount > 0);
}

export function groupByEmployee(facts: MonthlyEmployeeFact[], employees: Employee[]) {
  const byId = new Map(employees.map((e) => [e.id, e]));
  const employeeIds = Array.from(new Set(facts.map((f) => f.employeeId)));
  return employeeIds
    .map((id) => {
      const emp = byId.get(id);
      if (!emp) return null;
      const empFacts = facts.filter((f) => f.employeeId === id);
      const payroll = summarizePayroll(empFacts);
      const attendance = summarizeAttendance(empFacts);
      const overtime = summarizeOvertime(empFacts);
      return { employee: emp, label: fullName(emp), payroll, attendance, overtime };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);
}

export interface HistoricalPayrollAnalytics {
  trend: { label: string; monthKey: string; value: number }[];
  averagePerEmployee: number;
  highestMonth: { label: string; value: number };
  lowestMonth: { label: string; value: number };
  growthRatePct: number; // vs. first month in the trend window
}

export function historicalPayrollAnalytics(facts: MonthlyEmployeeFact[], employees: Employee[], filters: AnalyticsFilters = {}): HistoricalPayrollAnalytics {
  const trend = payrollExpenseTrendByMonth(facts, employees, filters).map((t) => ({ label: t.label, monthKey: t.monthKey, value: t.value }));
  const nonZero = trend.filter((t) => t.value > 0);
  const highestMonth = nonZero.reduce((max, t) => (t.value > max.value ? t : max), nonZero[0] ?? { label: "—", value: 0 });
  const lowestMonth = nonZero.reduce((min, t) => (t.value < min.value ? t : min), nonZero[0] ?? { label: "—", value: 0 });
  const first = trend[0]?.value ?? 0;
  const last = trend[trend.length - 1]?.value ?? 0;
  const growthRatePct = first ? Math.round(((last - first) / first) * 1000) / 10 : 0;
  const currentMonthFacts = filterFacts(facts, employees, { ...filters, monthKey: CURRENT_MONTH_KEY });
  const currentSummary = summarizePayroll(currentMonthFacts);
  const averagePerEmployee = currentSummary.employeeCount ? Math.round(currentSummary.totalEmployerExpense / currentSummary.employeeCount) : 0;
  return { trend, averagePerEmployee, highestMonth, lowestMonth, growthRatePct };
}

export function toCsv(headers: string[], rows: (string | number)[][]): string {
  const escape = (v: string | number) => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.map(escape).join(","), ...rows.map((r) => r.map(escape).join(","))].join("\n");
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
