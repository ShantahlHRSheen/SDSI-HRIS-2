"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  ANNOUNCEMENTS,
  AUDIT_LOGS,
  BRANCHES,
  DEMO_USERS,
  DEPARTMENTS,
  DISCIPLINARY_RECORDS,
  EMPLOYEES,
  HOLIDAYS,
  LEAVE_TYPES,
  PAYROLL_PERIODS,
  PERFORMANCE_EVALUATIONS,
  POSITIONS,
  TODAY,
  WORK_SCHEDULES,
} from "./mock-data";
import type {
  Announcement,
  AuditLog,
  Branch,
  Department,
  DemoUser,
  DisciplinaryRecord,
  Employee,
  GeneratedBirForm,
  Holiday,
  LeaveType,
  PayrollPeriod,
  PerformanceEvaluation,
  Position,
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

  addEvaluation: (input: Omit<PerformanceEvaluation, "id" | "createdAt">) => void;
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
}

const HrisContext = createContext<HrisContextShape | null>(null);

export function HrisProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<PersistedState>(defaultState);
  const [demoUsers, setDemoUsers] = useState<DemoUser[]>(DEMO_USERS);
  const [ready, setReady] = useState(false);

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

  const logAudit = useCallback(
    (module: string, action: string, description: string, previousValue: string | null = null, newValue: string | null = null) => {
      setState((prev) => {
        const actor = demoUsers.find((u) => u.id === prev.currentUserId);
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
    [demoUsers],
  );

  const login = useCallback((userId: string) => {
    setState((prev) => ({ ...prev, currentUserId: userId }));
  }, []);

  const logout = useCallback(() => {
    setState((prev) => ({ ...prev, currentUserId: null }));
  }, []);

  const currentUser = useMemo(() => demoUsers.find((u) => u.id === state.currentUserId) ?? null, [demoUsers, state.currentUserId]);
  const currentEmployee = useMemo(
    () => (currentUser ? state.employees.find((e) => e.id === currentUser.employeeId) ?? null : null),
    [currentUser, state.employees],
  );

  const addEvaluation: HrisContextShape["addEvaluation"] = useCallback(
    (input) => {
      const entry: PerformanceEvaluation = { ...input, id: nextId("ev"), createdAt: TODAY };
      setState((prev) => ({ ...prev, evaluations: [entry, ...prev.evaluations] }));
      logAudit("Performance Evaluation", "create", `Created evaluation for period ${input.period}`);
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
        const actor = demoUsers.find((u) => u.id === prev.currentUserId);
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
    [logAudit, demoUsers],
  );

  const value: HrisContextShape = {
    ready,
    currentUser,
    currentEmployee,
    login,
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
    addEvaluation,
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
  };

  return <HrisContext.Provider value={value}>{children}</HrisContext.Provider>;
}

export function useHris(): HrisContextShape {
  const ctx = useContext(HrisContext);
  if (!ctx) throw new Error("useHris must be used within HrisProvider");
  return ctx;
}
