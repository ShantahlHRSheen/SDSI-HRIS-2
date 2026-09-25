"use client";

import { AlertTriangle } from "lucide-react";
import { Modal } from "@/components/Modal";
import { StatTile } from "@/components/StatTile";
import { formatCurrency, formatCurrencyCompact, formatDate, fullName } from "@/lib/helpers";
import type { PayrollImportPreview } from "@/lib/payroll-import";
import type { Employee, PayrollPeriod } from "@/lib/types";

export function PayrollImportModal({
  preview,
  fileName,
  sheetNames,
  sheetIndex,
  onSheetChange,
  periodHasData,
  notInFile,
  removeNotInFile,
  onRemoveNotInFileChange,
  payrollPeriods,
  targetPeriodId,
  onTargetPeriodChange,
  saving,
  error,
  onCancel,
  onConfirm,
}: {
  preview: PayrollImportPreview;
  fileName: string;
  sheetNames: string[];
  sheetIndex: number;
  onSheetChange: (index: number) => void;
  periodHasData: (periodId: string) => boolean;
  notInFile: Employee[];
  removeNotInFile: boolean;
  onRemoveNotInFileChange: (v: boolean) => void;
  payrollPeriods: PayrollPeriod[];
  targetPeriodId: string;
  onTargetPeriodChange: (id: string) => void;
  saving: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const target = payrollPeriods.find((p) => p.id === targetPeriodId);
  const byName = preview.matched.filter((m) => m.matchedByName);

  return (
    <Modal open onClose={onCancel} title="Review payroll import" wide>
      <div className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
        <div className="rounded-lg bg-[var(--gridline)]/20 p-3 text-xs text-[var(--text-secondary)]">
          Reading sheet <span className="font-medium text-[var(--text-primary)]">&ldquo;{preview.sheetName}&rdquo;</span> of {fileName}. Every figure is saved as that employee&rsquo;s payroll line for the period and stays editable afterwards.
        </div>

        {sheetNames.length > 1 && (
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Sheet to import</label>
            <select value={sheetIndex} onChange={(e) => onSheetChange(Number(e.target.value))} className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-2 text-sm">
              {sheetNames.map((n, i) => (
                <option key={i} value={i}>
                  {n}
                </option>
              ))}
            </select>
            <div className="mt-1.5 text-xs text-[var(--status-warning)]">This workbook has {sheetNames.length} payroll sheets ({sheetNames.join(", ")}) — make sure the right one is selected.</div>
          </div>
        )}

        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Apply to payroll period</label>
          <select value={targetPeriodId} onChange={(e) => onTargetPeriodChange(e.target.value)} className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-2 text-sm">
            {payrollPeriods.map((p) => (
              <option key={p.id} value={p.id}>
                {formatDate(p.start)} – {formatDate(p.end)} ({p.status})
              </option>
            ))}
          </select>
          {target && periodHasData(target.id) && (
            <div className="mt-1.5 text-xs font-medium text-[var(--status-critical)]">
              {formatDate(target.start)} – {formatDate(target.end)} already has payroll saved. Importing replaces it — check this is the right period and sheet.
            </div>
          )}
          {target && target.status !== "open" && (
            <div className="mt-1.5 text-xs text-[var(--status-warning)]">This period is {target.status} — importing will change its payroll figures.</div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile label="Employees" value={preview.matched.length.toString()} />
          <StatTile label="Gross pay" value={formatCurrencyCompact(preview.totals.gross)} />
          <StatTile label="Deductions" value={formatCurrencyCompact(preview.totals.deductions)} />
          <StatTile label="Net pay" value={formatCurrencyCompact(preview.totals.net)} />
        </div>

        {notInFile.length > 0 && (
          <Notice tone="critical" title={`${notInFile.length} ${notInFile.length === 1 ? "person has" : "people have"} payroll saved for this period but ${notInFile.length === 1 ? "isn't" : "aren't"} in this file`}>
            <div className="mb-2">{notInFile.map((e) => `${fullName(e)} (${e.employeeNumber})`).join(", ")}</div>
            <label className="flex items-start gap-2 font-medium">
              <input type="checkbox" checked={removeNotInFile} onChange={(e) => onRemoveNotInFileChange(e.target.checked)} className="mt-0.5" />
              <span>Remove them from this period&rsquo;s payroll (and their payslips for it), so the totals match this file.</span>
            </label>
            {!removeNotInFile && <div className="mt-1">They&rsquo;ll stay on this period&rsquo;s payroll and be added to its totals.</div>}
          </Notice>
        )}

        {preview.replacing > 0 && (
          <Notice tone="warning" title={`Replaces existing payroll figures for ${preview.replacing} employee(s)`}>
            They already have attendance or payroll entries in this period — the file&rsquo;s figures will overwrite them.
          </Notice>
        )}

        {preview.netMismatches.length > 0 && (
          <Notice tone="critical" title={`Net pay won't match the file (${preview.netMismatches.length})`}>
            <ul className="space-y-0.5">
              {preview.netMismatches.map((m) => (
                <li key={m.employee.id}>
                  {fullName(m.employee)} — file {formatCurrency(m.parsed.values.netPay)}, system {formatCurrency(m.computedNetPay)}
                </li>
              ))}
            </ul>
          </Notice>
        )}

        {preview.inconsistent.length > 0 && (
          <Notice tone="warning" title={`Rows whose own totals don't add up (${preview.inconsistent.length})`}>
            <ul className="space-y-0.5">
              {preview.inconsistent.map((r) => (
                <li key={r.parsed.rowNumber}>
                  Row {r.parsed.rowNumber} ({r.parsed.employeeNumber} {r.parsed.rawName}) — {r.reason}
                </li>
              ))}
            </ul>
            <div className="mt-1.5 text-[var(--text-muted)]">Often a formula Excel didn&rsquo;t recalculate — open the file, let it recalculate, save, and import again.</div>
          </Notice>
        )}

        {byName.length > 0 && (
          <Notice tone="neutral" title={`Matched by name — employee number didn't match (${byName.length})`}>
            <ul className="space-y-0.5">
              {byName.map((m) => (
                <li key={m.employee.id}>
                  &ldquo;{m.parsed.employeeNumber}&rdquo; {m.parsed.rawName} → {m.employee.employeeNumber} {fullName(m.employee)}
                </li>
              ))}
            </ul>
          </Notice>
        )}

        {(preview.unmatched.length > 0 || preview.duplicates.length > 0) && (
          <Notice tone="neutral" title={`Not imported (${preview.unmatched.length + preview.duplicates.length})`}>
            <ul className="space-y-0.5">
              {preview.unmatched.map((r) => (
                <li key={r.rowNumber}>Row {r.rowNumber}: {r.employeeNumber} {r.rawName} — no matching employee</li>
              ))}
              {preview.duplicates.map((r) => (
                <li key={r.rowNumber}>Row {r.rowNumber}: {r.employeeNumber} {r.rawName} — same employee appears earlier in the file</li>
              ))}
            </ul>
          </Notice>
        )}

        {preview.missingFromFile.length > 0 && (
          <Notice tone="neutral" title={`Active employees not in this file (${preview.missingFromFile.length})`}>
            {preview.missingFromFile.map((e) => fullName(e)).join(", ")}
          </Notice>
        )}

        {error && <Notice tone="critical" title="Import failed">{error}</Notice>}
      </div>

      <div className="flex justify-end gap-2 pt-4">
        <button onClick={onCancel} className="rounded-lg px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40">Cancel</button>
        <button
          onClick={onConfirm}
          disabled={saving || !targetPeriodId || preview.matched.length === 0}
          className="rounded-lg bg-[var(--series-1)] px-3 py-1.5 text-sm font-medium text-[var(--on-accent)] disabled:opacity-40"
        >
          {saving ? "Importing…" : `Import ${preview.matched.length} employee(s)`}
        </button>
      </div>
    </Modal>
  );
}

function Notice({ tone, title, children }: { tone: "warning" | "critical" | "neutral"; title: string; children: React.ReactNode }) {
  const color = tone === "neutral" ? null : tone === "warning" ? "var(--status-warning)" : "var(--status-critical)";
  return (
    <div
      className="rounded-lg border p-3"
      style={color ? { borderColor: `color-mix(in srgb, ${color} 40%, transparent)`, background: `color-mix(in srgb, ${color} 10%, transparent)` } : { borderColor: "var(--border-hairline)" }}
    >
      <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium" style={{ color: color ?? "var(--text-primary)" }}>
        {color && <AlertTriangle size={14} />} {title}
      </div>
      <div className="text-xs text-[var(--text-secondary)]">{children}</div>
    </div>
  );
}
