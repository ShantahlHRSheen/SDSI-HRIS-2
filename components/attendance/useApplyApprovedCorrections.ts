"use client";

import { useEffect, useRef } from "react";
import { useHris } from "@/lib/store";
import { attendanceChanged, biometricsAttendance, previousPeriod, withPrior, type AttendanceRow } from "@/lib/biometrics/corrections";

// Keeps biometrics-imported attendance in step with approved attendance
// corrections — and settles the previous cut-off's pending days (when the
// import didn't): whenever HR / payroll has a page open that uses attendance,
// each open cut-off's biometrics records are recomputed with the approved
// corrections applied, and any that changed are saved. Locked / closed
// cut-offs are never touched. Runs again whenever corrections or records
// change; recomputing is idempotent, so it settles after one save.
export function useApplyApprovedCorrections() {
  const { currentUser, employees, payrollPeriods, attendancePeriodRecords, correctionRequests, holidays, leaveRequests, importAttendancePeriodRecords } = useHris();
  const canWrite = !!currentUser?.roles.some((r) => r === "hr_admin" || r === "payroll_officer");
  const busy = useRef(false);

  useEffect(() => {
    if (!canWrite || busy.current) return;
    const byId = new Map(employees.map((e) => [e.id, e]));
    const updates = new Map<string, AttendanceRow[]>();
    for (const period of payrollPeriods) {
      if (period.status !== "open") continue;
      const prev = previousPeriod(period, payrollPeriods);
      for (const rec of attendancePeriodRecords) {
        if (rec.periodId !== period.id || !rec.biometricDetail) continue;
        const employee = byId.get(rec.employeeId);
        if (!employee) continue;
        const prevRecord = prev ? attendancePeriodRecords.find((r) => r.periodId === prev.id && r.employeeId === rec.employeeId) : undefined;
        const detail = withPrior(rec.biometricDetail, prev, prevRecord);
        const next = biometricsAttendance({ employee, period, detail, corrections: correctionRequests, holidays, leaves: leaveRequests, notes: rec.notes });
        if (attendanceChanged(rec, next)) updates.set(period.id, [...(updates.get(period.id) ?? []), next]);
      }
    }
    if (!updates.size) return;
    busy.current = true;
    (async () => {
      try {
        for (const [periodId, rows] of updates) await importAttendancePeriodRecords(periodId, rows);
      } finally {
        busy.current = false;
      }
    })();
  }, [canWrite, employees, payrollPeriods, attendancePeriodRecords, correctionRequests, holidays, leaveRequests, importAttendancePeriodRecords]);
}
