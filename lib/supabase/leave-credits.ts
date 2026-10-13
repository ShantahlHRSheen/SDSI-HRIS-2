import { getSupabaseClient } from "./client";
import type { LeaveCreditAdjustment } from "../leave-policy";

// supabase/migrate_phase39_leave_credit_adjustments.sql. The typed client
// doesn't know this table, so it's reached through a loosely-typed handle.
type Row = Record<string, unknown>;
type Query = PromiseLike<{ data: unknown; error: { message: string } | null }> & {
  select: (c?: string) => Query;
  order: (c: string) => Query;
  range: (from: number, to: number) => Query;
};
const client = () => getSupabaseClient() as unknown as { from: (t: string) => Query };

// Every adjustment the signed-in user may see; none before the migration runs.
export async function fetchLeaveCreditAdjustments(): Promise<LeaveCreditAdjustment[]> {
  const out: LeaveCreditAdjustment[] = [];
  for (let i = 0; ; i += 1000) {
    const { data, error } = await client().from("leave_credit_adjustments").select("*").order("employee_id").order("leave_type_id").order("period_key").range(i, i + 999);
    if (error) {
      if (/leave_credit_adjustments/.test(error.message)) return [];
      throw new Error(error.message);
    }
    const rows = data as Row[];
    out.push(...rows.map((r) => ({ employeeId: String(r.employee_id), leaveTypeId: String(r.leave_type_id), periodKey: String(r.period_key), days: Number(r.days), note: String(r.note ?? "") })));
    if (rows.length < 1000) return out;
  }
}
