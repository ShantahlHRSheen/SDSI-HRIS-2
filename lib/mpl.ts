import { getSupabaseClient } from "./supabase/client";
import { placeMySignature } from "./supabase/leave-forms";
import { computeHdmf, computePhilHealth, computeSemiMonthlyWithholdingTax, computeSss } from "./statutory";
import type { Employee } from "./types";

// Pag-IBIG Multi-Purpose Loan Application Form (HQP-SLF-065)
// (supabase/migrate_phase56_pagibig_loan_form.sql): the employee asks for the
// employer's part; HR checks the employer details and the Certificate of
// Net Pay (from the 201 file's standing pay) and sends it to the authorized
// signatory, who signs. The employee prints it and fills in their own part.

export type MplStatus = "hr" | "signatory" | "signed" | "declined";

export interface MplRequest {
  id: string;
  employeeId: string;
  employeeName: string;
  note: string;
  status: MplStatus;
  requestedBy: string | null;
  requestedAt: string;
  preparedName: string | null;
  preparedAt: string | null;
  signatoryId: string | null;
  signatoryName: string | null;
  signedAt: string | null;
  declinedName: string | null;
  declineReason: string | null;
  data: MplData | null;
}

export interface MplLine {
  label: string;
  amount: number;
}

export interface MplAddress {
  unit: string;
  building: string;
  house: string;
  street: string;
  subdivision: string;
  barangay: string;
  city: string;
  province: string;
  zip: string;
}

// What's printed on the form.
export interface MplData {
  employerName: string;
  address: MplAddress;
  employeeNumber: string;
  dateOfEmployment: string; // YYYY-MM-DD
  borrowerName: string;
  month: string; // "OCTOBER 2026"
  basic: number;
  allowances: MplLine[]; // up to 6
  deductions: MplLine[]; // up to 6
  signatory: { name: string; designation: string };
  employerPagibigId: string;
}

export const MPL_MAX_LINES = 6;
const sum = (lines: MplLine[]) => lines.reduce((s, l) => s + (Number(l.amount) || 0), 0);
export const mplTotals = (d: MplData) => {
  const gross = (Number(d.basic) || 0) + sum(d.allowances);
  const deductions = sum(d.deductions);
  return { gross, deductions, net: gross - deductions };
};

export function mplStatusLabel(r: MplRequest): { label: string; tone: "warning" | "good" | "critical" | "info" } {
  if (r.status === "signed") return { label: "Signed — ready to print", tone: "good" };
  if (r.status === "declined") return { label: "Declined", tone: "critical" };
  if (r.status === "signatory") return { label: `Waiting for ${r.signatoryName || "the signatory"}`, tone: "info" };
  return { label: "Waiting for HR", tone: "warning" };
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const MONTHS = ["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"];

// Standing monthly pay from the 201 file, with the mandatory contributions
// and withholding tax worked out as Payroll does (lib/payroll.ts): a daily
// rate's month is 313 ÷ 12 days; tax is twice the semi-monthly table on half
// the month's taxable pay.
export function standingNetPay(e: Employee): { basic: number; allowances: MplLine[]; deductions: MplLine[] } {
  const daily = e.payrollType === "daily";
  const days = 313 / 12;
  const basic = r2(daily ? (e.dailyRate ?? 0) * days : (e.monthlySalary ?? 0));
  const allowance = r2(daily ? (e.dailyAllowance ?? 0) * days : (e.monthlyAllowance ?? 0));
  const allowances = allowance > 0 ? [{ label: "Allowance", amount: allowance }] : [];
  const deductions: MplLine[] = [];
  if (e.employmentStatus !== "freelance" && basic > 0) {
    const sss = computeSss(basic);
    deductions.push({ label: "SSS", amount: r2(sss.regular.employee) });
    if (sss.wisp.employee > 0) deductions.push({ label: "SSS WISP", amount: r2(sss.wisp.employee) });
    deductions.push({ label: "PhilHealth", amount: r2(computePhilHealth(basic).employee) });
    deductions.push({ label: "Pag-IBIG", amount: r2(computeHdmf(basic).employee) });
  }
  const taxable = basic + allowance - sum(deductions);
  const tax = 2 * computeSemiMonthlyWithholdingTax(taxable / 2);
  if (tax > 0) deductions.push({ label: "Withholding Tax", amount: r2(tax) });
  return { basic, allowances, deductions };
}

export function draftMplData(input: {
  employee: Employee;
  employerName: string;
  address: MplAddress;
  employerPagibigId: string;
  signatory: { name: string; designation: string };
  today: string; // YYYY-MM-DD
}): MplData {
  const e = input.employee;
  return {
    employerName: input.employerName.toUpperCase(),
    address: input.address,
    employeeNumber: e.employeeNumber,
    dateOfEmployment: e.dateHired ?? "",
    borrowerName: [e.firstName, e.middleName, e.lastName].filter((x) => x?.trim()).join(" ").toUpperCase(),
    month: `${MONTHS[Number(input.today.slice(5, 7)) - 1]} ${input.today.slice(0, 4)}`,
    ...standingNetPay(e),
    signatory: input.signatory,
    employerPagibigId: input.employerPagibigId,
  };
}

// "Marlyn Cabungcal Leonardo" → "MARLYN C. LEONARDO".
export function signatoryName(e: Employee): string {
  const mi = e.middleName?.trim() ? ` ${e.middleName.trim().charAt(0)}.` : "";
  return `${e.firstName}${mi} ${e.lastName}`.toUpperCase();
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

const SETUP = "Pag-IBIG loan forms aren't set up yet — ask HR to run the latest database update.";
const friendly = (msg: string) => (/mpl_/i.test(msg) && /exist|find|not found|schema cache/i.test(msg) ? SETUP : msg);

const toMpl = (r: Row): MplRequest => ({
  id: String(r.id),
  employeeId: String(r.employee_id),
  employeeName: String(r.employee_name ?? ""),
  note: String(r.note ?? ""),
  status: (r.status as MplStatus) ?? "hr",
  requestedBy: (r.requested_by as string | null) ?? null,
  requestedAt: String(r.requested_at ?? ""),
  preparedName: (r.prepared_name as string | null) ?? null,
  preparedAt: (r.prepared_at as string | null) ?? null,
  signatoryId: (r.signatory_id as string | null) ?? null,
  signatoryName: (r.signatory_name as string | null) ?? null,
  signedAt: (r.signed_at as string | null) ?? null,
  declinedName: (r.declined_name as string | null) ?? null,
  declineReason: (r.decline_reason as string | null) ?? null,
  data: (r.data as MplData | null) ?? null,
});

export async function fetchMplRequests(): Promise<MplRequest[]> {
  const out: MplRequest[] = [];
  for (let i = 0; ; i += 1000) {
    const { data, error } = await client().from("mpl_requests").select("*").order("requested_at", { ascending: false }).order("id").range(i, i + 999);
    if (error) throw new Error(friendly(error.message));
    const rows = data as Row[];
    out.push(...rows.map(toMpl));
    if (rows.length < 1000) return out;
  }
}

export async function requestMpl(employeeId: string, note: string): Promise<string> {
  const id = crypto.randomUUID();
  const { error } = await client().from("mpl_requests").insert({ id, employee_id: employeeId, note: note.trim().slice(0, 300) });
  if (error) throw new Error(friendly(error.message));
  return id;
}

export async function prepareMpl(r: MplRequest, data: MplData, signatoryId: string): Promise<void> {
  const { error } = await client().rpc("mpl_prepare", { p_id: r.id, p_data: data as unknown as Row, p_signatory: signatoryId });
  if (error) throw new Error(friendly(error.message));
}

const sigPath = (r: Pick<MplRequest, "employeeId" | "id">) => `mpl/${r.employeeId}/${r.id}/signatory.png`;

export async function signMpl(r: MplRequest, me: string): Promise<void> {
  await placeMySignature(me, sigPath(r));
  const { error } = await client().rpc("mpl_sign", { p_id: r.id });
  if (error) throw new Error(friendly(error.message));
}

export async function declineMpl(r: MplRequest, reason: string): Promise<void> {
  const { error } = await client().rpc("mpl_decline", { p_id: r.id, p_reason: reason });
  if (error) throw new Error(friendly(error.message));
}

export async function deleteMpl(r: MplRequest): Promise<void> {
  const { error } = await client().from("mpl_requests").delete().eq("id", r.id);
  if (error) throw new Error(friendly(error.message));
  await bucket().remove([sigPath(r)]);
}

export async function mplSignature(r: MplRequest): Promise<Uint8Array | null> {
  const { data } = await bucket().download(sigPath(r));
  return data ? new Uint8Array(await data.arrayBuffer()) : null;
}
