import { getSupabaseClient } from "./client";

// Department vouchers (supabase/migrate_phase18_department_vouchers.sql):
// one voucher per department per payroll period, with any number of payee
// lines. The typed client doesn't know these tables, so they're reached
// through a loosely-typed handle.

export interface DepartmentVoucher {
  id: string;
  periodId: string;
  departmentId: string;
  notes: string;
  createdBy: string;
  updatedAt: string;
}

export interface DepartmentVoucherLine {
  id: string;
  voucherId: string;
  employeeId: string | null;
  payeeName: string;
  description: string;
  amount: number;
  sortOrder: number;
}

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
const table = (name: string) => (getSupabaseClient() as unknown as { from: (t: string) => Query }).from(name);

async function run<T>(q: Query): Promise<T> {
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data as T;
}

const toVoucher = (r: Row): DepartmentVoucher => ({
  id: String(r.id),
  periodId: String(r.period_id),
  departmentId: String(r.department_id),
  notes: String(r.notes ?? ""),
  createdBy: String(r.created_by ?? ""),
  updatedAt: String(r.updated_at ?? ""),
});
const toLine = (r: Row): DepartmentVoucherLine => ({
  id: String(r.id),
  voucherId: String(r.voucher_id),
  employeeId: (r.employee_id as string | null) ?? null,
  payeeName: String(r.payee_name),
  description: String(r.description ?? ""),
  amount: Number(r.amount),
  sortOrder: Number(r.sort_order ?? 0),
});

async function fetchAll(name: string, orderBy: string[]): Promise<Row[]> {
  const out: Row[] = [];
  for (let from = 0; ; from += 1000) {
    let q = table(name).select("*");
    for (const col of orderBy) q = q.order(col, { ascending: true });
    const rows = await run<Row[]>(q.range(from, from + 999));
    out.push(...rows);
    if (rows.length < 1000) return out;
  }
}

export async function fetchDepartmentVouchers(): Promise<{ vouchers: DepartmentVoucher[]; lines: DepartmentVoucherLine[] }> {
  const [v, l] = await Promise.all([fetchAll("department_vouchers", ["id"]), fetchAll("department_voucher_lines", ["sort_order", "created_at", "id"])]);
  return { vouchers: v.map(toVoucher), lines: l.map(toLine) };
}

// Creates the department's voucher for the period on first use.
export async function ensureDepartmentVoucher(periodId: string, departmentId: string, createdBy: string): Promise<DepartmentVoucher> {
  const existing = await run<Row[]>(table("department_vouchers").select("*").eq("period_id", periodId).eq("department_id", departmentId));
  if (existing.length) return toVoucher(existing[0]);
  return toVoucher(await run<Row>(table("department_vouchers").insert({ period_id: periodId, department_id: departmentId, created_by: createdBy }).select().single()));
}

export async function addVoucherLine(voucherId: string, line: Omit<DepartmentVoucherLine, "id" | "voucherId">): Promise<DepartmentVoucherLine> {
  const row = await run<Row>(
    table("department_voucher_lines")
      .insert({ voucher_id: voucherId, employee_id: line.employeeId, payee_name: line.payeeName.trim(), description: line.description.trim(), amount: line.amount, sort_order: line.sortOrder })
      .select()
      .single(),
  );
  await run(table("department_vouchers").update({ updated_at: new Date().toISOString() }).eq("id", voucherId));
  return toLine(row);
}

export async function updateVoucherLine(id: string, patch: Partial<Pick<DepartmentVoucherLine, "employeeId" | "payeeName" | "description" | "amount">>): Promise<DepartmentVoucherLine> {
  const row: Row = {};
  if (patch.employeeId !== undefined) row.employee_id = patch.employeeId;
  if (patch.payeeName !== undefined) row.payee_name = patch.payeeName.trim();
  if (patch.description !== undefined) row.description = patch.description.trim();
  if (patch.amount !== undefined) row.amount = patch.amount;
  return toLine(await run<Row>(table("department_voucher_lines").update(row).eq("id", id).select().single()));
}

export async function deleteVoucherLine(id: string): Promise<void> {
  const rows = await run<Row[]>(table("department_voucher_lines").delete().eq("id", id).select("id"));
  if (!rows.length) throw new Error("That line was already removed, or you don't have permission.");
}
