import type { Employee, PayrollPeriod } from "./types";
import { getMonthlyFacts } from "./monthly-analytics";

// ---------------------------------------------------------------------------
// Per-payroll-period payroll computation. There is no separate payroll-run
// backend in this demo — each semi-monthly PayrollPeriod (1st–15th /
// 16th–end) draws its numbers from the same monthly attendance/payroll fact
// used everywhere else (dashboard, reports, BIR), split evenly across the
// month's two periods, so a period's payroll always reconciles back to the
// month's already-displayed totals.
// ---------------------------------------------------------------------------

const PERIOD_SHARE = 0.5;

export interface PayrollLine {
  employeeId: string;
  basicPay: number;
  allowances: number;
  overtimePay: number;
  holidayPay: number;
  leavePay: number;
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

function periodMonthKey(period: PayrollPeriod): string {
  return period.start.slice(0, 7);
}

export function computePayrollForPeriod(period: PayrollPeriod, employees: Employee[]): PayrollLine[] {
  const monthKey = periodMonthKey(period);
  const facts = getMonthlyFacts(employees).filter((f) => f.monthKey === monthKey);
  const byId = new Map(facts.map((f) => [f.employeeId, f]));

  const lines: PayrollLine[] = [];
  for (const e of employees) {
    if (e.status !== "active" && e.status !== "on_leave") continue;
    const f = byId.get(e.id);
    if (!f) continue;

    const basicPay = Math.round(f.basicSalary * PERIOD_SHARE);
    const allowances = Math.round(f.allowances * PERIOD_SHARE);
    const overtimePay = Math.round(f.overtimePay * PERIOD_SHARE);
    const holidayPay = Math.round(f.holidayPay * PERIOD_SHARE);
    const leavePay = Math.round(f.leavePay * PERIOD_SHARE);
    const grossPay = basicPay + allowances + overtimePay + holidayPay + leavePay;

    const employeeSSS = Math.round(f.employeeSSS * PERIOD_SHARE);
    const employeeHDMF = Math.round(f.employeeHDMF * PERIOD_SHARE);
    const employeePhilHealth = Math.round(f.employeePhilHealth * PERIOD_SHARE);
    const withholdingTax = Math.round(f.withholdingTax * PERIOD_SHARE);
    const totalDeductions = employeeSSS + employeeHDMF + employeePhilHealth + withholdingTax;
    const netPay = grossPay - totalDeductions;

    const employerSSS = Math.round(f.employerSSS * PERIOD_SHARE);
    const employerHDMF = Math.round(f.employerHDMF * PERIOD_SHARE);
    const employerPhilHealth = Math.round(f.employerPhilHealth * PERIOD_SHARE);
    const employerExpense = grossPay + employerSSS + employerHDMF + employerPhilHealth;

    lines.push({
      employeeId: e.id,
      basicPay,
      allowances,
      overtimePay,
      holidayPay,
      leavePay,
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
