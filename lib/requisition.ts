import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient } from "./supabase/client";
import { placeMySignature } from "./supabase/leave-forms";
import { currentCompany } from "./companies";

// Personnel Requisition Form, HR-PRF-001 (supabase/migrate_phase82_personnel_requisition.sql):
// the Branch / Department Head fills it in and signs; HR reviews, recommends
// and signs; the final approver (VP for Operations — LSMBiz; Vice Chairperson
// — Shantahl, Daro Lending) approves, defers or disapproves, and signs.

export type PrfStatus = "draft" | "hr_review" | "approval" | "approved" | "deferred" | "disapproved" | "cancelled";
export type EmploymentType = "regular" | "probationary" | "reliever" | "project_based";
export type RequestType = "new" | "replace_resigned" | "replace_terminated" | "replace_transferred" | "other";
export type Education = "high_school" | "college" | "vocational" | "other";
export type HrAction = "for_recruitment" | "further_evaluation" | "on_hold" | "not_recommended";
export type Decision = "approved" | "deferred" | "disapproved";

export interface Requisition {
  id: string;
  prfNo: string | null;
  status: PrfStatus;
  position: string;
  branchId: string | null;
  departmentId: string | null;
  requestedByName: string;
  requestedByPosition: string;
  personnelNeeded: number;
  employmentType: EmploymentType | null;
  targetDate: string | null;
  requestType: RequestType | null;
  requestTypeOther: string;
  reason: string;
  previousEmployee: string;
  education: Education | null;
  educationOther: string;
  workExperience: string;
  skills: string;
  headRecommendation: "recommended" | "not_recommended" | null;
  headRemarks: string;
  headSignedAt: string | null;
  hrAction: HrAction | null;
  hrRemarks: string;
  hrReceivedAt: string | null;
  hrTargetCompletion: string | null;
  hrBy: string | null;
  hrName: string;
  hrSignedAt: string | null;
  returnedNote: string;
  decision: Decision | null;
  decisionRemarks: string;
  decidedBy: string | null;
  decidedName: string;
  decidedAt: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export const PRF_STATUS: Record<PrfStatus, { label: string; tone: "info" | "warning" | "good" | "critical" | "muted" }> = {
  draft: { label: "Draft", tone: "muted" },
  hr_review: { label: "For HR review", tone: "warning" },
  approval: { label: "For approval", tone: "warning" },
  approved: { label: "Approved", tone: "good" },
  deferred: { label: "Deferred / on hold", tone: "info" },
  disapproved: { label: "Disapproved", tone: "critical" },
  cancelled: { label: "Cancelled", tone: "muted" },
};
export const EMPLOYMENT_TYPES: [EmploymentType, string][] = [
  ["regular", "Regular"],
  ["probationary", "Probationary"],
  ["reliever", "Reliever"],
  ["project_based", "Project-Based"],
];
export const REQUEST_TYPES: [RequestType, string][] = [
  ["new", "New Position / Additional Manpower"],
  ["replace_resigned", "Replacement of Resigned Employee"],
  ["replace_terminated", "Replacement of Terminated Employee"],
  ["replace_transferred", "Replacement of Transferred Employee"],
  ["other", "Other"],
];
export const EDUCATION: [Education, string][] = [
  ["high_school", "High School Graduate"],
  ["college", "College Graduate / Level"],
  ["vocational", "Vocational"],
  ["other", "Others"],
];
export const HR_ACTIONS: [HrAction, string][] = [
  ["for_recruitment", "For Recruitment"],
  ["further_evaluation", "For Further Evaluation"],
  ["on_hold", "On Hold"],
  ["not_recommended", "Not Recommended"],
];
export const DECISIONS: [Decision, string][] = [
  ["approved", "Approved"],
  ["deferred", "Deferred / On Hold"],
  ["disapproved", "Disapproved"],
];

export const prfApproverTitle = () => currentCompany().requisitionApproverTitle ?? "Final approver";

type Row = Record<string, unknown>;
const db = () => getSupabaseClient() as unknown as SupabaseClient;
const sigs = () => db().storage.from("leave-forms");
const SETUP = "Personnel requisitions aren't set up yet — ask HR to run the latest database update.";
const friendly = (msg: string) => (/(personnel_requisitions|prf_)/i.test(msg) && /exist|find|not found|schema cache/i.test(msg) ? SETUP : msg);
const fail = (e: { message: string } | null) => {
  if (e) throw new Error(friendly(e.message));
};

const COLS = {
  position: "position",
  branchId: "branch_id",
  departmentId: "department_id",
  requestedByName: "requested_by_name",
  requestedByPosition: "requested_by_position",
  personnelNeeded: "personnel_needed",
  employmentType: "employment_type",
  targetDate: "target_date",
  requestType: "request_type",
  requestTypeOther: "request_type_other",
  reason: "reason",
  previousEmployee: "previous_employee",
  education: "education",
  educationOther: "education_other",
  workExperience: "work_experience",
  skills: "skills",
  headRecommendation: "head_recommendation",
  headRemarks: "head_remarks",
  hrAction: "hr_action",
  hrRemarks: "hr_remarks",
  hrReceivedAt: "hr_received_at",
  hrTargetCompletion: "hr_target_completion",
  status: "status",
} as const;
export type PrfPatch = Partial<Pick<Requisition, keyof typeof COLS>>;
const toRow = (p: PrfPatch): Row => Object.fromEntries(Object.entries(p).map(([k, v]) => [COLS[k as keyof typeof COLS], v === "" && !/remarks|other|reason|previous|experience|skills|name|position$/i.test(k) ? null : v]));

const toPrf = (r: Row): Requisition => ({
  id: String(r.id),
  prfNo: (r.prf_no as string | null) ?? null,
  status: r.status as PrfStatus,
  position: String(r.position ?? ""),
  branchId: (r.branch_id as string | null) ?? null,
  departmentId: (r.department_id as string | null) ?? null,
  requestedByName: String(r.requested_by_name ?? ""),
  requestedByPosition: String(r.requested_by_position ?? ""),
  personnelNeeded: Number(r.personnel_needed ?? 1),
  employmentType: (r.employment_type as EmploymentType | null) ?? null,
  targetDate: (r.target_date as string | null) ?? null,
  requestType: (r.request_type as RequestType | null) ?? null,
  requestTypeOther: String(r.request_type_other ?? ""),
  reason: String(r.reason ?? ""),
  previousEmployee: String(r.previous_employee ?? ""),
  education: (r.education as Education | null) ?? null,
  educationOther: String(r.education_other ?? ""),
  workExperience: String(r.work_experience ?? ""),
  skills: String(r.skills ?? ""),
  headRecommendation: (r.head_recommendation as Requisition["headRecommendation"]) ?? null,
  headRemarks: String(r.head_remarks ?? ""),
  headSignedAt: (r.head_signed_at as string | null) ?? null,
  hrAction: (r.hr_action as HrAction | null) ?? null,
  hrRemarks: String(r.hr_remarks ?? ""),
  hrReceivedAt: (r.hr_received_at as string | null) ?? null,
  hrTargetCompletion: (r.hr_target_completion as string | null) ?? null,
  hrBy: (r.hr_by as string | null) ?? null,
  hrName: String(r.hr_name ?? ""),
  hrSignedAt: (r.hr_signed_at as string | null) ?? null,
  returnedNote: String(r.returned_note ?? ""),
  decision: (r.decision as Decision | null) ?? null,
  decisionRemarks: String(r.decision_remarks ?? ""),
  decidedBy: (r.decided_by as string | null) ?? null,
  decidedName: String(r.decided_name ?? ""),
  decidedAt: (r.decided_at as string | null) ?? null,
  createdBy: (r.created_by as string | null) ?? null,
  createdAt: String(r.created_at ?? ""),
  updatedAt: String(r.updated_at ?? ""),
});

export async function fetchRequisitions(): Promise<Requisition[]> {
  const { data, error } = await db().from("personnel_requisitions").select("*").order("updated_at", { ascending: false });
  fail(error);
  return ((data as Row[]) ?? []).map(toPrf);
}
export async function createRequisition(p: PrfPatch): Promise<string> {
  const { data, error } = await db().from("personnel_requisitions").insert(toRow(p)).select("id").single();
  fail(error);
  return String((data as Row).id);
}
export async function updateRequisition(id: string, p: PrfPatch): Promise<void> {
  const { error } = await db().from("personnel_requisitions").update(toRow(p)).eq("id", id);
  fail(error);
}
export async function deleteRequisition(id: string): Promise<void> {
  await sigs().remove(["head", "hr", "approver"].map((s) => `prf/${id}/${s}.png`));
  const { error } = await db().from("personnel_requisitions").delete().eq("id", id);
  fail(error);
}

const rpc = async (fn: string, args: Row) => {
  const { error } = await db().rpc(fn, args);
  fail(error);
};
export async function submitRequisition(id: string, me: string, p: PrfPatch): Promise<void> {
  if (Object.keys(p).length) await updateRequisition(id, p);
  await placeMySignature(me, `prf/${id}/head.png`);
  await rpc("prf_submit", { p_id: id });
}
export async function returnRequisition(id: string, note: string): Promise<void> {
  await sigs().remove([`prf/${id}/head.png`]);
  await rpc("prf_return", { p_id: id, p_note: note });
}
export async function hrReviewRequisition(id: string, me: string, p: PrfPatch): Promise<void> {
  if (Object.keys(p).length) await updateRequisition(id, p);
  await placeMySignature(me, `prf/${id}/hr.png`);
  await rpc("prf_hr_review", { p_id: id });
}
export async function decideRequisition(id: string, me: string, decision: Decision, remarks: string): Promise<void> {
  await placeMySignature(me, `prf/${id}/approver.png`);
  await rpc("prf_decide", { p_id: id, p_decision: decision, p_remarks: remarks });
}

export async function fetchPrfApproverId(): Promise<string | null> {
  const { data, error } = await db().from("hiring_settings").select("requisition_approver_id").maybeSingle();
  if (error) return null;
  return ((data as Row | null)?.requisition_approver_id as string | null) ?? null;
}
export async function setPrfApproverId(id: string | null): Promise<void> {
  const { error } = await db().from("hiring_settings").update({ requisition_approver_id: id }).eq("id", true);
  fail(error);
}

// Signature images, for the form and the PDF.
export async function prfSignatures(r: Requisition): Promise<Partial<Record<"head" | "hr" | "approver", Uint8Array>>> {
  const out: Partial<Record<"head" | "hr" | "approver", Uint8Array>> = {};
  const signed: ["head" | "hr" | "approver", string | null][] = [
    ["head", r.headSignedAt],
    ["hr", r.hrSignedAt],
    ["approver", r.decidedAt],
  ];
  await Promise.all(
    signed
      .filter(([, at]) => at)
      .map(async ([as]) => {
        const { data } = await sigs().download(`prf/${r.id}/${as}.png`);
        if (data) out[as] = new Uint8Array(await data.arrayBuffer());
      }),
  );
  return out;
}
