import type { LeaveRequest, LeaveType } from "./types";
import { balanceFor } from "./leave-policy";

// The company's "APPLICATION FOR LEAVE" form, filled in online
// (supabase/migrate_phase27_leave_forms.sql).

export type LeaveCategory =
  | "vacation_with_pay"
  | "vacation_without_pay"
  | "sick_with_pay"
  | "sick_without_pay"
  | "maternity"
  | "absent_without_pay"
  | "bereavement_with_pay"
  | "bereavement_without_pay";

// As on the paper form, and the leave type each one is filed as.
export const LEAVE_CATEGORIES: { id: LeaveCategory; label: string; leaveTypeId: string }[] = [
  { id: "vacation_with_pay", label: "Vacation with Pay", leaveTypeId: "lt-vl" },
  { id: "vacation_without_pay", label: "Vacation without Pay", leaveTypeId: "lt-lwop" },
  { id: "sick_with_pay", label: "Sick with Pay", leaveTypeId: "lt-sl" },
  { id: "sick_without_pay", label: "Sick without Pay", leaveTypeId: "lt-lwop" },
  { id: "maternity", label: "Maternity", leaveTypeId: "lt-ml" },
  { id: "absent_without_pay", label: "Absent without pay", leaveTypeId: "lt-lwop" },
  { id: "bereavement_with_pay", label: "Bereavement with Pay", leaveTypeId: "lt-bl" },
  { id: "bereavement_without_pay", label: "Bereavement without Pay", leaveTypeId: "lt-lwop" },
];

export const isSickCategory = (c: LeaveCategory) => c === "sick_with_pay" || c === "sick_without_pay";
export const isVacationCategory = (c: LeaveCategory) => c === "vacation_with_pay" || c === "vacation_without_pay" || c === "absent_without_pay";

// Certificate of leave credits.
export interface LeaveCredits {
  asOf: string; // YYYY-MM-DD
  vl: number;
  sl: number;
  lessVl: number;
  lessSl: number;
}

export function leaveCredits(requests: LeaveRequest[], employeeId: string, leaveTypes: LeaveType[], category: LeaveCategory, startDate: string, days: number, asOf: string): LeaveCredits {
  const vlType = leaveTypes.find((t) => t.id === "lt-vl");
  const slType = leaveTypes.find((t) => t.id === "lt-sl");
  // The balance of the half-year the leave falls in.
  const vl = vlType ? balanceFor(requests, employeeId, vlType, startDate || asOf).remaining : 0;
  const sl = slType ? balanceFor(requests, employeeId, slType, startDate || asOf).remaining : 0;
  return { asOf, vl, sl, lessVl: category === "vacation_with_pay" ? days : 0, lessSl: category === "sick_with_pay" ? days : 0 };
}

// Department head's approval: days by kind.
export const HEAD_DAY_FIELDS = [
  { id: "vlWithPay", label: "Days’ vacation leave with pay" },
  { id: "slWithPay", label: "Day’s sick leave with pay" },
  { id: "vlWithoutPay", label: "Days’ vacation leave without pay" },
  { id: "slWithoutPay", label: "Day’s sick leave without pay" },
  { id: "specialWithPay", label: "Day’s special privilege with pay" },
  { id: "absentWithoutPay", label: "Day’s absent without pay" },
] as const;
export type HeadDayField = (typeof HEAD_DAY_FIELDS)[number]["id"];
export type HeadDays = Partial<Record<HeadDayField, number>>;

// What the head's part starts with: the days applied for, under their kind.
export function defaultHeadDays(category: LeaveCategory, days: number): HeadDays {
  const field: Record<LeaveCategory, HeadDayField> = {
    vacation_with_pay: "vlWithPay",
    vacation_without_pay: "vlWithoutPay",
    sick_with_pay: "slWithPay",
    sick_without_pay: "slWithoutPay",
    maternity: "specialWithPay",
    bereavement_with_pay: "specialWithPay",
    bereavement_without_pay: "absentWithoutPay",
    absent_without_pay: "absentWithoutPay",
  };
  return { [field[category]]: days };
}

export interface LeaveForm {
  leaveRequestId: string;
  employeeId: string;
  applicationDate: string;
  category: LeaveCategory;
  sickPlace: "hospital" | "out_patient" | null;
  sickDetails: string;
  reason: string;
  credits: LeaveCredits;
  employeeName: string;
  designation: string;
  branch: string;
  department: string;
  departmentHeadId: string | null;
  departmentHead: string;
  submittedAt: string;
  headDays: HeadDays | null;
  headDecision: "approved" | "disapproved" | null;
  headReason: string | null;
  headSignedBy: string | null;
  headSignedName: string | null;
  headSignedAt: string | null;
  receivedBy: string | null;
  receivedName: string | null;
  receivedAt: string | null;
}

export type LeaveFormStage = "waiting_head" | "waiting_hr" | "received";

export function formStage(f: LeaveForm): LeaveFormStage {
  return f.receivedAt ? "received" : f.headDecision ? "waiting_hr" : "waiting_head";
}

// The progress shown to the employee.
export function formProgress(f: LeaveForm): { label: string; tone: "warning" | "good" | "critical" | "info" } {
  const decision = f.headDecision === "approved" ? "Approved" : "Disapproved";
  if (f.receivedAt) return { label: `${decision} · Received by HR`, tone: f.headDecision === "approved" ? "good" : "critical" };
  if (f.headDecision) return { label: `${decision} by Department Head · Waiting for HR`, tone: f.headDecision === "approved" ? "info" : "critical" };
  return { label: "Waiting for Department Head approval", tone: "warning" };
}
