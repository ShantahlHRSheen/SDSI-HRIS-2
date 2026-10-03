import { getSupabaseClient } from "./client";

// The signed-in employee's own voucher lines, once final
// (migrate_phase34_my_voucher_slips.sql).
export interface MyVoucherLine {
  lineId: string;
  periodId: string;
  periodStart: string;
  periodEnd: string;
  voucherDate: string | null;
  departmentId: string;
  departmentName: string;
  payeeName: string;
  description: string;
  amount: number;
  releasedAt: string | null;
}

type Row = {
  line_id: string;
  period_id: string;
  period_start: string;
  period_end: string;
  voucher_date: string | null;
  department_id: string;
  department_name: string;
  payee_name: string;
  description: string;
  amount: number | string;
  released_at: string | null;
};

export async function fetchMyVoucherLines(): Promise<MyVoucherLine[]> {
  // The typed client doesn't know this function.
  const client = getSupabaseClient() as unknown as { rpc: (fn: string) => PromiseLike<{ data: unknown; error: { message: string } | null }> };
  const { data, error } = await client.rpc("my_voucher_slips");
  if (error) throw new Error(error.message);
  return ((data ?? []) as Row[]).map((r) => ({
    lineId: r.line_id,
    periodId: r.period_id,
    periodStart: r.period_start,
    periodEnd: r.period_end,
    voucherDate: r.voucher_date,
    departmentId: r.department_id,
    departmentName: r.department_name,
    payeeName: r.payee_name,
    description: r.description,
    amount: Number(r.amount),
    releasedAt: r.released_at,
  }));
}
