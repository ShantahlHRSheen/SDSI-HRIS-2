"use client";

import { useMemo, useState } from "react";
import { CalendarClock } from "lucide-react";
import { useHris } from "@/lib/store";
import { PageHeader } from "@/components/PageHeader";
import { StatTile } from "@/components/StatTile";
import { Badge, type BadgeTone } from "@/components/Badge";
import { EmptyState } from "@/components/EmptyState";
import { fullName, positionTitle, branchName } from "@/lib/helpers";
import { getMonthlyFacts, getMonthsList, CURRENT_MONTH_KEY } from "@/lib/monthly-analytics";
import { buildDailyRecords } from "@/lib/attendance";
import type { DailyAttendanceStatus } from "@/lib/types";

const STATUS_TONE: Record<DailyAttendanceStatus, BadgeTone> = {
  present: "good",
  late: "warning",
  absent: "critical",
  leave: "info",
};

const STATUS_LABEL: Record<DailyAttendanceStatus, string> = {
  present: "Present",
  late: "Late",
  absent: "Absent",
  leave: "On leave",
};

export default function AttendancePage() {
  const { employees, currentUser, currentEmployee } = useHris();
  const months = getMonthsList();
  const facts = useMemo(() => getMonthlyFacts(employees), [employees]);

  const isCompanyWide = currentUser?.roles.some((r) => ["hr_admin", "upper_management", "sys_admin"].includes(r));
  const visibleEmployees = useMemo(() => {
    if (!currentEmployee) return [];
    if (isCompanyWide) return employees.filter((e) => e.status === "active" || e.status === "on_leave");
    const directReports = employees.filter((e) => e.supervisorId === currentEmployee.id);
    return [currentEmployee, ...directReports];
  }, [employees, currentEmployee, isCompanyWide]);

  const [employeeId, setEmployeeId] = useState(currentEmployee?.id ?? "");
  const [monthKey, setMonthKey] = useState(CURRENT_MONTH_KEY);

  const effectiveEmployeeId = employeeId || currentEmployee?.id || "";
  const employee = employees.find((e) => e.id === effectiveEmployeeId);
  const fact = facts.find((f) => f.employeeId === effectiveEmployeeId && f.monthKey === monthKey);
  const dailyRecords = useMemo(() => (employee && fact ? buildDailyRecords(employee, fact) : []), [employee, fact]);

  return (
    <div>
      <PageHeader
        title="Attendance"
        subtitle="Daily Time Record — derived from the same monthly attendance totals shown on the dashboard and reports."
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {visibleEmployees.length > 1 && (
          <select
            value={effectiveEmployeeId}
            onChange={(e) => setEmployeeId(e.target.value)}
            className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-2 text-sm"
          >
            {visibleEmployees.map((e) => (
              <option key={e.id} value={e.id}>{fullName(e)}{e.id === currentEmployee?.id ? " (Me)" : ""}</option>
            ))}
          </select>
        )}
        <select value={monthKey} onChange={(e) => setMonthKey(e.target.value)} className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-2 text-sm">
          {months.map((m) => (
            <option key={m.key} value={m.key}>{m.label}</option>
          ))}
        </select>
      </div>

      {employee && (
        <div className="mb-4 text-sm text-[var(--text-secondary)]">
          {fullName(employee)} · {positionTitle(employee.positionId)} · {branchName(employee.branchId)}
        </div>
      )}

      {fact ? (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
            <StatTile label="Present" value={fact.presentDays.toString()} />
            <StatTile label="Late" value={fact.lateDays.toString()} />
            <StatTile label="Absent" value={fact.absentDays.toString()} />
            <StatTile label="On leave" value={fact.leaveDays.toString()} />
            <StatTile label="OT hours" value={fact.otHours.toString()} />
          </div>

          <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-1)] p-4">
            <div className="mb-3 text-sm font-medium text-[var(--text-primary)]">Daily Time Record — {months.find((m) => m.key === monthKey)?.label}</div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b border-[var(--border-hairline)] text-left text-xs text-[var(--text-muted)]">
                    <th className="px-3 py-2 font-medium">Date</th>
                    <th className="px-3 py-2 font-medium">Day</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium">Time in</th>
                    <th className="px-3 py-2 font-medium">Time out</th>
                    <th className="px-3 py-2 font-medium">Late (min)</th>
                    <th className="px-3 py-2 font-medium">OT (hrs)</th>
                  </tr>
                </thead>
                <tbody>
                  {dailyRecords.map((r) => (
                    <tr key={r.date} className="border-b border-[var(--gridline)] last:border-0">
                      <td className="tabular px-3 py-2 text-[var(--text-primary)]">{r.date}</td>
                      <td className="px-3 py-2 text-[var(--text-secondary)]">{r.dayLabel}</td>
                      <td className="px-3 py-2"><Badge tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Badge></td>
                      <td className="tabular px-3 py-2 text-[var(--text-secondary)]">{r.timeIn ?? "—"}</td>
                      <td className="tabular px-3 py-2 text-[var(--text-secondary)]">{r.timeOut ?? "—"}</td>
                      <td className="tabular px-3 py-2 text-[var(--text-secondary)]">{r.lateMinutes || "—"}</td>
                      <td className="tabular px-3 py-2 text-[var(--text-secondary)]">{r.otHours || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        <EmptyState icon={CalendarClock} title="No attendance data" description="Select an employee and month to view the Daily Time Record." />
      )}
    </div>
  );
}
