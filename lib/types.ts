export type Role =
  | "hr_admin"
  | "payroll_officer"
  | "sr_accounting_assistant"
  | "treasurer"
  | "cfo"
  | "dept_head"
  | "employee"
  | "upper_management"
  | "sys_admin";

export const ROLE_LABELS: Record<Role, string> = {
  hr_admin: "HR Manager",
  payroll_officer: "Payroll Officer",
  sr_accounting_assistant: "Sr. Accounting Assistant",
  treasurer: "Corporate Treasurer",
  cfo: "Chief Finance Officer",
  dept_head: "Department Head",
  employee: "Employee",
  upper_management: "Upper Management",
  sys_admin: "System Administrator",
};

export interface Branch {
  id: string;
  name: string;
  code: string;
  address: string;
}

export interface Department {
  id: string;
  name: string;
}

export interface Position {
  id: string;
  title: string;
  departmentId: string;
}

export interface WorkSchedule {
  id: string;
  name: string;
  timeIn: string;
  timeOut: string;
  days: string;
  graceMinutes: number;
}

export type HolidayType = "regular" | "special_non_working";

export interface Holiday {
  id: string;
  name: string;
  date: string;
  type: HolidayType;
  verified: boolean;
}

export interface LeaveType {
  id: string;
  name: string;
  defaultCredits: number;
  requiresCert: boolean;
}

export type PayrollPeriodStatus = "open" | "locked" | "closed";

export interface PayrollPeriod {
  id: string;
  start: string;
  end: string;
  status: PayrollPeriodStatus;
}

export type EmploymentStatus =
  | "regular"
  | "probationary"
  | "project_based"
  | "freelance"
  | "consultant"
  | "intern";

export type EmployeeLifecycleStatus =
  | "active"
  | "on_leave"
  | "resigned"
  | "terminated";

export interface Employee {
  id: string;
  employeeNumber: string;
  firstName: string;
  lastName: string;
  nickname: string;
  gender: "Male" | "Female";
  birthdate: string;
  civilStatus: "Single" | "Married" | "Widowed" | "Separated";
  nationality: string;
  address: string;
  contactNumber: string;
  email: string;
  emergencyContactName: string;
  emergencyContactPhone: string;

  branchId: string;
  departmentId: string;
  positionId: string;
  supervisorId: string | null;

  employmentStatus: EmploymentStatus;
  dateHired: string;
  dateRegularized: string | null;
  contractStart: string | null;
  contractEnd: string | null;
  probationEndsAt: string | null;

  payrollType: "daily" | "monthly";
  dailyRate: number | null;
  monthlySalary: number | null;
  dailyAllowance: number | null;
  monthlyAllowance: number | null;

  status: EmployeeLifecycleStatus;
  statusChangedAt: string | null;
  roles: Role[];
}

export interface EvaluationCriterion {
  label: string;
  weight: number;
  score: number; // 1-5
}

export type EvaluationStatus = "draft" | "submitted" | "acknowledged";

export interface PerformanceEvaluation {
  id: string;
  employeeId: string;
  evaluatorId: string;
  period: string;
  criteria: EvaluationCriterion[];
  overallScore: number;
  comments: string;
  status: EvaluationStatus;
  createdAt: string;
}

export type DisciplinaryType =
  | "incident_report"
  | "verbal_warning"
  | "written_warning"
  | "suspension"
  | "nte"
  | "nod";

export const DISCIPLINARY_LABELS: Record<DisciplinaryType, string> = {
  incident_report: "Incident Report",
  verbal_warning: "Verbal Warning",
  written_warning: "Written Warning",
  suspension: "Suspension",
  nte: "Notice to Explain",
  nod: "Notice of Decision",
};

export interface DisciplinaryRecord {
  id: string;
  employeeId: string;
  type: DisciplinaryType;
  description: string;
  issuedBy: string;
  date: string;
  status: "open" | "resolved";
  attachmentName: string | null;
}

export interface AuditLog {
  id: string;
  userId: string;
  userName: string;
  module: string;
  action: string;
  description: string;
  previousValue: string | null;
  newValue: string | null;
  createdAt: string;
}

export type AnnouncementCategory =
  | "announcement"
  | "holiday"
  | "event"
  | "memo"
  | "policy";

export interface Announcement {
  id: string;
  title: string;
  body: string;
  category: AnnouncementCategory;
  postedBy: string;
  postedAt: string;
  expiresAt: string | null;
}

export interface DemoUser {
  id: string;
  employeeId: string;
  name: string;
  title: string;
  roles: Role[];
  initials: string;
}

export type BirFormType = "1601c" | "2316";

export interface GeneratedBirForm {
  id: string;
  formType: BirFormType;
  period: string; // monthKey ("2026-07") for 1601-C, tax year ("2026") for 2316
  employeeId: string | null; // null for 1601-C (company-wide)
  generatedBy: string;
  generatedAt: string;
  summary: Record<string, number>;
}

export type RequestStatus = "pending" | "approved" | "rejected" | "cancelled";

interface ApprovableRequest {
  id: string;
  employeeId: string;
  reason: string;
  status: RequestStatus;
  filedAt: string;
  decidedBy: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
}

export interface LeaveRequest extends ApprovableRequest {
  leaveTypeId: string;
  startDate: string;
  endDate: string;
  days: number;
}

export interface OvertimeRequest extends ApprovableRequest {
  date: string;
  hours: number;
}

export interface AttendanceCorrectionRequest extends ApprovableRequest {
  date: string;
  requestedTimeIn: string | null;
  requestedTimeOut: string | null;
}

export interface GeneratedPayslip {
  id: string;
  periodId: string;
  employeeId: string;
  generatedBy: string;
  generatedAt: string;
  summary: Record<string, number>;
}

export interface GeneratedVoucher {
  id: string;
  periodId: string;
  employeeId: string;
  amount: number;
  generatedBy: string;
  generatedAt: string;
}

export type AttendanceRecordSource = "import" | "manual";

// One row per employee per payroll period — the real, editable attendance
// summary that drives Payroll Processing. Populated either by uploading the
// company's per-period attendance-tracker export (its "Summary" tab) or by
// direct HR/Payroll entry. Vacation/sick leave pay is computed straight from
// this record's vlDays/slDays. Overtime pay is the one figure NOT derived
// from here — it comes from the already-approved Overtime requests elsewhere
// in the system, so there is only one source of truth for it.
export interface AttendancePeriodRecord {
  id: string;
  periodId: string;
  employeeId: string;
  daysWorked: number;
  holidayDays: number;
  slDays: number;
  vlDays: number;
  lateAdjMinutes: number;
  notes: string;
  source: AttendanceRecordSource;
  updatedBy: string;
  updatedAt: string;
}

// Per-employee, per-period manual inputs/overrides layered on top of the
// automatic payroll computation — allowance amounts, loans/deductions the
// system has no other source for, adjustments, and optional overrides for
// the five statutory figures that are normally auto-computed from the
// "Basis of Mandatories" (SSS, SSS WISP, PhilHealth, Pag-IBIG, withholding
// tax). A null override means "use the auto-computed value."
export interface PayrollLineOverride {
  id: string;
  periodId: string;
  employeeId: string;
  travelAllowance: number;
  laundryAllowance: number;
  medicalCashAllowance: number;
  supervisorAllowance: number;
  cashAdvance: number;
  lsmBizLoan: number;
  lsmCoopLoan: number;
  shortages: number;
  sssLoan: number;
  hdmfLoan: number;
  adjustmentAdd: number;
  adjustmentDeduct: number;
  sssContributionOverride: number | null;
  sssWispOverride: number | null;
  philHealthContributionOverride: number | null;
  hdmfContributionOverride: number | null;
  withholdingTaxOverride: number | null;
  updatedBy: string;
  updatedAt: string;
}
