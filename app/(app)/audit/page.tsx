"use client";

import { useMemo, useState } from "react";
import { History } from "lucide-react";
import { useHris } from "@/lib/store";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { formatDate } from "@/lib/helpers";

export default function AuditTrailPage() {
  const { auditLogs } = useHris();
  const [moduleFilter, setModuleFilter] = useState("all");
  const [search, setSearch] = useState("");

  const modules = useMemo(() => Array.from(new Set(auditLogs.map((l) => l.module))).sort(), [auditLogs]);

  const rows = useMemo(() => {
    return auditLogs
      .filter((l) => (moduleFilter === "all" ? true : l.module === moduleFilter))
      .filter((l) => {
        const q = search.toLowerCase();
        if (!q) return true;
        return l.userName.toLowerCase().includes(q) || l.description.toLowerCase().includes(q) || l.action.toLowerCase().includes(q);
      });
  }, [auditLogs, moduleFilter, search]);

  return (
    <div>
      <PageHeader title="Audit Trail" subtitle="Every create / update / delete / approval action across the system, queryable by HR and System Administrators." />

      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by user, action, or description…"
          className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-2 text-sm sm:max-w-sm"
        />
        <select value={moduleFilter} onChange={(e) => setModuleFilter(e.target.value)} className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-2 text-sm">
          <option value="all">All modules</option>
          {modules.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
        <span className="text-xs text-[var(--text-muted)]">{rows.length} of {auditLogs.length} entries</span>
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={History} title="No matching audit entries" description="Try clearing your search or module filter." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-1)]">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-[var(--border-hairline)] text-left text-xs text-[var(--text-muted)]">
                <th className="px-4 py-2 font-medium">When</th>
                <th className="px-4 py-2 font-medium">User</th>
                <th className="px-4 py-2 font-medium">Module</th>
                <th className="px-4 py-2 font-medium">Action</th>
                <th className="px-4 py-2 font-medium">Description</th>
                <th className="px-4 py-2 font-medium">Change</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((l) => (
                <tr key={l.id} className="border-b border-[var(--gridline)] last:border-0 align-top">
                  <td className="tabular px-4 py-2.5 whitespace-nowrap text-[var(--text-secondary)]">{formatDate(l.createdAt)}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap text-[var(--text-primary)]">{l.userName}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap text-[var(--text-secondary)]">{l.module}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap capitalize text-[var(--text-secondary)]">{l.action}</td>
                  <td className="px-4 py-2.5 text-[var(--text-secondary)]">{l.description}</td>
                  <td className="px-4 py-2.5 text-xs whitespace-nowrap text-[var(--text-muted)]">
                    {l.previousValue || l.newValue ? (
                      <span>
                        {l.previousValue && <span className="line-through">{l.previousValue}</span>}
                        {l.previousValue && l.newValue && " → "}
                        {l.newValue && <span className="text-[var(--text-secondary)]">{l.newValue}</span>}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
