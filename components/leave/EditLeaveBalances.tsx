"use client";

import { useState } from "react";
import { Loader2, Save } from "lucide-react";
import { useHris } from "@/lib/store";
import { Modal } from "@/components/Modal";
import { formatDate, fullName } from "@/lib/helpers";
import { creditPeriodOf, creditsPerPeriod, isSemiannual, paidLeaveEligibleFrom, usedInPeriod } from "@/lib/leave-policy";
import type { Employee, LeaveType } from "@/lib/types";

// HR sets an employee's leave balance for a period: the new balance is saved
// as an adjustment to that period's credits (leave_credit_adjustments, phase
// 39), so leave filed later still comes off it.

const fmt = (n: number) => String(Math.round(n * 100) / 100);

interface PeriodRow {
  lt: LeaveType;
  key: string;
  label: string;
  base: number;
  adj: number;
  note: string;
  used: number;
  balance: number;
  locked: string | null; // not yet entitled (under 1 year of service), from this date
}

export function EditLeaveBalancesModal({ employee, types, today, onClose }: { employee: Employee; types: LeaveType[]; today: string; onClose: () => void }) {
  const { leaveRequests, leaveCreditAdjustments, saveLeaveCreditAdjustments, currentEmployee } = useHris();
  const year = today.slice(0, 4);
  const rows: PeriodRow[] = types.flatMap((lt) => {
    const dates = isSemiannual(lt.id) ? [`${year}-03-01`, `${year}-09-01`] : [today];
    return dates.map((d) => {
      const p = creditPeriodOf(lt.id, d);
      const a = leaveCreditAdjustments.find((x) => x.employeeId === employee.id && x.leaveTypeId === lt.id && x.periodKey === p.key);
      const base = creditsPerPeriod(lt);
      const adj = a?.days ?? 0;
      const used = usedInPeriod(leaveRequests, employee.id, lt.id, p.key);
      const from = paidLeaveEligibleFrom(employee.id, lt.id);
      const locked = from && d < from ? from : null;
      return { lt, key: p.key, label: p.label, base, adj, note: a?.note ?? "", used, balance: locked ? 0 : Math.max(base + adj - used, 0), locked };
    });
  });
  const id = (r: PeriodRow) => `${r.lt.id}|${r.key}`;
  const [values, setValues] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const changed = rows.filter((r) => {
    const v = values[id(r)];
    return v !== undefined && v.trim() !== "" && Number.isFinite(Number(v)) && Math.abs(Number(v) - r.balance) > 1e-9;
  });
  const invalid = rows.some((r) => {
    const v = values[id(r)];
    return v !== undefined && v.trim() !== "" && (!Number.isFinite(Number(v)) || Number(v) < 0 || Number(v) > 400);
  });

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await saveLeaveCreditAdjustments(
        changed.map((r) => {
          const nb = Number(values[id(r)]);
          return {
            employeeId: employee.id,
            leaveTypeId: r.lt.id,
            periodKey: r.key,
            // credits + adjustment − used = the new balance
            days: Math.round((nb + r.used - r.base) * 100) / 100,
            note: `${note.trim() || "Edited by HR"}: balance set to ${fmt(nb)} (${r.label})`,
          };
        }),
        currentEmployee?.id ?? null,
      );
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save.");
    } finally {
      setBusy(false);
    }
  }

  const cell = "px-2 py-1.5 text-center tabular-nums";
  return (
    <Modal open wide onClose={() => !busy && onClose()} title={`Edit leave balances — ${fullName(employee)}`}>
      <div className="space-y-3 text-sm">
        <p className="text-xs text-[var(--text-secondary)]">
          Type the correct <b>balance</b> (days left) for a period; leave it blank to keep it. Leave filed (approved or pending) still comes off it. Vacation and Sick Leave are per half-year.
        </p>
        <div className="overflow-x-auto rounded-lg border border-[var(--border-hairline)]">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-[var(--border-hairline)] text-xs text-[var(--text-muted)]">
                <th className="px-2 py-2 text-left font-medium">Leave</th>
                <th className="px-2 py-2 text-left font-medium">Period</th>
                <th className="px-2 py-2 font-medium">Credits</th>
                <th className="px-2 py-2 font-medium">Used</th>
                <th className="px-2 py-2 font-medium">Balance now</th>
                <th className="px-2 py-2 font-medium">New balance</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={id(r)} className={`border-b border-[var(--gridline)] last:border-0 ${i > 0 && rows[i - 1].lt.id !== r.lt.id ? "border-t border-[var(--border-hairline)]" : ""}`}>
                  <td className="px-2 py-1.5 font-medium text-[var(--text-primary)]">{rows[i - 1]?.lt.id === r.lt.id ? "" : r.lt.name}</td>
                  <td className="px-2 py-1.5 text-[var(--text-secondary)]">{r.label}</td>
                  <td className={cell} title={r.adj ? `${fmt(r.base)} standard ${r.adj > 0 ? "+" : "−"} ${fmt(Math.abs(r.adj))} adjusted${r.note ? ` — ${r.note}` : ""}` : `${fmt(r.base)} standard`}>
                    {r.locked ? "0" : fmt(r.base + r.adj)}
                    {r.adj !== 0 && !r.locked && <span className="ml-0.5 text-amber-500">*</span>}
                  </td>
                  <td className={cell}>{fmt(r.used)}</td>
                  <td className={`${cell} font-semibold text-[var(--text-primary)]`}>{fmt(r.balance)}</td>
                  <td className="px-2 py-1">
                    {r.locked ? (
                      <span className="text-[11px] text-[var(--text-muted)]">Under 1 yr — paid from {formatDate(r.locked)}</span>
                    ) : (
                      <input
                        value={values[id(r)] ?? ""}
                        onChange={(ev) => setValues((v) => ({ ...v, [id(r)]: ev.target.value }))}
                        inputMode="decimal"
                        placeholder={fmt(r.balance)}
                        aria-label={`New ${r.lt.name} balance, ${r.label}`}
                        className="w-24 rounded border border-[var(--border-hairline)] bg-[var(--surface-1)] px-2 py-1 text-center text-sm"
                      />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-[var(--text-muted)]">* adjusted by HR before — hover the credits to see why.</p>
        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Reason (optional)</label>
          <input value={note} onChange={(ev) => setNote(ev.target.value)} maxLength={200} placeholder="e.g. Per the leave balance sheet" className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-2 text-sm" />
        </div>
        {invalid && <div className="text-xs text-[var(--status-critical)]">Enter a number of days (0 or more).</div>}
        {error && <div className="text-xs text-[var(--status-critical)]">{error}</div>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} disabled={busy} className="rounded-lg border border-[var(--border-hairline)] px-3 py-1.5 text-sm text-[var(--text-secondary)]">
            Cancel
          </button>
          <button onClick={save} disabled={busy || invalid || !changed.length} className="flex items-center gap-1.5 rounded-lg bg-[var(--series-1)] px-3 py-1.5 text-sm font-medium text-[var(--on-accent)] disabled:opacity-40">
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Save {changed.length ? `${changed.length} change${changed.length === 1 ? "" : "s"}` : ""}
          </button>
        </div>
      </div>
    </Modal>
  );
}
