import { currentCompany } from "./companies";
import type { PayrollLine } from "./payroll";

// Payroll Processing's register columns and the names payroll figures go by,
// per company (lib/companies.ts payrollLayout). The standard layout is the
// one every company had; Daro's follows its own payroll sheet, in its order
// and with its column names, leaving out what it doesn't use.

export interface PayrollColumn {
  key: string;
  label: string;
  value: (l: PayrollLine) => number;
  // deduct: shown as "-amount" in red; strong: emphasized (gross, net);
  // count: a plain number (days), not money; dash: "—" instead of 0.00.
  style?: "deduct" | "strong" | "count" | "dash";
}

const col = (key: keyof PayrollLine, label: string, style?: PayrollColumn["style"]): PayrollColumn => ({
  key,
  label,
  value: (l) => Number(l[key]) || 0,
  style,
});

const STANDARD: PayrollColumn[] = [
  col("ratePerDay", "Rate/Day"),
  col("basicPay", "Basic"),
  col("latesUndertime", "Late", "deduct"),
  col("undertimeDeduction", "Undertime", "deduct"),
  col("holidayPay", "Holiday"),
  col("vlPay", "VL"),
  col("slPay", "SL"),
  col("otPay", "OT"),
  col("netAllowances", "Allowances"),
  col("grossSalary", "Gross", "strong"),
  col("sssContribution", "SSS"),
  col("sssWisp", "WISP"),
  col("philHealthContribution", "PhilHealth"),
  col("hdmfContribution", "HDMF"),
  col("withholdingTax", "WHT"),
  col("cashAdvance", "Cash Adv."),
  col("lsmBizLoan", "LSM Biz"),
  col("lsmCoopLoan", "LSM Coop"),
  col("shortages", "Shortage"),
  col("sssLoan", "SSS Loan"),
  col("hdmfLoan", "Pag-IBIG Loan"),
  col("hdmfMp2Savings", "Pag-IBIG MP2"),
  col("adjustmentDeduct", "Adj. (deduction)", "deduct"),
  col("adjustmentAdd", "Adj. (additional)", "dash"),
  col("netPay", "Net pay", "strong"),
];

// Daro's sheet: Employee | Position | No. of days | Rate/ day | Basic Salary
// | Lates | Addtl. | Holiday Pay | VL/SL | (rice, uniform, laundry, medical →)
// De Minimis | Gross Salary | CA | CBU- COOP | LSM COOP Loan | Uniform/ ID
// Lace | SSS - EE | SSS Loan | HDMF | HDMF Loan | PHIC - EE | SHORTAGES |
// (Allowance, rounding) | Net Pay. The import puts CBU-COOP in the LSM Biz
// slot and the Allowance with the additions (lib/payroll-import-lsmbiz.ts).
const DARO: PayrollColumn[] = [
  col("daysWorking", "No. of days", "count"),
  col("ratePerDay", "Rate/day"),
  col("basicPay", "Basic Salary"),
  col("latesUndertime", "Lates", "deduct"),
  col("otPay", "Addtl."),
  col("holidayPay", "Holiday Pay"),
  { key: "vlsl", label: "VL/SL", value: (l) => l.vlPay + l.slPay },
  col("netAllowances", "De Minimis"),
  col("grossSalary", "Gross Salary", "strong"),
  col("cashAdvance", "CA"),
  col("lsmBizLoan", "CBU-COOP"),
  col("lsmCoopLoan", "LSM COOP Loan"),
  col("adjustmentDeduct", "Uniform / Adj.", "deduct"),
  col("sssContribution", "SSS - EE"),
  col("sssLoan", "SSS Loan"),
  col("hdmfContribution", "HDMF"),
  col("hdmfLoan", "HDMF Loan"),
  col("philHealthContribution", "PHIC - EE"),
  col("shortages", "Shortages"),
  col("adjustmentAdd", "Allowance / Adj.", "dash"),
  col("netPay", "Net Pay", "strong"),
];

// Daro: one upload for every branch, and the register split into branch
// sections, each with its own subtotal, like its payroll workbook.
export function payrollByBranch(): boolean {
  return currentCompany().payrollLayout === "daro";
}

// The first column after the employee's name.
export function payrollLeadColumn(): "type" | "position" {
  return currentCompany().payrollLayout === "daro" ? "position" : "type";
}

// The register's columns for these lines. A column the company's layout
// leaves out is still shown (just before Net Pay) when anyone has an amount
// in it, so the figures on screen always add up to the net pay.
export function payrollColumns(lines: PayrollLine[]): PayrollColumn[] {
  if (currentCompany().allowanceBreakdown) {
    return STANDARD.flatMap((c) => (c.key === "netAllowances" ? allowanceColumns() : [c]));
  }
  if (currentCompany().payrollLayout !== "daro") return STANDARD;
  const shown = new Set(DARO.map((c) => c.key));
  const covered = new Set([...shown, "vlPay", "slPay"]);
  const extra = STANDARD.filter((c) => !covered.has(c.key) && lines.some((l) => c.value(l) !== 0));
  return [...DARO.slice(0, -1), ...extra, DARO[DARO.length - 1]];
}

// LSMBiz: each allowance in its own column.
function allowanceColumns(): PayrollColumn[] {
  return ALLOWANCE_PARTS.map((p) => col(p.key, p.short));
}

// The allowances that make up netAllowances, for companies that list them
// (allowanceBreakdown = LSMBiz): register column name, and name on the
// payslip and edit form. LSMBiz has no travel or supervisor allowance; it
// keeps Other Allowance 1 (the file's ALLOWANCE, less Other Allowance 2)
// and its uniform allowance in those two fields. `deMinimis`: part of the De Minimis total
// shown on the payslip.
export const ALLOWANCE_PARTS: { key: "dailyAllowance" | "supervisorAllowance" | "laundryAllowance" | "medicalCashAllowance" | "travelAllowance" | "otherAllowance2"; short: string; label: string; deMinimis: boolean }[] = [
  { key: "dailyAllowance", short: "Rice", label: "Rice Allowance", deMinimis: true },
  { key: "supervisorAllowance", short: "Uniform", label: "Uniform Allowance", deMinimis: true },
  { key: "laundryAllowance", short: "Laundry", label: "Laundry Allowance", deMinimis: true },
  { key: "medicalCashAllowance", short: "Medical", label: "Medical Cash Allowance", deMinimis: true },
  { key: "travelAllowance", short: "Other Allow. 1", label: "Other Allowance 1", deMinimis: false },
  { key: "otherAllowance2", short: "Other Allow. 2", label: "Other Allowance 2", deMinimis: false },
];

// Names for payroll figures on the payslip and in the edit form, where a
// company calls them something else. Falls back to the standard name.
const DARO_NAMES: Partial<Record<keyof PayrollLine, string>> = {
  latesUndertime: "Lates",
  otPay: "Addtl.",
  vlPay: "VL/SL Pay",
  netAllowances: "De Minimis Benefits",
  lsmBizLoan: "CBU-COOP",
  lsmCoopLoan: "LSM COOP Loan",
  adjustmentAdd: "Allowance / Adjustment (Add)",
  adjustmentDeduct: "Uniform / Adjustment (Deduct)",
};

export function payrollLabel(key: keyof PayrollLine, standard: string): string {
  if (currentCompany().allowanceBreakdown) {
    const part = ALLOWANCE_PARTS.find((p) => p.key === key);
    if (part) return part.label;
  }
  return (currentCompany().payrollLayout === "daro" && DARO_NAMES[key]) || standard;
}
