import { getSupabaseClient } from "./client";
import type {
  AnnouncementRow,
  AttendanceCorrectionRequestRow,
  BranchRow,
  DepartmentRow,
  DisciplinaryRecordRow,
  EmployeeRow,
  HolidayRow,
  LeaveRequestRow,
  LeaveTypeRow,
  OvertimeRequestRow,
  PayrollPeriodRow,
  PerformanceEvaluationRow,
  PositionRow,
  WorkScheduleRow,
} from "./types";
import type {
  Announcement,
  AttendanceCorrectionRequest,
  Branch,
  Department,
  DisciplinaryRecord,
  Employee,
  Holiday,
  LeaveRequest,
  LeaveType,
  OvertimeRequest,
  PayrollPeriod,
  PerformanceEvaluation,
  Position,
  RequestStatus,
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
