import { getSupabaseClient } from "./supabase/client";
import { placeMySignature } from "./supabase/leave-forms";
import type { Employee } from "./types";

// Regularization (supabase/migrate_phase69_regularization.sql): the Regular
// Contract of Employment and the Notice of Regularization and Salary
// Adjustment. HR prepares both and signs the notice; the Chairman signs the
// contract for the employer; the employee receives them (signs the contract
// and the notice's conforme).

export type RegStatus = "hr" | "chairman" | "employee" | "done";

export interface RegLine {
  label: string;
  amount: number;
}

// What's printed on the contract and the notice.
export interface RegData {
  employeeName: string; // "ANGELA ACOSTA"
  salutation: string; // "Ms. Acosta"
  female: boolean; // her / his
  civilStatus: string;
  address: string;
  position: string;
  contractDate: string; // YYYY-MM-DD — "made and executed this … day of …"
  place: string; // "Cabanatuan City, Nueva Ecija, Philippines"
  effectiveDate: string; // YYYY-MM-DD
  noticeDate: string; // YYYY-MM-DD
  dailyWage: number;
  allowances: RegLine[]; // daily, de minimis
  employerName: string; // "SHANTAHL DIRECT SALES, INC."
  employerAddress: string;
  signatory: { name: string; title: string };
}

export interface Regularization {
  id: string;
  employeeId: string;
  employeeName: string;
  status: RegStatus;
  data: RegData;
  createdAt: string;
  hrName: string | null;
  hrSignedAt: string | null;
  signatoryId: string | null;
  signatoryName: string | null;
  signedAt: string | null;
  returnedNote: string | null;
  returnedAt: string | null;
  receivedAt: string | null;
}

export const regAllowanceTotal = (d: RegData) => d.allowances.reduce((t, a) => t + (Number(a.amount) || 0), 0);

export function regStatusLabel(r: Regularization): { label: string; tone: "warning" | "good" | "info" | "critical" } {
  if (r.status === "done") return { label: "Received by the employee", tone: "good" };
  if (r.status === "employee") return { label: "Waiting for the employee to receive", tone: "info" };
  if (r.status === "chairman") return { label: `Waiting for ${r.signatoryName || "the Chairman"} to sign`, tone: "info" };
  return r.returnedNote ? { label: "Returned to HR", tone: "critical" } : { label: "Draft — HR to send", tone: "warning" };
}

// The draft HR starts from: the 201 file, the company's defaults.
export function draftRegData(input: {
  employee: Employee;
  position: string;
  employerName: string;
  employerAddress: string;
  place: string;
  allowances: RegLine[];
  signatory: { name: string; title: string };
  today: string;
}): RegData {
  const e = input.employee;
  const female = e.gender === "Female";
  const name = [e.firstName, e.lastName].filter((x) => x?.trim()).join(" ");
  return {
    employeeName: name.toUpperCase(),
    salutation: `${female ? "Ms." : "Mr."} ${e.lastName}`,
    female,
    civilStatus: e.civilStatus ?? "",
    address: e.address ?? "",
    position: input.position,
    contractDate: input.today,
    place: input.place,
    effectiveDate: input.today,
    noticeDate: input.today,
    dailyWage: e.dailyRate ?? 0,
    allowances: input.allowances,
    employerName: input.employerName.toUpperCase(),
    employerAddress: input.employerAddress,
    signatory: input.signatory,
  };
}

// ---- Data -------------------------------------------------------------------------

type Row = Record<string, unknown>;
type Query = PromiseLike<{ data: unknown; error: { message: string } | null }> & {
  select: (c?: string) => Query;
  delete: () => Query;
  eq: (c: string, v: string) => Query;
  order: (c: string, o?: { ascending: boolean }) => Query;
};
type Client = { from: (t: string) => Query; rpc: (fn: string, a?: Row) => PromiseLike<{ error: { message: string } | null }> };
const client = () => getSupabaseClient() as unknown as Client;
const bucket = () => getSupabaseClient().storage.from("leave-forms");

const SETUP = "Regularization isn't set up yet — ask HR to run the latest database update.";
const friendly = (msg: string) => (/(regularizations|reg_)/i.test(msg) && /exist|find|not found|schema cache/i.test(msg) ? SETUP : msg);

const toReg = (r: Row): Regularization => ({
  id: String(r.id),
  employeeId: String(r.employee_id),
  employeeName: String(r.employee_name ?? ""),
  status: (r.status as RegStatus) ?? "hr",
  data: r.data as RegData,
  createdAt: String(r.created_at ?? ""),
  hrName: (r.hr_name as string | null) ?? null,
  hrSignedAt: (r.hr_signed_at as string | null) ?? null,
  signatoryId: (r.signatory_id as string | null) ?? null,
  signatoryName: (r.signatory_name as string | null) ?? null,
  signedAt: (r.signed_at as string | null) ?? null,
  returnedNote: (r.returned_note as string | null) ?? null,
  returnedAt: (r.returned_at as string | null) ?? null,
  receivedAt: (r.received_at as string | null) ?? null,
});

export async function fetchRegularizations(): Promise<Regularization[]> {
  const { data, error } = await client().from("regularizations").select("*").order("created_at", { ascending: false });
  if (error) throw new Error(friendly(error.message));
  return (data as Row[]).map(toReg);
}

const rpc = async (fn: string, args: Row) => {
  const { error } = await client().rpc(fn, args);
  if (error) throw new Error(friendly(error.message));
};

export async function createRegularization(employeeId: string, signatoryId: string, data: RegData): Promise<string> {
  const id = crypto.randomUUID();
  await rpc("reg_create", { p_id: id, p_employee: employeeId, p_signatory: signatoryId, p_data: data as unknown as Row });
  return id;
}

export const saveRegularization = (id: string, data: RegData, signatoryId: string) => rpc("reg_save", { p_id: id, p_data: data as unknown as Row, p_signatory: signatoryId });

export type RegSigner = "hr" | "chairman" | "employee";
const sigPath = (id: string, as: RegSigner) => `reg/${id}/${as}.png`;

export async function sendRegularization(id: string, me: string): Promise<void> {
  await placeMySignature(me, sigPath(id, "hr"));
  await rpc("reg_send", { p_id: id });
}

export async function signRegularization(id: string, me: string): Promise<void> {
  await placeMySignature(me, sigPath(id, "chairman"));
  await rpc("reg_sign", { p_id: id });
}

export const returnRegularization = (id: string, note: string) => rpc("reg_return", { p_id: id, p_note: note });

export async function receiveRegularization(id: string, me: string): Promise<void> {
  await placeMySignature(me, sigPath(id, "employee"));
  await rpc("reg_receive", { p_id: id });
}

export async function deleteRegularization(id: string): Promise<void> {
  const { error } = await client().from("regularizations").delete().eq("id", id);
  if (error) throw new Error(friendly(error.message));
  await bucket().remove((["hr", "chairman", "employee"] as RegSigner[]).map((s) => sigPath(id, s)));
}

// The signatures given so far, by signer.
export async function regSignatures(r: Regularization): Promise<Partial<Record<RegSigner, Uint8Array>>> {
  const signed: [RegSigner, string | null][] = [
    ["hr", r.hrSignedAt],
    ["chairman", r.signedAt],
    ["employee", r.receivedAt],
  ];
  const out: Partial<Record<RegSigner, Uint8Array>> = {};
  await Promise.all(
    signed
      .filter(([, at]) => at)
      .map(async ([as]) => {
        const { data } = await bucket().download(sigPath(r.id, as));
        if (data) out[as] = new Uint8Array(await data.arrayBuffer());
      }),
  );
  return out;
}
