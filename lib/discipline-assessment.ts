import { getSupabaseClient } from "./supabase/client";
import { SANCTION_CHOICES } from "./nte-tardiness";
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
