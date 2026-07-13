"use client";

import type { Branch, Department, Employee } from "@/lib/types";
import type { MonthMeta } from "@/lib/monthly-analytics";
import { fullName } from "@/lib/helpers";

export interface ReportFilterState {
  monthKey: string; // "" = all months in the window
  year: string; // "" = all years
  branchId: string;
  departmentId: string;
  employeeId: string;
}

export const EMPTY_REPORT_FILTERS: ReportFilterState = {
  monthKey: "",
  year: "",
  branchId: "",
  departmentId: "",
  employeeId: "",
};

export function ReportFilters({
  months,
  branches,
  departments,
  employees,
  value,
  onChange,
}: {
  months: MonthMeta[];
  branches: Branch[];
  departments: Department[];
  employees: Employee[];
  value: ReportFilterState;
  onChange: (next: ReportFilterState) => void;
}) {
  const years = Array.from(new Set(months.map((m) => m.year))).sort();

  return (
    <div className="mb-4 flex flex-wrap gap-2">
      <select
        value={value.monthKey}
        onChange={(e) => onChange({ ...value, monthKey: e.target.value })}
        className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-2 text-sm"
      >
        <option value="">All months (6-mo window)</option>
        {months.map((m) => (
          <option key={m.key} value={m.key}>{m.label}</option>
        ))}
      </select>
      <select
        value={value.year}
        onChange={(e) => onChange({ ...value, year: e.target.value })}
        className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-2 text-sm"
      >
        <option value="">All years</option>
        {years.map((y) => (
          <option key={y} value={y}>{y}</option>
        ))}
      </select>
      <select
        value={value.branchId}
        onChange={(e) => onChange({ ...value, branchId: e.target.value })}
        className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-2 text-sm"
      >
        <option value="">All branches</option>
        {branches.map((b) => (
          <option key={b.id} value={b.id}>{b.name}</option>
        ))}
      </select>
      <select
        value={value.departmentId}
        onChange={(e) => onChange({ ...value, departmentId: e.target.value })}
        className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-2 text-sm"
      >
        <option value="">All departments</option>
        {departments.map((d) => (
          <option key={d.id} value={d.id}>{d.name}</option>
        ))}
      </select>
      <select
        value={value.employeeId}
        onChange={(e) => onChange({ ...value, employeeId: e.target.value })}
        className="min-w-0 flex-1 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-2 text-sm sm:max-w-xs"
      >
        <option value="">All employees</option>
        {employees.map((e) => (
          <option key={e.id} value={e.id}>{fullName(e)}</option>
        ))}
      </select>
      {(value.monthKey || value.year || value.branchId || value.departmentId || value.employeeId) && (
        <button
          onClick={() => onChange(EMPTY_REPORT_FILTERS)}
          className="rounded-lg border border-[var(--border-hairline)] px-3 py-2 text-sm text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40"
        >
          Clear filters
        </button>
      )}
    </div>
  );
}
