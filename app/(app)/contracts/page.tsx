"use client";

import { useMemo, useState } from "react";
import { useHris } from "@/lib/store";
import { PageHeader } from "@/components/PageHeader";
import { StatTile } from "@/components/StatTile";
import { Badge, type BadgeTone } from "@/components/Badge";
import { Modal } from "@/components/Modal";
import { EmptyState } from "@/components/EmptyState";
import { branchName, departmentName, dueSoonLabel, formatDate, fullName, positionTitle, relativeDays } from "@/lib/helpers";
import type { Employee } from "@/lib/types";
import { FileClock } from "lucide-react";

const TRACKED_STATUSES: Employee["employmentStatus"][] = ["probationary", "freelance", "project_based", "consultant"];

export default function ContractsPage() {
  const { employees, branches, markRegularized, renewContract } = useHris();
  const [branchFilter, setBranchFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [renewTarget, setRenewTarget] = useState<Employee | null>(null);
  const [newDate, setNewDate] = useState("");

  const tracked = useMemo(() => {
    return employees
      .filter((e) => (e.status === "active" || e.status === "on_leave") && TRACKED_STATUSES.includes(e.employmentStatus))
      .map((e) => {
        const keyDate = e.employmentStatus === "probationary" ? e.probationEndsAt : e.contractEnd;
        const daysUntil = keyDate ? relativeDays(keyDate) : 9999;
        return { employee: e, keyDate, daysUntil };
      })
      .filter((row) => (branchFilter === "all" ? true : row.employee.branchId === branchFilter))
      .filter((row) => (statusFilter === "all" ? true : row.employee.employmentStatus === statusFilter))
      .filter((row) => fullName(row.employee).toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => a.daysUntil - b.daysUntil);
  }, [employees, branchFilter, statusFilter, search]);

  const overdue = tracked.filter((r) => r.daysUntil < 0).length;
  const dueSoon = tracked.filter((r) => r.daysUntil >= 0 && r.daysUntil <= 15).length;
  const dueLater = tracked.filter((r) => r.daysUntil > 15 && r.daysUntil <= 45).length;

  function openRenew(e: Employee) {
    setRenewTarget(e);
    setNewDate(e.contractEnd ?? "");
  }

  function confirmRenew() {
    if (renewTarget && newDate) {
      renewContract(renewTarget.id, newDate);
      setRenewTarget(null);
    }
  }

  return (
    <div>
      <PageHeader
        title="Contract Monitoring"
        subtitle="Probationary evaluation dates and freelance / project-based contract end dates across all branches."
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Tracked contracts" value={tracked.length.toString()} />
        <StatTile label="Overdue" value={overdue.toString()} deltaTone={overdue ? "bad" : "neutral"} />
        <StatTile label="Due within 15 days" value={dueSoon.toString()} deltaTone={dueSoon ? "bad" : "neutral"} />
        <StatTile label="Due in 16–45 days" value={dueLater.toString()} />
      </div>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name…"
          className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-2 text-sm sm:max-w-xs"
        />
        <select value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)} className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-2 text-sm">
          <option value="all">All branches</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-2 text-sm">
          <option value="all">All employment types</option>
          {TRACKED_STATUSES.map((s) => (
            <option key={s} value={s}>{s.replace("_", " ")}</option>
          ))}
        </select>
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-1)]">
        {tracked.length === 0 ? (
          <EmptyState icon={FileClock} title="No matching contracts" description="Adjust your filters to see probationary or freelance/project-based contracts." />
        ) : (
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-[var(--border-hairline)] text-left text-xs text-[var(--text-muted)]">
                <th className="px-4 py-2 font-medium">Employee</th>
                <th className="px-4 py-2 font-medium">Branch / Dept</th>
                <th className="px-4 py-2 font-medium">Type</th>
                <th className="px-4 py-2 font-medium">Key date</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {tracked.map(({ employee, keyDate, daysUntil }) => {
                const due = dueSoonLabel(daysUntil);
                return (
                  <tr key={employee.id} className="border-b border-[var(--gridline)] last:border-0">
                    <td className="px-4 py-2.5">
                      <div className="font-medium text-[var(--text-primary)]">{fullName(employee)}</div>
                      <div className="text-xs text-[var(--text-muted)]">{positionTitle(employee.positionId)} · {employee.employeeNumber}</div>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-[var(--text-secondary)]">
                      {branchName(employee.branchId)}<br />{departmentName(employee.departmentId)}
                    </td>
                    <td className="px-4 py-2.5"><Badge tone="info">{employee.employmentStatus.replace("_", " ")}</Badge></td>
                    <td className="tabular px-4 py-2.5 text-[var(--text-secondary)]">{formatDate(keyDate)}</td>
                    <td className="px-4 py-2.5"><Badge tone={due.tone as BadgeTone}>{due.label}</Badge></td>
                    <td className="px-4 py-2.5">
                      {employee.employmentStatus === "probationary" ? (
                        <button onClick={() => markRegularized(employee.id)} className="rounded-lg border border-[var(--border-hairline)] px-2.5 py-1 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40">
                          Mark regular
                        </button>
                      ) : (
                        <button onClick={() => openRenew(employee)} className="rounded-lg border border-[var(--border-hairline)] px-2.5 py-1 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40">
                          Renew contract
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <Modal open={!!renewTarget} onClose={() => setRenewTarget(null)} title={`Renew contract — ${renewTarget ? fullName(renewTarget) : ""}`}>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">New contract end date</label>
            <input
              type="date"
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
              className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-2 text-sm"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={() => setRenewTarget(null)} className="rounded-lg px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40">Cancel</button>
            <button onClick={confirmRenew} className="rounded-lg bg-[var(--series-1)] px-3 py-1.5 text-sm font-medium text-[var(--on-accent)]">Confirm renewal</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
