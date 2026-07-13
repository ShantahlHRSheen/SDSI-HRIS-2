"use client";

import { useMemo, useState } from "react";
import { Gift } from "lucide-react";
import { useHris } from "@/lib/store";
import { PageHeader } from "@/components/PageHeader";
import { StatTile } from "@/components/StatTile";
import { ExportBar } from "@/components/reports/ExportBar";
import { EmptyState } from "@/components/EmptyState";
import { branchName, formatCurrencyCompact, fullName } from "@/lib/helpers";
import { getAvailableTaxYears } from "@/lib/bir";
import { getMonthlyFacts, getMonthsList, toCsv, downloadCsv } from "@/lib/monthly-analytics";

export default function ThirteenthMonthPayPage() {
  const { employees, branches } = useHris();
  const years = getAvailableTaxYears();
  const [year, setYear] = useState(years[0]);
  const [branchId, setBranchId] = useState("");
  const [search, setSearch] = useState("");

  const facts = useMemo(() => getMonthlyFacts(employees), [employees]);
  const monthsInYear = getMonthsList().filter((m) => m.year === year);
  const monthsElapsed = monthsInYear.length || 1;

  const byId = new Map(employees.map((e) => [e.id, e]));
  const accrualByEmployee = new Map<string, number>();
  facts
    .filter((f) => monthsInYear.some((m) => m.key === f.monthKey))
    .forEach((f) => {
      accrualByEmployee.set(f.employeeId, (accrualByEmployee.get(f.employeeId) ?? 0) + f.thirteenthMonthAccrual);
    });

  const rows = Array.from(accrualByEmployee.entries())
    .map(([employeeId, ytdAccrued]) => {
      const employee = byId.get(employeeId);
      const projectedFullYear = Math.round((ytdAccrued / monthsElapsed) * 12);
      return { employee, ytdAccrued, projectedFullYear };
    })
    .filter((r): r is typeof r & { employee: NonNullable<typeof r.employee> } => !!r.employee)
    .filter((r) => (branchId ? r.employee.branchId === branchId : true))
    .filter((r) => fullName(r.employee).toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => fullName(a.employee).localeCompare(fullName(b.employee)));

  const totalYtd = rows.reduce((s, r) => s + r.ytdAccrued, 0);
  const totalProjected = rows.reduce((s, r) => s + r.projectedFullYear, 0);

  function exportCsv() {
    const csv = toCsv(
      ["Employee", "Branch", "YTD Accrued", "Projected Full-Year"],
      rows.map((r) => [fullName(r.employee), branchName(r.employee.branchId), r.ytdAccrued, r.projectedFullYear]),
    );
    downloadCsv(`13th-month-pay-${year}.csv`, csv);
  }

  return (
    <div>
      <PageHeader
        title="13th Month Pay"
        subtitle={`Year-to-date accrual (1/12 of basic salary per month worked) and a projected full-year estimate for ${year}, computed from finalized payroll records.`}
        actions={<ExportBar onExportCsv={exportCsv} />}
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-2 text-sm">
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-2 text-sm">
          <option value="">All branches</option>
          {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search employee…" className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-2 text-sm" />
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Employees" value={rows.length.toString()} />
        <StatTile label="Months of data" value={monthsElapsed.toString()} hint={`of ${year}`} />
        <StatTile label="Total YTD accrued" value={formatCurrencyCompact(totalYtd)} />
        <StatTile label="Total projected (full year)" value={formatCurrencyCompact(totalProjected)} />
      </div>

      <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-1)] p-4">
        {rows.length === 0 ? (
          <EmptyState icon={Gift} title="No matching records" description="Adjust your filters or search." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-[var(--border-hairline)] text-left text-xs text-[var(--text-muted)]">
                  <th className="px-3 py-2 font-medium">Employee</th>
                  <th className="px-3 py-2 font-medium">Branch</th>
                  <th className="px-3 py-2 font-medium">YTD accrued</th>
                  <th className="px-3 py-2 font-medium">Projected full year</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.employee.id} className="border-b border-[var(--gridline)] last:border-0">
                    <td className="px-3 py-2 text-[var(--text-primary)]">{fullName(r.employee)}</td>
                    <td className="px-3 py-2 text-[var(--text-secondary)]">{branchName(r.employee.branchId)}</td>
                    <td className="tabular px-3 py-2 text-[var(--text-secondary)]">{formatCurrencyCompact(r.ytdAccrued)}</td>
                    <td className="tabular px-3 py-2 font-medium text-[var(--text-primary)]">{formatCurrencyCompact(r.projectedFullYear)}</td>
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
