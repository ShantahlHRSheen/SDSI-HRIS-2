"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { fullName } from "./helpers";
import { getInitialSession, signInWithPassword as supabaseSignInWithPassword, signOutSupabase, watchAuthState } from "./supabase/auth";
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
      setState((prev) => {
        const actor = currentUser;
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
    [currentUser],
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
    (id, patch) => {
      setState((prev) => ({
        ...prev,
        employees: prev.employees.map((e) => (e.id === id ? { ...e, ...patch } : e)),
      }));
      logAudit("Employee 201 File", "update", `Updated employee record ${id}`);
    },
    [logAudit],
  );

  const addEmployee: HrisContextShape["addEmployee"] = useCallback(
    (input) => {
      setState((prev) => {
        const seq = prev.employees.length + 1;
        const entry: Employee = { ...input, id: nextId("emp"), employeeNumber: `SDSI-${String(seq).padStart(4, "0")}` };
        return { ...prev, employees: [...prev.employees, entry] };
      });
      logAudit("Employee 201 File", "create", `Added new employee: ${input.firstName} ${input.lastName}`);
    },
    [logAudit],
  );

  const upsertAttendancePeriodRecord: HrisContextShape["upsertAttendancePeriodRecord"] = useCallback(
    (input) => {
      setState((prev) => {
        const actor = currentUser;
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
    [logAudit, currentUser],
  );

  const importAttendancePeriodRecords: HrisContextShape["importAttendancePeriodRecords"] = useCallback(
    (periodId, rows) => {
      setState((prev) => {
        const actor = currentUser;
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
    [logAudit, currentUser],
  );

  const upsertPayrollLineOverride: HrisContextShape["upsertPayrollLineOverride"] = useCallback(
    (input) => {
      setState((prev) => {
        const actor = currentUser;
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
    [logAudit, currentUser],
  );

  const upsertVoucherAmountOverride: HrisContextShape["upsertVoucherAmountOverride"] = useCallback(
    (input) => {
      setState((prev) => {
        const actor = currentUser;
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
    [logAudit, currentUser],
  );

  const addEvaluation: HrisContextShape["addEvaluation"] = useCallback(
    (input) => {
      const entry: PerformanceEvaluation = { ...input, id: nextId("ev"), createdAt: TODAY };
      setState((prev) => ({ ...prev, evaluations: [entry, ...prev.evaluations] }));
      logAudit("Performance Evaluation", "create", `Created evaluation for period ${input.period}`);
    },
    [logAudit],
  );

  // Saves just one category's ratings/remarks onto an existing evaluation —
  // HR saves Behavior, the employee's designated Job Performance evaluator
  // saves Job Performance, independently of each other. Stamps whichever
  // section-evaluator field matches `category`, leaving the other section
  // (and its evaluator stamp) untouched.
  const updateEvaluationSection: HrisContextShape["updateEvaluationSection"] = useCallback(
    (id, category, sectionCriteria, evaluatorEmployeeId, comments) => {
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
    [logAudit],
  );

  const setEvaluationStatus: HrisContextShape["setEvaluationStatus"] = useCallback(
    (id, status) => {
      setState((prev) => ({
        ...prev,
        evaluations: prev.evaluations.map((e) => (e.id === id ? { ...e, status } : e)),
      }));
      logAudit("Performance Evaluation", "update", `Evaluation status changed`, null, status);
    },
    [logAudit],
  );

  const addDisciplinaryRecord: HrisContextShape["addDisciplinaryRecord"] = useCallback(
    (input) => {
      const entry: DisciplinaryRecord = { ...input, id: nextId("disc") };
      setState((prev) => ({ ...prev, disciplinaryRecords: [entry, ...prev.disciplinaryRecords] }));
      logAudit("Discipline", "create", `Issued ${input.type.replace("_", " ")}`);
    },
    [logAudit],
  );

  const setDisciplinaryStatus: HrisContextShape["setDisciplinaryStatus"] = useCallback(
    (id, status) => {
      setState((prev) => ({
        ...prev,
        disciplinaryRecords: prev.disciplinaryRecords.map((d) => (d.id === id ? { ...d, status } : d)),
      }));
      logAudit("Discipline", "update", `Record marked ${status}`);
    },
    [logAudit],
  );

  const addAnnouncement: HrisContextShape["addAnnouncement"] = useCallback(
    (input) => {
      const entry: Announcement = { ...input, id: nextId("an"), postedAt: TODAY };
      setState((prev) => ({ ...prev, announcements: [entry, ...prev.announcements] }));
      logAudit("Bulletin Board", "create", `Posted announcement: ${input.title}`);
    },
    [logAudit],
  );

  function makeCrud<T extends { id: string }>(
    key: keyof PersistedState,
    moduleLabel: string,
    idPrefix: string,
  ) {
    const add = (input: Omit<T, "id">) => {
      const entry = { ...input, id: nextId(idPrefix) } as unknown as T;
      setState((prev) => ({ ...prev, [key]: [...(prev[key] as unknown as T[]), entry] }));
      logAudit(moduleLabel, "create", `Added new ${moduleLabel.toLowerCase()} record`);
    };
    const update = (id: string, patch: Partial<Omit<T, "id">>) => {
      setState((prev) => ({
        ...prev,
        [key]: (prev[key] as unknown as T[]).map((item) => (item.id === id ? { ...item, ...patch } : item)),
      }));
      logAudit(moduleLabel, "update", `Updated ${moduleLabel.toLowerCase()} record`);
    };
    const remove = (id: string) => {
      setState((prev) => ({
        ...prev,
        [key]: (prev[key] as unknown as T[]).filter((item) => item.id !== id),
      }));
      logAudit(moduleLabel, "delete", `Removed ${moduleLabel.toLowerCase()} record`);
    };
    return { add, update, remove };
  }

  const branchCrud = makeCrud<Branch>("branches", "Branch Config", "br");
  const deptCrud = makeCrud<Department>("departments", "Department Config", "dp");
  const positionCrud = makeCrud<Position>("positions", "Position Config", "ps");
  const scheduleCrud = makeCrud<WorkSchedule>("workSchedules", "Work Schedule Config", "ws");
  const holidayCrud = makeCrud<Holiday>("holidays", "Holiday Config", "hd");
  const leaveTypeCrud = makeCrud<LeaveType>("leaveTypes", "Leave Type Config", "lt");

  const setPayrollPeriodStatus: HrisContextShape["setPayrollPeriodStatus"] = useCallback(
    (id, status) => {
      setState((prev) => ({
        ...prev,
        payrollPeriods: prev.payrollPeriods.map((p) => (p.id === id ? { ...p, status } : p)),
      }));
      logAudit("Payroll", "update", `Payroll period status set to ${status}`);
    },
    [logAudit],
  );

  const addPayrollPeriod: HrisContextShape["addPayrollPeriod"] = useCallback(
    (input) => {
      const entry: PayrollPeriod = { ...input, id: nextId("pp") };
      setState((prev) => ({ ...prev, payrollPeriods: [...prev.payrollPeriods, entry] }));
      logAudit("Payroll", "create", `Created payroll period ${input.start} to ${input.end}`);
    },
    [logAudit],
  );

  const updateUserRoles: HrisContextShape["updateUserRoles"] = useCallback(
    (userId, roles) => {
      setDemoUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, roles } : u)));
      logAudit("System Administration", "update", `Updated role assignment for user ${userId}`);
    },
    [logAudit],
  );

  const addGeneratedBirForm: HrisContextShape["addGeneratedBirForm"] = useCallback(
    (input) => {
      setState((prev) => {
        const actor = currentUser;
        const entry: GeneratedBirForm = {
          ...input,
          id: nextId("bir"),
          generatedAt: TODAY,
          generatedBy: actor?.name ?? "System",
        };
        return { ...prev, generatedBirForms: [entry, ...prev.generatedBirForms] };
      });
      const label = input.formType === "1601c" ? "BIR Form 1601-C" : "BIR Form 2316";
      logAudit("BIR", "generate", `Generated ${label} for ${input.period}`);
    },
    [logAudit, currentUser],
  );

  const fileLeaveRequest: HrisContextShape["fileLeaveRequest"] = useCallback(
    (input) => {
      const entry: LeaveRequest = { ...input, id: nextId("lv"), status: "pending", filedAt: TODAY, decidedBy: null, decidedAt: null, decisionNote: null };
      setState((prev) => ({ ...prev, leaveRequests: [entry, ...prev.leaveRequests] }));
      logAudit("Leave Management", "file", `Filed leave request (${input.days} day(s))`);
    },
    [logAudit],
  );

  const decideLeaveRequest: HrisContextShape["decideLeaveRequest"] = useCallback(
    (id, decision, note) => {
      setState((prev) => {
        const actor = currentUser;
        return {
          ...prev,
          leaveRequests: prev.leaveRequests.map((r) =>
            r.id === id ? { ...r, status: decision, decidedBy: actor?.employeeId ?? null, decidedAt: TODAY, decisionNote: note ?? null } : r,
          ),
        };
      });
      logAudit("Leave Management", "decide", `Leave request ${decision}`);
    },
    [logAudit, currentUser],
  );

  const fileOvertimeRequest: HrisContextShape["fileOvertimeRequest"] = useCallback(
    (input) => {
      const entry: OvertimeRequest = { ...input, id: nextId("ot"), status: "pending", filedAt: TODAY, decidedBy: null, decidedAt: null, decisionNote: null };
      setState((prev) => ({ ...prev, overtimeRequests: [entry, ...prev.overtimeRequests] }));
      logAudit("Overtime", "file", `Filed overtime request (${input.hours}h on ${input.date})`);
    },
    [logAudit],
  );

  const decideOvertimeRequest: HrisContextShape["decideOvertimeRequest"] = useCallback(
    (id, decision, note) => {
      setState((prev) => {
        const actor = currentUser;
        return {
          ...prev,
          overtimeRequests: prev.overtimeRequests.map((r) =>
            r.id === id ? { ...r, status: decision, decidedBy: actor?.employeeId ?? null, decidedAt: TODAY, decisionNote: note ?? null } : r,
          ),
        };
      });
      logAudit("Overtime", "decide", `Overtime request ${decision}`);
    },
    [logAudit, currentUser],
  );

  const fileCorrectionRequest: HrisContextShape["fileCorrectionRequest"] = useCallback(
    (input) => {
      const entry: AttendanceCorrectionRequest = { ...input, id: nextId("ac"), status: "pending", filedAt: TODAY, decidedBy: null, decidedAt: null, decisionNote: null };
      setState((prev) => ({ ...prev, correctionRequests: [entry, ...prev.correctionRequests] }));
      logAudit("Attendance Corrections", "file", `Filed attendance correction for ${input.date}`);
    },
    [logAudit],
  );

  const decideCorrectionRequest: HrisContextShape["decideCorrectionRequest"] = useCallback(
    (id, decision, note) => {
      setState((prev) => {
        const actor = currentUser;
        return {
          ...prev,
          correctionRequests: prev.correctionRequests.map((r) =>
            r.id === id ? { ...r, status: decision, decidedBy: actor?.employeeId ?? null, decidedAt: TODAY, decisionNote: note ?? null } : r,
          ),
        };
      });
      logAudit("Attendance Corrections", "decide", `Correction request ${decision}`);
    },
    [logAudit, currentUser],
  );

  const addGeneratedPayslip: HrisContextShape["addGeneratedPayslip"] = useCallback(
    (input) => {
      setState((prev) => {
        const actor = currentUser;
        const entry: GeneratedPayslip = { ...input, id: nextId("ps"), generatedAt: TODAY, generatedBy: actor?.name ?? "System" };
        return { ...prev, generatedPayslips: [entry, ...prev.generatedPayslips] };
      });
      logAudit("Payslips", "generate", `Generated payslip for period ${input.periodId}`);
    },
    [logAudit, currentUser],
  );

  const addGeneratedVoucher: HrisContextShape["addGeneratedVoucher"] = useCallback(
    (input) => {
      setState((prev) => {
        const actor = currentUser;
        const entry: GeneratedVoucher = { ...input, id: nextId("vo"), generatedAt: TODAY, generatedBy: actor?.name ?? "System" };
        return { ...prev, generatedVouchers: [entry, ...prev.generatedVouchers] };
      });
      logAudit("Allowance Vouchers", "generate", `Generated voucher for period ${input.periodId}`);
    },
    [logAudit, currentUser],
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
