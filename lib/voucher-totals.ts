import type { DepartmentVoucher, DepartmentVoucherLine } from "./supabase/department-vouchers";
import type { Department, EmployeeDepartmentAllocation, PayrollPeriod } from "./types";

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

// A line linked to an employee whose cost is split across departments
// (employee_department_allocations, e.g. 50% MLM / 50% Darofy) is divided by
// that split — when the voucher belongs to one of their departments.
export function voucherAmounts(
  vouchers: DepartmentVoucher[],
  lines: DepartmentVoucherLine[],
  periods: PayrollPeriod[],
  allocations: EmployeeDepartmentAllocation[] = [],
): VoucherAmount[] {
  const periodById = new Map(periods.map((p) => [p.id, p]));
  const voucherById = new Map(vouchers.map((v) => [v.id, v]));
  const splitOf = new Map<string, EmployeeDepartmentAllocation[]>();
  for (const a of allocations) splitOf.set(a.employeeId, [...(splitOf.get(a.employeeId) ?? []), a]);
  const out: VoucherAmount[] = [];
  for (const l of lines) {
    const v = voucherById.get(l.voucherId);
    const p = v && periodById.get(v.periodId);
    if (!v || !p) continue;
    const monthKey = p.start.slice(0, 7);
    const split = l.employeeId ? splitOf.get(l.employeeId) : undefined;
    if (split && split.length > 1 && split.some((a) => a.departmentId === v.departmentId)) {
      // The last share takes any centavo left over, so the parts add up exactly.
      let left = l.amount;
      split.forEach((a, i) => {
        const amount = i === split.length - 1 ? Math.round(left * 100) / 100 : Math.round(l.amount * a.percent) / 100;
        left -= amount;
        out.push({ monthKey, departmentId: a.departmentId, employeeId: l.employeeId, amount });
      });
    } else {
      out.push({ monthKey, departmentId: v.departmentId, employeeId: l.employeeId, amount: l.amount });
    }
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

// Amount in words for the voucher memo line.
const ONES = [
  "",
  "ONE",
  "TWO",
  "THREE",
  "FOUR",
  "FIVE",
  "SIX",
  "SEVEN",
  "EIGHT",
  "NINE",
  "TEN",
  "ELEVEN",
  "TWELVE",
  "THIRTEEN",
  "FOURTEEN",
  "FIFTEEN",
  "SIXTEEN",
  "SEVENTEEN",
  "EIGHTEEN",
  "NINETEEN",
];
const TENS = ["", "", "TWENTY", "THIRTY", "FORTY", "FIFTY", "SIXTY", "SEVENTY", "EIGHTY", "NINETY"];

function underThousand(n: number): string {
  const h = Math.floor(n / 100);
  const r = n % 100;
  const parts: string[] = [];
  if (h) parts.push(`${ONES[h]} HUNDRED`);
  if (r) parts.push(r < 20 ? ONES[r] : TENS[Math.floor(r / 10)] + (r % 10 ? `-${ONES[r % 10]}` : ""));
  return parts.join(" ");
}

// 80419.8 → "EIGHTY THOUSAND, FOUR HUNDRED NINETEEN AND 80/100 ONLY"
export function amountInWords(amount: number): string {
  const cents = Math.round(Math.abs(amount) * 100);
  let pesos = Math.floor(cents / 100);
  const centavos = String(cents % 100).padStart(2, "0");
  if (pesos === 0) return `ZERO AND ${centavos}/100 ONLY`;
  const scales = ["", "THOUSAND", "MILLION", "BILLION"];
  const groups: string[] = [];
  for (let i = 0; pesos > 0 && i < scales.length; i++) {
    const g = pesos % 1000;
    if (g) groups.unshift(`${underThousand(g)}${scales[i] ? ` ${scales[i]}` : ""}`);
    pesos = Math.floor(pesos / 1000);
  }
  return `${amount < 0 ? "NEGATIVE " : ""}${groups.join(", ")} AND ${centavos}/100 ONLY`;
}
