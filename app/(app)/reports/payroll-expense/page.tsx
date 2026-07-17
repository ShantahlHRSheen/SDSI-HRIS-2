"use client";

import { useMemo, useState } from "react";
import { TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { useHris } from "@/lib/store";
import { PageHeader } from "@/components/PageHeader";
import { StatTile } from "@/components/StatTile";
import { Badge } from "@/components/Badge";
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
  historicalPayrollAnalytics,
  payrollExpenseTrendByMonth,
  summarizePayroll,
  toCsv,
  downloadCsv,
} from "@/lib/monthly-analytics";

export default function PayrollExpenseReportPage() {
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
  const summary = summarizePayroll(filtered);
  const trend = payrollExpenseTrendByMonth(facts, employees, trendFilters);
  const historical = historicalPayrollAnalytics(facts, employees, trendFilters);

  const currentMonthKey = months[months.length - 1].key;
  const previousMonthKey = months[months.length - 2]?.key;

  const byDepartment = groupByDepartment(filtered, employees, departments);

  const branchesThisMonth = groupByBranch(filterFacts(facts, employees, { ...analyticsFilters, monthKey: currentMonthKey }), employees, branches);
  const branchesPrevMonth = groupByBranch(filterFacts(facts, employees, { ...analyticsFilters, monthKey: previousMonthKey }), employees, branches);
  const byBranch = branchesThisMonth.map((row) => {
    const prev = branchesPrevMonth.find((p) => p.branchId === row.branchId);
    const prevTotal = prev?.payroll.totalEmployerExpense ?? 0;
    const pctChange = prevTotal ? Math.round(((row.payroll.totalEmployerExpense - prevTotal) / prevTotal) * 1000) / 10 : null;
    return { ...row, prevTotal, pctChange };
  });

  const byEmployeeAll = groupByEmployee(filtered, employees).sort((a, b) => b.payroll.totalEmployerExpense - a.payroll.totalEmployerExpense);
  const byEmployee = byEmployeeAll.filter((row) => row.label.toLowerCase().includes(employeeSearch.toLowerCase()));

  function exportDepartmentCsv() {
    const csv = toCsv(
      ["Department", "Employees", "Basic Salary", "Allowances", "Overtime", "Holiday Pay", "Leave Pay", "Employer SSS", "Employer HDMF", "Employer PhilHealth", "Total Employer Expense"],
      byDepartment.map((r) => [
        r.label, r.payroll.employeeCount, r.payroll.basicSalary, r.payroll.allowances, r.payroll.overtimePay,
        r.payroll.holidayPay, r.payroll.leavePay, r.payroll.employerSSS, r.payroll.employerHDMF, r.payroll.employerPhilHealth, r.payroll.totalEmployerExpense,
      ]),
    );
    downloadCsv("payroll-expense-by-department.csv", csv);
  }

  function exportBranchCsv() {
    const csv = toCsv(
      ["Branch", "Employees", "Total Payroll Expense (this month)", "Total Payroll Expense (previous month)", "% Change"],
      byBranch.map((r) => [r.label, r.payroll.employeeCount, r.payroll.totalEmployerExpense, r.prevTotal, r.pctChange ?? "—"]),
    );
    downloadCsv("payroll-expense-by-branch.csv", csv);
  }

  function exportEmployeeCsv() {
    const csv = toCsv(
      ["Employee", "Branch", "Department", "Basic Salary", "Allowances", "Overtime Pay", "Holiday Pay", "Leave Pay", "Employer SSS", "Employer HDMF", "Employer PhilHealth", "Total Employer Expense"],
      byEmployeeAll.map((r) => [
        r.label, r.employee.branchId, r.employee.departmentId, r.payroll.basicSalary, r.payroll.allowances, r.payroll.overtimePay,
        r.payroll.holidayPay, r.payroll.leavePay, r.payroll.employerSSS, r.payroll.employerHDMF, r.payroll.employerPhilHealth, r.payroll.totalEmployerExpense,
      ]),
    );
    downloadCsv("payroll-expense-by-employee.csv", csv);
  }

  return (
    <div>
      <PageHeader
        title="Monthly Payroll Expense Report"
        subtitle="Employer payroll expense = Basic Salary + Allowances + OT Pay + Holiday Pay + Leave Pay + Employer SSS + Employer HDMF + Employer PhilHealth."
        actions={<ExportBar onExportCsv={exportEmployeeCsv} label="Export all (CSV)" />}
      />

      <ReportFilters months={months} branches={branches} departments={departments} employees={employees} value={filters} onChange={setFilters} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Total employer expense" value={formatCurrencyCompact(summary.totalEmployerExpense)} />
        <StatTile label="Basic salary" value={formatCurrencyCompact(summary.basicSalary)} />
        <StatTile label="Allowances" value={formatCurrencyCompact(summary.allowances)} />
        <StatTile label="OT + Holiday + Leave pay" value={formatCurrencyCompact(summary.overtimePay + summary.holidayPay + summary.leavePay)} />
        <StatTile label="Employer SSS" value={formatCurrencyCompact(summary.employerSSS)} />
        <StatTile label="Employer HDMF" value={formatCurrencyCompact(summary.employerHDMF)} />
        <StatTile label="Employer PhilHealth" value={formatCurrencyCompact(summary.employerPhilHealth)} />
        <StatTile label="Employees covered" value={summary.employeeCount.toString()} />
      </div>

      <div className="mt-4 rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-1)] p-4">
        <div className="mb-3 text-sm font-medium text-[var(--text-primary)]">Payroll expense trend — last 12 months</div>
        <TrendChart data={trend} valueFormatter={(v) => formatCurrencyCompact(v)} />
      </div>

      {/* --- Historical Payroll Analytics (item 7) --- */}
      <div className="mt-4 rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-1)] p-4">
        <div className="mb-3 flex items-center gap-1.5 text-sm font-medium text-[var(--text-primary)]"><Wallet size={16} /> Historical payroll analytics</div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile label="Average per employee" value={formatCurrencyCompact(historical.averagePerEmployee)} hint="this month" />
          <StatTile label="Highest month" value={formatCurrencyCompact(historical.highestMonth.value)} hint={historical.highestMonth.label} />
          <StatTile label="Lowest month" value={formatCurrencyCompact(historical.lowestMonth.value)} hint={historical.lowestMonth.label} />
          <StatTile
            label="Growth rate (6mo)"
            value={`${historical.growthRatePct > 0 ? "+" : ""}${historical.growthRatePct}%`}
            deltaTone={historical.growthRatePct > 0 ? "bad" : historical.growthRatePct < 0 ? "good" : "neutral"}
          />
        </div>
      </div>

      {/* --- 6A: Payroll expense per department --- */}
      <div className="mt-4 rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-1)] p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-sm font-medium text-[var(--text-primary)]">Payroll expense per department</div>
          <ExportBar onExportCsv={exportDepartmentCsv} label="Export" />
        </div>
        {byDepartment.length === 0 ? (
          <EmptyState icon={Wallet} title="No data" description="Adjust your filters." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="border-b border-[var(--border-hairline)] text-left text-xs text-[var(--text-muted)]">
                  <th className="px-3 py-2 font-medium">Department</th>
                  <th className="px-3 py-2 font-medium"># Employees</th>
                  <th className="px-3 py-2 font-medium">Basic Salary</th>
                  <th className="px-3 py-2 font-medium">Allowances</th>
                  <th className="px-3 py-2 font-medium">Overtime</th>
                  <th className="px-3 py-2 font-medium">Holiday Pay</th>
                  <th className="px-3 py-2 font-medium">Leave Pay</th>
                  <th className="px-3 py-2 font-medium">Employer SSS</th>
                  <th className="px-3 py-2 font-medium">Employer HDMF</th>
                  <th className="px-3 py-2 font-medium">Employer PhilHealth</th>
                  <th className="px-3 py-2 font-medium">Total Expense</th>
                </tr>
              </thead>
              <tbody>
                {byDepartment.map((r) => (
                  <tr key={r.departmentId} className="border-b border-[var(--gridline)] last:border-0">
                    <td className="px-3 py-2 font-medium text-[var(--text-primary)]">{r.label}</td>
                    <td className="tabular px-3 py-2 text-[var(--text-secondary)]">{r.payroll.employeeCount}</td>
                    <td className="tabular px-3 py-2 text-[var(--text-secondary)]">{formatCurrencyCompact(r.payroll.basicSalary)}</td>
                    <td className="tabular px-3 py-2 text-[var(--text-secondary)]">{formatCurrencyCompact(r.payroll.allowances)}</td>
                    <td className="tabular px-3 py-2 text-[var(--text-secondary)]">{formatCurrencyCompact(r.payroll.overtimePay)}</td>
                    <td className="tabular px-3 py-2 text-[var(--text-secondary)]">{formatCurrencyCompact(r.payroll.holidayPay)}</td>
                    <td className="tabular px-3 py-2 text-[var(--text-secondary)]">{formatCurrencyCompact(r.payroll.leavePay)}</td>
                    <td className="tabular px-3 py-2 text-[var(--text-secondary)]">{formatCurrencyCompact(r.payroll.employerSSS)}</td>
                    <td className="tabular px-3 py-2 text-[var(--text-secondary)]">{formatCurrencyCompact(r.payroll.employerHDMF)}</td>
                    <td className="tabular px-3 py-2 text-[var(--text-secondary)]">{formatCurrencyCompact(r.payroll.employerPhilHealth)}</td>
                    <td className="tabular px-3 py-2 font-medium text-[var(--text-primary)]">{formatCurrencyCompact(r.payroll.totalEmployerExpense)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* --- 6B: Payroll expense per branch --- */}
      <div className="mt-4 rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-1)] p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-sm font-medium text-[var(--text-primary)]">Payroll expense per branch — {months[months.length - 1].label} vs {months[months.length - 2]?.label ?? "—"}</div>
          <ExportBar onExportCsv={exportBranchCsv} label="Export" />
        </div>
        {byBranch.length === 0 ? (
          <EmptyState icon={Wallet} title="No data" description="Adjust your filters." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] text-sm">
              <thead>
                <tr className="border-b border-[var(--border-hairline)] text-left text-xs text-[var(--text-muted)]">
                  <th className="px-3 py-2 font-medium">Branch</th>
                  <th className="px-3 py-2 font-medium"># Employees</th>
                  <th className="px-3 py-2 font-medium">This Month</th>
                  <th className="px-3 py-2 font-medium">Previous Month</th>
                  <th className="px-3 py-2 font-medium">Change</th>
                </tr>
              </thead>
              <tbody>
                {byBranch.map((r) => (
                  <tr key={r.branchId} className="border-b border-[var(--gridline)] last:border-0">
                    <td className="px-3 py-2 font-medium text-[var(--text-primary)]">{r.label}</td>
                    <td className="tabular px-3 py-2 text-[var(--text-secondary)]">{r.payroll.employeeCount}</td>
                    <td className="tabular px-3 py-2 text-[var(--text-secondary)]">{formatCurrencyCompact(r.payroll.totalEmployerExpense)}</td>
                    <td className="tabular px-3 py-2 text-[var(--text-secondary)]">{formatCurrencyCompact(r.prevTotal)}</td>
                    <td className="px-3 py-2">
                      {r.pctChange === null ? (
                        <Badge tone="muted">—</Badge>
                      ) : r.pctChange > 0 ? (
                        <Badge tone="warning"><TrendingUp size={12} /> +{r.pctChange}%</Badge>
                      ) : r.pctChange < 0 ? (
                        <Badge tone="good"><TrendingDown size={12} /> {r.pctChange}%</Badge>
                      ) : (
                        <Badge tone="muted">0%</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* --- 6C: Payroll expense per employee --- */}
      <div className="mt-4 rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-1)] p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="text-sm font-medium text-[var(--text-primary)]">Payroll expense per employee</div>
          <div className="flex items-center gap-2">
            <input
              value={employeeSearch}
              onChange={(e) => setEmployeeSearch(e.target.value)}
              placeholder="Search employee…"
              className="w-48 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-1.5 text-xs"
            />
            <ExportBar onExportCsv={exportEmployeeCsv} label="Export" />
          </div>
        </div>
        {byEmployee.length === 0 ? (
          <EmptyState icon={Wallet} title="No matching employees" description="Adjust your filters or search." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="border-b border-[var(--border-hairline)] text-left text-xs text-[var(--text-muted)]">
                  <th className="px-3 py-2 font-medium">Employee</th>
                  <th className="px-3 py-2 font-medium">Basic Salary</th>
                  <th className="px-3 py-2 font-medium">Allowances</th>
                  <th className="px-3 py-2 font-medium">OT Pay</th>
                  <th className="px-3 py-2 font-medium">Holiday Pay</th>
                  <th className="px-3 py-2 font-medium">Leave Pay</th>
                  <th className="px-3 py-2 font-medium">SSS</th>
                  <th className="px-3 py-2 font-medium">HDMF</th>
                  <th className="px-3 py-2 font-medium">PhilHealth</th>
                  <th className="px-3 py-2 font-medium">Total Expense</th>
                </tr>
              </thead>
              <tbody>
                {byEmployee.map((row) => (
                  <tr key={row.employee.id} className="border-b border-[var(--gridline)] last:border-0">
                    <td className="px-3 py-2 text-[var(--text-primary)]">{row.label}</td>
                    <td className="tabular px-3 py-2 text-[var(--text-secondary)]">{formatCurrencyCompact(row.payroll.basicSalary)}</td>
                    <td className="tabular px-3 py-2 text-[var(--text-secondary)]">{formatCurrencyCompact(row.payroll.allowances)}</td>
                    <td className="tabular px-3 py-2 text-[var(--text-secondary)]">{formatCurrencyCompact(row.payroll.overtimePay)}</td>
                    <td className="tabular px-3 py-2 text-[var(--text-secondary)]">{formatCurrencyCompact(row.payroll.holidayPay)}</td>
                    <td className="tabular px-3 py-2 text-[var(--text-secondary)]">{formatCurrencyCompact(row.payroll.leavePay)}</td>
                    <td className="tabular px-3 py-2 text-[var(--text-secondary)]">{formatCurrencyCompact(row.payroll.employerSSS)}</td>
                    <td className="tabular px-3 py-2 text-[var(--text-secondary)]">{formatCurrencyCompact(row.payroll.employerHDMF)}</td>
                    <td className="tabular px-3 py-2 text-[var(--text-secondary)]">{formatCurrencyCompact(row.payroll.employerPhilHealth)}</td>
                    <td className="tabular px-3 py-2 font-medium text-[var(--text-primary)]">{formatCurrencyCompact(row.payroll.totalEmployerExpense)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="mt-4 text-xs text-[var(--text-muted)]">
        Illustrative figures computed from mock employee compensation records — real SSS / HDMF (Pag-IBIG) / PhilHealth
        contribution brackets change periodically and should be configured as versioned rate tables in System
        Administration before this is relied on for actual payroll.
      </div>
    </div>
  );
}
