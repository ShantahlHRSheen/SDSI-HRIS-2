"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { fullName, nextEmployeeNumber, setReferenceData } from "./helpers";
import { getSupabaseClient } from "./supabase/client";
import { reportSaveError } from "./save-errors";
import { getInitialSession, isSupabaseConfigured, signInWithPassword as supabaseSignInWithPassword, signOutSupabase, watchAuthState } from "./supabase/auth";
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
  fetchEmployeeDepartmentAllocations,
  fetchEmployees,
  fetchEvaluations,
  fetchGeneratedBirForms,
  fetchGeneratedPayslips,
  fetchGeneratedVouchers,
  fetchHolidays,
  fetchLeaveRequests,
  uploadAnnouncementImages,
  removeAnnouncementImages,
  announcementImageUrls,
  fetchLeaveAttachments,
  uploadLeaveAttachmentFile,
  leaveAttachmentDownloadUrl,
  fetchLeaveTypes,
  fetchOvertimeRequests,
  fetchPayrollLineOverrides,
  fetchPayrollPeriods,
  fetchPositions,
  fetchVoucherAmountOverrides,
  fetchWorkSchedules,
  importAttendancePeriodRecordsRows,
  insertAnnouncement,
  deleteAnnouncementRow,
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
  replaceEmployeeDepartmentAllocations,
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
  importPayrollRegisterRows,
  removePayrollEntries,
  updateGeneratedPayslipRow,
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
  EMPLOYEE_DEPARTMENT_ALLOCATIONS,
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
  EmployeeDepartmentAllocation,
  EvaluationCriterion,
  GeneratedBirForm,
  GeneratedPayslip,
  GeneratedVoucher,
  Holiday,
  LeaveRequest,
  AnnouncementImage,
  LeaveAttachment,
  LeaveAttachmentKind,
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

// Bump this whenever the shape of the seed data in mock-data.ts changes in a
// way a visitor should see (departments/positions restructured, fields
// renamed, etc.). Demo mode (no Supabase session) persists everything to
// localStorage, so without this a browser that already has a cached snapshot
// would keep showing the old seed data forever instead of the new one.
const SEED_VERSION = 2;

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
  leaveAttachments: LeaveAttachment[];
  overtimeRequests: OvertimeRequest[];
  correctionRequests: AttendanceCorrectionRequest[];
  generatedPayslips: GeneratedPayslip[];
  generatedVouchers: GeneratedVoucher[];
  attendancePeriodRecords: AttendancePeriodRecord[];
  payrollLineOverrides: PayrollLineOverride[];
  voucherAmountOverrides: VoucherAmountOverride[];
  employeeDepartmentAllocations: EmployeeDepartmentAllocation[];
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
    leaveAttachments: [],
    overtimeRequests: OVERTIME_REQUESTS,
    correctionRequests: CORRECTION_REQUESTS,
    generatedPayslips: [],
    generatedVouchers: [],
    attendancePeriodRecords: ATTENDANCE_PERIOD_RECORDS,
    payrollLineOverrides: [],
    voucherAmountOverrides: [],
    employeeDepartmentAllocations: EMPLOYEE_DEPARTMENT_ALLOCATIONS,
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
  leaveAttachments: LeaveAttachment[];
  overtimeRequests: OvertimeRequest[];
  correctionRequests: AttendanceCorrectionRequest[];
  generatedPayslips: GeneratedPayslip[];
  generatedVouchers: GeneratedVoucher[];
  attendancePeriodRecords: AttendancePeriodRecord[];
  payrollLineOverrides: PayrollLineOverride[];
  voucherAmountOverrides: VoucherAmountOverride[];
  employeeDepartmentAllocations: EmployeeDepartmentAllocation[];

  updateEmployee: (id: string, patch: Partial<Omit<Employee, "id" | "employeeNumber">>) => void;
  setEmployeeDepartmentAllocations: (employeeId: string, allocations: { departmentId: string; percent: number }[]) => void;
  addEmployee: (input: Omit<Employee, "id" | "employeeNumber">) => void;

  upsertAttendancePeriodRecord: (input: Omit<AttendancePeriodRecord, "id" | "source" | "updatedBy" | "updatedAt">) => void;
  importAttendancePeriodRecords: (periodId: string, rows: Omit<AttendancePeriodRecord, "id" | "periodId" | "source" | "updatedBy" | "updatedAt">[]) => void;

  upsertPayrollLineOverride: (input: Omit<PayrollLineOverride, "id" | "updatedBy" | "updatedAt">) => void;
  // Resolves to an error message, or null on success.
  // removeEmployeeIds: people to take off this period's payroll (their
  // attendance, payroll figures and payslips) — e.g. not in the new file.
  importPayrollRegister: (
    periodId: string,
    rows: {
      attendance: Omit<AttendancePeriodRecord, "id" | "periodId" | "source" | "updatedBy" | "updatedAt">;
      override: Omit<PayrollLineOverride, "id" | "periodId" | "updatedBy" | "updatedAt">;
    }[],
    removeEmployeeIds?: string[],
  ) => Promise<string | null>;
  // Refreshes a payslip to the given figures. Resolves to true once saved.
  updateGeneratedPayslip: (id: string, summary: GeneratedPayslip["summary"]) => Promise<boolean>;
  upsertVoucherAmountOverride: (input: Omit<VoucherAmountOverride, "id" | "updatedBy" | "updatedAt">) => void;

  addEvaluation: (input: Omit<PerformanceEvaluation, "id" | "createdAt">) => void;
  updateEvaluationSection: (id: string, category: KpiCategory, criteria: EvaluationCriterion[], evaluatorEmployeeId: string, comments?: string) => void;
  setEvaluationStatus: (id: string, status: PerformanceEvaluation["status"]) => void;

  addDisciplinaryRecord: (input: Omit<DisciplinaryRecord, "id">) => void;
  setDisciplinaryStatus: (id: string, status: DisciplinaryRecord["status"]) => void;

  // Uploads any photos first. Resolves to an error message, or null on success.
  addAnnouncement: (input: Omit<Announcement, "id" | "postedAt" | "images">, photos?: File[]) => Promise<string | null>;
  announcementImageUrls: (images: AnnouncementImage[]) => Promise<Record<string, string>>;
  // Deletes the post with its photos, comments and reactions. Resolves to an error message, or null.
  removeAnnouncement: (id: string) => Promise<string | null>;

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

  // Resolves to the new request's id, or null if it couldn't be saved.
  fileLeaveRequest: (input: Omit<LeaveRequest, "id" | "status" | "filedAt" | "decidedBy" | "decidedAt" | "decisionNote">) => Promise<string | null>;
  // File attachments need a real (Supabase) sign-in — false in the demo.
  canAttachLeaveFiles: boolean;
  // Signed in with a real account (not a demo user).
  isRealAccount: boolean;
  // Reflects a change already saved elsewhere (e.g. ID photo, emergency
  // contact saved through their own database functions) in the loaded data.
  patchEmployeeLocal: (id: string, patch: Partial<Employee>) => void;
  // The latest load from the database failed — data on screen may be out of date.
  dataLoadError: boolean;
  // Still checking the saved sign-in / loading the signed-in user's data —
  // don't treat the visitor as signed out yet.
  authPending: boolean;
  // After HR issues a temporary password: marks the employee as having a
  // login and records it in the audit trail (never the password itself).
  recordLoginIssued: (employeeId: string, created: boolean) => void;
  // Signed in with a temporary password HR issued — must pick their own first.
  mustChangePassword: boolean;
  // Resolves to an error message, or null on success.
  uploadLeaveAttachment: (input: { leaveRequestId: string; employeeId: string; kind: LeaveAttachmentKind; file: File }) => Promise<string | null>;
  leaveAttachmentUrl: (attachment: LeaveAttachment) => Promise<string>;
  decideLeaveRequest: (id: string, decision: Extract<RequestStatus, "approved" | "rejected">, note?: string) => void;

  fileOvertimeRequest: (input: Omit<OvertimeRequest, "id" | "status" | "filedAt" | "decidedBy" | "decidedAt" | "decisionNote">) => void;
  decideOvertimeRequest: (id: string, decision: Extract<RequestStatus, "approved" | "rejected">, note?: string) => void;

  fileCorrectionRequest: (input: Omit<AttendanceCorrectionRequest, "id" | "status" | "filedAt" | "decidedBy" | "decidedAt" | "decisionNote">) => void;
  decideCorrectionRequest: (id: string, decision: Extract<RequestStatus, "approved" | "rejected">, note?: string) => void;

  // Resolves to true once saved (false if saving failed; the error is shown as a toast).
  addGeneratedPayslip: (input: Omit<GeneratedPayslip, "id" | "generatedAt" | "generatedBy">) => Promise<boolean>;
  addGeneratedVoucher: (input: Omit<GeneratedVoucher, "id" | "generatedAt" | "generatedBy">) => void;
}

const HrisContext = createContext<HrisContextShape | null>(null);

export function HrisProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<PersistedState>(defaultState);
  const [demoUsers, setDemoUsers] = useState<DemoUser[]>(DEMO_USERS);
  const [ready, setReady] = useState(false);
  const [supabaseSession, setSupabaseSession] = useState<Session | null>(null);
  // Whether the saved sign-in (if any) has been checked yet, and which
  // signed-in user's data has finished loading — until both are known the
  // app shouldn't decide the visitor is signed out and redirect them.
  const [sessionChecked, setSessionChecked] = useState(() => !isSupabaseConfigured());
  const [dataLoadedFor, setDataLoadedFor] = useState<string | null>(null);
  // The last load from the database failed, so what's shown may be stale.
  const [dataLoadError, setDataLoadError] = useState(false);

  // Real per-employee login, layered on top of the demo click-to-select
  // login below rather than replacing it — not every employee has a
  // Supabase Auth account yet. A signed-in Supabase session is matched to
  // an employee by email; everything else (payroll, attendance, etc.)
  // still reads/writes localStorage exactly as before.
  useEffect(() => {
    let active = true;
    getInitialSession()
      .then((session) => {
        if (active) setSupabaseSession(session);
      })
      .finally(() => {
        if (active) setSessionChecked(true);
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
          employeeDepartmentAllocations,
          evaluations,
          disciplinaryRecords,
          announcements,
          leaveRequests,
          leaveAttachments,
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
          fetchEmployeeDepartmentAllocations(),
          fetchEvaluations(),
          fetchDisciplinaryRecords(),
          fetchAnnouncements(),
          fetchLeaveRequests(),
          fetchLeaveAttachments(),
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
          employeeDepartmentAllocations,
          evaluations,
          disciplinaryRecords,
          announcements,
          leaveRequests,
          leaveAttachments,
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
        setDataLoadError(false);
      } catch (err) {
        console.error("Failed to load org/employee data from Supabase — keeping local data.", err);
        if (active) setDataLoadError(true);
      } finally {
        if (active) setDataLoadedFor(supabaseSession.user.id);
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
        const parsed = JSON.parse(raw) as PersistedState & { demoUsers?: DemoUser[]; __seedVersion?: number };
        if (parsed.__seedVersion === SEED_VERSION) {
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setState((prev) => ({ ...prev, ...parsed }));
          if (parsed.demoUsers) setDemoUsers(parsed.demoUsers);
        }
        // Stale seed version: fall through with the fresh defaultState() already
        // in place; the write effect below persists it under the new version.
      }
    } catch {
      // ignore corrupt storage
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, demoUsers, __seedVersion: SEED_VERSION }));
    } catch {
      // storage full / unavailable — demo continues in-memory only
    }
  }, [state, demoUsers, ready]);

  const supabaseEmployee = useMemo(() => {
    const email = supabaseSession?.user.email;
    if (!email) return null;
    return state.employees.find((e) => e.email?.toLowerCase() === email.toLowerCase()) ?? null;
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
    // Demo users only exist in the demo build — on a real deployment a
    // demo sign-in left over in this browser's storage is ignored.
    if (isSupabaseConfigured()) return null;
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

      // Check the database, not this browser's saved copy of the employee
      // list — on a new device that copy is only the demo sample data.
      const { data: matched, error: lookupError } = await getSupabaseClient()
        .from("employees")
        .select("id")
        .eq("user_id", session.user.id)
        .maybeSingle();
      if (lookupError || !matched) {
        await signOutSupabase();
        return { error: lookupError ? "Couldn't load your employee record — please try again." : `Signed in, but no employee record is linked to ${email}. Contact HR.` };
      }
      setSupabaseSession(session);
      return { error: null };
    },
    [],
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
          reportSaveError("Couldn't update employee", err);
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

  const setEmployeeDepartmentAllocations: HrisContextShape["setEmployeeDepartmentAllocations"] = useCallback(
    async (employeeId, allocations) => {
      if (supabaseSession) {
        try {
          const rows = await replaceEmployeeDepartmentAllocations(employeeId, allocations);
          setState((prev) => ({
            ...prev,
            employeeDepartmentAllocations: [...prev.employeeDepartmentAllocations.filter((a) => a.employeeId !== employeeId), ...rows],
          }));
          logAudit("Employee 201 File", "update", `Updated department allocation for employee ${employeeId}`);
          return;
        } catch (err) {
          reportSaveError("Couldn't save department allocation", err);
          return;
        }
      }
      setState((prev) => ({
        ...prev,
        employeeDepartmentAllocations: [
          ...prev.employeeDepartmentAllocations.filter((a) => a.employeeId !== employeeId),
          ...allocations.map((a) => ({ employeeId, departmentId: a.departmentId, percent: a.percent })),
        ],
      }));
      logAudit("Employee 201 File", "update", `Updated department allocation for employee ${employeeId}`);
    },
    [logAudit, supabaseSession],
  );

  const addEmployee: HrisContextShape["addEmployee"] = useCallback(
    async (input) => {
      if (supabaseSession) {
        try {
          const entry = await insertEmployee(input, nextEmployeeNumber(state.employees));
          setState((prev) => ({ ...prev, employees: [...prev.employees, entry] }));
          logAudit("Employee 201 File", "create", `Added new employee: ${input.firstName} ${input.lastName}`);
          return;
        } catch (err) {
          reportSaveError("Couldn't add employee", err);
          return;
        }
      }
      setState((prev) => {
        const entry: Employee = { ...input, id: nextId("emp"), employeeNumber: nextEmployeeNumber(prev.employees) };
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
          reportSaveError("Couldn't save attendance record", err);
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
          reportSaveError("Couldn't import attendance records", err);
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
          reportSaveError("Couldn't save the payroll line", err);
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

  const importPayrollRegister: HrisContextShape["importPayrollRegister"] = useCallback(
    async (periodId, rows, removeEmployeeIds = []) => {
      const actor = currentUser?.name ?? "System";
      let attendance: AttendancePeriodRecord[];
      let overrides: PayrollLineOverride[];
      if (supabaseSession) {
        try {
          ({ attendance, overrides } = await importPayrollRegisterRows(periodId, rows, actor));
          await removePayrollEntries(periodId, removeEmployeeIds);
        } catch (err) {
          console.error("Failed to import payroll register in Supabase", err);
          return err instanceof Error ? err.message : "Could not save the imported payroll.";
        }
      } else {
        attendance = rows.map((r) => ({ ...r.attendance, id: nextId("att"), periodId, source: "import", updatedBy: actor, updatedAt: TODAY }));
        overrides = rows.map((r) => ({ ...r.override, id: nextId("plo"), periodId, updatedBy: actor, updatedAt: TODAY }));
      }
      // Replace only the imported employees' entries — everyone else's
      // attendance/overrides for the period stay as they were.
      const key = (r: { periodId: string; employeeId: string }) => `${r.periodId}::${r.employeeId}`;
      const attKeys = new Set(attendance.map(key));
      const ovKeys = new Set(overrides.map(key));
      const removed = new Set(removeEmployeeIds.map((id) => `${periodId}::${id}`));
      setState((prev) => ({
        ...prev,
        attendancePeriodRecords: [...attendance, ...prev.attendancePeriodRecords.filter((r) => !attKeys.has(key(r)) && !removed.has(key(r)))],
        payrollLineOverrides: [...overrides, ...prev.payrollLineOverrides.filter((r) => !ovKeys.has(key(r)) && !removed.has(key(r)))],
        generatedPayslips: prev.generatedPayslips.filter((r) => !removed.has(key(r))),
      }));
      logAudit(
        "Payroll",
        "import",
        `Imported payroll register for ${rows.length} employee(s), period ${periodId}` + (removeEmployeeIds.length ? `; removed ${removeEmployeeIds.length} not in the file` : ""),
      );
      return null;
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
          reportSaveError("Couldn't save the voucher amount", err);
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
          reportSaveError("Couldn't add evaluation", err);
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
          reportSaveError("Couldn't save evaluation section", err);
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
          reportSaveError("Couldn't update evaluation status", err);
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
          reportSaveError("Couldn't add disciplinary record", err);
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
          reportSaveError("Couldn't update disciplinary status", err);
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
    async (input, photos = []) => {
      if (supabaseSession) {
        let images: AnnouncementImage[] = [];
        try {
          images = await uploadAnnouncementImages(photos);
          const entry = await insertAnnouncement({ ...input, images });
          setState((prev) => ({ ...prev, announcements: [entry, ...prev.announcements] }));
          logAudit("Bulletin Board", "create", `Posted announcement: ${input.title}${images.length ? ` (${images.length} photo${images.length > 1 ? "s" : ""})` : ""}`);
          return null;
        } catch (err) {
          console.error("Failed to post announcement", err);
          await removeAnnouncementImages(images).catch(() => {});
          return err instanceof Error ? err.message : "Couldn't post the announcement.";
        }
      }
      if (photos.length) return "Photos need a real sign-in (not the demo login).";
      const entry: Announcement = { ...input, id: nextId("an"), postedAt: TODAY };
      setState((prev) => ({ ...prev, announcements: [entry, ...prev.announcements] }));
      logAudit("Bulletin Board", "create", `Posted announcement: ${input.title}`);
      return null;
    },
    [logAudit, supabaseSession],
  );

  const announcementImageUrlsFor: HrisContextShape["announcementImageUrls"] = useCallback((images) => announcementImageUrls(images), []);

  const removeAnnouncement: HrisContextShape["removeAnnouncement"] = useCallback(
    async (id) => {
      const post = state.announcements.find((a) => a.id === id);
      if (!post) return null;
      if (supabaseSession) {
        try {
          await deleteAnnouncementRow(id);
        } catch (err) {
          console.error("Failed to delete announcement", err);
          return err instanceof Error ? err.message : "Couldn't delete the post.";
        }
        // The post is gone either way; a leftover photo file is only storage.
        await removeAnnouncementImages(post.images ?? []).catch((err) => console.warn("Couldn't remove post photos", err));
      }
      setState((prev) => ({ ...prev, announcements: prev.announcements.filter((a) => a.id !== id) }));
      logAudit("Bulletin Board", "delete", `Deleted announcement: ${post.title}`);
      return null;
    },
    [logAudit, supabaseSession, state.announcements],
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
          reportSaveError(`Couldn't add the ${moduleLabel.replace(" Config", "").toLowerCase()}`, err);
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
          reportSaveError(`Couldn't update the ${moduleLabel.replace(" Config", "").toLowerCase()}`, err);
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
          reportSaveError(`Couldn't remove the ${moduleLabel.replace(" Config", "").toLowerCase()}`, err);
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
          reportSaveError("Couldn't update payroll period status", err);
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
          reportSaveError("Couldn't add payroll period", err);
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
          reportSaveError("Couldn't save generated BIR form", err);
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
          return entry.id;
        } catch (err) {
          console.error("Failed to file leave request in Supabase", err);
          return null;
        }
      }
      const entry: LeaveRequest = { ...input, id: nextId("lv"), status: "pending", filedAt: TODAY, decidedBy: null, decidedAt: null, decisionNote: null };
      setState((prev) => ({ ...prev, leaveRequests: [entry, ...prev.leaveRequests] }));
      logAudit("Leave Management", "file", `Filed leave request (${input.days} day(s))`);
      return entry.id;
    },
    [logAudit, supabaseSession],
  );

  const uploadLeaveAttachment: HrisContextShape["uploadLeaveAttachment"] = useCallback(
    async (input) => {
      if (!supabaseSession) return "Attachments need a real sign-in (not the demo login).";
      try {
        const entry = await uploadLeaveAttachmentFile(input, currentUser?.employeeId ?? null);
        setState((prev) => ({ ...prev, leaveAttachments: [entry, ...prev.leaveAttachments] }));
        logAudit("Leave Management", "upload", `Attached ${input.kind === "leave_form" ? "signed leave form" : "medical certificate"} to a leave request`);
        return null;
      } catch (err) {
        console.error("Failed to upload leave attachment", err);
        return err instanceof Error ? err.message : "Could not upload the file.";
      }
    },
    [logAudit, currentUser, supabaseSession],
  );

  const recordLoginIssued: HrisContextShape["recordLoginIssued"] = useCallback(
    (employeeId, created) => {
      setState((prev) => ({ ...prev, employees: prev.employees.map((e) => (e.id === employeeId ? { ...e, hasLogin: true } : e)) }));
      logAudit("User Access", created ? "create" : "update", `${created ? "Created login" : "Reset password"} for employee ${employeeId}`);
    },
    [logAudit],
  );

  const patchEmployeeLocal: HrisContextShape["patchEmployeeLocal"] = useCallback((id, patch) => {
    setState((prev) => ({ ...prev, employees: prev.employees.map((e) => (e.id === id ? { ...e, ...patch } : e)) }));
  }, []);

  const leaveAttachmentUrl: HrisContextShape["leaveAttachmentUrl"] = useCallback((attachment) => leaveAttachmentDownloadUrl(attachment), []);

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
          reportSaveError("Couldn't save your decision on the leave request", err);
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
          reportSaveError("Couldn't file overtime request", err);
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
          reportSaveError("Couldn't save your decision on the overtime request", err);
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
          reportSaveError("Couldn't file correction request", err);
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
          reportSaveError("Couldn't save your decision on the correction request", err);
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
          return true;
        } catch (err) {
          reportSaveError("Couldn't save generated payslip", err);
          return false;
        }
      }
      setState((prev) => {
        const entry: GeneratedPayslip = { ...input, id: nextId("ps"), generatedAt: TODAY, generatedBy: actor?.name ?? "System" };
        return { ...prev, generatedPayslips: [entry, ...prev.generatedPayslips] };
      });
      logAudit("Payslips", "generate", `Generated payslip for period ${input.periodId}`);
      return true;
    },
    [logAudit, currentUser, supabaseSession],
  );

  const updateGeneratedPayslip: HrisContextShape["updateGeneratedPayslip"] = useCallback(
    async (id, summary) => {
      const actor = currentUser?.name ?? "System";
      if (supabaseSession) {
        try {
          const entry = await updateGeneratedPayslipRow(id, summary, actor);
          setState((prev) => ({ ...prev, generatedPayslips: prev.generatedPayslips.map((p) => (p.id === id ? entry : p)) }));
          logAudit("Payslips", "update", `Updated payslip ${id} to current payroll figures`);
          return true;
        } catch (err) {
          reportSaveError("Couldn't update the payslip", err);
          return false;
        }
      }
      setState((prev) => ({ ...prev, generatedPayslips: prev.generatedPayslips.map((p) => (p.id === id ? { ...p, summary, generatedAt: TODAY, generatedBy: actor } : p)) }));
      return true;
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
          reportSaveError("Couldn't save generated voucher", err);
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

  // Keep the name helpers (branchName / departmentName / positionTitle) on
  // the lists actually loaded, before anything below renders with them.
  setReferenceData({ branches: state.branches, departments: state.departments, positions: state.positions });

  const value: HrisContextShape = {
    ready,
    currentUser,
    currentEmployee,
    login,
    loginWithSupabase,
    logout,
    employees: state.employees,
    employeeDepartmentAllocations: state.employeeDepartmentAllocations,
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
    leaveAttachments: state.leaveAttachments,
    overtimeRequests: state.overtimeRequests,
    correctionRequests: state.correctionRequests,
    generatedPayslips: state.generatedPayslips,
    generatedVouchers: state.generatedVouchers,
    attendancePeriodRecords: state.attendancePeriodRecords,
    payrollLineOverrides: state.payrollLineOverrides,
    voucherAmountOverrides: state.voucherAmountOverrides,
    updateEmployee,
    setEmployeeDepartmentAllocations,
    addEmployee,
    upsertAttendancePeriodRecord,
    importAttendancePeriodRecords,
    upsertPayrollLineOverride,
    importPayrollRegister,
    updateGeneratedPayslip,
    upsertVoucherAmountOverride,
    addEvaluation,
    updateEvaluationSection,
    setEvaluationStatus,
    addDisciplinaryRecord,
    setDisciplinaryStatus,
    addAnnouncement,
    announcementImageUrls: announcementImageUrlsFor,
    removeAnnouncement,
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
    canAttachLeaveFiles: !!supabaseSession,
    isRealAccount: !!supabaseSession,
    patchEmployeeLocal,
    dataLoadError: !!supabaseSession && dataLoadError,
    authPending: !sessionChecked || (!!supabaseSession && !currentUser && dataLoadedFor !== supabaseSession.user.id),
    recordLoginIssued,
    mustChangePassword: supabaseSession?.user.app_metadata?.must_change_password === true,
    uploadLeaveAttachment,
    leaveAttachmentUrl,
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
