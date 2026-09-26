import { getSupabaseClient } from "./client";
import type { SalaryAdjustment, SalaryAdjustmentComponent } from "../salary-adjustments";

// supabase/migrate_phase19_salary_adjustments.sql. The typed client doesn't
// know this table, so it's reached through a loosely-typed handle.

type Row = Record<string, unknown>;
type Query = PromiseLike<{ data: Row[] | Row | null; error: { message: string } | null }> & {
  select: (cols?: string) => Query;
  insert: (v: Row) => Query;
  update: (v: Row) => Query;
  delete: () => Query;
  eq: (col: string, v: unknown) => Query;
  order: (col: string, o?: { ascending: boolean }) => Query;
  range: (from: number, to: number) => Query;
  single: () => Query;
};
const table = () => (getSupabaseClient() as unknown as { from: (t: string) => Query }).from("salary_adjustments");

async function run<T>(q: Query): Promise<T> {
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data as T;
}

const toAdjustment = (r: Row): SalaryAdjustment => ({
  id: String(r.id),
  periodId: String(r.period_id),
  employeeId: String(r.employee_id),
  component: r.component as SalaryAdjustmentComponent,
  amount: Number(r.amount),
  description: String(r.description ?? ""),
  createdBy: String(r.created_by ?? ""),
  createdAt: String(r.created_at ?? ""),
});

export async function fetchSalaryAdjustments(): Promise<SalaryAdjustment[]> {
  const out: SalaryAdjustment[] = [];
  for (let from = 0; ; from += 1000) {
    const rows = await run<Row[]>(table().select("*").order("created_at", { ascending: true }).order("id", { ascending: true }).range(from, from + 999));
    out.push(...rows.map(toAdjustment));
    if (rows.length < 1000) return out;
  }
}

export type SalaryAdjustmentInput = Pick<SalaryAdjustment, "periodId" | "employeeId" | "component" | "amount" | "description">;

export async function insertSalaryAdjustment(input: SalaryAdjustmentInput, createdBy: string): Promise<SalaryAdjustment> {
  return toAdjustment(
    await run<Row>(
      table()
        .insert({ period_id: input.periodId, employee_id: input.employeeId, component: input.component, amount: input.amount, description: input.description.trim(), created_by: createdBy })
        .select()
        .single(),
    ),
  );
}

export async function updateSalaryAdjustmentRow(id: string, patch: Partial<Omit<SalaryAdjustmentInput, "periodId">>): Promise<SalaryAdjustment> {
  const row: Row = {};
  if (patch.employeeId !== undefined) row.employee_id = patch.employeeId;
  if (patch.component !== undefined) row.component = patch.component;
  if (patch.amount !== undefined) row.amount = patch.amount;
  if (patch.description !== undefined) row.description = patch.description.trim();
  return toAdjustment(await run<Row>(table().update(row).eq("id", id).select().single()));
}

export async function deleteSalaryAdjustmentRow(id: string): Promise<void> {
  const rows = await run<Row[]>(table().delete().eq("id", id).select("id"));
  if (!rows.length) throw new Error("That adjustment was already removed, or you don't have permission.");
}
