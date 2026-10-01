import { getSupabaseClient } from "./client";
import type { HeadDays, LeaveCategory, LeaveCredits, LeaveForm } from "../leave-form";

// supabase/migrate_phase27_leave_forms.sql. The typed client doesn't know
// these tables / functions, so they're reached through a loosely-typed handle.

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
const bucket = () => getSupabaseClient().storage.from("leave-forms");

const SETUP = "The online leave form isn't set up yet — ask HR to run the latest database update.";
const friendly = (msg: string) => (/leave_forms|leave_form_|my_leave_form|leave-forms|bucket not found/i.test(msg) && /exist|find|not found/i.test(msg) ? SETUP : msg);

const toForm = (r: Row): LeaveForm => ({
  leaveRequestId: String(r.leave_request_id),
  employeeId: String(r.employee_id),
  applicationDate: String(r.application_date),
  category: r.category as LeaveCategory,
  sickPlace: (r.sick_place as LeaveForm["sickPlace"]) ?? null,
  sickDetails: String(r.sick_details ?? ""),
  reason: String(r.reason ?? ""),
  credits: (r.credits as LeaveCredits) ?? { asOf: "", vl: 0, sl: 0, lessVl: 0, lessSl: 0 },
  employeeName: String(r.employee_name ?? ""),
  designation: String(r.designation ?? ""),
  branch: String(r.branch ?? ""),
  department: String(r.department ?? ""),
  departmentHeadId: (r.department_head_id as string | null) ?? null,
  departmentHead: String(r.department_head ?? ""),
  submittedAt: String(r.submitted_at ?? ""),
  headDays: (r.head_days as HeadDays | null) ?? null,
  headDecision: (r.head_decision as LeaveForm["headDecision"]) ?? null,
  headReason: (r.head_reason as string | null) ?? null,
  headSignedBy: (r.head_signed_by as string | null) ?? null,
  headSignedName: (r.head_signed_name as string | null) ?? null,
  headSignedAt: (r.head_signed_at as string | null) ?? null,
  receivedBy: (r.received_by as string | null) ?? null,
  receivedName: (r.received_name as string | null) ?? null,
  receivedAt: (r.received_at as string | null) ?? null,
});

// Every form the signed-in user may see. Throws the set-up message if the
// table is missing.
export async function fetchLeaveForms(): Promise<LeaveForm[]> {
  const out: LeaveForm[] = [];
  for (let i = 0; ; i += 1000) {
    const { data, error } = await client().from("leave_forms").select("*").order("submitted_at", { ascending: false }).order("leave_request_id").range(i, i + 999);
    if (error) throw new Error(friendly(error.message));
    const rows = data as Row[];
    out.push(...rows.map(toForm));
    if (rows.length < 1000) return out;
  }
}

// The signed-in employee's designation, branch, department and department head.
export async function fetchMyLeaveFormDetails(): Promise<{ designation: string; branch: string; department: string; departmentHead: string } | null> {
  const { data, error } = await client().rpc("my_leave_form_details");
  if (error) throw new Error(friendly(error.message));
  const r = (data as Row[] | null)?.[0];
  return r ? { designation: String(r.designation ?? ""), branch: String(r.branch ?? ""), department: String(r.department ?? ""), departmentHead: String(r.department_head ?? "") } : null;
}

// ---- Own signature -------------------------------------------------------------

const ownPath = (employeeId: string) => `signatures/${employeeId}.png`;

// A viewing link for the user's saved signature, or null if none.
export async function mySignatureUrl(employeeId: string): Promise<string | null> {
  const { data: list } = await bucket().list("signatures", { search: `${employeeId}.png`, limit: 5 });
  const file = list?.find((f) => f.name === `${employeeId}.png`);
  if (!file) return null;
  const { data } = await bucket().createSignedUrl(ownPath(employeeId), 3600);
  return data?.signedUrl ? `${data.signedUrl}&v=${encodeURIComponent(file.updated_at ?? "")}` : null;
}

export async function saveMySignature(employeeId: string, png: Blob): Promise<void> {
  const { error } = await bucket().upload(ownPath(employeeId), png, { upsert: true, contentType: "image/png" });
  if (error) throw new Error(friendly(error.message));
}

// ---- Signing a form ------------------------------------------------------------

export type LeaveFormSigner = "applicant" | "head" | "hr";

// Puts a copy of the user's saved signature at `path` (a form's signature)
// in the same bucket.
export async function placeMySignature(employeeId: string, path: string): Promise<void> {
  const { data: own, error: dlErr } = await bucket().download(ownPath(employeeId));
  if (dlErr || !own) throw new Error("Upload your signature first.");
  const { error } = await bucket().upload(path, own, { upsert: true, contentType: "image/png" });
  if (error) throw new Error(/row-level security/i.test(error.message) ? "You can't sign this part of the form." : friendly(error.message));
}

export async function signLeaveForm(leaveRequestId: string, employeeId: string, as: LeaveFormSigner): Promise<void> {
  await placeMySignature(employeeId, `forms/${leaveRequestId}/${as}.png`);
}

// Viewing links for the signatures in a folder of the bucket
// (forms/<id> or ot/<id>), by signer.
export async function signatureUrlsIn(folder: string): Promise<Partial<Record<LeaveFormSigner, string>>> {
  const { data: list } = await bucket().list(folder, { limit: 10 });
  const out: Partial<Record<LeaveFormSigner, string>> = {};
  for (const f of list ?? []) {
    const as = f.name.replace(/\.png$/, "") as LeaveFormSigner;
    if (!["applicant", "head", "hr"].includes(as)) continue;
    const { data } = await bucket().createSignedUrl(`${folder}/${f.name}`, 3600);
    if (data?.signedUrl) out[as] = `${data.signedUrl}&v=${encodeURIComponent(f.updated_at ?? "")}`;
  }
  return out;
}

export async function submitLeaveForm(input: {
  leaveRequestId: string;
  employeeId: string;
  applicationDate: string;
  category: LeaveCategory;
  sickPlace: "hospital" | "out_patient" | null;
  sickDetails: string;
  reason: string;
  credits: LeaveCredits;
}): Promise<void> {
  const { error } = await client().from("leave_forms").insert({
    leave_request_id: input.leaveRequestId,
    employee_id: input.employeeId,
    application_date: input.applicationDate,
    category: input.category,
    sick_place: input.sickPlace,
    sick_details: input.sickDetails.trim(),
    reason: input.reason.trim(),
    credits: input.credits,
  });
  // Already submitted (a retry after a dropped connection): nothing to do.
  if (error && /duplicate key|already exists/i.test(error.message)) return;
  if (error) throw new Error(/row-level security/i.test(error.message) ? "Couldn't submit the form — sign it first." : friendly(error.message));
}

// Whether the form for this request was already submitted.
export async function leaveFormExists(leaveRequestId: string): Promise<boolean> {
  const { data, error } = await client().from("leave_forms").select("leave_request_id").eq("leave_request_id", leaveRequestId);
  if (error) throw new Error(friendly(error.message));
  return ((data as Row[] | null) ?? []).length > 0;
}

export async function decideLeaveForm(leaveRequestId: string, decision: "approved" | "disapproved", reason: string, days: HeadDays): Promise<void> {
  const { error } = await client().rpc("leave_form_decide", { p_request: leaveRequestId, p_decision: decision, p_reason: reason, p_days: days });
  if (error) throw new Error(friendly(error.message));
}

export async function receiveLeaveForm(leaveRequestId: string): Promise<void> {
  const { error } = await client().rpc("leave_form_receive", { p_request: leaveRequestId });
  if (error) throw new Error(friendly(error.message));
}

// Viewing links for the signatures on a form.
export function leaveFormSignatureUrls(leaveRequestId: string): Promise<Partial<Record<LeaveFormSigner, string>>> {
  return signatureUrlsIn(`forms/${leaveRequestId}`);
}
