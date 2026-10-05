"use client";

import { useMemo } from "react";
import { Network, User } from "lucide-react";
import { useHris } from "@/lib/store";
import { EmptyState } from "@/components/EmptyState";
import { currentCompany } from "@/lib/companies";
import { departmentName, fullName, positionTitle } from "@/lib/helpers";
import type { Employee } from "@/lib/types";

// Org chart drawn from the 201 files: each active employee under the person
// set as their supervisor. Used for companies without a custom-designed chart.
export function AutoOrgChart() {
  const { employees } = useHris();
  const active = useMemo(() => employees.filter((e) => e.status !== "resigned" && e.status !== "terminated"), [employees]);
  const { roots, childrenOf } = useMemo(() => {
    const ids = new Set(active.map((e) => e.id));
    const childrenOf = new Map<string, Employee[]>();
    const roots: Employee[] = [];
    for (const e of active) {
      if (e.supervisorId && ids.has(e.supervisorId) && e.supervisorId !== e.id) {
        childrenOf.set(e.supervisorId, [...(childrenOf.get(e.supervisorId) ?? []), e]);
      } else roots.push(e);
    }
    const byName = (a: Employee, b: Employee) => fullName(a).localeCompare(fullName(b));
    for (const list of childrenOf.values()) list.sort(byName);
    // People with a team first, then everyone else.
    roots.sort((a, b) => Number(childrenOf.has(b.id)) - Number(childrenOf.has(a.id)) || byName(a, b));
    return { roots, childrenOf };
  }, [active]);

  return (
    <section className="rounded-2xl border border-[var(--border-hairline)] bg-[var(--surface-1)]/40 p-4 sm:p-6">
      <div className="mb-5 text-center">
        <h1 className="text-2xl font-extrabold tracking-wide text-[var(--text-primary)] uppercase sm:text-3xl">{currentCompany().name}</h1>
        <div className="mt-1.5 text-xs tracking-[0.2em] text-[var(--text-muted)] uppercase">Organizational Structure</div>
        <p className="mt-2 text-xs text-[var(--text-muted)]">Drawn from each employee&rsquo;s supervisor in the 201 file.</p>
      </div>
      {active.length === 0 ? (
        <EmptyState icon={Network} title="No employees yet" description="Import the employee roster to see the organization chart." />
      ) : (
        <ul className="space-y-2">
          {roots.map((e) => (
            <Branch key={e.id} employee={e} childrenOf={childrenOf} depth={0} />
          ))}
        </ul>
      )}
    </section>
  );
}

function Branch({ employee, childrenOf, depth }: { employee: Employee; childrenOf: Map<string, Employee[]>; depth: number }) {
  const team = depth < 12 ? (childrenOf.get(employee.id) ?? []) : [];
  return (
    <li>
      <div className="flex items-center gap-3 rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-2">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--series-1)] text-[var(--on-accent)]">
          <User size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-[var(--text-primary)]">{fullName(employee)}</div>
          <div className="truncate text-xs text-[var(--text-muted)]">
            {positionTitle(employee.positionId)} · {departmentName(employee.departmentId)}
          </div>
        </div>
        {team.length > 0 && <span className="shrink-0 text-xs text-[var(--text-muted)]">{team.length} direct</span>}
      </div>
      {team.length > 0 && (
        <ul className="mt-2 ml-4 space-y-2 border-l-2 border-[var(--series-1)]/40 pl-3 sm:ml-6 sm:pl-4">
          {team.map((c) => (
            <Branch key={c.id} employee={c} childrenOf={childrenOf} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}
