import type { Announcement, AttendanceCorrectionRequest, DemoUser, Employee, LeaveRequest, LeaveType, OvertimeRequest } from "./types";
import { TODAY, daysBetween } from "./mock-data";
import { fullName } from "./helpers";

// ---------------------------------------------------------------------------
// Notifications are derived live from existing state (pending approvals
// scoped to the current user, recent decisions on the current user's own
// requests, and recent announcements) rather than a separate persisted
// notification log — there is nothing here that isn't already a fact
// recorded elsewhere in the store.
// ---------------------------------------------------------------------------

export interface NotificationItem {
  id: string;
  text: string;
  date: string;
  tone: "info" | "good" | "warning" | "critical";
}

function canDecide(currentUser: DemoUser | null, currentEmployeeId: string | undefined, targetEmployeeId: string, employees: Employee[]): boolean {
  if (!currentUser || !currentEmployeeId) return false;
  if (currentUser.roles.some((r) => ["hr_admin", "upper_management"].includes(r))) return true;
  const target = employees.find((e) => e.id === targetEmployeeId);
  return !!target && target.supervisorId === currentEmployeeId;
}

export function relativeTime(dateStr: string): string {
  const d = daysBetween(dateStr, TODAY);
  if (d <= 0) return "Today";
  if (d === 1) return "1d ago";
  return `${d}d ago`;
}

export function buildNotifications(params: {
  currentUser: DemoUser | null;
  currentEmployee: Employee | null;
  employees: Employee[];
  leaveRequests: LeaveRequest[];
  overtimeRequests: OvertimeRequest[];
  correctionRequests: AttendanceCorrectionRequest[];
  announcements: Announcement[];
  leaveTypes: LeaveType[];
}): NotificationItem[] {
  const { currentUser, currentEmployee, employees, leaveRequests, overtimeRequests, correctionRequests, announcements, leaveTypes } = params;
  const items: NotificationItem[] = [];
  if (!currentUser || !currentEmployee) return items;

  const empName = (id: string) => {
    const e = employees.find((x) => x.id === id);
    return e ? fullName(e) : id;
  };
  const leaveTypeName = (id: string) => leaveTypes.find((lt) => lt.id === id)?.name ?? "Leave";

  leaveRequests
    .filter((r) => r.status === "pending" && r.employeeId !== currentEmployee.id && canDecide(currentUser, currentEmployee.id, r.employeeId, employees))
    .forEach((r) => items.push({ id: `lv-${r.id}`, text: `${empName(r.employeeId)} filed a ${leaveTypeName(r.leaveTypeId)} request pending your approval.`, date: r.filedAt, tone: "warning" }));

  overtimeRequests
    .filter((r) => r.status === "pending" && r.employeeId !== currentEmployee.id && canDecide(currentUser, currentEmployee.id, r.employeeId, employees))
    .forEach((r) => items.push({ id: `ot-${r.id}`, text: `${empName(r.employeeId)} filed an overtime request (${r.hours}h) pending your approval.`, date: r.filedAt, tone: "warning" }));

  correctionRequests
    .filter((r) => r.status === "pending" && r.employeeId !== currentEmployee.id && canDecide(currentUser, currentEmployee.id, r.employeeId, employees))
    .forEach((r) => items.push({ id: `ac-${r.id}`, text: `${empName(r.employeeId)} filed an attendance correction request pending your approval.`, date: r.filedAt, tone: "warning" }));

  leaveRequests
    .filter((r) => r.employeeId === currentEmployee.id && r.status !== "pending" && r.decidedAt)
    .forEach((r) => items.push({ id: `own-lv-${r.id}`, text: `Your ${leaveTypeName(r.leaveTypeId)} request was ${r.status}.${r.decisionNote ? ` "${r.decisionNote}"` : ""}`, date: r.decidedAt as string, tone: r.status === "approved" ? "good" : "critical" }));

  overtimeRequests
    .filter((r) => r.employeeId === currentEmployee.id && r.status !== "pending" && r.decidedAt)
    .forEach((r) => items.push({ id: `own-ot-${r.id}`, text: `Your overtime request (${r.hours}h) was ${r.status}.${r.decisionNote ? ` "${r.decisionNote}"` : ""}`, date: r.decidedAt as string, tone: r.status === "approved" ? "good" : "critical" }));

  correctionRequests
    .filter((r) => r.employeeId === currentEmployee.id && r.status !== "pending" && r.decidedAt)
    .forEach((r) => items.push({ id: `own-ac-${r.id}`, text: `Your attendance correction request was ${r.status}.${r.decisionNote ? ` "${r.decisionNote}"` : ""}`, date: r.decidedAt as string, tone: r.status === "approved" ? "good" : "critical" }));

  announcements.slice(0, 3).forEach((a) => {
    items.push({ id: `an-${a.id}`, text: `New announcement: ${a.title}`, date: a.postedAt, tone: "info" });
  });

  return items.sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 20);
}
