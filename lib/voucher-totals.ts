import type { DepartmentVoucher, DepartmentVoucherLine } from "./supabase/department-vouchers";
import type { Department, PayrollPeriod } from "./types";

// "MLM Department" → "MLM Voucher", "Accounting" → "Accounting Voucher".
export function voucherTitle(d: Department): string {
  return `${d.name.replace(/\s+Department$/i, "")} Voucher`;
}

// Department voucher amounts for the Payroll Expense Report. A voucher counts
// in the month its payroll period starts — the same rule the report uses for
// payroll lines.

export interface VoucherAmount {
  monthKey: string;
  departmentId: string;
  employeeId: string | null;
  amount: number;
}

export function voucherAmounts(vouchers: DepartmentVoucher[], lines: DepartmentVoucherLine[], periods: PayrollPeriod[]): VoucherAmount[] {
  const periodById = new Map(periods.map((p) => [p.id, p]));
  const voucherById = new Map(vouchers.map((v) => [v.id, v]));
  const out: VoucherAmount[] = [];
  for (const l of lines) {
    const v = voucherById.get(l.voucherId);
    const p = v && periodById.get(v.periodId);
    if (!v || !p) continue;
    out.push({ monthKey: p.start.slice(0, 7), departmentId: v.departmentId, employeeId: l.employeeId, amount: l.amount });
  }
  return out;
}

// The report's filters. Vouchers aren't tied to a branch, so a branch filter
// leaves them out; an employee filter keeps only lines linked to that person.
export function filterVoucherAmounts(
  amounts: VoucherAmount[],
  f: { monthKey?: string; year?: number; departmentId?: string; branchId?: string; employeeId?: string },
): VoucherAmount[] {
  if (f.branchId) return [];
  return amounts.filter(
    (a) =>
      (!f.monthKey || a.monthKey === f.monthKey) &&
      (!f.year || Number(a.monthKey.slice(0, 4)) === f.year) &&
      (!f.departmentId || a.departmentId === f.departmentId) &&
      (!f.employeeId || a.employeeId === f.employeeId),
  );
}

export function sumBy<K extends string>(amounts: VoucherAmount[], key: (a: VoucherAmount) => K): Map<K, number> {
  const m = new Map<K, number>();
  for (const a of amounts) m.set(key(a), Math.round(((m.get(key(a)) ?? 0) + a.amount) * 100) / 100);
  return m;
}
