"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Printer, Receipt } from "lucide-react";
import { useHris } from "@/lib/store";
import { Modal } from "@/components/Modal";
import { FormAmountRow, FormFootnote, FormRow, FormSection, FormShell } from "@/components/bir/FormLayout";
import { DownloadPdfButton, PdfPage } from "@/components/pdf/DownloadPdfButton";
import { PrintPage, PrintStack } from "@/components/vouchers/PrintStack";
import { PAYSLIP_SIGNATORIES } from "@/components/payroll/PayslipDocument";
import { COMPANY_INFO } from "@/lib/bir";
import { branchName, departmentName, formatCurrency, formatDate, fullName, positionTitle } from "@/lib/helpers";
import { fetchMyVoucherLines, type MyVoucherLine } from "@/lib/supabase/voucher-slips";
import type { Employee } from "@/lib/types";

// One payroll period's voucher payments to a payee (all departments).
export interface VoucherSlip {
  periodId: string;
  periodStart: string;
  periodEnd: string;
  voucherDate: string;
  lines: MyVoucherLine[];
  total: number;
}

function groupSlips(lines: MyVoucherLine[]): VoucherSlip[] {
  const byPeriod = new Map<string, VoucherSlip>();
  for (const l of lines) {
    const slip = byPeriod.get(l.periodId) ?? { periodId: l.periodId, periodStart: l.periodStart, periodEnd: l.periodEnd, voucherDate: l.voucherDate ?? l.periodEnd, lines: [], total: 0 };
    slip.lines.push(l);
    slip.total = Math.round((slip.total + l.amount) * 100) / 100;
    byPeriod.set(l.periodId, slip);
  }
  return [...byPeriod.values()].sort((a, b) => a.periodStart.localeCompare(b.periodStart));
}

// `employee` is missing for a payee not in the 201 file — then only the name shows.
export function VoucherSlipDocument({ employee, payeeName, slip }: { employee?: Employee; payeeName?: string; slip: VoucherSlip }) {
  return (
    <FormShell>
      <div className="payslip-compact">
        <div className="mb-5 border-b-2 border-[#0b0b0b] pb-3">
          <div className="text-sm font-bold uppercase">{COMPANY_INFO.name}</div>
          <div className="text-xs text-[#52514e]">{COMPANY_INFO.address}</div>
          <div className="text-xs text-[#52514e]">{COMPANY_INFO.phone}</div>
          <div className="text-xs text-[#52514e]">{COMPANY_INFO.email}</div>
          <h1 className="mt-3 text-lg font-bold">Voucher Payslip</h1>
          <div className="text-xs text-[#52514e]">
            Pay period: {formatDate(slip.periodStart)} – {formatDate(slip.periodEnd)} · Voucher date: {formatDate(slip.voucherDate)}
          </div>
        </div>

        <FormSection title="Payee Information">
          {employee ? (
            <>
              <FormRow label="Employee ID" value={employee.employeeNumber} mono />
              <FormRow label="Name" value={fullName(employee)} />
              <FormRow label="Position" value={positionTitle(employee.positionId)} />
              <FormRow label="Branch / Department" value={`${branchName(employee.branchId)} / ${departmentName(employee.departmentId)}`} />
            </>
          ) : (
            <FormRow label="Name" value={payeeName ?? ""} />
          )}
        </FormSection>

        <FormSection title="Voucher Payments">
          {slip.lines.map((l) => (
            <FormAmountRow key={l.lineId} label={`${l.description || "Payment"} — ${l.departmentName.replace(/\s+Department$/i, "")} voucher`} value={l.amount} />
          ))}
        </FormSection>

        <FormSection title="Total">
          <FormAmountRow label="Total Amount Received" value={slip.total} bold />
        </FormSection>

        <div className="mt-8 grid grid-cols-3 gap-4 text-center text-xs break-inside-avoid">
          {PAYSLIP_SIGNATORIES.map((p) => (
            <div key={p.role}>
              <div className="text-left text-[11px] text-[#52514e]">{p.role}:</div>
              <div className="mt-1 font-semibold">{p.name}</div>
              <div className="text-[11px] text-[#52514e]">{p.title}</div>
            </div>
          ))}
        </div>

        <FormFootnote>
          Paid through the department voucher(s) for this pay period. For verification: contact SDSI HR Department thru {COMPANY_INFO.email} or {COMPANY_INFO.phone}.
        </FormFootnote>
      </div>
    </FormShell>
  );
}

// "Voucher payslips" on My Payslips: the employee's own voucher payments,
// one slip per pay period, once the period is locked / the voucher released.
export function MyVoucherSlips() {
  const { isRealAccount, currentEmployee } = useHris();
  const [lines, setLines] = useState<MyVoucherLine[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);
  const [printing, setPrinting] = useState(false);
  const stopPrinting = useCallback(() => setPrinting(false), []);

  useEffect(() => {
    if (!isRealAccount || !currentEmployee) return;
    let live = true;
    fetchMyVoucherLines()
      .then((l) => live && setLines(l))
      .catch((e: Error) => {
        // Before the database update runs there's simply nothing to show.
        if (live && !/my_voucher_slips/.test(e.message)) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [isRealAccount, currentEmployee]);

  const slips = useMemo(() => groupSlips(lines), [lines]);
  const open = slips.find((s) => s.periodId === viewing) ?? null;
  if (!currentEmployee || (!slips.length && !error)) return null;
  const emp = currentEmployee;

  return (
    <div className="mt-6">
      <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
        <Receipt size={16} className="text-[var(--series-1)]" /> Voucher Payslips
      </h2>
      <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-1)] p-4">
        {error ? (
          <div className="text-sm text-[var(--status-critical)]">Couldn&rsquo;t load your voucher payslips: {error}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-[var(--border-hairline)] text-left text-xs text-[var(--text-muted)]">
                  <th className="px-3 py-2 font-medium">Pay period</th>
                  <th className="px-3 py-2 font-medium">Description</th>
                  <th className="px-3 py-2 font-medium">Amount</th>
                  <th className="px-3 py-2 font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {slips.map((s) => (
                  <tr key={s.periodId} className="border-b border-[var(--gridline)] last:border-0">
                    <td className="px-3 py-2 text-[var(--text-primary)]">
                      {formatDate(s.periodStart)} – {formatDate(s.periodEnd)}
                    </td>
                    <td className="px-3 py-2 text-[var(--text-secondary)]">{[...new Set(s.lines.map((l) => l.description || "Payment"))].join(", ")}</td>
                    <td className="tabular px-3 py-2 font-medium text-[var(--text-primary)]">{formatCurrency(s.total)}</td>
                    <td className="px-3 py-2">
                      <button onClick={() => setViewing(s.periodId)} className="rounded-lg border border-[var(--border-hairline)] px-2.5 py-1 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40">
                        Preview / Download
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal open={!!open} onClose={() => setViewing(null)} title="Voucher payslip" wide>
        {open && (
          <div>
            <div className="mb-3 flex items-start justify-end gap-2">
              <button onClick={() => setPrinting(true)} className="flex items-center gap-1.5 rounded-lg border border-[var(--border-hairline)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40">
                <Printer size={14} /> Print
              </button>
              <DownloadPdfButton filename={`Voucher-Payslip-${fullName(emp).replace(/[^A-Za-z0-9]+/g, "-")}-${open.periodStart}-to-${open.periodEnd}.pdf`}>
                <PdfPage form>
                  <VoucherSlipDocument employee={emp} slip={open} />
                </PdfPage>
              </DownloadPdfButton>
            </div>
            <VoucherSlipDocument employee={emp} slip={open} />
          </div>
        )}
      </Modal>
      {printing && open && (
        <PrintStack onDone={stopPrinting}>
          <PrintPage form>
            <VoucherSlipDocument employee={emp} slip={open} />
          </PrintPage>
        </PrintStack>
      )}
    </div>
  );
}
