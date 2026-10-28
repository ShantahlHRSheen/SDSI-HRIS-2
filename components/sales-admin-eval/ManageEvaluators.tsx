"use client";

import { useState } from "react";
import { Modal } from "@/components/Modal";
import { fullName } from "@/lib/helpers";
import type { Employee } from "@/lib/types";

// HR: who rates each employee's Job Performance (defaults to the
// supervisor). The evaluation's Department Head is filled in from this.
export function ManageEvaluatorsModal({
  open,
  onClose,
  employees,
  updateEmployee,
}: {
  open: boolean;
  onClose: () => void;
  employees: Employee[];
  updateEmployee: (id: string, patch: Partial<Omit<Employee, "id" | "employeeNumber">>) => void;
}) {
  const [search, setSearch] = useState("");
  const byId = new Map(employees.map((e) => [e.id, e]));
  const candidateEvaluators = employees
    .filter((e) => e.roles.some((r) => ["dept_head", "hr_admin", "upper_management"].includes(r)))
    .sort((a, b) => fullName(a).localeCompare(fullName(b)));

  const filtered = employees
    .filter((e) => (e.status === "active" || e.status === "on_leave"))
    .filter((e) => fullName(e).toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => fullName(a).localeCompare(fullName(b)));

  return (
    <Modal open={open} onClose={onClose} title="Manage Job Performance evaluators" wide>
      <p className="mb-3 text-xs text-[var(--text-secondary)]">
        Assign who rates each employee&rsquo;s Job Performance KPIs. Leave unassigned to default to that employee&rsquo;s org-chart supervisor.
      </p>
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search employee…"
        className="mb-3 w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-2 text-sm sm:max-w-xs"
      />
      <div className="max-h-[60vh] overflow-y-auto rounded-xl border border-[var(--border-hairline)]">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="sticky top-0 bg-[var(--surface-1)]">
            <tr className="border-b border-[var(--border-hairline)] text-left text-xs text-[var(--text-muted)]">
              <th className="px-3 py-2 font-medium">Employee</th>
              <th className="px-3 py-2 font-medium">Supervisor (default)</th>
              <th className="px-3 py-2 font-medium">Job Performance evaluator</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((e) => {
              const supervisor = e.supervisorId ? byId.get(e.supervisorId) : null;
              return (
                <tr key={e.id} className="border-b border-[var(--gridline)] last:border-0">
                  <td className="px-3 py-2 text-[var(--text-primary)]">{fullName(e)}</td>
                  <td className="px-3 py-2 text-xs text-[var(--text-secondary)]">{supervisor ? fullName(supervisor) : "—"}</td>
                  <td className="px-3 py-2">
                    <select
                      value={e.jobPerformanceEvaluatorId ?? ""}
                      onChange={(ev) => updateEmployee(e.id, { jobPerformanceEvaluatorId: ev.target.value || null })}
                      className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-2 py-1.5 text-xs"
                    >
                      <option value="">Use supervisor (default)</option>
                      {candidateEvaluators.map((c) => (
                        <option key={c.id} value={c.id}>{fullName(c)}</option>
                      ))}
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}
