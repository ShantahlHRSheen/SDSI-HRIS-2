import { getSupabaseClient } from "./supabase/client";

// Notes on a payroll cut-off (supabase/migrate_phase70_payroll_notes.sql),
// e.g. "Nov 15: reimburse Karlou Japitan's SSS loan". Keyed by the cut-off's
// end date, so a note can be left for a cut-off not set up yet.

export interface PayrollNote {
  id: string;
  cutoffEnd: string; // YYYY-MM-DD
  employeeId: string | null; // null: the whole payroll
  note: string;
  createdByName: string;
  createdAt: string;
  doneAt: string | null;
  doneByName: string | null;
}

type Row = Record<string, unknown>;
type Query = PromiseLike<{ data: unknown; error: { message: string } | null }> & {
  select: (c?: string) => Query;
  insert: (v: Row) => Query;
  update: (v: Row) => Query;
  delete: () => Query;
  eq: (c: string, v: string) => Query;
  order: (c: string, o?: { ascending: boolean }) => Query;
};
const table = () => (getSupabaseClient() as unknown as { from: (t: string) => Query }).from("payroll_notes");

// The table isn't there (not set up, or a company without it): no notes.
export const NOTES_MISSING = "payroll-notes-missing";
const check = (error: { message: string } | null) => {
  if (!error) return;
  if (/payroll_notes/.test(error.message) && /exist|find|schema cache/i.test(error.message)) throw new Error(NOTES_MISSING);
  throw new Error(error.message);
};

export async function fetchPayrollNotes(): Promise<PayrollNote[]> {
  const { data, error } = await table().select("*").order("created_at");
  check(error);
  return (data as Row[]).map((r) => ({
    id: String(r.id),
    cutoffEnd: String(r.cutoff_end),
    employeeId: (r.employee_id as string | null) ?? null,
    note: String(r.note ?? ""),
    createdByName: String(r.created_by_name ?? ""),
    createdAt: String(r.created_at ?? ""),
    doneAt: (r.done_at as string | null) ?? null,
    doneByName: (r.done_by_name as string | null) ?? null,
  }));
}

export async function addPayrollNote(cutoffEnd: string, employeeId: string | null, note: string): Promise<void> {
  const { error } = await table().insert({ cutoff_end: cutoffEnd, employee_id: employeeId, note: note.trim() });
  check(error);
}

export async function setPayrollNoteDone(id: string, done: boolean): Promise<void> {
  const { error } = await table().update({ done_at: done ? new Date().toISOString() : null }).eq("id", id);
  check(error);
}

export async function deletePayrollNote(id: string): Promise<void> {
  const { error } = await table().delete().eq("id", id);
  check(error);
}

// The semi-monthly cut-offs (15th and month end) from `from`, for notes on
// cut-offs not set up yet.
export function upcomingCutoffs(from: string, count = 6): string[] {
  const out: string[] = [];
  let y = Number(from.slice(0, 4));
  let m = Number(from.slice(5, 7));
  while (out.length < count) {
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    for (const d of [15, last]) {
      const iso = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      if (iso >= from && out.length < count) out.push(iso);
    }
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}
