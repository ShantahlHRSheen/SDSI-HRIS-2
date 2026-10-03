"use client";

import { useCallback, useMemo, useState } from "react";
import { Printer, Receipt } from "lucide-react";
import { useHris } from "@/lib/store";
import { Modal } from "@/components/Modal";
import { MultiSelect } from "@/components/reports/MultiSelect";
import { DownloadPdfButton, PdfPage } from "@/components/pdf/DownloadPdfButton";
import { PrintPage, PrintStack } from "@/components/vouchers/PrintStack";
import { VoucherSlipDocument, type VoucherSlip } from "@/components/payroll/MyVoucherSlips";
import { useDepartmentVouchers } from "@/lib/use-department-vouchers";
import { formatCurrency, formatDate, fullName } from "@/lib/helpers";
import type { MyVoucherLine } from "@/lib/supabase/voucher-slips";
import type { Employee } from "@/lib/types";

// Up to this many slips go into one "download / print all shown" file.
const MAX_BULK = 60;

interface PayeeSlip extends VoucherSlip {
  key: string;
  payeeKey: string;
  payeeName: string;
  employee?: Employee;
  status: string;
}

// Every payee's voucher payslips (one per pay period, all departments), for
// those who can see vouchers — filterable by payee, pay period and department.
export function AllVoucherSlips() {
  const { employees, payrollPeriods, departments } = useHris();
  const { vouchers, lines, loaded, loadError } = useDepartmentVouchers();
  const [payees, setPayees] = useState<string[]>([]);
  const [periods, setPeriods] = useState<string[]>([]);
  const [depts, setDepts] = useState<string[]>([]);
  const [viewing, setViewing] = useState<string | null>(null);
  const [printing, setPrinting] = useState<"one" | "all" | null>(null);
  const stopPrinting = useCallback(() => setPrinting(null), []);

  const slips = useMemo(() => {
    const voucherById = new Map(vouchers.map((v) => [v.id, v]));
    const periodById = new Map(payrollPeriods.map((p) => [p.id, p]));
    const deptName = new Map(departments.map((d) => [d.id, d.name]));
    const empById = new Map(employees.map((e) => [e.id, e]));
    const byKey = new Map<string, PayeeSlip>();
    for (const l of lines) {
      const v = voucherById.get(l.voucherId);
      const p = v && periodById.get(v.periodId);
      if (!v || !p || (depts.length && !depts.includes(v.departmentId))) continue;
      const employee = l.employeeId ? empById.get(l.employeeId) : undefined;
      const payeeKey = employee ? `emp:${employee.id}` : `name:${l.payeeName.trim().toLowerCase()}`;
      const key = `${payeeKey}|${p.id}`;
      const line: MyVoucherLine = {
        lineId: l.id,
        periodId: p.id,
        periodStart: p.start,
        periodEnd: p.end,
        voucherDate: p.voucherDate ?? null,
        departmentId: v.departmentId,
        departmentName: deptName.get(v.departmentId) ?? v.departmentId,
        payeeName: l.payeeName,
        description: l.description,
        amount: l.amount,
        releasedAt: null,
      };
      const slip =
        byKey.get(key) ??
        ({
          key,
          payeeKey,
          payeeName: employee ? fullName(employee) : l.payeeName.trim(),
          employee,
          periodId: p.id,
          periodStart: p.start,
          periodEnd: p.end,
          voucherDate: p.voucherDate || p.end,
          status: p.status === "open" ? "In progress" : "Final",
          lines: [],
          total: 0,
        } as PayeeSlip);
      slip.lines.push(line);
      slip.total = Math.round((slip.total + l.amount) * 100) / 100;
      byKey.set(key, slip);
    }
    return [...byKey.values()].sort((a, b) => a.payeeName.localeCompare(b.payeeName) || a.periodStart.localeCompare(b.periodStart));
  }, [vouchers, lines, payrollPeriods, departments, employees, depts]);

  // Choices: each payee once (employees by their 201 name, others by the name typed).
  const payeeOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of slips) m.set(s.payeeKey, s.employee ? s.payeeName : `${s.payeeName} (not in 201 file)`);
    return [...m.entries()].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
  }, [slips]);
  const periodOptions = useMemo(() => {
    const used = new Set(slips.map((s) => s.periodId));
    return payrollPeriods
      .filter((p) => used.has(p.id) || periods.includes(p.id))
      .sort((a, b) => b.start.localeCompare(a.start))
      .map((p) => ({ value: p.id, label: `${formatDate(p.start)} – ${formatDate(p.end)}` }));
  }, [slips, payrollPeriods, periods]);

  const shown = slips.filter((s) => (!payees.length || payees.includes(s.payeeKey)) && (!periods.length || periods.includes(s.periodId)));
  const total = Math.round(shown.reduce((t, s) => t + s.total, 0) * 100) / 100;
  const open = shown.find((s) => s.key === viewing) ?? null;
  const bulk = shown.slice(0, MAX_BULK);

  if (!loaded && !loadError) return null;
  return (
    <div className="mt-6 rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-1)] p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="mr-auto flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
          <Receipt size={16} className="text-[var(--series-1)]" /> All Voucher Payslips
        </h2>
        {shown.length > 0 && (
          <>
            <button
              onClick={() => setPrinting("all")}
              className="flex items-center gap-1.5 rounded-lg border border-[var(--border-hairline)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40"
            >
              <Printer size={14} /> Print shown{shown.length > MAX_BULK ? ` (first ${MAX_BULK})` : ` (${shown.length})`}
            </button>
            <DownloadPdfButton label={`Download shown as PDF${shown.length > MAX_BULK ? ` (first ${MAX_BULK})` : ` (${shown.length})`}`} filename={`Voucher-Payslips-${new Date().toISOString().slice(0, 10)}.pdf`}>
              {bulk.map((s) => (
                <PdfPage key={s.key} form>
                  <VoucherSlipDocument employee={s.employee} payeeName={s.payeeName} slip={s} />
                </PdfPage>
              ))}
            </DownloadPdfButton>
          </>
        )}
      </div>
      <p className="mb-3 text-xs text-[var(--text-muted)]">
        One voucher payslip per payee per pay period (all departments together), from the Vouchers page. Employees see their own once the period is locked or the
        voucher released.
      </p>

      <div className="mb-3 flex flex-wrap gap-2">
        <MultiSelect className="w-full sm:w-72" allLabel="All payees" noun="payees" searchable options={payeeOptions} value={payees} onChange={setPayees} />
        <MultiSelect className="w-full sm:w-64" allLabel="All pay periods" noun="pay periods" options={periodOptions} value={periods} onChange={setPeriods} />
        <MultiSelect
          className="w-full sm:w-56"
          allLabel="All departments"
          noun="departments"
          options={departments.map((d) => ({ value: d.id, label: d.name }))}
          value={depts}
          onChange={setDepts}
        />
      </div>

      {loadError ? (
        <div className="text-sm text-[var(--status-critical)]">Couldn&rsquo;t load vouchers: {loadError}</div>
      ) : shown.length === 0 ? (
        <div className="py-4 text-center text-xs text-[var(--text-muted)]">No voucher payslips for these filters.</div>
      ) : (
        <>
          <div className="mb-2 text-xs text-[var(--text-secondary)]">
            {shown.length} payslip{shown.length === 1 ? "" : "s"} · {new Set(shown.map((s) => s.payeeKey)).size} payee
            {new Set(shown.map((s) => s.payeeKey)).size === 1 ? "" : "s"} · Total <span className="font-medium text-[var(--text-primary)]">{formatCurrency(total)}</span>
          </div>
          <div className="max-h-[32rem] overflow-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="sticky top-0 bg-[var(--surface-1)]">
                <tr className="border-b border-[var(--border-hairline)] text-left text-xs text-[var(--text-muted)]">
                  <th className="px-3 py-2 font-medium">Payee</th>
                  <th className="px-3 py-2 font-medium">Pay period</th>
                  <th className="px-3 py-2 font-medium">Voucher</th>
                  <th className="px-3 py-2 font-medium">Description</th>
                  <th className="px-3 py-2 font-medium">Amount</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((s) => (
                  <tr key={s.key} className="border-b border-[var(--gridline)] last:border-0">
                    <td className="px-3 py-2 text-[var(--text-primary)]">
                      {s.payeeName}
                      {!s.employee && <span className="ml-1 text-xs text-[var(--text-muted)]">(not in 201 file)</span>}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-[var(--text-secondary)]">
                      {formatDate(s.periodStart)} – {formatDate(s.periodEnd)}
                    </td>
                    <td className="px-3 py-2 text-[var(--text-secondary)]">{[...new Set(s.lines.map((l) => l.departmentName.replace(/\s+Department$/i, "")))].join(", ")}</td>
                    <td className="max-w-xs truncate px-3 py-2 text-[var(--text-secondary)]">{[...new Set(s.lines.map((l) => l.description || "Payment"))].join(", ")}</td>
                    <td className="tabular px-3 py-2 font-medium text-[var(--text-primary)]">{formatCurrency(s.total)}</td>
                    <td className="px-3 py-2 text-xs text-[var(--text-muted)]">{s.status}</td>
                    <td className="px-3 py-2">
                      <button onClick={() => setViewing(s.key)} className="rounded-lg border border-[var(--border-hairline)] px-2.5 py-1 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40">
                        Preview / Download
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <Modal open={!!open} onClose={() => setViewing(null)} title={open ? `Voucher payslip — ${open.payeeName}` : ""} wide>
        {open && (
          <div>
            <div className="mb-3 flex items-start justify-end gap-2">
              <button
                onClick={() => setPrinting("one")}
                className="flex items-center gap-1.5 rounded-lg border border-[var(--border-hairline)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40"
              >
                <Printer size={14} /> Print
              </button>
              <DownloadPdfButton filename={`Voucher-Payslip-${open.payeeName.replace(/[^A-Za-z0-9]+/g, "-")}-${open.periodStart}-to-${open.periodEnd}.pdf`}>
                <PdfPage form>
                  <VoucherSlipDocument employee={open.employee} payeeName={open.payeeName} slip={open} />
                </PdfPage>
              </DownloadPdfButton>
            </div>
            <VoucherSlipDocument employee={open.employee} payeeName={open.payeeName} slip={open} />
          </div>
        )}
      </Modal>
      {printing && (
        <PrintStack onDone={stopPrinting}>
          {(printing === "one" && open ? [open] : bulk).map((s) => (
            <PrintPage key={s.key} form>
              <VoucherSlipDocument employee={s.employee} payeeName={s.payeeName} slip={s} />
            </PrintPage>
          ))}
        </PrintStack>
      )}
    </div>
  );
}
