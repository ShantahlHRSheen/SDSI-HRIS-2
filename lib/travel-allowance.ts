import { getSupabaseClient } from "./supabase/client";
import { placeMySignature, type LeaveFormSigner } from "./supabase/leave-forms";

// Travel Allowance Request (supabase/migrate_phase41_travel_allowance.sql):
// the employee files the driver, date, destination and whether there's an
// allowance (₱500) and signs → their supervisor approves → HR receives.

export const TRAVEL_ALLOWANCE_AMOUNT = 500;

export interface TravelAllowance {
  id: string;
  employeeId: string;
  travelDate: string;
  driverName: string;
  driverEmployeeId: string | null;
  destination: string;
  withAllowance: boolean;
  amount: number;
  employeeName: string;
  position: string;
  department: string;
  branch: string;
  approverId: string | null;
  approverName: string;
  submittedAt: string;
  headDecision: "approved" | "disapproved" | null;
  headReason: string | null;
  headSignedName: string | null;
  headSignedAt: string | null;
  receivedName: string | null;
  receivedAt: string | null;
}

export type TravelStage = "waiting_head" | "waiting_hr" | "received";

export const travelStage = (t: TravelAllowance): TravelStage => (t.receivedAt ? "received" : t.headDecision ? "waiting_hr" : "waiting_head");

export function travelProgress(t: TravelAllowance): { label: string; tone: "warning" | "good" | "critical" | "info" } {
  const decision = t.headDecision === "approved" ? "Approved" : "Disapproved";
  if (t.receivedAt) return { label: `${decision} · Received by HR`, tone: t.headDecision === "approved" ? "good" : "critical" };
  if (t.headDecision) return { label: `${decision} · Waiting for HR`, tone: t.headDecision === "approved" ? "info" : "critical" };
  return { label: `Waiting for approval${t.approverName ? ` (${t.approverName})` : ""}`, tone: "warning" };
}

export function canApproveTravel(t: TravelAllowance, me: string | undefined, isHrManager: boolean): boolean {
  if (!me || t.employeeId === me || t.headDecision) return false;
  return t.approverId ? t.approverId === me : isHrManager;
}

// ---- Data ---------------------------------------------------------------------

type Row = Record<string, unknown>;
type Query = PromiseLike<{ data: unknown; error: { message: string } | null }> & {
  select: (c?: string) => Query;
  insert: (v: Row) => Query;
  delete: () => Query;
  eq: (c: string, v: string) => Query;
  order: (c: string, o?: { ascending: boolean }) => Query;
  range: (from: number, to: number) => Query;
};
type Client = { from: (t: string) => Query; rpc: (fn: string, a?: Row) => PromiseLike<{ error: { message: string } | null }> };
const client = () => getSupabaseClient() as unknown as Client;
const bucket = () => getSupabaseClient().storage.from("leave-forms");

const SETUP = "Travel allowance requests aren't set up yet — ask HR to run the latest database update.";
const friendly = (msg: string) => (/travel_allowance/i.test(msg) && /exist|find|not found|schema cache/i.test(msg) ? SETUP : msg);

const toTravel = (r: Row): TravelAllowance => ({
  id: String(r.id),
  employeeId: String(r.employee_id),
  travelDate: String(r.travel_date),
  driverName: String(r.driver_name ?? ""),
  driverEmployeeId: (r.driver_employee_id as string | null) ?? null,
  destination: String(r.destination ?? ""),
  withAllowance: !!r.with_allowance,
  amount: Number(r.amount ?? 0),
  employeeName: String(r.employee_name ?? ""),
  position: String(r.position ?? ""),
  department: String(r.department ?? ""),
  branch: String(r.branch ?? ""),
  approverId: (r.approver_id as string | null) ?? null,
  approverName: String(r.approver_name ?? ""),
  submittedAt: String(r.submitted_at ?? ""),
  headDecision: (r.head_decision as TravelAllowance["headDecision"]) ?? null,
  headReason: (r.head_reason as string | null) ?? null,
  headSignedName: (r.head_signed_name as string | null) ?? null,
  headSignedAt: (r.head_signed_at as string | null) ?? null,
  receivedName: (r.received_name as string | null) ?? null,
  receivedAt: (r.received_at as string | null) ?? null,
});

export async function fetchTravelAllowances(): Promise<TravelAllowance[]> {
  const out: TravelAllowance[] = [];
  for (let i = 0; ; i += 1000) {
    const { data, error } = await client().from("travel_allowance_requests").select("*").order("submitted_at", { ascending: false }).order("id").range(i, i + 999);
    if (error) throw new Error(friendly(error.message));
    const rows = data as Row[];
    out.push(...rows.map(toTravel));
    if (rows.length < 1000) return out;
  }
}

const folder = (t: { employeeId: string; id: string }) => `travel/${t.employeeId}/${t.id}`;

export interface TravelInput {
  travelDate: string;
  driverName: string;
  driverEmployeeId: string | null;
  destination: string;
  withAllowance: boolean;
}

// Signs (with the saved signature) and files the request.
export async function fileTravelAllowance(employeeId: string, input: TravelInput): Promise<void> {
  const id = crypto.randomUUID();
  await placeMySignature(employeeId, `${folder({ employeeId, id })}/applicant.png`);
  const { error } = await client().from("travel_allowance_requests").insert({
    id,
    employee_id: employeeId,
    travel_date: input.travelDate,
    driver_name: input.driverName.trim(),
    driver_employee_id: input.driverEmployeeId,
    destination: input.destination.trim(),
    with_allowance: input.withAllowance,
  });
  if (error) throw new Error(/row-level security/i.test(error.message) ? "Couldn't file the request — sign it first." : friendly(error.message));
}

export async function decideTravelAllowance(t: TravelAllowance, me: string, decision: "approved" | "disapproved", reason: string): Promise<void> {
  await placeMySignature(me, `${folder(t)}/head.png`);
  const { error } = await client().rpc("travel_allowance_decide", { p_id: t.id, p_decision: decision, p_reason: reason });
  if (error) throw new Error(friendly(error.message));
}

export async function receiveTravelAllowance(t: TravelAllowance, me: string): Promise<void> {
  await placeMySignature(me, `${folder(t)}/hr.png`);
  const { error } = await client().rpc("travel_allowance_receive", { p_id: t.id });
  if (error) throw new Error(friendly(error.message));
}

// HR Manager only: removes the signatures, then the request.
export async function deleteTravelAllowance(t: TravelAllowance): Promise<void> {
  await bucket()
    .remove(["applicant", "head", "hr"].map((n) => `${folder(t)}/${n}.png`))
    .catch(() => {});
  const { data, error } = await client().from("travel_allowance_requests").delete().eq("id", t.id).select("id");
  if (error) throw new Error(friendly(error.message));
  if (!(data as Row[]).length) throw new Error("Only the HR Manager can delete travel allowance requests.");
}

export async function travelSignatureUrls(t: TravelAllowance): Promise<Partial<Record<LeaveFormSigner, string>>> {
  const { data: list } = await bucket().list(folder(t), { limit: 10 });
  const out: Partial<Record<LeaveFormSigner, string>> = {};
  for (const f of list ?? []) {
    const as = f.name.replace(/\.png$/, "") as LeaveFormSigner;
    if (!["applicant", "head", "hr"].includes(as)) continue;
    const { data } = await bucket().createSignedUrl(`${folder(t)}/${f.name}`, 3600);
    if (data?.signedUrl) out[as] = `${data.signedUrl}&v=${encodeURIComponent(f.updated_at ?? "")}`;
  }
  return out;
}
