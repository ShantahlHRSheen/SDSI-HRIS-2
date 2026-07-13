import type { Employee } from "./types";
import { TODAY } from "./mock-data";
import { branchName, departmentName, fullName } from "./helpers";

// ---------------------------------------------------------------------------
// Monthly attendance / overtime / payroll-expense analytics.
//
// There is no real time-and-attendance or payroll-run backend in this demo,
// so this module generates a deterministic per-employee, per-month "fact
// table" (same idea as a data-warehouse fact table) and every report/chart
// on top of it is a pure aggregation over that table. Nothing here uses
// Math.random or Date.now — the same input always produces the same output,
// so server and client render identically and the numbers are stable across
// reloads.
// ---------------------------------------------------------------------------

const MONTHS_BACK = 6;

export interface MonthMeta {
  key: string; // "2026-02"
  label: string; // "Feb 2026"
  monthIndex: number; // 1-12
  year: number;
}

function hash(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
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

function monthlyCostEquivalent(e: Employee): number {
  if (e.monthlySalary) return e.monthlySalary;
  if (e.dailyRate) return e.dailyRate * 22;
  return 0;
}

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
}

function buildFact(employee: Employee, month: MonthMeta): MonthlyEmployeeFact {
  const seed = `${employee.id}-${month.key}`;
  const workingDays = 22;
  // A per-employee "attendance tendency" biases their whole 6-month history,
  // so rates spread out across employees instead of all regressing to the
  // same mean once summed over months.
  const tendency = hash(employee.id + "tendency") % 5; // 0 = reliable .. 4 = spotty
  const absentDays = Math.min(hash(seed + "a") % (2 + tendency), 6);
  const leaveDays = Math.min(hash(seed + "l") % (2 + tendency), 6);
  const lateDays = Math.min(hash(seed + "t") % (3 + tendency * 2), 10);
  const presentDays = Math.max(workingDays - absentDays - leaveDays, 0);

  const isDaily = employee.payrollType === "daily";
  const otHours = isDaily ? hash(seed + "o") % 16 : hash(seed + "o") % 5;

  const basicSalary = monthlyCostEquivalent(employee);
  const dailyEquivalent = basicSalary / workingDays;
  const hourlyRate = dailyEquivalent / 8;

  const allowances = 500 + (hash(seed + "al") % 1500);
  const overtimePay = Math.round(otHours * hourlyRate * 1.25);
  const holidayWorked = hash(seed + "h") % 6 === 0; // roughly one month in six
  const holidayPay = holidayWorked ? Math.round(dailyEquivalent) : 0;
  const leavePay = Math.round(leaveDays * dailyEquivalent);

  const employerSSS = Math.round(basicSalary * 0.095);
  const employerHDMF = Math.round(basicSalary * 0.02);
  const employerPhilHealth = Math.round(basicSalary * 0.025);

  const totalEmployerExpense =
    Math.round(basicSalary) + allowances + overtimePay + holidayPay + leavePay + employerSSS + employerHDMF + employerPhilHealth;

  return {
    employeeId: employee.id,
    monthKey: month.key,
    workingDays,
    presentDays,
    lateDays,
    absentDays,
    leaveDays,
    otHours,
    basicSalary: Math.round(basicSalary),
    allowances,
    overtimePay,
    holidayPay,
    leavePay,
    employerSSS,
    employerHDMF,
    employerPhilHealth,
    totalEmployerExpense,
  };
}

let cachedFacts: MonthlyEmployeeFact[] | null = null;
let cachedForEmployees: Employee[] | null = null;

export function getMonthlyFacts(employees: Employee[]): MonthlyEmployeeFact[] {
  if (cachedFacts && cachedForEmployees === employees) return cachedFacts;
  const months = getMonthsList();
  const facts: MonthlyEmployeeFact[] = [];
  const active = employees.filter((e) => e.status === "active" || e.status === "on_leave");
  for (const month of months) {
    for (const employee of active) {
      facts.push(buildFact(employee, month));
    }
  }
  cachedFacts = facts;
  cachedForEmployees = employees;
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

export function groupByDepartment(facts: MonthlyEmployeeFact[], employees: Employee[], departments: { id: string }[]) {
  const byId = new Map(employees.map((e) => [e.id, e]));
  return departments
    .map((d) => {
      const deptFacts = facts.filter((f) => byId.get(f.employeeId)?.departmentId === d.id);
      const payroll = summarizePayroll(deptFacts);
      const attendance = summarizeAttendance(deptFacts);
      const overtime = summarizeOvertime(deptFacts);
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
