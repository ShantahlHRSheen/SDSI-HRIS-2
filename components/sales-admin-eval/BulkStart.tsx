"use client";

import { useMemo, useState } from "react";
import { Loader2, Play } from "lucide-react";
import { useHris } from "@/lib/store";
import { Modal } from "@/components/Modal";
import { departmentName, fullName, positionTitle } from "@/lib/helpers";
import { effectiveJobPerformanceEvaluatorId } from "@/lib/performance-eval";
import { createSalesAdminEvaluation, SAE_FORMS, type SaeForm, type SalesAdminEvaluation } from "@/lib/sales-admin-eval";
import type { Employee } from "@/lib/types";
import { saeConfig } from "./SalesAdminEval";

// Start a Year-end Evaluation for every active employee who doesn't have one
// for the year yet, at once: the form (Sales Admin or other employees) and the
// Department Head come from the employee's record (Job Performance evaluator,
// or else supervisor); HR can change either, or leave someone out.

interface Row {
  e: Employee;
  form: SaeForm;
  headId: string;
  head2Id: string;
  include: boolean;
}

export function BulkStartModal({ items, onClose, onChanged }: { items: SalesAdminEvaluation[]; onClose: () => void; onChanged: () => void }) {
  const { employees } = useHris();
  const cfg = saeConfig();
  const [period, setPeriod] = useState(String(new Date().getFullYear()));
  const active = useMemo(() => employees.filter((e) => e.status === "active" || e.status === "on_leave").sort((a, b) => fullName(a).localeCompare(fullName(b))), [employees]);
  const isSalesAdmin = (e: Employee) => !!cfg.positionPrefix && e.positionId.startsWith(cfg.positionPrefix);
  const has = (e: Employee) => items.some((x) => x.employeeId === e.id && x.purpose === "Year-end Evaluation" && x.period.trim() === period.trim());

  const initial = (e: Employee): Row => {
    const form: SaeForm = isSalesAdmin(e) ? "sales_admin" : "general";
    let headId = form === "sales_admin" ? cfg.headId : effectiveJobPerformanceEvaluatorId(e) || "";
    if (headId === e.id) headId = "";
    const second = cfg.secondHeads?.[e.branchId];
    const head2Id = second && second !== e.id && second !== headId ? second : "";
    return { e, form, headId, head2Id, include: !!headId };
  };
  const [edits, setEdits] = useState<Record<string, Partial<Row>>>({});
  const rows: Row[] = active.filter((e) => !has(e)).map((e) => ({ ...initial(e), ...edits[e.id] }));
  const set = (id: string, patch: Partial<Row>) => setEdits((cur) => ({ ...cur, [id]: { ...cur[id], ...patch } }));
  const chosen = rows.filter((r) => r.include && r.headId && r.headId !== r.e.id);
  const missingHead = rows.filter((r) => !r.headId).length;
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [failed, setFailed] = useState<string[]>([]);

  async function start() {
    setBusy(true);
    setFailed([]);
    const errs: string[] = [];
    let done = 0;
    for (const r of chosen) {
      setProgress(`Starting ${done + 1} of ${chosen.length}…`);
      try {
        const mi = r.e.middleName?.trim() ? ` ${r.e.middleName.trim().charAt(0)}.` : "";
        await createSalesAdminEvaluation({
          employeeId: r.e.id,
          form: r.form,
          purpose: "Year-end Evaluation",
          period: period.trim(),
          headId: r.headId,
          head2Id: r.head2Id || null,
          vcId: null,
          chairmanId: null,
          employee: {
            name: `${r.e.firstName}${mi} ${r.e.lastName}`,
            position: positionTitle(r.e.positionId),
            department: departmentName(r.e.departmentId),
            dateHired: r.e.dateHired,
            employmentStatus: r.e.employmentStatus,
            contractEnd: r.e.contractEnd,
          },
        });
        done++;
      } catch (err) {
        errs.push(`${fullName(r.e)}: ${err instanceof Error ? err.message : "couldn't start"}`);
      }
    }
    setBusy(false);
    setFailed(errs);
    setProgress(`Started ${done} of ${chosen.length}.`);
    onChanged();
    if (!errs.length) onClose();
  }

  const sel = "w-full rounded border border-[var(--border-hairline)] bg-[var(--surface-1)] px-1.5 py-1 text-xs";
  const headPick = (value: string, onChange: (v: string) => void, except: string, empty: string) => (
    <select value={value} onChange={(ev) => onChange(ev.target.value)} className={`${sel} ${!value && empty === "Choose…" ? "border-[var(--status-critical)]" : ""}`}>
      <option value="">{empty}</option>
      {active
        .filter((x) => x.id !== except)
        .map((x) => (
          <option key={x.id} value={x.id}>
            {fullName(x)} — {positionTitle(x.positionId)}
          </option>
        ))}
    </select>
  );

  return (
    <Modal open full onClose={() => !busy && onClose()} title="Start Year-end Evaluations for all employees">
      <div className="space-y-3 text-sm">
        <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--text-secondary)]">
          <label className="flex items-center gap-1.5">
            Year
            <input value={period} onChange={(ev) => setPeriod(ev.target.value)} maxLength={20} className="w-20 rounded border border-[var(--border-hairline)] bg-[var(--surface-1)] px-2 py-1 text-xs" />
          </label>
          <span>
            {rows.length} active employee{rows.length === 1 ? "" : "s"} without a Year-end Evaluation for {period || "—"} · {chosen.length} selected
            {missingHead > 0 && <b className="text-[var(--status-critical)]"> · {missingHead} need a Department Head chosen</b>}
          </span>
          <button onClick={() => rows.forEach((r) => set(r.e.id, { include: !!r.headId }))} className="rounded border border-[var(--border-hairline)] px-2 py-1">
            Select all with a head
          </button>
          <button onClick={() => rows.forEach((r) => set(r.e.id, { include: false }))} className="rounded border border-[var(--border-hairline)] px-2 py-1">
            Clear
          </button>
        </div>
        <div className="max-h-[60vh] overflow-auto rounded-lg border border-[var(--border-hairline)]">
          <table className="w-full min-w-[900px] text-xs">
            <thead className="sticky top-0 z-10 bg-[var(--surface-1)]">
              <tr className="border-b border-[var(--border-hairline)] text-left text-[var(--text-muted)]">
                <th className="px-2 py-2" />
                <th className="px-2 py-2 font-medium">Employee</th>
                <th className="px-2 py-2 font-medium">Form</th>
                <th className="px-2 py-2 font-medium">Department Head (rates Job Performance)</th>
                <th className="px-2 py-2 font-medium">Second head (optional)</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.e.id} className={`border-b border-[var(--gridline)] ${r.include ? "" : "opacity-60"}`}>
                  <td className="px-2 py-1">
                    <input type="checkbox" checked={r.include} onChange={(ev) => set(r.e.id, { include: ev.target.checked })} aria-label={`Include ${fullName(r.e)}`} />
                  </td>
                  <td className="px-2 py-1">
                    <div className="font-medium text-[var(--text-primary)]">{fullName(r.e)}</div>
                    <div className="text-[10px] text-[var(--text-muted)]">
                      {departmentName(r.e.departmentId)} · {positionTitle(r.e.positionId)}
                    </div>
                  </td>
                  <td className="px-2 py-1">
                    <select value={r.form} onChange={(ev) => set(r.e.id, { form: ev.target.value as SaeForm })} className={sel}>
                      {(Object.keys(SAE_FORMS) as SaeForm[]).map((f) => (
                        <option key={f} value={f}>
                          {SAE_FORMS[f].label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="min-w-[260px] px-2 py-1">{headPick(r.headId, (v) => set(r.e.id, { headId: v, include: !!v }), r.e.id, "Choose…")}</td>
                  <td className="min-w-[220px] px-2 py-1">{headPick(r.head2Id, (v) => set(r.e.id, { head2Id: v }), r.e.id, "None")}</td>
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-[var(--text-muted)]">
                    Every active employee already has a Year-end Evaluation for {period}.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-[var(--text-muted)]">
          The Department Head comes from each employee&rsquo;s Job Performance evaluator (or supervisor) in their record; Sales Admins go to the Sales Admins&rsquo; head. Year-end Evaluations don&rsquo;t go to the Vice Chairperson or the Chairman. After starting, rate everyone in the HR Rating Sheet; each head gets theirs in Needs your action.
        </p>
        {progress && <div className="text-xs text-[var(--text-secondary)]">{progress}</div>}
        {failed.length > 0 && <div className="text-xs text-[var(--status-critical)]">{failed.join(" · ")}</div>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} disabled={busy} className="rounded-lg border border-[var(--border-hairline)] px-3 py-2 text-sm text-[var(--text-secondary)]">
            Cancel
          </button>
          <button onClick={start} disabled={busy || !chosen.length || !period.trim()} className="flex items-center gap-1.5 rounded-lg bg-[var(--series-1)] px-3 py-2 text-sm font-medium text-[var(--on-accent)] disabled:opacity-40">
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} />} Start {chosen.length} evaluation{chosen.length === 1 ? "" : "s"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
