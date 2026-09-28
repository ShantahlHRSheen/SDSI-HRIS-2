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
export type ResponseStage = "to_acknowledge" | "to_explain" | "explained" | "acknowledged";

export function responseStage(r: DisciplinaryRecord): ResponseStage {
  if (!r.acknowledgedAt) return "to_acknowledge";
  if (r.explanationSubmittedAt) return "explained";
  if (r.requiresExplanation) return "to_explain";
  return "acknowledged";
}

export function responseBadge(r: DisciplinaryRecord, today: string, forEmployee = false): { label: string; tone: BadgeTone } {
  const stage = responseStage(r);
  const overdue = !!r.responseDue && r.responseDue < today;
  switch (stage) {
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
