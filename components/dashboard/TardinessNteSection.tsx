"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Gavel } from "lucide-react";
import { useHris } from "@/lib/store";
import { Badge } from "@/components/Badge";
import { StatTile } from "@/components/StatTile";
import { branchName, fullName } from "@/lib/helpers";
import { responseBadge } from "@/lib/discipline";
import { monthLabel, nteMonth } from "@/lib/nte-tardiness";
import { todayInManila } from "@/lib/leave-policy";
import type { Employee } from "@/lib/types";

const ORDINALS = ["1st", "2nd", "3rd", "4th", "5th"];

// Executive Dashboard: the tardiness NTEs issued for each month — who got
// one, where each stands (signatures, explanation) and the sanction given.
export function TardinessNteSection({ employees }: { employees: Employee[] }) {
  const { disciplinaryRecords } = useHris();
  const today = todayInManila();
  const visible = useMemo(() => new Set(employees.map((e) => e.id)), [employees]);

  const byMonth = useMemo(() => {
    const out = new Map<string, typeof disciplinaryRecords>();
    for (const r of disciplinaryRecords) {
      if (r.type !== "nte" || !visible.has(r.employeeId)) continue;
      const m = nteMonth(r.description);
      if (m) out.set(m, [...(out.get(m) ?? []), r]);
    }
    return out;
  }, [disciplinaryRecords, visible]);
  const months = [...byMonth.keys()].sort().reverse();
  const [picked, setPicked] = useState<string | null>(null);
  const month = picked && byMonth.has(picked) ? picked : months[0];

  const rows = (month ? (byMonth.get(month) ?? []) : [])
    .map((r) => {
      const d = r.noticeData?.kind === "tardiness" ? r.noticeData : null;
      const nos = disciplinaryRecords.find((x) => x.noticeData?.kind === "sanction" && x.noticeData.nteId === r.id);
      return {
        r,
        employee: employees.find((e) => e.id === r.employeeId),
        daysLate: d?.days.length ?? Number(/late (\d+) days/.exec(r.description)?.[1] ?? 0),
        offense: d?.offense,
        sanction: nos?.noticeData?.kind === "sanction" ? nos.noticeData.sanction : null,
        sanctionReceived: !!nos?.acknowledgedAt,
      };
    })
    .sort((a, b) => b.daysLate - a.daysLate);
  const explained = rows.filter((x) => x.r.explanationSubmittedAt).length;
  const sanctioned = rows.filter((x) => x.sanction).length;

  return (
    <section className="mt-6">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-base font-semibold text-[var(--text-primary)]">
          <Gavel size={16} /> Tardiness NTEs
        </h2>
        <div className="flex items-center gap-3">
          {months.length > 0 && (
            <select
              value={month}
              onChange={(e) => setPicked(e.target.value)}
              className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-2.5 py-1.5 text-xs"
              aria-label="Month of the NTEs"
            >
              {months.map((m) => (
                <option key={m} value={m}>
                  {monthLabel(m)}
                </option>
              ))}
            </select>
          )}
          <Link href="/discipline" className="text-xs text-[var(--series-1)] hover:underline">
            Discipline →
          </Link>
        </div>
      </div>
      {!month ? (
        <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-1)] p-6 text-center text-xs text-[var(--text-muted)]">No tardiness NTEs issued yet.</div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3">
            <StatTile label={`NTEs issued (${monthLabel(month)})`} value={rows.length.toString()} />
            <StatTile label="Explanations submitted" value={`${explained} / ${rows.length}`} />
            <StatTile label="Sanctions issued" value={`${sanctioned} / ${rows.length}`} />
          </div>
          <div className="mt-3 overflow-x-auto rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-1)]">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-[var(--border-hairline)] text-left text-xs text-[var(--text-muted)]">
                  <th className="px-4 py-2 font-medium">Employee</th>
                  <th className="px-4 py-2 font-medium">Days late</th>
                  <th className="px-4 py-2 font-medium">Offense</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium">Sanction</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ r, employee, daysLate, offense, sanction, sanctionReceived }) => {
                  const badge = responseBadge(r, today);
                  return (
                    <tr key={r.id} className="border-b border-[var(--gridline)] last:border-0">
                      <td className="px-4 py-2">
                        <div className="text-[var(--text-primary)]">{employee ? fullName(employee) : r.employeeId}</div>
                        <div className="text-xs text-[var(--text-muted)]">{employee ? branchName(employee.branchId) : ""}</div>
                      </td>
                      <td className="tabular px-4 py-2 text-[var(--text-secondary)]">{daysLate || "—"}</td>
                      <td className="px-4 py-2 text-xs text-[var(--text-secondary)]">{offense ? (ORDINALS[offense - 1] ?? `${offense}th`) : "—"}</td>
                      <td className="px-4 py-2">
                        <Badge tone={badge.tone}>{badge.label}</Badge>
                      </td>
                      <td className="px-4 py-2 text-xs">
                        {sanction ? (
                          <span className="text-[var(--text-primary)]">
                            {sanction}
                            <span className="ml-1 text-[var(--text-muted)]">{sanctionReceived ? "· received" : "· not yet received"}</span>
                          </span>
                        ) : (
                          <span className="text-[var(--text-muted)]">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
