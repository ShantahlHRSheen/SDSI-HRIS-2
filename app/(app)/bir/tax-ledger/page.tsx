"use client";

import { useMemo, useState } from "react";
import { Receipt } from "lucide-react";
import { useHris } from "@/lib/store";
import { PageHeader } from "@/components/PageHeader";
import { StatTile } from "@/components/StatTile";
import { ReportFilters, EMPTY_REPORT_FILTERS, type ReportFilterState } from "@/components/reports/ReportFilters";
import { ExportBar } from "@/components/reports/ExportBar";
import { EmptyState } from "@/components/EmptyState";
import { formatCurrencyCompact, fullName } from "@/lib/helpers";
import {
  filterFacts,
  getMonthlyFacts,
  getMonthsList,
  summarizeTax,
  toCsv,
  downloadCsv,
} from "@/lib/monthly-analytics";

export default function EmployeeTaxLedgerPage() {
  const { employees, branches, departments } = useHris();
  const [filters, setFilters] = useState<ReportFilterState>(EMPTY_REPORT_FILTERS);
  const [search, setSearch] = useState("");

  const months = getMonthsList();
  const facts = useMemo(() => getMonthlyFacts(employees), [employees]);

  const analyticsFilters = {
    monthKey: filters.monthKey || undefined,
    year: filters.year ? Number(filters.year) : undefined,
    branchId: filters.branchId || undefined,
    departmentId: filters.departmentId || undefined,
    employeeId: filters.employeeId || undefined,
  };

  const filtered = filterFacts(facts, employees, analyticsFilters);
  const summary = summarizeTax(filtered);

  const byId = new Map(employees.map((e) => [e.id, e]));
  const rows = filtered
    .map((f) => ({ fact: f, employee: byId.get(f.employeeId) }))
    .filter((r): r is { fact: (typeof filtered)[number]; employee: NonNullable<typeof r.employee> } => !!r.employee)
    .filter((r) => fullName(r.employee).toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => (a.fact.monthKey === b.fact.monthKey ? fullName(a.employee).localeCompare(fullName(b.employee)) : b.fact.monthKey.localeCompare(a.fact.monthKey)));

  function exportCsv() {
    const csv = toCsv(
      ["Employee", "Payroll Period", "Gross Pay", "Taxable Income", "Non-Taxable Income", "Tax Withheld", "Net Pay"],
      rows.map(({ fact, employee }) => [
        fullName(employee),
        months.find((m) => m.key === fact.monthKey)?.label ?? fact.monthKey,
        fact.grossCompensation,
        fact.taxableCompensation,
        fact.nonTaxableCompensation,
        fact.withholdingTax,
        fact.netPay,
      ]),
    );
    downloadCsv("employee-tax-ledger.csv", csv);
  }

  return (
    <div>
      <PageHeader
        title="Employee Tax Ledger"
        subtitle="Payroll tax history for every employee, sourced directly from finalized payroll records."
        actions={<ExportBar onExportCsv={exportCsv} label="Export to Excel (CSV)" />}
      />

      <ReportFilters months={months} branches={branches} departments={departments} employees={employees} value={filters} onChange={setFilters} />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Gross pay" value={formatCurrencyCompact(summary.grossCompensation)} />
        <StatTile label="Taxable income" value={formatCurrencyCompact(summary.taxableCompensation)} />
        <StatTile label="Tax withheld" value={formatCurrencyCompact(summary.withholdingTax)} />
        <StatTile label="Net pay" value={formatCurrencyCompact(summary.netPay)} />
      </div>

      <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-1)] p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="text-sm font-medium text-[var(--text-primary)]">Tax ledger</div>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search employee…"
            className="w-48 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-1.5 text-xs"
          />
        </div>
        {rows.length === 0 ? (
          <EmptyState icon={Receipt} title="No matching records" description="Adjust your filters or search." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="border-b border-[var(--border-hairline)] text-left text-xs text-[var(--text-muted)]">
                  <th className="px-3 py-2 font-medium">Employee</th>
                  <th className="px-3 py-2 font-medium">Payroll period</th>
                  <th className="px-3 py-2 font-medium">Gross pay</th>
                  <th className="px-3 py-2 font-medium">Taxable income</th>
                  <th className="px-3 py-2 font-medium">Non-taxable income</th>
                  <th className="px-3 py-2 font-medium">Tax withheld</th>
                  <th className="px-3 py-2 font-medium">Net pay</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ fact, employee }) => (
                  <tr key={`${fact.employeeId}-${fact.monthKey}`} className="border-b border-[var(--gridline)] last:border-0">
                    <td className="px-3 py-2 text-[var(--text-primary)]">{fullName(employee)}</td>
                    <td className="px-3 py-2 text-[var(--text-secondary)]">{months.find((m) => m.key === fact.monthKey)?.label ?? fact.monthKey}</td>
                    <td className="tabular px-3 py-2 text-[var(--text-secondary)]">{formatCurrencyCompact(fact.grossCompensation)}</td>
                    <td className="tabular px-3 py-2 text-[var(--text-secondary)]">{formatCurrencyCompact(fact.taxableCompensation)}</td>
                    <td className="tabular px-3 py-2 text-[var(--text-secondary)]">{formatCurrencyCompact(fact.nonTaxableCompensation)}</td>
                    <td className="tabular px-3 py-2 text-[var(--text-secondary)]">{formatCurrencyCompact(fact.withholdingTax)}</td>
                    <td className="tabular px-3 py-2 font-medium text-[var(--text-primary)]">{formatCurrencyCompact(fact.netPay)}</td>
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
