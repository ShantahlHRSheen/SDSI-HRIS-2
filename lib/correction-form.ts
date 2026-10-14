// The online Attendance Correction Form
// (supabase/migrate_phase36_correction_forms.sql).

export type CorrectionType = "missed_in" | "missed_out" | "missed_both" | "wrong_time" | "device_failure" | "other";

export const CORRECTION_TYPES: { id: CorrectionType; label: string }[] = [
  { id: "missed_in", label: "No time-in recorded" },
  { id: "missed_out", label: "No time-out recorded" },
  { id: "missed_both", label: "No time-in and time-out recorded" },
  { id: "wrong_time", label: "Wrong time recorded" },
  { id: "device_failure", label: "Biometric / device failure" },
  { id: "other", label: "Other" },
];

import { branchDisapproved, waitingBranch, type BranchApproval } from "./branch-approval";

export interface CorrectionForm extends BranchApproval {
  correctionRequestId: string;
  employeeId: string;
  correctionDate: string;
  correctionType: CorrectionType;
  timeIn: string | null;
  timeOut: string | null;
  reason: string;
  employeeName: string;
  position: string;
  branch: string;
  department: string;
  departmentHeadId: string | null;
  departmentHead: string;
  submittedAt: string;
  headDecision: "approved" | "disapproved" | null;
  headReason: string | null;
  headSignedName: string | null;
  headSignedAt: string | null;
  receivedName: string | null;
  receivedAt: string | null;
}

export type CorrectionFormStage = "waiting_branch" | "branch_disapproved" | "waiting_head" | "waiting_hr" | "received";

export function correctionStage(f: CorrectionForm): CorrectionFormStage {
  if (waitingBranch(f)) return "waiting_branch";
  if (branchDisapproved(f)) return "branch_disapproved";
  if (!f.headDecision) return "waiting_head";
  return f.receivedAt ? "received" : "waiting_hr";
}

export function correctionProgress(f: CorrectionForm): { label: string; tone: "warning" | "good" | "critical" | "info" } {
  const decided = f.headDecision === "approved" ? "Approved" : "Disapproved";
  switch (correctionStage(f)) {
    case "waiting_branch":
      return { label: `Waiting for branch approval (${f.branchApprover})`, tone: "warning" };
    case "branch_disapproved":
      return { label: "Disapproved by the branch approver", tone: "critical" };
    case "waiting_head":
      return { label: "Waiting for Department Head approval", tone: "warning" };
    case "waiting_hr":
      return { label: `${decided} by Department Head · Waiting for HR`, tone: f.headDecision === "approved" ? "info" : "critical" };
    case "received":
      return { label: `${decided} · Received by HR`, tone: f.headDecision === "approved" ? "good" : "critical" };
  }
}

// "8:00 AM" from "08:00".
export function timeLabel(t: string | null): string {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}
