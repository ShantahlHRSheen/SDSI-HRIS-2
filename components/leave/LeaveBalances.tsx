"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Download, Pencil, Users } from "lucide-react";
import { EditLeaveBalancesModal } from "./EditLeaveBalances";
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
// In Jul–Dec, the unused Jan–Jun days can no longer be used; unused Vacation
// Leave goes to the year-end 13th month pay (Sick Leave doesn't).

const fmt = (n: number) => String(Math.round(n * 100) / 100);

// Leave that doesn't apply to the person (maternity for men, paternity for women).
const applies = (e: Employee, lt: LeaveType) => !((lt.id === "lt-ml" && e.gender === "Male") || (lt.id === "lt-pl" && e.gender === "Female"));

export function LeaveBalances({ today }: { today: string }) {
  const { employees, leaveTypes, leaveRequests, leaveCreditAdjustments, currentUser } = useHris();
  // HR edits balances (the HR Manager only, by RLS); Upper Management views.
  const canEdit = !!currentUser?.roles.includes("hr_admin");
  const [editing, setEditing] = useState<Employee | null>(null);
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
          const y = today.slice(0, 4);
          // VL / SL: the whole year (Jan–Jun + Jul–Dec) as the total balance.
          const h1 = isSemiannual(lt.id) ? balanceFor(leaveRequests, e.id, lt, `${y}-03-01`) : null;
          const h2 = isSemiannual(lt.id) ? balanceFor(leaveRequests, e.id, lt, `${y}-09-01`) : null;
          const total = h1 && h2 ? { remaining: h1.remaining + h2.remaining, credits: h1.credits + h2.credits, used: h1.used + h2.used } : null;
          // In Jul–Dec: what's left of Jan–Jun VL (no longer usable; to the 13th month).
          const firstHalf = lt.id === "lt-vl" && Number(today.slice(5, 7)) > 6 ? h1 : null;
          return { ...b, notYet: !!from && today < from ? from : null, firstHalf, total };
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
    const h1 = (lt: LeaveType) => lt.id === "lt-vl" && Number(today.slice(5, 7)) > 6;
    const head = [
      "Employee No.",
      "Name",
      "Department",
      "Position",
      ...types.flatMap((lt) =>
        isSemiannual(lt.id)
          ? [`${lt.name} — total balance`, `${lt.name} — total credits`, `${lt.name} — usable now`, `${lt.name} — usable credits`, ...(h1(lt) ? [`${lt.name} — Jan–Jun unused (13th month)`] : [])]
          : [`${lt.name} — remaining`, `${lt.name} — credits`],
      ),
    ];
    const lines = shown.map(({ e, cells }) => [
      e.employeeNumber,
      fullName(e),
      departmentName(e.departmentId),
      positionTitle(e.positionId),
      ...cells.flatMap((c, i) =>
        isSemiannual(types[i].id)
          ? [...(c?.total ? [fmt(c.total.remaining), fmt(c.total.credits)] : ["", ""]), ...(c ? [fmt(c.remaining), fmt(c.credits)] : ["", ""]), ...(h1(types[i]) ? [c?.firstHalf ? fmt(c.firstHalf.remaining) : ""] : [])]
          : c
            ? [fmt(c.remaining), fmt(c.credits)]
            : ["", ""],
      ),
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
            {Number(today.slice(5, 7)) > 6 && <> — the unused Jan–Jun days can no longer be used; unused Jan–Jun Vacation Leave goes to the 13th month pay</>}. Paid Vacation and Sick Leave start after 1 year of service; until then the balance is 0.{canEdit && <> Click the pencil beside a name to edit their balances.</>}
          </p>
          <div className="max-h-[520px] overflow-auto rounded-lg border border-[var(--border-hairline)]">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="sticky top-0 z-10 bg-[var(--surface-1)]">
                <tr className="text-left text-xs text-[var(--text-muted)]">
                  <th rowSpan={2} className="sticky left-0 border-b border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-2 font-medium">
                    Employee
                  </th>
                  {types.map((lt) => (
                    <th
                      key={lt.id}
                      rowSpan={isSemiannual(lt.id) ? 1 : 2}
                      colSpan={isSemiannual(lt.id) ? 2 : 1}
                      className={`px-3 pt-2 text-center font-medium whitespace-nowrap ${isSemiannual(lt.id) ? "border-x border-[var(--border-hairline)] pb-1 text-[var(--text-secondary)]" : "border-b border-[var(--border-hairline)] pb-2"}`}
                    >
                      {lt.name.replace(/ Leave$/, "")}
                    </th>
                  ))}
                </tr>
                <tr className="border-b border-[var(--border-hairline)] text-[10px] text-[var(--text-muted)]">
                  {types
                    .filter((lt) => isSemiannual(lt.id))
                    .flatMap((lt) => [
                      <th key={`${lt.id}-t`} className="border-l border-[var(--border-hairline)] px-2 pb-1.5 text-center font-normal whitespace-nowrap">
                        Total balance {today.slice(0, 4)}
                      </th>,
                      <th key={`${lt.id}-u`} className="border-r border-[var(--border-hairline)] px-2 pb-1.5 text-center font-semibold whitespace-nowrap text-[var(--series-1)]">
                        Usable now ({creditPeriodOf(lt.id, today).label.slice(0, 7)})
                      </th>,
                    ])}
                </tr>
              </thead>
              <tbody>
                {shown.map(({ e, cells }) => (
                  <tr key={e.id} className="border-b border-[var(--gridline)] last:border-0">
                    <td className="sticky left-0 min-w-[220px] bg-[var(--surface-1)] px-3 py-1.5">
                      <div className="flex items-center gap-1.5 font-medium text-[var(--text-primary)]">
                        {fullName(e)}
                        {canEdit && (
                          <button onClick={() => setEditing(e)} className="rounded p-0.5 text-[var(--text-muted)] hover:bg-[var(--gridline)]/50 hover:text-[var(--series-1)]" aria-label={`Edit ${fullName(e)}'s leave balances`} title="Edit leave balances">
                            <Pencil size={12} />
                          </button>
                        )}
                      </div>
                      <div className="text-[11px] text-[var(--text-muted)]">
                        {departmentName(e.departmentId)} · {positionTitle(e.positionId)}
                      </div>
                    </td>
                    {cells.flatMap((c, i) => {
                      const lt = types[i];
                      const semi = isSemiannual(lt.id);
                      const cls = "px-3 py-1.5 text-center whitespace-nowrap tabular-nums";
                      if (!c) return semi ? [<td key={`${lt.id}-t`} className={`${cls} border-l border-[var(--gridline)] text-[var(--text-muted)]`}>—</td>, <td key={`${lt.id}-u`} className={`${cls} border-r border-[var(--gridline)] text-[var(--text-muted)]`}>—</td>] : [<td key={lt.id} className={`${cls} text-[var(--text-muted)]`}>—</td>];
                      if (c.notYet) {
                        const zero = (
                          <div title={`No paid ${lt.name} yet: with pay after 1 year of service, from ${formatDate(c.notYet)}.`}>
                            <b className="text-[var(--text-muted)]">0</b>
                            <span className="text-xs text-[var(--text-muted)]"> / 0</span>
                            <div className="text-[10px] whitespace-nowrap text-[var(--text-muted)]">under 1 yr of service</div>
                          </div>
                        );
                        return semi
                          ? [<td key={`${lt.id}-t`} className={`${cls} border-l border-[var(--gridline)]`}>{zero}</td>, <td key={`${lt.id}-u`} className={`${cls} border-r border-[var(--gridline)]`}>{zero}</td>]
                          : [<td key={lt.id} className={cls}>{zero}</td>];
                      }
                      const num = (remaining: number, credits: number, title: string, strong: boolean) => (
                        <span title={title}>
                          <b className={remaining <= 0 ? "text-[var(--status-critical)]" : strong ? "text-[var(--text-primary)]" : "text-[var(--text-secondary)]"}>{fmt(remaining)}</b>
                          <span className="text-xs text-[var(--text-muted)]"> / {fmt(credits)}</span>
                        </span>
                      );
                      const usable = num(c.remaining, c.credits, `${fmt(c.used)} used of ${fmt(c.credits)} (${c.period.label})`, true);
                      if (!semi || !c.total) return [<td key={lt.id} className={cls}>{usable}</td>];
                      return [
                        <td key={`${lt.id}-t`} className={`${cls} border-l border-[var(--gridline)]`}>
                          {num(c.total.remaining, c.total.credits, `${fmt(c.total.used)} used of ${fmt(c.total.credits)} in ${today.slice(0, 4)} (Jan–Jun + Jul–Dec)`, false)}
                          {c.firstHalf && c.firstHalf.credits > 0 && (
                            <div className="text-[10px] whitespace-nowrap text-[var(--text-muted)]" title={`Jan–Jun: ${fmt(c.firstHalf.used)} used of ${fmt(c.firstHalf.credits)}. Unused days can't be used now; they go to the 13th month pay.`}>
                              Jan–Jun {fmt(c.firstHalf.remaining)} → 13th mo.
                            </div>
                          )}
                        </td>,
                        <td key={`${lt.id}-u`} className={`${cls} border-r border-[var(--gridline)] bg-[var(--series-1)]/5`}>
                          {usable}
                        </td>,
                      ];
                    })}
                  </tr>
                ))}
                {!shown.length && (
                  <tr>
                    <td colSpan={types.length + types.filter((lt) => isSemiannual(lt.id)).length + 1} className="px-3 py-6 text-center text-sm text-[var(--text-muted)]">
                      No matching employees.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
      {editing && <EditLeaveBalancesModal employee={editing} types={types.filter((lt) => applies(editing, lt))} today={today} onClose={() => setEditing(null)} />}
    </div>
  );
}
