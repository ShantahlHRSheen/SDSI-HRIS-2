"use client";

import { useMemo, useState } from "react";
import { AlarmClockOff, ChevronDown, ChevronRight } from "lucide-react";
import { useHris } from "@/lib/store";
import { PageHeader } from "@/components/PageHeader";
import { StatTile } from "@/components/StatTile";
import { EmptyState } from "@/components/EmptyState";
import { ExportBar } from "@/components/reports/ExportBar";
import { branchName, departmentName, formatDate, fullName, scopeEmployeesForViewer } from "@/lib/helpers";
import { toCsv, downloadCsv } from "@/lib/monthly-analytics";
import { buildTardinessRows, flaggedTardiness, TARDINESS_THRESHOLD, type TardinessRow } from "@/lib/tardiness-absenteeism";
import type { Employee } from "@/lib/types";

export default function TardinessReportPage() {
  const { currentUser, currentEmployee, employees, branches, departments, payrollPeriods, attendancePeriodRecords } = useHris();
  const canManage = currentUser?.roles.some((r) => ["hr_admin", "payroll_officer", "dept_head", "upper_management", "sys_admin"].includes(r));

  if (!canManage) {
    return <SelfServiceView employee={currentEmployee} records={attendancePeriodRecords} />;
  }

  const visibleEmployees = scopeEmployeesForViewer(employees, currentUser?.roles ?? [], currentEmployee);
  return <AdminView employees={visibleEmployees} branches={branches} departments={departments} payrollPeriods={payrollPeriods} records={attendancePeriodRecords} />;
}

function SelfServiceView({ employee, records }: { employee: Employee | null; records: ReturnType<typeof useHris>["attendancePeriodRecords"] }) {
  const rows = useMemo(() => (employee ? buildTardinessRows(records, [employee]) : []), [records, employee]);
  if (!employee) return null;
  const mine = rows[0];

  return (
    <div>
      <PageHeader title="My Tardiness Record" subtitle="Days you clocked in late, drawn from imported attendance records." />
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatTile label="Late instances" value={(mine?.lateInstances ?? 0).toString()} deltaTone={(mine?.lateInstances ?? 0) >= TARDINESS_THRESHOLD ? "bad" : "neutral"} />
        <StatTile label="Flag threshold" value={`${TARDINESS_THRESHOLD}+`} hint="instances" />
      </div>
      {!mine || mine.lateDays.length === 0 ? (
        <EmptyState icon={AlarmClockOff} title="No late instances on record" description="Your imported attendance shows no days with late minutes." />
      ) : (
        <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-1)] p-4">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] text-sm">
              <thead>
                <tr className="border-b border-[var(--border-hairline)] text-left text-xs text-[var(--text-muted)]">
                  <th className="px-3 py-2 font-medium">Date</th>
                  <th className="px-3 py-2 font-medium">Late (raw mins)</th>
                </tr>
              </thead>
              <tbody>
                {mine.lateDays.map((d, i) => (
                  <tr key={`${d.date}-${i}`} className="border-b border-[var(--gridline)] last:border-0">
                    <td className="px-3 py-2 text-[var(--text-primary)]">{formatDate(d.date)}</td>
                    <td className="tabular px-3 py-2 text-[var(--text-secondary)]">{d.lateRawMinutes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
  const allRows = useMemo(() => buildTardinessRows(recordsInRange, employees), [recordsInRange, employees]);
  const baseRows = showAll ? allRows : flaggedTardiness(allRows);

  const filtered = baseRows
    .filter((row) => (branchId ? row.employee.branchId === branchId : true))
    .filter((row) => (departmentId ? row.employee.departmentId === departmentId : true))
    .filter((row) => fullName(row.employee).toLowerCase().includes(search.toLowerCase()));

  const flaggedCount = flaggedTardiness(allRows).length;

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
      ["Employee", "Branch", "Department", "Late Instances", "Late Dates (raw mins)"],
      filtered.map((row) => [
        fullName(row.employee),
        branchName(row.employee.branchId),
        departmentName(row.employee.departmentId),
        row.lateInstances,
        row.lateDays.map((d) => `${formatDate(d.date)} (${d.lateRawMinutes}m)`).join("; "),
      ]),
    );
    downloadCsv("tardiness-report.csv", csv);
  }

  return (
    <div>
      <PageHeader
        title="Tardiness Report"
        subtitle={`Employees with ${TARDINESS_THRESHOLD}+ late instances across the selected periods, drawn from imported daily attendance.`}
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
        <StatTile label={`Flagged (${TARDINESS_THRESHOLD}+ instances)`} value={flaggedCount.toString()} deltaTone={flaggedCount > 0 ? "bad" : "neutral"} />
        <StatTile label="Periods covered" value={periodIdsInRange.size.toString()} />
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={AlarmClockOff} title="No employees to show" description={showAll ? "No late instances in the selected range/filters." : "No one crosses the tardiness threshold for the selected range/filters."} />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-1)]">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-[var(--border-hairline)] text-left text-xs text-[var(--text-muted)]">
                <th className="w-8 px-3 py-2" />
                <th className="px-3 py-2 font-medium">Employee</th>
                <th className="px-3 py-2 font-medium">Branch / Dept</th>
                <th className="px-3 py-2 font-medium">Late instances</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <TardinessRowView key={row.employee.id} row={row} isOpen={expanded.has(row.employee.id)} onToggle={() => toggle(row.employee.id)} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function TardinessRowView({ row, isOpen, onToggle }: { row: TardinessRow; isOpen: boolean; onToggle: () => void }) {
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
        <td className="tabular px-3 py-2 text-[var(--text-secondary)]">
          <span className={row.lateInstances >= TARDINESS_THRESHOLD ? "font-semibold text-[var(--status-critical)]" : ""}>{row.lateInstances}</span>
        </td>
      </tr>
      {isOpen && (
        <tr className="border-b border-[var(--gridline)] bg-[var(--gridline)]/10">
          <td />
          <td colSpan={3} className="px-3 py-2">
            <div className="flex flex-wrap gap-2">
              {row.lateDays.map((d, i) => (
                <span key={`${d.date}-${i}`} className="rounded-lg border border-[var(--border-hairline)] px-2 py-1 text-xs text-[var(--text-secondary)]">
                  {formatDate(d.date)} — {d.lateRawMinutes}m late
                </span>
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
