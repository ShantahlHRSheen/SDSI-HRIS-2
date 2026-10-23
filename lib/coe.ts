import { getSupabaseClient } from "./supabase/client";
import { placeMySignature } from "./supabase/leave-forms";
import type { Employee } from "./types";

// Certificate of Employment (supabase/migrate_phase55_certificate_of_employment.sql):
// the employee asks for one (purpose, with or without compensation) — or HR
// starts one for anyone, former employees included — and the HR Manager
// reviews the wording, signs and issues it (or declines). The issued
// certificate is drawn from `data` by lib/coe-pdf.ts.

export type CoeStatus = "pending" | "issued" | "declined";

export interface CoeRequest {
  id: string;
  employeeId: string;
  employeeName: string;
  purpose: string;
  withCompensation: boolean;
  status: CoeStatus;
  requestedBy: string | null;
  requestedAt: string;
  decidedName: string | null;
  decidedAt: string | null;
  declineReason: string | null;
  data: CoeData | null;
}

// The certificate's wording, as HR issued it.
export interface CoeData {
  honorific: "MR." | "MS.";
  fullName: string; // "DANNIEL GOZON BORJA"
  lastName: string; // "Borja"
  female: boolean;
  address: string;
  current: boolean; // still employed: "is an employee … since …"
  start: string; // YYYY-MM-DD
  end: string | null; // last day, when no longer employed
  position: string;
  extra: string; // added after the position, e.g. "and was also a Freelance …"
  compensation: { basis: "monthly" | "daily"; basic: number; allowance: number } | null;
  purpose: string; // blank: "whatever legal purpose it may serve him/her"
  issueDate: string; // YYYY-MM-DD
  company: string; // "SHANTAHL DIRECT SALES INC."
  issuedAt: string; // "CABANATUAN CITY, NUEVA ECIJA (HEAD OFFICE)"
  signer: { name: string; title: string; contact: string; email: string };
}

export const COE_PURPOSES = ["Loan / bank requirement", "Visa / travel", "New employment", "Government requirement", "Personal record"];

export const coeStatusLabel = (r: CoeRequest): { label: string; tone: "warning" | "good" | "critical" } =>
  r.status === "issued" ? { label: "Issued", tone: "good" } : r.status === "declined" ? { label: "Declined", tone: "critical" } : { label: "Waiting for HR", tone: "warning" };

// ---- Wording ---------------------------------------------------------------------

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const longDate = (d: string) => `${MONTHS[Number(d.slice(5, 7)) - 1]} ${Number(d.slice(8, 10))}, ${d.slice(0, 4)}`;
const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
const pesos = (n: number) => `PHP ${n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export interface Run {
  t: string;
  bold?: boolean;
  italic?: boolean;
}

// The certificate's paragraphs, as runs of text.
export function coeParagraphs(d: CoeData): Run[][] {
  const he = d.female ? "She" : "He";
  const first: Run[] = [{ t: "This is to certify that " }, { t: `${d.honorific} ${d.fullName}`, bold: true, italic: true }];
  if (d.address.trim()) first.push({ t: " a resident of " }, { t: `${d.address.trim()},`, italic: true });
  first.push(
    { t: " " },
    { t: d.current ? "is an employee" : "was an employee", bold: true },
    { t: " of " },
    { t: d.company, bold: true },
    { t: d.current || !d.end ? ` since ${longDate(d.start)}` : ` from ${longDate(d.start)} upto ${longDate(d.end)}` },
    { t: ", holding the position of " },
    { t: d.position.toUpperCase(), bold: true },
    { t: d.extra.trim() ? `, ${d.extra.trim().replace(/\.$/, "")}.` : "." },
  );
  const out: Run[][] = [first];
  if (d.compensation && d.compensation.basic > 0) {
    const c = d.compensation;
    const per = c.basis === "daily" ? "daily" : "monthly";
    const what = c.basis === "daily" ? `a daily rate of ${pesos(c.basic)}` : `a monthly basic salary of ${pesos(c.basic)}`;
    out.push([{ t: `${he} ${d.current ? "receives" : "received"} ${what}${c.allowance > 0 ? ` and a ${per} allowance of ${pesos(c.allowance)}` : ""}.` }]);
  }
  const purpose = d.purpose.trim() ? d.purpose.trim().replace(/\.$/, "") : `whatever legal purpose it may serve ${d.female ? "her" : "him"}`;
  out.push([{ t: `This certification is issued at the request of ${d.honorific === "MS." ? "Ms." : "Mr."} ${d.lastName}, for ${purpose}.` }]);
  const day = Number(d.issueDate.slice(8, 10));
  out.push([{ t: `Issued this ${ordinal(day)} day of ${MONTHS[Number(d.issueDate.slice(5, 7)) - 1]} ${d.issueDate.slice(0, 4)} at ${d.company} ${d.issuedAt}.` }]);
  out.push([{ t: "Please don't hesitate to get in touch with me if you have any questions or concerns. Thank you!" }]);
  return out;
}

// The wording HR starts from: the employee's 201 file and the request.
export function draftCoeData(input: {
  employee: Employee;
  request: Pick<CoeRequest, "purpose" | "withCompensation">;
  position: string;
  company: string;
  issuedAt: string;
  issueDate: string;
  signer: CoeData["signer"];
}): CoeData {
  const e = input.employee;
  const former = e.status === "resigned" || e.status === "terminated";
  return {
    honorific: e.gender === "Female" ? "MS." : "MR.",
    fullName: [e.firstName, e.middleName, e.lastName].filter((x) => x?.trim()).join(" ").toUpperCase(),
    lastName: e.lastName,
    female: e.gender === "Female",
    address: e.address ?? "",
    current: !former,
    start: e.dateHired ?? "",
    end: former ? (e.statusChangedAt?.slice(0, 10) ?? null) : null,
    position: input.position,
    extra: "",
    compensation: input.request.withCompensation ? defaultCompensation(e) : null,
    purpose: purposePhrase(input.request.purpose),
    issueDate: input.issueDate,
    company: input.company.toUpperCase(),
    issuedAt: input.issuedAt,
    signer: input.signer,
  };
}

// Pay from the 201 file: daily rate for daily-paid staff, else monthly salary.
export function defaultCompensation(e: Employee): NonNullable<CoeData["compensation"]> {
  return e.payrollType === "daily"
    ? { basis: "daily", basic: e.dailyRate ?? 0, allowance: e.dailyAllowance ?? 0 }
    : { basis: "monthly", basic: e.monthlySalary ?? 0, allowance: e.monthlyAllowance ?? 0 };
}

// "Loan / bank requirement" → "loan / bank requirement purposes".
function purposePhrase(p: string): string {
  const t = p.trim();
  if (!t) return "";
  return `${t.charAt(0).toLowerCase()}${t.slice(1)}${/purpose/i.test(t) ? "" : " purposes"}`;
}

// ---- Data -------------------------------------------------------------------------

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

const SETUP = "Certificates of Employment aren't set up yet — ask HR to run the latest database update.";
const friendly = (msg: string) => (/coe_/i.test(msg) && /exist|find|not found|schema cache/i.test(msg) ? SETUP : msg);

const toCoe = (r: Row): CoeRequest => ({
  id: String(r.id),
  employeeId: String(r.employee_id),
  employeeName: String(r.employee_name ?? ""),
  purpose: String(r.purpose ?? ""),
  withCompensation: !!r.with_compensation,
  status: (r.status as CoeStatus) ?? "pending",
  requestedBy: (r.requested_by as string | null) ?? null,
  requestedAt: String(r.requested_at ?? ""),
  decidedName: (r.decided_name as string | null) ?? null,
  decidedAt: (r.decided_at as string | null) ?? null,
  declineReason: (r.decline_reason as string | null) ?? null,
  data: (r.data as CoeData | null) ?? null,
});

export async function fetchCoeRequests(): Promise<CoeRequest[]> {
  const out: CoeRequest[] = [];
  for (let i = 0; ; i += 1000) {
    const { data, error } = await client().from("coe_requests").select("*").order("requested_at", { ascending: false }).order("id").range(i, i + 999);
    if (error) throw new Error(friendly(error.message));
    const rows = data as Row[];
    out.push(...rows.map(toCoe));
    if (rows.length < 1000) return out;
  }
}

// The employee asks (or HR starts one for anyone); returns the new id.
export async function requestCoe(employeeId: string, purpose: string, withCompensation: boolean): Promise<string> {
  const id = crypto.randomUUID();
  const { error } = await client().from("coe_requests").insert({ id, employee_id: employeeId, purpose: purpose.trim().slice(0, 200), with_compensation: withCompensation });
  if (error) throw new Error(friendly(error.message));
  return id;
}

const sigPath = (r: Pick<CoeRequest, "employeeId" | "id">) => `coe/${r.employeeId}/${r.id}/hr.png`;

// HR Manager: sign (saved signature) and issue with the final wording.
export async function issueCoe(r: CoeRequest, me: string, data: CoeData): Promise<void> {
  await placeMySignature(me, sigPath(r));
  const { error } = await client().rpc("coe_issue", { p_id: r.id, p_data: data as unknown as Row });
  if (error) throw new Error(friendly(error.message));
}

export async function declineCoe(r: CoeRequest, reason: string): Promise<void> {
  const { error } = await client().rpc("coe_decline", { p_id: r.id, p_reason: reason });
  if (error) throw new Error(friendly(error.message));
}

export async function deleteCoe(r: CoeRequest): Promise<void> {
  const { error } = await client().from("coe_requests").delete().eq("id", r.id);
  if (error) throw new Error(friendly(error.message));
  await bucket().remove([sigPath(r)]);
}

// HR's signature on an issued certificate (PNG bytes), or null.
export async function coeSignature(r: CoeRequest): Promise<Uint8Array | null> {
  const { data } = await bucket().download(sigPath(r));
  return data ? new Uint8Array(await data.arrayBuffer()) : null;
}
