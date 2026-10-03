"use client";

import { useMemo, useState } from "react";
import { TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { useHris } from "@/lib/store";
import { PageHeader } from "@/components/PageHeader";
import { StatTile } from "@/components/StatTile";
import { Badge } from "@/components/Badge";
import { TrendChart } from "@/components/charts/TrendChart";
import { MultiSelect, type FilterMode } from "@/components/reports/MultiSelect";
import { ExportBar } from "@/components/reports/ExportBar";
import { EmptyState } from "@/components/EmptyState";
import { departmentAllocationsForEmployee, departmentName, formatCurrencyCompact, fullName } from "@/lib/helpers";
import {
  FULL_ATTENDANCE_DAYS_PER_MONTH,
  FULL_ATTENDANCE_MONTH_KEY,
  fullAttendanceFacts,
  matchesFilter,
  type AnalyticsFilters,
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
import { filterFactsWithShares, groupByDivision, reportAllocations } from "@/lib/payroll-divisions";
import { useDepartmentVouchers } from "@/lib/use-department-vouchers";
import { OTHER_PAYEE, filterVoucherAmounts, sumBy, voucherAmounts } from "@/lib/voucher-totals";

interface MultiFilterState {
  monthKeys: string[];
  years: string[];
  branchIds: string[];
  departmentIds: string[];
  employeeIds: string[];
  employmentStatuses: string[];
}
const EMPTY_MULTI_FILTERS: MultiFilterState = { monthKeys: [], years: [], branchIds: [], departmentIds: [], employeeIds: [], employmentStatuses: [] };
// Filters that can either show only, or remove, the ticked choices.
type ModalFilter = "branchIds" | "departmentIds" | "employeeIds" | "employmentStatuses";
const INCLUDE_ALL: Record<ModalFilter, FilterMode> = { branchIds: "include", departmentIds: "include", employeeIds: "include", employmentStatuses: "include" };

const EMPLOYMENT_TYPES: { value: string; label: string }[] = [
  { value: "regular", label: "Regular" },
  { value: "probationary", label: "Probationary" },
  { value: "project_based", label: "Project-based" },
  { value: "freelance", label: "Freelance" },
  { value: "consultant", label: "Consultant" },
  { value: "intern", label: "Intern" },
  { value: OTHER_PAYEE, label: "Other voucher payees (not in the 201 file)" },
];

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
  // Each filter can take several choices (nothing ticked = all).
  const [filters, setFilters] = useState<MultiFilterState>(EMPTY_MULTI_FILTERS);
  const setFilter = (key: keyof MultiFilterState) => (next: string[]) => setFilters((f) => ({ ...f, [key]: next }));
  const [modes, setModes] = useState(INCLUDE_ALL);
  const setMode = (key: ModalFilter) => (mode: FilterMode) => setModes((m) => ({ ...m, [key]: mode }));
  // The employee list shows current employees unless asked otherwise.
  const [includeFormer, setIncludeFormer] = useState(false);
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

  // "Full attendance" in the month filter: every active employee working 26
  // days a month with no absences, leaves, lates, OT or holidays, at today's
  // rates (lib/monthly-analytics.ts) — so the year filter doesn't apply.
  const isFull = filters.monthKeys.includes(FULL_ATTENDANCE_MONTH_KEY);
  const fullFacts = useMemo(
    () => fullAttendanceFacts(employees, payrollLineOverrides, payrollPeriods, attendancePeriodRecords),
    [employees, payrollLineOverrides, payrollPeriods, attendancePeriodRecords],
  );
  const viewFacts = isFull ? fullFacts : facts;

  const analyticsFilters: AnalyticsFilters = {
    monthKey: filters.monthKeys,
    year: isFull ? undefined : filters.years.map(Number),
    branchId: modes.branchIds === "include" ? filters.branchIds : [],
    departmentId: modes.departmentIds === "include" ? filters.departmentIds : [],
    employeeId: modes.employeeIds === "include" ? filters.employeeIds : [],
    employmentStatus: modes.employmentStatuses === "include" ? filters.employmentStatuses : [],
    exclude: {
      branchId: modes.branchIds === "exclude" ? filters.branchIds : [],
      departmentId: modes.departmentIds === "exclude" ? filters.departmentIds : [],
      employeeId: modes.employeeIds === "exclude" ? filters.employeeIds : [],
      employmentStatus: modes.employmentStatuses === "exclude" ? filters.employmentStatuses : [],
    },
  };
  const includedDepts = analyticsFilters.departmentId as string[];
  const excludedDepts = analyticsFilters.exclude?.departmentId ?? [];
  // Everything except the department filters (the department table and the
  // trend apply those through each person's department shares).
  const exceptDepts: AnalyticsFilters = { ...analyticsFilters, departmentId: undefined, exclude: { ...analyticsFilters.exclude, departmentId: [] } };
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
  const deptFacts = filterFactsWithShares(facts, employees, { departmentId: includedDepts, exclude: { departmentId: excludedDepts } }, allocations);
  const trendFilters = { ...exceptDepts, monthKey: undefined };

  const filtered = filterFactsWithShares(viewFacts, employees, analyticsFilters, allocations);
  const summary = summarizePayroll(filtered);
  // Department vouchers (Vouchers page) count as payroll expense too.
  const voucherTotal = filterVoucherAmounts(allVoucherAmounts, analyticsFilters, employees).reduce((t, a) => t + a.amount, 0);
  const trendVouchers = sumBy(filterVoucherAmounts(allVoucherAmounts, { ...analyticsFilters, monthKey: undefined }, employees), (a) => a.monthKey);

  // What the branch / department / employee / employment-type filters take
  // out of the month(s) shown: everything for those months vs what's left.
  const anyScopeFilter = filters.branchIds.length + filters.departmentIds.length + filters.employeeIds.length + filters.employmentStatuses.length > 0;
  const periodOnly: AnalyticsFilters = { monthKey: analyticsFilters.monthKey, year: analyticsFilters.year };
  const everything = summarizePayroll(filterFactsWithShares(viewFacts, employees, periodOnly, allocations));
  const everythingVouchers = filterVoucherAmounts(allVoucherAmounts, periodOnly, employees).reduce((t, a) => t + a.amount, 0);
  const remainingTotal = summary.totalEmployerExpense + voucherTotal;
  const removedTotal = everything.totalEmployerExpense + everythingVouchers - remainingTotal;

  // Employee choices: current employees (unless former ones are asked for),
  // narrowed to the branches / departments / employment types still in view;
  // anyone already ticked stays listed.
  const employeeOptions = employees
    .filter(
      (e) =>
        filters.employeeIds.includes(e.id) ||
        ((includeFormer || (e.status !== "resigned" && e.status !== "terminated")) &&
          matchesFilter(e.branchId, analyticsFilters.branchId) &&
          !analyticsFilters.exclude?.branchId?.includes(e.branchId) &&
          (!includedDepts.length || departmentAllocationsForEmployee(e, allocations).some((a) => includedDepts.includes(a.departmentId))) &&
          !departmentAllocationsForEmployee(e, allocations).every((a) => excludedDepts.includes(a.departmentId)) &&
          matchesFilter<string>(e.employmentStatus, analyticsFilters.employmentStatus) &&
          !analyticsFilters.exclude?.employmentStatus?.includes(e.employmentStatus)),
    )
    .sort((a, b) => fullName(a).localeCompare(fullName(b)))
    .map((e) => ({ value: e.id, label: `${fullName(e)}${e.status === "resigned" || e.status === "terminated" ? ` (${e.status})` : ""}` }));
  const trend = payrollExpenseTrendByMonth(deptFacts, employees, trendFilters).map((m) => ({ ...m, value: m.value + (trendVouchers.get(m.monthKey) ?? 0) }));
  const historical = historicalPayrollAnalytics(deptFacts, employees, trendFilters, trendVouchers);

  // Branch comparison: this month vs last; with full attendance, full
  // attendance vs the latest month with payroll on file.
  const latestActual = [...trend].reverse().find((m) => m.value > 0);
  const currentMonthKey = isFull ? FULL_ATTENDANCE_MONTH_KEY : months[months.length - 1].key;
  const previousMonthKey = isFull ? latestActual?.monthKey : months[months.length - 2]?.key;
  const currentMonthLabel = isFull ? "Full attendance" : months[months.length - 1].label;
  const previousMonthLabel = isFull ? (latestActual?.label ?? "—") : (months[months.length - 2]?.label ?? "—");

  const payrollByDepartment = groupByDepartment(
    filterFactsWithShares(viewFacts, employees, exceptDepts, allocations),
    employees,
    departments,
    allocations,
  ).filter((r) => (!includedDepts.length || includedDepts.includes(r.departmentId)) && !excludedDepts.includes(r.departmentId));
  const vouchersByDept = sumBy(filterVoucherAmounts(allVoucherAmounts, analyticsFilters, employees), (a) => a.departmentId);
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

  const branchesThisMonth = groupByBranch(filterFactsWithShares(viewFacts, employees, { ...analyticsFilters, monthKey: currentMonthKey }, allocations), employees, branches);
  const branchesPrevMonth = groupByBranch(filterFactsWithShares(facts, employees, { ...analyticsFilters, monthKey: previousMonthKey }, allocations), employees, branches);
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

      <div className="mb-4 flex flex-wrap gap-2">
        <MultiSelect
          className="w-full sm:w-56"
          allLabel="All months"
          noun="months"
          options={[
            ...months.map((m) => ({ value: m.key, label: m.label })),
            { value: FULL_ATTENDANCE_MONTH_KEY, label: `Full attendance — ${FULL_ATTENDANCE_DAYS_PER_MONTH} days, no absences` },
          ]}
          exclusive={[FULL_ATTENDANCE_MONTH_KEY]}
          value={filters.monthKeys}
          onChange={setFilter("monthKeys")}
        />
        <MultiSelect
          className="w-[calc(50%-4px)] sm:w-36"
          allLabel="All years"
          noun="years"
          options={Array.from(new Set(months.map((m) => m.year)))
            .sort()
            .map((y) => ({ value: String(y), label: String(y) }))}
          value={filters.years}
          onChange={setFilter("years")}
        />
        <MultiSelect
          className="w-[calc(50%-4px)] sm:w-44"
          allLabel="All branches"
          noun="branches"
          options={branches.map((b) => ({ value: b.id, label: b.name }))}
          value={filters.branchIds}
          onChange={setFilter("branchIds")}
          mode={modes.branchIds}
          onModeChange={setMode("branchIds")}
        />
        <MultiSelect
          className="w-full sm:w-52"
          allLabel="All departments"
          noun="departments"
          options={departments.map((d) => ({ value: d.id, label: d.name }))}
          value={filters.departmentIds}
          onChange={setFilter("departmentIds")}
          mode={modes.departmentIds}
          onModeChange={setMode("departmentIds")}
        />
        <MultiSelect
          className="w-full sm:w-52"
          allLabel="All employment types"
          noun="types"
          options={EMPLOYMENT_TYPES}
          value={filters.employmentStatuses}
          onChange={setFilter("employmentStatuses")}
          mode={modes.employmentStatuses}
          onModeChange={setMode("employmentStatuses")}
        />
        <MultiSelect
          className="w-full sm:w-64"
          allLabel="All employees"
          noun="employees"
          searchable
          options={employeeOptions}
          value={filters.employeeIds}
          onChange={setFilter("employeeIds")}
          mode={modes.employeeIds}
          onModeChange={setMode("employeeIds")}
          footer={
            <label className="flex cursor-pointer items-center gap-2 text-[var(--text-secondary)]">
              <input type="checkbox" checked={includeFormer} onChange={(e) => setIncludeFormer(e.target.checked)} />
              Include resigned / terminated
            </label>
          }
        />
        {(Object.values(filters).some((v) => v.length > 0) || Object.values(modes).some((m) => m === "exclude")) && (
          <button
            onClick={() => {
              setFilters(EMPTY_MULTI_FILTERS);
              setModes(INCLUDE_ALL);
            }}
            className="rounded-lg border border-[var(--border-hairline)] px-3 py-2 text-sm text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40"
          >
            Clear filters
          </button>
        )}
      </div>

      {anyScopeFilter && (
        <div className="mb-4 flex flex-wrap gap-x-6 gap-y-1 rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-1)] px-4 py-3 text-sm">
          <span>
            <span className="font-medium text-[var(--text-primary)]">Showing:</span>{" "}
            <span className="text-[var(--text-secondary)]">
              {summary.employeeCount} of {everything.employeeCount} employees · {formatCurrencyCompact(remainingTotal)}
            </span>
          </span>
          <span>
            <span className="font-medium text-[var(--status-critical)]">Left out by the filters:</span>{" "}
            <span className="text-[var(--text-secondary)]">
              {Math.max(0, everything.employeeCount - summary.employeeCount)} employees · {formatCurrencyCompact(removedTotal)}
            </span>
          </span>
          <span className="w-full text-xs text-[var(--text-muted)]">Payroll + vouchers for the month(s) selected. A person split between departments counts in the employee count while any of their share remains.</span>
        </div>
      )}

      {isFull && (
        <div className="mb-4 rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-1)] px-4 py-3 text-xs text-[var(--text-secondary)]">
          <span className="font-medium text-[var(--text-primary)]">Full attendance:</span> one month&rsquo;s payroll if every active employee worked all{" "}
          {FULL_ATTENDANCE_DAYS_PER_MONTH} days, with no absences, leaves, lates, overtime or holiday pay — today&rsquo;s employees, rates, allowances and employer SSS /
          HDMF / PhilHealth shares. Vouchers aren&rsquo;t included. The trend and historical figures below stay actual.
        </div>
      )}

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
        <StatTile label="Vouchers" value={formatCurrencyCompact(voucherTotal)} hint={filters.branchIds.length && modes.branchIds === "include" ? "payees linked to an employee only" : "department vouchers"} />
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
            Payroll expense per branch — {currentMonthLabel} vs {previousMonthLabel}
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
                  <th className="px-3 py-2 font-medium">{isFull ? "Full Attendance" : "This Month"}</th>
                  <th className="px-3 py-2 font-medium">{isFull ? `Actual, ${previousMonthLabel}` : "Previous Month"}</th>
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
        Department vouchers count in the month their payroll period starts. A voucher line linked to an employee follows that employee&rsquo;s branch and
        employment type; payees not in the 201 file have no branch (a &ldquo;show only&rdquo; branch filter leaves them out) and count as &ldquo;Other voucher
        payees&rdquo; under employment type. With employees chosen, only voucher lines linked to them count. Figures are computed from real attendance and
        payroll records — SSS / HDMF (Pag-IBIG) / PhilHealth contribution brackets change periodically and should be configured as versioned rate tables in System Administration to
        keep this current.
      </div>
    </div>
  );
}

