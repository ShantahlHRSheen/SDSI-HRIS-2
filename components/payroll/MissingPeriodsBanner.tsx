"use client";

import { useState } from "react";
import { CalendarPlus } from "lucide-react";
import { useHris } from "@/lib/store";
import { formatDate } from "@/lib/helpers";
import { TODAY } from "@/lib/mock-data";
import { missingSemiMonthlyPeriods } from "@/lib/payroll-periods";

// Shown to payroll managers when the payroll periods stop before the current
// month: one click adds the missing semi-monthly cut-offs (1–15, 16–end).
export function MissingPeriodsBanner() {
  const { payrollPeriods, addPayrollPeriod } = useHris();
  const [adding, setAdding] = useState(false);
  const missing = missingSemiMonthlyPeriods(payrollPeriods, TODAY);
  if (!missing.length) return null;
  const lastEnd = payrollPeriods.map((p) => p.end).sort().at(-1);

  async function addAll() {
    setAdding(true);
    for (const p of missing) await addPayrollPeriod({ start: p.start, end: p.end, status: "open" });
    setAdding(false);
  }

  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--status-warning)]/40 px-3 py-2.5 text-sm" style={{ background: "color-mix(in srgb, var(--status-warning) 8%, transparent)" }}>
      <span className="text-[var(--text-secondary)]">
        {lastEnd ? <>Payroll periods are only set up until <b className="text-[var(--text-primary)]">{formatDate(lastEnd)}</b>. </> : null}
        Add the {missing.length} missing cut-off{missing.length === 1 ? "" : "s"}: {missing.map((p) => `${formatDate(p.start)} – ${formatDate(p.end)}`).join(", ")}.
      </span>
      <button onClick={addAll} disabled={adding} className="flex shrink-0 items-center gap-1.5 rounded-lg bg-[var(--series-1)] px-3 py-1.5 text-sm font-medium text-[var(--on-accent)] disabled:opacity-50">
        <CalendarPlus size={15} /> {adding ? "Adding…" : `Add ${missing.length} period${missing.length === 1 ? "" : "s"}`}
      </button>
    </div>
  );
}
