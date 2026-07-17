"use client";

import { useMemo, useState } from "react";
import { CalendarCheck } from "lucide-react";
import { useHris } from "@/lib/store";
import { PageHeader } from "@/components/PageHeader";
import { StatTile } from "@/components/StatTile";
import { TrendChart } from "@/components/charts/TrendChart";
import { ReportFilters, EMPTY_REPORT_FILTERS, type ReportFilterState } from "@/components/reports/ReportFilters";
import { ExportBar } from "@/components/reports/ExportBar";
import { EmptyState } from "@/components/EmptyState";
import {
  attendanceTrendByMonth,
  filterFacts,
  getMonthlyFacts,
  getMonthsList,
  groupByBranch,
  groupByDepartment,
  groupByEmployee,
  summarizeAttendance,
  toCsv,
  downloadCsv,
} from "@/lib/monthly-analytics";
import { scopeEmployeesForViewer } from "@/lib/helpers";

export default function AttendanceReportPage() {
  const { employees: allEmployees, branches, departments, currentUser, currentEmployee } = useHris();
  const employees = useMemo(
    () => scopeEmployeesForViewer(allEmployees, currentUser?.roles ?? [], currentEmployee),
    [allEmployees, currentUser, currentEmployee],
  );
  const [filters, setFilters] = useState<ReportFilterState>(EMPTY_REPORT_FILTERS);
  const [employeeSearch, setEmployeeSearch] = useState("");

  const months = getMonthsList();
  const facts = useMemo(() => getMonthlyFacts(employees), [employees]);

  const analyticsFilters = {
    monthKey: filters.monthKey || undefined,
    year: filters.year ? Number(filters.year) : undefined,
    branchId: filters.branchId || undefined,
    departmentId: filters.departmentId || undefined,
    employeeId: filters.employeeId || undefined,
  };
  const trendFilters = { ...analyticsFilters, monthKey: undefined };

  const filtered = filterFacts(facts, employees, analyticsFilters);
  const summary = summarizeAttendance(filtered);
  const trend = attendanceTrendByMonth(facts, employees, trendFilters);

  const byBranch = groupByBranch(filtered, employees, branches);
  const byDepartment = groupByDepartment(filtered, employees, departments);
  const byEmployeeAll = groupByEmployee(filtered, employees);
  const byEmployee = byEmployeeAll.filter((row) => row.label.toLowerCase().includes(employeeSearch.toLowerCase()));

  function exportCsv() {
    const csv = toCsv(
      ["Employee", "Branch", "Department", "Present Days", "Late Days", "Absent Days", "Leave Days", "Attendance Rate %"],
      byEmployeeAll.map((row) => [
        row.label,
        row.employee.branchId,
        row.employee.departmentId,
        row.attendance.totalPresent,
        row.attendance.totalLate,
        row.attendance.totalAbsent,
        row.attendance.totalLeave,
        row.attendance.attendanceRate,
      ]),
    );
    downloadCsv("attendance-report.csv", csv);
  }

  return (
    <div>
      <PageHeader
        title="Monthly Attendance Report"
        subtitle="Attendance summary across the last 12 months, filterable by month, year, branch, department, and employee."
        actions={<ExportBar onExportCsv={exportCsv} />}
      />

      <ReportFilters months={months} branches={branches} departments={departments} employees={employees} value={filters} onChange={setFilters} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <StatTile label="Total present" value={summary.totalPresent.toLocaleString()} />
        <StatTile label="Total late" value={summary.totalLate.toLocaleString()} />
        <StatTile label="Total absent" value={summary.totalAbsent.toLocaleString()} />
        <StatTile label="Total on leave" value={summary.totalLeave.toLocaleString()} />
        <StatTile label="Attendance rate" value={`${summary.attendanceRate}%`} />
      </div>

      <div className="mt-4 rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-1)] p-4">
        <div className="mb-3 text-sm font-medium text-[var(--text-primary)]">Monthly attendance trend</div>
        <TrendChart data={trend} valueFormatter={(v) => `${v}%`} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <BreakdownTable
          title="Attendance by branch"
          rows={byBranch.map((r) => ({
            label: r.label,
            present: r.attendance.totalPresent,
            late: r.attendance.totalLate,
            absent: r.attendance.totalAbsent,
            leave: r.attendance.totalLeave,
            rate: r.attendance.attendanceRate,
          }))}
        />
        <BreakdownTable
          title="Attendance by department"
          rows={byDepartment.map((r) => ({
            label: r.label,
            present: r.attendance.totalPresent,
            late: r.attendance.totalLate,
            absent: r.attendance.totalAbsent,
            leave: r.attendance.totalLeave,
            rate: r.attendance.attendanceRate,
          }))}
        />
      </div>

      <div className="mt-4 rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-1)] p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="text-sm font-medium text-[var(--text-primary)]">Attendance by employee</div>
          <input
            value={employeeSearch}
            onChange={(e) => setEmployeeSearch(e.target.value)}
            placeholder="Search employee…"
            className="w-48 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-1.5 text-xs"
          />
        </div>
        {byEmployee.length === 0 ? (
          <EmptyState icon={CalendarCheck} title="No matching employees" description="Adjust your filters or search." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-[var(--border-hairline)] text-left text-xs text-[var(--text-muted)]">
                  <th className="px-3 py-2 font-medium">Employee</th>
                  <th className="px-3 py-2 font-medium">Present</th>
                  <th className="px-3 py-2 font-medium">Late</th>
                  <th className="px-3 py-2 font-medium">Absent</th>
                  <th className="px-3 py-2 font-medium">Leave</th>
                  <th className="px-3 py-2 font-medium">Rate</th>
                </tr>
              </thead>
              <tbody>
                {byEmployee.map((row) => (
                  <tr key={row.employee.id} className="border-b border-[var(--gridline)] last:border-0">
                    <td className="px-3 py-2 text-[var(--text-primary)]">{row.label}</td>
                    <td className="tabular px-3 py-2 text-[var(--text-secondary)]">{row.attendance.totalPresent}</td>
                    <td className="tabular px-3 py-2 text-[var(--text-secondary)]">{row.attendance.totalLate}</td>
                    <td className="tabular px-3 py-2 text-[var(--text-secondary)]">{row.attendance.totalAbsent}</td>
                    <td className="tabular px-3 py-2 text-[var(--text-secondary)]">{row.attendance.totalLeave}</td>
                    <td className="tabular px-3 py-2 text-[var(--text-secondary)]">{row.attendance.attendanceRate}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function BreakdownTable({
  title,
  rows,
}: {
  title: string;
  rows: { label: string; present: number; late: number; absent: number; leave: number; rate: number }[];
}) {
  return (
    <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-1)] p-4">
      <div className="mb-3 text-sm font-medium text-[var(--text-primary)]">{title}</div>
      {rows.length === 0 ? (
        <div className="py-4 text-center text-xs text-[var(--text-muted)]">No data for the current filters.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] text-sm">
            <thead>
              <tr className="border-b border-[var(--border-hairline)] text-left text-xs text-[var(--text-muted)]">
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">Present</th>
                <th className="px-3 py-2 font-medium">Late</th>
                <th className="px-3 py-2 font-medium">Absent</th>
                <th className="px-3 py-2 font-medium">Leave</th>
                <th className="px-3 py-2 font-medium">Rate</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.label} className="border-b border-[var(--gridline)] last:border-0">
                  <td className="px-3 py-2 text-[var(--text-primary)]">{r.label}</td>
                  <td className="tabular px-3 py-2 text-[var(--text-secondary)]">{r.present}</td>
                  <td className="tabular px-3 py-2 text-[var(--text-secondary)]">{r.late}</td>
                  <td className="tabular px-3 py-2 text-[var(--text-secondary)]">{r.absent}</td>
                  <td className="tabular px-3 py-2 text-[var(--text-secondary)]">{r.leave}</td>
                  <td className="tabular px-3 py-2 text-[var(--text-secondary)]">{r.rate}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
