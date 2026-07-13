import type { AttendancePeriodRecord, Employee, LeaveRequest, OvertimeRequest, PayrollPeriod } from "./types";

// ---------------------------------------------------------------------------
// Per-payroll-period payroll computation, driven entirely by real records:
// - Days worked / holiday / late minutes come from the imported or manually
//   entered AttendancePeriodRecord for that period (see lib/attendance-import.ts
//   and the Attendance module).
// - Overtime pay and leave pay come from the already-approved Overtime and
//   Leave requests whose date falls inside the period — not from a second,
//   parallel estimate — so there is exactly one source of truth for each.
// SSS/PhilHealth/Pag-IBIG rates and the withholding-tax brackets below are
// illustrative placeholders; configure real, versioned rate tables in
// System Administration before relying on this for actual payroll.
// ---------------------------------------------------------------------------

const OT_MULTIPLIER = 1.25;

export interface PayrollLine {
  employeeId: string;
  basicPay: number;
  allowances: number;
  overtimePay: number;
  holidayPay: number;
  leavePay: number;
  lateDeduction: number;
  grossPay: number;
  employeeSSS: number;
  employeeHDMF: number;
  employeePhilHealth: number;
  withholdingTax: number;
  totalDeductions: number;
  netPay: number;
  employerSSS: number;
  employerHDMF: number;
  employerPhilHealth: number;
  employerExpense: number;
}

// Semi-monthly graduated withholding tax table (TRAIN law) — ILLUSTRATIVE.
const SEMI_MONTHLY_TAX_TABLE = [
  { over: 0, upTo: 10417, base: 0, rate: 0 },
  { over: 10417, upTo: 16667, base: 0, rate: 0.15 },
  { over: 16667, upTo: 33333, base: 937.5, rate: 0.2 },
  { over: 33333, upTo: 83333, base: 4270.7, rate: 0.25 },
  { over: 83333, upTo: 333333, base: 16770.7, rate: 0.3 },
  { over: 333333, upTo: Infinity, base: 91770.7, rate: 0.35 },
];

export function computeSemiMonthlyWithholdingTax(taxableCompensation: number): number {
  if (taxableCompensation <= 0) return 0;
  const bracket = SEMI_MONTHLY_TAX_TABLE.find((b) => taxableCompensation > b.over && taxableCompensation <= b.upTo) ?? SEMI_MONTHLY_TAX_TABLE[SEMI_MONTHLY_TAX_TABLE.length - 1];
  return Math.round(bracket.base + (taxableCompensation - bracket.over) * bracket.rate);
}

function dailyEquivalent(employee: Employee): number {
  if (employee.payrollType === "daily") return employee.dailyRate ?? 0;
  return (employee.monthlySalary ?? 0) / 22;
}

function withinPeriod(dateStr: string, period: PayrollPeriod): boolean {
  return dateStr >= period.start && dateStr <= period.end;
}

function approvedOtHours(employeeId: string, period: PayrollPeriod, overtimeRequests: OvertimeRequest[]): number {
  return overtimeRequests
    .filter((r) => r.employeeId === employeeId && r.status === "approved" && withinPeriod(r.date, period))
    .reduce((s, r) => s + r.hours, 0);
}

function approvedLeaveDays(employeeId: string, period: PayrollPeriod, leaveRequests: LeaveRequest[]): number {
  return leaveRequests
    .filter((r) => r.employeeId === employeeId && r.status === "approved" && withinPeriod(r.startDate, period))
    .reduce((s, r) => s + r.days, 0);
}

export function computePayrollForPeriod(
  period: PayrollPeriod,
  employees: Employee[],
  attendanceRecords: AttendancePeriodRecord[],
  leaveRequests: LeaveRequest[],
  overtimeRequests: OvertimeRequest[],
): PayrollLine[] {
  const byEmployeeId = new Map(employees.map((e) => [e.id, e]));
  const recordsForPeriod = attendanceRecords.filter((r) => r.periodId === period.id);

  const lines: PayrollLine[] = [];
  for (const rec of recordsForPeriod) {
    const employee = byEmployeeId.get(rec.employeeId);
    if (!employee) continue;

    const daily = dailyEquivalent(employee);
    const hourly = daily / 8;

    const basicPay = employee.payrollType === "daily" ? Math.round(daily * rec.daysWorked) : Math.round((employee.monthlySalary ?? 0) / 2);
    const holidayPay = Math.round(daily * rec.holidayDays);
    const lateDeduction = Math.round((rec.lateAdjMinutes / 60) * hourly);

    const otHours = approvedOtHours(employee.id, period, overtimeRequests);
    const overtimePay = Math.round(otHours * hourly * OT_MULTIPLIER);

    const leaveDays = approvedLeaveDays(employee.id, period, leaveRequests);
    const leavePay = Math.round(daily * leaveDays);

    const allowances =
      employee.monthlyAllowance != null
        ? Math.round(employee.monthlyAllowance / 2)
        : employee.dailyAllowance != null
          ? Math.round(employee.dailyAllowance * rec.daysWorked)
          : 0;

    const grossPay = Math.max(basicPay + allowances + overtimePay + holidayPay + leavePay - lateDeduction, 0);

    const employeeSSS = Math.round(basicPay * 0.045);
    const employeeHDMF = Math.min(Math.round(basicPay * 0.02), 200);
    const employeePhilHealth = Math.round(basicPay * 0.025);
    const withholdingTax = computeSemiMonthlyWithholdingTax(grossPay - employeeSSS - employeeHDMF - employeePhilHealth);
    const totalDeductions = employeeSSS + employeeHDMF + employeePhilHealth + withholdingTax;
    const netPay = grossPay - totalDeductions;

    const employerSSS = Math.round(basicPay * 0.095);
    const employerHDMF = Math.round(basicPay * 0.02);
    const employerPhilHealth = Math.round(basicPay * 0.025);
    const employerExpense = grossPay + employerSSS + employerHDMF + employerPhilHealth;

    lines.push({
      employeeId: employee.id,
      basicPay,
      allowances,
      overtimePay,
      holidayPay,
      leavePay,
      lateDeduction,
      grossPay,
      employeeSSS,
      employeeHDMF,
      employeePhilHealth,
      withholdingTax,
      totalDeductions,
      netPay,
      employerSSS,
      employerHDMF,
      employerPhilHealth,
      employerExpense,
    });
  }
  return lines;
}

export function summarizePayrollLines(lines: PayrollLine[]) {
  return lines.reduce(
    (s, l) => ({
      grossPay: s.grossPay + l.grossPay,
      totalDeductions: s.totalDeductions + l.totalDeductions,
      netPay: s.netPay + l.netPay,
      employerExpense: s.employerExpense + l.employerExpense,
    }),
    { grossPay: 0, totalDeductions: 0, netPay: 0, employerExpense: 0 },
  );
}
