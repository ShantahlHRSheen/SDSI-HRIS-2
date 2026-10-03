"use client";

import { useCallback, useEffect, useState } from "react";
import { Gift, Printer } from "lucide-react";
import { useHris } from "@/lib/store";
import { Modal } from "@/components/Modal";
import { formatDate } from "@/lib/helpers";
import { ThirteenthMonthSlip } from "@/components/thirteenth-month/ThirteenthMonthSlip";
import { PrintPage, PrintStack } from "@/components/vouchers/PrintStack";
import { DownloadPdfButton, PdfPage } from "@/components/pdf/DownloadPdfButton";
import { useVoucherSignatures, validSignoff } from "@/components/vouchers/VoucherSignatures";
import { fetchReleasedThirteenthMonthSlips, fetchThirteenthMonthSignoffs, type ReleasedThirteenthMonthSlip } from "@/lib/supabase/thirteenth-month";
import type { VoucherSignoff } from "@/lib/supabase/voucher-signoffs";
import type { VoucherSignatureSet } from "@/components/vouchers/VoucherSheet";

const peso = (n: number) => n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// The employee's own 13th month pay slips, once HR has released them (shown
// on My Payslips). Real accounts only.
export function MyThirteenthMonthSlips() {
  const { isRealAccount, currentEmployee } = useHris();
  const employeeId = currentEmployee?.id;
  const [slips, setSlips] = useState<ReleasedThirteenthMonthSlip[]>([]);
  const [signoffs, setSignoffs] = useState<VoucherSignoff[]>([]);
  const signatures = useVoucherSignatures();

  useEffect(() => {
    if (!isRealAccount || !employeeId) return;
    let live = true;
    (async () => {
      const mine = (await fetchReleasedThirteenthMonthSlips({ employeeId })).sort((a, b) => b.year - a.year);
      const signed = (await Promise.all(mine.map((s) => fetchThirteenthMonthSignoffs(s.year)))).flat().filter((x) => x.voucherKey === employeeId);
      if (!live) return;
      setSlips(mine);
      setSignoffs(signed);
    })();
    return () => {
      live = false;
    };
  }, [isRealAccount, employeeId]);

  const [viewing, setViewing] = useState<number | null>(null);
  const [printing, setPrinting] = useState(false);
  const stopPrinting = useCallback(() => setPrinting(false), []);
  const open = slips.find((s) => s.year === viewing) ?? null;

  if (!slips.length) return null;

  const signaturesFor = (s: ReleasedThirteenthMonthSlip): VoucherSignatureSet => {
    const mine = signoffs.filter((x) => x.periodId === String(s.year));
    const checked = validSignoff(mine, s.employeeId, "checked", s.total);
    const released = validSignoff(mine, s.employeeId, "released", s.total);
    return {
      prepared: signatures.urls["prepared-by"],
      checked: checked ? { url: signatures.urls["checked-by"], at: checked.signedAt } : undefined,
      released: released ? { url: signatures.urls["released-by"], at: released.signedAt } : undefined,
    };
  };

  return (
    <div className="mt-6">
      <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
        <Gift size={16} className="text-[var(--series-1)]" /> 13th Month Pay
      </h2>
      <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-1)] p-4">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="border-b border-[var(--border-hairline)] text-left text-xs text-[var(--text-muted)]">
                <th className="px-3 py-2 font-medium">Year</th>
                <th className="px-3 py-2 font-medium">13th month</th>
                <th className="px-3 py-2 font-medium">Total (with VL credits)</th>
                <th className="px-3 py-2 font-medium">Released</th>
                <th className="px-3 py-2 font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {slips.map((s) => (
                <tr key={s.year} className="border-b border-[var(--gridline)] last:border-0">
                  <td className="px-3 py-2 text-[var(--text-primary)]">{s.year}</td>
                  <td className="tabular px-3 py-2 text-[var(--text-secondary)]">₱{peso(s.slip.thirteenthMonth)}</td>
                  <td className="tabular px-3 py-2 font-medium text-[var(--text-primary)]">₱{peso(s.total)}</td>
                  <td className="tabular px-3 py-2 text-[var(--text-secondary)]">{formatDate(s.releasedAt.slice(0, 10))}</td>
                  <td className="px-3 py-2">
                    <button onClick={() => setViewing(s.year)} className="rounded-lg border border-[var(--border-hairline)] px-2.5 py-1 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40">
                      Preview / Download
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={!!open} onClose={() => setViewing(null)} title={open ? `13th month pay — ${open.year}` : ""} wide>
        {open && (
          <div>
            <div className="mb-3 flex items-start justify-end gap-2">
              <button onClick={() => setPrinting(true)} className="flex items-center gap-1.5 rounded-lg border border-[var(--border-hairline)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40">
                <Printer size={14} /> Print
              </button>
              <DownloadPdfButton filename={`13th-Month-Pay-${open.year}.pdf`}>
                <PdfPage>
                  <ThirteenthMonthSlip row={open.slip} signatures={signaturesFor(open)} />
                </PdfPage>
              </DownloadPdfButton>
            </div>
            <div className="overflow-x-auto rounded-lg bg-white p-3">
              <div className="min-w-[560px]">
                <ThirteenthMonthSlip row={open.slip} signatures={signaturesFor(open)} />
              </div>
            </div>
          </div>
        )}
      </Modal>
      {printing && open && (
        <PrintStack onDone={stopPrinting}>
          <PrintPage>
            <ThirteenthMonthSlip row={open.slip} signatures={signaturesFor(open)} />
          </PrintPage>
        </PrintStack>
      )}
    </div>
  );
}
