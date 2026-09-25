"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import { useHris } from "./store";
import type { PayrollPeriod } from "./types";

// The payroll period selected on the Payroll, Payslips, Allowance Vouchers
// and Attendance pages — one shared choice, remembered in this browser so it
// survives a refresh. With nothing chosen yet, it's the latest period that
// actually has payroll data, not simply the last period on the list (which
// is usually still empty).

const KEY = "hris.payrollPeriodId";
const EVENT = "hris-payroll-period";
let memory: string | null = null; // used when localStorage is unavailable

function read(): string | null {
  try {
    return window.localStorage.getItem(KEY) ?? memory;
  } catch {
    return memory;
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(EVENT, onChange);
  };
}

export function useSelectedPayrollPeriod(): { period: PayrollPeriod | undefined; periodId: string; setPeriodId: (id: string) => void } {
  const { payrollPeriods, attendancePeriodRecords, payrollLineOverrides, generatedPayslips } = useHris();
  const stored = useSyncExternalStore(subscribe, read, () => null);

  const period = useMemo(() => {
    const sorted = [...payrollPeriods].sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
    const chosen = stored ? sorted.find((p) => p.id === stored) : undefined;
    if (chosen) return chosen;
    const withData = new Set([...attendancePeriodRecords, ...payrollLineOverrides, ...generatedPayslips].map((r) => r.periodId));
    return [...sorted].reverse().find((p) => withData.has(p.id)) ?? sorted[sorted.length - 1];
  }, [stored, payrollPeriods, attendancePeriodRecords, payrollLineOverrides, generatedPayslips]);

  const setPeriodId = useCallback((id: string) => {
    memory = id;
    try {
      window.localStorage.setItem(KEY, id);
    } catch {
      // private mode etc. — the in-memory value still works for this visit
    }
    window.dispatchEvent(new Event(EVENT));
  }, []);

  return { period, periodId: period?.id ?? "", setPeriodId };
}
