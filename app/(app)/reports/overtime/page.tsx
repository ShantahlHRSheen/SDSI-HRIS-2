"use client";

import { useMemo, useState } from "react";
import { Clock3 } from "lucide-react";
import { useHris } from "@/lib/store";
import { PageHeader } from "@/components/PageHeader";
import { StatTile } from "@/components/StatTile";
import { TrendChart } from "@/components/charts/TrendChart";
import { ReportFilters, EMPTY_REPORT_FILTERS, type ReportFilterState } from "@/components/reports/ReportFilters";
import { ExportBar } from "@/components/reports/ExportBar";
import { EmptyState } from "@/components/EmptyState";
import { formatCurrencyCompact } from "@/lib/helpers";
import {
  filterFacts,
  getMonthlyFacts,
  getMonthsList,
  groupByBranch,
  groupByDepartment,
  groupByEmployee,
  overtimeTrendByMonth,
  summarizeOvertime,
  toCsv,
  downloadCsv,
} from "@/lib/monthly-analytics";

export default function OvertimeReportPage() {
  const { employees, branches, departments } = useHris();
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
  const summary = summarizeOvertime(filtered);
  const trend = overtimeTrendByMonth(facts, employees, trendFilters);

  const byBranch = groupByBranch(filtered, employees, branches);
  const byDepartment = groupByDepartment(filtered, employees, departments);
  const byEmployeeAll = groupByEmployee(filtered, employees).sort((a, b) => b.overtime.totalOtHours - a.overtime.totalOtHours);
  const byEmployee = byEmployeeAll.filter((row) => row.label.toLowerCase().includes(employeeSearch.toLowerCase()));

  function exportCsv() {
    const csv = toCsv(
      ["Employee", "OT Hours", "OT Pay"],
      byEmployeeAll.map((row) => [row.label, row.overtime.totalOtHours, row.overtime.totalOtPay]),
    );
    downloadCsv("overtime-report.csv", csv);
  }

  return (
    <div>
      <PageHeader
        title="Monthly Overtime Report"
        subtitle="OT hours and pay across the last 12 months, filterable by month, year, branch, department, and employee."
        actions={<ExportBar onExportCsv={exportCsv} />}
      />

      <ReportFilters months={months} branches={branches} departments={departments} employees={employees} value={filters} onChange={setFilters} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatTile label="Total OT hours" value={summary.totalOtHours.toLocaleString()} />
        <StatTile label="Total OT pay" value={formatCurrencyCompact(summary.totalOtPay)} />
        <StatTile label="Avg OT pay / hour" value={summary.totalOtHours ? formatCurrencyCompact(Math.round(summary.totalOtPay / summary.totalOtHours)) : "—"} />
      </div>

      <div className="mt-4 rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-1)] p-4">
        <div className="mb-3 text-sm font-medium text-[var(--text-primary)]">Monthly OT hours trend</div>
        <TrendChart data={trend} color="var(--series-2)" valueFormatter={(v) => `${v} hrs`} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-1)] p-4">
          <div className="mb-3 text-sm font-medium text-[var(--text-primary)]">OT hours by branch</div>
          {byBranch.length === 0 ? (
            <div className="py-4 text-center text-xs text-[var(--text-muted)]">No data for the current filters.</div>
          ) : (
            <div className="flex flex-col divide-y divide-[var(--gridline)]">
              {byBranch
                .sort((a, b) => b.overtime.totalOtHours - a.overtime.totalOtHours)
                .map((r) => (
                  <div key={r.branchId} className="flex items-center justify-between py-2 text-sm">
                    <span className="text-[var(--text-primary)]">{r.label}</span>
                    <span className="tabular text-[var(--text-secondary)]">{r.overtime.totalOtHours} hrs · {formatCurrencyCompact(r.overtime.totalOtPay)}</span>
                  </div>
                ))}
            </div>
          )}
        </div>
        <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-1)] p-4">
          <div className="mb-3 text-sm font-medium text-[var(--text-primary)]">OT hours by department</div>
          {byDepartment.length === 0 ? (
            <div className="py-4 text-center text-xs text-[var(--text-muted)]">No data for the current filters.</div>
          ) : (
            <div className="flex flex-col divide-y divide-[var(--gridline)]">
              {byDepartment
                .sort((a, b) => b.overtime.totalOtHours - a.overtime.totalOtHours)
                .map((r) => (
                  <div key={r.departmentId} className="flex items-center justify-between py-2 text-sm">
                    <span className="text-[var(--text-primary)]">{r.label}</span>
                    <span className="tabular text-[var(--text-secondary)]">{r.overtime.totalOtHours} hrs · {formatCurrencyCompact(r.overtime.totalOtPay)}</span>
                  </div>
                ))}
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-1)] p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="text-sm font-medium text-[var(--text-primary)]">OT hours by employee</div>
          <input
            value={employeeSearch}
            onChange={(e) => setEmployeeSearch(e.target.value)}
            placeholder="Search employee…"
            className="w-48 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-1.5 text-xs"
          />
        </div>
        {byEmployee.length === 0 ? (
          <EmptyState icon={Clock3} title="No matching employees" description="Adjust your filters or search." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm">
              <thead>
                <tr className="border-b border-[var(--border-hairline)] text-left text-xs text-[var(--text-muted)]">
                  <th className="px-3 py-2 font-medium">Employee</th>
                  <th className="px-3 py-2 font-medium">OT hours</th>
                  <th className="px-3 py-2 font-medium">OT pay</th>
                </tr>
              </thead>
              <tbody>
                {byEmployee.map((row) => (
                  <tr key={row.employee.id} className="border-b border-[var(--gridline)] last:border-0">
                    <td className="px-3 py-2 text-[var(--text-primary)]">{row.label}</td>
                    <td className="tabular px-3 py-2 text-[var(--text-secondary)]">{row.overtime.totalOtHours}</td>
                    <td className="tabular px-3 py-2 text-[var(--text-secondary)]">{formatCurrencyCompact(row.overtime.totalOtPay)}</td>
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
