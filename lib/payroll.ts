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
//   so there is exactly one source of truth for it.
// - SSS / SSS WISP / PhilHealth / Pag-IBIG (HDMF) contributions are computed
//   from lib/statutory.ts against each employee's "Basis of Mandatories" —
//   their standing monthly compensation, independent of a single period's
//   actual earnings — and (per the source template) are deducted in full
//   only on the second cutoff of each month. Withholding tax is computed
//   every period from the semi-monthly BIR table.
// - Every leaf figure here (allowances, loans, cash advance, adjustments,
//   and the five statutory contributions) can be overridden per employee
//   per period via a PayrollLineOverride; the aggregate/derived fields
//   (gross, totals, net pay) are always recomputed from those inputs and are
//   never independently overridable, so the arithmetic always stays
//   internally consistent.
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

  // --- Inputs (from attendance + employee record) ---------------------
  basisOfMandatories: number;
  daysWorking: number;
  holidayDays: number;
  vlDays: number;
  slDays: number;
  lateMinutes: number;
  otHours: number;
  ratePerDay: number;

  // --- Earnings --------------------------------------------------------
  basicPay: number;
  latesUndertime: number;
  basicSalaryLessLate: number;
  holidayPay: number;
  vlPay: number;
  slPay: number;
  otPay: number;
  basicSalaryTotal: number;

  travelAllowance: number;
  dailyAllowance: number;
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
  withholdingTax: number;
  totalDeductionsOtherThanMandatories: number;

  // --- Statutory mandatories (employee share) ---------------------------
  isSecondCutoff: boolean;
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

  // --- Employer share / cost ----------------------------------------------
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

// Per the source template, SSS / SSS WISP / PhilHealth / Pag-IBIG are
// deducted in full only on the second semi-monthly cutoff of each month
// (start day > 15) — nothing is withheld on the first cutoff.
function isSecondCutoff(period: PayrollPeriod): boolean {
  return Number(period.start.slice(8, 10)) > 15;
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
  adjustmentAdd: 0,
  adjustmentDeduct: 0,
  sssContributionOverride: null,
  sssWispOverride: null,
  philHealthContributionOverride: null,
  hdmfContributionOverride: null,
  withholdingTaxOverride: null,
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
  const secondCutoff = isSecondCutoff(period);

  const lines: PayrollLine[] = [];
  for (const rec of recordsForPeriod) {
    const employee = byEmployeeId.get(rec.employeeId);
    if (!employee) continue;
    const ov = overrideByEmployeeId.get(employee.id) ?? emptyOverride;

    const rate = ratePerDay(employee);
    const basis = basisOfMandatories(employee, rate);

    const basicPay = Math.round(rate * rec.daysWorked);
    const latesUndertime = Math.round((rate / WORK_MINUTES_PER_DAY) * rec.lateAdjMinutes);
    const basicSalaryLessLate = basicPay - latesUndertime;
    const holidayPay = Math.round(rate * rec.holidayDays);
    const vlPay = Math.round(rate * rec.vlDays);
    const slPay = Math.round(rate * rec.slDays);
    const otHours = approvedOtHours(employee.id, period, overtimeRequests);
    const otPay = Math.round((rate / WORK_HOURS_PER_DAY) * OT_MULTIPLIER * otHours);
    const basicSalaryTotal = basicSalaryLessLate + holidayPay + vlPay + slPay + otPay;

    const dailyAllowance = Math.round((employee.dailyAllowance ?? 0) * rec.daysWorked);
    const netAllowances = dailyAllowance + ov.travelAllowance + ov.laundryAllowance + ov.medicalCashAllowance + ov.supervisorAllowance;

    const grossSalary = basicSalaryTotal + netAllowances;

    const sss = computeSss(basis);
    const philHealth = computePhilHealth(basis);
    const hdmf = computeHdmf(basis);

    const sssContributionAuto = secondCutoff ? sss.regular.employee : 0;
    const sssWispAuto = secondCutoff ? sss.wisp.employee : 0;
    const philHealthContributionAuto = secondCutoff ? philHealth.employee : 0;
    const hdmfContributionAuto = secondCutoff ? hdmf.employee : 0;

    const sssContribution = ov.sssContributionOverride ?? sssContributionAuto;
    const sssWisp = ov.sssWispOverride ?? sssWispAuto;
    const philHealthContribution = ov.philHealthContributionOverride ?? philHealthContributionAuto;
    const hdmfContribution = ov.hdmfContributionOverride ?? hdmfContributionAuto;

    const nonTaxable = sssContribution + sssWisp + philHealthContribution + hdmfContribution;
    const taxableCompensation = Math.max(grossSalary - nonTaxable, 0);
    const withholdingTax = ov.withholdingTaxOverride ?? computeSemiMonthlyWithholdingTax(taxableCompensation);

    const totalDeductionsOtherThanMandatories =
      ov.cashAdvance + ov.lsmBizLoan + ov.lsmCoopLoan + ov.shortages + withholdingTax + ov.sssLoan + ov.hdmfLoan;
    const totalMandatories = sssContribution + sssWisp + hdmfContribution + philHealthContribution;

    const netPay = grossSalary + ov.adjustmentAdd - totalDeductionsOtherThanMandatories - totalMandatories - ov.adjustmentDeduct;

    const employerSSS = secondCutoff ? sss.regular.employer : 0;
    const employerSSSWisp = secondCutoff ? sss.wisp.employer : 0;
    const employerHDMF = secondCutoff ? hdmf.employer : 0;
    const employerPhilHealth = secondCutoff ? philHealth.employer : 0;
    const employerExpense = grossSalary + employerSSS + employerSSSWisp + employerHDMF + employerPhilHealth;

    lines.push({
      employeeId: employee.id,
      basisOfMandatories: basis,
      daysWorking: rec.daysWorked,
      holidayDays: rec.holidayDays,
      vlDays: rec.vlDays,
      slDays: rec.slDays,
      lateMinutes: rec.lateAdjMinutes,
      otHours,
      ratePerDay: rate,
      basicPay,
      latesUndertime,
      basicSalaryLessLate,
      holidayPay,
      vlPay,
      slPay,
      otPay,
      basicSalaryTotal,
      travelAllowance: ov.travelAllowance,
      dailyAllowance,
      laundryAllowance: ov.laundryAllowance,
      medicalCashAllowance: ov.medicalCashAllowance,
      supervisorAllowance: ov.supervisorAllowance,
      netAllowances,
      grossSalary,
      cashAdvance: ov.cashAdvance,
      lsmBizLoan: ov.lsmBizLoan,
      lsmCoopLoan: ov.lsmCoopLoan,
      shortages: ov.shortages,
      withholdingTax,
      totalDeductionsOtherThanMandatories,
      isSecondCutoff: secondCutoff,
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
// stored on a GeneratedPayslip/GeneratedVoucher record (booleans are encoded
// as 0/1 so the whole line survives a round trip through Record<string, number>).
export function payrollLineToSummary(line: PayrollLine): Record<string, number> {
  const rest: Partial<PayrollLine> = { ...line };
  delete rest.employeeId;
  const isSecondCutoff = rest.isSecondCutoff;
  delete rest.isSecondCutoff;
  return { ...(rest as Record<string, number>), isSecondCutoff: isSecondCutoff ? 1 : 0 };
}

export function summaryToPayrollLine(summary: Record<string, number>, employeeId = ""): PayrollLine {
  return {
    employeeId,
    basisOfMandatories: summary.basisOfMandatories ?? 0,
    daysWorking: summary.daysWorking ?? 0,
    holidayDays: summary.holidayDays ?? 0,
    vlDays: summary.vlDays ?? 0,
    slDays: summary.slDays ?? 0,
    lateMinutes: summary.lateMinutes ?? 0,
    otHours: summary.otHours ?? 0,
    ratePerDay: summary.ratePerDay ?? 0,
    basicPay: summary.basicPay ?? 0,
    latesUndertime: summary.latesUndertime ?? 0,
    basicSalaryLessLate: summary.basicSalaryLessLate ?? 0,
    holidayPay: summary.holidayPay ?? 0,
    vlPay: summary.vlPay ?? 0,
    slPay: summary.slPay ?? 0,
    otPay: summary.otPay ?? 0,
    basicSalaryTotal: summary.basicSalaryTotal ?? 0,
    travelAllowance: summary.travelAllowance ?? 0,
    dailyAllowance: summary.dailyAllowance ?? 0,
    laundryAllowance: summary.laundryAllowance ?? 0,
    medicalCashAllowance: summary.medicalCashAllowance ?? 0,
    supervisorAllowance: summary.supervisorAllowance ?? 0,
    netAllowances: summary.netAllowances ?? 0,
    grossSalary: summary.grossSalary ?? 0,
    cashAdvance: summary.cashAdvance ?? 0,
    lsmBizLoan: summary.lsmBizLoan ?? 0,
    lsmCoopLoan: summary.lsmCoopLoan ?? 0,
    shortages: summary.shortages ?? 0,
    withholdingTax: summary.withholdingTax ?? 0,
    totalDeductionsOtherThanMandatories: summary.totalDeductionsOtherThanMandatories ?? 0,
    isSecondCutoff: (summary.isSecondCutoff ?? 0) === 1,
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
