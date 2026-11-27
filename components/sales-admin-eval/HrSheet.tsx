"use client";

import { Fragment, useMemo, useState } from "react";
import { CheckCircle2, Loader2, Play, Save, Signature } from "lucide-react";
import { useHris } from "@/lib/store";
import { Modal } from "@/components/Modal";
import { MySignature } from "@/components/leave/LeaveApplication";
import { emptyHrPart, monthSalesScore, saeWeights, saveHrPart, SAE_BEHAVIOR, SAE_OVERALL, SAE_PURPOSES, type Rating, type SaeHrPart, type SalesAdminEvaluation } from "@/lib/sales-admin-eval";

// HR's part of every open evaluation on one sheet (like HR's spreadsheet):
// a row per employee, the Behavior items as columns (0–3), the total, HR's
// overall rating, recommendation, comment, and a suggested special award
// with its justification. Save drafts, or sign every complete row at once.

const SHORT = [
  "On time",
  "No absenteeism",
  "Uniform, footwear & ID",
  "Professional appearance",
  "Own area neat & clean",
  "Office neat & clean",
  "Data confidential",
  "No gossip / rumors",
  "No fights / issues",
  "Follows superiors",
  "Company time",
  "Company equipment",
  "Follows processes",
];

const fmt = (n: number) => (Math.round(n * 100) / 100).toFixed(2);
const cellInput = "w-full rounded border border-[var(--border-hairline)] bg-[var(--surface-1)] px-1.5 py-1 text-xs";

export function HrSheetModal({ items, onClose, onChanged, onStartAll }: { items: SalesAdminEvaluation[]; onClose: () => void; onChanged: () => void; onStartAll?: () => void }) {
  const { currentEmployee } = useHris();
  const open = useMemo(() => items.filter((e) => e.status === "open" && !e.hrSignedAt), [items]);
  const purposes = SAE_PURPOSES.filter((p) => open.some((e) => e.purpose === p));
  const [purpose, setPurpose] = useState(purposes.includes("Year-end Evaluation") ? "Year-end Evaluation" : (purposes[0] ?? ""));
  const periods = [...new Set(open.filter((e) => !purpose || e.purpose === purpose).map((e) => e.period))].sort().reverse();
  const [period, setPeriod] = useState("");
  const rows = open.filter((e) => (!purpose || e.purpose === purpose) && (!period || e.period === period)).sort((a, b) => a.employeeName.localeCompare(b.employeeName));

  const [drafts, setDrafts] = useState<Record<string, SaeHrPart>>({});
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [hasSignature, setHasSignature] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const partOf = (e: SalesAdminEvaluation): SaeHrPart =>
    drafts[e.id] ?? { ...emptyHrPart(), ...e.hr, behavior: SAE_BEHAVIOR.map((_, i) => e.hr?.behavior?.[i] ?? null) };
  const update = (e: SalesAdminEvaluation, patch: Partial<SaeHrPart>) => {
    setDrafts((d) => ({ ...d, [e.id]: { ...partOf(e), ...patch } }));
    setDirty((s) => new Set(s).add(e.id));
  };
  const rate = (e: SalesAdminEvaluation, i: number, v: string) => {
    const t = v.trim();
    const r: Rating = t === "" ? null : (Math.max(0, Math.min(3, Math.round(Number(t)))) as Rating);
    if (t !== "" && !/^[0-3]$/.test(t)) return;
    const b = [...partOf(e).behavior];
    b[i] = r;
    update(e, { behavior: b });
  };
  const ready = (e: SalesAdminEvaluation) => {
    const p = partOf(e);
    const withSales = saeWeights(e.form).sales > 0;
    return p.behavior.every((x) => x !== null) && (!withSales || p.sales.some((m) => monthSalesScore(m) !== null)) && !!p.overall && !!p.recommendation.trim() && (!p.award?.trim() || !!p.awardJustification?.trim());
  };
  const readyRows = rows.filter(ready);

  // Don't lose typed ratings by closing (Esc / outside click) by mistake.
  const close = () => {
    if (busy) return;
    if (dirty.size && !window.confirm(`You have ${dirty.size} unsaved row${dirty.size === 1 ? "" : "s"}. Close without saving?`)) return;
    onClose();
  };

  async function run(sign: boolean) {
    if (!currentEmployee) return;
    const todo = sign ? readyRows : rows.filter((e) => dirty.has(e.id));
    if (!todo.length) return;
    setBusy(sign ? "sign" : "save");
    setMessage(null);
    const failed: string[] = [];
    let done = 0;
    for (const e of todo) {
      try {
        await saveHrPart(e.id, partOf(e), sign ? currentEmployee.id : null);
        done++;
        setDirty((s) => {
          const n = new Set(s);
          n.delete(e.id);
          return n;
        });
      } catch (err) {
        failed.push(`${e.employeeName}: ${err instanceof Error ? err.message : "couldn't save"}`);
      }
    }
    setBusy(null);
    setMessage({ ok: !failed.length, text: `${sign ? "Signed" : "Saved"} ${done} of ${todo.length}.${failed.length ? ` ${failed.join(" · ")}` : ""}` });
    onChanged();
  }

  return (
    <Modal open full onClose={close} title="HR Rating Sheet — Behavior of all employees">
      <div className="space-y-3 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <select value={purpose} onChange={(e) => (setPurpose(e.target.value), setPeriod(""))} className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-2.5 py-1.5 text-xs" aria-label="Purpose">
            <option value="">All purposes</option>
            {purposes.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
          <select value={period} onChange={(e) => setPeriod(e.target.value)} className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-2.5 py-1.5 text-xs" aria-label="Period">
            <option value="">All periods</option>
            {periods.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
          <span className="text-xs text-[var(--text-muted)]">
            {rows.length} employee{rows.length === 1 ? "" : "s"} waiting for HR&rsquo;s part · {readyRows.length} complete · type 0–3 in each box (Tab to move)
          </span>
          {onStartAll && (
            <button onClick={onStartAll} className="ml-auto flex items-center gap-1.5 rounded-lg border border-[var(--series-1)]/60 px-2.5 py-1.5 text-xs font-medium text-[var(--series-1)] hover:bg-[var(--series-1)]/10">
              <Play size={13} /> Start Year-end Evaluations for all employees
            </button>
          )}
        </div>

        {!rows.length ? (
          <div className="rounded-lg border border-[var(--border-hairline)] px-3 py-6 text-center text-[var(--text-muted)]">No evaluations are waiting for HR&rsquo;s part. Click &ldquo;Start Year-end Evaluations for all employees&rdquo; above to add everyone here.</div>
        ) : (
          <div className="max-h-[60vh] overflow-auto rounded-lg border border-[var(--border-hairline)]">
            <table className="text-xs">
              <thead className="sticky top-0 z-20 bg-[var(--surface-1)]">
                <tr className="border-b border-[var(--border-hairline)] align-bottom text-[var(--text-muted)]">
                  <th className="sticky left-0 z-30 min-w-[180px] bg-[var(--surface-1)] px-2 py-2 text-left font-medium">Employee</th>
                  {SHORT.map((h, i) => (
                    <th key={i} className="w-[58px] min-w-[58px] px-1 py-2 text-center leading-tight font-medium" title={SAE_BEHAVIOR[i]}>
                      {h}
                    </th>
                  ))}
                  <th className="min-w-[80px] px-2 py-2 text-center font-medium">Total behavior</th>
                  <th className="min-w-[150px] px-2 py-2 text-left font-medium">HR&rsquo;s overall rating *</th>
                  <th className="min-w-[150px] px-2 py-2 text-left font-medium">Recommendation *</th>
                  <th className="min-w-[200px] px-2 py-2 text-left font-medium">HR&rsquo;s comment</th>
                  <th className="min-w-[170px] px-2 py-2 text-left font-medium">Recommended Special Award</th>
                  <th className="min-w-[200px] px-2 py-2 text-left font-medium">Justification</th>
                  <th className="px-2 py-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((e) => {
                  const p = partOf(e);
                  const w = saeWeights(e.form);
                  // Boxes not yet filled count as 0 here, so the total grows as you rate.
                  const behavior = (p.behavior.reduce<number>((t, x) => t + (typeof x === "number" ? x : 0), 0) / (SAE_BEHAVIOR.length * 3)) * w.behavior;
                  const needsSales = w.sales > 0 && !p.sales.some((m) => monthSalesScore(m) !== null);
                  return (
                    <Fragment key={e.id}>
                      <tr className={`border-b border-[var(--gridline)] ${dirty.has(e.id) ? "bg-[var(--series-1)]/5" : ""}`}>
                        <td className="sticky left-0 z-10 bg-[var(--surface-1)] px-2 py-1">
                          <div className="font-medium text-[var(--text-primary)]">{e.employeeName}</div>
                          <div className="text-[10px] text-[var(--text-muted)]">
                            {e.hr?.employee?.position ?? ""} · {e.purpose.replace(" Evaluation", "").replace("Evaluation for ", "")} {e.period}
                          </div>
                          {needsSales && <div className="text-[10px] text-[var(--status-warning)]">Sales Admin: enter the sales in the full form</div>}
                        </td>
                        {p.behavior.map((r, i) => (
                          <td key={i} className="px-1 py-1">
                            <input
                              value={r ?? ""}
                              onChange={(ev) => rate(e, i, ev.target.value.slice(-1))}
                              inputMode="numeric"
                              aria-label={`${e.employeeName}: ${SAE_BEHAVIOR[i]}`}
                              className={`${cellInput} text-center font-semibold ${r === null ? "" : r <= 1 ? "text-[var(--status-critical)]" : "text-[var(--text-primary)]"}`}
                            />
                          </td>
                        ))}
                        <td className="px-2 py-1 text-center font-bold text-[var(--text-primary)] tabular-nums">
                          {fmt(behavior)}
                          <span className="text-[10px] font-normal text-[var(--text-muted)]">/{w.behavior}</span>
                        </td>
                        <td className="px-2 py-1">
                          <select value={p.overall} onChange={(ev) => update(e, { overall: ev.target.value })} className={cellInput}>
                            <option value="">Choose…</option>
                            {SAE_OVERALL.map((o) => (
                              <option key={o}>{o}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-2 py-1">
                          <input value={p.recommendation} onChange={(ev) => update(e, { recommendation: ev.target.value })} maxLength={300} placeholder="e.g. Retain" className={cellInput} />
                        </td>
                        <td className="px-2 py-1">
                          <input value={p.comment} onChange={(ev) => update(e, { comment: ev.target.value })} maxLength={3000} className={cellInput} />
                        </td>
                        <td className="px-2 py-1">
                          <input value={p.award ?? ""} onChange={(ev) => update(e, { award: ev.target.value })} maxLength={150} placeholder="Any award (optional)" className={cellInput} />
                        </td>
                        <td className="px-2 py-1">
                          <input
                            value={p.awardJustification ?? ""}
                            onChange={(ev) => update(e, { awardJustification: ev.target.value })}
                            maxLength={2000}
                            placeholder={p.award?.trim() ? "Required" : ""}
                            className={`${cellInput} ${p.award?.trim() && !p.awardJustification?.trim() ? "border-[var(--status-critical)]" : ""}`}
                          />
                        </td>
                        <td className="px-2 py-1 text-center">{ready(e) && <CheckCircle2 size={15} className="text-[var(--status-good)]" aria-label="Complete" />}</td>
                      </tr>
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="text-[11px] text-[var(--text-muted)]">
          0 = doesn&rsquo;t demonstrate · 1 = demonstrates poorly · 2 = satisfactorily · 3 = excellently. Point at a column title for the full item. * Needed to sign. A row turns green when changed and gets a ✓ when complete.
        </div>
        <MySignature onChange={setHasSignature} />
        {message && <div className={`text-xs ${message.ok ? "text-[var(--status-good)]" : "text-[var(--status-critical)]"}`}>{message.text}</div>}
        <div className="flex flex-wrap justify-end gap-2">
          <button onClick={close} disabled={!!busy} className="rounded-lg border border-[var(--border-hairline)] px-3 py-2 text-sm text-[var(--text-secondary)]">
            Close
          </button>
          <button onClick={() => run(false)} disabled={!!busy || !dirty.size} className="flex items-center gap-1.5 rounded-lg border border-[var(--border-hairline)] px-3 py-2 text-sm text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40 disabled:opacity-40">
            {busy === "save" ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Save changes ({dirty.size})
          </button>
          <button onClick={() => run(true)} disabled={!!busy || !readyRows.length || !hasSignature} className="flex items-center gap-1.5 rounded-lg bg-[var(--series-1)] px-3 py-2 text-sm font-medium text-[var(--on-accent)] disabled:opacity-40">
            {busy === "sign" ? <Loader2 size={15} className="animate-spin" /> : <Signature size={15} />} Sign &amp; submit complete rows ({readyRows.length})
          </button>
        </div>
      </div>
    </Modal>
  );
}
