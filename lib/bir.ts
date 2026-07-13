import type { Employee } from "./types";
import { BRANCHES } from "./mock-data";
import { employeeHdmfNumber, employeePhilHealthNumber, employeeSssNumber, employeeTIN, fullName } from "./helpers";
import {
  filterFacts,
  getMonthsList,
  summarizePayroll,
  summarizeTax,
  type AnalyticsFilters,
  type MonthlyEmployeeFact,
} from "./monthly-analytics";

// Illustrative employer registration details — placeholders. Real TIN/RDO
// code must come from the company's actual BIR Certificate of Registration
// (BIR Form 2303) before these forms are used for anything but a demo.
export const COMPANY_INFO = {
  name: "Shantahl Direct Sales Inc.",
  tin: "000-123-456-000",
  address: BRANCHES.find((b) => b.id === "br-mnl")?.address ?? "Manila, Philippines",
  rdoCode: "043 — Pasig City",
};

export function getAvailableTaxYears(): number[] {
  return Array.from(new Set(getMonthsList().map((m) => m.year))).sort((a, b) => b - a);
}

export interface Form1601CData {
  monthKey: string;
  monthLabel: string;
  employeeCount: number;
  totalCompensationPaid: number;
  totalTaxWithheld: number;
  totalAmountToRemit: number;
}

export function buildForm1601C(facts: MonthlyEmployeeFact[], employees: Employee[], monthKey: string): Form1601CData {
  const month = getMonthsList().find((m) => m.key === monthKey);
  const monthFacts = filterFacts(facts, employees, { monthKey });
  const tax = summarizeTax(monthFacts);
  return {
    monthKey,
    monthLabel: month?.label ?? monthKey,
    employeeCount: tax.employeeCount,
    totalCompensationPaid: tax.grossCompensation,
    totalTaxWithheld: tax.withholdingTax,
    totalAmountToRemit: tax.withholdingTax,
  };
}

export interface Form2316Data {
  employee: Employee;
  taxYear: number;
  monthsCovered: string;
  grossCompensation: number;
  taxableCompensation: number;
  nonTaxableCompensation: number;
  basicSalary: number;
  allowances: number;
  overtimePay: number;
  holidayPay: number;
  leavePay: number;
  thirteenthMonthPay: number;
  otherBenefits: number;
  deMinimisBenefits: number;
  employeeSSS: number;
  employeePhilHealth: number;
  employeeHDMF: number;
  totalTaxWithheld: number;
  netTaxDue: number;
}

export function buildForm2316(facts: MonthlyEmployeeFact[], employees: Employee[], employeeId: string, taxYear: number): Form2316Data | null {
  const employee = employees.find((e) => e.id === employeeId);
  if (!employee) return null;
  const yearFacts = filterFacts(facts, employees, { employeeId, year: taxYear });
  const payroll = summarizePayroll(yearFacts);
  const tax = summarizeTax(yearFacts);
  const months = getMonthsList().filter((m) => m.year === taxYear);
  return {
    employee,
    taxYear,
    monthsCovered: months.length ? `${months[0].label} – ${months[months.length - 1].label}` : "—",
    grossCompensation: tax.grossCompensation,
    taxableCompensation: tax.taxableCompensation,
    nonTaxableCompensation: tax.nonTaxableCompensation,
    basicSalary: payroll.basicSalary,
    allowances: payroll.allowances,
    overtimePay: payroll.overtimePay,
    holidayPay: payroll.holidayPay,
    leavePay: payroll.leavePay,
    thirteenthMonthPay: tax.thirteenthMonthAccrual,
    otherBenefits: tax.otherBenefits,
    deMinimisBenefits: tax.deMinimisBenefits,
    employeeSSS: tax.employeeSSS,
    employeePhilHealth: tax.employeePhilHealth,
    employeeHDMF: tax.employeeHDMF,
    totalTaxWithheld: tax.withholdingTax,
    // Assumes correct per-period withholding with no year-end annualization
    // adjustment — i.e. tax already withheld equals tax due. A real payroll
    // engine would recompute annualized tax and true up any variance here.
    netTaxDue: tax.withholdingTax,
  };
}

export function employeeGovIds(employee: Employee) {
  return {
    tin: employeeTIN(employee.employeeNumber),
    sss: employeeSssNumber(employee.employeeNumber),
    philHealth: employeePhilHealthNumber(employee.employeeNumber),
    hdmf: employeeHdmfNumber(employee.employeeNumber),
  };
}

export function employeeLabel(employee: Employee): string {
  return fullName(employee);
}

export type { AnalyticsFilters };
