"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Users } from "lucide-react";
import { useHris } from "@/lib/store";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { branchName, departmentName, fullName, positionTitle } from "@/lib/helpers";
import type { Employee } from "@/lib/types";

export default function OrgChartPage() {
  const { employees } = useHris();
  const active = employees.filter((e) => e.status === "active" || e.status === "on_leave");

  const childrenOf = new Map<string | null, Employee[]>();
  active.forEach((e) => {
    const key = e.supervisorId;
    const list = childrenOf.get(key) ?? [];
    list.push(e);
    childrenOf.set(key, list);
  });
  childrenOf.forEach((list) => list.sort((a, b) => fullName(a).localeCompare(fullName(b))));
  const roots = childrenOf.get(null) ?? [];

  return (
    <div>
      <PageHeader
        title="Organization Chart"
        subtitle="Derived automatically from each employee's reporting line (Employee Directory) — expand a node to see their direct reports."
      />
      {roots.length === 0 ? (
        <EmptyState icon={Users} title="No reporting lines found" description="Assign supervisors in the Employee Directory to build the org chart." />
      ) : (
        <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-1)] p-4">
          {roots.map((r) => (
            <OrgNode key={r.id} employee={r} childrenOf={childrenOf} depth={0} />
          ))}
        </div>
      )}
    </div>
  );
}

function OrgNode({ employee, childrenOf, depth }: { employee: Employee; childrenOf: Map<string | null, Employee[]>; depth: number }) {
  const reports = childrenOf.get(employee.id) ?? [];
  const [open, setOpen] = useState(depth < 1);

  return (
    <div style={{ marginLeft: depth * 20 }}>
      <div className="flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-[var(--gridline)]/30">
        {reports.length > 0 ? (
          <button onClick={() => setOpen((v) => !v)} className="shrink-0 text-[var(--text-muted)]" aria-label={open ? "Collapse" : "Expand"}>
            {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </button>
        ) : (
          <span className="inline-block w-4" />
        )}
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-xs font-semibold text-[var(--on-accent)]">
          {employee.firstName[0]}
          {employee.lastName[0]}
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-[var(--text-primary)]">{fullName(employee)}</div>
          <div className="truncate text-xs text-[var(--text-secondary)]">
            {positionTitle(employee.positionId)} · {departmentName(employee.departmentId)} · {branchName(employee.branchId)}
          </div>
        </div>
        {reports.length > 0 && (
          <span className="ml-auto shrink-0 text-xs text-[var(--text-muted)]">
            {reports.length} report{reports.length === 1 ? "" : "s"}
          </span>
        )}
      </div>
      {open && reports.map((c) => <OrgNode key={c.id} employee={c} childrenOf={childrenOf} depth={depth + 1} />)}
    </div>
  );
}
