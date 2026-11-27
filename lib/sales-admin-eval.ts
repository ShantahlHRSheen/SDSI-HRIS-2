import { getSupabaseClient } from "./supabase/client";
import { placeMySignature } from "./supabase/leave-forms";

// Employee evaluation (Monthly, Year-end or for Regularization)
// (supabase/migrate_phase63_sales_admin_evaluation.sql, phase 64), from HR's
// Sales Admin workbook: HR rates Behavior (and, on the Sales Admin form,
// enters the monthly sales); the Department Head rates Job Performance; each
// gives an overall rating, comment and recommendation and signs. Then the
// Vice Chairperson and the Chairman give their recommendation.
//   Sales Admin form: Behavior 10 + Job Performance 10 + Sales 80.
//   Other employees:  Behavior 40 + Job Performance 60.
// The pass mark is the company's (lib/companies.ts).

export type SaeForm = "sales_admin" | "general";
export const SAE_FORMS: Record<SaeForm, { label: string; title: string }> = {
  sales_admin: { label: "Sales Admin (with sales)", title: "SALES ADMIN EVALUATION" },
  general: { label: "Other employees", title: "EMPLOYEE PERFORMANCE EVALUATION" },
};
export const SAE_PURPOSES = ["Monthly Evaluation", "Year-end Evaluation", "Evaluation for Regularization"];

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

// Other employees: the Sales Admin items, with Accomplishment and Learning
// and growth strategies in place of the two quota items.
export const SAE_JOB_GENERAL: { kra: string; objective: string }[] = [
  ...SAE_JOB.slice(0, 4),
  { kra: "Accomplishment", objective: "Accomplished 100% of the requirements monthly" },
  { kra: "Learning and growth strategies", objective: "Shows willingness to learn new skills, improve performance, and adapt to new processes or tools" },
];
export const jobItems = (form: SaeForm) => (form === "general" ? SAE_JOB_GENERAL : SAE_JOB);

export const SAE_SCALE: { value: number; label: string; tagalog: string }[] = [
  { value: 0, label: "Doesn't demonstrate", tagalog: "HINDI NAGAWA" },
  { value: 1, label: "Demonstrates poorly", tagalog: "NAGAWA PERO HINDI MAAYOS" },
  { value: 2, label: "Demonstrates satisfactorily", tagalog: "PWEDE NA" },
  { value: 3, label: "Demonstrates excellently", tagalog: "NAGAWA PERFECTLY" },
];

export const SAE_OVERALL = ["Outstanding", "Exceeds Expectation", "Meets Expectation", "Needs Improvement"];

export const SAE_WEIGHTS = { behavior: 10, job: 10, sales: 80 };
export const SAE_WEIGHTS_GENERAL = { behavior: 40, job: 60, sales: 0 };
export const saeWeights = (form: SaeForm) => (form === "general" ? SAE_WEIGHTS_GENERAL : SAE_WEIGHTS);
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
  // Optional: a special award HR / the head suggests, and why.
  award?: string;
  awardJustification?: string;
}

export interface SaeHeadPart {
  job: Rating[];
  overall: string;
  comment: string;
  recommendation: string;
  // Optional: a special award HR / the head suggests, and why.
  award?: string;
  awardJustification?: string;
}

export type SaeStatus = "open" | "vc" | "chairman" | "done";

export interface SalesAdminEvaluation {
  id: string;
  employeeId: string;
  employeeName: string;
  form: SaeForm;
  purpose: string;
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
  // A second Department Head who also rates Job Performance (Cebu).
  head2Id: string | null;
  head2: SaeHeadPart | null;
  head2Name: string | null;
  head2SignedAt: string | null;
  vcRecommendation: string | null;
  vcName: string | null;
  vcSignedAt: string | null;
  chairmanRecommendation: string | null;
  chairmanName: string | null;
  chairmanSignedAt: string | null;
  // Released to the employee by HR, and the employee's acknowledgement (phase 98).
  releasedAt: string | null;
  releasedBy: string | null;
  acknowledgedAt: string | null;
}

export const emptyHrPart = (): SaeHrPart => ({ behavior: SAE_BEHAVIOR.map(() => null), sales: [], overall: "", comment: "", recommendation: "" });
export const emptyHeadPart = (form: SaeForm): SaeHeadPart => ({ job: jobItems(form).map(() => null), overall: "", comment: "", recommendation: "" });

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
  behavior: number; // of 10 (Sales Admin) or 40
  job: number; // of 10 or 60
  sales: number; // of 80; 0 on the general form
  total: number;
  passed: boolean;
  complete: boolean; // every item rated and some sales entered
}

// `heads`: each Department Head's part (two for Cebu). Job Performance
// averages the heads' ratings item by item: (Mary Jane's total + Marlyn's
// total) ÷ 2 ÷ 6 items ÷ 3 × the weight.
// Passing scores: 80 for other employees, and for Sales Admins on a Year-end
// Evaluation; otherwise the company's Sales Admin mark (90).
export const SAE_PASS_GENERAL = 80;
export const SAE_PASS_YEAR_END = 80;
export function saePassMark(e: { form: SaeForm; purpose: string }, salesAdminPassMark: number): number {
  if (e.form === "general") return SAE_PASS_GENERAL;
  if (e.purpose === "Year-end Evaluation") return SAE_PASS_YEAR_END;
  return salesAdminPassMark;
}

export function saeScores(form: SaeForm, hr: SaeHrPart | null, heads: (SaeHeadPart | null)[], passMark: number): SaeScores {
  const w = saeWeights(form);
  const b = rated(hr?.behavior);
  const items = jobItems(form);
  const j = items
    .map((_, i) => rated(heads.map((h) => h?.job?.[i] ?? null)))
    .filter((xs) => xs.length > 0)
    .map(avg);
  const allHeadsDone = heads.every((h) => rated(h?.job).length === items.length);
  const months = form === "general" ? [] : (hr?.sales ?? []).map(monthSalesScore).filter((x): x is number => x !== null);
  const behavior = r2((avg(b) / 3) * w.behavior);
  const job = r2((avg(j) / 3) * w.job);
  const sales = r2(avg(months));
  const total = r2(behavior + job + sales);
  const complete = b.length === SAE_BEHAVIOR.length && allHeadsDone && (form === "general" || months.length > 0);
  return { behavior, job, sales, total, passed: total >= passMark, complete };
}

export function saeStatusLabel(e: SalesAdminEvaluation): { label: string; tone: "warning" | "good" | "info" } {
  if (e.status === "done") return { label: "Completed", tone: "good" };
  // Year-end Evaluations have no Vice Chairperson or Chairman (phase 95).
  if (e.status === "chairman") return { label: "Waiting for the Chairman", tone: "info" };
  if (e.status === "vc") return { label: "Waiting for the Vice Chairperson", tone: "info" };
  const waiting = [!e.hrSignedAt && "HR", !e.headSignedAt && (e.headName || "the Department Head"), e.head2Id && !e.head2SignedAt && (e.head2Name || "the second Department Head")].filter(Boolean);
  return { label: `Waiting for ${waiting.join(" and ")}`, tone: "warning" };
}

// What the signed-in person has to do on an evaluation, if anything.
export function saeMyTurn(e: SalesAdminEvaluation, me: string | undefined, isHr: boolean): "hr" | "head" | "recommend" | null {
  if (e.status === "open" && isHr && !e.hrSignedAt) return "hr";
  if (me && e.status === "open" && e.headId === me && !e.headSignedAt) return "head";
  if (me && e.status === "open" && e.head2Id === me && !e.head2SignedAt) return "head";
  if (me && ((e.status === "vc" && e.vcId === me) || (e.status === "chairman" && e.chairmanId === me))) return "recommend";
  return null;
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
  neq: (c: string, v: string) => Query;
  or: (f: string) => Query;
  limit: (n: number) => Query;
  order: (c: string, o?: { ascending: boolean }) => Query;
};
type Client = { from: (t: string) => Query; rpc: (fn: string, a?: Row) => PromiseLike<{ error: { message: string } | null }> };
const client = () => getSupabaseClient() as unknown as Client;
const bucket = () => getSupabaseClient().storage.from("leave-forms");

const SETUP = "Evaluations aren't set up yet — ask HR to run the latest database update.";
const friendly = (msg: string) => (/(sales_admin_evaluations|sae_)/i.test(msg) && /exist|find|not found|schema cache/i.test(msg) ? SETUP : msg);

const toEval = (r: Row): SalesAdminEvaluation => ({
  id: String(r.id),
  employeeId: String(r.employee_id),
  employeeName: String(r.employee_name ?? ""),
  form: r.form === "general" ? "general" : "sales_admin",
  purpose: String(r.purpose ?? "Evaluation for Regularization"),
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
  head2Id: (r.head2_id as string | null) ?? null,
  head2: (r.head2_data as SaeHeadPart | null) ?? null,
  head2Name: (r.head2_name as string | null) ?? null,
  head2SignedAt: (r.head2_signed_at as string | null) ?? null,
  vcRecommendation: (r.vc_recommendation as string | null) ?? null,
  vcName: (r.vc_name as string | null) ?? null,
  vcSignedAt: (r.vc_signed_at as string | null) ?? null,
  chairmanRecommendation: (r.chairman_recommendation as string | null) ?? null,
  chairmanName: (r.chairman_name as string | null) ?? null,
  chairmanSignedAt: (r.chairman_signed_at as string | null) ?? null,
  releasedAt: (r.released_at as string | null) ?? null,
  releasedBy: (r.released_by as string | null) ?? null,
  acknowledgedAt: (r.acknowledged_at as string | null) ?? null,
});

// Whether the employee is a head on any evaluation (for the menu).
// Whether the person can see any evaluation other than their own: as a head
// named on it, or as a supervisor / Department Head of the employee (the
// database only returns those, phase 96).
export async function isEvaluationHead(employeeId: string): Promise<boolean> {
  void employeeId; // the database returns only what the person may see
  const { data, error } = await client().from("sales_admin_evaluations").select("id").limit(1);
  return !error && ((data as Row[] | null) ?? []).length > 0;
}

export async function fetchSalesAdminEvaluations(): Promise<SalesAdminEvaluation[]> {
  const { data, error } = await client().from("sales_admin_evaluations").select("*").order("created_at", { ascending: false });
  if (error) throw new Error(friendly(error.message));
  return (data as Row[]).map(toEval);
}

export async function createSalesAdminEvaluation(input: {
  employeeId: string;
  form: SaeForm;
  purpose: string;
  period: string;
  headId: string;
  head2Id: string | null;
  vcId: string | null; // none: straight to the Chairman
  chairmanId: string | null; // none for a Year-end Evaluation (phase 95)
  employee: SaeEmployeeInfo;
}): Promise<string> {
  const id = crypto.randomUUID();
  const { error } = await client().rpc("sae_create", {
    p_id: id,
    p_employee: input.employeeId,
    p_period: input.period,
    p_head: input.headId,
    p_vc: input.vcId || null,
    p_chairman: input.chairmanId || null,
    p_form: input.form,
    p_purpose: input.purpose,
    p_head2: input.head2Id || null,
  });
  if (error) throw new Error(friendly(error.message));
  await saveHrPart(id, { ...emptyHrPart(), employee: input.employee }, null);
  return id;
}

export type SaeSigner = "hr" | "head" | "head2" | "vc" | "chairman" | "employee";
const SIGNERS: SaeSigner[] = ["hr", "head", "head2", "vc", "chairman", "employee"];
// Every head's part, for scoring.
export const saeHeads = (e: SalesAdminEvaluation): (SaeHeadPart | null)[] => (e.head2Id ? [e.head, e.head2] : [e.head]);
const sigPath = (id: string, as: SaeSigner) => `sae/${id}/${as}.png`;

// Saves HR's part; with `signAs` (HR's employee id) it signs and sends it.
export async function saveHrPart(id: string, part: SaeHrPart, signAs: string | null): Promise<void> {
  if (signAs) await placeMySignature(signAs, sigPath(id, "hr"));
  const { error } = await client().rpc("sae_save_hr", { p_id: id, p_data: part as unknown as Row, p_sign: !!signAs });
  if (error) throw new Error(friendly(error.message));
}

// `slot`: the first or the second head (the caller's own part).
export async function saveHeadPart(id: string, slot: "head" | "head2", part: SaeHeadPart, signAs: string | null): Promise<void> {
  if (signAs) await placeMySignature(signAs, sigPath(id, slot));
  const { error } = await client().rpc("sae_save_head", { p_id: id, p_data: part as unknown as Row, p_sign: !!signAs });
  if (error) throw new Error(friendly(error.message));
}

// A head's own signed part they may still edit (phase 97): until management
// has given a recommendation.
export function saeEditableSlot(e: SalesAdminEvaluation, me: string | undefined): "head" | "head2" | null {
  if (!me) return null;
  const open = e.status === "open" || e.status === "vc" || (e.status === "chairman" && !e.vcId) || (e.status === "done" && !e.vcId && !e.chairmanId);
  if (!open || e.acknowledgedAt) return null;
  if (e.headId === me && e.headSignedAt) return "head";
  if (e.head2Id === me && e.head2SignedAt) return "head2";
  return null;
}

export async function editHeadPart(id: string, part: SaeHeadPart, reason: string): Promise<void> {
  const { error } = await client().rpc("sae_edit_head", { p_id: id, p_data: part as unknown as Row, p_reason: reason.trim() || null });
  if (error) throw new Error(friendly(error.message));
}

export interface SaeEdit {
  id: string;
  evaluationId: string;
  part: "head" | "head2";
  editorName: string;
  editedAt: string;
  before: SaeHeadPart | null;
  after: SaeHeadPart;
  reason: string | null;
}

// Every edit the signed-in person can see (only for evaluations they can see);
// none when the update (phase 97) hasn't been run yet.
export async function fetchSaeEdits(): Promise<SaeEdit[]> {
  const { data, error } = await client().from("sales_admin_evaluation_edits").select("*").order("edited_at", { ascending: true });
  if (error) return [];
  return ((data as Row[] | null) ?? []).map((r) => ({
    id: String(r.id),
    evaluationId: String(r.evaluation_id),
    part: r.part === "head2" ? "head2" : "head",
    editorName: String(r.editor_name ?? ""),
    editedAt: String(r.edited_at ?? ""),
    before: (r.before_data as SaeHeadPart | null) ?? null,
    after: r.after_data as SaeHeadPart,
    reason: (r.reason as string | null) ?? null,
  }));
}

// What an edit changed, line by line ("Productivity: 2 → 3").
export function saeEditChanges(form: SaeForm, before: SaeHeadPart | null, after: SaeHeadPart): string[] {
  const out: string[] = [];
  const v = (x: Rating | undefined) => (typeof x === "number" ? String(x) : "—");
  jobItems(form).forEach((j, i) => {
    if ((before?.job?.[i] ?? null) !== (after.job?.[i] ?? null)) out.push(`${j.kra}: ${v(before?.job?.[i])} → ${v(after.job?.[i])}`);
  });
  const t = (x: string | undefined | null) => (x ?? "").trim();
  const q = (x: string) => (x ? `“${x.length > 80 ? `${x.slice(0, 80)}…` : x}”` : "—");
  if (t(before?.overall) !== t(after.overall)) out.push(`Overall rating: ${t(before?.overall) || "—"} → ${t(after.overall) || "—"}`);
  if (t(before?.recommendation) !== t(after.recommendation)) out.push(`Recommendation: ${q(t(before?.recommendation))} → ${q(t(after.recommendation))}`);
  if (t(before?.comment) !== t(after.comment)) out.push(`Comment: ${q(t(before?.comment))} → ${q(t(after.comment))}`);
  if (t(before?.award) !== t(after.award)) out.push(`Suggested award: ${q(t(before?.award))} → ${q(t(after.award))}`);
  else if (t(before?.awardJustification) !== t(after.awardJustification)) out.push(`Award justification: ${q(t(before?.awardJustification))} → ${q(t(after.awardJustification))}`);
  return out;
}

// HR releases a completed evaluation to the employee, or takes it back
// (until the employee acknowledges) — phase 98.
export async function releaseSae(id: string, release: boolean): Promise<void> {
  const { error } = await client().rpc("sae_release", { p_id: id, p_release: release });
  if (error) throw new Error(friendly(error.message));
}

// The employee signs that they've read their released evaluation.
export async function acknowledgeSae(id: string, me: string): Promise<void> {
  await placeMySignature(me, sigPath(id, "employee"));
  const { error } = await client().rpc("sae_acknowledge", { p_id: id });
  if (error) throw new Error(friendly(error.message));
}

// The person's own released evaluations still to acknowledge.
export async function myEvaluationsToAcknowledge(me: string): Promise<{ id: string; purpose: string; period: string }[]> {
  const { data, error } = await client().from("sales_admin_evaluations").select("id, purpose, period, released_at, acknowledged_at, status").eq("employee_id", me);
  if (error) return [];
  return ((data as Row[] | null) ?? [])
    .filter((r) => r.status === "done" && r.released_at && !r.acknowledged_at)
    .map((r) => ({ id: String(r.id), purpose: String(r.purpose ?? ""), period: String(r.period ?? "") }));
}

export async function recommendSae(e: SalesAdminEvaluation, me: string, text: string): Promise<void> {
  await placeMySignature(me, sigPath(e.id, e.status === "chairman" ? "chairman" : "vc"));
  const { error } = await client().rpc("sae_recommend", { p_id: e.id, p_recommendation: text });
  if (error) throw new Error(friendly(error.message));
}

export async function reopenSaePart(id: string, part: "hr" | "head" | "head2"): Promise<void> {
  const { error } = await client().rpc("sae_reopen", { p_id: id, p_part: part });
  if (error) throw new Error(friendly(error.message));
}

export async function deleteSalesAdminEvaluation(e: SalesAdminEvaluation): Promise<void> {
  const { error } = await client().from("sales_admin_evaluations").delete().eq("id", e.id);
  if (error) throw new Error(friendly(error.message));
  await bucket().remove(SIGNERS.map((s) => sigPath(e.id, s)));
}

// The signatures given so far, by signer.
export async function saeSignatures(e: SalesAdminEvaluation): Promise<Partial<Record<SaeSigner, Uint8Array>>> {
  const signed: [SaeSigner, string | null][] = [
    ["hr", e.hrSignedAt],
    ["head", e.headSignedAt],
    ["head2", e.head2SignedAt],
    ["vc", e.vcSignedAt],
    ["chairman", e.chairmanSignedAt],
    ["employee", e.acknowledgedAt],
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

export const awardLine = (p: { award?: string; awardJustification?: string } | null | undefined) =>
  p?.award?.trim() ? `Suggested Special Award: ${p.award.trim()}${p.awardJustification?.trim() ? ` — Justification: ${p.awardJustification.trim()}` : ""}` : "";
