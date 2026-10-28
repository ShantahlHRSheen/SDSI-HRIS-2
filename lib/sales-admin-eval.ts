import { getSupabaseClient } from "./supabase/client";
import { placeMySignature } from "./supabase/leave-forms";

// Sales Admin Evaluation for Regularization
// (supabase/migrate_phase63_sales_admin_evaluation.sql), from HR's
// workbook: HR rates Behavior and enters the monthly sales; the Department
// Head rates Job Performance; each gives an overall rating, comment and
// recommendation and signs. Then the Vice Chairperson and the Chairman give
// their recommendation. Behavior (10) + Job Performance (10) + Sales (80) =
// the actual score; the pass mark is the company's (lib/companies.ts).

export const SAE_BEHAVIOR_KRA = "Obedience to the Company Policy";
export const SAE_BEHAVIOR = [
  "Comes to work on time",
  "Does not show absenteeism",
  "Wears proper uniform, footwear, and ID when coming to work (If no uniform issued, make wearing ID as basis)",
  "Employee shows professional appearance (Proper overall grooming)",
  "Keeps his / her area neat and clean",
  "Participate in maintaining the office neat and clean",
  "Keeps all company data confidential",
  "Avoids gossip and negative rumors",
  "Does not get involved in any fight and issues",
  "Follows the instruction of superiors and company officers",
  "Not using company's time for any unauthorized work and activities",
  "Not using company's equipment and supplies for any unauthorized work and activities",
  "Follows all established processes for requests such as Leaves, OT, Locator, etc.",
];

export const SAE_JOB: { kra: string; objective: string }[] = [
  { kra: "Communication with superiors", objective: "Communicate effectively and respectfully with superiors" },
  { kra: "Time management", objective: "Finishes assigned tasks on-time" },
  { kra: "Productivity", objective: "Uses all his/her office hours for doing his/her tasks" },
  { kra: "Accuracy of works", objective: "Employee's outputs are always accurate" },
  { kra: "Extra Effort", objective: "Employee is doing extra effort to ensure he/she meets the monthly quota" },
  { kra: "Quality of work done", objective: "Achieves quota monthly" },
];

export const SAE_SCALE: { value: number; label: string; tagalog: string }[] = [
  { value: 0, label: "Doesn't demonstrate", tagalog: "HINDI NAGAWA" },
  { value: 1, label: "Demonstrates poorly", tagalog: "NAGAWA PERO HINDI MAAYOS" },
  { value: 2, label: "Demonstrates satisfactorily", tagalog: "PWEDE NA" },
  { value: 3, label: "Demonstrates excellently", tagalog: "NAGAWA PERFECTLY" },
];

export const SAE_OVERALL = ["Outstanding", "Exceeds Expectation", "Meets Expectation", "Needs Improvement"];

export const SAE_WEIGHTS = { behavior: 10, job: 10, sales: 80 };
// Required sales are 3× the ads spent.
export const SAE_SALES_MULTIPLE = 3;

export type Rating = number | null;

export interface SaeSalesMonth {
  month: string; // "January 2026"
  ads: number;
  gross: number;
}

// Snapshot of the 201 file, saved with HR's part (the head may not see 201 files).
export interface SaeEmployeeInfo {
  name: string;
  position: string;
  department: string;
  dateHired: string | null;
  employmentStatus: string;
  contractEnd: string | null;
}

export interface SaeHrPart {
  employee?: SaeEmployeeInfo;
  behavior: Rating[];
  sales: SaeSalesMonth[];
  overall: string;
  comment: string;
  recommendation: string;
}

export interface SaeHeadPart {
  job: Rating[];
  overall: string;
  comment: string;
  recommendation: string;
}

export type SaeStatus = "open" | "vc" | "chairman" | "done";

export interface SalesAdminEvaluation {
  id: string;
  employeeId: string;
  employeeName: string;
  period: string;
  status: SaeStatus;
  createdAt: string;
  headId: string | null;
  vcId: string | null;
  chairmanId: string | null;
  hr: SaeHrPart | null;
  hrName: string | null;
  hrSignedAt: string | null;
  head: SaeHeadPart | null;
  headName: string | null;
  headSignedAt: string | null;
  vcRecommendation: string | null;
  vcName: string | null;
  vcSignedAt: string | null;
  chairmanRecommendation: string | null;
  chairmanName: string | null;
  chairmanSignedAt: string | null;
}

export const emptyHrPart = (): SaeHrPart => ({ behavior: SAE_BEHAVIOR.map(() => null), sales: [], overall: "", comment: "", recommendation: "" });
export const emptyHeadPart = (): SaeHeadPart => ({ job: SAE_JOB.map(() => null), overall: "", comment: "", recommendation: "" });

// ---- Scoring ------------------------------------------------------------------------

const r2 = (n: number) => Math.round(n * 100) / 100;
const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
const rated = (xs: Rating[] | undefined) => (xs ?? []).filter((x): x is number => typeof x === "number");

export const requiredSales = (m: SaeSalesMonth) => r2((Number(m.ads) || 0) * SAE_SALES_MULTIPLE);
// A month's score: gross ÷ required × 80, capped at 80.
export function monthSalesScore(m: SaeSalesMonth): number | null {
  const req = requiredSales(m);
  if (req <= 0) return null;
  return r2(Math.min((Number(m.gross) || 0) / req, 1) * SAE_WEIGHTS.sales);
}

export interface SaeScores {
  behavior: number; // of 10
  job: number; // of 10
  sales: number; // of 80
  total: number;
  passed: boolean;
  complete: boolean; // every item rated and some sales entered
}

export function saeScores(hr: SaeHrPart | null, head: SaeHeadPart | null, passMark: number): SaeScores {
  const b = rated(hr?.behavior);
  const j = rated(head?.job);
  const months = (hr?.sales ?? []).map(monthSalesScore).filter((x): x is number => x !== null);
  const behavior = r2((avg(b) / 3) * SAE_WEIGHTS.behavior);
  const job = r2((avg(j) / 3) * SAE_WEIGHTS.job);
  const sales = r2(avg(months));
  const total = r2(behavior + job + sales);
  const complete = b.length === SAE_BEHAVIOR.length && j.length === SAE_JOB.length && months.length > 0;
  return { behavior, job, sales, total, passed: total >= passMark, complete };
}

export function saeStatusLabel(e: SalesAdminEvaluation): { label: string; tone: "warning" | "good" | "info" } {
  if (e.status === "done") return { label: "Completed", tone: "good" };
  if (e.status === "chairman") return { label: "Waiting for the Chairman", tone: "info" };
  if (e.status === "vc") return { label: "Waiting for the Vice Chairperson", tone: "info" };
  const waiting = [!e.hrSignedAt && "HR", !e.headSignedAt && (e.headName || "the Department Head")].filter(Boolean);
  return { label: `Waiting for ${waiting.join(" and ")}`, tone: "warning" };
}

// "2 years, 3 months" from the date hired to `asOf` (YYYY-MM-DD).
export function lengthOfService(dateHired: string | null | undefined, asOf: string): string {
  if (!dateHired) return "—";
  const [y1, m1, d1] = dateHired.slice(0, 10).split("-").map(Number);
  const [y2, m2, d2] = asOf.slice(0, 10).split("-").map(Number);
  let months = (y2 - y1) * 12 + (m2 - m1) - (d2 < d1 ? 1 : 0);
  if (months < 0) return "—";
  const years = Math.floor(months / 12);
  months %= 12;
  const parts = [years && `${years} year${years > 1 ? "s" : ""}`, months && `${months} month${months > 1 ? "s" : ""}`].filter(Boolean);
  return parts.length ? parts.join(", ") : "Less than a month";
}

// ---- Data ---------------------------------------------------------------------------

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

const SETUP = "Sales Admin evaluations aren't set up yet — ask HR to run the latest database update.";
const friendly = (msg: string) => (/(sales_admin_evaluations|sae_)/i.test(msg) && /exist|find|not found|schema cache/i.test(msg) ? SETUP : msg);

const toEval = (r: Row): SalesAdminEvaluation => ({
  id: String(r.id),
  employeeId: String(r.employee_id),
  employeeName: String(r.employee_name ?? ""),
  period: String(r.period ?? ""),
  status: (r.status as SaeStatus) ?? "open",
  createdAt: String(r.created_at ?? ""),
  headId: (r.head_id as string | null) ?? null,
  vcId: (r.vc_id as string | null) ?? null,
  chairmanId: (r.chairman_id as string | null) ?? null,
  hr: (r.hr_data as SaeHrPart | null) ?? null,
  hrName: (r.hr_name as string | null) ?? null,
  hrSignedAt: (r.hr_signed_at as string | null) ?? null,
  head: (r.head_data as SaeHeadPart | null) ?? null,
  headName: (r.head_name as string | null) ?? null,
  headSignedAt: (r.head_signed_at as string | null) ?? null,
  vcRecommendation: (r.vc_recommendation as string | null) ?? null,
  vcName: (r.vc_name as string | null) ?? null,
  vcSignedAt: (r.vc_signed_at as string | null) ?? null,
  chairmanRecommendation: (r.chairman_recommendation as string | null) ?? null,
  chairmanName: (r.chairman_name as string | null) ?? null,
  chairmanSignedAt: (r.chairman_signed_at as string | null) ?? null,
});

export async function fetchSalesAdminEvaluations(): Promise<SalesAdminEvaluation[]> {
  const { data, error } = await client().from("sales_admin_evaluations").select("*").order("created_at", { ascending: false });
  if (error) throw new Error(friendly(error.message));
  return (data as Row[]).map(toEval);
}

export async function createSalesAdminEvaluation(input: { employeeId: string; period: string; headId: string; vcId: string; chairmanId: string; employee: SaeEmployeeInfo }): Promise<string> {
  const id = crypto.randomUUID();
  const { error } = await client().rpc("sae_create", { p_id: id, p_employee: input.employeeId, p_period: input.period, p_head: input.headId, p_vc: input.vcId, p_chairman: input.chairmanId });
  if (error) throw new Error(friendly(error.message));
  await saveHrPart(id, { ...emptyHrPart(), employee: input.employee }, null);
  return id;
}

export type SaeSigner = "hr" | "head" | "vc" | "chairman";
const sigPath = (id: string, as: SaeSigner) => `sae/${id}/${as}.png`;

// Saves HR's part; with `signAs` (HR's employee id) it signs and sends it.
export async function saveHrPart(id: string, part: SaeHrPart, signAs: string | null): Promise<void> {
  if (signAs) await placeMySignature(signAs, sigPath(id, "hr"));
  const { error } = await client().rpc("sae_save_hr", { p_id: id, p_data: part as unknown as Row, p_sign: !!signAs });
  if (error) throw new Error(friendly(error.message));
}

export async function saveHeadPart(id: string, part: SaeHeadPart, signAs: string | null): Promise<void> {
  if (signAs) await placeMySignature(signAs, sigPath(id, "head"));
  const { error } = await client().rpc("sae_save_head", { p_id: id, p_data: part as unknown as Row, p_sign: !!signAs });
  if (error) throw new Error(friendly(error.message));
}

export async function recommendSae(e: SalesAdminEvaluation, me: string, text: string): Promise<void> {
  await placeMySignature(me, sigPath(e.id, e.status === "chairman" ? "chairman" : "vc"));
  const { error } = await client().rpc("sae_recommend", { p_id: e.id, p_recommendation: text });
  if (error) throw new Error(friendly(error.message));
}

export async function reopenSaePart(id: string, part: "hr" | "head"): Promise<void> {
  const { error } = await client().rpc("sae_reopen", { p_id: id, p_part: part });
  if (error) throw new Error(friendly(error.message));
}

export async function deleteSalesAdminEvaluation(e: SalesAdminEvaluation): Promise<void> {
  const { error } = await client().from("sales_admin_evaluations").delete().eq("id", e.id);
  if (error) throw new Error(friendly(error.message));
  await bucket().remove((["hr", "head", "vc", "chairman"] as SaeSigner[]).map((s) => sigPath(e.id, s)));
}

// The signatures given so far, by signer.
export async function saeSignatures(e: SalesAdminEvaluation): Promise<Partial<Record<SaeSigner, Uint8Array>>> {
  const signed: [SaeSigner, string | null][] = [
    ["hr", e.hrSignedAt],
    ["head", e.headSignedAt],
    ["vc", e.vcSignedAt],
    ["chairman", e.chairmanSignedAt],
  ];
  const out: Partial<Record<SaeSigner, Uint8Array>> = {};
  await Promise.all(
    signed
      .filter(([, at]) => at)
      .map(async ([as]) => {
        const { data } = await bucket().download(sigPath(e.id, as));
        if (data) out[as] = new Uint8Array(await data.arrayBuffer());
      }),
  );
  return out;
}
