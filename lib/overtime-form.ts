// The company's "SDSI Overtime Authorization Form", filled in online
// (supabase/migrate_phase28_overtime_forms.sql).

export interface OvertimeForm {
  overtimeRequestId: string;
  employeeId: string;
  schedule: string;
  otDate: string;
  hoursRequested: number;
  tasks: string;
  reason: string;
  employeeName: string;
  position: string;
  branch: string;
  department: string;
  departmentHeadId: string | null;
  departmentHead: string;
  submittedAt: string;
  resubmissions: number;
  headDecision: "approved" | "disapproved" | null;
  headHours: number | null;
  headReason: string | null;
  headSignedName: string | null;
  headSignedAt: string | null;
  hrDecision: "verified" | "disapproved" | "returned" | null;
  hrReason: string | null;
  hrSignedName: string | null;
  hrSignedAt: string | null;
}

export type OvertimeFormStage = "waiting_head" | "head_disapproved" | "waiting_hr" | "returned" | "verified" | "hr_disapproved";

export function otStage(f: OvertimeForm): OvertimeFormStage {
  if (f.headDecision === "disapproved") return "head_disapproved";
  if (!f.headDecision) return "waiting_head";
  if (!f.hrDecision) return "waiting_hr";
  return f.hrDecision === "returned" ? "returned" : f.hrDecision === "verified" ? "verified" : "hr_disapproved";
}

// Finished (nothing more to sign): can be downloaded.
export const otFinal = (f: OvertimeForm) => ["head_disapproved", "verified", "hr_disapproved"].includes(otStage(f));

const hrs = (n: number | null) => `${n ?? 0}h`;

export function otProgress(f: OvertimeForm): { label: string; tone: "warning" | "good" | "critical" | "info" | "serious" } {
  switch (otStage(f)) {
    case "waiting_head":
      return { label: f.resubmissions ? "Resubmitted · Waiting for Department Head approval" : "Waiting for Department Head approval", tone: "warning" };
    case "head_disapproved":
      return { label: "Disapproved by Department Head", tone: "critical" };
    case "waiting_hr":
      return { label: `Approved by Department Head (${hrs(f.headHours)}) · Waiting for HR`, tone: "info" };
    case "returned":
      return { label: "Returned by HR for clarification", tone: "serious" };
    case "verified":
      return { label: `Approved (${hrs(f.headHours)}) · Verified by HR`, tone: "good" };
    case "hr_disapproved":
      return { label: "Disapproved by HR", tone: "critical" };
  }
}

const timeLabel = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${suffix}`;
};

// "Day Shift (8:00 AM – 5:00 PM, Mon–Fri)"
export function scheduleLabel(s: { name: string; timeIn: string; timeOut: string; days: string }): string {
  return `${s.name} (${timeLabel(s.timeIn)} – ${timeLabel(s.timeOut)}, ${s.days})`;
}
