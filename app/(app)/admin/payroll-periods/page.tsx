"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { useHris } from "@/lib/store";
import { Badge, type BadgeTone } from "@/components/Badge";
import { Modal } from "@/components/Modal";
import { formatDate } from "@/lib/helpers";
import type { PayrollPeriodStatus } from "@/lib/types";

const STATUS_TONE: Record<PayrollPeriodStatus, BadgeTone> = {
  open: "good",
  locked: "warning",
  closed: "muted",
};

export default function PayrollPeriodsAdminPage() {
  const { payrollPeriods, setPayrollPeriodStatus, addPayrollPeriod } = useHris();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ start: "", end: "" });

  function submit() {
    if (!form.start || !form.end) return;
    addPayrollPeriod({ start: form.start, end: form.end, status: "open" });
    setOpen(false);
    setForm({ start: "", end: "" });
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <div className="text-sm font-medium text-[var(--text-primary)]">Payroll Periods</div>
          <div className="text-xs text-[var(--text-muted)]">Open periods accept attendance/leave/OT data; locking freezes computation; closing finalizes the period after payslip release.</div>
        </div>
        <button onClick={() => setOpen(true)} className="flex items-center gap-1.5 rounded-lg bg-[var(--series-1)] px-3 py-1.5 text-xs font-medium text-[var(--on-accent)]">
          <Plus size={14} /> Add period
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-1)]">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b border-[var(--border-hairline)] text-left text-xs text-[var(--text-muted)]">
              <th className="px-4 py-2 font-medium">Period</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {payrollPeriods.map((p) => (
              <tr key={p.id} className="border-b border-[var(--gridline)] last:border-0">
                <td className="tabular px-4 py-2.5 text-[var(--text-primary)]">{formatDate(p.start)} – {formatDate(p.end)}</td>
                <td className="px-4 py-2.5"><Badge tone={STATUS_TONE[p.status]}>{p.status}</Badge></td>
                <td className="px-4 py-2.5">
                  <div className="flex gap-2">
                    {p.status === "open" && (
                      <button onClick={() => setPayrollPeriodStatus(p.id, "locked")} className="rounded-lg border border-[var(--border-hairline)] px-2.5 py-1 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40">Lock</button>
                    )}
                    {p.status === "locked" && (
                      <>
                        <button onClick={() => setPayrollPeriodStatus(p.id, "open")} className="rounded-lg border border-[var(--border-hairline)] px-2.5 py-1 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40">Unlock</button>
                        <button onClick={() => setPayrollPeriodStatus(p.id, "closed")} className="rounded-lg border border-[var(--border-hairline)] px-2.5 py-1 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40">Close</button>
                      </>
                    )}
                    {p.status === "closed" && <span className="text-xs text-[var(--text-muted)]">Finalized</span>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Add payroll period">
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Start date</label>
            <input type="date" value={form.start} onChange={(e) => setForm((f) => ({ ...f, start: e.target.value }))} className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">End date</label>
            <input type="date" value={form.end} onChange={(e) => setForm((f) => ({ ...f, end: e.target.value }))} className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-2 text-sm" />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={() => setOpen(false)} className="rounded-lg px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40">Cancel</button>
            <button onClick={submit} className="rounded-lg bg-[var(--series-1)] px-3 py-1.5 text-sm font-medium text-[var(--on-accent)]">Add period</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
