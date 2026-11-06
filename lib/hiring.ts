import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient } from "./supabase/client";
import { placeMySignature } from "./supabase/leave-forms";
import { currentCompany } from "./companies";

// Hiring and Onboarding (supabase/migrate_phase81_hiring.sql): one record per
// applicant through four sections — HR screening, the Branch / Department
// Head's interview, background investigation and recommendation, the final
// approver's decision, and onboarding (orientation, team, training and its
// assessment, recommendation for employment signed by the Head, HR and the
// final approver).

export type ApplicantStatus = "screening" | "head" | "final" | "onboarding" | "hr_sign" | "approval" | "hired" | "rejected" | "not_hired" | "withdrawn";
export type PassFail = "passed" | "failed";
export interface TrainingItem {
  skill: string;
  schedule: string;
  status: "planned" | "ongoing" | "completed";
}
export interface AssessmentItem {
  item: string;
  required: number;
  score: number | null;
}
export interface Applicant {
  id: string;
  status: ApplicantStatus;
  name: string;
  email: string;
  contactNumber: string;
  address: string;
  position: string;
  branchId: string | null;
  departmentId: string | null;
  shortlisted: boolean;
  hrInterviewAt: string | null;
  hrInterviewNotes: string;
  hrInterviewResult: PassFail | null;
  headId: string | null;
  headInterviewAt: string | null;
  headInterviewNotes: string;
  headInterviewResult: PassFail | null;
  backgroundFindings: string;
  backgroundResult: PassFail | null;
  headAssessment: string;
  headRecommendation: "hire" | "do_not_hire" | null;
  headSubmittedAt: string | null;
  finalDecision: "hire" | "reject" | null;
  finalComment: string;
  finalDecidedBy: string | null;
  finalDecidedAt: string | null;
  orientationAt: string | null;
  handbookReceivedAt: string | null;
  teamMeetingAt: string | null;
  training: TrainingItem[];
  trainingAssessment: AssessmentItem[];
  evalRecommendation: string;
  evalSubmittedAt: string | null;
  hrSignedBy: string | null;
  hrSignedAt: string | null;
  approval: "approved" | "disapproved" | null;
  approvalComment: string;
  approvedBy: string | null;
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export const STATUS_LABEL: Record<ApplicantStatus, { label: string; tone: "info" | "warning" | "good" | "critical" | "muted" }> = {
  screening: { label: "HR screening", tone: "info" },
  head: { label: "With the Head", tone: "warning" },
  final: { label: "Final decision", tone: "warning" },
  onboarding: { label: "Onboarding", tone: "info" },
  hr_sign: { label: "HR to sign", tone: "warning" },
  approval: { label: "For approval", tone: "warning" },
  hired: { label: "Hired", tone: "good" },
  rejected: { label: "Not passed", tone: "critical" },
  not_hired: { label: "Disapproved", tone: "critical" },
  withdrawn: { label: "Withdrawn", tone: "muted" },
};

export const approverTitle = () => currentCompany().hiringApproverTitle ?? "Final approver";

export function assessmentTotals(items: AssessmentItem[]) {
  const required = items.reduce((t, i) => t + (Number(i.required) || 0), 0);
  const score = items.reduce((t, i) => t + (Number(i.score) || 0), 0);
  const scored = items.length > 0 && items.every((i) => i.score !== null && i.score !== undefined && !Number.isNaN(Number(i.score)));
  return { required, score, scored, passed: scored && score >= required };
}

type Row = Record<string, unknown>;
const db = () => getSupabaseClient() as unknown as SupabaseClient;
const files = () => db().storage.from("hiring-files");
const sigs = () => db().storage.from("leave-forms");
const SETUP = "Hiring & Onboarding isn't set up yet — ask HR to run the latest database update.";
const friendly = (msg: string) => (/(applicants|hiring)/i.test(msg) && /exist|find|not found|schema cache/i.test(msg) ? SETUP : msg);
const fail = (e: { message: string } | null) => {
  if (e) throw new Error(friendly(e.message));
};

const toApplicant = (r: Row): Applicant => ({
  id: String(r.id),
  status: r.status as ApplicantStatus,
  name: String(r.name ?? ""),
  email: String(r.email ?? ""),
  contactNumber: String(r.contact_number ?? ""),
  address: String(r.address ?? ""),
  position: String(r.position ?? ""),
  branchId: (r.branch_id as string | null) ?? null,
  departmentId: (r.department_id as string | null) ?? null,
  shortlisted: !!r.shortlisted,
  hrInterviewAt: (r.hr_interview_at as string | null) ?? null,
  hrInterviewNotes: String(r.hr_interview_notes ?? ""),
  hrInterviewResult: (r.hr_interview_result as PassFail | null) ?? null,
  headId: (r.head_id as string | null) ?? null,
  headInterviewAt: (r.head_interview_at as string | null) ?? null,
  headInterviewNotes: String(r.head_interview_notes ?? ""),
  headInterviewResult: (r.head_interview_result as PassFail | null) ?? null,
  backgroundFindings: String(r.background_findings ?? ""),
  backgroundResult: (r.background_result as PassFail | null) ?? null,
  headAssessment: String(r.head_assessment ?? ""),
  headRecommendation: (r.head_recommendation as Applicant["headRecommendation"]) ?? null,
  headSubmittedAt: (r.head_submitted_at as string | null) ?? null,
  finalDecision: (r.final_decision as Applicant["finalDecision"]) ?? null,
  finalComment: String(r.final_comment ?? ""),
  finalDecidedBy: (r.final_decided_by as string | null) ?? null,
  finalDecidedAt: (r.final_decided_at as string | null) ?? null,
  orientationAt: (r.orientation_at as string | null) ?? null,
  handbookReceivedAt: (r.handbook_received_at as string | null) ?? null,
  teamMeetingAt: (r.team_meeting_at as string | null) ?? null,
  training: Array.isArray(r.training) ? (r.training as TrainingItem[]) : [],
  trainingAssessment: Array.isArray(r.training_assessment) ? (r.training_assessment as AssessmentItem[]) : [],
  evalRecommendation: String(r.eval_recommendation ?? ""),
  evalSubmittedAt: (r.eval_submitted_at as string | null) ?? null,
  hrSignedBy: (r.hr_signed_by as string | null) ?? null,
  hrSignedAt: (r.hr_signed_at as string | null) ?? null,
  approval: (r.approval as Applicant["approval"]) ?? null,
  approvalComment: String(r.approval_comment ?? ""),
  approvedBy: (r.approved_by as string | null) ?? null,
  approvedAt: (r.approved_at as string | null) ?? null,
  createdAt: String(r.created_at ?? ""),
  updatedAt: String(r.updated_at ?? ""),
});

// The fields HR edits (camelCase → columns).
export type HrPatch = Partial<
  Pick<
    Applicant,
    | "status"
    | "name"
    | "email"
    | "contactNumber"
    | "address"
    | "position"
    | "branchId"
    | "departmentId"
    | "shortlisted"
    | "hrInterviewAt"
    | "hrInterviewNotes"
    | "hrInterviewResult"
    | "headId"
    | "headInterviewAt"
    | "orientationAt"
    | "handbookReceivedAt"
    | "teamMeetingAt"
  >
>;
const COLS: Record<keyof HrPatch, string> = {
  status: "status",
  name: "name",
  email: "email",
  contactNumber: "contact_number",
  address: "address",
  position: "position",
  branchId: "branch_id",
  departmentId: "department_id",
  shortlisted: "shortlisted",
  hrInterviewAt: "hr_interview_at",
  hrInterviewNotes: "hr_interview_notes",
  hrInterviewResult: "hr_interview_result",
  headId: "head_id",
  headInterviewAt: "head_interview_at",
  orientationAt: "orientation_at",
  handbookReceivedAt: "handbook_received_at",
  teamMeetingAt: "team_meeting_at",
};
const toRow = (p: HrPatch): Row => Object.fromEntries(Object.entries(p).map(([k, v]) => [COLS[k as keyof HrPatch], v === "" ? null : v]));

export async function fetchApplicants(): Promise<Applicant[]> {
  const { data, error } = await db().from("applicants").select("*").order("updated_at", { ascending: false });
  fail(error);
  return ((data as Row[]) ?? []).map(toApplicant);
}

export async function hasHiringRecords(): Promise<boolean> {
  const { data, error } = await db().from("applicants").select("id").limit(1);
  return !error && (data ?? []).length > 0;
}

export async function createApplicant(p: HrPatch): Promise<string> {
  const { data, error } = await db().from("applicants").insert(toRow(p)).select("id").single();
  fail(error);
  return String((data as Row).id);
}

export async function updateApplicant(id: string, p: HrPatch): Promise<void> {
  const { error } = await db().from("applicants").update(toRow(p)).eq("id", id);
  fail(error);
}

export async function deleteApplicant(id: string): Promise<void> {
  const list = await applicantFiles(id).catch(() => []);
  if (list.length) await files().remove(list.map((f) => f.path));
  await sigs().remove(["head", "hr", "approver"].map((s) => `hire/${id}/${s}.png`));
  const { error } = await db().from("applicants").delete().eq("id", id);
  fail(error);
}

const rpc = async (fn: string, args: Row) => {
  const { error } = await db().rpc(fn, args);
  fail(error);
};

// ---- The Head -----------------------------------------------------------------------

export interface HeadPatch {
  headInterviewNotes?: string;
  headInterviewResult?: PassFail | "";
  backgroundFindings?: string;
  backgroundResult?: PassFail | "";
  headAssessment?: string;
  headRecommendation?: "hire" | "do_not_hire" | "";
  training?: TrainingItem[];
  trainingAssessment?: AssessmentItem[];
  evalRecommendation?: string;
}
export const headSave = (id: string, p: HeadPatch) => rpc("hiring_head_save", { p_id: id, p: p as unknown as Row });
export const headSubmit = (id: string) => rpc("hiring_head_submit", { p_id: id });
export async function headSubmitEval(id: string, me: string): Promise<void> {
  await placeMySignature(me, `hire/${id}/head.png`);
  await rpc("hiring_head_submit_eval", { p_id: id });
}

// ---- HR and the final approver ----------------------------------------------------------

export async function hrSign(id: string, me: string): Promise<void> {
  await placeMySignature(me, `hire/${id}/hr.png`);
  await rpc("hiring_hr_sign", { p_id: id });
}
export async function returnEval(id: string): Promise<void> {
  await sigs().remove([`hire/${id}/head.png`]);
  await rpc("hiring_return_eval", { p_id: id });
}
export const finalDecide = (id: string, hire: boolean, comment: string) => rpc("hiring_final_decide", { p_id: id, p_hire: hire, p_comment: comment });
export async function approve(id: string, me: string, ok: boolean, comment: string): Promise<void> {
  await placeMySignature(me, `hire/${id}/approver.png`);
  await rpc("hiring_approve", { p_id: id, p_approve: ok, p_comment: comment });
}

export async function fetchApproverId(): Promise<string | null> {
  const { data, error } = await db().from("hiring_settings").select("final_approver_id").maybeSingle();
  fail(error);
  return ((data as Row | null)?.final_approver_id as string | null) ?? null;
}
export async function setApproverId(id: string | null): Promise<void> {
  const { error } = await db().from("hiring_settings").update({ final_approver_id: id }).eq("id", true);
  fail(error);
}

// ---- Files and signatures ---------------------------------------------------------------

export interface HiringFile {
  name: string;
  path: string;
  size: number;
}
export const HIRING_FILE_ACCEPT = ".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx";

export async function applicantFiles(id: string): Promise<HiringFile[]> {
  const { data, error } = await files().list(id, { limit: 100, sortBy: { column: "created_at", order: "asc" } });
  fail(error);
  return (data ?? []).filter((f) => f.id).map((f) => ({ name: f.name.replace(/^\d+-(resume|background|other)-/, ""), path: `${id}/${f.name}`, size: Number(f.metadata?.size ?? 0) }));
}
export const fileKind = (f: HiringFile): "resume" | "background" | "other" => {
  const m = /^\d+-(resume|background|other)-/.exec(f.path.split("/")[1] ?? "");
  return (m?.[1] as "resume" | "background" | "other") ?? "other";
};

export async function uploadApplicantFile(id: string, kind: "resume" | "background" | "other", file: File): Promise<void> {
  if (file.size > 10 * 1024 * 1024) throw new Error("Files up to 10 MB.");
  const safe = file.name.replace(/[^A-Za-z0-9._ -]+/g, "_").slice(-100);
  const { error } = await files().upload(`${id}/${Date.now()}-${kind}-${safe}`, file, { contentType: file.type || undefined });
  if (error) throw new Error(/mime|type/i.test(error.message) ? "PDF, Word or image files only." : friendly(error.message));
}
export async function removeApplicantFile(path: string): Promise<void> {
  const { error } = await files().remove([path]);
  fail(error);
}
export async function applicantFileUrl(path: string): Promise<string> {
  const { data, error } = await files().createSignedUrl(path, 600);
  fail(error);
  return data!.signedUrl;
}

export async function signatureUrls(a: Applicant): Promise<Partial<Record<"head" | "hr" | "approver", string>>> {
  const out: Partial<Record<"head" | "hr" | "approver", string>> = {};
  const signed: ["head" | "hr" | "approver", string | null][] = [
    ["head", a.evalSubmittedAt],
    ["hr", a.hrSignedAt],
    ["approver", a.approvedAt],
  ];
  await Promise.all(
    signed
      .filter(([, at]) => at)
      .map(async ([as]) => {
        const { data } = await sigs().createSignedUrl(`hire/${a.id}/${as}.png`, 3600);
        if (data?.signedUrl) out[as] = data.signedUrl;
      }),
  );
  return out;
}
