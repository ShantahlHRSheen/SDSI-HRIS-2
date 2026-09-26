"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Check, Pencil, Plus, Printer, Trash2, X } from "lucide-react";
import { formatCurrency, formatDate, fullName } from "@/lib/helpers";
import { SALARY_ADJUSTMENT_COMPONENTS, componentKind, componentLabel, netEffect, type SalaryAdjustment, type SalaryAdjustmentComponent } from "@/lib/salary-adjustments";
import type { Employee, PayrollPeriod } from "@/lib/types";

const signed = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${formatCurrency(Math.abs(n))}`;
const input = "w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-2.5 py-1.5 text-sm";
const amountOk = (v: string) => v.trim() !== "" && Number.isFinite(Number(v)) && Number(v) !== 0 && Math.abs(Number(v)) < 1e8;
const round2 = (n: number) => Math.round(n * 100) / 100;

export const SALARY_ADJUSTMENT_VOUCHER_TITLE = "Salary Adjustment Voucher";

// Name shown in the employee picker — the employee number keeps two people
// with the same name apart.
const pickLabel = (e: Employee) => `${fullName(e)} · ${e.employeeNumber}`;

export function SalaryAdjustmentEditor({
  period,
  adjustments,
  employees,
  payrollEmployeeIds,
  canManage,
  loadError,
  onAdd,
  onEdit,
  onRemove,
  onPrint,
}: {
  period: PayrollPeriod;
  adjustments: SalaryAdjustment[];
  employees: Employee[];
  // Employees on this period's payroll — only they can be adjusted.
  payrollEmployeeIds: Set<string>;
  canManage: boolean;
  loadError: string | null;
  onAdd: (a: { employeeId: string; component: SalaryAdjustmentComponent; amount: number; description: string }) => Promise<boolean>;
  onEdit: (id: string, patch: { component: SalaryAdjustmentComponent; amount: number; description: string }) => Promise<boolean>;
  onRemove: (id: string) => Promise<boolean>;
  onPrint: () => void;
}) {
  const byId = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);
  const pickable = useMemo(() => employees.filter((e) => payrollEmployeeIds.has(e.id)).sort((a, b) => fullName(a).localeCompare(fullName(b))), [employees, payrollEmployeeIds]);
  const [draft, setDraft] = useState({ employee: "", component: "basic_pay" as SalaryAdjustmentComponent, amount: "", description: "" });
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<{ id: string; component: SalaryAdjustmentComponent; amount: string; description: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const draftEmployee = useMemo(() => {
    const v = draft.employee.trim().toLowerCase();
    if (!v) return null;
    return employees.find((e) => pickLabel(e).toLowerCase() === v) ?? employees.find((e) => fullName(e).toLowerCase() === v || e.employeeNumber.toLowerCase() === v) ?? null;
  }, [draft.employee, employees]);
  const draftInPayroll = !!draftEmployee && payrollEmployeeIds.has(draftEmployee.id);
  const canAdd = draftInPayroll && amountOk(draft.amount) && draft.description.trim().length > 0 && !adding;

  const netTotal = round2(adjustments.reduce((s, a) => s + netEffect(a), 0));
  const people = new Set(adjustments.map((a) => a.employeeId)).size;

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!canAdd || !draftEmployee) return;
    setAdding(true);
    const ok = await onAdd({ employeeId: draftEmployee.id, component: draft.component, amount: round2(Number(draft.amount)), description: draft.description.trim() });
    setAdding(false);
    if (ok) setDraft({ ...draft, employee: "", amount: "", description: "" });
  }

  async function saveEdit() {
    if (!editing || !amountOk(editing.amount) || !editing.description.trim()) return;
    const ok = await onEdit(editing.id, { component: editing.component, amount: round2(Number(editing.amount)), description: editing.description.trim() });
    if (ok) setEditing(null);
  }

  return (
    <div className="mt-4 rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-1)] p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-base font-semibold text-[var(--text-primary)]">{SALARY_ADJUSTMENT_VOUCHER_TITLE}</div>
          <div className="text-xs text-[var(--text-muted)]">
            {formatDate(period.start)} – {formatDate(period.end)} · {adjustments.length} adjustment{adjustments.length === 1 ? "" : "s"} for {people} employee
            {people === 1 ? "" : "s"} · Total {signed(netTotal)} (before tax)
          </div>
        </div>
        <button
          onClick={onPrint}
          disabled={!adjustments.length}
          className="flex items-center gap-1.5 rounded-lg border border-[var(--border-hairline)] px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40 disabled:opacity-40"
        >
          <Printer size={15} /> Print voucher
        </button>
      </div>

      <p className="mb-3 text-xs text-[var(--text-secondary)]">
        Adjust any part of an employee&rsquo;s pay for this period. The adjustment is added to that part of their payroll in Payroll Processing, and their payslip shows it as a
        salary adjustment with the reason. If payslips for this period were already released, click <strong>Generate payslips</strong> in Payroll Processing to update them.
        Withholding tax is recomputed automatically when a taxable part (like basic pay) changes, so the final net pay change can differ slightly.
      </p>

      {loadError && (
        <div className="mb-3 flex items-start gap-2 rounded-lg border border-[var(--status-warning)]/40 bg-[var(--status-warning)]/10 p-3 text-sm text-[var(--text-primary)]">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-[var(--status-warning)]" />
          <div>
            Salary adjustments aren&rsquo;t set up in the database yet. Run <code>supabase/migrate_phase19_salary_adjustments.sql</code> in the Supabase SQL Editor, then refresh.
            <div className="text-xs text-[var(--text-muted)]">{loadError}</div>
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-[var(--border-hairline)] text-left text-xs text-[var(--text-muted)]">
              <th className="w-8 px-2 py-2 font-medium">#</th>
              <th className="px-2 py-2 font-medium">Employee</th>
              <th className="px-2 py-2 font-medium">Part of payroll</th>
              <th className="px-2 py-2 font-medium">Reason</th>
              <th className="w-32 px-2 py-2 text-right font-medium">Amount</th>
              <th className="w-32 px-2 py-2 text-right font-medium">Effect on pay</th>
              {canManage && <th className="w-24 px-2 py-2" />}
            </tr>
          </thead>
          <tbody>
            {adjustments.map((a, i) => {
              const emp = byId.get(a.employeeId);
              const name = emp ? fullName(emp) : a.employeeId;
              if (editing?.id === a.id)
                return (
                  <tr key={a.id} className="border-b border-[var(--gridline)]">
                    <td className="px-2 py-1.5 text-[var(--text-muted)]">{i + 1}</td>
                    <td className="px-2 py-1.5 text-[var(--text-primary)]">{name}</td>
                    <td className="px-2 py-1.5">
                      <ComponentSelect value={editing.component} onChange={(component) => setEditing({ ...editing, component })} />
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        value={editing.description}
                        onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                        maxLength={300}
                        className={input}
                        aria-label="Reason"
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        value={editing.amount}
                        onChange={(e) => setEditing({ ...editing, amount: e.target.value })}
                        inputMode="decimal"
                        className={`${input} text-right`}
                        aria-label="Amount"
                      />
                    </td>
                    <td className="tabular px-2 py-1.5 text-right text-[var(--text-secondary)]">
                      {amountOk(editing.amount) ? signed(netEffect({ component: editing.component, amount: Number(editing.amount) })) : "—"}
                    </td>
                    <td className="px-2 py-1.5">
                      <div className="flex justify-end gap-1">
                        <button
                          onClick={saveEdit}
                          disabled={!amountOk(editing.amount) || !editing.description.trim()}
                          className="rounded-md p-1.5 text-[var(--status-good)] hover:bg-[var(--gridline)]/50 disabled:opacity-40"
                          aria-label="Save adjustment"
                        >
                          <Check size={15} />
                        </button>
                        <button onClick={() => setEditing(null)} className="rounded-md p-1.5 text-[var(--text-muted)] hover:bg-[var(--gridline)]/50" aria-label="Cancel edit">
                          <X size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              const effect = netEffect(a);
              return (
                <tr key={a.id} className="border-b border-[var(--gridline)]">
                  <td className="px-2 py-2 text-[var(--text-muted)]">{i + 1}</td>
                  <td className="px-2 py-2 text-[var(--text-primary)]">
                    {name}
                    {emp && <span className="ml-1.5 text-[11px] whitespace-nowrap text-[var(--text-muted)]">{emp.employeeNumber}</span>}
                  </td>
                  <td className="px-2 py-2 text-[var(--text-secondary)]">
                    {componentLabel(a.component)}
                    {componentKind(a.component) === "deduction" && <span className="ml-1 text-[11px] text-[var(--text-muted)]">(deduction)</span>}
                  </td>
                  <td className="px-2 py-2 text-[var(--text-secondary)]">{a.description}</td>
                  <td className="tabular px-2 py-2 text-right text-[var(--text-primary)]">{signed(a.amount)}</td>
                  <td className={`tabular px-2 py-2 text-right font-medium ${effect < 0 ? "text-[var(--status-critical)]" : "text-[var(--status-good)]"}`}>{signed(effect)}</td>
                  {canManage && (
                    <td className="px-2 py-2">
                      {confirmDelete === a.id ? (
                        <div className="flex items-center justify-end gap-1 text-xs">
                          <button
                            onClick={async () => (await onRemove(a.id)) && setConfirmDelete(null)}
                            className="rounded-md bg-[var(--status-critical)] px-2 py-1 font-medium text-white"
                          >
                            Remove
                          </button>
                          <button onClick={() => setConfirmDelete(null)} className="rounded-md px-1.5 py-1 text-[var(--text-muted)]">
                            Keep
                          </button>
                        </div>
                      ) : (
                        <div className="flex justify-end gap-1">
                          <button
                            onClick={() => setEditing({ id: a.id, component: a.component, amount: String(a.amount), description: a.description })}
                            className="rounded-md p-1.5 text-[var(--text-muted)] hover:bg-[var(--gridline)]/50"
                            aria-label={`Edit adjustment for ${name}`}
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            onClick={() => setConfirmDelete(a.id)}
                            className="rounded-md p-1.5 text-[var(--text-muted)] hover:bg-[var(--gridline)]/50 hover:text-[var(--status-critical)]"
                            aria-label={`Remove adjustment for ${name}`}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
            {adjustments.length === 0 && (
              <tr>
                <td colSpan={canManage ? 7 : 6} className="px-2 py-4 text-center text-sm text-[var(--text-muted)]">
                  No salary adjustments for this period.
                </td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr className="font-semibold text-[var(--text-primary)]">
              <td colSpan={5} className="px-2 py-2 text-right">
                Total effect on pay (before tax)
              </td>
              <td className="tabular px-2 py-2 text-right">{signed(netTotal)}</td>
              {canManage && <td />}
            </tr>
          </tfoot>
        </table>
      </div>

      {canManage && !loadError && (
        <form onSubmit={add} className="mt-3 grid grid-cols-1 gap-2 rounded-lg border border-dashed border-[var(--border-hairline)] p-3 sm:grid-cols-[1.3fr_1fr_1.5fr_0.7fr_auto]">
          <datalist id="salary-adjustment-employees">
            {pickable.map((e) => (
              <option key={e.id} value={pickLabel(e)} />
            ))}
          </datalist>
          <input
            list="salary-adjustment-employees"
            value={draft.employee}
            onChange={(e) => setDraft({ ...draft, employee: e.target.value })}
            placeholder="Employee"
            className={input}
            aria-label="Employee to adjust"
          />
          <ComponentSelect value={draft.component} onChange={(component) => setDraft({ ...draft, component })} />
          <input
            value={draft.description}
            onChange={(e) => setDraft({ ...draft, description: e.target.value })}
            placeholder="Reason (shown on the payslip)"
            maxLength={300}
            className={input}
            aria-label="Reason for the adjustment"
          />
          <input
            value={draft.amount}
            onChange={(e) => setDraft({ ...draft, amount: e.target.value })}
            placeholder="Amount (+/−)"
            inputMode="decimal"
            className={`${input} text-right`}
            aria-label="Adjustment amount"
          />
          <button
            type="submit"
            disabled={!canAdd}
            className="flex items-center justify-center gap-1.5 rounded-lg bg-[var(--series-1)] px-3 py-1.5 text-sm font-medium text-[var(--on-accent)] disabled:opacity-40"
          >
            <Plus size={15} /> {adding ? "Adding…" : "Add"}
          </button>
          <div className="text-[11px] text-[var(--text-muted)] sm:col-span-5">
            {draft.employee.trim() && !draftEmployee ? (
              <span className="text-[var(--status-critical)]">Pick an employee from the list.</span>
            ) : draftEmployee && !draftInPayroll ? (
              <span className="text-[var(--status-critical)]">
                {fullName(draftEmployee)} isn&rsquo;t on this period&rsquo;s payroll, so an adjustment can&rsquo;t be added here. Use a department voucher to pay them instead.
              </span>
            ) : (
              <>
                A positive amount increases that part and a negative amount decreases it. Example: Basic pay <strong>500</strong> for salary missed last cutoff; SSS contribution{" "}
                <strong>-200</strong> to refund an over-deduction.
                {amountOk(draft.amount) && (
                  <span className="ml-1 font-medium text-[var(--text-secondary)]">
                    Effect on pay: {signed(netEffect({ component: draft.component, amount: Number(draft.amount) }))}.
                  </span>
                )}
              </>
            )}
          </div>
        </form>
      )}
    </div>
  );
}

function ComponentSelect({ value, onChange }: { value: SalaryAdjustmentComponent; onChange: (v: SalaryAdjustmentComponent) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as SalaryAdjustmentComponent)} className={input} aria-label="Part of payroll to adjust">
      <optgroup label="Earnings">
        {SALARY_ADJUSTMENT_COMPONENTS.filter((c) => c.kind === "earning").map((c) => (
          <option key={c.value} value={c.value}>
            {c.label}
          </option>
        ))}
      </optgroup>
      <optgroup label="Deductions">
        {SALARY_ADJUSTMENT_COMPONENTS.filter((c) => c.kind === "deduction").map((c) => (
          <option key={c.value} value={c.value}>
            {c.label}
          </option>
        ))}
      </optgroup>
    </select>
  );
}

// The printed Salary Adjustment Voucher (A4, black on white).
export function SalaryAdjustmentVoucherDoc({
  period,
  adjustments,
  employees,
  preparedBy,
}: {
  period: PayrollPeriod;
  adjustments: SalaryAdjustment[];
  employees: Employee[];
  preparedBy: string;
}) {
  const byId = new Map(employees.map((e) => [e.id, e]));
  const cell = { border: "1px solid #999", padding: "5px 7px", fontSize: "9.5pt" } as const;
  const netTotal = round2(adjustments.reduce((s, a) => s + netEffect(a), 0));
  return (
    <div style={{ fontFamily: "Arial, Helvetica, sans-serif", color: "#111" }}>
      <div style={{ textAlign: "center", marginBottom: "10px" }}>
        <div style={{ fontSize: "14pt", fontWeight: 700 }}>SHANTAHL DIRECT SALES INC.</div>
        <div style={{ fontSize: "12pt", fontWeight: 700, marginTop: "4px", textTransform: "uppercase" }}>{SALARY_ADJUSTMENT_VOUCHER_TITLE}</div>
        <div style={{ fontSize: "10pt", marginTop: "2px" }}>
          Payroll period: {formatDate(period.start)} – {formatDate(period.end)}
        </div>
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ background: "#eee" }}>
            <th style={{ ...cell, width: "24px" }}>#</th>
            <th style={{ ...cell, textAlign: "left" }}>Employee</th>
            <th style={{ ...cell, textAlign: "left" }}>Adjustment</th>
            <th style={{ ...cell, textAlign: "left" }}>Reason</th>
            <th style={{ ...cell, textAlign: "right", width: "85px" }}>Amount</th>
            <th style={{ ...cell, textAlign: "right", width: "85px" }}>Effect on pay</th>
            <th style={{ ...cell, width: "100px" }}>Signature</th>
          </tr>
        </thead>
        <tbody>
          {adjustments.map((a, i) => {
            const emp = byId.get(a.employeeId);
            return (
              <tr key={a.id} style={{ breakInside: "avoid" }}>
                <td style={{ ...cell, textAlign: "center" }}>{i + 1}</td>
                <td style={cell}>
                  {emp ? fullName(emp) : a.employeeId}
                  {emp && <div style={{ fontSize: "8pt", color: "#555" }}>{emp.employeeNumber}</div>}
                </td>
                <td style={cell}>{componentLabel(a.component)}</td>
                <td style={cell}>{a.description}</td>
                <td style={{ ...cell, textAlign: "right" }}>{signed(a.amount)}</td>
                <td style={{ ...cell, textAlign: "right" }}>{signed(netEffect(a))}</td>
                <td style={cell} />
              </tr>
            );
          })}
          <tr>
            <td style={{ ...cell, textAlign: "right", fontWeight: 700 }} colSpan={5}>
              TOTAL EFFECT ON PAY (BEFORE TAX)
            </td>
            <td style={{ ...cell, textAlign: "right", fontWeight: 700 }}>{signed(netTotal)}</td>
            <td style={cell} />
          </tr>
        </tbody>
      </table>
      <div style={{ fontSize: "8.5pt", color: "#444", marginTop: "6px" }}>
        These adjustments are included in the payroll and payslips for this period. Amount: + increases / − decreases that part of the payroll. Withholding tax is recomputed when a
        taxable part changes.
      </div>
      <Signatures preparedBy={preparedBy} />
    </div>
  );
}

export function Signatures({ preparedBy }: { preparedBy: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: "20px", marginTop: "40px", fontSize: "10pt", breakInside: "avoid" }}>
      {[
        ["Prepared by", preparedBy],
        ["Checked by", ""],
        ["Approved by", ""],
      ].map(([label, name]) => (
        <div key={label} style={{ flex: 1, textAlign: "center" }}>
          <div style={{ minHeight: "16px" }}>{name}</div>
          <div style={{ borderTop: "1px solid #111", paddingTop: "3px" }}>{label}</div>
        </div>
      ))}
    </div>
  );
}
