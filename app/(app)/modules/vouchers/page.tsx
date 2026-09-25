"use client";

import { useMemo, useState } from "react";
import { Check, ChevronRight, Pencil, Plus, Printer, Receipt, Trash2, X } from "lucide-react";
import { useHris } from "@/lib/store";
import { useSelectedPayrollPeriod } from "@/lib/use-payroll-period";
import { useDepartmentVouchers } from "@/lib/use-department-vouchers";
import { PageHeader } from "@/components/PageHeader";
import { StatTile } from "@/components/StatTile";
import { EmptyState } from "@/components/EmptyState";
import { formatCurrency, formatDate, fullName } from "@/lib/helpers";
import type { DepartmentVoucherLine } from "@/lib/supabase/department-vouchers";
import { voucherTitle } from "@/lib/voucher-totals";
import type { Department, Employee, PayrollPeriod } from "@/lib/types";

const MANAGE_ROLES = ["hr_admin", "payroll_officer", "sr_accounting_assistant", "treasurer", "cfo", "sys_admin"];

const peso = (n: number) => formatCurrency(n);
const input = "w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-2.5 py-1.5 text-sm";

export default function VouchersPage() {
  const { departments, employees, payrollPeriods, currentUser } = useHris();
  const canManage = !!currentUser?.roles.some((r) => MANAGE_ROLES.includes(r));
  const { period, periodId, setPeriodId } = useSelectedPayrollPeriod();
  const { vouchers, lines, loaded, loadError, addLine, editLine, removeLine } = useDepartmentVouchers();
  const [openDept, setOpenDept] = useState<string | null>(null);

  const periodVoucherByDept = useMemo(() => new Map(vouchers.filter((v) => v.periodId === period?.id).map((v) => [v.departmentId, v])), [vouchers, period]);
  const linesByDept = useMemo(() => {
    const m = new Map<string, DepartmentVoucherLine[]>();
    for (const [deptId, v] of periodVoucherByDept) m.set(deptId, lines.filter((l) => l.voucherId === v.id).sort((a, b) => a.sortOrder - b.sortOrder));
    return m;
  }, [periodVoucherByDept, lines]);
  const totalOf = (deptId: string) => (linesByDept.get(deptId) ?? []).reduce((s, l) => s + l.amount, 0);

  // Every department except "Unassigned" (shown only if it somehow has lines).
  const shownDepts = departments.filter((d) => d.id !== "dp-unassigned" || (linesByDept.get(d.id)?.length ?? 0) > 0);
  const grandTotal = shownDepts.reduce((s, d) => s + totalOf(d.id), 0);
  const payeeCount = shownDepts.reduce((s, d) => s + (linesByDept.get(d.id)?.length ?? 0), 0);
  const open = shownDepts.find((d) => d.id === openDept) ?? null;

  const activeEmployees = useMemo(
    () => employees.filter((e) => e.status !== "resigned" && e.status !== "terminated").sort((a, b) => fullName(a).localeCompare(fullName(b))),
    [employees],
  );

  return (
    <div>
      <PageHeader
        title="Vouchers"
        subtitle="One voucher per department for each payroll period — add anyone (employees, freelancers, project-based or other payees) with a description and amount. Totals are included in the Payroll Expense Report."
      />

      <div className="mb-4 flex flex-wrap items-center gap-2 print:hidden">
        <select value={periodId} onChange={(e) => setPeriodId(e.target.value)} className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-2 text-sm">
          {payrollPeriods.map((p) => (
            <option key={p.id} value={p.id}>
              {formatDate(p.start)} – {formatDate(p.end)}
            </option>
          ))}
        </select>
      </div>

      {!period ? (
        <EmptyState icon={Receipt} title="No payroll periods" description="Add a payroll period in System Administration first." />
      ) : loadError ? (
        <div className="text-sm text-[var(--status-critical)]">Couldn&rsquo;t load vouchers: {loadError}</div>
      ) : !loaded ? (
        <div className="text-sm text-[var(--text-muted)]">Loading…</div>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 print:hidden">
            <StatTile label="Total vouchers this period" value={peso(grandTotal)} />
            <StatTile label="Payees" value={payeeCount.toString()} />
            <StatTile label="Departments with vouchers" value={shownDepts.filter((d) => (linesByDept.get(d.id)?.length ?? 0) > 0).length.toString()} />
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4 print:hidden">
            {shownDepts.map((d) => {
              const n = linesByDept.get(d.id)?.length ?? 0;
              const active = openDept === d.id;
              return (
                <button
                  key={d.id}
                  onClick={() => setOpenDept(active ? null : d.id)}
                  className={`flex items-center justify-between gap-2 rounded-xl border p-3 text-left ${active ? "border-[var(--series-1)] bg-[var(--series-1)]/10" : "border-[var(--border-hairline)] bg-[var(--surface-1)] hover:bg-[var(--gridline)]/30"}`}
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-[var(--text-primary)]">{voucherTitle(d)}</div>
                    <div className="text-xs text-[var(--text-muted)]">{n ? `${n} payee${n === 1 ? "" : "s"}` : "No payees yet"}</div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <span className="tabular text-sm font-semibold text-[var(--text-primary)]">{peso(totalOf(d.id))}</span>
                    <ChevronRight size={16} className={`text-[var(--text-muted)] transition-transform ${active ? "rotate-90" : ""}`} />
                  </div>
                </button>
              );
            })}
          </div>

          {open ? (
            <VoucherEditor
              key={`${period.id}-${open.id}`}
              department={open}
              period={period}
              lines={linesByDept.get(open.id) ?? []}
              canManage={canManage}
              employees={activeEmployees}
              preparedBy={currentUser?.name ?? ""}
              onAdd={(l) => addLine(period, open.id, l)}
              onEdit={editLine}
              onRemove={removeLine}
            />
          ) : (
            <div className="mt-4 text-sm text-[var(--text-muted)] print:hidden">Choose a department above to open its voucher.</div>
          )}
        </>
      )}
    </div>
  );
}

type LineInput = { employeeId: string | null; payeeName: string; description: string; amount: number };

function matchEmployee(name: string, employees: Employee[]): string | null {
  const n = name.trim().toLowerCase();
  return employees.find((e) => fullName(e).toLowerCase() === n)?.id ?? null;
}

function VoucherEditor({
  department,
  period,
  lines,
  canManage,
  employees,
  preparedBy,
  onAdd,
  onEdit,
  onRemove,
}: {
  department: Department;
  period: PayrollPeriod;
  lines: DepartmentVoucherLine[];
  canManage: boolean;
  employees: Employee[];
  preparedBy: string;
  onAdd: (l: LineInput) => Promise<boolean>;
  onEdit: (id: string, patch: Partial<LineInput>) => Promise<boolean>;
  onRemove: (id: string) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState({ payeeName: "", description: "", amount: "" });
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<{ id: string; payeeName: string; description: string; amount: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const total = lines.reduce((s, l) => s + l.amount, 0);
  const listId = `payees-${department.id}`;
  const amountOk = (v: string) => v.trim() !== "" && Number.isFinite(Number(v)) && Number(v) >= 0;

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.payeeName.trim() || !amountOk(draft.amount)) return;
    setAdding(true);
    const ok = await onAdd({ employeeId: matchEmployee(draft.payeeName, employees), payeeName: draft.payeeName, description: draft.description, amount: Math.round(Number(draft.amount) * 100) / 100 });
    setAdding(false);
    if (ok) setDraft({ payeeName: "", description: "", amount: "" });
  }

  async function saveEdit() {
    if (!editing || !editing.payeeName.trim() || !amountOk(editing.amount)) return;
    const ok = await onEdit(editing.id, {
      employeeId: matchEmployee(editing.payeeName, employees),
      payeeName: editing.payeeName,
      description: editing.description,
      amount: Math.round(Number(editing.amount) * 100) / 100,
    });
    if (ok) setEditing(null);
  }

  return (
    <div className="mt-4 rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-1)] p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 print:hidden">
        <div>
          <div className="text-base font-semibold text-[var(--text-primary)]">{voucherTitle(department)}</div>
          <div className="text-xs text-[var(--text-muted)]">
            {formatDate(period.start)} – {formatDate(period.end)} · {lines.length} payee{lines.length === 1 ? "" : "s"} · Total {peso(total)}
          </div>
        </div>
        <button onClick={() => window.print()} disabled={!lines.length} className="flex items-center gap-1.5 rounded-lg border border-[var(--border-hairline)] px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40 disabled:opacity-40">
          <Printer size={15} /> Print voucher
        </button>
      </div>

      <datalist id={listId}>
        {employees.map((e) => (
          <option key={e.id} value={fullName(e)}>
            {e.employeeNumber}
          </option>
        ))}
      </datalist>

      <div className="overflow-x-auto print:hidden">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-[var(--border-hairline)] text-left text-xs text-[var(--text-muted)]">
              <th className="w-8 px-2 py-2 font-medium">#</th>
              <th className="px-2 py-2 font-medium">Name</th>
              <th className="px-2 py-2 font-medium">Description</th>
              <th className="w-36 px-2 py-2 text-right font-medium">Amount</th>
              {canManage && <th className="w-24 px-2 py-2" />}
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) =>
              editing?.id === l.id ? (
                <tr key={l.id} className="border-b border-[var(--gridline)]">
                  <td className="px-2 py-1.5 text-[var(--text-muted)]">{i + 1}</td>
                  <td className="px-2 py-1.5">
                    <input list={listId} value={editing.payeeName} onChange={(e) => setEditing({ ...editing, payeeName: e.target.value })} maxLength={200} className={input} aria-label="Name" />
                  </td>
                  <td className="px-2 py-1.5">
                    <input value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} maxLength={500} className={input} aria-label="Description" />
                  </td>
                  <td className="px-2 py-1.5">
                    <input value={editing.amount} onChange={(e) => setEditing({ ...editing, amount: e.target.value })} inputMode="decimal" className={`${input} text-right`} aria-label="Amount" />
                  </td>
                  <td className="px-2 py-1.5">
                    <div className="flex justify-end gap-1">
                      <button onClick={saveEdit} className="rounded-md p-1.5 text-[var(--status-good)] hover:bg-[var(--gridline)]/50" aria-label="Save line">
                        <Check size={15} />
                      </button>
                      <button onClick={() => setEditing(null)} className="rounded-md p-1.5 text-[var(--text-muted)] hover:bg-[var(--gridline)]/50" aria-label="Cancel edit">
                        <X size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                <tr key={l.id} className="border-b border-[var(--gridline)]">
                  <td className="px-2 py-2 text-[var(--text-muted)]">{i + 1}</td>
                  <td className="px-2 py-2 text-[var(--text-primary)]">
                    {l.payeeName}
                    {!l.employeeId && <span className="ml-1.5 text-[11px] text-[var(--text-muted)]">(non-employee)</span>}
                  </td>
                  <td className="px-2 py-2 text-[var(--text-secondary)]">{l.description || "—"}</td>
                  <td className="tabular px-2 py-2 text-right text-[var(--text-primary)]">{peso(l.amount)}</td>
                  {canManage && (
                    <td className="px-2 py-2">
                      {confirmDelete === l.id ? (
                        <div className="flex items-center justify-end gap-1 text-xs">
                          <button onClick={async () => (await onRemove(l.id)) && setConfirmDelete(null)} className="rounded-md bg-[var(--status-critical)] px-2 py-1 font-medium text-white">
                            Remove
                          </button>
                          <button onClick={() => setConfirmDelete(null)} className="rounded-md px-1.5 py-1 text-[var(--text-muted)]">
                            Keep
                          </button>
                        </div>
                      ) : (
                        <div className="flex justify-end gap-1">
                          <button onClick={() => setEditing({ id: l.id, payeeName: l.payeeName, description: l.description, amount: String(l.amount) })} className="rounded-md p-1.5 text-[var(--text-muted)] hover:bg-[var(--gridline)]/50" aria-label={`Edit ${l.payeeName}`}>
                            <Pencil size={14} />
                          </button>
                          <button onClick={() => setConfirmDelete(l.id)} className="rounded-md p-1.5 text-[var(--text-muted)] hover:bg-[var(--gridline)]/50 hover:text-[var(--status-critical)]" aria-label={`Remove ${l.payeeName}`}>
                            <Trash2 size={14} />
                          </button>
                        </div>
                      )}
                    </td>
                  )}
                </tr>
              ),
            )}
            {lines.length === 0 && (
              <tr>
                <td colSpan={canManage ? 5 : 4} className="px-2 py-4 text-center text-sm text-[var(--text-muted)]">
                  No payees on this voucher yet.
                </td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr className="font-semibold text-[var(--text-primary)]">
              <td colSpan={3} className="px-2 py-2 text-right">
                Total
              </td>
              <td className="tabular px-2 py-2 text-right">{peso(total)}</td>
              {canManage && <td />}
            </tr>
          </tfoot>
        </table>
      </div>

      {canManage && (
        <form onSubmit={add} className="mt-3 grid grid-cols-1 gap-2 rounded-lg border border-dashed border-[var(--border-hairline)] p-3 sm:grid-cols-[1.2fr_1.5fr_0.8fr_auto] print:hidden">
          <input list={listId} value={draft.payeeName} onChange={(e) => setDraft({ ...draft, payeeName: e.target.value })} placeholder="Name (employee or anyone)" maxLength={200} className={input} aria-label="New payee name" />
          <input value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder="Description (e.g. Commission, Talent fee)" maxLength={500} className={input} aria-label="New payee description" />
          <input value={draft.amount} onChange={(e) => setDraft({ ...draft, amount: e.target.value })} placeholder="Amount" inputMode="decimal" className={`${input} text-right`} aria-label="New payee amount" />
          <button type="submit" disabled={adding || !draft.payeeName.trim() || !amountOk(draft.amount)} className="flex items-center justify-center gap-1.5 rounded-lg bg-[var(--series-1)] px-3 py-1.5 text-sm font-medium text-[var(--on-accent)] disabled:opacity-40">
            <Plus size={15} /> {adding ? "Adding…" : "Add"}
          </button>
          <div className="text-[11px] text-[var(--text-muted)] sm:col-span-4">Start typing to pick an employee, or type any name for a freelancer or other payee.</div>
        </form>
      )}

      <VoucherPrint department={department} period={period} lines={lines} total={total} preparedBy={preparedBy} />
    </div>
  );
}

// The printed voucher (A4, black on white) — hidden on screen.
function VoucherPrint({ department, period, lines, total, preparedBy }: { department: Department; period: PayrollPeriod; lines: DepartmentVoucherLine[]; total: number; preparedBy: string }) {
  const cell = { border: "1px solid #999", padding: "5px 7px", fontSize: "10pt" } as const;
  return (
    <div className="bir-print-area hidden print:block">
      <div style={{ fontFamily: "Arial, Helvetica, sans-serif", color: "#111" }}>
        <div style={{ textAlign: "center", marginBottom: "10px" }}>
          <div style={{ fontSize: "14pt", fontWeight: 700 }}>SHANTAHL DIRECT SALES INC.</div>
          <div style={{ fontSize: "12pt", fontWeight: 700, marginTop: "4px", textTransform: "uppercase" }}>{voucherTitle(department)}</div>
          <div style={{ fontSize: "10pt", marginTop: "2px" }}>
            Payroll period: {formatDate(period.start)} – {formatDate(period.end)}
          </div>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#eee" }}>
              <th style={{ ...cell, width: "28px" }}>#</th>
              <th style={{ ...cell, textAlign: "left" }}>Name</th>
              <th style={{ ...cell, textAlign: "left" }}>Description</th>
              <th style={{ ...cell, textAlign: "right", width: "110px" }}>Amount</th>
              <th style={{ ...cell, width: "130px" }}>Signature</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={l.id}>
                <td style={{ ...cell, textAlign: "center" }}>{i + 1}</td>
                <td style={cell}>{l.payeeName}</td>
                <td style={cell}>{l.description}</td>
                <td style={{ ...cell, textAlign: "right" }}>{peso(l.amount)}</td>
                <td style={cell} />
              </tr>
            ))}
            <tr>
              <td style={{ ...cell, textAlign: "right", fontWeight: 700 }} colSpan={3}>
                TOTAL
              </td>
              <td style={{ ...cell, textAlign: "right", fontWeight: 700 }}>{peso(total)}</td>
              <td style={cell} />
            </tr>
          </tbody>
        </table>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "20px", marginTop: "40px", fontSize: "10pt" }}>
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
      </div>
    </div>
  );
}
