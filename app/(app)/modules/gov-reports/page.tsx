"use client";

import { useMemo, useState } from "react";
import { Landmark } from "lucide-react";
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
  summarizePayroll,
  summarizeTax,
  toCsv,
  downloadCsv,
} from "@/lib/monthly-analytics";

export default function GovernmentReportsPage() {
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
  const payroll = summarizePayroll(filtered);
  const tax = summarizeTax(filtered);

  const byId = new Map(employees.map((e) => [e.id, e]));
  const byEmployee = new Map<string, { sssEr: number; sssEe: number; philEr: number; philEe: number; hdmfEr: number; hdmfEe: number }>();
  filtered.forEach((f) => {
    const cur = byEmployee.get(f.employeeId) ?? { sssEr: 0, sssEe: 0, philEr: 0, philEe: 0, hdmfEr: 0, hdmfEe: 0 };
    cur.sssEr += f.employerSSS;
    cur.sssEe += f.employeeSSS;
    cur.philEr += f.employerPhilHealth;
    cur.philEe += f.employeePhilHealth;
    cur.hdmfEr += f.employerHDMF;
    cur.hdmfEe += f.employeeHDMF;
    byEmployee.set(f.employeeId, cur);
  });
  const rows = Array.from(byEmployee.entries())
    .map(([employeeId, c]) => ({ employee: byId.get(employeeId), ...c }))
    .filter((r): r is typeof r & { employee: NonNullable<typeof r.employee> } => !!r.employee)
    .filter((r) => fullName(r.employee).toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => fullName(a.employee).localeCompare(fullName(b.employee)));

  function exportCsv() {
    const csv = toCsv(
      ["Employee", "SSS (Employer)", "SSS (Employee)", "PhilHealth (Employer)", "PhilHealth (Employee)", "Pag-IBIG (Employer)", "Pag-IBIG (Employee)"],
      rows.map((r) => [fullName(r.employee), r.sssEr, r.sssEe, r.philEr, r.philEe, r.hdmfEr, r.hdmfEe]),
    );
    downloadCsv("government-contributions-report.csv", csv);
  }

  return (
    <div>
      <PageHeader
        title="Government Reports"
        subtitle="SSS, PhilHealth, and Pag-IBIG (HDMF) contribution reports, computed from finalized payroll records. See the BIR section for Form 1601-C, Form 2316, and the Employee Tax Ledger."
        actions={<ExportBar onExportCsv={exportCsv} />}
      />

      <ReportFilters months={months} branches={branches} departments={departments} employees={employees} value={filters} onChange={setFilters} />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatTile label="SSS (employer)" value={formatCurrencyCompact(payroll.employerSSS)} />
        <StatTile label="SSS (employee)" value={formatCurrencyCompact(tax.employeeSSS)} />
        <StatTile label="PhilHealth (employer)" value={formatCurrencyCompact(payroll.employerPhilHealth)} />
        <StatTile label="PhilHealth (employee)" value={formatCurrencyCompact(tax.employeePhilHealth)} />
        <StatTile label="Pag-IBIG (employer)" value={formatCurrencyCompact(payroll.employerHDMF)} />
        <StatTile label="Pag-IBIG (employee)" value={formatCurrencyCompact(tax.employeeHDMF)} />
      </div>

      <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-1)] p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="text-sm font-medium text-[var(--text-primary)]">Contributions by employee</div>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search employee…" className="w-48 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-1.5 text-xs" />
        </div>
        {rows.length === 0 ? (
          <EmptyState icon={Landmark} title="No matching records" description="Adjust your filters or search." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-[var(--border-hairline)] text-left text-xs text-[var(--text-muted)]">
                  <th className="px-3 py-2 font-medium">Employee</th>
                  <th className="px-3 py-2 font-medium">SSS (ER)</th>
                  <th className="px-3 py-2 font-medium">SSS (EE)</th>
                  <th className="px-3 py-2 font-medium">PhilHealth (ER)</th>
                  <th className="px-3 py-2 font-medium">PhilHealth (EE)</th>
                  <th className="px-3 py-2 font-medium">Pag-IBIG (ER)</th>
                  <th className="px-3 py-2 font-medium">Pag-IBIG (EE)</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.employee.id} className="border-b border-[var(--gridline)] last:border-0">
                    <td className="px-3 py-2 text-[var(--text-primary)]">{fullName(r.employee)}</td>
                    <td className="tabular px-3 py-2 text-[var(--text-secondary)]">{formatCurrencyCompact(r.sssEr)}</td>
                    <td className="tabular px-3 py-2 text-[var(--text-secondary)]">{formatCurrencyCompact(r.sssEe)}</td>
                    <td className="tabular px-3 py-2 text-[var(--text-secondary)]">{formatCurrencyCompact(r.philEr)}</td>
                    <td className="tabular px-3 py-2 text-[var(--text-secondary)]">{formatCurrencyCompact(r.philEe)}</td>
                    <td className="tabular px-3 py-2 text-[var(--text-secondary)]">{formatCurrencyCompact(r.hdmfEr)}</td>
                    <td className="tabular px-3 py-2 text-[var(--text-secondary)]">{formatCurrencyCompact(r.hdmfEe)}</td>
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
