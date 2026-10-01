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
import { departmentName, formatCurrencyCompact } from "@/lib/helpers";
import {
  FULL_ATTENDANCE_DAYS_PER_MONTH,
  fullAttendanceFacts,
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
import { divisionOf, filterFactsWithShares, groupByDivision, reportAllocations } from "@/lib/payroll-divisions";
import { useDepartmentVouchers } from "@/lib/use-department-vouchers";
import { filterVoucherAmounts, sumBy, voucherAmounts } from "@/lib/voucher-totals";

export default function PayrollExpenseReportPage() {
  const {
    employees,
    employeeDepartmentAllocations,
    branches,
    departments,
    positions,
    attendancePeriodRecords,
    overtimeRequests,
    payrollLineOverrides,
    payrollPeriods,
    salaryAdjustments,
  } = useHris();
  const [filters, setFilters] = useState<ReportFilterState>(EMPTY_REPORT_FILTERS);
  const [employeeSearch, setEmployeeSearch] = useState("");
  const { vouchers, lines: voucherLines } = useDepartmentVouchers();
  const allVoucherAmounts = useMemo(
    () => voucherAmounts(vouchers, voucherLines, payrollPeriods, employeeDepartmentAllocations),
    [vouchers, voucherLines, payrollPeriods, employeeDepartmentAllocations],
  );

  const months = getMonthsList();
  const facts = useMemo(
    () => getMonthlyFacts(employees, attendancePeriodRecords, overtimeRequests, payrollLineOverrides, payrollPeriods, salaryAdjustments),
    [employees, attendancePeriodRecords, overtimeRequests, payrollLineOverrides, payrollPeriods, salaryAdjustments],
  );

  const analyticsFilters = {
    monthKey: filters.monthKey || undefined,
    year: filters.year ? Number(filters.year) : undefined,
    branchId: filters.branchId || undefined,
    departmentId: filters.departmentId || undefined,
    employeeId: filters.employeeId || undefined,
  };
  // Department shares for this report: explicit splits plus the Board
  // members counted under Business Units (see lib/payroll-divisions.ts).
  const allocations = useMemo(
    () => reportAllocations(employees, employeeDepartmentAllocations, departments, positions),
    [employees, employeeDepartmentAllocations, departments, positions],
  );
  // e.g. "Dra. Cecil Catapang — 50% MLM, 50% Darofy", from the saved department splits.
  const splitNotes = useMemo(() => {
    const byEmployee = new Map<string, typeof employeeDepartmentAllocations>();
    for (const a of employeeDepartmentAllocations) byEmployee.set(a.employeeId, [...(byEmployee.get(a.employeeId) ?? []), a]);
    return [...byEmployee.entries()]
      .filter(([, rows]) => rows.length > 1)
      .map(([id, rows]) => {
        const e = employees.find((x) => x.id === id);
        const who = e ? `${e.firstName} ${e.lastName}` : id;
        const parts = [...rows]
          .sort((a, b) => b.percent - a.percent || departmentName(a.departmentId).localeCompare(departmentName(b.departmentId)))
          .map((r) => `${Math.round(r.percent * 100) / 100}% ${departmentName(r.departmentId).replace(/\s+Department$/i, "")}`);
        return `${who} — ${parts.join(", ")}`;
      });
  }, [employees, employeeDepartmentAllocations]);
  // Facts limited to the selected department's share (if any); later
  // filters below don't need the department again.
  const deptFacts = filterFactsWithShares(facts, employees, { departmentId: analyticsFilters.departmentId }, allocations);
  const trendFilters = { ...analyticsFilters, monthKey: undefined, departmentId: undefined };

  const filtered = filterFactsWithShares(facts, employees, analyticsFilters, allocations);
  const summary = summarizePayroll(filtered);
  // Department vouchers (Vouchers page) count as payroll expense too.
  const voucherTotal = filterVoucherAmounts(allVoucherAmounts, analyticsFilters).reduce((t, a) => t + a.amount, 0);
  const trendVouchers = sumBy(filterVoucherAmounts(allVoucherAmounts, { ...trendFilters, departmentId: analyticsFilters.departmentId }), (a) => a.monthKey);
  const trend = payrollExpenseTrendByMonth(deptFacts, employees, trendFilters).map((m) => ({ ...m, value: m.value + (trendVouchers.get(m.monthKey) ?? 0) }));
  const historical = historicalPayrollAnalytics(deptFacts, employees, trendFilters, trendVouchers);

  const currentMonthKey = months[months.length - 1].key;
  const previousMonthKey = months[months.length - 2]?.key;

  const payrollByDepartment = groupByDepartment(
    filterFactsWithShares(facts, employees, { ...analyticsFilters, departmentId: undefined }, allocations),
    employees,
    departments,
    allocations,
  ).filter((r) => !analyticsFilters.departmentId || r.departmentId === analyticsFilters.departmentId);
  const vouchersByDept = sumBy(filterVoucherAmounts(allVoucherAmounts, analyticsFilters), (a) => a.departmentId);
  const byDepartment = [
    ...payrollByDepartment,
    // Departments with vouchers but no payroll lines in the selection.
    ...departments
      .filter((d) => vouchersByDept.has(d.id) && !payrollByDepartment.some((r) => r.departmentId === d.id))
      .map((d) => ({ departmentId: d.id, label: d.name, payroll: summarizePayroll([]) })),
  ].map((r) => {
    const vouchers = vouchersByDept.get(r.departmentId) ?? 0;
    return { ...r, payroll: { ...r.payroll, vouchers, totalWithVouchers: r.payroll.totalEmployerExpense + vouchers } };
  });
  const byDivision = groupByDivision(byDepartment, departments);
  const divisionTotal = (key: string) => byDivision.find((d) => d.division === key)?.payroll.totalWithVouchers ?? 0;

  const branchesThisMonth = groupByBranch(filterFactsWithShares(facts, employees, { ...analyticsFilters, monthKey: currentMonthKey }, allocations), employees, branches);
  const branchesPrevMonth = groupByBranch(filterFactsWithShares(facts, employees, { ...analyticsFilters, monthKey: previousMonthKey }, allocations), employees, branches);
  const byBranch = branchesThisMonth.map((row) => {
    const prev = branchesPrevMonth.find((p) => p.branchId === row.branchId);
    const prevTotal = prev?.payroll.totalEmployerExpense ?? 0;
    const pctChange = prevTotal ? Math.round(((row.payroll.totalEmployerExpense - prevTotal) / prevTotal) * 1000) / 10 : null;
    return { ...row, prevTotal, pctChange };
  });

  // Full attendance: every active employee working 26 days a month with no
  // absences, leaves, lates, OT or holidays. Today's headcount and rates, so
  // the month / year filters don't apply.
  const fullFacts = useMemo(
    () => fullAttendanceFacts(employees, payrollLineOverrides, payrollPeriods, attendancePeriodRecords),
    [employees, payrollLineOverrides, payrollPeriods, attendancePeriodRecords],
  );
  const fullFilters = { ...analyticsFilters, monthKey: undefined, year: undefined };
  const fullSummary = summarizePayroll(filterFactsWithShares(fullFacts, employees, fullFilters, allocations));
  const fullByDepartment = groupByDepartment(
    filterFactsWithShares(fullFacts, employees, { ...fullFilters, departmentId: undefined }, allocations),
    employees,
    departments,
    allocations,
  ).filter((r) => !analyticsFilters.departmentId || r.departmentId === analyticsFilters.departmentId);
  const fullByDivision = groupByDivision(fullByDepartment, departments);
  const fullByEmployee = groupByEmployee(filterFactsWithShares(fullFacts, employees, fullFilters, allocations), employees).sort(
    (a, b) => b.payroll.totalEmployerExpense - a.payroll.totalEmployerExpense,
  );
  const fullContributions = fullSummary.employerSSS + fullSummary.employerHDMF + fullSummary.employerPhilHealth;
  // The latest month with payroll on file, to compare against.
  const latestActual = [...trend].reverse().find((m) => m.value > 0);

  function exportFullAttendanceCsv() {
    const csv = toCsv(
      ["Employee", "Branch", "Department", "Basic Salary", "Allowances", "Employer SSS", "Employer HDMF", "Employer PhilHealth", "Monthly Payroll Expense"],
      fullByEmployee.map((r) => [
        r.label,
        r.employee.branchId,
        r.employee.departmentId,
        r.payroll.basicSalary,
        r.payroll.allowances,
        r.payroll.employerSSS,
        r.payroll.employerHDMF,
        r.payroll.employerPhilHealth,
        r.payroll.totalEmployerExpense,
      ]),
    );
    downloadCsv("payroll-expense-full-attendance.csv", csv);
  }

  const byEmployeeAll = groupByEmployee(filtered, employees).sort((a, b) => b.payroll.totalEmployerExpense - a.payroll.totalEmployerExpense);
  const byEmployee = byEmployeeAll.filter((row) => row.label.toLowerCase().includes(employeeSearch.toLowerCase()));

  function exportDepartmentCsv() {
    const csv = toCsv(
      [
        "Department",
        "Employees",
        "Basic Salary",
        "Allowances",
        "Overtime",
        "Holiday Pay",
        "Leave Pay",
        "Employer SSS",
        "Employer HDMF",
        "Employer PhilHealth",
        "Payroll Expense",
        "Vouchers",
        "Total Expense",
      ],
      byDepartment.map((r) => [
        r.label,
        r.payroll.employeeCount,
        r.payroll.basicSalary,
        r.payroll.allowances,
        r.payroll.overtimePay,
        r.payroll.holidayPay,
        r.payroll.leavePay,
        r.payroll.employerSSS,
        r.payroll.employerHDMF,
        r.payroll.employerPhilHealth,
        r.payroll.totalEmployerExpense,
        r.payroll.vouchers,
        r.payroll.totalWithVouchers,
      ]),
    );
    downloadCsv("payroll-expense-by-department.csv", csv);
  }

  function exportDivisionCsv() {
    const csv = toCsv(
      [
        "Division",
        "Employees",
        "Basic Salary",
        "Allowances",
        "Overtime",
        "Holiday Pay",
        "Leave Pay",
        "Employer SSS",
        "Employer HDMF",
        "Employer PhilHealth",
        "Payroll Expense",
        "Vouchers",
        "Total Expense",
      ],
      byDivision.map((r) => [
        r.label,
        r.payroll.employeeCount,
        r.payroll.basicSalary,
        r.payroll.allowances,
        r.payroll.overtimePay,
        r.payroll.holidayPay,
        r.payroll.leavePay,
        r.payroll.employerSSS,
        r.payroll.employerHDMF,
        r.payroll.employerPhilHealth,
        r.payroll.totalEmployerExpense,
        r.payroll.vouchers,
        r.payroll.totalWithVouchers,
      ]),
    );
    downloadCsv("payroll-expense-by-division.csv", csv);
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
      [
        "Employee",
        "Branch",
        "Department",
        "Basic Salary",
        "Allowances",
        "Overtime Pay",
        "Holiday Pay",
        "Leave Pay",
        "Employer SSS",
        "Employer HDMF",
        "Employer PhilHealth",
        "Total Employer Expense",
      ],
      byEmployeeAll.map((r) => [
        r.label,
        r.employee.branchId,
        r.employee.departmentId,
        r.payroll.basicSalary,
        r.payroll.allowances,
        r.payroll.overtimePay,
        r.payroll.holidayPay,
        r.payroll.leavePay,
        r.payroll.employerSSS,
        r.payroll.employerHDMF,
        r.payroll.employerPhilHealth,
        r.payroll.totalEmployerExpense,
      ]),
    );
    downloadCsv("payroll-expense-by-employee.csv", csv);
  }

  return (
    <div>
      <PageHeader
        title="Monthly Payroll Expense Report"
        subtitle="Employer payroll expense = Basic Salary + Allowances + OT Pay + Holiday Pay + Leave Pay + Employer SSS + Employer HDMF + Employer PhilHealth. Total expense also adds the department vouchers."
        actions={<ExportBar onExportCsv={exportEmployeeCsv} label="Export all (CSV)" />}
      />

      <ReportFilters months={months} branches={branches} departments={departments} employees={employees} value={filters} onChange={setFilters} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Total expense" value={formatCurrencyCompact(summary.totalEmployerExpense + voucherTotal)} hint="payroll + vouchers" />
        <StatTile label="Basic salary" value={formatCurrencyCompact(summary.basicSalary)} />
        <StatTile label="Allowances" value={formatCurrencyCompact(summary.allowances)} />
        <StatTile label="OT + Holiday + Leave pay" value={formatCurrencyCompact(summary.overtimePay + summary.holidayPay + summary.leavePay)} />
        <StatTile label="Employer SSS" value={formatCurrencyCompact(summary.employerSSS)} />
        <StatTile label="Employer HDMF" value={formatCurrencyCompact(summary.employerHDMF)} />
        <StatTile label="Employer PhilHealth" value={formatCurrencyCompact(summary.employerPhilHealth)} />
        <StatTile label="Employees covered" value={summary.employeeCount.toString()} />
        <StatTile label="Payroll expense" value={formatCurrencyCompact(summary.totalEmployerExpense)} hint="employer payroll cost" />
        <StatTile label="Vouchers" value={formatCurrencyCompact(voucherTotal)} hint={analyticsFilters.branchId ? "not tracked by branch" : "department vouchers"} />
        <StatTile label="Business Units" value={formatCurrencyCompact(divisionTotal("business_units"))} hint="MLM · Cosmetics · Darofy · Board" />
        <StatTile label="Shared Services" value={formatCurrencyCompact(divisionTotal("shared_services"))} hint="Ops · HR · Finance · Accounting · Board staff" />
      </div>

      <div className="mt-4 rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-1)] p-4">
        <div className="mb-3 text-sm font-medium text-[var(--text-primary)]">Payroll expense trend (incl. vouchers) — last 12 months</div>
        <TrendChart data={trend} valueFormatter={(v) => formatCurrencyCompact(v)} />
      </div>

      {/* --- Historical Payroll Analytics (item 7) --- */}
      <div className="mt-4 rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-1)] p-4">
        <div className="mb-3 flex items-center gap-1.5 text-sm font-medium text-[var(--text-primary)]">
          <Wallet size={16} /> Historical payroll analytics
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile label="Average per employee" value={formatCurrencyCompact(historical.averagePerEmployee)} hint="this month · payroll only" />
          <StatTile label="Highest month" value={formatCurrencyCompact(historical.highestMonth.value)} hint={`${historical.highestMonth.label} · incl. vouchers`} />
          <StatTile label="Lowest month" value={formatCurrencyCompact(historical.lowestMonth.value)} hint={`${historical.lowestMonth.label} · incl. vouchers`} />
          <StatTile
            label="Growth rate (6mo)"
            value={`${historical.growthRatePct > 0 ? "+" : ""}${historical.growthRatePct}%`}
            deltaTone={historical.growthRatePct > 0 ? "bad" : historical.growthRatePct < 0 ? "good" : "neutral"}
          />
        </div>
      </div>

      {/* --- Full-attendance payroll expense --- */}
      <div className="mt-4 rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-1)] p-4">
        <div className="mb-1 flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 text-sm font-medium text-[var(--text-primary)]">
            <Wallet size={16} /> Full-attendance payroll expense — {FULL_ATTENDANCE_DAYS_PER_MONTH} working days a month
          </div>
          <ExportBar onExportCsv={exportFullAttendanceCsv} label="Export" />
        </div>
        <div className="mb-3 text-xs text-[var(--text-muted)]">
          The monthly payroll cost if every active employee worked all {FULL_ATTENDANCE_DAYS_PER_MONTH} days, with no absences, leaves, lates, overtime or holiday pay. Uses
          today&rsquo;s employees, rates, fixed allowances and employer SSS / HDMF / PhilHealth shares; vouchers aren&rsquo;t included. The branch, department and employee
          filters apply; the month and year filters don&rsquo;t.
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile label="Monthly payroll expense" value={formatCurrencyCompact(fullSummary.totalEmployerExpense)} hint="full attendance" />
          <StatTile label="Basic salary" value={formatCurrencyCompact(fullSummary.basicSalary)} />
          <StatTile label="Allowances" value={formatCurrencyCompact(fullSummary.allowances)} />
          <StatTile label="Employer SSS + HDMF + PhilHealth" value={formatCurrencyCompact(fullContributions)} />
          <StatTile label="Employees" value={fullSummary.employeeCount.toString()} />
          <StatTile label="Per year (× 12)" value={formatCurrencyCompact(fullSummary.totalEmployerExpense * 12)} hint="excl. 13th month" />
          {latestActual && (
            <StatTile
              label={`Actual payroll, ${latestActual.label}`}
              value={formatCurrencyCompact(latestActual.value - (trendVouchers.get(latestActual.monthKey) ?? 0))}
              hint={`${fullSummary.totalEmployerExpense >= latestActual.value - (trendVouchers.get(latestActual.monthKey) ?? 0) ? "below" : "above"} full attendance`}
            />
          )}
        </div>

        {fullByDivision.length > 0 && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-[var(--border-hairline)] text-left text-xs text-[var(--text-muted)]">
                  <th className="px-3 py-2 font-medium">Division / Department</th>
                  <th className="px-3 py-2 font-medium"># Employees</th>
                  <th className="px-3 py-2 font-medium">Basic Salary</th>
                  <th className="px-3 py-2 font-medium">Allowances</th>
                  <th className="px-3 py-2 font-medium">Employer SSS</th>
                  <th className="px-3 py-2 font-medium">Employer HDMF</th>
                  <th className="px-3 py-2 font-medium">Employer PhilHealth</th>
                  <th className="px-3 py-2 font-medium">Monthly Expense</th>
                </tr>
              </thead>
              <tbody>
                {fullByDivision.map((d) => (
                  <FullAttendanceRows key={d.division} label={d.label} payroll={d.payroll} rows={fullByDepartment.filter((r) => divisionOf(r.departmentId, departments) === d.division)} />
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-[var(--border-hairline)] font-medium text-[var(--text-primary)]">
                  <td className="px-3 py-2">Total</td>
                  <td className="tabular px-3 py-2">{Math.round(fullByDivision.reduce((t, r) => t + r.payroll.employeeCount, 0) * 100) / 100}</td>
                  <td className="tabular px-3 py-2">{formatCurrencyCompact(fullByDivision.reduce((t, r) => t + r.payroll.basicSalary, 0))}</td>
                  <td className="tabular px-3 py-2">{formatCurrencyCompact(fullByDivision.reduce((t, r) => t + r.payroll.allowances, 0))}</td>
                  <td className="tabular px-3 py-2">{formatCurrencyCompact(fullByDivision.reduce((t, r) => t + r.payroll.employerSSS, 0))}</td>
                  <td className="tabular px-3 py-2">{formatCurrencyCompact(fullByDivision.reduce((t, r) => t + r.payroll.employerHDMF, 0))}</td>
                  <td className="tabular px-3 py-2">{formatCurrencyCompact(fullByDivision.reduce((t, r) => t + r.payroll.employerPhilHealth, 0))}</td>
                  <td className="tabular px-3 py-2">{formatCurrencyCompact(fullByDivision.reduce((t, r) => t + r.payroll.totalEmployerExpense, 0))}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {fullByEmployee.length > 0 && (
          <details className="mt-3">
            <summary className="cursor-pointer text-xs font-medium text-[var(--text-secondary)]">Per employee ({fullByEmployee.length})</summary>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="border-b border-[var(--border-hairline)] text-left text-xs text-[var(--text-muted)]">
                    <th className="px-3 py-2 font-medium">Employee</th>
                    <th className="px-3 py-2 font-medium">Basic Salary</th>
                    <th className="px-3 py-2 font-medium">Allowances</th>
                    <th className="px-3 py-2 font-medium">SSS</th>
                    <th className="px-3 py-2 font-medium">HDMF</th>
                    <th className="px-3 py-2 font-medium">PhilHealth</th>
                    <th className="px-3 py-2 font-medium">Monthly Expense</th>
                  </tr>
                </thead>
                <tbody>
                  {fullByEmployee.map((row) => (
                    <tr key={row.employee.id} className="border-b border-[var(--gridline)] last:border-0">
                      <td className="px-3 py-2 text-[var(--text-primary)]">{row.label}</td>
                      <td className="tabular px-3 py-2 text-[var(--text-secondary)]">{formatCurrencyCompact(row.payroll.basicSalary)}</td>
                      <td className="tabular px-3 py-2 text-[var(--text-secondary)]">{formatCurrencyCompact(row.payroll.allowances)}</td>
                      <td className="tabular px-3 py-2 text-[var(--text-secondary)]">{formatCurrencyCompact(row.payroll.employerSSS)}</td>
                      <td className="tabular px-3 py-2 text-[var(--text-secondary)]">{formatCurrencyCompact(row.payroll.employerHDMF)}</td>
                      <td className="tabular px-3 py-2 text-[var(--text-secondary)]">{formatCurrencyCompact(row.payroll.employerPhilHealth)}</td>
                      <td className="tabular px-3 py-2 font-medium text-[var(--text-primary)]">{formatCurrencyCompact(row.payroll.totalEmployerExpense)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        )}
      </div>

      {/* --- Business Units vs Shared Services --- */}
      <div className="mt-4 rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-1)] p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-sm font-medium text-[var(--text-primary)]">Payroll expense by division</div>
          <ExportBar onExportCsv={exportDivisionCsv} label="Export" />
        </div>
        {byDivision.length === 0 ? (
          <EmptyState icon={Wallet} title="No data" description="Adjust your filters." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-sm">
              <thead>
                <tr className="border-b border-[var(--border-hairline)] text-left text-xs text-[var(--text-muted)]">
                  <th className="px-3 py-2 font-medium">Division</th>
                  <th className="px-3 py-2 font-medium"># Employees</th>
                  <th className="px-3 py-2 font-medium">Basic Salary</th>
                  <th className="px-3 py-2 font-medium">Allowances</th>
                  <th className="px-3 py-2 font-medium">Overtime</th>
                  <th className="px-3 py-2 font-medium">Holiday Pay</th>
                  <th className="px-3 py-2 font-medium">Leave Pay</th>
                  <th className="px-3 py-2 font-medium">Employer SSS</th>
                  <th className="px-3 py-2 font-medium">Employer HDMF</th>
                  <th className="px-3 py-2 font-medium">Employer PhilHealth</th>
                  <th className="px-3 py-2 font-medium">Payroll Expense</th>
                  <th className="px-3 py-2 font-medium">Vouchers</th>
                  <th className="px-3 py-2 font-medium">Total Expense</th>
                </tr>
              </thead>
              <tbody>
                {byDivision.map((r) => (
                  <tr key={r.division} className="border-b border-[var(--gridline)] last:border-0">
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
                    <td className="tabular px-3 py-2 text-[var(--text-secondary)]">{formatCurrencyCompact(r.payroll.totalEmployerExpense)}</td>
                    <td className="tabular px-3 py-2 text-[var(--text-secondary)]">{formatCurrencyCompact(r.payroll.vouchers)}</td>
                    <td className="tabular px-3 py-2 font-medium text-[var(--text-primary)]">{formatCurrencyCompact(r.payroll.totalWithVouchers)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-[var(--border-hairline)] font-medium text-[var(--text-primary)]">
                  <td className="px-3 py-2">Total</td>
                  <td className="tabular px-3 py-2">{Math.round(byDivision.reduce((t, r) => t + r.payroll.employeeCount, 0) * 100) / 100}</td>
                  <td className="tabular px-3 py-2">{formatCurrencyCompact(byDivision.reduce((t, r) => t + r.payroll.basicSalary, 0))}</td>
                  <td className="tabular px-3 py-2">{formatCurrencyCompact(byDivision.reduce((t, r) => t + r.payroll.allowances, 0))}</td>
                  <td className="tabular px-3 py-2">{formatCurrencyCompact(byDivision.reduce((t, r) => t + r.payroll.overtimePay, 0))}</td>
                  <td className="tabular px-3 py-2">{formatCurrencyCompact(byDivision.reduce((t, r) => t + r.payroll.holidayPay, 0))}</td>
                  <td className="tabular px-3 py-2">{formatCurrencyCompact(byDivision.reduce((t, r) => t + r.payroll.leavePay, 0))}</td>
                  <td className="tabular px-3 py-2">{formatCurrencyCompact(byDivision.reduce((t, r) => t + r.payroll.employerSSS, 0))}</td>
                  <td className="tabular px-3 py-2">{formatCurrencyCompact(byDivision.reduce((t, r) => t + r.payroll.employerHDMF, 0))}</td>
                  <td className="tabular px-3 py-2">{formatCurrencyCompact(byDivision.reduce((t, r) => t + r.payroll.employerPhilHealth, 0))}</td>
                  <td className="tabular px-3 py-2">{formatCurrencyCompact(byDivision.reduce((t, r) => t + r.payroll.totalEmployerExpense, 0))}</td>
                  <td className="tabular px-3 py-2">{formatCurrencyCompact(byDivision.reduce((t, r) => t + r.payroll.vouchers, 0))}</td>
                  <td className="tabular px-3 py-2">{formatCurrencyCompact(byDivision.reduce((t, r) => t + r.payroll.totalWithVouchers, 0))}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
        <div className="mt-2 text-xs text-[var(--text-muted)]">
          Business Units: MLM, Cosmetics and Darofy departments. Each business unit President&rsquo;s salary is counted in their own business unit.
          {splitNotes.length > 0 && <> Shared between departments: {splitNotes.join("; ")}.</>} Shared Services: Operations, Human Resources, Finance, Accounting and the rest of
          the Board department (Vice Chairperson, Chemist).
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
            <table className="w-full min-w-[980px] text-sm">
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
                  <th className="px-3 py-2 font-medium">Payroll Expense</th>
                  <th className="px-3 py-2 font-medium">Vouchers</th>
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
                    <td className="tabular px-3 py-2 text-[var(--text-secondary)]">{formatCurrencyCompact(r.payroll.totalEmployerExpense)}</td>
                    <td className="tabular px-3 py-2 text-[var(--text-secondary)]">{formatCurrencyCompact(r.payroll.vouchers)}</td>
                    <td className="tabular px-3 py-2 font-medium text-[var(--text-primary)]">{formatCurrencyCompact(r.payroll.totalWithVouchers)}</td>
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
          <div className="text-sm font-medium text-[var(--text-primary)]">
            Payroll expense per branch — {months[months.length - 1].label} vs {months[months.length - 2]?.label ?? "—"}
          </div>
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
                        <Badge tone="warning">
                          <TrendingUp size={12} /> +{r.pctChange}%
                        </Badge>
                      ) : r.pctChange < 0 ? (
                        <Badge tone="good">
                          <TrendingDown size={12} /> {r.pctChange}%
                        </Badge>
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
        Department vouchers count in the month their payroll period starts. They aren&rsquo;t tied to a branch, so they&rsquo;re left out when a branch is selected and don&rsquo;t
        appear in the branch and per-employee tables; with an employee selected, only voucher lines linked to that employee count. Figures are computed from real attendance and
        payroll records — SSS / HDMF (Pag-IBIG) / PhilHealth contribution brackets change periodically and should be configured as versioned rate tables in System Administration to
        keep this current.
      </div>
    </div>
  );
}

type FullPayroll = { employeeCount: number; basicSalary: number; allowances: number; employerSSS: number; employerHDMF: number; employerPhilHealth: number; totalEmployerExpense: number };

function FullAttendanceRows({ label, payroll, rows }: { label: string; payroll: FullPayroll; rows: { departmentId: string; label: string; payroll: FullPayroll }[] }) {
  const cells = (p: FullPayroll) => (
    <>
      <td className="tabular px-3 py-2">{Math.round(p.employeeCount * 100) / 100}</td>
      <td className="tabular px-3 py-2">{formatCurrencyCompact(p.basicSalary)}</td>
      <td className="tabular px-3 py-2">{formatCurrencyCompact(p.allowances)}</td>
      <td className="tabular px-3 py-2">{formatCurrencyCompact(p.employerSSS)}</td>
      <td className="tabular px-3 py-2">{formatCurrencyCompact(p.employerHDMF)}</td>
      <td className="tabular px-3 py-2">{formatCurrencyCompact(p.employerPhilHealth)}</td>
      <td className="tabular px-3 py-2 font-medium">{formatCurrencyCompact(p.totalEmployerExpense)}</td>
    </>
  );
  return (
    <>
      <tr className="border-b border-[var(--gridline)] bg-[var(--gridline)]/20 font-medium text-[var(--text-primary)]">
        <td className="px-3 py-2">{label}</td>
        {cells(payroll)}
      </tr>
      {rows.map((r) => (
        <tr key={r.departmentId} className="border-b border-[var(--gridline)] text-[var(--text-secondary)] last:border-0">
          <td className="py-2 pl-7 pr-3">{r.label}</td>
          {cells(r.payroll)}
        </tr>
      ))}
    </>
  );
}
