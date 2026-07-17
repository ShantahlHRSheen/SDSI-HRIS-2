"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { fullName } from "./helpers";
import { getInitialSession, signInWithPassword as supabaseSignInWithPassword, signOutSupabase, watchAuthState } from "./supabase/auth";
import {
  decideCorrectionRequestRow,
  decideLeaveRequestRow,
  decideOvertimeRequestRow,
  deleteBranchRow,
  deleteDepartmentRow,
  deleteHolidayRow,
  deleteLeaveTypeRow,
  deletePositionRow,
  deleteWorkScheduleRow,
  fetchAnnouncements,
  fetchAttendancePeriodRecords,
  fetchAuditLogs,
  fetchBranches,
  fetchCorrectionRequests,
  fetchDepartments,
  fetchDisciplinaryRecords,
  fetchEmployees,
  fetchEvaluations,
  fetchGeneratedBirForms,
  fetchGeneratedPayslips,
  fetchGeneratedVouchers,
  fetchHolidays,
  fetchLeaveRequests,
  fetchLeaveTypes,
  fetchOvertimeRequests,
  fetchPayrollLineOverrides,
  fetchPayrollPeriods,
  fetchPositions,
  fetchVoucherAmountOverrides,
  fetchWorkSchedules,
  importAttendancePeriodRecordsRows,
  insertAnnouncement,
  insertAuditLog,
  insertBranch,
  insertCorrectionRequest,
  insertDepartment,
  insertDisciplinaryRecord,
  insertEmployee,
  insertEvaluation,
  insertGeneratedBirForm,
  insertGeneratedPayslip,
  insertGeneratedVoucher,
  insertHoliday,
  insertLeaveRequest,
  insertLeaveType,
  insertOvertimeRequest,
  insertPayrollPeriod,
  insertPosition,
  insertWorkSchedule,
  updateBranchRow,
  updateDepartmentRow,
  updateDisciplinaryStatusRow,
  updateEmployeeRow,
  updateEvaluationRow,
  updateHolidayRow,
  updateLeaveTypeRow,
  updatePayrollPeriodRow,
  updatePositionRow,
  updateWorkScheduleRow,
  upsertAttendancePeriodRecordRow,
  upsertPayrollLineOverrideRow,
  upsertVoucherAmountOverrideRow,
} from "./supabase/repo";
import {
  ANNOUNCEMENTS,
  ATTENDANCE_PERIOD_RECORDS,
  AUDIT_LOGS,
  BRANCHES,
  CORRECTION_REQUESTS,
  DEMO_USERS,
  DEPARTMENTS,
  DISCIPLINARY_RECORDS,
  EMPLOYEES,
  HOLIDAYS,
  LEAVE_REQUESTS,
  LEAVE_TYPES,
  OVERTIME_REQUESTS,
  PAYROLL_PERIODS,
  PERFORMANCE_EVALUATIONS,
  POSITIONS,
  TODAY,
  WORK_SCHEDULES,
} from "./mock-data";
import { computeOverallScore, type KpiCategory } from "./performance-eval";
import type {
  Announcement,
  AttendanceCorrectionRequest,
  AttendancePeriodRecord,
  AuditLog,
  Branch,
  Department,
  DemoUser,
  DisciplinaryRecord,
  Employee,
  EvaluationCriterion,
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
} from "./types";

const STORAGE_KEY = "sdsi-hris-demo-v1";

interface PersistedState {
  currentUserId: string | null;
  employees: Employee[];
  evaluations: PerformanceEvaluation[];
  disciplinaryRecords: DisciplinaryRecord[];
  auditLogs: AuditLog[];
  announcements: Announcement[];
  branches: Branch[];
  departments: Department[];
  positions: Position[];
  workSchedules: WorkSchedule[];
  holidays: Holiday[];
  leaveTypes: LeaveType[];
  payrollPeriods: PayrollPeriod[];
  generatedBirForms: GeneratedBirForm[];
  leaveRequests: LeaveRequest[];
  overtimeRequests: OvertimeRequest[];
  correctionRequests: AttendanceCorrectionRequest[];
  generatedPayslips: GeneratedPayslip[];
  generatedVouchers: GeneratedVoucher[];
  attendancePeriodRecords: AttendancePeriodRecord[];
  payrollLineOverrides: PayrollLineOverride[];
  voucherAmountOverrides: VoucherAmountOverride[];
}

function defaultState(): PersistedState {
  return {
    currentUserId: null,
    employees: EMPLOYEES,
    evaluations: PERFORMANCE_EVALUATIONS,
    disciplinaryRecords: DISCIPLINARY_RECORDS,
    auditLogs: AUDIT_LOGS,
    announcements: ANNOUNCEMENTS,
    branches: BRANCHES,
    departments: DEPARTMENTS,
    positions: POSITIONS,
    workSchedules: WORK_SCHEDULES,
    holidays: HOLIDAYS,
    leaveTypes: LEAVE_TYPES,
    payrollPeriods: PAYROLL_PERIODS,
    generatedBirForms: [],
    leaveRequests: LEAVE_REQUESTS,
    overtimeRequests: OVERTIME_REQUESTS,
    correctionRequests: CORRECTION_REQUESTS,
    generatedPayslips: [],
    generatedVouchers: [],
    attendancePeriodRecords: ATTENDANCE_PERIOD_RECORDS,
    payrollLineOverrides: [],
    voucherAmountOverrides: [],
  };
}

let idCounter = 1;
function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${Date.now().toString(36)}${idCounter}`;
}

interface HrisContextShape {
  ready: boolean;
  currentUser: DemoUser | null;
  currentEmployee: Employee | null;
  login: (userId: string) => void;
  loginWithSupabase: (email: string, password: string) => Promise<{ error: string | null }>;
  logout: () => void;

  employees: Employee[];
  evaluations: PerformanceEvaluation[];
  disciplinaryRecords: DisciplinaryRecord[];
  auditLogs: AuditLog[];
  announcements: Announcement[];
  branches: Branch[];
  departments: Department[];
  positions: Position[];
  workSchedules: WorkSchedule[];
  holidays: Holiday[];
  leaveTypes: LeaveType[];
  payrollPeriods: PayrollPeriod[];
  generatedBirForms: GeneratedBirForm[];
  leaveRequests: LeaveRequest[];
  overtimeRequests: OvertimeRequest[];
  correctionRequests: AttendanceCorrectionRequest[];
  generatedPayslips: GeneratedPayslip[];
  generatedVouchers: GeneratedVoucher[];
  attendancePeriodRecords: AttendancePeriodRecord[];
  payrollLineOverrides: PayrollLineOverride[];
  voucherAmountOverrides: VoucherAmountOverride[];

  updateEmployee: (id: string, patch: Partial<Omit<Employee, "id" | "employeeNumber">>) => void;
  addEmployee: (input: Omit<Employee, "id" | "employeeNumber">) => void;

  upsertAttendancePeriodRecord: (input: Omit<AttendancePeriodRecord, "id" | "source" | "updatedBy" | "updatedAt">) => void;
  importAttendancePeriodRecords: (periodId: string, rows: Omit<AttendancePeriodRecord, "id" | "periodId" | "source" | "updatedBy" | "updatedAt">[]) => void;

  upsertPayrollLineOverride: (input: Omit<PayrollLineOverride, "id" | "updatedBy" | "updatedAt">) => void;
  upsertVoucherAmountOverride: (input: Omit<VoucherAmountOverride, "id" | "updatedBy" | "updatedAt">) => void;

  addEvaluation: (input: Omit<PerformanceEvaluation, "id" | "createdAt">) => void;
  updateEvaluationSection: (id: string, category: KpiCategory, criteria: EvaluationCriterion[], evaluatorEmployeeId: string, comments?: string) => void;
  setEvaluationStatus: (id: string, status: PerformanceEvaluation["status"]) => void;

  addDisciplinaryRecord: (input: Omit<DisciplinaryRecord, "id">) => void;
  setDisciplinaryStatus: (id: string, status: DisciplinaryRecord["status"]) => void;

  addAnnouncement: (input: Omit<Announcement, "id" | "postedAt">) => void;

  addBranch: (input: Omit<Branch, "id">) => void;
  updateBranch: (id: string, patch: Partial<Omit<Branch, "id">>) => void;
  removeBranch: (id: string) => void;

  addDepartment: (input: Omit<Department, "id">) => void;
  updateDepartment: (id: string, patch: Partial<Omit<Department, "id">>) => void;
  removeDepartment: (id: string) => void;

  addPosition: (input: Omit<Position, "id">) => void;
  updatePosition: (id: string, patch: Partial<Omit<Position, "id">>) => void;
  removePosition: (id: string) => void;

  addWorkSchedule: (input: Omit<WorkSchedule, "id">) => void;
  updateWorkSchedule: (id: string, patch: Partial<Omit<WorkSchedule, "id">>) => void;
  removeWorkSchedule: (id: string) => void;

  addHoliday: (input: Omit<Holiday, "id">) => void;
  updateHoliday: (id: string, patch: Partial<Omit<Holiday, "id">>) => void;
  removeHoliday: (id: string) => void;

  addLeaveType: (input: Omit<LeaveType, "id">) => void;
  updateLeaveType: (id: string, patch: Partial<Omit<LeaveType, "id">>) => void;
  removeLeaveType: (id: string) => void;

  setPayrollPeriodStatus: (id: string, status: PayrollPeriod["status"]) => void;
  addPayrollPeriod: (input: Omit<PayrollPeriod, "id">) => void;

  updateUserRoles: (userId: string, roles: DemoUser["roles"]) => void;
  demoUsers: DemoUser[];

  addGeneratedBirForm: (input: Omit<GeneratedBirForm, "id" | "generatedAt" | "generatedBy">) => void;

  fileLeaveRequest: (input: Omit<LeaveRequest, "id" | "status" | "filedAt" | "decidedBy" | "decidedAt" | "decisionNote">) => void;
  decideLeaveRequest: (id: string, decision: Extract<RequestStatus, "approved" | "rejected">, note?: string) => void;

  fileOvertimeRequest: (input: Omit<OvertimeRequest, "id" | "status" | "filedAt" | "decidedBy" | "decidedAt" | "decisionNote">) => void;
  decideOvertimeRequest: (id: string, decision: Extract<RequestStatus, "approved" | "rejected">, note?: string) => void;

  fileCorrectionRequest: (input: Omit<AttendanceCorrectionRequest, "id" | "status" | "filedAt" | "decidedBy" | "decidedAt" | "decisionNote">) => void;
  decideCorrectionRequest: (id: string, decision: Extract<RequestStatus, "approved" | "rejected">, note?: string) => void;

  addGeneratedPayslip: (input: Omit<GeneratedPayslip, "id" | "generatedAt" | "generatedBy">) => void;
  addGeneratedVoucher: (input: Omit<GeneratedVoucher, "id" | "generatedAt" | "generatedBy">) => void;
}

const HrisContext = createContext<HrisContextShape | null>(null);

export function HrisProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<PersistedState>(defaultState);
  const [demoUsers, setDemoUsers] = useState<DemoUser[]>(DEMO_USERS);
  const [ready, setReady] = useState(false);
  const [supabaseSession, setSupabaseSession] = useState<Session | null>(null);

  // Real per-employee login, layered on top of the demo click-to-select
  // login below rather than replacing it — not every employee has a
  // Supabase Auth account yet. A signed-in Supabase session is matched to
  // an employee by email; everything else (payroll, attendance, etc.)
  // still reads/writes localStorage exactly as before.
  useEffect(() => {
    let active = true;
    getInitialSession().then((session) => {
      if (active) setSupabaseSession(session);
    });
    const unwatch = watchAuthState((session) => {
      if (active) setSupabaseSession(session);
    });
    return () => {
      active = false;
      unwatch();
    };
  }, []);

  // Phase 1-4 of the Supabase migration: once someone is signed in with a real
  // Supabase Auth account (not the demo click-to-select login below), pull
  // these tables from Supabase and overwrite those slices — that's now the
  // source of truth for anyone with a real account. Demo-login users are
  // unaffected: RLS requires an authenticated Supabase session to read these
  // tables at all, so without one, the app keeps behaving exactly as it does
  // today (mock data + localStorage). auditLogs comes back empty for
  // non-elevated real accounts (RLS), which is expected, not an error.
  useEffect(() => {
    if (!supabaseSession) return;
    let active = true;
    (async () => {
      try {
        const [
          branches,
          departments,
          positions,
          workSchedules,
          holidays,
          leaveTypes,
          payrollPeriods,
          employees,
          evaluations,
          disciplinaryRecords,
          announcements,
          leaveRequests,
          overtimeRequests,
          correctionRequests,
          attendancePeriodRecords,
          payrollLineOverrides,
          voucherAmountOverrides,
          generatedPayslips,
          generatedVouchers,
          generatedBirForms,
          auditLogs,
        ] = await Promise.all([
          fetchBranches(),
          fetchDepartments(),
          fetchPositions(),
          fetchWorkSchedules(),
          fetchHolidays(),
          fetchLeaveTypes(),
          fetchPayrollPeriods(),
          fetchEmployees(),
          fetchEvaluations(),
          fetchDisciplinaryRecords(),
          fetchAnnouncements(),
          fetchLeaveRequests(),
          fetchOvertimeRequests(),
          fetchCorrectionRequests(),
          fetchAttendancePeriodRecords(),
          fetchPayrollLineOverrides(),
          fetchVoucherAmountOverrides(),
          fetchGeneratedPayslips(),
          fetchGeneratedVouchers(),
          fetchGeneratedBirForms(),
          fetchAuditLogs(),
        ]);
        if (!active) return;
        setState((prev) => ({
          ...prev,
          branches,
          departments,
          positions,
          workSchedules,
          holidays,
          leaveTypes,
          payrollPeriods,
          employees,
          evaluations,
          disciplinaryRecords,
          announcements,
          leaveRequests,
          overtimeRequests,
          correctionRequests,
          attendancePeriodRecords,
          payrollLineOverrides,
          voucherAmountOverrides,
          generatedPayslips,
          generatedVouchers,
          generatedBirForms,
          auditLogs,
        }));
      } catch (err) {
        console.error("Failed to load org/employee data from Supabase — keeping local data.", err);
      }
    })();
    return () => {
      active = false;
    };
  }, [supabaseSession]);

  useEffect(() => {
    // One-time hydration from localStorage on mount. This intentionally runs
    // only after the server-rendered default state has painted, so the first
    // client render matches SSR and avoids a hydration mismatch.
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as PersistedState & { demoUsers?: DemoUser[] };
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setState((prev) => ({ ...prev, ...parsed }));
        if (parsed.demoUsers) setDemoUsers(parsed.demoUsers);
      }
    } catch {
      // ignore corrupt storage
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, demoUsers }));
    } catch {
      // storage full / unavailable — demo continues in-memory only
    }
  }, [state, demoUsers, ready]);

  const supabaseEmployee = useMemo(() => {
    const email = supabaseSession?.user.email;
    if (!email) return null;
    return state.employees.find((e) => e.email.toLowerCase() === email.toLowerCase()) ?? null;
  }, [supabaseSession, state.employees]);

  const currentUser = useMemo<DemoUser | null>(() => {
    if (supabaseEmployee) {
      return {
        id: `sb-${supabaseEmployee.id}`,
        employeeId: supabaseEmployee.id,
        name: fullName(supabaseEmployee),
        title: state.positions.find((p) => p.id === supabaseEmployee.positionId)?.title ?? "—",
        roles: supabaseEmployee.roles,
        initials: `${supabaseEmployee.firstName.charAt(0)}${supabaseEmployee.lastName.charAt(0)}`.toUpperCase(),
      };
    }
    return demoUsers.find((u) => u.id === state.currentUserId) ?? null;
  }, [supabaseEmployee, demoUsers, state.currentUserId, state.positions]);
  const currentEmployee = useMemo(
    () => (currentUser ? state.employees.find((e) => e.id === currentUser.employeeId) ?? null : null),
    [currentUser, state.employees],
  );

  const logAudit = useCallback(
    (module: string, action: string, description: string, previousValue: string | null = null, newValue: string | null = null) => {
      const actor = currentUser;
      if (supabaseSession) {
        insertAuditLog({
          userId: actor?.employeeId ?? "system",
          userName: actor?.name ?? "System",
          module,
          action,
          description,
          previousValue,
          newValue,
        })
          .then((entry) => setState((prev) => ({ ...prev, auditLogs: [entry, ...prev.auditLogs] })))
          .catch((err) => console.error("Failed to write audit log to Supabase", err));
        return;
      }
      setState((prev) => {
        const entry: AuditLog = {
          id: nextId("al"),
          userId: actor?.employeeId ?? "system",
          userName: actor?.name ?? "System",
          module,
          action,
          description,
          previousValue,
          newValue,
          createdAt: TODAY,
        };
        return { ...prev, auditLogs: [entry, ...prev.auditLogs] };
      });
    },
    [currentUser, supabaseSession],
  );

  const login = useCallback((userId: string) => {
    setState((prev) => ({ ...prev, currentUserId: userId }));
  }, []);

  const loginWithSupabase = useCallback(
    async (email: string, password: string): Promise<{ error: string | null }> => {
      const { session, error } = await supabaseSignInWithPassword(email, password);
      if (error) return { error };
      if (!session) return { error: "Sign-in did not return a session." };

      const matched = state.employees.find((e) => e.email.toLowerCase() === email.toLowerCase());
      if (!matched) {
        await signOutSupabase();
        return { error: `Signed in, but no employee record matches ${email}. Contact HR.` };
      }
      setSupabaseSession(session);
      return { error: null };
    },
    [state.employees],
  );

  const logout = useCallback(() => {
    setState((prev) => ({ ...prev, currentUserId: null }));
    setSupabaseSession(null);
    void signOutSupabase();
  }, []);

  const updateEmployee: HrisContextShape["updateEmployee"] = useCallback(
    async (id, patch) => {
      if (supabaseSession) {
        try {
          const entry = await updateEmployeeRow(id, patch);
          setState((prev) => ({ ...prev, employees: prev.employees.map((e) => (e.id === id ? entry : e)) }));
          logAudit("Employee 201 File", "update", `Updated employee record ${id}`);
          return;
        } catch (err) {
          console.error("Failed to update employee in Supabase", err);
          return;
        }
      }
      setState((prev) => ({
        ...prev,
        employees: prev.employees.map((e) => (e.id === id ? { ...e, ...patch } : e)),
      }));
      logAudit("Employee 201 File", "update", `Updated employee record ${id}`);
    },
    [logAudit, supabaseSession],
  );

  const addEmployee: HrisContextShape["addEmployee"] = useCallback(
    async (input) => {
      if (supabaseSession) {
        try {
          const seq = state.employees.length + 1;
          const entry = await insertEmployee(input, `SDSI-${String(seq).padStart(4, "0")}`);
          setState((prev) => ({ ...prev, employees: [...prev.employees, entry] }));
          logAudit("Employee 201 File", "create", `Added new employee: ${input.firstName} ${input.lastName}`);
          return;
        } catch (err) {
          console.error("Failed to add employee in Supabase", err);
          return;
        }
      }
      setState((prev) => {
        const seq = prev.employees.length + 1;
        const entry: Employee = { ...input, id: nextId("emp"), employeeNumber: `SDSI-${String(seq).padStart(4, "0")}` };
        return { ...prev, employees: [...prev.employees, entry] };
      });
      logAudit("Employee 201 File", "create", `Added new employee: ${input.firstName} ${input.lastName}`);
    },
    [logAudit, supabaseSession, state.employees],
  );

  const upsertAttendancePeriodRecord: HrisContextShape["upsertAttendancePeriodRecord"] = useCallback(
    async (input) => {
      const actor = currentUser;
      if (supabaseSession) {
        try {
          const entry = await upsertAttendancePeriodRecordRow(input, actor?.name ?? "System");
          setState((prev) => ({
            ...prev,
            attendancePeriodRecords: [entry, ...prev.attendancePeriodRecords.filter((r) => !(r.periodId === input.periodId && r.employeeId === input.employeeId))],
          }));
          logAudit("Attendance", "update", `Manually updated attendance for period ${input.periodId}`);
          return;
        } catch (err) {
          console.error("Failed to save attendance record in Supabase", err);
          return;
        }
      }
      setState((prev) => {
        const existing = prev.attendancePeriodRecords.find((r) => r.periodId === input.periodId && r.employeeId === input.employeeId);
        const entry: AttendancePeriodRecord = {
          ...input,
          id: existing?.id ?? nextId("att"),
          source: "manual",
          updatedBy: actor?.name ?? "System",
          updatedAt: TODAY,
        };
        const rest = prev.attendancePeriodRecords.filter((r) => !(r.periodId === input.periodId && r.employeeId === input.employeeId));
        return { ...prev, attendancePeriodRecords: [entry, ...rest] };
      });
      logAudit("Attendance", "update", `Manually updated attendance for period ${input.periodId}`);
    },
    [logAudit, currentUser, supabaseSession],
  );

  const importAttendancePeriodRecords: HrisContextShape["importAttendancePeriodRecords"] = useCallback(
    async (periodId, rows) => {
      const actor = currentUser;
      if (supabaseSession) {
        try {
          const imported = await importAttendancePeriodRecordsRows(periodId, rows, actor?.name ?? "System");
          setState((prev) => ({ ...prev, attendancePeriodRecords: [...imported, ...prev.attendancePeriodRecords.filter((r) => r.periodId !== periodId)] }));
          logAudit("Attendance", "import", `Imported attendance for ${rows.length} employee(s), period ${periodId}`);
          return;
        } catch (err) {
          console.error("Failed to import attendance records in Supabase", err);
          return;
        }
      }
      setState((prev) => {
        const imported: AttendancePeriodRecord[] = rows.map((row) => ({
          ...row,
          id: nextId("att"),
          periodId,
          source: "import",
          updatedBy: actor?.name ?? "System",
          updatedAt: TODAY,
        }));
        const rest = prev.attendancePeriodRecords.filter((r) => r.periodId !== periodId);
        return { ...prev, attendancePeriodRecords: [...imported, ...rest] };
      });
      logAudit("Attendance", "import", `Imported attendance for ${rows.length} employee(s), period ${periodId}`);
    },
    [logAudit, currentUser, supabaseSession],
  );

  const upsertPayrollLineOverride: HrisContextShape["upsertPayrollLineOverride"] = useCallback(
    async (input) => {
      const actor = currentUser;
      if (supabaseSession) {
        try {
          const entry = await upsertPayrollLineOverrideRow(input, actor?.name ?? "System");
          setState((prev) => ({
            ...prev,
            payrollLineOverrides: [entry, ...prev.payrollLineOverrides.filter((r) => !(r.periodId === input.periodId && r.employeeId === input.employeeId))],
          }));
          logAudit("Payroll", "update", `Adjusted payroll line for period ${input.periodId}`);
          return;
        } catch (err) {
          console.error("Failed to save payroll line override in Supabase", err);
          return;
        }
      }
      setState((prev) => {
        const existing = prev.payrollLineOverrides.find((r) => r.periodId === input.periodId && r.employeeId === input.employeeId);
        const entry: PayrollLineOverride = {
          ...input,
          id: existing?.id ?? nextId("plo"),
          updatedBy: actor?.name ?? "System",
          updatedAt: TODAY,
        };
        const rest = prev.payrollLineOverrides.filter((r) => !(r.periodId === input.periodId && r.employeeId === input.employeeId));
        return { ...prev, payrollLineOverrides: [entry, ...rest] };
      });
      logAudit("Payroll", "update", `Adjusted payroll line for period ${input.periodId}`);
    },
    [logAudit, currentUser, supabaseSession],
  );

  const upsertVoucherAmountOverride: HrisContextShape["upsertVoucherAmountOverride"] = useCallback(
    async (input) => {
      const actor = currentUser;
      if (supabaseSession) {
        try {
          const entry = await upsertVoucherAmountOverrideRow(input, actor?.name ?? "System");
          setState((prev) => ({
            ...prev,
            voucherAmountOverrides: [entry, ...prev.voucherAmountOverrides.filter((r) => !(r.periodId === input.periodId && r.employeeId === input.employeeId))],
          }));
          logAudit("Allowance Vouchers", "update", `Adjusted voucher amount for period ${input.periodId}`);
          return;
        } catch (err) {
          console.error("Failed to save voucher amount override in Supabase", err);
          return;
        }
      }
      setState((prev) => {
        const existing = prev.voucherAmountOverrides.find((r) => r.periodId === input.periodId && r.employeeId === input.employeeId);
        const entry: VoucherAmountOverride = {
          ...input,
          id: existing?.id ?? nextId("vao"),
          updatedBy: actor?.name ?? "System",
          updatedAt: TODAY,
        };
        const rest = prev.voucherAmountOverrides.filter((r) => !(r.periodId === input.periodId && r.employeeId === input.employeeId));
        return { ...prev, voucherAmountOverrides: [entry, ...rest] };
      });
      logAudit("Allowance Vouchers", "update", `Adjusted voucher amount for period ${input.periodId}`);
    },
    [logAudit, currentUser, supabaseSession],
  );

  const addEvaluation: HrisContextShape["addEvaluation"] = useCallback(
    async (input) => {
      if (supabaseSession) {
        try {
          const entry = await insertEvaluation(input);
          setState((prev) => ({ ...prev, evaluations: [entry, ...prev.evaluations] }));
          logAudit("Performance Evaluation", "create", `Created evaluation for period ${input.period}`);
          return;
        } catch (err) {
          console.error("Failed to add evaluation in Supabase", err);
          return;
        }
      }
      const entry: PerformanceEvaluation = { ...input, id: nextId("ev"), createdAt: TODAY };
      setState((prev) => ({ ...prev, evaluations: [entry, ...prev.evaluations] }));
      logAudit("Performance Evaluation", "create", `Created evaluation for period ${input.period}`);
    },
    [logAudit, supabaseSession],
  );

  // Saves just one category's ratings/remarks onto an existing evaluation —
  // HR saves Behavior, the employee's designated Job Performance evaluator
  // saves Job Performance, independently of each other. Stamps whichever
  // section-evaluator field matches `category`, leaving the other section
  // (and its evaluator stamp) untouched.
  const updateEvaluationSection: HrisContextShape["updateEvaluationSection"] = useCallback(
    async (id, category, sectionCriteria, evaluatorEmployeeId, comments) => {
      if (supabaseSession) {
        try {
          const existing = state.evaluations.find((e) => e.id === id);
          if (!existing) return;
          const criteria: EvaluationCriterion[] = [...existing.criteria.filter((c) => c.category !== category), ...sectionCriteria];
          const entry = await updateEvaluationRow(id, {
            criteria,
            overallScore: computeOverallScore(criteria),
            behaviorEvaluatorId: category === "Behavior" ? evaluatorEmployeeId : existing.behaviorEvaluatorId,
            jobPerformanceEvaluatorId: category === "Job Performance" ? evaluatorEmployeeId : existing.jobPerformanceEvaluatorId,
            comments: comments !== undefined ? comments : existing.comments,
          });
          setState((prev) => ({ ...prev, evaluations: prev.evaluations.map((e) => (e.id === id ? entry : e)) }));
          logAudit("Performance Evaluation", "update", `Saved ${category} section for evaluation ${id}`);
          return;
        } catch (err) {
          console.error("Failed to save evaluation section in Supabase", err);
          return;
        }
      }
      setState((prev) => ({
        ...prev,
        evaluations: prev.evaluations.map((e) => {
          if (e.id !== id) return e;
          const criteria: EvaluationCriterion[] = [...e.criteria.filter((c) => c.category !== category), ...sectionCriteria];
          return {
            ...e,
            criteria,
            overallScore: computeOverallScore(criteria),
            behaviorEvaluatorId: category === "Behavior" ? evaluatorEmployeeId : e.behaviorEvaluatorId,
            jobPerformanceEvaluatorId: category === "Job Performance" ? evaluatorEmployeeId : e.jobPerformanceEvaluatorId,
            comments: comments !== undefined ? comments : e.comments,
          };
        }),
      }));
      logAudit("Performance Evaluation", "update", `Saved ${category} section for evaluation ${id}`);
    },
    [logAudit, supabaseSession, state.evaluations],
  );

  const setEvaluationStatus: HrisContextShape["setEvaluationStatus"] = useCallback(
    async (id, status) => {
      if (supabaseSession) {
        try {
          await updateEvaluationRow(id, { status });
        } catch (err) {
          console.error("Failed to update evaluation status in Supabase", err);
          return;
        }
      }
      setState((prev) => ({
        ...prev,
        evaluations: prev.evaluations.map((e) => (e.id === id ? { ...e, status } : e)),
      }));
      logAudit("Performance Evaluation", "update", `Evaluation status changed`, null, status);
    },
    [logAudit, supabaseSession],
  );

  const addDisciplinaryRecord: HrisContextShape["addDisciplinaryRecord"] = useCallback(
    async (input) => {
      if (supabaseSession) {
        try {
          const entry = await insertDisciplinaryRecord(input);
          setState((prev) => ({ ...prev, disciplinaryRecords: [entry, ...prev.disciplinaryRecords] }));
          logAudit("Discipline", "create", `Issued ${input.type.replace("_", " ")}`);
          return;
        } catch (err) {
          console.error("Failed to add disciplinary record in Supabase", err);
          return;
        }
      }
      const entry: DisciplinaryRecord = { ...input, id: nextId("disc") };
      setState((prev) => ({ ...prev, disciplinaryRecords: [entry, ...prev.disciplinaryRecords] }));
      logAudit("Discipline", "create", `Issued ${input.type.replace("_", " ")}`);
    },
    [logAudit, supabaseSession],
  );

  const setDisciplinaryStatus: HrisContextShape["setDisciplinaryStatus"] = useCallback(
    async (id, status) => {
      if (supabaseSession) {
        try {
          await updateDisciplinaryStatusRow(id, status);
        } catch (err) {
          console.error("Failed to update disciplinary status in Supabase", err);
          return;
        }
      }
      setState((prev) => ({
        ...prev,
        disciplinaryRecords: prev.disciplinaryRecords.map((d) => (d.id === id ? { ...d, status } : d)),
      }));
      logAudit("Discipline", "update", `Record marked ${status}`);
    },
    [logAudit, supabaseSession],
  );

  const addAnnouncement: HrisContextShape["addAnnouncement"] = useCallback(
    async (input) => {
      if (supabaseSession) {
        try {
          const entry = await insertAnnouncement(input);
          setState((prev) => ({ ...prev, announcements: [entry, ...prev.announcements] }));
          logAudit("Bulletin Board", "create", `Posted announcement: ${input.title}`);
          return;
        } catch (err) {
          console.error("Failed to add announcement in Supabase", err);
          return;
        }
      }
      const entry: Announcement = { ...input, id: nextId("an"), postedAt: TODAY };
      setState((prev) => ({ ...prev, announcements: [entry, ...prev.announcements] }));
      logAudit("Bulletin Board", "create", `Posted announcement: ${input.title}`);
    },
    [logAudit, supabaseSession],
  );

  // `cloud`, when given, lets these generic CRUD helpers write through to
  // Supabase (Phase 1 tables) whenever there's a real Supabase session;
  // demo-login users (no session) keep today's local-only behavior.
  function makeCrud<T extends { id: string }>(
    key: keyof PersistedState,
    moduleLabel: string,
    idPrefix: string,
    cloud?: {
      insert: (input: Omit<T, "id">) => Promise<T>;
      update: (id: string, patch: Partial<Omit<T, "id">>) => Promise<T>;
      remove: (id: string) => Promise<void>;
    },
  ) {
    const add = async (input: Omit<T, "id">) => {
      if (cloud && supabaseSession) {
        try {
          const entry = await cloud.insert(input);
          setState((prev) => ({ ...prev, [key]: [...(prev[key] as unknown as T[]), entry] }));
          logAudit(moduleLabel, "create", `Added new ${moduleLabel.toLowerCase()} record`);
          return;
        } catch (err) {
          console.error(`Failed to add ${moduleLabel} record in Supabase`, err);
          return;
        }
      }
      const entry = { ...input, id: nextId(idPrefix) } as unknown as T;
      setState((prev) => ({ ...prev, [key]: [...(prev[key] as unknown as T[]), entry] }));
      logAudit(moduleLabel, "create", `Added new ${moduleLabel.toLowerCase()} record`);
    };
    const update = async (id: string, patch: Partial<Omit<T, "id">>) => {
      if (cloud && supabaseSession) {
        try {
          const entry = await cloud.update(id, patch);
          setState((prev) => ({
            ...prev,
            [key]: (prev[key] as unknown as T[]).map((item) => (item.id === id ? entry : item)),
          }));
          logAudit(moduleLabel, "update", `Updated ${moduleLabel.toLowerCase()} record`);
          return;
        } catch (err) {
          console.error(`Failed to update ${moduleLabel} record in Supabase`, err);
          return;
        }
      }
      setState((prev) => ({
        ...prev,
        [key]: (prev[key] as unknown as T[]).map((item) => (item.id === id ? { ...item, ...patch } : item)),
      }));
      logAudit(moduleLabel, "update", `Updated ${moduleLabel.toLowerCase()} record`);
    };
    const remove = async (id: string) => {
      if (cloud && supabaseSession) {
        try {
          await cloud.remove(id);
        } catch (err) {
          console.error(`Failed to remove ${moduleLabel} record in Supabase`, err);
          return;
        }
      }
      setState((prev) => ({
        ...prev,
        [key]: (prev[key] as unknown as T[]).filter((item) => item.id !== id),
      }));
      logAudit(moduleLabel, "delete", `Removed ${moduleLabel.toLowerCase()} record`);
    };
    return { add, update, remove };
  }

  const branchCrud = makeCrud<Branch>("branches", "Branch Config", "br", {
    insert: insertBranch,
    update: updateBranchRow,
    remove: deleteBranchRow,
  });
  const deptCrud = makeCrud<Department>("departments", "Department Config", "dp", {
    insert: insertDepartment,
    update: updateDepartmentRow,
    remove: deleteDepartmentRow,
  });
  const positionCrud = makeCrud<Position>("positions", "Position Config", "ps", {
    insert: insertPosition,
    update: updatePositionRow,
    remove: deletePositionRow,
  });
  const scheduleCrud = makeCrud<WorkSchedule>("workSchedules", "Work Schedule Config", "ws", {
    insert: insertWorkSchedule,
    update: updateWorkScheduleRow,
    remove: deleteWorkScheduleRow,
  });
  const holidayCrud = makeCrud<Holiday>("holidays", "Holiday Config", "hd", {
    insert: insertHoliday,
    update: updateHolidayRow,
    remove: deleteHolidayRow,
  });
  const leaveTypeCrud = makeCrud<LeaveType>("leaveTypes", "Leave Type Config", "lt", {
    insert: insertLeaveType,
    update: updateLeaveTypeRow,
    remove: deleteLeaveTypeRow,
  });

  const setPayrollPeriodStatus: HrisContextShape["setPayrollPeriodStatus"] = useCallback(
    async (id, status) => {
      if (supabaseSession) {
        try {
          await updatePayrollPeriodRow(id, { status });
        } catch (err) {
          console.error("Failed to update payroll period status in Supabase", err);
          return;
        }
      }
      setState((prev) => ({
        ...prev,
        payrollPeriods: prev.payrollPeriods.map((p) => (p.id === id ? { ...p, status } : p)),
      }));
      logAudit("Payroll", "update", `Payroll period status set to ${status}`);
    },
    [logAudit, supabaseSession],
  );

  const addPayrollPeriod: HrisContextShape["addPayrollPeriod"] = useCallback(
    async (input) => {
      if (supabaseSession) {
        try {
          const entry = await insertPayrollPeriod(input);
          setState((prev) => ({ ...prev, payrollPeriods: [...prev.payrollPeriods, entry] }));
          logAudit("Payroll", "create", `Created payroll period ${input.start} to ${input.end}`);
          return;
        } catch (err) {
          console.error("Failed to add payroll period in Supabase", err);
          return;
        }
      }
      const entry: PayrollPeriod = { ...input, id: nextId("pp") };
      setState((prev) => ({ ...prev, payrollPeriods: [...prev.payrollPeriods, entry] }));
      logAudit("Payroll", "create", `Created payroll period ${input.start} to ${input.end}`);
    },
    [logAudit, supabaseSession],
  );

  const updateUserRoles: HrisContextShape["updateUserRoles"] = useCallback(
    (userId, roles) => {
      setDemoUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, roles } : u)));
      logAudit("System Administration", "update", `Updated role assignment for user ${userId}`);
    },
    [logAudit],
  );

  const addGeneratedBirForm: HrisContextShape["addGeneratedBirForm"] = useCallback(
    async (input) => {
      const actor = currentUser;
      const label = input.formType === "1601c" ? "BIR Form 1601-C" : "BIR Form 2316";
      if (supabaseSession) {
        try {
          const entry = await insertGeneratedBirForm(input, actor?.name ?? "System");
          setState((prev) => ({ ...prev, generatedBirForms: [entry, ...prev.generatedBirForms] }));
          logAudit("BIR", "generate", `Generated ${label} for ${input.period}`);
          return;
        } catch (err) {
          console.error("Failed to save generated BIR form in Supabase", err);
          return;
        }
      }
      setState((prev) => {
        const entry: GeneratedBirForm = {
          ...input,
          id: nextId("bir"),
          generatedAt: TODAY,
          generatedBy: actor?.name ?? "System",
        };
        return { ...prev, generatedBirForms: [entry, ...prev.generatedBirForms] };
      });
      logAudit("BIR", "generate", `Generated ${label} for ${input.period}`);
    },
    [logAudit, currentUser, supabaseSession],
  );

  const fileLeaveRequest: HrisContextShape["fileLeaveRequest"] = useCallback(
    async (input) => {
      if (supabaseSession) {
        try {
          const entry = await insertLeaveRequest(input);
          setState((prev) => ({ ...prev, leaveRequests: [entry, ...prev.leaveRequests] }));
          logAudit("Leave Management", "file", `Filed leave request (${input.days} day(s))`);
          return;
        } catch (err) {
          console.error("Failed to file leave request in Supabase", err);
          return;
        }
      }
      const entry: LeaveRequest = { ...input, id: nextId("lv"), status: "pending", filedAt: TODAY, decidedBy: null, decidedAt: null, decisionNote: null };
      setState((prev) => ({ ...prev, leaveRequests: [entry, ...prev.leaveRequests] }));
      logAudit("Leave Management", "file", `Filed leave request (${input.days} day(s))`);
    },
    [logAudit, supabaseSession],
  );

  const decideLeaveRequest: HrisContextShape["decideLeaveRequest"] = useCallback(
    async (id, decision, note) => {
      const actor = currentUser;
      if (supabaseSession && actor?.employeeId) {
        try {
          const entry = await decideLeaveRequestRow(id, decision, actor.employeeId, note ?? null);
          setState((prev) => ({ ...prev, leaveRequests: prev.leaveRequests.map((r) => (r.id === id ? entry : r)) }));
          logAudit("Leave Management", "decide", `Leave request ${decision}`);
          return;
        } catch (err) {
          console.error("Failed to decide leave request in Supabase", err);
          return;
        }
      }
      setState((prev) => ({
        ...prev,
        leaveRequests: prev.leaveRequests.map((r) =>
          r.id === id ? { ...r, status: decision, decidedBy: actor?.employeeId ?? null, decidedAt: TODAY, decisionNote: note ?? null } : r,
        ),
      }));
      logAudit("Leave Management", "decide", `Leave request ${decision}`);
    },
    [logAudit, currentUser, supabaseSession],
  );

  const fileOvertimeRequest: HrisContextShape["fileOvertimeRequest"] = useCallback(
    async (input) => {
      if (supabaseSession) {
        try {
          const entry = await insertOvertimeRequest(input);
          setState((prev) => ({ ...prev, overtimeRequests: [entry, ...prev.overtimeRequests] }));
          logAudit("Overtime", "file", `Filed overtime request (${input.hours}h on ${input.date})`);
          return;
        } catch (err) {
          console.error("Failed to file overtime request in Supabase", err);
          return;
        }
      }
      const entry: OvertimeRequest = { ...input, id: nextId("ot"), status: "pending", filedAt: TODAY, decidedBy: null, decidedAt: null, decisionNote: null };
      setState((prev) => ({ ...prev, overtimeRequests: [entry, ...prev.overtimeRequests] }));
      logAudit("Overtime", "file", `Filed overtime request (${input.hours}h on ${input.date})`);
    },
    [logAudit, supabaseSession],
  );

  const decideOvertimeRequest: HrisContextShape["decideOvertimeRequest"] = useCallback(
    async (id, decision, note) => {
      const actor = currentUser;
      if (supabaseSession && actor?.employeeId) {
        try {
          const entry = await decideOvertimeRequestRow(id, decision, actor.employeeId, note ?? null);
          setState((prev) => ({ ...prev, overtimeRequests: prev.overtimeRequests.map((r) => (r.id === id ? entry : r)) }));
          logAudit("Overtime", "decide", `Overtime request ${decision}`);
          return;
        } catch (err) {
          console.error("Failed to decide overtime request in Supabase", err);
          return;
        }
      }
      setState((prev) => ({
        ...prev,
        overtimeRequests: prev.overtimeRequests.map((r) =>
          r.id === id ? { ...r, status: decision, decidedBy: actor?.employeeId ?? null, decidedAt: TODAY, decisionNote: note ?? null } : r,
        ),
      }));
      logAudit("Overtime", "decide", `Overtime request ${decision}`);
    },
    [logAudit, currentUser, supabaseSession],
  );

  const fileCorrectionRequest: HrisContextShape["fileCorrectionRequest"] = useCallback(
    async (input) => {
      if (supabaseSession) {
        try {
          const entry = await insertCorrectionRequest(input);
          setState((prev) => ({ ...prev, correctionRequests: [entry, ...prev.correctionRequests] }));
          logAudit("Attendance Corrections", "file", `Filed attendance correction for ${input.date}`);
          return;
        } catch (err) {
          console.error("Failed to file correction request in Supabase", err);
          return;
        }
      }
      const entry: AttendanceCorrectionRequest = { ...input, id: nextId("ac"), status: "pending", filedAt: TODAY, decidedBy: null, decidedAt: null, decisionNote: null };
      setState((prev) => ({ ...prev, correctionRequests: [entry, ...prev.correctionRequests] }));
      logAudit("Attendance Corrections", "file", `Filed attendance correction for ${input.date}`);
    },
    [logAudit, supabaseSession],
  );

  const decideCorrectionRequest: HrisContextShape["decideCorrectionRequest"] = useCallback(
    async (id, decision, note) => {
      const actor = currentUser;
      if (supabaseSession && actor?.employeeId) {
        try {
          const entry = await decideCorrectionRequestRow(id, decision, actor.employeeId, note ?? null);
          setState((prev) => ({ ...prev, correctionRequests: prev.correctionRequests.map((r) => (r.id === id ? entry : r)) }));
          logAudit("Attendance Corrections", "decide", `Correction request ${decision}`);
          return;
        } catch (err) {
          console.error("Failed to decide correction request in Supabase", err);
          return;
        }
      }
      setState((prev) => ({
        ...prev,
        correctionRequests: prev.correctionRequests.map((r) =>
          r.id === id ? { ...r, status: decision, decidedBy: actor?.employeeId ?? null, decidedAt: TODAY, decisionNote: note ?? null } : r,
        ),
      }));
      logAudit("Attendance Corrections", "decide", `Correction request ${decision}`);
    },
    [logAudit, currentUser, supabaseSession],
  );

  const addGeneratedPayslip: HrisContextShape["addGeneratedPayslip"] = useCallback(
    async (input) => {
      const actor = currentUser;
      if (supabaseSession) {
        try {
          const entry = await insertGeneratedPayslip(input, actor?.name ?? "System");
          setState((prev) => ({ ...prev, generatedPayslips: [entry, ...prev.generatedPayslips] }));
          logAudit("Payslips", "generate", `Generated payslip for period ${input.periodId}`);
          return;
        } catch (err) {
          console.error("Failed to save generated payslip in Supabase", err);
          return;
        }
      }
      setState((prev) => {
        const entry: GeneratedPayslip = { ...input, id: nextId("ps"), generatedAt: TODAY, generatedBy: actor?.name ?? "System" };
        return { ...prev, generatedPayslips: [entry, ...prev.generatedPayslips] };
      });
      logAudit("Payslips", "generate", `Generated payslip for period ${input.periodId}`);
    },
    [logAudit, currentUser, supabaseSession],
  );

  const addGeneratedVoucher: HrisContextShape["addGeneratedVoucher"] = useCallback(
    async (input) => {
      const actor = currentUser;
      if (supabaseSession) {
        try {
          const entry = await insertGeneratedVoucher(input, actor?.name ?? "System");
          setState((prev) => ({ ...prev, generatedVouchers: [entry, ...prev.generatedVouchers] }));
          logAudit("Allowance Vouchers", "generate", `Generated voucher for period ${input.periodId}`);
          return;
        } catch (err) {
          console.error("Failed to save generated voucher in Supabase", err);
          return;
        }
      }
      setState((prev) => {
        const entry: GeneratedVoucher = { ...input, id: nextId("vo"), generatedAt: TODAY, generatedBy: actor?.name ?? "System" };
        return { ...prev, generatedVouchers: [entry, ...prev.generatedVouchers] };
      });
      logAudit("Allowance Vouchers", "generate", `Generated voucher for period ${input.periodId}`);
    },
    [logAudit, currentUser, supabaseSession],
  );

  const value: HrisContextShape = {
    ready,
    currentUser,
    currentEmployee,
    login,
    loginWithSupabase,
    logout,
    employees: state.employees,
    evaluations: state.evaluations,
    disciplinaryRecords: state.disciplinaryRecords,
    auditLogs: state.auditLogs,
    announcements: state.announcements,
    branches: state.branches,
    departments: state.departments,
    positions: state.positions,
    workSchedules: state.workSchedules,
    holidays: state.holidays,
    leaveTypes: state.leaveTypes,
    payrollPeriods: state.payrollPeriods,
    generatedBirForms: state.generatedBirForms,
    leaveRequests: state.leaveRequests,
    overtimeRequests: state.overtimeRequests,
    correctionRequests: state.correctionRequests,
    generatedPayslips: state.generatedPayslips,
    generatedVouchers: state.generatedVouchers,
    attendancePeriodRecords: state.attendancePeriodRecords,
    payrollLineOverrides: state.payrollLineOverrides,
    voucherAmountOverrides: state.voucherAmountOverrides,
    updateEmployee,
    addEmployee,
    upsertAttendancePeriodRecord,
    importAttendancePeriodRecords,
    upsertPayrollLineOverride,
    upsertVoucherAmountOverride,
    addEvaluation,
    updateEvaluationSection,
    setEvaluationStatus,
    addDisciplinaryRecord,
    setDisciplinaryStatus,
    addAnnouncement,
    addBranch: branchCrud.add,
    updateBranch: branchCrud.update,
    removeBranch: branchCrud.remove,
    addDepartment: deptCrud.add,
    updateDepartment: deptCrud.update,
    removeDepartment: deptCrud.remove,
    addPosition: positionCrud.add,
    updatePosition: positionCrud.update,
    removePosition: positionCrud.remove,
    addWorkSchedule: scheduleCrud.add,
    updateWorkSchedule: scheduleCrud.update,
    removeWorkSchedule: scheduleCrud.remove,
    addHoliday: holidayCrud.add,
    updateHoliday: holidayCrud.update,
    removeHoliday: holidayCrud.remove,
    addLeaveType: leaveTypeCrud.add,
    updateLeaveType: leaveTypeCrud.update,
    removeLeaveType: leaveTypeCrud.remove,
    setPayrollPeriodStatus,
    addPayrollPeriod,
    updateUserRoles,
    demoUsers,
    addGeneratedBirForm,
    fileLeaveRequest,
    decideLeaveRequest,
    fileOvertimeRequest,
    decideOvertimeRequest,
    fileCorrectionRequest,
    decideCorrectionRequest,
    addGeneratedPayslip,
    addGeneratedVoucher,
  };

  return <HrisContext.Provider value={value}>{children}</HrisContext.Provider>;
}

export function useHris(): HrisContextShape {
  const ctx = useContext(HrisContext);
  if (!ctx) throw new Error("useHris must be used within HrisProvider");
  return ctx;
}
