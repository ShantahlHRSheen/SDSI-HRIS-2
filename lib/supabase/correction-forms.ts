import { getSupabaseClient } from "./client";
import { branchFromRow } from "../branch-approval";
import type { CorrectionForm, CorrectionType } from "../correction-form";
import { placeMySignature, signatureUrlsIn, type LeaveFormSigner } from "./leave-forms";

// supabase/migrate_phase36_correction_forms.sql. The typed client doesn't
// know this table / these functions, so they're reached through a
// loosely-typed handle. Signatures share the leave form's bucket and saved
// signature.

type Row = Record<string, unknown>;
type Query = PromiseLike<{ data: unknown; error: { message: string } | null }> & {
  select: (c?: string) => Query;
  insert: (v: Row) => Query;
  eq: (c: string, v: string) => Query;
  order: (c: string, o?: { ascending: boolean }) => Query;
  range: (from: number, to: number) => Query;
};
type Client = {
  from: (t: string) => Query;
  rpc: (fn: string, args?: Row) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
};
const client = () => getSupabaseClient() as unknown as Client;

const SETUP = "The online attendance correction form isn't set up yet — ask HR to run the latest database update.";
const friendly = (msg: string) => (/correction_form/i.test(msg) && /exist|find|not found|schema cache/i.test(msg) ? SETUP : msg);

const toForm = (r: Row): CorrectionForm => ({
  correctionRequestId: String(r.correction_request_id),
  employeeId: String(r.employee_id),
  correctionDate: String(r.correction_date),
  correctionType: r.correction_type as CorrectionType,
  timeIn: (r.time_in as string | null) ?? null,
  timeOut: (r.time_out as string | null) ?? null,
  reason: String(r.reason ?? ""),
  employeeName: String(r.employee_name ?? ""),
  position: String(r.position ?? ""),
  branch: String(r.branch ?? ""),
  department: String(r.department ?? ""),
  departmentHeadId: (r.department_head_id as string | null) ?? null,
  departmentHead: String(r.department_head ?? ""),
  submittedAt: String(r.submitted_at ?? ""),
  ...branchFromRow(r),
  headDecision: (r.head_decision as CorrectionForm["headDecision"]) ?? null,
  headReason: (r.head_reason as string | null) ?? null,
  headSignedName: (r.head_signed_name as string | null) ?? null,
  headSignedAt: (r.head_signed_at as string | null) ?? null,
  receivedName: (r.received_name as string | null) ?? null,
  receivedAt: (r.received_at as string | null) ?? null,
  editedAt: (r.edited_at as string | null) ?? null,
  editCount: Number(r.edit_count ?? 0),
  editHistory: Array.isArray(r.edit_history) ? (r.edit_history as CorrectionForm["editHistory"]) : [],
});

export async function fetchCorrectionForms(): Promise<CorrectionForm[]> {
  const out: CorrectionForm[] = [];
  for (let i = 0; ; i += 1000) {
    const { data, error } = await client().from("correction_forms").select("*").order("submitted_at", { ascending: false }).order("correction_request_id").range(i, i + 999);
    if (error) throw new Error(friendly(error.message));
    const rows = data as Row[];
    out.push(...rows.map(toForm));
    if (rows.length < 1000) return out;
  }
}

export async function correctionFormExists(requestId: string): Promise<boolean> {
  const { data, error } = await client().from("correction_forms").select("correction_request_id").eq("correction_request_id", requestId);
  if (error) throw new Error(friendly(error.message));
  return ((data as Row[] | null) ?? []).length > 0;
}

export function signCorrectionForm(requestId: string, employeeId: string, as: LeaveFormSigner): Promise<void> {
  return placeMySignature(employeeId, `corr/${requestId}/${as}.png`);
}

export function correctionFormSignatureUrls(requestId: string) {
  return signatureUrlsIn(`corr/${requestId}`);
}

export interface CorrectionFormInput {
  date: string;
  type: CorrectionType;
  timeIn: string;
  timeOut: string;
  reason: string;
}

export async function submitCorrectionForm(requestId: string, employeeId: string, input: CorrectionFormInput): Promise<void> {
  const { error } = await client().from("correction_forms").insert({
    correction_request_id: requestId,
    employee_id: employeeId,
    correction_date: input.date,
    correction_type: input.type,
    time_in: input.timeIn || null,
    time_out: input.timeOut || null,
    reason: input.reason.trim(),
  });
  // Already submitted (a retry after a dropped connection): nothing to do.
  if (error && /duplicate key|already exists/i.test(error.message)) return;
  if (error) throw new Error(/row-level security/i.test(error.message) ? "Couldn't submit the form — sign it first." : friendly(error.message));
}

// The employee changes their form before the Department Head signs it
// (supabase/migrate_phase67_correction_form_edit.sql).
export async function editCorrectionForm(requestId: string, input: CorrectionFormInput): Promise<void> {
  const { error } = await client().rpc("correction_form_edit", {
    p_request: requestId,
    p_date: input.date,
    p_type: input.type,
    p_time_in: input.timeIn || null,
    p_time_out: input.timeOut || null,
    p_reason: input.reason,
  });
  if (error) throw new Error(/correction_form_edit/.test(error.message) && /find|exist|schema/.test(error.message) ? "Editing isn't set up yet — ask HR to run the latest database update." : friendly(error.message));
}

export async function decideCorrectionForm(requestId: string, decision: "approved" | "disapproved", reason: string): Promise<void> {
  const { error } = await client().rpc("correction_form_decide", { p_request: requestId, p_decision: decision, p_reason: reason });
  if (error) throw new Error(friendly(error.message));
}

export async function receiveCorrectionForm(requestId: string): Promise<void> {
  const { error } = await client().rpc("correction_form_receive", { p_request: requestId });
  if (error) throw new Error(friendly(error.message));
}
