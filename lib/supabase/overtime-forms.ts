import { getSupabaseClient } from "./client";
import type { OvertimeForm } from "../overtime-form";
import { placeMySignature, signatureUrlsIn, type LeaveFormSigner } from "./leave-forms";

// supabase/migrate_phase28_overtime_forms.sql. The typed client doesn't know
// this table / these functions, so they're reached through a loosely-typed
// handle. Signatures share the leave form's bucket and saved signature.

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

const SETUP = "The online overtime form isn't set up yet — ask HR to run the latest database update.";
const friendly = (msg: string) => (/overtime_form/i.test(msg) && /exist|find|not found/i.test(msg) ? SETUP : msg);
const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

const toForm = (r: Row): OvertimeForm => ({
  overtimeRequestId: String(r.overtime_request_id),
  employeeId: String(r.employee_id),
  schedule: String(r.schedule ?? ""),
  otDate: String(r.ot_date),
  hoursRequested: Number(r.hours_requested),
  tasks: String(r.tasks ?? ""),
  reason: String(r.reason ?? ""),
  employeeName: String(r.employee_name ?? ""),
  position: String(r.position ?? ""),
  branch: String(r.branch ?? ""),
  department: String(r.department ?? ""),
  departmentHeadId: (r.department_head_id as string | null) ?? null,
  departmentHead: String(r.department_head ?? ""),
  submittedAt: String(r.submitted_at ?? ""),
  resubmissions: Number(r.resubmissions ?? 0),
  headDecision: (r.head_decision as OvertimeForm["headDecision"]) ?? null,
  headHours: num(r.head_hours),
  headReason: (r.head_reason as string | null) ?? null,
  headSignedName: (r.head_signed_name as string | null) ?? null,
  headSignedAt: (r.head_signed_at as string | null) ?? null,
  hrDecision: (r.hr_decision as OvertimeForm["hrDecision"]) ?? null,
  hrReason: (r.hr_reason as string | null) ?? null,
  hrSignedName: (r.hr_signed_name as string | null) ?? null,
  hrSignedAt: (r.hr_signed_at as string | null) ?? null,
});

export async function fetchOvertimeForms(): Promise<OvertimeForm[]> {
  const out: OvertimeForm[] = [];
  for (let i = 0; ; i += 1000) {
    const { data, error } = await client().from("overtime_forms").select("*").order("submitted_at", { ascending: false }).order("overtime_request_id").range(i, i + 999);
    if (error) throw new Error(friendly(error.message));
    const rows = data as Row[];
    out.push(...rows.map(toForm));
    if (rows.length < 1000) return out;
  }
}

export async function overtimeFormExists(overtimeRequestId: string): Promise<boolean> {
  const { data, error } = await client().from("overtime_forms").select("overtime_request_id").eq("overtime_request_id", overtimeRequestId);
  if (error) throw new Error(friendly(error.message));
  return ((data as Row[] | null) ?? []).length > 0;
}

export function signOvertimeForm(overtimeRequestId: string, employeeId: string, as: LeaveFormSigner): Promise<void> {
  return placeMySignature(employeeId, `ot/${overtimeRequestId}/${as}.png`);
}

export function overtimeFormSignatureUrls(overtimeRequestId: string) {
  return signatureUrlsIn(`ot/${overtimeRequestId}`);
}

export interface OvertimeFormInput {
  schedule: string;
  otDate: string;
  hours: number;
  tasks: string;
  reason: string;
}

export async function submitOvertimeForm(overtimeRequestId: string, employeeId: string, input: OvertimeFormInput): Promise<void> {
  const { error } = await client().from("overtime_forms").insert({
    overtime_request_id: overtimeRequestId,
    employee_id: employeeId,
    schedule: input.schedule.trim(),
    ot_date: input.otDate,
    hours_requested: input.hours,
    tasks: input.tasks.trim(),
    reason: input.reason.trim(),
  });
  // Already submitted (a retry after a dropped connection): nothing to do.
  if (error && /duplicate key|already exists/i.test(error.message)) return;
  if (error) throw new Error(/row-level security/i.test(error.message) ? "Couldn't submit the form — sign it first." : friendly(error.message));
}

export async function resubmitOvertimeForm(overtimeRequestId: string, input: OvertimeFormInput): Promise<void> {
  const { error } = await client().rpc("overtime_form_resubmit", {
    p_request: overtimeRequestId,
    p_schedule: input.schedule.trim(),
    p_date: input.otDate,
    p_hours: input.hours,
    p_tasks: input.tasks,
    p_reason: input.reason,
  });
  if (error) throw new Error(friendly(error.message));
}

export async function decideOvertimeForm(overtimeRequestId: string, decision: "approved" | "disapproved", hours: number | null, reason: string): Promise<void> {
  const { error } = await client().rpc("overtime_form_decide", { p_request: overtimeRequestId, p_decision: decision, p_hours: hours, p_reason: reason });
  if (error) throw new Error(friendly(error.message));
}

export async function hrDecideOvertimeForm(overtimeRequestId: string, decision: "verified" | "disapproved" | "returned", reason: string): Promise<void> {
  const { error } = await client().rpc("overtime_form_hr", { p_request: overtimeRequestId, p_decision: decision, p_reason: reason });
  if (error) throw new Error(friendly(error.message));
}
