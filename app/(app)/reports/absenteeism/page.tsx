"use client";

import { useMemo, useState } from "react";
import { CalendarX2, ChevronDown, ChevronRight } from "lucide-react";
import { useHris } from "@/lib/store";
import { PageHeader } from "@/components/PageHeader";
import { StatTile } from "@/components/StatTile";
import { EmptyState } from "@/components/EmptyState";
import { ExportBar } from "@/components/reports/ExportBar";
import { branchName, departmentName, formatDate, fullName, scopeEmployeesForViewer } from "@/lib/helpers";
import { toCsv, downloadCsv } from "@/lib/monthly-analytics";
import { buildAbsenteeismRows, flaggedAbsenteeism, ABSENTEEISM_THRESHOLD, type AbsenteeismRow } from "@/lib/tardiness-absenteeism";
import type { Employee } from "@/lib/types";

export default function AbsenteeismReportPage() {
  const { currentUser, currentEmployee, employees, branches, departments, payrollPeriods, attendancePeriodRecords } = useHris();
  const canManage = currentUser?.roles.some((r) => ["hr_admin", "payroll_officer", "dept_head", "upper_management", "sys_admin"].includes(r));

  if (!canManage) {
    return <SelfServiceView employee={currentEmployee} records={attendancePeriodRecords} />;
  }

  const visibleEmployees = scopeEmployeesForViewer(employees, currentUser?.roles ?? [], currentEmployee);
  return <AdminView employees={visibleEmployees} branches={branches} departments={departments} payrollPeriods={payrollPeriods} records={attendancePeriodRecords} />;
}

function SelfServiceView({ employee, records }: { employee: Employee | null; records: ReturnType<typeof useHris>["attendancePeriodRecords"] }) {
  const rows = useMemo(() => (employee ? buildAbsenteeismRows(records, [employee]) : []), [records, employee]);
  if (!employee) return null;
  const mine = rows[0];

  return (
    <div>
      <PageHeader title="My Absenteeism Record" subtitle="Absences and half-days on file, drawn from imported attendance records." />
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Absences" value={(mine?.absenceInstances ?? 0).toString()} />
        <StatTile label="Half days" value={(mine?.halfDayInstances ?? 0).toString()} />
        <StatTile label="Total instances" value={(mine?.totalInstances ?? 0).toString()} deltaTone={(mine?.totalInstances ?? 0) >= ABSENTEEISM_THRESHOLD ? "bad" : "neutral"} />
        <StatTile label="Flag threshold" value={`${ABSENTEEISM_THRESHOLD}+`} hint="instances" />
      </div>
      {!mine || (mine.absentDays.length === 0 && mine.halfDays.length === 0) ? (
        <EmptyState icon={CalendarX2} title="No absences or half-days on record" description="Your imported attendance shows a full attendance history." />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <DayListCard title="Absent days" dates={mine.absentDays.map((d) => d.date)} />
          <DayListCard title="Half days" dates={mine.halfDays.map((d) => d.date)} />
        </div>
      )}
    </div>
  );
}

function DayListCard({ title, dates }: { title: string; dates: string[] }) {
  return (
    <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-1)] p-4">
      <div className="mb-3 text-sm font-medium text-[var(--text-primary)]">{title} ({dates.length})</div>
      {dates.length === 0 ? (
        <div className="py-2 text-center text-xs text-[var(--text-muted)]">None on record.</div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {dates.map((d, i) => (
            <span key={`${d}-${i}`} className="rounded-lg border border-[var(--border-hairline)] px-2 py-1 text-xs text-[var(--text-secondary)]">{formatDate(d)}</span>
          ))}
        </div>
      )}
    </div>
  );
}

function AdminView({
  employees,
  branches,
  departments,
  payrollPeriods,
  records,
}: {
  employees: Employee[];
  branches: ReturnType<typeof useHris>["branches"];
  departments: ReturnType<typeof useHris>["departments"];
  payrollPeriods: ReturnType<typeof useHris>["payrollPeriods"];
  records: ReturnType<typeof useHris>["attendancePeriodRecords"];
}) {
  const [fromPeriodId, setFromPeriodId] = useState(payrollPeriods[0]?.id ?? "");
  const [toPeriodId, setToPeriodId] = useState(payrollPeriods[payrollPeriods.length - 1]?.id ?? "");
  const [branchId, setBranchId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [search, setSearch] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const fromIdx = payrollPeriods.findIndex((p) => p.id === fromPeriodId);
  const toIdx = payrollPeriods.findIndex((p) => p.id === toPeriodId);
  const periodIdsInRange = new Set(
    payrollPeriods.slice(Math.min(fromIdx, toIdx) === -1 ? 0 : Math.min(fromIdx, toIdx), (Math.max(fromIdx, toIdx) === -1 ? payrollPeriods.length - 1 : Math.max(fromIdx, toIdx)) + 1).map((p) => p.id),
  );

  const recordsInRange = records.filter((r) => periodIdsInRange.has(r.periodId));
  const allRows = useMemo(() => buildAbsenteeismRows(recordsInRange, employees), [recordsInRange, employees]);
  const baseRows = showAll ? allRows : flaggedAbsenteeism(allRows);

  const filtered = baseRows
    .filter((row) => (branchId ? row.employee.branchId === branchId : true))
    .filter((row) => (departmentId ? row.employee.departmentId === departmentId : true))
    .filter((row) => fullName(row.employee).toLowerCase().includes(search.toLowerCase()));

  const flaggedCount = flaggedAbsenteeism(allRows).length;

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function exportCsv() {
    const csv = toCsv(
      ["Employee", "Branch", "Department", "Absences", "Half Days", "Total Instances", "Absent Dates", "Half Dates"],
      filtered.map((row) => [
        fullName(row.employee),
        branchName(row.employee.branchId),
        departmentName(row.employee.departmentId),
        row.absenceInstances,
        row.halfDayInstances,
        row.totalInstances,
        row.absentDays.map((d) => formatDate(d.date)).join("; "),
        row.halfDays.map((d) => formatDate(d.date)).join("; "),
      ]),
    );
    downloadCsv("absenteeism-report.csv", csv);
  }

  return (
    <div>
      <PageHeader
        title="Absenteeism Report"
        subtitle={`Employees with ${ABSENTEEISM_THRESHOLD}+ combined absence/half-day instances across the selected periods, drawn from imported daily attendance.`}
        actions={<ExportBar onExportCsv={exportCsv} />}
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select value={fromPeriodId} onChange={(e) => setFromPeriodId(e.target.value)} className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-2 text-sm">
          {payrollPeriods.map((p) => <option key={p.id} value={p.id}>From: {formatDate(p.start)}</option>)}
        </select>
        <select value={toPeriodId} onChange={(e) => setToPeriodId(e.target.value)} className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-2 text-sm">
          {payrollPeriods.map((p) => <option key={p.id} value={p.id}>To: {formatDate(p.end)}</option>)}
        </select>
        <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-2 text-sm">
          <option value="">All branches</option>
          {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-2 text-sm">
          <option value="">All departments</option>
          {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search employee…" className="min-w-0 flex-1 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-2 text-sm sm:max-w-xs" />
        <label className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
          <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
          Show all employees, not just flagged
        </label>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatTile label={`Flagged (${ABSENTEEISM_THRESHOLD}+ instances)`} value={flaggedCount.toString()} deltaTone={flaggedCount > 0 ? "bad" : "neutral"} />
        <StatTile label="Periods covered" value={periodIdsInRange.size.toString()} />
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={CalendarX2} title="No employees to show" description={showAll ? "No absences or half-days in the selected range/filters." : "No one crosses the absenteeism threshold for the selected range/filters."} />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-1)]">
          <table className="w-full min-w-[680px] text-sm">
            <thead>
              <tr className="border-b border-[var(--border-hairline)] text-left text-xs text-[var(--text-muted)]">
                <th className="w-8 px-3 py-2" />
                <th className="px-3 py-2 font-medium">Employee</th>
                <th className="px-3 py-2 font-medium">Branch / Dept</th>
                <th className="px-3 py-2 font-medium">Absences</th>
                <th className="px-3 py-2 font-medium">Half days</th>
                <th className="px-3 py-2 font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <AbsenteeismRowView key={row.employee.id} row={row} isOpen={expanded.has(row.employee.id)} onToggle={() => toggle(row.employee.id)} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function AbsenteeismRowView({ row, isOpen, onToggle }: { row: AbsenteeismRow; isOpen: boolean; onToggle: () => void }) {
  return (
    <>
      <tr className="border-b border-[var(--gridline)] hover:bg-[var(--gridline)]/20">
        <td className="px-3 py-2">
          <button onClick={onToggle} className="text-[var(--text-muted)]" aria-label={isOpen ? "Collapse" : "Expand"}>
            {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </button>
        </td>
        <td className="px-3 py-2 font-medium text-[var(--text-primary)]">{fullName(row.employee)}</td>
        <td className="px-3 py-2 text-xs text-[var(--text-secondary)]">{branchName(row.employee.branchId)}<br />{departmentName(row.employee.departmentId)}</td>
        <td className="tabular px-3 py-2 text-[var(--text-secondary)]">{row.absenceInstances}</td>
        <td className="tabular px-3 py-2 text-[var(--text-secondary)]">{row.halfDayInstances}</td>
        <td className="tabular px-3 py-2">
          <span className={row.totalInstances >= ABSENTEEISM_THRESHOLD ? "font-semibold text-[var(--status-critical)]" : "text-[var(--text-secondary)]"}>{row.totalInstances}</span>
        </td>
      </tr>
      {isOpen && (
        <tr className="border-b border-[var(--gridline)] bg-[var(--gridline)]/10">
          <td />
          <td colSpan={5} className="px-3 py-2">
            <div className="space-y-2">
              {row.absentDays.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-[var(--text-muted)]">Absent:</span>
                  {row.absentDays.map((d, i) => (
                    <span key={`a-${d.date}-${i}`} className="rounded-lg border border-[var(--border-hairline)] px-2 py-1 text-xs text-[var(--text-secondary)]">{formatDate(d.date)}</span>
                  ))}
                </div>
              )}
              {row.halfDays.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-[var(--text-muted)]">Half day:</span>
                  {row.halfDays.map((d, i) => (
                    <span key={`h-${d.date}-${i}`} className="rounded-lg border border-[var(--border-hairline)] px-2 py-1 text-xs text-[var(--text-secondary)]">{formatDate(d.date)}</span>
                  ))}
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
