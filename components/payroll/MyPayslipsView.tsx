"use client";

import { Printer, Wallet } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Modal } from "@/components/Modal";
import { EmptyState } from "@/components/EmptyState";
import { PayslipDocument } from "@/components/payroll/PayslipDocument";
import { summaryToPayrollLine, type PayrollLine } from "@/lib/payroll";
import { formatCurrencyCompact, formatDate } from "@/lib/helpers";
import type { Employee, GeneratedPayslip, PayrollPeriod } from "@/lib/types";

// An employee's own released payslips ("My Payslips") — used for every role,
// including HR, payroll and upper management, who also see All Payslips.

export function PayslipPreviewModal({ preview, onClose }: { preview: { employee: Employee; period: PayrollPeriod; line: PayrollLine } | null; onClose: () => void }) {
  return (
    <Modal open={!!preview} onClose={onClose} title="Payslip preview" wide>
      {preview && (
        <div>
          <div className="mb-3 flex justify-end gap-2 print:hidden">
            <button onClick={() => window.print()} className="flex items-center gap-1.5 rounded-lg border border-[var(--border-hairline)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40">
              <Printer size={14} /> Print / Download PDF
            </button>
          </div>
          <PayslipDocument employee={preview.employee} period={preview.period} line={preview.line} />
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
  const myPayslips = generatedPayslips
    .filter((p) => p.employeeId === emp.id)
    .sort((a, b) => (a.generatedAt < b.generatedAt ? 1 : -1));

  function view(entry: GeneratedPayslip) {
    const period = payrollPeriods.find((p) => p.id === entry.periodId);
    if (!period) return;
    setPreview({ employee: emp, period, line: summaryToPayrollLine(entry.summary) });
  }

  return (
    <div>
      <PageHeader title="My Payslips" subtitle="Payslips released by HR/Payroll for each finalized payroll period." />
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
      <PayslipPreviewModal preview={preview} onClose={() => setPreview(null)} />
    </div>
  );
}
