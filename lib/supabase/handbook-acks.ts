import { getSupabaseClient } from "./client";
import { placeMySignature } from "./leave-forms";

// The Employee Handbook Acknowledgment Form
// (supabase/migrate_phase35_handbook_acknowledgments.sql). The typed client
// doesn't know these tables, so they're reached through a loosely-typed handle.

type Row = Record<string, unknown>;
type Result = PromiseLike<{ data: unknown; error: { message: string } | null }>;
type Query = Result & {
  select: (c?: string) => Query;
  insert: (v: Row) => Query;
  upsert: (v: Row) => Query;
  delete: () => Query;
  eq: (c: string, v: string | number) => Query;
  order: (c: string, o?: { ascending: boolean }) => Query;
  range: (from: number, to: number) => Query;
};
type Client = { from: (t: string) => Query; rpc: (fn: string, args?: Row) => Result };
const client = () => getSupabaseClient() as unknown as Client;
const bucket = () => getSupabaseClient().storage.from("leave-forms");

const SETUP = "The acknowledgment form isn't set up yet — ask HR to run the latest database update.";
const friendly = (msg: string) => (/handbook_|leave-forms|bucket not found/i.test(msg) && /exist|find|not found|schema cache/i.test(msg) ? SETUP : msg);

export interface HandbookInfo {
  version: string;
  effectiveDate: string | null;
}

export type HandbookLanguage = "english" | "explained";

export interface HandbookAck {
  id: string;
  employeeId: string;
  handbookVersion: string;
  handbookEffective: string | null;
  language: HandbookLanguage;
  explainedLanguage: string;
  employeeName: string;
  employeeNumber: string;
  position: string;
  departmentBranch: string;
  accessedAt: string | null;
  signedAt: string;
  hrVerified: boolean | null;
  hrLogRef: string | null;
  receivedName: string | null;
  receivedPosition: string | null;
  receivedAt: string | null;
}

const toAck = (r: Row): HandbookAck => ({
  id: String(r.id),
  employeeId: String(r.employee_id),
  handbookVersion: String(r.handbook_version ?? ""),
  handbookEffective: (r.handbook_effective as string | null) ?? null,
  language: r.language as HandbookLanguage,
  explainedLanguage: String(r.explained_language ?? ""),
  employeeName: String(r.employee_name ?? ""),
  employeeNumber: String(r.employee_number ?? ""),
  position: String(r.position ?? ""),
  departmentBranch: String(r.department_branch ?? ""),
  accessedAt: (r.accessed_at as string | null) ?? null,
  signedAt: String(r.signed_at ?? ""),
  hrVerified: (r.hr_verified as boolean | null) ?? null,
  hrLogRef: (r.hr_log_ref as string | null) ?? null,
  receivedName: (r.received_name as string | null) ?? null,
  receivedPosition: (r.received_position as string | null) ?? null,
  receivedAt: (r.received_at as string | null) ?? null,
});

// The handbook's version and effective date (blank until HR sets them).
export async function fetchHandbookInfo(): Promise<HandbookInfo> {
  const { data, error } = await client().from("handbook_info").select("*").eq("id", 1);
  if (error) throw new Error(friendly(error.message));
  const r = (data as Row[])[0];
  return { version: String(r?.version ?? ""), effectiveDate: (r?.effective_date as string | null) ?? null };
}

export async function saveHandbookInfo(info: HandbookInfo, by: string): Promise<void> {
  const { error } = await client()
    .from("handbook_info")
    .upsert({ id: 1, version: info.version.trim(), effective_date: info.effectiveDate || null, updated_by: by, updated_at: new Date().toISOString() });
  if (error) throw new Error(/row-level security/i.test(error.message) ? "Only the HR Manager can change this." : friendly(error.message));
}

// Records that the signed-in employee opened or downloaded the handbook.
export async function recordHandbookDownload(employeeId: string): Promise<void> {
  const { error } = await client().from("handbook_downloads").insert({ employee_id: employeeId });
  if (error) throw new Error(friendly(error.message));
}

// First download per employee, for each handbook version: `${employeeId}|${version}` → time.
export async function fetchFirstDownloads(): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (let i = 0; ; i += 1000) {
    const { data, error } = await client().from("handbook_downloads").select("employee_id,handbook_version,downloaded_at").order("downloaded_at").order("id").range(i, i + 999);
    if (error) throw new Error(friendly(error.message));
    const rows = data as Row[];
    for (const r of rows) {
      const key = `${r.employee_id}|${r.handbook_version ?? ""}`;
      if (!out.has(key)) out.set(key, String(r.downloaded_at));
    }
    if (rows.length < 1000) return out;
  }
}

// Every form the signed-in user may see (their own, or everyone's for HR
// and upper management), newest first.
export async function fetchHandbookAcks(): Promise<HandbookAck[]> {
  const out: HandbookAck[] = [];
  for (let i = 0; ; i += 1000) {
    const { data, error } = await client().from("handbook_acknowledgments").select("*").order("signed_at", { ascending: false }).order("id").range(i, i + 999);
    if (error) throw new Error(friendly(error.message));
    const rows = data as Row[];
    out.push(...rows.map(toAck));
    if (rows.length < 1000) return out;
  }
}

const folder = (a: { employeeId: string; id: string }) => `handbook/${a.employeeId}/${a.id}`;

// Signs (with the saved signature) and submits the employee's form.
export async function submitHandbookAck(employeeId: string, language: HandbookLanguage, explainedLanguage: string): Promise<void> {
  const id = crypto.randomUUID();
  await placeMySignature(employeeId, `${folder({ employeeId, id })}/employee.png`);
  const { error } = await client().from("handbook_acknowledgments").insert({ id, employee_id: employeeId, language, explained_language: language === "explained" ? explainedLanguage.trim() : "" });
  if (error) {
    if (/duplicate key|already exists/i.test(error.message)) throw new Error("You've already signed the acknowledgment for this version of the handbook.");
    throw new Error(friendly(error.message));
  }
}

// The HR Manager verifies the download record and signs the form as received.
export async function receiveHandbookAck(ack: HandbookAck, hrEmployeeId: string, verified: boolean, logRef: string): Promise<void> {
  await placeMySignature(hrEmployeeId, `${folder(ack)}/hr.png`);
  const { error } = await client().rpc("handbook_ack_receive", { p_id: ack.id, p_verified: verified, p_log_ref: logRef.trim() });
  if (error) throw new Error(friendly(error.message));
}

export async function deleteHandbookAck(id: string): Promise<void> {
  const { data, error } = await client().from("handbook_acknowledgments").delete().eq("id", id).select("id");
  if (error) throw new Error(friendly(error.message));
  if (!(data as Row[]).length) throw new Error("Only the HR Manager can remove an acknowledgment form.");
}

// Viewing links for a form's signatures.
export async function handbookAckSignatures(ack: HandbookAck): Promise<{ employee?: string; hr?: string }> {
  const { data: list } = await bucket().list(folder(ack), { limit: 10 });
  const out: { employee?: string; hr?: string } = {};
  for (const f of list ?? []) {
    const as = f.name.replace(/\.png$/, "");
    if (as !== "employee" && as !== "hr") continue;
    const { data } = await bucket().createSignedUrl(`${folder(ack)}/${f.name}`, 3600);
    if (data?.signedUrl) out[as] = `${data.signedUrl}&v=${encodeURIComponent(f.updated_at ?? "")}`;
  }
  return out;
}
