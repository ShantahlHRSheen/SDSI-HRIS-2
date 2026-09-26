// Salary adjustments (Salary Adjustment Voucher): a correction to one part
// of an employee's payroll for a period — supabase/migrate_phase19_salary_adjustments.sql.
// computePayrollForPeriod adds each adjustment to its component, so it flows
// into gross, tax (when not fixed by an import), net pay, payslips and reports.

export type SalaryAdjustmentComponent =
  | "basic_pay"
  | "holiday_pay"
  | "vl_pay"
  | "sl_pay"
  | "ot_pay"
  | "allowance"
  | "other_earning"
  | "late_deduction"
  | "sss"
  | "philhealth"
  | "hdmf"
  | "withholding_tax"
  | "cash_advance"
  | "sss_loan"
  | "hdmf_loan"
  | "shortages"
  | "other_deduction";

export interface SalaryAdjustment {
  id: string;
  periodId: string;
  employeeId: string;
  component: SalaryAdjustmentComponent;
  // Positive raises that component, negative lowers it (e.g. SSS −200 = refund).
  amount: number;
  description: string;
  createdBy: string;
  createdAt: string;
}

// kind: whether raising the component raises ("earning") or lowers
// ("deduction") net pay.
export const SALARY_ADJUSTMENT_COMPONENTS: { value: SalaryAdjustmentComponent; label: string; kind: "earning" | "deduction" }[] = [
  { value: "basic_pay", label: "Basic pay", kind: "earning" },
  { value: "holiday_pay", label: "Holiday pay", kind: "earning" },
  { value: "vl_pay", label: "VL pay", kind: "earning" },
  { value: "sl_pay", label: "SL pay", kind: "earning" },
  { value: "ot_pay", label: "Overtime pay", kind: "earning" },
  { value: "allowance", label: "Allowance", kind: "earning" },
  { value: "other_earning", label: "Other earning", kind: "earning" },
  { value: "late_deduction", label: "Late / undertime deduction", kind: "deduction" },
  { value: "sss", label: "SSS contribution", kind: "deduction" },
  { value: "philhealth", label: "PhilHealth contribution", kind: "deduction" },
  { value: "hdmf", label: "Pag-IBIG contribution", kind: "deduction" },
  { value: "withholding_tax", label: "Withholding tax", kind: "deduction" },
  { value: "cash_advance", label: "Cash advance", kind: "deduction" },
  { value: "sss_loan", label: "SSS loan", kind: "deduction" },
  { value: "hdmf_loan", label: "Pag-IBIG loan", kind: "deduction" },
  { value: "shortages", label: "Shortages", kind: "deduction" },
  { value: "other_deduction", label: "Other deduction", kind: "deduction" },
];

const META = new Map(SALARY_ADJUSTMENT_COMPONENTS.map((c) => [c.value, c]));
export const componentLabel = (c: SalaryAdjustmentComponent) => META.get(c)?.label ?? c;
export const componentKind = (c: SalaryAdjustmentComponent) => META.get(c)?.kind ?? "earning";

// Effect of one adjustment on net pay.
export const netEffect = (a: Pick<SalaryAdjustment, "component" | "amount">) => (componentKind(a.component) === "earning" ? a.amount : -a.amount);

// The app's current adjustments, set by the store (like setReferenceData),
// so every payroll computation and report includes them without each page
// having to pass them along. `version` changes whenever the list does.
let registered: SalaryAdjustment[] = [];
let version = 0;
export function setSalaryAdjustments(list: SalaryAdjustment[]): void {
  if (list === registered) return;
  registered = list;
  version++;
}
export const registeredSalaryAdjustments = () => registered;
export const salaryAdjustmentsVersion = () => version;

// Per-component totals for one employee in one period.
export function adjustmentTotals(list: SalaryAdjustment[], periodId: string, employeeId: string): Partial<Record<SalaryAdjustmentComponent, number>> {
  const out: Partial<Record<SalaryAdjustmentComponent, number>> = {};
  for (const a of list) if (a.periodId === periodId && a.employeeId === employeeId) out[a.component] = Math.round(((out[a.component] ?? 0) + a.amount) * 100) / 100;
  return out;
}
