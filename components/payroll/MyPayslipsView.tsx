"use client";

import { Printer, Wallet } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Modal } from "@/components/Modal";
import { EmptyState } from "@/components/EmptyState";
import { PayslipDocument } from "@/components/payroll/PayslipDocument";
import { summaryToPayrollLine, type PayrollLine } from "@/lib/payroll";
import { formatCurrency, formatCurrencyCompact, formatDate, fullName } from "@/lib/helpers";
import { TODAY } from "@/lib/mock-data";
import { DownloadPdfButton, PdfPage } from "@/components/pdf/DownloadPdfButton";
import type { Employee, GeneratedPayslip, PayrollPeriod } from "@/lib/types";
import { useHris } from "@/lib/store";
import { MyThirteenthMonthSlips } from "@/components/thirteenth-month/MyThirteenthMonthSlips";
import { MyVoucherSlips } from "@/components/payroll/MyVoucherSlips";

// An employee's own released payslips ("My Payslips") — used for every role,
// including HR, payroll and upper management, who also see All Payslips.

export function PayslipPreviewModal({ preview, onClose }: { preview: { employee: Employee; period: PayrollPeriod; line: PayrollLine } | null; onClose: () => void }) {
  const { salaryAdjustments } = useHris();
  return (
    <Modal open={!!preview} onClose={onClose} title="Payslip preview" wide>
      {preview && (
        <div>
          <div className="mb-3 flex items-start justify-end gap-2 print:hidden">
            <button onClick={() => window.print()} className="flex items-center gap-1.5 rounded-lg border border-[var(--border-hairline)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40">
              <Printer size={14} /> Print
            </button>
            <DownloadPdfButton filename={`Payslip-${fullName(preview.employee).replace(/[^A-Za-z0-9]+/g, "-")}-${preview.period.start}-to-${preview.period.end}.pdf`}>
              <PdfPage form>
                <PayslipDocument employee={preview.employee} period={preview.period} line={preview.line} adjustments={salaryAdjustments} />
              </PdfPage>
            </DownloadPdfButton>
          </div>
          <PayslipDocument employee={preview.employee} period={preview.period} line={preview.line} adjustments={salaryAdjustments} />
        </div>
      )}
    </Modal>
  );
}


export function MyPayslipsView({
  employee,
  payrollPeriods,
  generatedPayslips,
  preview,
  setPreview,
}: {
  employee: Employee | null;
  payrollPeriods: PayrollPeriod[];
  generatedPayslips: GeneratedPayslip[];
  preview: { employee: Employee; period: PayrollPeriod; line: PayrollLine } | null;
  setPreview: (v: { employee: Employee; period: PayrollPeriod; line: PayrollLine } | null) => void;
}) {
  if (!employee) return null;
  const emp = employee;
  // Oldest pay period first (January at the top), whatever order they were released in.
  const periodStart = new Map(payrollPeriods.map((p) => [p.id, p.start]));
  const myPayslips = generatedPayslips
    .filter((p) => p.employeeId === emp.id)
    .sort((a, b) => (periodStart.get(a.periodId) ?? "").localeCompare(periodStart.get(b.periodId) ?? "") || a.generatedAt.localeCompare(b.generatedAt));

  // Estimated 13th month pay for this year, the same way the 13th month sheet
  // computes it: basic pay less lates / absences / undertime, from each
  // released payslip of the year (the latest copy per pay period), ÷ 12.
  const year = TODAY.slice(0, 4);
  const latestPerPeriod = new Map<string, GeneratedPayslip>();
  for (const p of myPayslips) if ((periodStart.get(p.periodId) ?? "").startsWith(year)) latestPerPeriod.set(p.periodId, p);
  const basisThisYear = [...latestPerPeriod.values()].reduce((t, p) => {
    const l = summaryToPayrollLine(p.summary);
    return t + l.basicPay - l.latesUndertime - l.undertimeDeduction;
  }, 0);
  const estimated13th = Math.round((basisThisYear / 12) * 100) / 100;
  const periodEnd = new Map(payrollPeriods.map((p) => [p.id, p.end]));
  const lastCovered = [...latestPerPeriod.keys()].map((id) => periodEnd.get(id) ?? "").sort().pop();

  function view(entry: GeneratedPayslip) {
    const period = payrollPeriods.find((p) => p.id === entry.periodId);
    if (!period) return;
    setPreview({ employee: emp, period, line: summaryToPayrollLine(entry.summary) });
  }

  return (
    <div>
      <PageHeader title="My Payslips" subtitle="Payslips released by HR/Payroll for each finalized payroll period." />
      {estimated13th > 0 && lastCovered && (
        <div className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-1)] p-4">
          <div>
            <div className="text-xs text-[var(--text-muted)]">Estimated 13th month pay ({year}, so far)</div>
            <div className="tabular text-2xl font-semibold text-[var(--text-primary)]">{formatCurrency(estimated13th)}</div>
          </div>
          <div className="min-w-0 flex-1 text-xs text-[var(--text-secondary)]">
            Your basic pay of {formatCurrency(basisThisYear)} (less lates, absences and undertime) from {latestPerPeriod.size} released payslip
            {latestPerPeriod.size === 1 ? "" : "s"} up to {formatDate(lastCovered)}, divided by 12. It grows with each payslip.
            <div className="mt-1 text-[var(--text-muted)]">Estimate only — the final amount is on your 13th month slip once HR releases it.</div>
          </div>
        </div>
      )}
      {myPayslips.length === 0 ? (
        <EmptyState icon={Wallet} title="No payslips released yet" description="Your payslip will appear here once HR/Payroll finalizes and releases a payroll period." />
      ) : (
        <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-1)] p-4">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="border-b border-[var(--border-hairline)] text-left text-xs text-[var(--text-muted)]">
                  <th className="px-3 py-2 font-medium">Period</th>
                  <th className="px-3 py-2 font-medium">Net pay</th>
                  <th className="px-3 py-2 font-medium">Released</th>
                  <th className="px-3 py-2 font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {myPayslips.map((p) => {
                  const period = payrollPeriods.find((pp) => pp.id === p.periodId);
                  return (
                    <tr key={p.id} className="border-b border-[var(--gridline)] last:border-0">
                      <td className="px-3 py-2 text-[var(--text-primary)]">{period ? `${formatDate(period.start)} – ${formatDate(period.end)}` : p.periodId}</td>
                      <td className="tabular px-3 py-2 font-medium text-[var(--text-primary)]">{formatCurrencyCompact(p.summary.netPay)}</td>
                      <td className="tabular px-3 py-2 text-[var(--text-secondary)]">{formatDate(p.generatedAt)}</td>
                      <td className="px-3 py-2">
                        <button onClick={() => view(p)} className="rounded-lg border border-[var(--border-hairline)] px-2.5 py-1 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40">Preview / Download</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <MyVoucherSlips />
      <MyThirteenthMonthSlips />
      <PayslipPreviewModal preview={preview} onClose={() => setPreview(null)} />
    </div>
  );
}
