"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Download, Users } from "lucide-react";
import { useHris } from "@/lib/store";
import { departmentName, formatDate, fullName, positionTitle } from "@/lib/helpers";
import { balanceFor, creditPeriodOf, isSemiannual, paidLeaveEligibleFrom } from "@/lib/leave-policy";
import type { Employee, LeaveType } from "@/lib/types";

// Every active employee's remaining leave for the current period (VL / SL by
// half-year, the rest per year), counting approved and pending requests — the
// same numbers each employee sees on their own Leave Management page. For HR
// and Upper Management.
//
// Vacation and Sick Leave: only the current half-year's credits can be used.
// In Jul–Dec, the unused Jan–Jun days can no longer be used; they are shown
// as going to the year-end 13th month pay.

const fmt = (n: number) => String(Math.round(n * 100) / 100);

// Leave that doesn't apply to the person (maternity for men, paternity for women).
const applies = (e: Employee, lt: LeaveType) => !((lt.id === "lt-ml" && e.gender === "Male") || (lt.id === "lt-pl" && e.gender === "Female"));

export function LeaveBalances({ today }: { today: string }) {
  const { employees, leaveTypes, leaveRequests, leaveCreditAdjustments } = useHris();
  const [open, setOpen] = useState(true);
  const [search, setSearch] = useState("");
  const [dept, setDept] = useState("all");
  const types = useMemo(() => leaveTypes.filter((lt) => lt.id !== "lt-lwop" || lt.defaultCredits > 0), [leaveTypes]);
  const people = useMemo(() => employees.filter((e) => e.status === "active" || e.status === "on_leave").sort((a, b) => fullName(a).localeCompare(fullName(b))), [employees]);
  const departments = useMemo(() => [...new Set(people.map((e) => e.departmentId))].map((id) => ({ id, name: departmentName(id) })).sort((a, b) => a.name.localeCompare(b.name)), [people]);

  const rows = useMemo(
    () =>
      people.map((e) => ({
        e,
        cells: types.map((lt) => {
          if (!applies(e, lt)) return null;
          const b = balanceFor(leaveRequests, e.id, lt, today);
          const from = paidLeaveEligibleFrom(e.id, lt.id);
          // In Jul–Dec: what's left of Jan–Jun (no longer usable).
          const firstHalf = isSemiannual(lt.id) && Number(today.slice(5, 7)) > 6 ? balanceFor(leaveRequests, e.id, lt, `${today.slice(0, 4)}-03-01`) : null;
          return { ...b, notYet: !!from && today < from ? from : null, firstHalf };
        }),
      })),
    // The credit context (date hired, HR's adjustments) is set by the store from these.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [people, types, leaveRequests, today, leaveCreditAdjustments],
  );
  const q = search.trim().toLowerCase();
  const shown = rows.filter(({ e }) => (dept === "all" || e.departmentId === dept) && (!q || [fullName(e), e.employeeNumber, positionTitle(e.positionId)].some((x) => x?.toLowerCase().includes(q))));
  const periodNote = types
    .map((lt) => creditPeriodOf(lt.id, today).label)
    .filter((v, i, a) => a.indexOf(v) === i)
    .join(" / ");

  function exportCsv() {
    const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    const h1 = (lt: LeaveType) => isSemiannual(lt.id) && Number(today.slice(5, 7)) > 6;
    const head = [
      "Employee No.",
      "Name",
      "Department",
      "Position",
      ...types.flatMap((lt) => [
        `${lt.name} — ${isSemiannual(lt.id) ? "usable now" : "remaining"}`,
        `${lt.name} — credits`,
        ...(h1(lt) ? [`${lt.name} — Jan–Jun unused (13th month)`] : []),
      ]),
    ];
    const lines = shown.map(({ e, cells }) => [
      e.employeeNumber,
      fullName(e),
      departmentName(e.departmentId),
      positionTitle(e.positionId),
      ...cells.flatMap((c, i) => [...(c ? [fmt(c.remaining), fmt(c.credits)] : ["", ""]), ...(h1(types[i]) ? [c?.firstHalf ? fmt(c.firstHalf.remaining) : ""] : [])]),
    ]);
    const csv = [head, ...lines].map((r) => r.map((v) => esc(String(v ?? ""))).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `Leave balances ${today}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="mb-4 rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-1)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button type="button" onClick={() => setOpen((v) => !v)} className="flex items-center gap-2 text-sm font-medium text-[var(--text-primary)]" aria-expanded={open}>
          {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          <Users size={16} className="text-[var(--series-1)]" /> All employees&rsquo; leave balances ({people.length})
        </button>
        {open && (
          <div className="flex flex-wrap items-center gap-2">
            <select value={dept} onChange={(e) => setDept(e.target.value)} className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-2.5 py-1.5 text-xs" aria-label="Department">
              <option value="all">All departments</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search employee…" className="w-48 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-1.5 text-xs" />
            <button onClick={exportCsv} className="flex items-center gap-1.5 rounded-lg border border-[var(--border-hairline)] px-2.5 py-1.5 text-xs text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40">
              <Download size={13} /> Excel (CSV)
            </button>
          </div>
        )}
      </div>
      {open && (
        <>
          <p className="mt-1 mb-3 text-xs text-[var(--text-muted)]">
            Remaining days for {periodNote}, counting approved and pending leave. <b className="text-[var(--text-secondary)]">Vacation and Sick Leave:</b>{" "}only the current half-year&rsquo;s balance can be used
            {Number(today.slice(5, 7)) > 6 && <> — the unused Jan–Jun days can no longer be used and go to the 13th month pay</>}. With pay after 1 year of service.
          </p>
          <div className="max-h-[520px] overflow-auto rounded-lg border border-[var(--border-hairline)]">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="sticky top-0 z-10 bg-[var(--surface-1)]">
                <tr className="border-b border-[var(--border-hairline)] text-left text-xs text-[var(--text-muted)]">
                  <th className="sticky left-0 bg-[var(--surface-1)] px-3 py-2 font-medium">Employee</th>
                  {types.map((lt) => (
                    <th key={lt.id} className="px-3 py-2 text-center font-medium whitespace-nowrap">
                      {lt.name.replace(/ Leave$/, "")}
                      {isSemiannual(lt.id) && <div className="text-[10px] font-normal text-[var(--series-1)]">usable now</div>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shown.map(({ e, cells }) => (
                  <tr key={e.id} className="border-b border-[var(--gridline)] last:border-0">
                    <td className="sticky left-0 bg-[var(--surface-1)] px-3 py-1.5">
                      <div className="font-medium text-[var(--text-primary)]">{fullName(e)}</div>
                      <div className="text-[11px] text-[var(--text-muted)]">
                        {departmentName(e.departmentId)} · {positionTitle(e.positionId)}
                      </div>
                    </td>
                    {cells.map((c, i) => (
                      <td key={types[i].id} className="px-3 py-1.5 text-center tabular-nums">
                        {!c ? (
                          <span className="text-[var(--text-muted)]">—</span>
                        ) : c.notYet ? (
                          <span className="text-xs text-[var(--text-muted)]" title={`With pay from ${formatDate(c.notYet)}`}>
                            from {formatDate(c.notYet)}
                          </span>
                        ) : (
                          <div>
                            <span title={`${fmt(c.used)} used of ${fmt(c.credits)} (${c.period.label})`}>
                              <b className={c.remaining <= 0 ? "text-[var(--status-critical)]" : "text-[var(--text-primary)]"}>{fmt(c.remaining)}</b>
                              <span className="text-xs text-[var(--text-muted)]"> / {fmt(c.credits)}</span>
                            </span>
                            {c.firstHalf && c.firstHalf.credits > 0 && (
                              <div className="text-[10px] whitespace-nowrap text-[var(--text-muted)]" title={`Jan–Jun: ${fmt(c.firstHalf.used)} used of ${fmt(c.firstHalf.credits)}. Unused days can't be used now; they go to the 13th month pay.`}>
                                Jan–Jun {fmt(c.firstHalf.remaining)} → 13th mo.
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
                {!shown.length && (
                  <tr>
                    <td colSpan={types.length + 1} className="px-3 py-6 text-center text-sm text-[var(--text-muted)]">
                      No matching employees.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
