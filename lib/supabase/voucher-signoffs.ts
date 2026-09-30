import { getSupabaseClient } from "./client";

// Checked by / Released by sign-offs on vouchers
// (supabase/migrate_phase24_voucher_signoffs.sql). The database fills in who
// signed and when; signedTotal is the voucher total at that moment.

export type SignoffStep = "checked" | "released";

export interface VoucherSignoff {
  periodId: string;
  voucherKey: string; // "dept:<department id>" or "salary_adjustments"
  step: SignoffStep;
  signedBy: string;
  signedByName: string;
  signedTotal: number;
  signedAt: string;
}

type Row = { period_id: string; voucher_key: string; step: SignoffStep; signed_by: string; signed_by_name: string; signed_total: number | string; signed_at: string };
type Query = PromiseLike<{ data: unknown; error: { message: string } | null }> & {
  select: (c?: string) => Query;
  eq: (c: string, v: string) => Query;
  upsert: (v: Record<string, unknown>, o?: { onConflict: string }) => Query;
  delete: () => Query;
};
const table = () => (getSupabaseClient() as unknown as { from: (t: string) => Query }).from("voucher_signoffs");

const toSignoff = (r: Row): VoucherSignoff => ({
  periodId: r.period_id,
  voucherKey: r.voucher_key,
  step: r.step,
  signedBy: r.signed_by,
  signedByName: r.signed_by_name,
  signedTotal: Number(r.signed_total),
  signedAt: r.signed_at,
});

// Sign-offs for a period; [] if sign-offs aren't set up yet.
export async function fetchVoucherSignoffs(periodId: string): Promise<VoucherSignoff[]> {
  const { data, error } = await table().select("*").eq("period_id", periodId);
  if (error) return [];
  return (data as Row[]).map(toSignoff);
}

export async function signVoucher(periodId: string, voucherKey: string, step: SignoffStep, myEmployeeId: string, total: number): Promise<void> {
  const { error } = await table().upsert(
    { period_id: periodId, voucher_key: voucherKey, step, signed_by: myEmployeeId, signed_total: Math.round(total * 100) / 100 },
    { onConflict: "period_id,voucher_key,step" },
  );
  if (error) {
    if (/voucher_signoffs/.test(error.message) && /exist|find/i.test(error.message))
      throw new Error("Voucher sign-offs aren't set up yet — ask HR to run the latest database update.");
    if (/row-level security/i.test(error.message))
      throw new Error(
        step === "released"
          ? "Only the Corporate Treasurer can release, and only after the voucher is checked."
          : "Only the Sr. Accounting Assistant can mark a voucher as checked.",
      );
    throw new Error(error.message);
  }
}

export async function withdrawVoucherSignoff(periodId: string, voucherKey: string, step: SignoffStep): Promise<void> {
  const { data, error } = await table().delete().eq("period_id", periodId).eq("voucher_key", voucherKey).eq("step", step).select();
  if (error) throw new Error(error.message);
  if (!(data as Row[] | null)?.length) throw new Error("Only the person who signed (or HR) can undo this.");
}
