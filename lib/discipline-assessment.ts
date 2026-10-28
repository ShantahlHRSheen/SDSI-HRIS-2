import { getSupabaseClient } from "./supabase/client";
import { SANCTION_CHOICES } from "./nte-tardiness";
import { responseStage } from "./discipline";
import type { DisciplinaryRecord } from "./types";

// The Department Head's assessment of a written explanation
// (supabase/migrate_phase61_discipline_head_assessment.sql): on an NTE or
// incident report a Department Head issued, once the employee explains, the
// head comments and recommends the disciplinary action to HR. The employee
// never sees it.

export interface DisciplineAssessment {
  recordId: string;
  assessorId: string | null;
  assessorName: string;
  comment: string;
  recommendation: string;
  assessedAt: string;
}

export const RECOMMENDATIONS = ["No disciplinary action — explanation accepted", ...SANCTION_CHOICES];

// Records that take the head's assessment: an NTE or incident report issued
// by someone other than HR (HR-issued and generated tardiness NTEs follow
// their own steps).
export const takesAssessment = (r: DisciplinaryRecord, hrIds: Set<string>) =>
  (r.type === "nte" || r.type === "incident_report") && !r.signFlow && !hrIds.has(r.issuedBy);

type Row = Record<string, unknown>;
type Client = {
  from: (t: string) => { select: (c: string) => PromiseLike<{ data: unknown; error: { message: string } | null }> };
  rpc: (fn: string, a: Row) => PromiseLike<{ error: { message: string } | null }>;
};
const client = () => getSupabaseClient() as unknown as Client;
const SETUP = "Assessments aren't set up yet — ask HR to run the latest database update.";

export async function fetchAssessments(): Promise<DisciplineAssessment[]> {
  const { data, error } = await client().from("discipline_assessments").select("*");
  if (error) {
    if (/discipline_assessments/.test(error.message)) return [];
    throw new Error(error.message);
  }
  return (data as Row[]).map((r) => ({
    recordId: String(r.record_id),
    assessorId: (r.assessor_id as string | null) ?? null,
    assessorName: String(r.assessor_name ?? ""),
    comment: String(r.comment ?? ""),
    recommendation: String(r.recommendation ?? ""),
    assessedAt: String(r.assessed_at ?? ""),
  }));
}

export async function saveAssessment(recordId: string, comment: string, recommendation: string): Promise<void> {
  const { error } = await client().rpc("discipline_assess", { p_record: recordId, p_comment: comment, p_recommendation: recommendation });
  if (error) throw new Error(/discipline_assess/.test(error.message) && /find|exist|schema/.test(error.message) ? SETUP : error.message);
}

// What the signed-in person has to do on the disciplinary records they can
// see (the Discipline page's and the dashboard's "Needs your action").
export function disciplineActions(
  records: DisciplinaryRecord[],
  me: string | undefined,
  isHr: boolean,
  assessments: DisciplineAssessment[],
  hrIds: Set<string>,
): { r: DisciplinaryRecord; action: string }[] {
  if (!me) return [];
  const out: { r: DisciplinaryRecord; action: string }[] = [];
  for (const r of records) {
    if (r.withdrawnAt || r.status === "resolved" || r.employeeId === me) continue;
    const stage = responseStage(r);
    if (isHr && stage === "hr_to_sign") out.push({ r, action: "Sign as HR Manager" });
    if (stage === "branch_to_sign" && r.branchManagerId === me) out.push({ r, action: "Sign as Branch Manager" });
    if (stage === "manager_to_sign" && r.managerId === me) out.push({ r, action: "Sign as Department Manager" });
    if (r.signFlow && r.explanationSubmittedAt && isHr && !r.explHrReceivedAt) out.push({ r, action: "Receive the written explanation (HR)" });
    if (r.explanationSubmittedAt && r.managerId === me && !r.explMgrReceivedAt) out.push({ r, action: "Receive the written explanation" });
    if (r.explanationSubmittedAt && r.issuedBy === me && takesAssessment(r, hrIds) && !assessments.some((a) => a.recordId === r.id))
      out.push({ r, action: "Assess the explanation and recommend an action to HR" });
    const a = isHr ? assessments.find((x) => x.recordId === r.id) : undefined;
    if (a) out.push({ r, action: `Issue the Notice of Sanction — head recommends ${a.recommendation}` });
    if (isHr && r.noticeData?.kind === "tardiness" && r.explHrReceivedAt && r.explMgrReceivedAt && !records.some((x) => x.noticeData?.kind === "sanction" && x.noticeData.nteId === r.id))
      out.push({ r, action: "Issue the Notice of Sanction (tardiness)" });
    // HR's own NTEs / incident reports: once explained, HR decides.
    if (
      isHr &&
      !r.signFlow &&
      (r.type === "nte" || r.type === "incident_report") &&
      r.explanationSubmittedAt &&
      hrIds.has(r.issuedBy) &&
      !a &&
      !records.some((x) => x.noticeData?.kind === "sanction" && x.noticeData.nteId === r.id)
    )
      out.push({ r, action: "Review the explanation — issue a Notice of Decision or mark resolved" });
    if (isHr && (r.excuseRequests ?? []).some((x) => x.status === "pending")) out.push({ r, action: "Accept or decline the late days a manager asked to excuse" });
  }
  return out;
}
