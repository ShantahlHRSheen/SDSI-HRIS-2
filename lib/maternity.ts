import { getSupabaseClient } from "./supabase/client";
import { placeMySignature } from "./supabase/leave-forms";
import { computeHdmf, computePhilHealth, computeSss } from "./statutory";

// SSS Maternity Benefit Payment Voucher (supabase/migrate_phase93_maternity_benefit.sql).
//
// The computation, per RA 11210 (105-Day Expanded Maternity Leave Law) and
// its IRR, and SSS Circular 2019-009:
//   * SSS benefit = average daily salary credit (ADSC) × days of leave.
//     ADSC = the 6 highest monthly salary credits (MSC) in the 12 months
//     before the semester of contingency ÷ 180. The semester is the quarter
//     of the delivery (or miscarriage) and the quarter before it.
//   * Days: 105 for live birth, +15 (120) for a solo parent, 60 for
//     miscarriage or emergency termination of pregnancy.
//   * Full pay (basic pay only, as HR decided) = the monthly basic × months
//     of leave (days ÷ 30). For a daily-paid employee, monthly basic = daily
//     rate × working days a month.
//   * Salary differential = full pay − SSS benefit, only when full pay is
//     higher; the employer pays it. It is never negative: the employee always
//     gets at least the SSS benefit, which the employer advances.
//   * Less: the employee's share of SSS, PhilHealth and Pag-IBIG for the
//     months of leave, and loan amortizations, as HR lists them.

export type MbStatus = "hr" | "check" | "approve1" | "approve2" | "release" | "receive" | "done";
export type MbStep = "hr" | "check" | "approve1" | "approve2" | "release" | "receive";
export type MbKind = "live_birth" | "solo_parent" | "miscarriage";

export const MB_KINDS: { value: MbKind; label: string; days: number }[] = [
  { value: "live_birth", label: "Live birth (normal or caesarian)", days: 105 },
  { value: "solo_parent", label: "Live birth — solo parent (105 + 15 days)", days: 120 },
  { value: "miscarriage", label: "Miscarriage / emergency termination of pregnancy", days: 60 },
];
export const mbDays = (k: MbKind) => MB_KINDS.find((x) => x.value === k)?.days ?? 105;

export const SSS_MSC_MAX = 35000;

export interface MbMonth {
  month: string; // YYYY-MM
  msc: number; // monthly salary credit; 0 = no contribution that month
}
export interface MbLine {
  label: string;
  amount: number;
}
export interface MbSigner {
  name: string;
  title: string;
}

export interface MbData {
  employeeName: string;
  position: string;
  description: string; // "Maternity Benefit"
  kind: MbKind;
  deliveryDate: string; // YYYY-MM-DD (date of delivery / miscarriage)
  payBasis: "daily" | "monthly";
  dailyRate: number;
  workingDays: number; // working days a month, for daily-paid
  monthlySalary: number; // for monthly-paid
  months: MbMonth[]; // the 12 months before the semester of contingency
  deductions: MbLine[];
  netAmount: number; // kept with the record (computed)
  signers: { hr: MbSigner; check: MbSigner; approve1: MbSigner; approve2: MbSigner; release: MbSigner; receive: MbSigner };
}

const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

// ---- Dates ------------------------------------------------------------------------

const ym = (y: number, m: number) => {
  const d = new Date(Date.UTC(y, m, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const monthLabel = (m: string) => (/^\d{4}-\d{2}$/.test(m) ? `${MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}` : m);
export const longDate = (d: string) => (/^\d{4}-\d{2}-\d{2}$/.test(d) ? `${MONTHS[Number(d.slice(5, 7)) - 1]} ${Number(d.slice(8, 10))}, ${d.slice(0, 4)}` : "");

// The semester of contingency (two quarters ending with the delivery's) and
// the 12 months before it, oldest first.
export function contingencyWindow(deliveryDate: string): { semester: [string, string]; months: string[] } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(deliveryDate)) return null;
  const y = Number(deliveryDate.slice(0, 4));
  const m = Number(deliveryDate.slice(5, 7)) - 1; // 0-based
  const qEnd = Math.floor(m / 3) * 3 + 2; // last month of the quarter
  const semStart = qEnd - 5;
  const months = Array.from({ length: 12 }, (_, i) => ym(y, semStart - 12 + i));
  return { semester: [ym(y, semStart), ym(y, qEnd)], months };
}

// ---- The computation -----------------------------------------------------------------

export interface MbComputation {
  days: number;
  monthsOfLeave: number;
  monthlyBasic: number;
  fullPay: number;
  top6: number[];
  totalMsc: number; // sum of the 6 highest MSC
  adsc: number; // average daily salary credit
  sssBenefit: number;
  contributionsInWindow: number; // months with an MSC
  eligible: boolean; // at least 3 monthly contributions in the window
  differentialRaw: number; // full pay − SSS benefit (may be negative)
  differential: number; // paid by the employer, never negative
  totalBenefit: number;
  totalDeductions: number;
  net: number;
}

export function computeMb(d: MbData): MbComputation {
  const days = mbDays(d.kind);
  const monthsOfLeave = days / 30;
  const monthlyBasic = d.payBasis === "monthly" ? r2(d.monthlySalary) : r2(d.dailyRate * d.workingDays);
  const fullPay = r2(monthlyBasic * monthsOfLeave);
  const mscs = d.months.map((x) => Math.min(Math.max(Number(x.msc) || 0, 0), SSS_MSC_MAX));
  const top6 = [...mscs].sort((a, b) => b - a).slice(0, 6);
  const totalMsc = top6.reduce((t, x) => t + x, 0);
  const adsc = r2(totalMsc / 180);
  const sssBenefit = r2(adsc * days);
  const contributionsInWindow = mscs.filter((x) => x > 0).length;
  const differentialRaw = r2(fullPay - sssBenefit);
  const differential = Math.max(differentialRaw, 0);
  const totalBenefit = r2(sssBenefit + differential);
  const totalDeductions = r2(d.deductions.reduce((t, x) => t + (Number(x.amount) || 0), 0));
  return {
    days,
    monthsOfLeave,
    monthlyBasic,
    fullPay,
    top6,
    totalMsc,
    adsc,
    sssBenefit,
    contributionsInWindow,
    eligible: contributionsInWindow >= 3,
    differentialRaw,
    differential,
    totalBenefit,
    totalDeductions,
    net: r2(totalBenefit - totalDeductions),
  };
}

// The employee's share of the mandatory contributions for the months of
// leave, at the HRIS payroll's rates (lib/statutory.ts), on the basis of
// mandatories (daily rate × 313 ÷ 12, or the monthly salary).
export function contributionLines(basis: number, monthsOfLeave: number): MbLine[] {
  const sss = computeSss(basis);
  const n = monthsOfLeave;
  const label = (what: string) => `${what} for ${n} months`;
  return [
    { label: label("SSS Contribution"), amount: r2((sss.regular.employee + sss.wisp.employee) * n) },
    { label: label("PhilHealth Contribution"), amount: r2(computePhilHealth(basis).employee * n) },
    { label: label("HDMF Contribution"), amount: r2(computeHdmf(basis).employee * n) },
  ];
}

// "FORTY-SEVEN THOUSAND NINE HUNDRED THIRTY-NINE PESOS AND 52/100 ONLY"
const ONES = ["", "ONE", "TWO", "THREE", "FOUR", "FIVE", "SIX", "SEVEN", "EIGHT", "NINE", "TEN", "ELEVEN", "TWELVE", "THIRTEEN", "FOURTEEN", "FIFTEEN", "SIXTEEN", "SEVENTEEN", "EIGHTEEN", "NINETEEN"];
const TENS = ["", "", "TWENTY", "THIRTY", "FORTY", "FIFTY", "SIXTY", "SEVENTY", "EIGHTY", "NINETY"];
function under1000(n: number): string {
  const h = Math.floor(n / 100);
  const rest = n % 100;
  const parts: string[] = [];
  if (h) parts.push(`${ONES[h]} HUNDRED`);
  if (rest) parts.push(rest < 20 ? ONES[rest] : `${TENS[Math.floor(rest / 10)]}${rest % 10 ? `-${ONES[rest % 10]}` : ""}`);
  return parts.join(" ");
}
export function pesosInWords(amount: number): string {
  const cents = Math.round(Math.abs(amount) * 100);
  let n = Math.floor(cents / 100);
  const c = cents % 100;
  if (n === 0 && c === 0) return "ZERO PESOS ONLY";
  const scales = ["", " THOUSAND", " MILLION", " BILLION"];
  const parts: string[] = [];
  for (let i = 0; n > 0; i++, n = Math.floor(n / 1000)) {
    const chunk = n % 1000;
    if (chunk) parts.unshift(`${under1000(chunk)}${scales[i]}`);
  }
  const pesos = parts.length ? `${parts.join(" ")} ${Math.floor(cents / 100) === 1 ? "PESO" : "PESOS"}` : "";
  const centavos = c ? `${pesos ? " AND " : ""}${String(c).padStart(2, "0")}/100` : "";
  return `${pesos}${centavos} ONLY`.trim();
}

export function mbStatusLabel(r: MaternityBenefit): { label: string; tone: "warning" | "good" | "info" | "critical" } {
  switch (r.status) {
    case "done":
      return { label: "Received by the employee", tone: "good" };
    case "receive":
      return { label: "Released — waiting for the employee to receive", tone: "info" };
    case "release":
      return { label: `Waiting for ${r.releaseName || "the Treasurer"} to release`, tone: "info" };
    case "approve2":
      return { label: `Waiting for ${r.approve2Name || "the CEO"} to approve`, tone: "info" };
    case "approve1":
      return { label: `Waiting for ${r.approve1Name || "the Vice Chairperson"} to approve`, tone: "info" };
    case "check":
      return { label: `Waiting for ${r.checkName || "Accounting"} to check`, tone: "info" };
    default:
      return r.returnedNote ? { label: "Returned to HR", tone: "critical" } : { label: "Draft — HR to send", tone: "warning" };
  }
}

// ---- Data -------------------------------------------------------------------------

export interface MaternityBenefit {
  id: string;
  employeeId: string;
  employeeName: string;
  status: MbStatus;
  data: MbData;
  netAmount: number;
  createdAt: string;
  hrName: string | null;
  hrAt: string | null;
  checkId: string | null;
  checkName: string | null;
  checkAt: string | null;
  approve1Id: string | null;
  approve1Name: string | null;
  approve1At: string | null;
  approve2Id: string | null;
  approve2Name: string | null;
  approve2At: string | null;
  releaseId: string | null;
  releaseName: string | null;
  releaseAt: string | null;
  receiveAt: string | null;
  returnedNote: string | null;
  returnedBy: string | null;
  returnedAt: string | null;
}

export type MbSignerIds = { check: string; approve1: string; approve2: string; release: string };

// Whose turn it is, as the person signed in: the step they sign, or null.
export function mbMyStep(r: MaternityBenefit, me: string | undefined): Exclude<MbStep, "hr"> | null {
  if (!me) return null;
  const who: Partial<Record<MbStatus, string | null>> = { check: r.checkId, approve1: r.approve1Id, approve2: r.approve2Id, release: r.releaseId, receive: r.employeeId };
  return who[r.status] === me ? (r.status as Exclude<MbStep, "hr">) : null;
}

type Row = Record<string, unknown>;
type Query = PromiseLike<{ data: unknown; error: { message: string } | null }> & {
  select: (c?: string) => Query;
  delete: () => Query;
  eq: (c: string, v: string) => Query;
  in: (c: string, v: string[]) => Query;
  order: (c: string, o?: { ascending: boolean }) => Query;
  limit: (n: number) => Query;
};
type Client = { from: (t: string) => Query; rpc: (fn: string, a?: Row) => PromiseLike<{ error: { message: string } | null }> };
const client = () => getSupabaseClient() as unknown as Client;
const bucket = () => getSupabaseClient().storage.from("leave-forms");

const SETUP = "Maternity Benefit isn't set up yet — ask HR to run the latest database update.";
const friendly = (msg: string) => (/(maternity_benefits|mb_)/i.test(msg) && /exist|find|not found|schema cache/i.test(msg) ? SETUP : msg);
const s = (v: unknown) => (v as string | null) ?? null;

const toMb = (r: Row): MaternityBenefit => ({
  id: String(r.id),
  employeeId: String(r.employee_id),
  employeeName: String(r.employee_name ?? ""),
  status: (r.status as MbStatus) ?? "hr",
  data: r.data as MbData,
  netAmount: Number(r.net_amount ?? 0),
  createdAt: String(r.created_at ?? ""),
  hrName: s(r.hr_name),
  hrAt: s(r.hr_at),
  checkId: s(r.check_id),
  checkName: s(r.check_name),
  checkAt: s(r.check_at),
  approve1Id: s(r.approve1_id),
  approve1Name: s(r.approve1_name),
  approve1At: s(r.approve1_at),
  approve2Id: s(r.approve2_id),
  approve2Name: s(r.approve2_name),
  approve2At: s(r.approve2_at),
  releaseId: s(r.release_id),
  releaseName: s(r.release_name),
  releaseAt: s(r.release_at),
  receiveAt: s(r.receive_at),
  returnedNote: s(r.returned_note),
  returnedBy: s(r.returned_by),
  returnedAt: s(r.returned_at),
});

export async function fetchMaternityBenefits(): Promise<MaternityBenefit[]> {
  const { data, error } = await client().from("maternity_benefits").select("*").order("created_at", { ascending: false });
  if (error) throw new Error(friendly(error.message));
  return (data as Row[]).map(toMb);
}

const rpc = async (fn: string, args: Row) => {
  const { error } = await client().rpc(fn, args);
  if (error) throw new Error(friendly(error.message));
};

const withNet = (d: MbData): MbData => ({ ...d, netAmount: computeMb(d).net });

export async function createMaternityBenefit(employeeId: string, ids: MbSignerIds, data: MbData): Promise<string> {
  const id = crypto.randomUUID();
  await rpc("mb_create", { p_id: id, p_employee: employeeId, p_check: ids.check, p_approve1: ids.approve1, p_approve2: ids.approve2, p_release: ids.release, p_data: withNet(data) as unknown as Row });
  return id;
}
export const saveMaternityBenefit = (id: string, ids: MbSignerIds, data: MbData) =>
  rpc("mb_save", { p_id: id, p_check: ids.check, p_approve1: ids.approve1, p_approve2: ids.approve2, p_release: ids.release, p_data: withNet(data) as unknown as Row });

const sigPath = (id: string, step: MbStep) => `mb/${id}/${step}.png`;

export async function sendMaternityBenefit(id: string, me: string): Promise<void> {
  await placeMySignature(me, sigPath(id, "hr"));
  await rpc("mb_send", { p_id: id });
}
export async function signMaternityBenefit(id: string, me: string, step: Exclude<MbStep, "hr">): Promise<void> {
  await placeMySignature(me, sigPath(id, step));
  await rpc("mb_sign", { p_id: id });
}
export const returnMaternityBenefit = (id: string, note: string) => rpc("mb_return", { p_id: id, p_note: note });

export async function deleteMaternityBenefit(id: string): Promise<void> {
  const { error } = await client().from("maternity_benefits").delete().eq("id", id);
  if (error) throw new Error(friendly(error.message));
  await bucket().remove((["hr", "check", "approve1", "approve2", "release", "receive"] as MbStep[]).map((x) => sigPath(id, x)));
}

export const mbSignedAt = (r: MaternityBenefit): Record<MbStep, string | null> => ({
  hr: r.hrAt,
  check: r.checkAt,
  approve1: r.approve1At,
  approve2: r.approve2At,
  release: r.releaseAt,
  receive: r.receiveAt,
});

export async function mbSignatures(r: MaternityBenefit): Promise<Partial<Record<MbStep, Uint8Array>>> {
  const at = mbSignedAt(r);
  const out: Partial<Record<MbStep, Uint8Array>> = {};
  await Promise.all(
    (Object.keys(at) as MbStep[])
      .filter((k) => at[k])
      .map(async (k) => {
        const { data } = await bucket().download(sigPath(r.id, k));
        if (data) out[k] = new Uint8Array(await data.arrayBuffer());
      }),
  );
  return out;
}

// Loan amortizations from the employee's latest payroll month (the two most
// recent cut-offs' entries), per month. Resolves to zeros when unavailable.
export async function latestLoans(employeeId: string): Promise<{ sssLoan: number; hdmfLoan: number }> {
  try {
    const { data: periods } = await client().from("payroll_periods").select("id, period_start").order("period_start", { ascending: false }).limit(2);
    const ids = ((periods as Row[]) ?? []).map((p) => String(p.id));
    if (!ids.length) return { sssLoan: 0, hdmfLoan: 0 };
    const { data } = await client().from("payroll_line_overrides").select("sss_loan, hdmf_loan, employee_id").in("period_id", ids).eq("employee_id", employeeId);
    const rows = (data as Row[]) ?? [];
    return {
      sssLoan: r2(rows.reduce((t, x) => t + Number(x.sss_loan ?? 0), 0)),
      hdmfLoan: r2(rows.reduce((t, x) => t + Number(x.hdmf_loan ?? 0), 0)),
    };
  } catch {
    return { sssLoan: 0, hdmfLoan: 0 };
  }
}
