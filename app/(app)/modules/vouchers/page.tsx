"use client";

import { useMemo, useState } from "react";
import { FileCheck2, Printer, Receipt } from "lucide-react";
import { useHris } from "@/lib/store";
import { PageHeader } from "@/components/PageHeader";
import { Modal } from "@/components/Modal";
import { EmptyState } from "@/components/EmptyState";
import { VoucherDocument } from "@/components/payroll/VoucherDocument";
import { computePayrollForPeriod } from "@/lib/payroll";
import { branchName, formatCurrencyCompact, formatDate, fullName } from "@/lib/helpers";
import type { Employee, GeneratedVoucher, PayrollPeriod } from "@/lib/types";

export default function AllowanceVouchersPage() {
  const { employees, payrollPeriods, attendancePeriodRecords, overtimeRequests, payrollLineOverrides, generatedVouchers, addGeneratedVoucher } = useHris();
  const [periodId, setPeriodId] = useState(payrollPeriods[payrollPeriods.length - 1]?.id ?? "");
  const period = payrollPeriods.find((p) => p.id === periodId) ?? payrollPeriods[payrollPeriods.length - 1];
  const [preview, setPreview] = useState<{ employee: Employee; period: PayrollPeriod; amount: number } | null>(null);

  const lines = useMemo(
    () => (period ? computePayrollForPeriod(period, employees, attendancePeriodRecords, overtimeRequests, payrollLineOverrides) : []),
    [period, employees, attendancePeriodRecords, overtimeRequests, payrollLineOverrides],
  );
  const amountByEmployee = new Map(lines.map((l) => [l.employeeId, l.basicSalaryTotal + l.netAllowances]));

  const recipients = employees.filter((e) => (e.employmentStatus === "freelance" || e.employmentStatus === "project_based") && (e.status === "active" || e.status === "on_leave"));

  const generatedForPeriod = new Set(generatedVouchers.filter((v) => v.periodId === period?.id).map((v) => v.employeeId));
  const history = generatedVouchers.slice().sort((a, b) => (a.generatedAt < b.generatedAt ? 1 : -1));

  function generate(emp: Employee) {
    if (!period) return;
    const amount = amountByEmployee.get(emp.id) ?? 0;
    addGeneratedVoucher({ periodId: period.id, employeeId: emp.id, amount });
    setPreview({ employee: emp, period, amount });
  }

  function previewLive(emp: Employee) {
    if (!period) return;
    setPreview({ employee: emp, period, amount: amountByEmployee.get(emp.id) ?? 0 });
  }

  function viewHistorical(entry: GeneratedVoucher) {
    const emp = employees.find((e) => e.id === entry.employeeId);
    const p = payrollPeriods.find((pp) => pp.id === entry.periodId);
    if (!emp || !p) return;
    setPreview({ employee: emp, period: p, amount: entry.amount });
  }

  return (
    <div>
      <PageHeader
        title="Allowance Vouchers"
        subtitle="Generate allowance vouchers for freelance and project-based personnel, computed from finalized payroll records."
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select value={periodId} onChange={(e) => setPeriodId(e.target.value)} className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-2 text-sm">
          {payrollPeriods.map((p) => <option key={p.id} value={p.id}>{formatDate(p.start)} – {formatDate(p.end)}</option>)}
        </select>
      </div>

      {recipients.length === 0 ? (
        <EmptyState icon={Receipt} title="No eligible recipients" description="Freelance and project-based personnel will appear here." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-1)]">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-[var(--border-hairline)] text-left text-xs text-[var(--text-muted)]">
                <th className="px-3 py-2 font-medium">Recipient</th>
                <th className="px-3 py-2 font-medium">Branch</th>
                <th className="px-3 py-2 font-medium">Engagement</th>
                <th className="px-3 py-2 font-medium">Amount</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {recipients.map((emp) => (
                <tr key={emp.id} className="border-b border-[var(--gridline)] last:border-0">
                  <td className="px-3 py-2 font-medium text-[var(--text-primary)]">{fullName(emp)}</td>
                  <td className="px-3 py-2 text-[var(--text-secondary)]">{branchName(emp.branchId)}</td>
                  <td className="px-3 py-2 text-[var(--text-secondary)]">{emp.employmentStatus.replace("_", " ")}</td>
                  <td className="tabular px-3 py-2 text-[var(--text-secondary)]">{formatCurrencyCompact(amountByEmployee.get(emp.id) ?? 0)}</td>
                  <td className="px-3 py-2">{generatedForPeriod.has(emp.id) ? <span className="text-xs text-[var(--status-good)]">Generated</span> : <span className="text-xs text-[var(--text-muted)]">Not generated</span>}</td>
                  <td className="px-3 py-2">
                    <div className="flex gap-1.5">
                      <button onClick={() => previewLive(emp)} className="rounded-lg border border-[var(--border-hairline)] px-2.5 py-1 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40">Preview</button>
                      <button onClick={() => generate(emp)} className="rounded-lg bg-[var(--series-1)] px-2.5 py-1 text-xs font-medium text-[var(--on-accent)]">Generate</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-6 rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-1)] p-4">
        <div className="mb-3 text-sm font-medium text-[var(--text-primary)]">Voucher history</div>
        {history.length === 0 ? (
          <EmptyState icon={FileCheck2} title="No vouchers generated yet" description="Use Generate to create the first voucher and log it here." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-[var(--border-hairline)] text-left text-xs text-[var(--text-muted)]">
                  <th className="px-3 py-2 font-medium">Recipient</th>
                  <th className="px-3 py-2 font-medium">Period</th>
                  <th className="px-3 py-2 font-medium">Amount</th>
                  <th className="px-3 py-2 font-medium">Generated by</th>
                  <th className="px-3 py-2 font-medium">Generated on</th>
                  <th className="px-3 py-2 font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {history.map((entry) => {
                  const emp = employees.find((e) => e.id === entry.employeeId);
                  const p = payrollPeriods.find((pp) => pp.id === entry.periodId);
                  return (
                    <tr key={entry.id} className="border-b border-[var(--gridline)] last:border-0">
                      <td className="px-3 py-2 text-[var(--text-primary)]">{emp ? fullName(emp) : entry.employeeId}</td>
                      <td className="px-3 py-2 text-[var(--text-secondary)]">{p ? `${formatDate(p.start)} – ${formatDate(p.end)}` : entry.periodId}</td>
                      <td className="tabular px-3 py-2 text-[var(--text-secondary)]">{formatCurrencyCompact(entry.amount)}</td>
                      <td className="px-3 py-2 text-[var(--text-secondary)]">{entry.generatedBy}</td>
                      <td className="tabular px-3 py-2 text-[var(--text-secondary)]">{formatDate(entry.generatedAt)}</td>
                      <td className="px-3 py-2">
                        <button onClick={() => viewHistorical(entry)} className="rounded-lg border border-[var(--border-hairline)] px-2.5 py-1 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40">View</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal open={!!preview} onClose={() => setPreview(null)} title="Voucher preview" wide>
        {preview && (
          <div>
            <div className="mb-3 flex justify-end gap-2 print:hidden">
              <button onClick={() => window.print()} className="flex items-center gap-1.5 rounded-lg border border-[var(--border-hairline)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40">
                <Printer size={14} /> Print / Download PDF
              </button>
            </div>
            <VoucherDocument employee={preview.employee} period={preview.period} amount={preview.amount} />
          </div>
        )}
      </Modal>
    </div>
  );
}
