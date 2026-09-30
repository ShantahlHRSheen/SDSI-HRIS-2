"use client";

import { useCallback, useMemo, useState } from "react";
import { BadgeCheck, Download, Gift, Pencil, Printer, RotateCcw, Send, Undo2 } from "lucide-react";
import { useHris } from "@/lib/store";
import { PageHeader } from "@/components/PageHeader";
import { StatTile } from "@/components/StatTile";
import { EmptyState } from "@/components/EmptyState";
import { Modal } from "@/components/Modal";
import { formatCurrencyCompact, fullName, positionTitle } from "@/lib/helpers";
import { toCsv, downloadCsv } from "@/lib/monthly-analytics";
import { computePayrollForPeriod, type PayrollLine } from "@/lib/payroll";
import { computeThirteenthMonth, emptyEntry, MONTH_NAMES, round2, sameSlip, toSlipData, type MonthFigures, type ThirteenthMonthEntry, type ThirteenthMonthRow } from "@/lib/thirteenth-month";
import { ThirteenthMonthSlip } from "@/components/thirteenth-month/ThirteenthMonthSlip";
import { useReleasedThirteenthMonthSlips, useThirteenthMonthEntries, useThirteenthMonthSignoffs } from "@/components/thirteenth-month/useThirteenthMonth";
import { SignatureControl, SignoffBar, signatureKindsFor, useVoucherSignatures, validSignoff } from "@/components/vouchers/VoucherSignatures";
import { PrintPage, PrintStack } from "@/components/vouchers/PrintStack";
import type { VoucherSignatureSet } from "@/components/vouchers/VoucherSheet";

const MANAGE_ROLES = ["hr_admin", "payroll_officer"];
const peso = (n: number) => n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function ThirteenthMonthPayPage() {
  const { employees, attendancePeriodRecords, overtimeRequests, payrollLineOverrides, payrollPeriods, salaryAdjustments, leaveRequests, leaveTypes, currentUser, isRealAccount } = useHris();
  const roles = currentUser?.roles ?? [];
  const canManage = roles.some((r) => MANAGE_ROLES.includes(r));
  const isHr = roles.includes("hr_admin");

  // Years with payroll, newest first; starts on the latest one.
  const years = useMemo(() => {
    const ys = new Set(payrollPeriods.filter((p) => attendancePeriodRecords.some((r) => r.periodId === p.id)).map((p) => Number(p.start.slice(0, 4))));
    ys.add(Number(new Date().toISOString().slice(0, 4)));
    return [...ys].sort((a, b) => b - a);
  }, [payrollPeriods, attendancePeriodRecords]);
  const [pickedYear, setYear] = useState<number | null>(null);
  const year = pickedYear ?? years.find((y) => payrollPeriods.some((p) => p.start.startsWith(String(y)) && attendancePeriodRecords.some((r) => r.periodId === p.id))) ?? years[0];
  const [search, setSearch] = useState("");

  const { entries, error: entriesError, loaded, save, reset } = useThirteenthMonthEntries(year);
  const { signoffs, sign, signMany, withdraw } = useThirteenthMonthSignoffs(year);
  const signatures = useVoucherSignatures();
  const { released, release, withdraw: withdrawSlip } = useReleasedThirteenthMonthSlips(year);

  const linesByPeriod = useMemo(() => {
    const m = new Map<string, PayrollLine[]>();
    for (const p of payrollPeriods.filter((p) => p.start.startsWith(String(year))))
      m.set(p.id, computePayrollForPeriod(p, employees, attendancePeriodRecords, overtimeRequests, payrollLineOverrides, salaryAdjustments));
    return m;
  }, [year, payrollPeriods, employees, attendancePeriodRecords, overtimeRequests, payrollLineOverrides, salaryAdjustments]);

  const vlCredits = leaveTypes.find((t) => t.id === "lt-vl")?.defaultCredits ?? 5;
  const allRows = useMemo(
    () => computeThirteenthMonth({ year, employees, periods: payrollPeriods, linesByPeriod, leaveRequests, vlCreditsPerYear: vlCredits, entries, positionTitle }),
    [year, employees, payrollPeriods, linesByPeriod, leaveRequests, vlCredits, entries],
  );
  const rows = allRows.filter((r) => `${fullName(r.employee)} ${r.employee.firstName} ${r.employee.lastName}`.toLowerCase().includes(search.trim().toLowerCase()));
  const sum = (k: keyof Pick<ThirteenthMonthRow, "grossBasic" | "thirteenthMonth" | "monetizedVl" | "lastSalary" | "sss" | "philhealth" | "hdmf" | "total">) => round2(rows.reduce((s, r) => s + r[k], 0));

  const signaturesFor = (r: ThirteenthMonthRow): VoucherSignatureSet => {
    const checked = validSignoff(signoffs, r.employee.id, "checked", r.total);
    const released = validSignoff(signoffs, r.employee.id, "released", r.total);
    return {
      prepared: signatures.urls["prepared-by"],
      checked: checked ? { url: signatures.urls["checked-by"], at: checked.signedAt } : undefined,
      released: released ? { url: signatures.urls["released-by"], at: released.signedAt } : undefined,
    };
  };

  const signable = rows.filter((r) => r.total !== 0).map((r) => ({ voucherKey: r.employee.id, total: r.total }));
  const toCheck = roles.includes("sr_accounting_assistant") ? signable.filter((v) => !validSignoff(signoffs, v.voucherKey, "checked", v.total)) : [];
  const toRelease = roles.includes("treasurer")
    ? signable.filter((v) => validSignoff(signoffs, v.voucherKey, "checked", v.total) && !validSignoff(signoffs, v.voucherKey, "released", v.total))
    : [];
  const [bulkBusy, setBulkBusy] = useState(false);
  const bulkSign = async (step: "checked" | "released", items: typeof signable) => {
    if (!confirm(`Mark the 13th month pay of ${items.length} employee${items.length === 1 ? "" : "s"} for ${year} as ${step}? Your signature will print on ${items.length === 1 ? "the slip" : "their slips"}.`)) return;
    setBulkBusy(true);
    await signMany(step, items);
    setBulkBusy(false);
  };
  const status = (r: ThirteenthMonthRow) =>
    validSignoff(signoffs, r.employee.id, "released", r.total) ? "Checked · Released" : validSignoff(signoffs, r.employee.id, "checked", r.total) ? "Checked" : "";

  // The copy released to the employee (My Payslips), if any.
  const releasedBy = new Map(released.map((x) => [x.employeeId, x]));
  const releaseState = (r: ThirteenthMonthRow) => {
    const copy = releasedBy.get(r.employee.id);
    return !copy ? "none" : sameSlip(copy.slip, toSlipData(r)) ? "current" : "outdated";
  };
  const toRelease13 = canManage ? rows.filter((r) => r.total !== 0 && releaseState(r) !== "current") : [];
  const [releasing, setReleasing] = useState(false);
  const releaseRows = async (items: ThirteenthMonthRow[], ask = true) => {
    if (ask && !confirm(`Release the ${year} 13th month slip${items.length === 1 ? "" : "s"} of ${items.length} employee${items.length === 1 ? "" : "s"}? They'll see ${items.length === 1 ? "it" : "their own"} under My Payslips.`)) return;
    setReleasing(true);
    await release(items.map((r) => ({ employeeId: r.employee.id, slip: toSlipData(r) })));
    setReleasing(false);
  };

  const [viewing, setViewing] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const viewRow = allRows.find((r) => r.employee.id === viewing) ?? null;
  const editRow = allRows.find((r) => r.employee.id === editing) ?? null;

  // "all" or an employee id.
  const [printing, setPrinting] = useState<string | null>(null);
  const stopPrinting = useCallback(() => setPrinting(null), []);
  const printRows = printing === "all" ? rows.filter((r) => r.total !== 0) : allRows.filter((r) => r.employee.id === printing);

  function exportCsv() {
    const csv = toCsv(
      ["Employee", "Designation", ...MONTH_NAMES, "Gross Basic Pay", "13th Month", "Unused VL (days)", "Daily Rate", "Monetized VL", "Last Salary", "SSS", "PhilHealth", "Pag-IBIG", "Total"],
      rows.map((r) => [
        fullName(r.employee),
        r.designation,
        ...r.months.map((m) => m.net),
        r.grossBasic,
        r.thirteenthMonth,
        r.vlDays,
        r.dailyRate,
        r.monetizedVl,
        r.lastSalary,
        r.sss,
        r.philhealth,
        r.hdmf,
        r.total,
      ]),
    );
    downloadCsv(`13th-month-pay-and-vl-${year}.csv`, csv);
  }

  const th = "px-2 py-2 font-medium whitespace-nowrap";
  const td = "tabular px-2 py-1.5 text-right text-[var(--text-secondary)] whitespace-nowrap";

  return (
    <div>
      <PageHeader
        title="13th Month Pay"
        subtitle={`13th month pay (gross basic pay ÷ 12) plus accumulated vacation leave credits (unused VL × daily rate) for ${year}, computed from the payroll. Every figure can be edited; open an employee to print their slip.`}
        actions={
          <button onClick={exportCsv} className="flex items-center gap-1.5 rounded-lg border border-[var(--border-hairline)] px-3 py-2 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40">
            <Download size={14} /> Export CSV
          </button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2 print:hidden">
        <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-2 text-sm">
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search employee…" className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-2 text-sm" />
        <button
          onClick={() => setPrinting("all")}
          disabled={!rows.some((r) => r.total !== 0) || !loaded}
          className="flex items-center gap-1.5 rounded-lg border border-[var(--border-hairline)] px-3 py-2 text-sm text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40 disabled:opacity-40"
        >
          <Printer size={15} /> Print all slips
        </button>
        {isRealAccount &&
          signatureKindsFor(roles).map((kind) => <SignatureControl key={kind} kind={kind} url={signatures.urls[kind]} onChanged={signatures.reload} hrView={isHr} />)}
        {loaded && toRelease13.length > 0 && (
          <button
            onClick={() => releaseRows(toRelease13)}
            disabled={releasing}
            title="Employees see their released slip under My Payslips. Slips changed since they were released are updated."
            className="flex items-center gap-1.5 rounded-lg border border-[var(--series-1)] px-3 py-2 text-sm font-medium text-[var(--series-1)] disabled:opacity-40"
          >
            <Send size={15} /> {releasing ? "Releasing…" : `Release to employees (${toRelease13.length})`}
          </button>
        )}
        {isRealAccount && loaded && toCheck.length > 0 && (
          <button onClick={() => bulkSign("checked", toCheck)} disabled={bulkBusy} className="flex items-center gap-1.5 rounded-lg bg-[var(--series-1)] px-3 py-2 text-sm font-medium text-[var(--on-accent)] disabled:opacity-40">
            <BadgeCheck size={15} /> {bulkBusy ? "Saving…" : `Mark all as checked (${toCheck.length})`}
          </button>
        )}
        {isRealAccount && loaded && toRelease.length > 0 && (
          <button onClick={() => bulkSign("released", toRelease)} disabled={bulkBusy} className="flex items-center gap-1.5 rounded-lg bg-[var(--series-1)] px-3 py-2 text-sm font-medium text-[var(--on-accent)] disabled:opacity-40">
            <BadgeCheck size={15} /> {bulkBusy ? "Saving…" : `Mark all as released (${toRelease.length})`}
          </button>
        )}
      </div>
      {isRealAccount && (
        <p className="-mt-2 mb-4 text-xs text-[var(--text-muted)] print:hidden">
          The Checked by and Released by signatures print only on slips that have been marked as checked / released (and whose total hasn&rsquo;t changed since).
        </p>
      )}
      {entriesError && <div className="mb-4 rounded-lg border border-[var(--status-critical)]/40 px-3 py-2 text-sm text-[var(--status-critical)]">{entriesError}</div>}

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4 print:hidden">
        <StatTile label="Employees" value={rows.length.toString()} />
        <StatTile label="13th month pay" value={formatCurrencyCompact(sum("thirteenthMonth"))} />
        <StatTile label="Monetized VL" value={formatCurrencyCompact(sum("monetizedVl"))} />
        <StatTile label="Total to release" value={formatCurrencyCompact(sum("total"))} />
      </div>

      <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-1)] p-4 print:hidden">
        <div className="mb-3 text-sm font-medium text-[var(--text-primary)]">13th Month Pay + Accumulated VL Credits — {year} (sorted A–Z by surname)</div>
        {!loaded ? (
          <div className="text-sm text-[var(--text-muted)]">Loading…</div>
        ) : rows.length === 0 ? (
          <EmptyState icon={Gift} title="No payroll for this year" description="The sheet is computed from the payroll periods of the selected year." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[2300px] text-sm">
              <thead>
                <tr className="border-b border-[var(--border-hairline)] text-right text-xs text-[var(--text-muted)]">
                  <th className={`${th} text-left`}>Employee</th>
                  <th className={`${th} text-left`}>Designation</th>
                  {MONTH_NAMES.map((m) => (
                    <th key={m} className={th}>
                      {m.slice(0, 3)}
                    </th>
                  ))}
                  <th className={th}>Gross basic</th>
                  <th className={th}>13th month</th>
                  <th className={th}>Unused VL</th>
                  <th className={th}>Daily rate</th>
                  <th className={th}>Monetized VL</th>
                  <th className={th}>Last salary</th>
                  <th className={th}>SSS</th>
                  <th className={th}>PhilHealth</th>
                  <th className={th}>Pag-IBIG</th>
                  <th className={th}>Total</th>
                  <th className={`${th} text-left`}>Status</th>
                  <th className={th}></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.employee.id} className="border-b border-[var(--gridline)] last:border-0">
                    <td className="px-2 py-1.5 whitespace-nowrap text-[var(--text-primary)]">
                      {fullName(r.employee)}
                      {r.edited && <span className="ml-1.5 rounded bg-[var(--status-warning)]/15 px-1.5 py-0.5 text-[10px] font-semibold text-[var(--status-warning)]">EDITED</span>}
                    </td>
                    <td className="max-w-[180px] truncate px-2 py-1.5 text-xs text-[var(--text-secondary)]">{r.designation}</td>
                    {r.months.map((m, i) => (
                      <td key={i} className={`${td} ${m.edited ? "text-[var(--status-warning)]" : ""}`}>
                        {m.net ? peso(m.net) : "—"}
                      </td>
                    ))}
                    <td className={td}>{peso(r.grossBasic)}</td>
                    <td className={`${td} font-medium text-[var(--text-primary)]`}>{peso(r.thirteenthMonth)}</td>
                    <td className={td}>{r.vlDays}</td>
                    <td className={td}>{peso(r.dailyRate)}</td>
                    <td className={td}>{peso(r.monetizedVl)}</td>
                    <td className={td}>{r.lastSalary ? peso(r.lastSalary) : "—"}</td>
                    <td className={td}>{r.sss ? `-${peso(r.sss)}` : "—"}</td>
                    <td className={td}>{r.philhealth ? `-${peso(r.philhealth)}` : "—"}</td>
                    <td className={td}>{r.hdmf ? `-${peso(r.hdmf)}` : "—"}</td>
                    <td className={`${td} font-semibold text-[var(--text-primary)]`}>{peso(r.total)}</td>
                    <td className="px-2 py-1.5 text-xs whitespace-nowrap">
                      <span className="text-[var(--status-good)]">{status(r)}</span>
                      {releaseState(r) === "current" && <span className="block text-[var(--text-muted)]">Released to employee</span>}
                      {releaseState(r) === "outdated" && <span className="block text-[var(--status-warning)]">Employee copy out of date</span>}
                    </td>
                    <td className="px-2 py-1.5">
                      <div className="flex justify-end gap-1">
                        <button onClick={() => setViewing(r.employee.id)} className="rounded-lg border border-[var(--border-hairline)] px-2 py-1 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40">
                          Slip
                        </button>
                        {canManage && (
                          <button onClick={() => setEditing(r.employee.id)} className="flex items-center gap-1 rounded-lg border border-[var(--border-hairline)] px-2 py-1 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40">
                            <Pencil size={12} /> Edit
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-[var(--border-hairline)] font-semibold text-[var(--text-primary)]">
                  <td className="px-2 py-2">Total</td>
                  <td />
                  {MONTH_NAMES.map((m, i) => (
                    <td key={m} className="tabular px-2 py-2 text-right whitespace-nowrap">
                      {peso(round2(rows.reduce((s, r) => s + r.months[i].net, 0)))}
                    </td>
                  ))}
                  <td className="tabular px-2 py-2 text-right">{peso(sum("grossBasic"))}</td>
                  <td className="tabular px-2 py-2 text-right">{peso(sum("thirteenthMonth"))}</td>
                  <td />
                  <td />
                  <td className="tabular px-2 py-2 text-right">{peso(sum("monetizedVl"))}</td>
                  <td className="tabular px-2 py-2 text-right">{peso(sum("lastSalary"))}</td>
                  <td className="tabular px-2 py-2 text-right">{peso(sum("sss"))}</td>
                  <td className="tabular px-2 py-2 text-right">{peso(sum("philhealth"))}</td>
                  <td className="tabular px-2 py-2 text-right">{peso(sum("hdmf"))}</td>
                  <td className="tabular px-2 py-2 text-right">{peso(sum("total"))}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      <Modal open={!!viewRow} onClose={() => setViewing(null)} title={viewRow ? `13th month slip — ${viewRow.employee.firstName} ${viewRow.employee.lastName}` : ""} wide>
        {viewRow && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={() => setPrinting(viewRow.employee.id)} className="flex items-center gap-1.5 rounded-lg bg-[var(--series-1)] px-3 py-1.5 text-sm font-medium text-[var(--on-accent)]">
                <Printer size={14} /> Print slip
              </button>
              {canManage && viewRow.total !== 0 && releaseState(viewRow) !== "current" && (
                <button
                  onClick={() => releaseRows([viewRow])}
                  disabled={releasing}
                  className="flex items-center gap-1.5 rounded-lg border border-[var(--series-1)] px-3 py-1.5 text-sm text-[var(--series-1)] disabled:opacity-40"
                >
                  <Send size={14} /> {releaseState(viewRow) === "outdated" ? "Update employee's copy" : "Release to employee"}
                </button>
              )}
              {canManage && releaseState(viewRow) !== "none" && (
                <button
                  onClick={() => confirm("Remove this slip from the employee's My Payslips?") && withdrawSlip(viewRow.employee.id)}
                  className="flex items-center gap-1.5 rounded-lg border border-[var(--border-hairline)] px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40"
                >
                  <Undo2 size={14} /> Withdraw from employee
                </button>
              )}
              {canManage && (
                <button
                  onClick={() => {
                    setEditing(viewRow.employee.id);
                    setViewing(null);
                  }}
                  className="flex items-center gap-1.5 rounded-lg border border-[var(--border-hairline)] px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40"
                >
                  <Pencil size={14} /> Edit
                </button>
              )}
            </div>
            {viewRow.total !== 0 && <SignoffBar voucherKey={viewRow.employee.id} total={viewRow.total} signoffs={signoffs} onSign={sign} onWithdraw={withdraw} />}
            <div className="overflow-x-auto rounded-lg bg-white p-3">
              <div className="min-w-[560px]">
                <ThirteenthMonthSlip row={toSlipData(viewRow)} signatures={signaturesFor(viewRow)} />
              </div>
            </div>
          </div>
        )}
      </Modal>

      {editRow && (
        <EditModal
          key={editRow.employee.id}
          row={editRow}
          entry={entries.find((e) => e.employeeId === editRow.employee.id) ?? emptyEntry(year, editRow.employee.id)}
          onClose={() => setEditing(null)}
          onSave={save}
          onReset={() => reset(year, editRow.employee.id)}
        />
      )}

      {printing && (
        <PrintStack onDone={stopPrinting}>
          {printRows.map((r) => (
            <PrintPage key={r.employee.id}>
              <ThirteenthMonthSlip row={toSlipData(r)} signatures={signaturesFor(r)} />
            </PrintPage>
          ))}
        </PrintStack>
      )}
    </div>
  );
}

// ---- Editing ----------------------------------------------------------------

const KEYS: (keyof MonthFigures)[] = ["b1", "l1", "b2", "l2"];
const toNum = (s: string) => {
  const n = Number(s.replace(/,/g, "").trim());
  return s.trim() === "" || !Number.isFinite(n) ? null : round2(n);
};

function EditModal({
  row,
  entry,
  onClose,
  onSave,
  onReset,
}: {
  row: ThirteenthMonthRow;
  entry: ThirteenthMonthEntry;
  onClose: () => void;
  onSave: (e: ThirteenthMonthEntry) => Promise<boolean>;
  onReset: () => Promise<boolean>;
}) {
  const [designation, setDesignation] = useState(row.designation);
  const [cells, setCells] = useState(() => row.months.map((m) => KEYS.map((k) => String(m[k]))));
  const [vlDays, setVlDays] = useState(String(row.vlDays));
  const [dailyRate, setDailyRate] = useState(String(row.dailyRate));
  const [extra, setExtra] = useState({ lastSalary: String(row.lastSalary), sss: String(row.sss), philhealth: String(row.philhealth), hdmf: String(row.hdmf) });
  const [busy, setBusy] = useState(false);

  const netOf = (i: number) => {
    const [b1, l1, b2, l2] = cells[i].map((c) => toNum(c) ?? 0);
    return round2(b1 - l1 + b2 - l2);
  };
  const gross = round2(cells.reduce((s, _, i) => s + netOf(i), 0));
  const thirteenth = round2(gross / 12);
  const monetized = round2((toNum(vlDays) ?? 0) * (toNum(dailyRate) ?? 0));
  const total = round2(thirteenth + monetized + (toNum(extra.lastSalary) ?? 0) - (toNum(extra.sss) ?? 0) - (toNum(extra.philhealth) ?? 0) - (toNum(extra.hdmf) ?? 0));

  async function submit() {
    // Only figures that differ from the payroll are stored as edits.
    const months: ThirteenthMonthEntry["months"] = {};
    cells.forEach((c, i) => {
      const o: Partial<Record<keyof MonthFigures, number>> = {};
      KEYS.forEach((k, j) => {
        const v = toNum(c[j]) ?? 0;
        if (Math.abs(v - row.monthsAuto[i][k]) >= 0.005) o[k] = v;
      });
      if (Object.keys(o).length) months[String(i + 1)] = o;
    });
    const vl = toNum(vlDays);
    const rate = toNum(dailyRate);
    setBusy(true);
    const ok = await onSave({
      ...entry,
      designation: designation.trim() && designation.trim() !== positionTitle(row.employee.positionId) ? designation.trim() : null,
      months,
      vlDays: vl !== null && Math.abs(vl - row.vlDaysAuto) >= 0.005 ? vl : null,
      dailyRate: rate !== null && Math.abs(rate - row.dailyRateAuto) >= 0.005 ? rate : null,
      lastSalary: toNum(extra.lastSalary) ?? 0,
      sss: toNum(extra.sss) ?? 0,
      philhealth: toNum(extra.philhealth) ?? 0,
      hdmf: toNum(extra.hdmf) ?? 0,
    });
    setBusy(false);
    if (ok) onClose();
  }

  async function resetAll() {
    if (!confirm("Discard all edits for this employee and use the figures from the payroll?")) return;
    setBusy(true);
    const ok = await onReset();
    setBusy(false);
    if (ok) onClose();
  }

  const input = "tabular w-full rounded-md border border-[var(--border-hairline)] bg-[var(--page-plane)] px-2 py-1 text-right text-sm";
  const field = (label: string, value: string, set: (v: string) => void, hint?: string) => (
    <label className="block text-xs text-[var(--text-muted)]">
      {label}
      <input value={value} onChange={(e) => set(e.target.value)} inputMode="decimal" className={`${input} mt-1`} />
      {hint && <span className="mt-0.5 block text-[10px]">{hint}</span>}
    </label>
  );

  return (
    <Modal open onClose={onClose} title={`Edit 13th month — ${row.employee.firstName} ${row.employee.lastName}`} wide>
      <div className="space-y-4">
        <label className="block text-xs text-[var(--text-muted)]">
          Designation
          <input value={designation} onChange={(e) => setDesignation(e.target.value)} className="mt-1 w-full rounded-md border border-[var(--border-hairline)] bg-[var(--page-plane)] px-2 py-1 text-sm" />
        </label>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-xs">
            <thead>
              <tr className="text-right text-[var(--text-muted)]">
                <th className="px-1 py-1 text-left font-medium">Month</th>
                <th className="px-1 py-1 font-medium">Basic (1st)</th>
                <th className="px-1 py-1 font-medium">Lates/Abs/UT</th>
                <th className="px-1 py-1 font-medium">Basic (2nd)</th>
                <th className="px-1 py-1 font-medium">Lates/Abs/UT</th>
                <th className="px-1 py-1 font-medium">Net</th>
              </tr>
            </thead>
            <tbody>
              {MONTH_NAMES.map((m, i) => (
                <tr key={m}>
                  <td className="px-1 py-0.5 text-[var(--text-secondary)]">{m}</td>
                  {KEYS.map((k, j) => (
                    <td key={k} className="px-1 py-0.5">
                      <input
                        aria-label={`${m} ${["Basic 1st cutoff", "Lates 1st cutoff", "Basic 2nd cutoff", "Lates 2nd cutoff"][j]}`}
                        value={cells[i][j]}
                        onChange={(e) => setCells((c) => c.map((r, ri) => (ri === i ? r.map((v, vj) => (vj === j ? e.target.value : v)) : r)))}
                        inputMode="decimal"
                        className={`${input} ${Math.abs((toNum(cells[i][j]) ?? 0) - row.monthsAuto[i][k]) >= 0.005 ? "text-[var(--status-warning)]" : ""}`}
                      />
                    </td>
                  ))}
                  <td className="tabular px-1 py-0.5 text-right text-[var(--text-primary)]">{peso(netOf(i))}</td>
                </tr>
              ))}
              <tr className="font-semibold text-[var(--text-primary)]">
                <td className="px-1 py-1" colSpan={5}>
                  Gross basic pay · 13th month (÷ 12)
                </td>
                <td className="tabular px-1 py-1 text-right">
                  {peso(gross)} · {peso(thirteenth)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {field("Unused VL (days)", vlDays, setVlDays, `From leave records: ${row.vlDaysAuto}`)}
          {field("Daily rate", dailyRate, setDailyRate, `From payroll: ${peso(row.dailyRateAuto)}`)}
          <div className="text-xs text-[var(--text-muted)]">
            Monetized VL
            <div className="tabular mt-1 py-1 text-right text-sm text-[var(--text-primary)]">{peso(monetized)}</div>
          </div>
          {field("Last salary (add)", extra.lastSalary, (v) => setExtra((x) => ({ ...x, lastSalary: v })))}
          {field("SSS (deduct)", extra.sss, (v) => setExtra((x) => ({ ...x, sss: v })))}
          {field("PhilHealth (deduct)", extra.philhealth, (v) => setExtra((x) => ({ ...x, philhealth: v })))}
          {field("Pag-IBIG (deduct)", extra.hdmf, (v) => setExtra((x) => ({ ...x, hdmf: v })))}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-[var(--border-hairline)] pt-3">
          <div className="text-sm text-[var(--text-secondary)]">
            Total: <span className="tabular font-semibold text-[var(--text-primary)]">{peso(total)}</span>
          </div>
          <div className="flex gap-2">
            {row.edited && (
              <button onClick={resetAll} disabled={busy} className="flex items-center gap-1 rounded-lg border border-[var(--border-hairline)] px-3 py-1.5 text-sm text-[var(--text-secondary)] disabled:opacity-40">
                <RotateCcw size={14} /> Use payroll figures
              </button>
            )}
            <button onClick={onClose} className="rounded-lg border border-[var(--border-hairline)] px-3 py-1.5 text-sm text-[var(--text-secondary)]">
              Cancel
            </button>
            <button onClick={submit} disabled={busy} className="rounded-lg bg-[var(--series-1)] px-3 py-1.5 text-sm font-medium text-[var(--on-accent)] disabled:opacity-40">
              {busy ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
