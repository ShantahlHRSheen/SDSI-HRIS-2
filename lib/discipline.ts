import type { BadgeTone } from "@/components/Badge";
import type { DisciplinaryRecord, DisciplinaryType } from "./types";

export const DISCIPLINE_TYPE_TONE: Record<DisciplinaryType, BadgeTone> = {
  incident_report: "info",
  verbal_warning: "muted",
  written_warning: "warning",
  suspension: "serious",
  nte: "warning",
  nod: "critical",
};

// Where the employee is in responding to a record.
export type ResponseStage = "withdrawn" | "excuse_pending" | "hr_to_sign" | "manager_to_sign" | "branch_to_sign" | "to_acknowledge" | "to_explain" | "explained" | "acknowledged";

export function responseStage(r: DisciplinaryRecord): ResponseStage {
  // Withdrawn: excused days left fewer than 5 late days.
  if (r.withdrawnAt) return "withdrawn";
  // Signed HR Manager → Department Manager before the employee gets it.
  if (r.signFlow && !r.hrSignedAt) return "hr_to_sign";
  if (r.signFlow && !r.managerSignedAt) return "manager_to_sign";
  if (r.signFlow && r.branchManagerId && !r.branchManagerSignedAt) return "branch_to_sign";
  // Held from the employee while a manager's excuse request waits for HR.
  if (r.signFlow && (r.excuseRequests ?? []).some((x) => x.status === "pending")) return "excuse_pending";
  if (!r.acknowledgedAt) return "to_acknowledge";
  if (r.explanationSubmittedAt) return "explained";
  if (r.requiresExplanation) return "to_explain";
  return "acknowledged";
}

export function responseBadge(r: DisciplinaryRecord, today: string, forEmployee = false): { label: string; tone: BadgeTone } {
  const stage = responseStage(r);
  const overdue = !!r.responseDue && r.responseDue < today;
  switch (stage) {
    case "withdrawn":
      return { label: "Withdrawn — excused below 5 days", tone: "muted" };
    case "excuse_pending":
      return { label: "Excuse request waiting for HR", tone: "warning" };
    case "hr_to_sign":
      return { label: "Awaiting HR Manager signature", tone: "warning" };
    case "manager_to_sign":
      return { label: "Awaiting Department Manager signature", tone: "warning" };
    case "branch_to_sign":
      return { label: "Awaiting Branch Manager signature", tone: "warning" };
    case "to_acknowledge":
      return { label: forEmployee ? "Please acknowledge" : "Awaiting acknowledgement", tone: "warning" };
    case "to_explain":
      return overdue ? { label: "Explanation overdue", tone: "critical" } : { label: forEmployee ? "Explanation needed" : "Awaiting explanation", tone: "warning" };
    case "explained":
      return { label: "Explanation submitted", tone: "good" };
    default:
      return { label: "Acknowledged", tone: "good" };
  }
}

// Default days given to answer a Notice to Explain (at least 5 calendar days
// under DOLE rules on due process).
export const NTE_RESPONSE_DAYS = 5;

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
