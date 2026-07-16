import { getSupabaseClient } from "./client";
import type {
  AnnouncementRow,
  AttendanceCorrectionRequestRow,
  AttendancePeriodRecordRow,
  BranchRow,
  DepartmentRow,
  DisciplinaryRecordRow,
  EmployeeRow,
  GeneratedBirFormRow,
  GeneratedPayslipRow,
  GeneratedVoucherRow,
  HolidayRow,
  LeaveRequestRow,
  LeaveTypeRow,
  OvertimeRequestRow,
  PayrollLineOverrideRow,
  PayrollPeriodRow,
  PerformanceEvaluationRow,
  PositionRow,
  VoucherAmountOverrideRow,
  WorkScheduleRow,
} from "./types";
import type {
  Announcement,
  AttendanceCorrectionRequest,
  AttendancePeriodRecord,
  Branch,
  Department,
  DisciplinaryRecord,
  Employee,
  GeneratedBirForm,
  GeneratedPayslip,
  GeneratedVoucher,
  Holiday,
  LeaveRequest,
  LeaveType,
  OvertimeRequest,
  PayrollLineOverride,
  PayrollPeriod,
  PerformanceEvaluation,
  Position,
  RequestStatus,
  VoucherAmountOverride,
  WorkSchedule,
} from "../types";

// -----------------------------------------------------------------------------
// Phase 1 of the Supabase migration: branches, departments, positions,
// work_schedules, holidays, leave_types, payroll_periods, employees — the
// reference/org data almost every page depends on. Row <-> app-model
// converters live here since the DB is snake_case and the app is camelCase.
// Everything else (evaluations, discipline, attendance, payroll, etc.) still
// reads/writes lib/store.tsx's local state — see supabase/schema.sql's header
// comment for the phase plan.
// -----------------------------------------------------------------------------

// ---- Branches ---------------------------------------------------------------

function toBranch(r: BranchRow): Branch {
  return { id: r.id, name: r.name, code: r.code, address: r.address };
}

export async function fetchBranches(): Promise<Branch[]> {
  const { data, error } = await getSupabaseClient().from("branches").select("*").order("name");
  if (error) throw error;
  return data.map(toBranch);
}
export async function insertBranch(input: Omit<Branch, "id">): Promise<Branch> {
  const { data, error } = await getSupabaseClient().from("branches").insert(input).select().single();
  if (error) throw error;
  return toBranch(data);
}
export async function updateBranchRow(id: string, patch: Partial<Omit<Branch, "id">>): Promise<Branch> {
  const { data, error } = await getSupabaseClient().from("branches").update(patch).eq("id", id).select().single();
  if (error) throw error;
  return toBranch(data);
}
export async function deleteBranchRow(id: string): Promise<void> {
  const { error } = await getSupabaseClient().from("branches").delete().eq("id", id);
  if (error) throw error;
}

// ---- Departments --------------------------------------------------------------

function toDepartment(r: DepartmentRow): Department {
  return { id: r.id, name: r.name };
}

export async function fetchDepartments(): Promise<Department[]> {
  const { data, error } = await getSupabaseClient().from("departments").select("*").order("name");
  if (error) throw error;
  return data.map(toDepartment);
}
export async function insertDepartment(input: Omit<Department, "id">): Promise<Department> {
  const { data, error } = await getSupabaseClient().from("departments").insert(input).select().single();
  if (error) throw error;
  return toDepartment(data);
}
export async function updateDepartmentRow(id: string, patch: Partial<Omit<Department, "id">>): Promise<Department> {
  const { data, error } = await getSupabaseClient().from("departments").update(patch).eq("id", id).select().single();
  if (error) throw error;
  return toDepartment(data);
}
export async function deleteDepartmentRow(id: string): Promise<void> {
  const { error } = await getSupabaseClient().from("departments").delete().eq("id", id);
  if (error) throw error;
}

// ---- Positions ----------------------------------------------------------------

function toPosition(r: PositionRow): Position {
  return { id: r.id, title: r.title, departmentId: r.department_id };
}
function positionToRow(p: Partial<Omit<Position, "id">>): Partial<PositionRow> {
  const row: Partial<PositionRow> = {};
  if (p.title !== undefined) row.title = p.title;
  if (p.departmentId !== undefined) row.department_id = p.departmentId;
  return row;
}

export async function fetchPositions(): Promise<Position[]> {
  const { data, error } = await getSupabaseClient().from("positions").select("*").order("title");
  if (error) throw error;
  return data.map(toPosition);
}
export async function insertPosition(input: Omit<Position, "id">): Promise<Position> {
  const { data, error } = await getSupabaseClient().from("positions").insert(positionToRow(input)).select().single();
  if (error) throw error;
  return toPosition(data);
}
export async function updatePositionRow(id: string, patch: Partial<Omit<Position, "id">>): Promise<Position> {
  const { data, error } = await getSupabaseClient().from("positions").update(positionToRow(patch)).eq("id", id).select().single();
  if (error) throw error;
  return toPosition(data);
}
export async function deletePositionRow(id: string): Promise<void> {
  const { error } = await getSupabaseClient().from("positions").delete().eq("id", id);
  if (error) throw error;
}

// ---- Work schedules -------------------------------------------------------------

function toWorkSchedule(r: WorkScheduleRow): WorkSchedule {
  return { id: r.id, name: r.name, timeIn: r.time_in, timeOut: r.time_out, days: r.days, graceMinutes: r.grace_minutes };
}
function workScheduleToRow(w: Partial<Omit<WorkSchedule, "id">>): Partial<WorkScheduleRow> {
  const row: Partial<WorkScheduleRow> = {};
  if (w.name !== undefined) row.name = w.name;
  if (w.timeIn !== undefined) row.time_in = w.timeIn;
  if (w.timeOut !== undefined) row.time_out = w.timeOut;
  if (w.days !== undefined) row.days = w.days;
  if (w.graceMinutes !== undefined) row.grace_minutes = w.graceMinutes;
  return row;
}

export async function fetchWorkSchedules(): Promise<WorkSchedule[]> {
  const { data, error } = await getSupabaseClient().from("work_schedules").select("*").order("name");
  if (error) throw error;
  return data.map(toWorkSchedule);
}
export async function insertWorkSchedule(input: Omit<WorkSchedule, "id">): Promise<WorkSchedule> {
  const { data, error } = await getSupabaseClient().from("work_schedules").insert(workScheduleToRow(input)).select().single();
  if (error) throw error;
  return toWorkSchedule(data);
}
export async function updateWorkScheduleRow(id: string, patch: Partial<Omit<WorkSchedule, "id">>): Promise<WorkSchedule> {
  const { data, error } = await getSupabaseClient().from("work_schedules").update(workScheduleToRow(patch)).eq("id", id).select().single();
  if (error) throw error;
  return toWorkSchedule(data);
}
export async function deleteWorkScheduleRow(id: string): Promise<void> {
  const { error } = await getSupabaseClient().from("work_schedules").delete().eq("id", id);
  if (error) throw error;
}

// ---- Holidays -------------------------------------------------------------------

function toHoliday(r: HolidayRow): Holiday {
  return { id: r.id, name: r.name, date: r.date, type: r.type, verified: r.verified };
}

export async function fetchHolidays(): Promise<Holiday[]> {
  const { data, error } = await getSupabaseClient().from("holidays").select("*").order("date");
  if (error) throw error;
  return data.map(toHoliday);
}
export async function insertHoliday(input: Omit<Holiday, "id">): Promise<Holiday> {
  const { data, error } = await getSupabaseClient().from("holidays").insert(input).select().single();
  if (error) throw error;
  return toHoliday(data);
}
export async function updateHolidayRow(id: string, patch: Partial<Omit<Holiday, "id">>): Promise<Holiday> {
  const { data, error } = await getSupabaseClient().from("holidays").update(patch).eq("id", id).select().single();
  if (error) throw error;
  return toHoliday(data);
}
export async function deleteHolidayRow(id: string): Promise<void> {
  const { error } = await getSupabaseClient().from("holidays").delete().eq("id", id);
  if (error) throw error;
}

// ---- Leave types ------------------------------------------------------------------

function toLeaveType(r: LeaveTypeRow): LeaveType {
  return { id: r.id, name: r.name, defaultCredits: r.default_credits, requiresCert: r.requires_cert };
}
function leaveTypeToRow(l: Partial<Omit<LeaveType, "id">>): Partial<LeaveTypeRow> {
  const row: Partial<LeaveTypeRow> = {};
  if (l.name !== undefined) row.name = l.name;
  if (l.defaultCredits !== undefined) row.default_credits = l.defaultCredits;
  if (l.requiresCert !== undefined) row.requires_cert = l.requiresCert;
  return row;
}

export async function fetchLeaveTypes(): Promise<LeaveType[]> {
  const { data, error } = await getSupabaseClient().from("leave_types").select("*").order("name");
  if (error) throw error;
  return data.map(toLeaveType);
}
export async function insertLeaveType(input: Omit<LeaveType, "id">): Promise<LeaveType> {
  const { data, error } = await getSupabaseClient().from("leave_types").insert(leaveTypeToRow(input)).select().single();
  if (error) throw error;
  return toLeaveType(data);
}
export async function updateLeaveTypeRow(id: string, patch: Partial<Omit<LeaveType, "id">>): Promise<LeaveType> {
  const { data, error } = await getSupabaseClient().from("leave_types").update(leaveTypeToRow(patch)).eq("id", id).select().single();
  if (error) throw error;
  return toLeaveType(data);
}
export async function deleteLeaveTypeRow(id: string): Promise<void> {
  const { error } = await getSupabaseClient().from("leave_types").delete().eq("id", id);
  if (error) throw error;
}

// ---- Payroll periods ------------------------------------------------------------------

function toPayrollPeriod(r: PayrollPeriodRow): PayrollPeriod {
  return { id: r.id, start: r.period_start, end: r.period_end, status: r.status };
}
function payrollPeriodToRow(p: Partial<Omit<PayrollPeriod, "id">>): Partial<PayrollPeriodRow> {
  const row: Partial<PayrollPeriodRow> = {};
  if (p.start !== undefined) row.period_start = p.start;
  if (p.end !== undefined) row.period_end = p.end;
  if (p.status !== undefined) row.status = p.status;
  return row;
}

export async function fetchPayrollPeriods(): Promise<PayrollPeriod[]> {
  const { data, error } = await getSupabaseClient().from("payroll_periods").select("*").order("period_start");
  if (error) throw error;
  return data.map(toPayrollPeriod);
}
export async function insertPayrollPeriod(input: Omit<PayrollPeriod, "id">): Promise<PayrollPeriod> {
  const { data, error } = await getSupabaseClient().from("payroll_periods").insert(payrollPeriodToRow(input)).select().single();
  if (error) throw error;
  return toPayrollPeriod(data);
}
export async function updatePayrollPeriodRow(id: string, patch: Partial<Omit<PayrollPeriod, "id">>): Promise<PayrollPeriod> {
  const { data, error } = await getSupabaseClient().from("payroll_periods").update(payrollPeriodToRow(patch)).eq("id", id).select().single();
  if (error) throw error;
  return toPayrollPeriod(data);
}

// ---- Employees --------------------------------------------------------------------

function toEmployee(r: EmployeeRow): Employee {
  return {
    id: r.id,
    employeeNumber: r.employee_number,
    firstName: r.first_name,
    lastName: r.last_name,
    middleName: r.middle_name ?? undefined,
    nickname: r.nickname,
    gender: r.gender,
    birthdate: r.birthdate,
    civilStatus: r.civil_status,
    nationality: r.nationality,
    address: r.address,
    contactNumber: r.contact_number,
    email: r.email,
    emergencyContactName: r.emergency_contact_name,
    emergencyContactPhone: r.emergency_contact_phone,
    branchId: r.branch_id,
    departmentId: r.department_id,
    positionId: r.position_id,
    supervisorId: r.supervisor_id,
    jobPerformanceEvaluatorId: r.job_performance_evaluator_id,
    employmentStatus: r.employment_status,
    dateHired: r.date_hired,
    dateRegularized: r.date_regularized,
    contractStart: r.contract_start,
    contractEnd: r.contract_end,
    probationEndsAt: r.probation_ends_at,
    payrollType: r.payroll_type,
    dailyRate: r.daily_rate,
    monthlySalary: r.monthly_salary,
    dailyAllowance: r.daily_allowance,
    monthlyAllowance: r.monthly_allowance,
    status: r.status,
    statusChangedAt: r.status_changed_at,
    roles: r.roles,
  };
}

function employeeToRow(e: Partial<Omit<Employee, "id" | "employeeNumber">>): Partial<Omit<EmployeeRow, "id" | "employee_number">> {
  const row: Partial<Omit<EmployeeRow, "id" | "employee_number">> = {};
  if (e.firstName !== undefined) row.first_name = e.firstName;
  if (e.lastName !== undefined) row.last_name = e.lastName;
  if (e.middleName !== undefined) row.middle_name = e.middleName ?? null;
  if (e.nickname !== undefined) row.nickname = e.nickname;
  if (e.gender !== undefined) row.gender = e.gender;
  if (e.birthdate !== undefined) row.birthdate = e.birthdate;
  if (e.civilStatus !== undefined) row.civil_status = e.civilStatus;
  if (e.nationality !== undefined) row.nationality = e.nationality;
  if (e.address !== undefined) row.address = e.address;
  if (e.contactNumber !== undefined) row.contact_number = e.contactNumber;
  if (e.email !== undefined) row.email = e.email;
  if (e.emergencyContactName !== undefined) row.emergency_contact_name = e.emergencyContactName;
  if (e.emergencyContactPhone !== undefined) row.emergency_contact_phone = e.emergencyContactPhone;
  if (e.branchId !== undefined) row.branch_id = e.branchId;
  if (e.departmentId !== undefined) row.department_id = e.departmentId;
  if (e.positionId !== undefined) row.position_id = e.positionId;
  if (e.supervisorId !== undefined) row.supervisor_id = e.supervisorId;
  if (e.jobPerformanceEvaluatorId !== undefined) row.job_performance_evaluator_id = e.jobPerformanceEvaluatorId;
  if (e.employmentStatus !== undefined) row.employment_status = e.employmentStatus;
  if (e.dateHired !== undefined) row.date_hired = e.dateHired;
  if (e.dateRegularized !== undefined) row.date_regularized = e.dateRegularized;
  if (e.contractStart !== undefined) row.contract_start = e.contractStart;
  if (e.contractEnd !== undefined) row.contract_end = e.contractEnd;
  if (e.probationEndsAt !== undefined) row.probation_ends_at = e.probationEndsAt;
  if (e.payrollType !== undefined) row.payroll_type = e.payrollType;
  if (e.dailyRate !== undefined) row.daily_rate = e.dailyRate;
  if (e.monthlySalary !== undefined) row.monthly_salary = e.monthlySalary;
  if (e.dailyAllowance !== undefined) row.daily_allowance = e.dailyAllowance;
  if (e.monthlyAllowance !== undefined) row.monthly_allowance = e.monthlyAllowance;
  if (e.status !== undefined) row.status = e.status;
  if (e.statusChangedAt !== undefined) row.status_changed_at = e.statusChangedAt;
  if (e.roles !== undefined) row.roles = e.roles;
  return row;
}

export async function fetchEmployees(): Promise<Employee[]> {
  const { data, error } = await getSupabaseClient().from("employees").select("*").order("last_name");
  if (error) throw error;
  return data.map(toEmployee);
}
export async function insertEmployee(input: Omit<Employee, "id" | "employeeNumber">, employeeNumber: string): Promise<Employee> {
  const row = { ...employeeToRow(input), employee_number: employeeNumber };
  const { data, error } = await getSupabaseClient().from("employees").insert(row).select().single();
  if (error) throw error;
  return toEmployee(data);
}
export async function updateEmployeeRow(id: string, patch: Partial<Omit<Employee, "id" | "employeeNumber">>): Promise<Employee> {
  const { data, error } = await getSupabaseClient().from("employees").update(employeeToRow(patch)).eq("id", id).select().single();
  if (error) throw error;
  return toEmployee(data);
}

// -----------------------------------------------------------------------------
// Phase 2: performance evaluations, disciplinary records, announcements, and
// the leave/overtime/attendance-correction request queues.
// -----------------------------------------------------------------------------

// ---- Performance evaluations --------------------------------------------------

function toEvaluation(r: PerformanceEvaluationRow): PerformanceEvaluation {
  return {
    id: r.id,
    employeeId: r.employee_id,
    behaviorEvaluatorId: r.behavior_evaluator_id,
    jobPerformanceEvaluatorId: r.job_performance_evaluator_id,
    period: r.period,
    criteria: r.criteria,
    overallScore: r.overall_score,
    comments: r.comments,
    status: r.status,
    createdAt: r.created_at,
  };
}

export async function fetchEvaluations(): Promise<PerformanceEvaluation[]> {
  const { data, error } = await getSupabaseClient().from("performance_evaluations").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return data.map(toEvaluation);
}
export async function insertEvaluation(input: Omit<PerformanceEvaluation, "id" | "createdAt">): Promise<PerformanceEvaluation> {
  const row = {
    employee_id: input.employeeId,
    behavior_evaluator_id: input.behaviorEvaluatorId,
    job_performance_evaluator_id: input.jobPerformanceEvaluatorId,
    period: input.period,
    criteria: input.criteria,
    overall_score: input.overallScore,
    comments: input.comments,
    status: input.status,
  };
  const { data, error } = await getSupabaseClient().from("performance_evaluations").insert(row).select().single();
  if (error) throw error;
  return toEvaluation(data);
}
export async function updateEvaluationRow(
  id: string,
  patch: Partial<Omit<PerformanceEvaluation, "id" | "employeeId" | "createdAt">>,
): Promise<PerformanceEvaluation> {
  const row: Partial<PerformanceEvaluationRow> = {};
  if (patch.behaviorEvaluatorId !== undefined) row.behavior_evaluator_id = patch.behaviorEvaluatorId;
  if (patch.jobPerformanceEvaluatorId !== undefined) row.job_performance_evaluator_id = patch.jobPerformanceEvaluatorId;
  if (patch.criteria !== undefined) row.criteria = patch.criteria;
  if (patch.overallScore !== undefined) row.overall_score = patch.overallScore;
  if (patch.comments !== undefined) row.comments = patch.comments;
  if (patch.status !== undefined) row.status = patch.status;
  const { data, error } = await getSupabaseClient().from("performance_evaluations").update(row).eq("id", id).select().single();
  if (error) throw error;
  return toEvaluation(data);
}

// ---- Disciplinary records ------------------------------------------------------

function toDisciplinaryRecord(r: DisciplinaryRecordRow): DisciplinaryRecord {
  return {
    id: r.id,
    employeeId: r.employee_id,
    type: r.type,
    description: r.description,
    issuedBy: r.issued_by,
    date: r.date,
    status: r.status,
    attachmentName: r.attachment_name,
  };
}
function disciplinaryRecordToRow(input: Omit<DisciplinaryRecord, "id">): Omit<DisciplinaryRecordRow, "id"> {
  return {
    employee_id: input.employeeId,
    type: input.type,
    description: input.description,
    issued_by: input.issuedBy,
    date: input.date,
    status: input.status,
    attachment_name: input.attachmentName,
  };
}

export async function fetchDisciplinaryRecords(): Promise<DisciplinaryRecord[]> {
  const { data, error } = await getSupabaseClient().from("disciplinary_records").select("*").order("date", { ascending: false });
  if (error) throw error;
  return data.map(toDisciplinaryRecord);
}
export async function insertDisciplinaryRecord(input: Omit<DisciplinaryRecord, "id">): Promise<DisciplinaryRecord> {
  const { data, error } = await getSupabaseClient().from("disciplinary_records").insert(disciplinaryRecordToRow(input)).select().single();
  if (error) throw error;
  return toDisciplinaryRecord(data);
}
export async function updateDisciplinaryStatusRow(id: string, status: DisciplinaryRecord["status"]): Promise<DisciplinaryRecord> {
  const { data, error } = await getSupabaseClient().from("disciplinary_records").update({ status }).eq("id", id).select().single();
  if (error) throw error;
  return toDisciplinaryRecord(data);
}

// ---- Announcements ---------------------------------------------------------------

function toAnnouncement(r: AnnouncementRow): Announcement {
  return {
    id: r.id,
    title: r.title,
    body: r.body,
    category: r.category,
    postedBy: r.posted_by,
    postedAt: r.posted_at,
    expiresAt: r.expires_at,
  };
}

export async function fetchAnnouncements(): Promise<Announcement[]> {
  const { data, error } = await getSupabaseClient().from("announcements").select("*").order("posted_at", { ascending: false });
  if (error) throw error;
  return data.map(toAnnouncement);
}
export async function insertAnnouncement(input: Omit<Announcement, "id" | "postedAt">): Promise<Announcement> {
  const row = { title: input.title, body: input.body, category: input.category, posted_by: input.postedBy, expires_at: input.expiresAt };
  const { data, error } = await getSupabaseClient().from("announcements").insert(row).select().single();
  if (error) throw error;
  return toAnnouncement(data);
}

// ---- Leave requests ---------------------------------------------------------------

function toLeaveRequest(r: LeaveRequestRow): LeaveRequest {
  return {
    id: r.id,
    employeeId: r.employee_id,
    leaveTypeId: r.leave_type_id,
    startDate: r.start_date,
    endDate: r.end_date,
    days: r.days,
    reason: r.reason,
    status: r.status,
    filedAt: r.filed_at,
    decidedBy: r.decided_by,
    decidedAt: r.decided_at,
    decisionNote: r.decision_note,
  };
}

export async function fetchLeaveRequests(): Promise<LeaveRequest[]> {
  const { data, error } = await getSupabaseClient().from("leave_requests").select("*").order("filed_at", { ascending: false });
  if (error) throw error;
  return data.map(toLeaveRequest);
}
export async function insertLeaveRequest(
  input: Omit<LeaveRequest, "id" | "status" | "filedAt" | "decidedBy" | "decidedAt" | "decisionNote">,
): Promise<LeaveRequest> {
  const row = {
    employee_id: input.employeeId,
    leave_type_id: input.leaveTypeId,
    start_date: input.startDate,
    end_date: input.endDate,
    days: input.days,
    reason: input.reason,
  };
  const { data, error } = await getSupabaseClient().from("leave_requests").insert(row).select().single();
  if (error) throw error;
  return toLeaveRequest(data);
}
export async function decideLeaveRequestRow(
  id: string,
  decision: Extract<RequestStatus, "approved" | "rejected">,
  decidedBy: string,
  note: string | null,
): Promise<LeaveRequest> {
  const row = { status: decision, decided_by: decidedBy, decided_at: new Date().toISOString(), decision_note: note };
  const { data, error } = await getSupabaseClient().from("leave_requests").update(row).eq("id", id).select().single();
  if (error) throw error;
  return toLeaveRequest(data);
}

// ---- Overtime requests ---------------------------------------------------------------

function toOvertimeRequest(r: OvertimeRequestRow): OvertimeRequest {
  return {
    id: r.id,
    employeeId: r.employee_id,
    date: r.date,
    hours: r.hours,
    reason: r.reason,
    status: r.status,
    filedAt: r.filed_at,
    decidedBy: r.decided_by,
    decidedAt: r.decided_at,
    decisionNote: r.decision_note,
  };
}

export async function fetchOvertimeRequests(): Promise<OvertimeRequest[]> {
  const { data, error } = await getSupabaseClient().from("overtime_requests").select("*").order("filed_at", { ascending: false });
  if (error) throw error;
  return data.map(toOvertimeRequest);
}
export async function insertOvertimeRequest(
  input: Omit<OvertimeRequest, "id" | "status" | "filedAt" | "decidedBy" | "decidedAt" | "decisionNote">,
): Promise<OvertimeRequest> {
  const row = { employee_id: input.employeeId, date: input.date, hours: input.hours, reason: input.reason };
  const { data, error } = await getSupabaseClient().from("overtime_requests").insert(row).select().single();
  if (error) throw error;
  return toOvertimeRequest(data);
}
export async function decideOvertimeRequestRow(
  id: string,
  decision: Extract<RequestStatus, "approved" | "rejected">,
  decidedBy: string,
  note: string | null,
): Promise<OvertimeRequest> {
  const row = { status: decision, decided_by: decidedBy, decided_at: new Date().toISOString(), decision_note: note };
  const { data, error } = await getSupabaseClient().from("overtime_requests").update(row).eq("id", id).select().single();
  if (error) throw error;
  return toOvertimeRequest(data);
}

// ---- Attendance correction requests ------------------------------------------------

function toCorrectionRequest(r: AttendanceCorrectionRequestRow): AttendanceCorrectionRequest {
  return {
    id: r.id,
    employeeId: r.employee_id,
    date: r.date,
    requestedTimeIn: r.requested_time_in,
    requestedTimeOut: r.requested_time_out,
    reason: r.reason,
    status: r.status,
    filedAt: r.filed_at,
    decidedBy: r.decided_by,
    decidedAt: r.decided_at,
    decisionNote: r.decision_note,
  };
}

export async function fetchCorrectionRequests(): Promise<AttendanceCorrectionRequest[]> {
  const { data, error } = await getSupabaseClient().from("attendance_correction_requests").select("*").order("filed_at", { ascending: false });
  if (error) throw error;
  return data.map(toCorrectionRequest);
}
export async function insertCorrectionRequest(
  input: Omit<AttendanceCorrectionRequest, "id" | "status" | "filedAt" | "decidedBy" | "decidedAt" | "decisionNote">,
): Promise<AttendanceCorrectionRequest> {
  const row = {
    employee_id: input.employeeId,
    date: input.date,
    requested_time_in: input.requestedTimeIn,
    requested_time_out: input.requestedTimeOut,
    reason: input.reason,
  };
  const { data, error } = await getSupabaseClient().from("attendance_correction_requests").insert(row).select().single();
  if (error) throw error;
  return toCorrectionRequest(data);
}
export async function decideCorrectionRequestRow(
  id: string,
  decision: Extract<RequestStatus, "approved" | "rejected">,
  decidedBy: string,
  note: string | null,
): Promise<AttendanceCorrectionRequest> {
  const row = { status: decision, decided_by: decidedBy, decided_at: new Date().toISOString(), decision_note: note };
  const { data, error } = await getSupabaseClient().from("attendance_correction_requests").update(row).eq("id", id).select().single();
  if (error) throw error;
  return toCorrectionRequest(data);
}

// -----------------------------------------------------------------------------
// Phase 3: attendance period records, payroll overrides, and generated
// documents (payslips, vouchers, BIR forms) — the payroll engine's inputs
// and outputs.
// -----------------------------------------------------------------------------

// ---- Attendance period records --------------------------------------------------

function toAttendancePeriodRecord(r: AttendancePeriodRecordRow): AttendancePeriodRecord {
  return {
    id: r.id,
    periodId: r.period_id,
    employeeId: r.employee_id,
    daysWorked: r.days_worked,
    holidayDays: r.holiday_days,
    slDays: r.sl_days,
    vlDays: r.vl_days,
    lateAdjMinutes: r.late_adj_minutes,
    undertimeMinutes: r.undertime_minutes,
    notes: r.notes,
    source: r.source,
    updatedBy: r.updated_by,
    updatedAt: r.updated_at,
    lateInstances: r.late_instances ?? undefined,
    lateDayDetails: r.late_day_details ?? undefined,
    undertimeInstances: r.undertime_instances ?? undefined,
    undertimeDayDetails: r.undertime_day_details ?? undefined,
    halfDayInstances: r.half_day_instances ?? undefined,
    halfDayDates: r.half_day_dates ?? undefined,
    absenceInstances: r.absence_instances ?? undefined,
    absentDates: r.absent_dates ?? undefined,
  };
}
function attendancePeriodRecordToRow(
  input: Omit<AttendancePeriodRecord, "id" | "source" | "updatedBy" | "updatedAt">,
  source: AttendancePeriodRecord["source"],
  updatedBy: string,
): Omit<AttendancePeriodRecordRow, "id"> {
  return {
    period_id: input.periodId,
    employee_id: input.employeeId,
    days_worked: input.daysWorked,
    holiday_days: input.holidayDays,
    sl_days: input.slDays,
    vl_days: input.vlDays,
    late_adj_minutes: input.lateAdjMinutes,
    undertime_minutes: input.undertimeMinutes,
    notes: input.notes,
    source,
    updated_by: updatedBy,
    updated_at: new Date().toISOString(),
    late_instances: input.lateInstances ?? null,
    late_day_details: input.lateDayDetails ?? null,
    undertime_instances: input.undertimeInstances ?? null,
    undertime_day_details: input.undertimeDayDetails ?? null,
    half_day_instances: input.halfDayInstances ?? null,
    half_day_dates: input.halfDayDates ?? null,
    absence_instances: input.absenceInstances ?? null,
    absent_dates: input.absentDates ?? null,
  };
}

export async function fetchAttendancePeriodRecords(): Promise<AttendancePeriodRecord[]> {
  const { data, error } = await getSupabaseClient().from("attendance_period_records").select("*");
  if (error) throw error;
  return data.map(toAttendancePeriodRecord);
}
export async function upsertAttendancePeriodRecordRow(
  input: Omit<AttendancePeriodRecord, "id" | "source" | "updatedBy" | "updatedAt">,
  updatedBy: string,
): Promise<AttendancePeriodRecord> {
  const row = attendancePeriodRecordToRow(input, "manual", updatedBy);
  const { data, error } = await getSupabaseClient()
    .from("attendance_period_records")
    .upsert(row, { onConflict: "period_id,employee_id" })
    .select()
    .single();
  if (error) throw error;
  return toAttendancePeriodRecord(data);
}
export async function importAttendancePeriodRecordsRows(
  periodId: string,
  rows: Omit<AttendancePeriodRecord, "id" | "periodId" | "source" | "updatedBy" | "updatedAt">[],
  updatedBy: string,
): Promise<AttendancePeriodRecord[]> {
  const payload = rows.map((row) => attendancePeriodRecordToRow({ ...row, periodId }, "import", updatedBy));
  const { data, error } = await getSupabaseClient()
    .from("attendance_period_records")
    .upsert(payload, { onConflict: "period_id,employee_id" })
    .select();
  if (error) throw error;
  return data.map(toAttendancePeriodRecord);
}

// ---- Payroll line overrides --------------------------------------------------------

function toPayrollLineOverride(r: PayrollLineOverrideRow): PayrollLineOverride {
  return {
    id: r.id,
    periodId: r.period_id,
    employeeId: r.employee_id,
    travelAllowance: r.travel_allowance,
    laundryAllowance: r.laundry_allowance,
    medicalCashAllowance: r.medical_cash_allowance,
    supervisorAllowance: r.supervisor_allowance,
    cashAdvance: r.cash_advance,
    lsmBizLoan: r.lsm_biz_loan,
    lsmCoopLoan: r.lsm_coop_loan,
    shortages: r.shortages,
    sssLoan: r.sss_loan,
    hdmfLoan: r.hdmf_loan,
    hdmfMp2Savings: r.hdmf_mp2_savings,
    adjustmentAdd: r.adjustment_add,
    adjustmentDeduct: r.adjustment_deduct,
    sssContributionOverride: r.sss_contribution_override,
    sssWispOverride: r.sss_wisp_override,
    philHealthContributionOverride: r.philhealth_contribution_override,
    hdmfContributionOverride: r.hdmf_contribution_override,
    withholdingTaxOverride: r.withholding_tax_override,
    dailyAllowanceOverride: r.daily_allowance_override,
    basicPayOverride: r.basic_pay_override,
    latesUndertimeOverride: r.lates_undertime_override,
    undertimeDeductionOverride: r.undertime_deduction_override,
    holidayPayOverride: r.holiday_pay_override,
    vlPayOverride: r.vl_pay_override,
    slPayOverride: r.sl_pay_override,
    otHoursOverride: r.ot_hours_override,
    otPayOverride: r.ot_pay_override,
    updatedBy: r.updated_by,
    updatedAt: r.updated_at,
  };
}
function payrollLineOverrideToRow(
  input: Omit<PayrollLineOverride, "id" | "updatedBy" | "updatedAt">,
  updatedBy: string,
): Omit<PayrollLineOverrideRow, "id"> {
  return {
    period_id: input.periodId,
    employee_id: input.employeeId,
    travel_allowance: input.travelAllowance,
    laundry_allowance: input.laundryAllowance,
    medical_cash_allowance: input.medicalCashAllowance,
    supervisor_allowance: input.supervisorAllowance,
    cash_advance: input.cashAdvance,
    lsm_biz_loan: input.lsmBizLoan,
    lsm_coop_loan: input.lsmCoopLoan,
    shortages: input.shortages,
    sss_loan: input.sssLoan,
    hdmf_loan: input.hdmfLoan,
    hdmf_mp2_savings: input.hdmfMp2Savings,
    adjustment_add: input.adjustmentAdd,
    adjustment_deduct: input.adjustmentDeduct,
    sss_contribution_override: input.sssContributionOverride,
    sss_wisp_override: input.sssWispOverride,
    philhealth_contribution_override: input.philHealthContributionOverride,
    hdmf_contribution_override: input.hdmfContributionOverride,
    withholding_tax_override: input.withholdingTaxOverride,
    daily_allowance_override: input.dailyAllowanceOverride,
    basic_pay_override: input.basicPayOverride,
    lates_undertime_override: input.latesUndertimeOverride,
    undertime_deduction_override: input.undertimeDeductionOverride,
    holiday_pay_override: input.holidayPayOverride,
    vl_pay_override: input.vlPayOverride,
    sl_pay_override: input.slPayOverride,
    ot_hours_override: input.otHoursOverride,
    ot_pay_override: input.otPayOverride,
    updated_by: updatedBy,
    updated_at: new Date().toISOString(),
  };
}

export async function fetchPayrollLineOverrides(): Promise<PayrollLineOverride[]> {
  const { data, error } = await getSupabaseClient().from("payroll_line_overrides").select("*");
  if (error) throw error;
  return data.map(toPayrollLineOverride);
}
export async function upsertPayrollLineOverrideRow(
  input: Omit<PayrollLineOverride, "id" | "updatedBy" | "updatedAt">,
  updatedBy: string,
): Promise<PayrollLineOverride> {
  const row = payrollLineOverrideToRow(input, updatedBy);
  const { data, error } = await getSupabaseClient()
    .from("payroll_line_overrides")
    .upsert(row, { onConflict: "period_id,employee_id" })
    .select()
    .single();
  if (error) throw error;
  return toPayrollLineOverride(data);
}

// ---- Voucher amount overrides --------------------------------------------------------

function toVoucherAmountOverride(r: VoucherAmountOverrideRow): VoucherAmountOverride {
  return { id: r.id, periodId: r.period_id, employeeId: r.employee_id, amount: r.amount, updatedBy: r.updated_by, updatedAt: r.updated_at };
}

export async function fetchVoucherAmountOverrides(): Promise<VoucherAmountOverride[]> {
  const { data, error } = await getSupabaseClient().from("voucher_amount_overrides").select("*");
  if (error) throw error;
  return data.map(toVoucherAmountOverride);
}
export async function upsertVoucherAmountOverrideRow(
  input: Omit<VoucherAmountOverride, "id" | "updatedBy" | "updatedAt">,
  updatedBy: string,
): Promise<VoucherAmountOverride> {
  const row = { period_id: input.periodId, employee_id: input.employeeId, amount: input.amount, updated_by: updatedBy, updated_at: new Date().toISOString() };
  const { data, error } = await getSupabaseClient()
    .from("voucher_amount_overrides")
    .upsert(row, { onConflict: "period_id,employee_id" })
    .select()
    .single();
  if (error) throw error;
  return toVoucherAmountOverride(data);
}

// ---- Generated payslips / vouchers / BIR forms ----------------------------------------

function toGeneratedPayslip(r: GeneratedPayslipRow): GeneratedPayslip {
  return { id: r.id, periodId: r.period_id, employeeId: r.employee_id, generatedBy: r.generated_by, generatedAt: r.generated_at, summary: r.summary };
}
export async function fetchGeneratedPayslips(): Promise<GeneratedPayslip[]> {
  const { data, error } = await getSupabaseClient().from("generated_payslips").select("*");
  if (error) throw error;
  return data.map(toGeneratedPayslip);
}
export async function insertGeneratedPayslip(input: Omit<GeneratedPayslip, "id" | "generatedAt" | "generatedBy">, generatedBy: string): Promise<GeneratedPayslip> {
  const row = { period_id: input.periodId, employee_id: input.employeeId, summary: input.summary, generated_by: generatedBy };
  const { data, error } = await getSupabaseClient().from("generated_payslips").insert(row).select().single();
  if (error) throw error;
  return toGeneratedPayslip(data);
}

function toGeneratedVoucher(r: GeneratedVoucherRow): GeneratedVoucher {
  return { id: r.id, periodId: r.period_id, employeeId: r.employee_id, amount: r.amount, generatedBy: r.generated_by, generatedAt: r.generated_at };
}
export async function fetchGeneratedVouchers(): Promise<GeneratedVoucher[]> {
  const { data, error } = await getSupabaseClient().from("generated_vouchers").select("*");
  if (error) throw error;
  return data.map(toGeneratedVoucher);
}
export async function insertGeneratedVoucher(input: Omit<GeneratedVoucher, "id" | "generatedAt" | "generatedBy">, generatedBy: string): Promise<GeneratedVoucher> {
  const row = { period_id: input.periodId, employee_id: input.employeeId, amount: input.amount, generated_by: generatedBy };
  const { data, error } = await getSupabaseClient().from("generated_vouchers").insert(row).select().single();
  if (error) throw error;
  return toGeneratedVoucher(data);
}

function toGeneratedBirForm(r: GeneratedBirFormRow): GeneratedBirForm {
  return {
    id: r.id,
    formType: r.form_type,
    period: r.period,
    employeeId: r.employee_id,
    generatedBy: r.generated_by,
    generatedAt: r.generated_at,
    summary: r.summary,
  };
}
export async function fetchGeneratedBirForms(): Promise<GeneratedBirForm[]> {
  const { data, error } = await getSupabaseClient().from("generated_bir_forms").select("*");
  if (error) throw error;
  return data.map(toGeneratedBirForm);
}
export async function insertGeneratedBirForm(input: Omit<GeneratedBirForm, "id" | "generatedAt" | "generatedBy">, generatedBy: string): Promise<GeneratedBirForm> {
  const row = { form_type: input.formType, period: input.period, employee_id: input.employeeId, summary: input.summary, generated_by: generatedBy };
  const { data, error } = await getSupabaseClient().from("generated_bir_forms").insert(row).select().single();
  if (error) throw error;
  return toGeneratedBirForm(data);
}
