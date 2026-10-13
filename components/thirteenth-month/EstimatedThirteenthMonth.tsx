"use client";

import { useCallback, useState } from "react";
import { Printer } from "lucide-react";
import { Modal } from "@/components/Modal";
import { ThirteenthMonthSlip } from "@/components/thirteenth-month/ThirteenthMonthSlip";
import { PrintPage, PrintStack } from "@/components/vouchers/PrintStack";
import { DownloadPdfButton, PdfPage } from "@/components/pdf/DownloadPdfButton";
import { summaryToPayrollLine } from "@/lib/payroll";
import { formatCurrency, formatDate, positionTitle } from "@/lib/helpers";
import { round2, type ThirteenthMonthSlipData } from "@/lib/thirteenth-month";
import { TODAY } from "@/lib/mock-data";
import type { Employee, GeneratedPayslip, PayrollPeriod } from "@/lib/types";

// The employee's estimated 13th month pay for this year (on My Payslips),
// the same way the 13th month sheet computes it: basic pay less lates /
// absences / undertime, from each released payslip of the year (the latest
// copy per pay period), ÷ 12. "View slip" shows it on the 13th month slip
// layout, marked as an estimate.
export function EstimatedThirteenthMonth({ employee, payrollPeriods, payslips }: { employee: Employee; payrollPeriods: PayrollPeriod[]; payslips: GeneratedPayslip[] }) {
  const [open, setOpen] = useState(false);
  const [printing, setPrinting] = useState(false);
  const stopPrinting = useCallback(() => setPrinting(false), []);

  const year = TODAY.slice(0, 4);
  const periodById = new Map(payrollPeriods.map((p) => [p.id, p]));
  const latestPerPeriod = new Map<string, GeneratedPayslip>();
  // `payslips` is oldest first, so the last copy per period wins.
  for (const p of payslips) if (periodById.get(p.periodId)?.start.startsWith(year)) latestPerPeriod.set(p.periodId, p);

  const months = Array.from({ length: 12 }, () => ({ b1: 0, l1: 0, b2: 0, l2: 0 }));
  for (const [periodId, p] of latestPerPeriod) {
    const start = periodById.get(periodId)!.start;
    const m = months[Number(start.slice(5, 7)) - 1];
    const l = summaryToPayrollLine(p.summary);
    const less = l.latesUndertime + l.undertimeDeduction;
    if (Number(start.slice(8, 10)) >= 16) {
      m.b2 += l.basicPay;
      m.l2 += less;
    } else {
      m.b1 += l.basicPay;
      m.l1 += less;
    }
  }
  const slipMonths = months.map((m) => {
    const r = { b1: round2(m.b1), l1: round2(m.l1), b2: round2(m.b2), l2: round2(m.l2) };
    return { ...r, net: round2(r.b1 - r.l1 + r.b2 - r.l2) };
  });
  const grossBasic = round2(slipMonths.reduce((s, m) => s + m.net, 0));
  const estimated = round2(grossBasic / 12);
  const lastCovered = [...latestPerPeriod.keys()].map((id) => periodById.get(id)!.end).sort().pop();
  if (!(estimated > 0) || !lastCovered) return null;

  const slip: ThirteenthMonthSlipData = {
    name: `${employee.firstName} ${employee.lastName}`,
    designation: positionTitle(employee.positionId),
    months: slipMonths,
    grossBasic,
    thirteenthMonth: estimated,
    vlDays: 0,
    dailyRate: 0,
    monetizedVl: 0,
    lastSalary: 0,
    sss: 0,
    philhealth: 0,
    hdmf: 0,
    deductions: 0,
    total: estimated,
  };
  const asOf = formatDate(lastCovered);
  const doc = <ThirteenthMonthSlip row={slip} estimateAsOf={asOf} />;

  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-1)] p-4">
      <div>
        <div className="text-xs text-[var(--text-muted)]">Estimated 13th month pay ({year}, so far)</div>
        <div className="tabular text-2xl font-semibold text-[var(--text-primary)]">{formatCurrency(estimated)}</div>
      </div>
      <div className="min-w-0 flex-1 text-xs text-[var(--text-secondary)]">
        Your basic pay of {formatCurrency(grossBasic)} (less lates, absences and undertime) from {latestPerPeriod.size} released payslip
        {latestPerPeriod.size === 1 ? "" : "s"} up to {asOf}, divided by 12. It grows with each payslip.
        <div className="mt-1 text-[var(--text-muted)]">Estimate only — the final amount is on your 13th month slip once HR releases it.</div>
      </div>
      <button onClick={() => setOpen(true)} className="rounded-lg border border-[var(--border-hairline)] px-2.5 py-1 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40">
        View slip / Download
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title={`Estimated 13th month pay — ${year}`} wide>
        <div>
          <div className="mb-3 flex items-start justify-end gap-2">
            <button onClick={() => setPrinting(true)} className="flex items-center gap-1.5 rounded-lg border border-[var(--border-hairline)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40">
              <Printer size={14} /> Print
            </button>
            <DownloadPdfButton filename={`Estimated-13th-Month-Pay-${year}-as-of-${lastCovered}.pdf`}>
              <PdfPage>{doc}</PdfPage>
            </DownloadPdfButton>
          </div>
          <div className="overflow-x-auto rounded-lg bg-white p-3">
            <div className="min-w-[560px]">{doc}</div>
          </div>
        </div>
      </Modal>
      {printing && (
        <PrintStack onDone={stopPrinting}>
          <PrintPage>{doc}</PrintPage>
        </PrintStack>
      )}
    </div>
  );
}
