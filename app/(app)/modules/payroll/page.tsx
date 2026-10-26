"use client";

import { useApplyApprovedCorrections } from "@/components/attendance/useApplyApprovedCorrections";
import { useMemo, useRef, useState } from "react";
import { AlertTriangle, FileCheck2, Lock, LockOpen, Pencil, Upload, Wallet } from "lucide-react";
import { useHris } from "@/lib/store";
import { useSelectedPayrollPeriod } from "@/lib/use-payroll-period";
import { PageHeader } from "@/components/PageHeader";
import { StatTile } from "@/components/StatTile";
import { Badge, type BadgeTone } from "@/components/Badge";
import { EmptyState } from "@/components/EmptyState";
import { Modal } from "@/components/Modal";
import Link from "next/link";
import { branchName, formatCurrencyCompact, formatDate, fullName, positionTitle } from "@/lib/helpers";
import { payrollByBranch, payrollColumns, payrollLabel, payrollLeadColumn } from "@/lib/payroll-layout";
import { computePayrollForPeriod, payrollLineToSummary, summarizePayrollLines, type PayrollLine } from "@/lib/payroll";
import { toCsv, downloadCsv } from "@/lib/monthly-analytics";
import { buildPayrollImportPreview, guessPeriodFromName, parsePayrollWorkbook, type ParsedPayrollWorkbook } from "@/lib/payroll-import";
import { currentCompany } from "@/lib/companies";
import { parseLsmbizPayrollWorkbook } from "@/lib/payroll-import-lsmbiz";
import { PayrollImportModal } from "@/components/payroll/PayrollImportModal";
import { MissingPeriodsBanner } from "@/components/payroll/MissingPeriodsBanner";
import type { Employee, PayrollLineOverride, PayrollPeriodStatus } from "@/lib/types";

const STATUS_TONE: Record<PayrollPeriodStatus, BadgeTone> = {
  open: "good",
  locked: "warning",
  closed: "muted",
};

export default function PayrollProcessingPage() {
  const {
    employees,
    payrollPeriods,
    attendancePeriodRecords,
    overtimeRequests,
    payrollLineOverrides,
    salaryAdjustments,
    upsertPayrollLineOverride,
    importPayrollRegister,
    setPayrollPeriodStatus,
    generatedPayslips,
    addGeneratedPayslip,
    updateGeneratedPayslip,
    currentUser,
  } = useHris();
  // Approved attendance corrections update biometrics attendance.
  useApplyApprovedCorrections();
  const canManage = currentUser?.roles.some((r) => ["hr_admin", "payroll_officer"].includes(r));

  const { period, periodId, setPeriodId } = useSelectedPayrollPeriod();
  const [editing, setEditing] = useState<Employee | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importFile, setImportFile] = useState<{ name: string; sheets: ParsedPayrollWorkbook[]; sheetIndex: number } | null>(null);
  const [importPeriodId, setImportPeriodId] = useState("");
  const [importError, setImportError] = useState<string | null>(null);
  const [importSaving, setImportSaving] = useState(false);
  const [removeNotInFile, setRemoveNotInFile] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [generateNotice, setGenerateNotice] = useState<{ tone: "good" | "info" | "error"; text: string } | null>(null);
  const importPeriod = payrollPeriods.find((p) => p.id === importPeriodId);
  const importPreview = useMemo(
    () => (importFile && importPeriod ? buildPayrollImportPreview(importFile.sheets[importFile.sheetIndex], employees, importPeriod, attendancePeriodRecords, payrollLineOverrides) : null),
    [importFile, importPeriod, employees, attendancePeriodRecords, payrollLineOverrides],
  );
  // People who already have payroll saved for the target period but aren't in
  // this file — left in place, they'd still be counted (and paid) for it.
  const notInFile = useMemo(() => {
    if (!importPreview || !importPeriodId) return [];
    const inFile = new Set(importPreview.matched.map((m) => m.employee.id));
    const saved = new Set([...attendancePeriodRecords, ...payrollLineOverrides].filter((r) => r.periodId === importPeriodId).map((r) => r.employeeId));
    return employees.filter((e) => saved.has(e.id) && !inFile.has(e.id));
  }, [importPreview, importPeriodId, attendancePeriodRecords, payrollLineOverrides, employees]);

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setImportError(null);
    try {
      const buffer = await file.arrayBuffer();
      const format = currentCompany().payrollImportFormat;
      const lsmbizFormat = format !== undefined;
      const parsed = format ? await parseLsmbizPayrollWorkbook(buffer, employees, format) : await parsePayrollWorkbook(buffer);
      // Daro uploads the whole workbook at once — all branches (the first
      // choice), with no single-sheet options.
      const sheets = payrollByBranch() ? parsed.slice(0, 1) : parsed;
      // With several payroll sheets, start on the one matching the file name's
      // period (e.g. "May 16-30.xlsx" → the "MAY 30" sheet), else the last one.
      const fromFileName = guessPeriodFromName(file.name, payrollPeriods);
      const matching = fromFileName ? sheets.findIndex((s) => guessPeriodFromName(s.sheetName, payrollPeriods)?.id === fromFileName.id) : -1;
      // LSMBiz / Daro: the first choice is the whole cut-off (all its sheets).
      const sheetIndex = matching >= 0 ? matching : lsmbizFormat ? 0 : sheets.length - 1;
      const guessed = guessPeriodFromName(sheets[sheetIndex].sheetName, payrollPeriods) ?? fromFileName;
      setImportPeriodId(guessed?.id ?? period?.id ?? "");
      setImportFile({ name: file.name, sheets, sheetIndex });
      setRemoveNotInFile(true);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Could not read this file.");
    }
  }

  async function confirmImport() {
    if (!importPreview || !importPeriodId) return;
    setImportSaving(true);
    const error = await importPayrollRegister(
      importPeriodId,
      importPreview.matched.map((m) => ({ attendance: m.attendance, override: { ...m.override, employeeId: m.employee.id } })),
      removeNotInFile ? notInFile.map((e) => e.id) : [],
    );
    setImportSaving(false);
    if (error) {
      setImportError(error);
      return;
    }
    setImportFile(null);
    setImportError(null);
    setPeriodId(importPeriodId);
  }

  const lines = useMemo(
    () => (period ? computePayrollForPeriod(period, employees, attendancePeriodRecords, overtimeRequests, payrollLineOverrides, salaryAdjustments) : []),
    [period, employees, attendancePeriodRecords, overtimeRequests, payrollLineOverrides, salaryAdjustments],
  );
  const summary = summarizePayrollLines(lines);
  const byId = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);
  const lineByEmployee = new Map(lines.map((l) => [l.employeeId, l]));

  // Payroll Processing is always presented sorted alphabetically by surname.
  const sortedLines = useMemo(
    () => [...lines].sort((a, b) => (byId.get(a.employeeId)?.lastName ?? "").localeCompare(byId.get(b.employeeId)?.lastName ?? "")),
    [lines, byId],
  );

  // Columns follow the company's own payroll sheet (lib/payroll-layout.ts).
  const columns = useMemo(() => payrollColumns(sortedLines), [sortedLines]);
  const leadColumn = payrollLeadColumn();
  const sumColumns = (ls: PayrollLine[]) => columns.map((c) => ls.reduce((sum, l) => sum + c.value(l), 0));
  const columnTotals = sumColumns(sortedLines);
  // Daro: one section per branch (by name), each with a subtotal.
  const branchGroups = useMemo(() => {
    if (!payrollByBranch()) return [{ branchId: "", lines: sortedLines }];
    const groups = new Map<string, PayrollLine[]>();
    for (const l of sortedLines) {
      const id = byId.get(l.employeeId)?.branchId ?? "";
      groups.set(id, [...(groups.get(id) ?? []), l]);
    }
    return [...groups].map(([branchId, ls]) => ({ branchId, lines: ls })).sort((a, b) => branchName(a.branchId).localeCompare(branchName(b.branchId)));
  }, [sortedLines, byId]);

  const existingSlips = period ? new Map(generatedPayslips.filter((p) => p.periodId === period.id).map((p) => [p.employeeId, p])) : new Map<string, (typeof generatedPayslips)[number]>();

  // Creates missing payslips and refreshes ones whose figures no longer match
  // the payroll (e.g. the payroll was re-imported after generating).
  async function generatePayslips() {
    if (!period || generating) return;
    const periodName = `${formatDate(period.start)} – ${formatDate(period.end)}`;
    if (lines.length === 0) {
      setGenerateNotice({ tone: "info", text: `There's no one on the payroll for ${periodName} yet — import the payroll Excel for this period first.` });
      return;
    }
    const toCreate = lines.filter((line) => !existingSlips.has(line.employeeId));
    const toUpdate = lines
      .map((line) => ({ line, slip: existingSlips.get(line.employeeId) }))
      .filter((x): x is { line: PayrollLine; slip: NonNullable<typeof x.slip> } => !!x.slip && !sameSummary(x.slip.summary, payrollLineToSummary(x.line)));
    if (toCreate.length === 0 && toUpdate.length === 0) {
      setGenerateNotice({ tone: "info", text: `All ${lines.length} payslips for ${periodName} are already generated and up to date — nothing to change.` });
      return;
    }
    setGenerating(true);
    setGenerateNotice(null);
    const [created, updated] = await Promise.all([
      Promise.all(toCreate.map((line) => addGeneratedPayslip({ periodId: period.id, employeeId: line.employeeId, summary: payrollLineToSummary(line) }))),
      Promise.all(toUpdate.map(({ line, slip }) => updateGeneratedPayslip(slip.id, payrollLineToSummary(line)))),
    ]);
    setGenerating(false);
    const nCreated = created.filter(Boolean).length;
    const nUpdated = updated.filter(Boolean).length;
    const failed = created.length + updated.length - nCreated - nUpdated;
    const upToDate = lines.length - toCreate.length - toUpdate.length;
    const parts = [nCreated && `generated ${nCreated} new`, nUpdated && `updated ${nUpdated} out-of-date`, upToDate && `${upToDate} already up to date`].filter(Boolean);
    setGenerateNotice({
      tone: failed ? "error" : "good",
      text:
        `Payslips for ${periodName}: ${parts.join(", ")}` +
        (failed ? `; ${failed} couldn't be saved — try again.` : ". Employees can now see them under Payslips."),
    });
  }

  function exportCsv() {
    if (!period) return;
    if (leadColumn === "position") {
      // The company's own layout: the same columns as on screen.
      const custom = toCsv(
        ["Employee", "Branch", "Position", ...columns.map((c) => c.label)],
        branchGroups.flatMap((g) => g.lines).map((l) => {
          const emp = byId.get(l.employeeId);
          return [emp ? fullName(emp) : l.employeeId, emp ? branchName(emp.branchId) : "", emp ? positionTitle(emp.positionId) : "", ...columns.map((c) => c.value(l))];
        }),
      );
      downloadCsv(`payroll-${period.id}.csv`, custom);
      return;
    }
    const csv = toCsv(
      [
        "Employee",
        "Branch",
        "Payroll Type",
        "Rate/Day",
        "Days Working",
        "Basic Pay",
        "Late Deduction",
        "Undertime Deduction",
        "Holiday Pay",
        "VL Pay",
        "SL Pay",
        "OT Pay",
        "Net Allowances",
        "Gross Salary",
        "SSS Contribution",
        "SSS WISP",
        "PhilHealth Contribution",
        "Pag-IBIG Contribution",
        "Withholding Tax",
        "Cash Advance",
        "LSM Biz Loan",
        "LSM Coop Loan",
        "Shortage Deduction",
        "SSS Loan",
        "Pag-IBIG Loan",
        "Pag-IBIG MP2 Savings",
        "Adjustment (Deduction)",
        "Adjustment (Additional)",
        "Net Pay",
      ],
      sortedLines.map((l) => {
        const emp = byId.get(l.employeeId);
        return [
          emp ? fullName(emp) : l.employeeId,
          emp ? branchName(emp.branchId) : "",
          l.payrollType === "daily" ? "Daily-rate" : "Fixed-rate",
          l.ratePerDay,
          l.daysWorking,
          l.basicPay,
          l.latesUndertime,
          l.undertimeDeduction,
          l.holidayPay,
          l.vlPay,
          l.slPay,
          l.otPay,
          l.netAllowances,
          l.grossSalary,
          l.sssContribution,
          l.sssWisp,
          l.philHealthContribution,
          l.hdmfContribution,
          l.withholdingTax,
          l.cashAdvance,
          l.lsmBizLoan,
          l.lsmCoopLoan,
          l.shortages,
          l.sssLoan,
          l.hdmfLoan,
          l.hdmfMp2Savings,
          l.adjustmentDeduct,
          l.adjustmentAdd,
          l.netPay,
        ];
      }),
    );
    downloadCsv(`payroll-${period.id}.csv`, csv);
  }

  // The totals row, shown under the header and again at the bottom.
  const totalRow = (border: string, totals = columnTotals, label = "Total", subtotal = false) => (
    <tr className={`${border} border-[var(--border-hairline)] font-semibold ${subtotal ? "text-[var(--text-secondary)]" : "text-[var(--text-primary)]"}`}>
      <td className="sticky left-0 z-10 whitespace-nowrap bg-[var(--surface-1)] shadow-[inset_-1px_0_0_var(--border-hairline)] px-3 py-2">{label}</td>
      <td className="px-3 py-2"></td>
      {columns.map((c, i) => (
        <td key={c.key} className="tabular whitespace-nowrap px-3 py-2">
          {c.style === "count" ? totals[i] : formatCurrencyCompact(totals[i])}
        </td>
      ))}
      <td className="px-3 py-2"></td>
      <td className="px-3 py-2"></td>
    </tr>
  );

  return (
    <div>
      <PageHeader
        title="Payroll Processing"
        subtitle="Computed automatically from attendance and approved overtime records for the selected payroll period — every figure remains editable per employee, including attendance, rate, and statutory contributions."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {canManage && (
              <>
                <input ref={fileInputRef} type="file" accept=".xlsx" className="hidden" onChange={handleImportFile} />
                <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-1.5 rounded-lg border border-[var(--border-hairline)] px-3 py-2 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40">
                  <Upload size={16} /> Import Excel
                </button>
              </>
            )}
            <button onClick={exportCsv} className="rounded-lg border border-[var(--border-hairline)] px-3 py-2 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40">Export CSV</button>
            {canManage && period && (
              <>
                {period.status === "open" && (
                  <button onClick={() => setPayrollPeriodStatus(period.id, "locked")} className="flex items-center gap-1.5 rounded-lg border border-[var(--border-hairline)] px-3 py-2 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40">
                    <Lock size={16} /> Lock period
                  </button>
                )}
                {period.status === "locked" && (
                  <button onClick={() => setPayrollPeriodStatus(period.id, "open")} className="flex items-center gap-1.5 rounded-lg border border-[var(--border-hairline)] px-3 py-2 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40">
                    <LockOpen size={16} /> Unlock
                  </button>
                )}
                {period.status !== "open" && (
                  <button onClick={generatePayslips} disabled={generating} className="flex items-center gap-1.5 rounded-lg bg-[var(--series-1)] px-3 py-2 text-sm font-medium text-[var(--on-accent)] disabled:opacity-60">
                    <FileCheck2 size={16} /> {generating ? "Generating…" : "Generate payslips"}
                  </button>
                )}
              </>
            )}
          </div>
        }
      />

      {canManage && <MissingPeriodsBanner />}

      {generateNotice && (
        <div
          className={`mb-4 flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm ${
            generateNotice.tone === "error"
              ? "border-[var(--status-critical)]/40 text-[var(--status-critical)]"
              : generateNotice.tone === "good"
                ? "border-[var(--status-good)]/40 text-[var(--status-good)]"
                : "border-[var(--border-hairline)] text-[var(--text-secondary)]"
          }`}
        >
          <span>
            {generateNotice.text}{" "}
            <Link href="/modules/payslips" className="font-medium underline">
              View payslips
            </Link>
          </span>
          <button onClick={() => setGenerateNotice(null)} className="shrink-0 text-xs text-[var(--text-muted)]" aria-label="Dismiss">
            Dismiss
          </button>
        </div>
      )}

      {importError && !importFile && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-[var(--status-critical)]/40 bg-[color-mix(in_srgb,var(--status-critical)_10%,transparent)] px-3 py-2 text-sm text-[var(--status-critical)]">
          <AlertTriangle size={16} className="shrink-0" /> {importError}
        </div>
      )}

      {importFile && importPreview && (
        <PayrollImportModal
          preview={importPreview}
          fileName={importFile.name}
          sheetNames={importFile.sheets.map((s) => s.sheetName)}
          sheetIndex={importFile.sheetIndex}
          onSheetChange={(i) => {
            setImportFile((f) => (f ? { ...f, sheetIndex: i } : f));
            const guessed = guessPeriodFromName(importFile.sheets[i].sheetName, payrollPeriods);
            if (guessed) setImportPeriodId(guessed.id);
          }}
          notInFile={notInFile}
          removeNotInFile={removeNotInFile}
          onRemoveNotInFileChange={setRemoveNotInFile}
          periodHasData={(id) => attendancePeriodRecords.some((r) => r.periodId === id) || payrollLineOverrides.some((r) => r.periodId === id)}
          payrollPeriods={payrollPeriods}
          targetPeriodId={importPeriodId}
          onTargetPeriodChange={setImportPeriodId}
          saving={importSaving}
          error={importError}
          onCancel={() => {
            setImportFile(null);
            setImportError(null);
          }}
          onConfirm={confirmImport}
        />
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select value={periodId || period?.id} onChange={(e) => setPeriodId(e.target.value)} className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-2 text-sm">
          {payrollPeriods.map((p) => (
            <option key={p.id} value={p.id}>{formatDate(p.start)} – {formatDate(p.end)}</option>
          ))}
        </select>
        {period && <Badge tone={STATUS_TONE[period.status]}>{period.status}</Badge>}
      </div>

      {!period ? (
        <EmptyState icon={Wallet} title="No payroll periods configured" description="Add a payroll period in System Administration to begin processing." />
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile label="Employees covered" value={lines.length.toString()} />
            <StatTile label="Gross pay" value={formatCurrencyCompact(summary.grossPay)} />
            <StatTile label="Total deductions" value={formatCurrencyCompact(summary.totalDeductions)} />
            <StatTile label="Net pay" value={formatCurrencyCompact(summary.netPay)} />
          </div>

          <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-1)] p-4">
            <div className="mb-3 text-sm font-medium text-[var(--text-primary)]">Payroll register — {formatDate(period.start)} – {formatDate(period.end)} (sorted A–Z by surname)</div>
            {sortedLines.length === 0 ? (
              <EmptyState
                icon={Wallet}
                title="No attendance data for this period yet"
                description="Import this period's payroll file with Import Excel, or import/enter attendance in the Attendance module — payroll is computed from it."
              />
            ) : (
              <div className="max-h-[75vh] overflow-auto">
                <table className="payroll-register w-full min-w-[2400px] text-sm">
                  <thead className="sticky top-0 z-20 bg-[var(--surface-1)] shadow-[inset_0_-1px_0_var(--border-hairline)]">
                    <tr className="border-b border-[var(--border-hairline)] text-left text-xs text-[var(--text-muted)]">
                      <th className="sticky left-0 z-30 whitespace-nowrap bg-[var(--surface-1)] shadow-[inset_-1px_0_0_var(--border-hairline)] px-3 py-2 font-medium">Employee</th>
                      <th className="px-3 py-2 font-medium">{leadColumn === "position" ? "Position" : "Type"}</th>
                      {columns.map((c) => (
                        <th key={c.key} className="whitespace-nowrap px-3 py-2 font-medium">
                          {c.label}
                        </th>
                      ))}
                      <th className="px-3 py-2 font-medium">Payslip</th>
                      <th className="px-3 py-2 font-medium"></th>
                    </tr>
                    {totalRow("border-b-2")}
                  </thead>
                  {branchGroups.map((group) => (
                  <tbody key={group.branchId || "all"}>
                    {payrollByBranch() && (
                      <tr className="border-b border-[var(--border-hairline)] bg-[var(--accent-soft)]">
                        <td colSpan={columns.length + 4} className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--accent)]">
                          <span className="sticky left-3">{group.branchId ? branchName(group.branchId) : "No branch"} · {group.lines.length} {group.lines.length === 1 ? "employee" : "employees"}</span>
                        </td>
                      </tr>
                    )}
                    {group.lines.map((l) => {
                      const emp = byId.get(l.employeeId);
                      return (
                        <tr key={l.employeeId} className="border-b border-[var(--gridline)] last:border-0">
                          <td className="sticky left-0 z-10 whitespace-nowrap bg-[var(--surface-1)] shadow-[inset_-1px_0_0_var(--border-hairline)] px-3 py-2 text-[var(--text-primary)]">
                            {emp ? fullName(emp) : l.employeeId}
                            {l.salaryAdjustmentNet !== 0 && (
                              <span title="Includes a salary adjustment (see Vouchers → Salary adjustments)" className="ml-1.5 inline-block rounded bg-[var(--status-warning)]/15 px-1.5 py-0.5 align-middle text-[10px] font-semibold text-[var(--status-warning)]">
                                ADJ {l.salaryAdjustmentNet > 0 ? "+" : "−"}{formatCurrencyCompact(Math.abs(l.salaryAdjustmentNet))}
                              </span>
                            )}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 text-xs text-[var(--text-secondary)]">
                            {leadColumn === "position" ? (emp ? positionTitle(emp.positionId) : "") : l.payrollType === "daily" ? "Daily-rate" : "Fixed-rate"}
                          </td>
                          {columns.map((c) => {
                            const v = c.value(l);
                            if (c.style === "deduct") return <td key={c.key} className="tabular whitespace-nowrap px-3 py-2 text-[var(--status-critical)]">{v ? `-${formatCurrencyCompact(v)}` : "—"}</td>;
                            if (c.style === "strong") return <td key={c.key} className="tabular whitespace-nowrap px-3 py-2 font-medium text-[var(--text-primary)]">{formatCurrencyCompact(v)}</td>;
                            if (c.style === "count") return <td key={c.key} className="tabular whitespace-nowrap px-3 py-2 text-[var(--text-secondary)]">{v}</td>;
                            if (c.style === "dash") return <td key={c.key} className="tabular whitespace-nowrap px-3 py-2 text-[var(--text-secondary)]">{v ? formatCurrencyCompact(v) : "—"}</td>;
                            return <td key={c.key} className="tabular whitespace-nowrap px-3 py-2 text-[var(--text-secondary)]">{formatCurrencyCompact(v)}</td>;
                          })}
                          <td className="px-3 py-2">
                            {(() => {
                              const slip = existingSlips.get(l.employeeId);
                              if (!slip) return <Badge tone="muted">Not released</Badge>;
                              return sameSummary(slip.summary, payrollLineToSummary(l)) ? <Badge tone="good">Released</Badge> : <Badge tone="warning">Payslip out of date</Badge>;
                            })()}
                          </td>
                          <td className="px-3 py-2">
                            {canManage && emp && (
                              <button onClick={() => setEditing(emp)} className="flex items-center gap-1 rounded-lg border border-[var(--border-hairline)] px-2 py-1 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40">
                                <Pencil size={12} /> Edit
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    {payrollByBranch() && totalRow("border-b-2", sumColumns(group.lines), `${group.branchId ? branchName(group.branchId) : "No branch"} subtotal`, true)}
                  </tbody>
                  ))}
                  <tfoot>
                    {totalRow("border-t-2")}
                  </tfoot>
                </table>
              </div>
            )}
            <div className="mt-3 text-right text-xs">
              <Link href="/modules/attendance" className="text-[var(--series-1)] hover:underline">Manage attendance for this period →</Link>
            </div>
          </div>
        </>
      )}

      {editing && period && (
        <PayrollLineEditModal
          employee={editing}
          period={period}
          line={lineByEmployee.get(editing.id) ?? null}
          overrides={payrollLineOverrides}
          onClose={() => setEditing(null)}
          onSaveOverride={(input) => {
            upsertPayrollLineOverride(input);
          }}
        />
      )}
    </div>
  );
}

type OverrideFormData = Omit<PayrollLineOverride, "id" | "updatedBy" | "updatedAt">;

function defaultOverrideForm(periodId: string, employeeId: string, overrides: PayrollLineOverride[]): OverrideFormData {
  const existing = overrides.find((o) => o.periodId === periodId && o.employeeId === employeeId);
  if (existing) {
    const rest: Partial<PayrollLineOverride> = { ...existing };
    delete rest.id;
    delete rest.updatedBy;
    delete rest.updatedAt;
    return rest as OverrideFormData;
  }
  return {
    periodId,
    employeeId,
    travelAllowance: 0,
    laundryAllowance: 0,
    medicalCashAllowance: 0,
    supervisorAllowance: 0,
    otherAllowance2: 0,
    cashAdvance: 0,
    lsmBizLoan: 0,
    lsmCoopLoan: 0,
    shortages: 0,
    sssLoan: 0,
    hdmfLoan: 0,
    hdmfMp2Savings: 0,
    adjustmentAdd: 0,
    adjustmentDeduct: 0,
    sssContributionOverride: null,
    sssWispOverride: null,
    philHealthContributionOverride: null,
    hdmfContributionOverride: null,
    withholdingTaxOverride: null,
    dailyAllowanceOverride: null,
    basicPayOverride: null,
    latesUndertimeOverride: null,
    undertimeDeductionOverride: null,
    holidayPayOverride: null,
    vlPayOverride: null,
    slPayOverride: null,
    otHoursOverride: null,
    otPayOverride: null,
  };
}

interface AttendanceFormData {
  daysWorked: number;
  holidayDays: number;
  vlDays: number;
  slDays: number;
  lateMinutes: number;
  undertimeMinutes: number;
}

interface RateFormData {
  payrollType: Employee["payrollType"];
  dailyRate: number | null;
  monthlySalary: number | null;
}

function PayrollLineEditModal({
  employee,
  period,
  line,
  overrides,
  onClose,
  onSaveOverride,
}: {
  employee: Employee;
  period: { id: string };
  line: PayrollLine | null;
  overrides: PayrollLineOverride[];
  onClose: () => void;
  onSaveOverride: (input: OverrideFormData) => void;
}) {
  const { attendancePeriodRecords, upsertAttendancePeriodRecord, updateEmployee } = useHris();
  const attendanceRecord = attendancePeriodRecords.find((r) => r.periodId === period.id && r.employeeId === employee.id);

  const [form, setForm] = useState<OverrideFormData>(() => defaultOverrideForm(period.id, employee.id, overrides));
  const [attendance, setAttendance] = useState<AttendanceFormData>(() => ({
    daysWorked: attendanceRecord?.daysWorked ?? 0,
    holidayDays: attendanceRecord?.holidayDays ?? 0,
    vlDays: attendanceRecord?.vlDays ?? 0,
    slDays: attendanceRecord?.slDays ?? 0,
    lateMinutes: attendanceRecord?.lateMinutes ?? 0,
    undertimeMinutes: attendanceRecord?.undertimeMinutes ?? 0,
  }));
  const [rate, setRate] = useState<RateFormData>(() => ({
    payrollType: employee.payrollType,
    dailyRate: employee.dailyRate,
    monthlySalary: employee.monthlySalary,
  }));

  function setNum<K extends keyof OverrideFormData>(key: K, value: number) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function setOverride<K extends
    | "sssContributionOverride"
    | "sssWispOverride"
    | "philHealthContributionOverride"
    | "hdmfContributionOverride"
    | "withholdingTaxOverride"
    | "dailyAllowanceOverride"
    | "basicPayOverride"
    | "latesUndertimeOverride"
    | "undertimeDeductionOverride"
    | "holidayPayOverride"
    | "vlPayOverride"
    | "slPayOverride"
    | "otHoursOverride"
    | "otPayOverride">(key: K, value: number | null) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function setAttendanceField<K extends keyof AttendanceFormData>(key: K, value: number) {
    setAttendance((a) => ({ ...a, [key]: value }));
  }

  function save() {
    upsertAttendancePeriodRecord({
      periodId: period.id,
      employeeId: employee.id,
      daysWorked: attendance.daysWorked,
      holidayDays: attendance.holidayDays,
      vlDays: attendance.vlDays,
      slDays: attendance.slDays,
      lateMinutes: attendance.lateMinutes,
      undertimeMinutes: attendance.undertimeMinutes,
      notes: attendanceRecord?.notes ?? "",
    });
    updateEmployee(employee.id, {
      payrollType: rate.payrollType,
      dailyRate: rate.dailyRate,
      monthlySalary: rate.monthlySalary,
    });
    onSaveOverride(form);
    onClose();
  }

  return (
    <Modal open onClose={onClose} title={`Adjust payroll — ${fullName(employee)}`} wide>
      <div className="max-h-[70vh] space-y-5 overflow-y-auto pr-1">
        <FieldSection title="Payroll type & rate">
          <div className="grid grid-cols-2 gap-3">
            <SelectField
              label="Payroll type"
              value={rate.payrollType}
              onChange={(v) => setRate((r) => ({ ...r, payrollType: v as Employee["payrollType"] }))}
              options={[
                { value: "daily", label: "Daily-rate" },
                { value: "monthly", label: "Fixed-rate" },
              ]}
            />
            {rate.payrollType === "daily" ? (
              <NumberField label="Rate per day" value={rate.dailyRate ?? 0} onChange={(v) => setRate((r) => ({ ...r, dailyRate: v }))} />
            ) : (
              <NumberField label="Fixed monthly salary" value={rate.monthlySalary ?? 0} onChange={(v) => setRate((r) => ({ ...r, monthlySalary: v }))} />
            )}
          </div>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            {rate.payrollType === "daily"
              ? "Basic pay = rate per day × days worked."
              : "Basic pay is fixed at half the monthly salary, regardless of days worked."}
          </p>
        </FieldSection>

        <FieldSection title="Attendance for this period">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <NumberField label="Days working" value={attendance.daysWorked} onChange={(v) => setAttendanceField("daysWorked", v)} />
            <NumberField label="Holiday days" value={attendance.holidayDays} onChange={(v) => setAttendanceField("holidayDays", v)} />
            <NumberField label="VL days" value={attendance.vlDays} onChange={(v) => setAttendanceField("vlDays", v)} />
            <NumberField label="SL days" value={attendance.slDays} onChange={(v) => setAttendanceField("slDays", v)} />
            <NumberField label="Late (mins)" value={attendance.lateMinutes} onChange={(v) => setAttendanceField("lateMinutes", v)} />
            <NumberField label="Undertime raw (mins)" value={attendance.undertimeMinutes} onChange={(v) => setAttendanceField("undertimeMinutes", v)} />
            <OverrideField
              label="OT hours"
              auto={line?.otHoursAuto ?? 0}
              value={form.otHoursOverride}
              onChange={(v) => setOverride("otHoursOverride", v)}
            />
          </div>
          <p className="mt-1 text-xs text-[var(--text-muted)]">Saving here updates this employee&apos;s attendance record for the period directly. OT hours default to approved Overtime requests unless overridden.</p>
        </FieldSection>

        <FieldSection title="Earnings (auto-computed from the above — override if needed)">
          <div className="grid grid-cols-2 gap-3">
            <OverrideField label="Basic pay" auto={line?.basicPayAuto ?? 0} value={form.basicPayOverride} onChange={(v) => setOverride("basicPayOverride", v)} />
            <OverrideField label={payrollLabel("latesUndertime", "Late deduction")} auto={line?.latesUndertimeAuto ?? 0} value={form.latesUndertimeOverride} onChange={(v) => setOverride("latesUndertimeOverride", v)} />
            <OverrideField label="Undertime deduction" auto={line?.undertimeDeductionAuto ?? 0} value={form.undertimeDeductionOverride} onChange={(v) => setOverride("undertimeDeductionOverride", v)} />
            <OverrideField label="Holiday pay" auto={line?.holidayPayAuto ?? 0} value={form.holidayPayOverride} onChange={(v) => setOverride("holidayPayOverride", v)} />
            <OverrideField label={payrollLabel("vlPay", "VL pay")} auto={line?.vlPayAuto ?? 0} value={form.vlPayOverride} onChange={(v) => setOverride("vlPayOverride", v)} />
            <OverrideField label="SL pay" auto={line?.slPayAuto ?? 0} value={form.slPayOverride} onChange={(v) => setOverride("slPayOverride", v)} />
            <OverrideField label={payrollLabel("otPay", "OT pay")} auto={line?.otPayAuto ?? 0} value={form.otPayOverride} onChange={(v) => setOverride("otPayOverride", v)} />
            <OverrideField label={payrollLabel("dailyAllowance", "Daily allowance")} auto={line?.dailyAllowanceAuto ?? 0} value={form.dailyAllowanceOverride} onChange={(v) => setOverride("dailyAllowanceOverride", v)} />
          </div>
        </FieldSection>

        <FieldSection title="Other allowances">
          <div className="grid grid-cols-2 gap-3">
            <NumberField label={payrollLabel("travelAllowance", "Travel allowance")} value={form.travelAllowance} onChange={(v) => setNum("travelAllowance", v)} />
            <NumberField label="Laundry allowance" value={form.laundryAllowance} onChange={(v) => setNum("laundryAllowance", v)} />
            <NumberField label="Medical cash allowance" value={form.medicalCashAllowance} onChange={(v) => setNum("medicalCashAllowance", v)} />
            <NumberField label={payrollLabel("supervisorAllowance", "Supervisor allowance")} value={form.supervisorAllowance} onChange={(v) => setNum("supervisorAllowance", v)} />
            {currentCompany().allowanceBreakdown && (
              <NumberField label={payrollLabel("otherAllowance2", "Other allowance 2")} value={form.otherAllowance2 ?? 0} onChange={(v) => setNum("otherAllowance2", v)} />
            )}
          </div>
        </FieldSection>

        <FieldSection title="Loans / cash advance / shortages">
          <div className="grid grid-cols-2 gap-3">
            <NumberField label="Cash advance" value={form.cashAdvance} onChange={(v) => setNum("cashAdvance", v)} />
            <NumberField label={payrollLabel("lsmBizLoan", "LSM Biz Loan")} value={form.lsmBizLoan} onChange={(v) => setNum("lsmBizLoan", v)} />
            <NumberField label={payrollLabel("lsmCoopLoan", "LSM Coop Loan")} value={form.lsmCoopLoan} onChange={(v) => setNum("lsmCoopLoan", v)} />
            <NumberField label="Shortage deduction" value={form.shortages} onChange={(v) => setNum("shortages", v)} />
            <NumberField label="SSS loan" value={form.sssLoan} onChange={(v) => setNum("sssLoan", v)} />
            <NumberField label="Pag-IBIG (HDMF) loan" value={form.hdmfLoan} onChange={(v) => setNum("hdmfLoan", v)} />
            <NumberField label="Pag-IBIG (HDMF) MP2 savings" value={form.hdmfMp2Savings} onChange={(v) => setNum("hdmfMp2Savings", v)} />
          </div>
        </FieldSection>

        <FieldSection title="Statutory contributions (half of the monthly amount, every cutoff — override if needed)">
          <div className="grid grid-cols-2 gap-3">
            <OverrideField
              label="SSS contribution"
              auto={line?.sssContributionAuto ?? 0}
              value={form.sssContributionOverride}
              onChange={(v) => setOverride("sssContributionOverride", v)}
            />
            <OverrideField
              label="SSS WISP"
              auto={line?.sssWispAuto ?? 0}
              value={form.sssWispOverride}
              onChange={(v) => setOverride("sssWispOverride", v)}
            />
            <OverrideField
              label="PhilHealth contribution"
              auto={line?.philHealthContributionAuto ?? 0}
              value={form.philHealthContributionOverride}
              onChange={(v) => setOverride("philHealthContributionOverride", v)}
            />
            <OverrideField
              label="Pag-IBIG (HDMF) contribution"
              auto={line?.hdmfContributionAuto ?? 0}
              value={form.hdmfContributionOverride}
              onChange={(v) => setOverride("hdmfContributionOverride", v)}
            />
            <OverrideField
              label="Withholding tax"
              auto={line?.withholdingTax != null && form.withholdingTaxOverride == null ? line.withholdingTax : 0}
              value={form.withholdingTaxOverride}
              onChange={(v) => setOverride("withholdingTaxOverride", v)}
            />
          </div>
        </FieldSection>

        <FieldSection title="Adjustments">
          <div className="grid grid-cols-2 gap-3">
            <NumberField label={payrollLabel("adjustmentAdd", "Adjustment (add)")} value={form.adjustmentAdd} onChange={(v) => setNum("adjustmentAdd", v)} />
            <NumberField label={payrollLabel("adjustmentDeduct", "Adjustment (deduct)")} value={form.adjustmentDeduct} onChange={(v) => setNum("adjustmentDeduct", v)} />
          </div>
        </FieldSection>

        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="rounded-lg px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40">Cancel</button>
          <button onClick={save} className="rounded-lg bg-[var(--series-1)] px-3 py-1.5 text-sm font-medium text-[var(--on-accent)]">Save changes</button>
        </div>
      </div>
    </Modal>
  );
}

function FieldSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 text-xs font-semibold text-[var(--text-muted)] uppercase">{title}</div>
      {children}
    </div>
  );
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">{label}</label>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value === "" ? 0 : Number(e.target.value))}
        className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-2 text-sm"
      />
    </div>
  );
}

function SelectField({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-2 text-sm">
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
  );
}

function OverrideField({ label, auto, value, onChange }: { label: string; auto: number; value: number | null; onChange: (v: number | null) => void }) {
  const isOverridden = value !== null;
  return (
    <div>
      <label className="mb-1 flex items-center justify-between text-xs font-medium text-[var(--text-secondary)]">
        <span>{label}</span>
        <button
          type="button"
          onClick={() => onChange(isOverridden ? null : auto)}
          className="text-[10px] font-semibold text-[var(--series-1)] hover:underline"
        >
          {isOverridden ? "Use auto" : "Override"}
        </button>
      </label>
      {isOverridden ? (
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(e.target.value === "" ? 0 : Number(e.target.value))}
          className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-2 text-sm"
        />
      ) : (
        <div className="w-full rounded-lg border border-dashed border-[var(--border-hairline)] bg-[var(--gridline)]/20 px-3 py-2 text-sm text-[var(--text-muted)]">
          {formatCurrencyCompact(auto)} (auto)
        </div>
      )}
    </div>
  );
}

// Payslip snapshots vs current figures (key order doesn't matter; cents do).
function sameSummary(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    const x = a[k];
    const y = b[k];
    if (typeof x === "number" || typeof y === "number") {
      if (Math.abs(Number(x ?? 0) - Number(y ?? 0)) > 0.005) return false;
    } else if (JSON.stringify(x ?? null) !== JSON.stringify(y ?? null)) return false;
  }
  return true;
}
