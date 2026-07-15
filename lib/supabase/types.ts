// Hand-written to match supabase/schema.sql while there's no live project to
// generate against yet. Once a project is connected, regenerate the real
// thing and replace this file:
//
//   npx supabase gen types typescript --project-id <ref> > lib/supabase/types.ts
//
// Insert/Update are intentionally loose (Partial<Row>) here — a generated
// file will know exactly which columns have defaults and tighten this up.

export type AppRole =
  | "hr_admin"
  | "payroll_officer"
  | "sr_accounting_assistant"
  | "treasurer"
  | "cfo"
  | "dept_head"
  | "employee"
  | "upper_management"
  | "sys_admin";

type Table<Row> = { Row: Row; Insert: Partial<Row>; Update: Partial<Row> };

export interface BranchRow {
  id: string;
  name: string;
  code: string;
  address: string;
}

export interface DepartmentRow {
  id: string;
  name: string;
}

export interface PositionRow {
  id: string;
  title: string;
  department_id: string;
}

export interface WorkScheduleRow {
  id: string;
  name: string;
  time_in: string;
  time_out: string;
  days: string;
  grace_minutes: number;
}

export interface HolidayRow {
  id: string;
  name: string;
  date: string;
  type: "regular" | "special_non_working";
  verified: boolean;
}

export interface LeaveTypeRow {
  id: string;
  name: string;
  default_credits: number;
  requires_cert: boolean;
}

export interface PayrollPeriodRow {
  id: string;
  period_start: string;
  period_end: string;
  status: "open" | "locked" | "closed";
}

export interface EmployeeRow {
  id: string;
  employee_number: string;
  first_name: string;
  last_name: string;
  middle_name: string | null;
  nickname: string;
  gender: "Male" | "Female";
  birthdate: string;
  civil_status: "Single" | "Married" | "Widowed" | "Separated";
  nationality: string;
  address: string;
  contact_number: string;
  email: string;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  branch_id: string;
  department_id: string;
  position_id: string;
  supervisor_id: string | null;
  employment_status: "regular" | "probationary" | "project_based" | "freelance" | "consultant" | "intern";
  date_hired: string;
  date_regularized: string | null;
  contract_start: string | null;
  contract_end: string | null;
  probation_ends_at: string | null;
  payroll_type: "daily" | "monthly";
  daily_rate: number | null;
  monthly_salary: number | null;
  daily_allowance: number | null;
  monthly_allowance: number | null;
  status: "active" | "on_leave" | "resigned" | "terminated";
  status_changed_at: string | null;
  roles: AppRole[];
  user_id: string | null;
}

export interface PerformanceEvaluationRow {
  id: string;
  employee_id: string;
  evaluator_id: string;
  period: string;
  criteria: { label: string; weight: number; score: number }[];
  overall_score: number;
  comments: string;
  status: "draft" | "submitted" | "acknowledged";
  created_at: string;
}

export interface DisciplinaryRecordRow {
  id: string;
  employee_id: string;
  type: "incident_report" | "verbal_warning" | "written_warning" | "suspension" | "nte" | "nod";
  description: string;
  issued_by: string;
  date: string;
  status: "open" | "resolved";
  attachment_name: string | null;
}

export interface AuditLogRow {
  id: string;
  actor_employee_id: string | null;
  actor_name: string;
  module: string;
  action: string;
  description: string;
  previous_value: string | null;
  new_value: string | null;
  created_at: string;
}

export interface AnnouncementRow {
  id: string;
  title: string;
  body: string;
  category: "announcement" | "holiday" | "event" | "memo" | "policy";
  posted_by: string;
  posted_at: string;
  expires_at: string | null;
}

interface ApprovableRequestRow {
  id: string;
  employee_id: string;
  reason: string;
  status: "pending" | "approved" | "rejected" | "cancelled";
  filed_at: string;
  decided_by: string | null;
  decided_at: string | null;
  decision_note: string | null;
}

export interface LeaveRequestRow extends ApprovableRequestRow {
  leave_type_id: string;
  start_date: string;
  end_date: string;
  days: number;
}

export interface OvertimeRequestRow extends ApprovableRequestRow {
  date: string;
  hours: number;
}

export interface AttendanceCorrectionRequestRow extends ApprovableRequestRow {
  date: string;
  requested_time_in: string | null;
  requested_time_out: string | null;
}

export interface AttendancePeriodRecordRow {
  id: string;
  period_id: string;
  employee_id: string;
  days_worked: number;
  holiday_days: number;
  sl_days: number;
  vl_days: number;
  late_adj_minutes: number;
  undertime_minutes: number;
  notes: string;
  source: "import" | "manual";
  updated_by: string;
  updated_at: string;
}

export interface PayrollLineOverrideRow {
  id: string;
  period_id: string;
  employee_id: string;
  travel_allowance: number;
  laundry_allowance: number;
  medical_cash_allowance: number;
  supervisor_allowance: number;
  cash_advance: number;
  lsm_biz_loan: number;
  lsm_coop_loan: number;
  shortages: number;
  sss_loan: number;
  hdmf_loan: number;
  hdmf_mp2_savings: number;
  adjustment_add: number;
  adjustment_deduct: number;
  sss_contribution_override: number | null;
  sss_wisp_override: number | null;
  philhealth_contribution_override: number | null;
  hdmf_contribution_override: number | null;
  withholding_tax_override: number | null;
  daily_allowance_override: number | null;
  basic_pay_override: number | null;
  lates_undertime_override: number | null;
  undertime_deduction_override: number | null;
  holiday_pay_override: number | null;
  vl_pay_override: number | null;
  sl_pay_override: number | null;
  ot_hours_override: number | null;
  ot_pay_override: number | null;
  updated_by: string;
  updated_at: string;
}

export interface VoucherAmountOverrideRow {
  id: string;
  period_id: string;
  employee_id: string;
  amount: number;
  updated_by: string;
  updated_at: string;
}

export interface GeneratedPayslipRow {
  id: string;
  period_id: string;
  employee_id: string;
  generated_by: string;
  generated_at: string;
  summary: Record<string, number>;
}

export interface GeneratedVoucherRow {
  id: string;
  period_id: string;
  employee_id: string;
  amount: number;
  generated_by: string;
  generated_at: string;
}

export interface GeneratedBirFormRow {
  id: string;
  form_type: "1601c" | "2316";
  period: string;
  employee_id: string | null;
  generated_by: string;
  generated_at: string;
  summary: Record<string, number>;
}

export interface Database {
  public: {
    Tables: {
      branches: Table<BranchRow>;
      departments: Table<DepartmentRow>;
      positions: Table<PositionRow>;
      work_schedules: Table<WorkScheduleRow>;
      holidays: Table<HolidayRow>;
      leave_types: Table<LeaveTypeRow>;
      payroll_periods: Table<PayrollPeriodRow>;
      employees: Table<EmployeeRow>;
      performance_evaluations: Table<PerformanceEvaluationRow>;
      disciplinary_records: Table<DisciplinaryRecordRow>;
      audit_logs: Table<AuditLogRow>;
      announcements: Table<AnnouncementRow>;
      leave_requests: Table<LeaveRequestRow>;
      overtime_requests: Table<OvertimeRequestRow>;
      attendance_correction_requests: Table<AttendanceCorrectionRequestRow>;
      attendance_period_records: Table<AttendancePeriodRecordRow>;
      payroll_line_overrides: Table<PayrollLineOverrideRow>;
      voucher_amount_overrides: Table<VoucherAmountOverrideRow>;
      generated_payslips: Table<GeneratedPayslipRow>;
      generated_vouchers: Table<GeneratedVoucherRow>;
      generated_bir_forms: Table<GeneratedBirFormRow>;
    };
  };
}
