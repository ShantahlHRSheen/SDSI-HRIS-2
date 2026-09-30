import { getSupabaseClient } from "./client";
import type { ThirteenthMonthEntry } from "../thirteenth-month";
import type { SignoffStep, VoucherSignoff } from "./voucher-signoffs";

// supabase/migrate_phase25_thirteenth_month.sql. The typed client doesn't
// know these tables, so they're reached through a loosely-typed handle.

type Row = Record<string, unknown>;
type Query = PromiseLike<{ data: unknown; error: { message: string } | null }> & {
  select: (c?: string) => Query;
  eq: (c: string, v: unknown) => Query;
  upsert: (v: Row, o?: { onConflict: string }) => Query;
  delete: () => Query;
  range: (from: number, to: number) => Query;
  order: (c: string) => Query;
};
const from = (t: string) => (getSupabaseClient() as unknown as { from: (t: string) => Query }).from(t);

const notSetUp = (msg: string) => /thirteenth_month/.test(msg) && /exist|find/i.test(msg);
const SETUP_MESSAGE = "The 13th month sheet isn't set up yet — ask HR to run the latest database update.";

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
const toEntry = (r: Row): ThirteenthMonthEntry => ({
  year: Number(r.year),
  employeeId: String(r.employee_id),
  designation: (r.designation as string | null) ?? null,
  months: (r.months as ThirteenthMonthEntry["months"]) ?? {},
  vlDays: num(r.vl_days),
  dailyRate: num(r.daily_rate),
  lastSalary: Number(r.last_salary ?? 0),
  sss: Number(r.sss ?? 0),
  philhealth: Number(r.philhealth ?? 0),
  hdmf: Number(r.hdmf ?? 0),
  updatedBy: String(r.updated_by ?? ""),
  updatedAt: String(r.updated_at ?? ""),
});

// The year's saved edits. Throws the set-up message if the tables are missing.
export async function fetchThirteenthMonthEntries(year: number): Promise<ThirteenthMonthEntry[]> {
  const out: ThirteenthMonthEntry[] = [];
  for (let i = 0; ; i += 1000) {
    const { data, error } = await from("thirteenth_month_entries").select("*").eq("year", year).order("employee_id").range(i, i + 999);
    if (error) throw new Error(notSetUp(error.message) ? SETUP_MESSAGE : error.message);
    const rows = data as Row[];
    out.push(...rows.map(toEntry));
    if (rows.length < 1000) return out;
  }
}

export async function saveThirteenthMonthEntry(e: ThirteenthMonthEntry, updatedBy: string): Promise<ThirteenthMonthEntry> {
  const { data, error } = await from("thirteenth_month_entries")
    .upsert(
      {
        year: e.year,
        employee_id: e.employeeId,
        designation: e.designation,
        months: e.months,
        vl_days: e.vlDays,
        daily_rate: e.dailyRate,
        last_salary: e.lastSalary,
        sss: e.sss,
        philhealth: e.philhealth,
        hdmf: e.hdmf,
        updated_by: updatedBy,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "year,employee_id" },
    )
    .select();
  if (error) {
    if (notSetUp(error.message)) throw new Error(SETUP_MESSAGE);
    if (/row-level security/i.test(error.message)) throw new Error("Only HR and the payroll officer can edit the 13th month sheet.");
    throw new Error(error.message);
  }
  const rows = data as Row[];
  if (!rows?.length) throw new Error("Only HR and the payroll officer can edit the 13th month sheet.");
  return toEntry(rows[0]);
}

// Back to the computed figures.
export async function deleteThirteenthMonthEntry(year: number, employeeId: string): Promise<void> {
  const { error } = await from("thirteenth_month_entries").delete().eq("year", year).eq("employee_id", employeeId);
  if (error) throw new Error(error.message);
}

// ---- Checked by / Released by ------------------------------------------------
// Shaped like voucher sign-offs (periodId = the year, voucherKey = the
// employee id) so the voucher sign-off controls can be reused.

type SignoffRow = { year: number; employee_id: string; step: SignoffStep; signed_by: string; signed_by_name: string; signed_total: number | string; signed_at: string };

export async function fetchThirteenthMonthSignoffs(year: number): Promise<VoucherSignoff[]> {
  const { data, error } = await from("thirteenth_month_signoffs").select("*").eq("year", year);
  if (error) return [];
  return (data as SignoffRow[]).map((r) => ({
    periodId: String(r.year),
    voucherKey: r.employee_id,
    step: r.step,
    signedBy: r.signed_by,
    signedByName: r.signed_by_name,
    signedTotal: Number(r.signed_total),
    signedAt: r.signed_at,
  }));
}

export async function signThirteenthMonth(year: number, employeeId: string, step: SignoffStep, myEmployeeId: string, total: number): Promise<void> {
  const { error } = await from("thirteenth_month_signoffs").upsert(
    { year, employee_id: employeeId, step, signed_by: myEmployeeId, signed_total: Math.round(total * 100) / 100 },
    { onConflict: "year,employee_id,step" },
  );
  if (error) {
    if (notSetUp(error.message)) throw new Error(SETUP_MESSAGE);
    if (/row-level security/i.test(error.message))
      throw new Error(
        step === "released"
          ? "Only the Corporate Treasurer can release, and only after it's checked."
          : "Only the Sr. Accounting Assistant can mark it as checked.",
      );
    throw new Error(error.message);
  }
}

export async function withdrawThirteenthMonthSignoff(year: number, employeeId: string, step: SignoffStep): Promise<void> {
  const { data, error } = await from("thirteenth_month_signoffs").delete().eq("year", year).eq("employee_id", employeeId).eq("step", step).select();
  if (error) throw new Error(error.message);
  if (!(data as Row[] | null)?.length) throw new Error("Only the person who signed (or HR) can undo this.");
}
