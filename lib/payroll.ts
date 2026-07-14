import type { AttendancePeriodRecord, Employee, OvertimeRequest, PayrollLineOverride, PayrollPeriod } from "./types";
import { computeHdmf, computePhilHealth, computeSemiMonthlyWithholdingTax, computeSss } from "./statutory";

// ---------------------------------------------------------------------------
// Per-payroll-period payroll computation, driven entirely by real records and
// matching the company's own PAYROLL FORMAT / PAYSLIP spreadsheet line-item
// by line-item:
// - Days worked / holiday / VL / SL days / late minutes come from the
//   imported or manually entered AttendancePeriodRecord for that period (see
//   lib/attendance-import.ts and the Attendance module).
// - Overtime pay comes from the already-approved Overtime requests whose
//   date falls inside the period — not from a second, parallel estimate —
//   so there is exactly one source of truth for it, unless overridden.
// - SSS / SSS WISP / PhilHealth / Pag-IBIG (HDMF) contributions are computed
//   from lib/statutory.ts against each employee's "Basis of Mandatories" —
//   their standing monthly compensation, independent of a single period's
//   actual earnings — with exactly half of the full monthly employee (and
//   employer) contribution deducted on EACH semi-monthly cutoff. Withholding
//   tax is computed every period from the semi-monthly BIR table, which is
//   itself already calibrated to a half-month's compensation.
// - A daily-rate employee's basic pay is their attendance for the period
//   (rate per day × days worked). A fixed-rate employee's basic pay is a
//   flat half of their monthly salary, regardless of days worked.
// - Every figure here — earnings, allowances, loans, adjustments, and the
//   five statutory contributions — can be overridden per employee per
//   period via a PayrollLineOverride; the aggregate/derived fields (gross,
//   totals, net pay) are always recomputed from those (possibly-overridden)
//   inputs and are never independently overridable, so the arithmetic
//   always stays internally consistent.
// ---------------------------------------------------------------------------

const OT_MULTIPLIER = 1.25;
const DAILY_RATE_MONTHLY_DIVISOR = 22;
const WORK_HOURS_PER_DAY = 8;
const WORK_MINUTES_PER_DAY = WORK_HOURS_PER_DAY * 60;
// Basis of Mandatories for daily-rate employees: their imputed standing
// monthly compensation, per the template's own formula (days/year ÷ months).
const DAYS_PER_YEAR_FOR_BASIS = 313;
const MONTHS_PER_YEAR = 12;

export interface PayrollLine {
  employeeId: string;
  payrollType: Employee["payrollType"];

  // --- Inputs (from attendance + employee record) ---------------------
  basisOfMandatories: number;
  daysWorking: number;
  holidayDays: number;
  vlDays: number;
  slDays: number;
  lateMinutes: number;
  otHours: number;
  otHoursAuto: number;
  ratePerDay: number;

  // --- Earnings --------------------------------------------------------
  basicPay: number;
  basicPayAuto: number;
  latesUndertime: number;
  latesUndertimeAuto: number;
  basicSalaryLessLate: number;
  holidayPay: number;
  holidayPayAuto: number;
  vlPay: number;
  vlPayAuto: number;
  slPay: number;
  slPayAuto: number;
  otPay: number;
  otPayAuto: number;
  basicSalaryTotal: number;

  travelAllowance: number;
  dailyAllowance: number;
  dailyAllowanceAuto: number;
  laundryAllowance: number;
  medicalCashAllowance: number;
  supervisorAllowance: number;
  netAllowances: number;

  grossSalary: number;

  // --- Other deductions --------------------------------------------------
  cashAdvance: number;
  lsmBizLoan: number;
  lsmCoopLoan: number;
  shortages: number;
  hdmfMp2Savings: number;
  withholdingTax: number;
  totalDeductionsOtherThanMandatories: number;

  // --- Statutory mandatories (employee share, half per cutoff) ----------
  sssContribution: number;
  sssContributionAuto: number;
  sssWisp: number;
  sssWispAuto: number;
  sssLoan: number;
  hdmfContribution: number;
  hdmfContributionAuto: number;
  hdmfLoan: number;
  philHealthContribution: number;
  philHealthContributionAuto: number;
  totalMandatories: number;

  // --- Adjustments + net -------------------------------------------------
  adjustmentAdd: number;
  adjustmentDeduct: number;
  netPay: number;

  // --- Employer share / cost (half per cutoff) ---------------------------
  employerSSS: number;
  employerSSSWisp: number;
  employerHDMF: number;
  employerPhilHealth: number;
  employerExpense: number;
}

function ratePerDay(employee: Employee): number {
  if (employee.payrollType === "daily") return employee.dailyRate ?? 0;
  return (employee.monthlySalary ?? 0) / DAILY_RATE_MONTHLY_DIVISOR;
}

function basisOfMandatories(employee: Employee, rate: number): number {
  if (employee.payrollType === "daily") return (rate * DAYS_PER_YEAR_FOR_BASIS) / MONTHS_PER_YEAR;
  return employee.monthlySalary ?? 0;
}

function withinPeriod(dateStr: string, period: PayrollPeriod): boolean {
  return dateStr >= period.start && dateStr <= period.end;
}

function approvedOtHours(employeeId: string, period: PayrollPeriod, overtimeRequests: OvertimeRequest[]): number {
  return overtimeRequests
    .filter((r) => r.employeeId === employeeId && r.status === "approved" && withinPeriod(r.date, period))
    .reduce((s, r) => s + r.hours, 0);
}

const emptyOverride: Omit<PayrollLineOverride, "id" | "periodId" | "employeeId" | "updatedBy" | "updatedAt"> = {
  travelAllowance: 0,
  laundryAllowance: 0,
  medicalCashAllowance: 0,
  supervisorAllowance: 0,
  cashAdvance: 0,
  lsmBizLoan: 0,
  lsmCoopLoan: 0,
  shortages: 0,
  sssLoan: 0,
  hdmfLoan: 0,
  hdmfMp2Savings: 0,
  adjustmentAdd: 0,
  adjustmentDeduct: 0,
  sssContributionOverride: null,
  sssWispOverride: null,
  philHealthContributionOverride: null,
  hdmfContributionOverride: null,
  withholdingTaxOverride: null,
  dailyAllowanceOverride: null,
  basicPayOverride: null,
  latesUndertimeOverride: null,
  holidayPayOverride: null,
  vlPayOverride: null,
  slPayOverride: null,
  otHoursOverride: null,
  otPayOverride: null,
};

export function computePayrollForPeriod(
  period: PayrollPeriod,
  employees: Employee[],
  attendanceRecords: AttendancePeriodRecord[],
  overtimeRequests: OvertimeRequest[],
  overrides: PayrollLineOverride[],
): PayrollLine[] {
  const byEmployeeId = new Map(employees.map((e) => [e.id, e]));
  const recordsForPeriod = attendanceRecords.filter((r) => r.periodId === period.id);
  const overrideByEmployeeId = new Map(overrides.filter((o) => o.periodId === period.id).map((o) => [o.employeeId, o]));

  const lines: PayrollLine[] = [];
  for (const rec of recordsForPeriod) {
    const employee = byEmployeeId.get(rec.employeeId);
    if (!employee) continue;
    const ov = overrideByEmployeeId.get(employee.id) ?? emptyOverride;

    const rate = ratePerDay(employee);
    const basis = basisOfMandatories(employee, rate);

    const basicPayAuto = employee.payrollType === "daily" ? Math.round(rate * rec.daysWorked) : Math.round((employee.monthlySalary ?? 0) / 2);
    const basicPay = ov.basicPayOverride ?? basicPayAuto;

    const latesUndertimeAuto = Math.round((rate / WORK_MINUTES_PER_DAY) * rec.lateAdjMinutes);
    const latesUndertime = ov.latesUndertimeOverride ?? latesUndertimeAuto;
    const basicSalaryLessLate = basicPay - latesUndertime;

    const holidayPayAuto = Math.round(rate * rec.holidayDays);
    const holidayPay = ov.holidayPayOverride ?? holidayPayAuto;
    const vlPayAuto = Math.round(rate * rec.vlDays);
    const vlPay = ov.vlPayOverride ?? vlPayAuto;
    const slPayAuto = Math.round(rate * rec.slDays);
    const slPay = ov.slPayOverride ?? slPayAuto;

    const otHoursAuto = approvedOtHours(employee.id, period, overtimeRequests);
    const otHours = ov.otHoursOverride ?? otHoursAuto;
    const otPayAuto = Math.round((rate / WORK_HOURS_PER_DAY) * OT_MULTIPLIER * otHours);
    const otPay = ov.otPayOverride ?? otPayAuto;

    const basicSalaryTotal = basicSalaryLessLate + holidayPay + vlPay + slPay + otPay;

    const dailyAllowanceAuto = Math.round((employee.dailyAllowance ?? 0) * rec.daysWorked);
    const dailyAllowance = ov.dailyAllowanceOverride ?? dailyAllowanceAuto;
    const netAllowances = dailyAllowance + ov.travelAllowance + ov.laundryAllowance + ov.medicalCashAllowance + ov.supervisorAllowance;

    const grossSalary = basicSalaryTotal + netAllowances;

    // SSS / SSS WISP / PhilHealth / Pag-IBIG are keyed to the employee's
    // full monthly Basis of Mandatories, but exactly half of the monthly
    // employee (and employer) share is deducted on every cutoff.
    const sss = computeSss(basis);
    const philHealth = computePhilHealth(basis);
    const hdmf = computeHdmf(basis);

    const sssContributionAuto = Math.round((sss.regular.employee / 2) * 100) / 100;
    const sssWispAuto = Math.round((sss.wisp.employee / 2) * 100) / 100;
    const philHealthContributionAuto = Math.round((philHealth.employee / 2) * 100) / 100;
    const hdmfContributionAuto = Math.round((hdmf.employee / 2) * 100) / 100;

    const sssContribution = ov.sssContributionOverride ?? sssContributionAuto;
    const sssWisp = ov.sssWispOverride ?? sssWispAuto;
    const philHealthContribution = ov.philHealthContributionOverride ?? philHealthContributionAuto;
    const hdmfContribution = ov.hdmfContributionOverride ?? hdmfContributionAuto;

    const nonTaxable = sssContribution + sssWisp + philHealthContribution + hdmfContribution;
    const taxableCompensation = Math.max(grossSalary - nonTaxable, 0);
    const withholdingTax = ov.withholdingTaxOverride ?? computeSemiMonthlyWithholdingTax(taxableCompensation);

    const totalDeductionsOtherThanMandatories =
      ov.cashAdvance + ov.lsmBizLoan + ov.lsmCoopLoan + ov.shortages + withholdingTax + ov.sssLoan + ov.hdmfLoan + ov.hdmfMp2Savings;
    const totalMandatories = sssContribution + sssWisp + hdmfContribution + philHealthContribution;

    const netPay = grossSalary + ov.adjustmentAdd - totalDeductionsOtherThanMandatories - totalMandatories - ov.adjustmentDeduct;

    const employerSSS = Math.round((sss.regular.employer / 2) * 100) / 100;
    const employerSSSWisp = Math.round((sss.wisp.employer / 2) * 100) / 100;
    const employerHDMF = Math.round((hdmf.employer / 2) * 100) / 100;
    const employerPhilHealth = Math.round((philHealth.employer / 2) * 100) / 100;
    const employerExpense = grossSalary + employerSSS + employerSSSWisp + employerHDMF + employerPhilHealth;

    lines.push({
      employeeId: employee.id,
      payrollType: employee.payrollType,
      basisOfMandatories: basis,
      daysWorking: rec.daysWorked,
      holidayDays: rec.holidayDays,
      vlDays: rec.vlDays,
      slDays: rec.slDays,
      lateMinutes: rec.lateAdjMinutes,
      otHours,
      otHoursAuto,
      ratePerDay: rate,
      basicPay,
      basicPayAuto,
      latesUndertime,
      latesUndertimeAuto,
      basicSalaryLessLate,
      holidayPay,
      holidayPayAuto,
      vlPay,
      vlPayAuto,
      slPay,
      slPayAuto,
      otPay,
      otPayAuto,
      basicSalaryTotal,
      travelAllowance: ov.travelAllowance,
      dailyAllowance,
      dailyAllowanceAuto,
      laundryAllowance: ov.laundryAllowance,
      medicalCashAllowance: ov.medicalCashAllowance,
      supervisorAllowance: ov.supervisorAllowance,
      netAllowances,
      grossSalary,
      cashAdvance: ov.cashAdvance,
      lsmBizLoan: ov.lsmBizLoan,
      lsmCoopLoan: ov.lsmCoopLoan,
      shortages: ov.shortages,
      hdmfMp2Savings: ov.hdmfMp2Savings,
      withholdingTax,
      totalDeductionsOtherThanMandatories,
      sssContribution,
      sssContributionAuto,
      sssWisp,
      sssWispAuto,
      sssLoan: ov.sssLoan,
      hdmfContribution,
      hdmfContributionAuto,
      hdmfLoan: ov.hdmfLoan,
      philHealthContribution,
      philHealthContributionAuto,
      totalMandatories,
      adjustmentAdd: ov.adjustmentAdd,
      adjustmentDeduct: ov.adjustmentDeduct,
      netPay,
      employerSSS,
      employerSSSWisp,
      employerHDMF,
      employerPhilHealth,
      employerExpense,
    });
  }
  return lines;
}

// Serializes a computed PayrollLine into the plain numeric summary shape
// stored on a GeneratedPayslip/GeneratedVoucher record. payrollType (a
// string) is dropped from the round trip — it isn't needed to redisplay a
// historical payslip, since every other field is already a resolved number.
export function payrollLineToSummary(line: PayrollLine): Record<string, number> {
  const rest: Partial<PayrollLine> = { ...line };
  delete rest.employeeId;
  delete rest.payrollType;
  return rest as Record<string, number>;
}

export function summaryToPayrollLine(summary: Record<string, number>, employeeId = ""): PayrollLine {
  return {
    employeeId,
    payrollType: "daily",
    basisOfMandatories: summary.basisOfMandatories ?? 0,
    daysWorking: summary.daysWorking ?? 0,
    holidayDays: summary.holidayDays ?? 0,
    vlDays: summary.vlDays ?? 0,
    slDays: summary.slDays ?? 0,
    lateMinutes: summary.lateMinutes ?? 0,
    otHours: summary.otHours ?? 0,
    otHoursAuto: summary.otHoursAuto ?? 0,
    ratePerDay: summary.ratePerDay ?? 0,
    basicPay: summary.basicPay ?? 0,
    basicPayAuto: summary.basicPayAuto ?? 0,
    latesUndertime: summary.latesUndertime ?? 0,
    latesUndertimeAuto: summary.latesUndertimeAuto ?? 0,
    basicSalaryLessLate: summary.basicSalaryLessLate ?? 0,
    holidayPay: summary.holidayPay ?? 0,
    holidayPayAuto: summary.holidayPayAuto ?? 0,
    vlPay: summary.vlPay ?? 0,
    vlPayAuto: summary.vlPayAuto ?? 0,
    slPay: summary.slPay ?? 0,
    slPayAuto: summary.slPayAuto ?? 0,
    otPay: summary.otPay ?? 0,
    otPayAuto: summary.otPayAuto ?? 0,
    basicSalaryTotal: summary.basicSalaryTotal ?? 0,
    travelAllowance: summary.travelAllowance ?? 0,
    dailyAllowance: summary.dailyAllowance ?? 0,
    dailyAllowanceAuto: summary.dailyAllowanceAuto ?? 0,
    laundryAllowance: summary.laundryAllowance ?? 0,
    medicalCashAllowance: summary.medicalCashAllowance ?? 0,
    supervisorAllowance: summary.supervisorAllowance ?? 0,
    netAllowances: summary.netAllowances ?? 0,
    grossSalary: summary.grossSalary ?? 0,
    cashAdvance: summary.cashAdvance ?? 0,
    lsmBizLoan: summary.lsmBizLoan ?? 0,
    lsmCoopLoan: summary.lsmCoopLoan ?? 0,
    shortages: summary.shortages ?? 0,
    hdmfMp2Savings: summary.hdmfMp2Savings ?? 0,
    withholdingTax: summary.withholdingTax ?? 0,
    totalDeductionsOtherThanMandatories: summary.totalDeductionsOtherThanMandatories ?? 0,
    sssContribution: summary.sssContribution ?? 0,
    sssContributionAuto: summary.sssContributionAuto ?? 0,
    sssWisp: summary.sssWisp ?? 0,
    sssWispAuto: summary.sssWispAuto ?? 0,
    sssLoan: summary.sssLoan ?? 0,
    hdmfContribution: summary.hdmfContribution ?? 0,
    hdmfContributionAuto: summary.hdmfContributionAuto ?? 0,
    hdmfLoan: summary.hdmfLoan ?? 0,
    philHealthContribution: summary.philHealthContribution ?? 0,
    philHealthContributionAuto: summary.philHealthContributionAuto ?? 0,
    totalMandatories: summary.totalMandatories ?? 0,
    adjustmentAdd: summary.adjustmentAdd ?? 0,
    adjustmentDeduct: summary.adjustmentDeduct ?? 0,
    netPay: summary.netPay ?? 0,
    employerSSS: summary.employerSSS ?? 0,
    employerSSSWisp: summary.employerSSSWisp ?? 0,
    employerHDMF: summary.employerHDMF ?? 0,
    employerPhilHealth: summary.employerPhilHealth ?? 0,
    employerExpense: summary.employerExpense ?? 0,
  };
}

export function summarizePayrollLines(lines: PayrollLine[]) {
  return lines.reduce(
    (s, l) => ({
      grossPay: s.grossPay + l.grossSalary,
      totalDeductions: s.totalDeductions + l.totalDeductionsOtherThanMandatories + l.totalMandatories,
      netPay: s.netPay + l.netPay,
      employerExpense: s.employerExpense + l.employerExpense,
    }),
    { grossPay: 0, totalDeductions: 0, netPay: 0, employerExpense: 0 },
  );
}
