"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, Loader2, Save, Signature } from "lucide-react";
import { useHris } from "@/lib/store";
import { Modal } from "@/components/Modal";
import { MySignature } from "@/components/leave/LeaveApplication";
import { emptyHeadPart, jobItems, saeWeights, saveHeadPart, SAE_FORMS, SAE_OVERALL, SAE_PURPOSES, type Rating, type SaeForm, type SaeHeadPart, type SalesAdminEvaluation } from "@/lib/sales-admin-eval";

// A Department Head's / supervisor's part of every evaluation waiting for
// them, on one sheet: a row per employee, the Job Performance KPIs as
// columns (0–3), the score, their overall rating, recommendation, comment,
// and a suggested special award with its justification. The Sales Admin
// form and the other employees' form have different KPIs, so each has its
// own table.

const fmt = (n: number) => (Math.round(n * 100) / 100).toFixed(2);
const cellInput = "w-full rounded border border-[var(--border-hairline)] bg-[var(--surface-1)] px-1.5 py-1 text-xs";

export function HeadSheetModal({ items, onClose, onChanged }: { items: SalesAdminEvaluation[]; onClose: () => void; onChanged: () => void }) {
  const { currentEmployee } = useHris();
  const me = currentEmployee?.id;
  // The evaluations where the signed-in person is a head who hasn't signed yet.
  const slotOf = (e: SalesAdminEvaluation): "head" | "head2" | null => (e.headId === me && !e.headSignedAt ? "head" : e.head2Id === me && !e.head2SignedAt ? "head2" : null);
  const open = useMemo(() => items.filter((e) => e.status === "open" && slotOf(e)), [items, me]); // eslint-disable-line react-hooks/exhaustive-deps
  const purposes = SAE_PURPOSES.filter((p) => open.some((e) => e.purpose === p));
  const [purpose, setPurpose] = useState(purposes.includes("Year-end Evaluation") ? "Year-end Evaluation" : (purposes[0] ?? ""));
  const periods = [...new Set(open.filter((e) => !purpose || e.purpose === purpose).map((e) => e.period))].sort().reverse();
  const [period, setPeriod] = useState("");
  const rows = open.filter((e) => (!purpose || e.purpose === purpose) && (!period || e.period === period)).sort((a, b) => a.employeeName.localeCompare(b.employeeName));
  const forms = (["general", "sales_admin"] as SaeForm[]).filter((f) => rows.some((e) => e.form === f));

  const [drafts, setDrafts] = useState<Record<string, SaeHeadPart>>({});
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [hasSignature, setHasSignature] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const partOf = (e: SalesAdminEvaluation): SaeHeadPart => {
    if (drafts[e.id]) return drafts[e.id];
    const mine = slotOf(e) === "head2" ? e.head2 : e.head;
    return { ...emptyHeadPart(e.form), ...mine, job: jobItems(e.form).map((_, i) => mine?.job?.[i] ?? null) };
  };
  const update = (e: SalesAdminEvaluation, patch: Partial<SaeHeadPart>) => {
    setDrafts((d) => ({ ...d, [e.id]: { ...partOf(e), ...patch } }));
    setDirty((s) => new Set(s).add(e.id));
  };
  const rate = (e: SalesAdminEvaluation, i: number, v: string) => {
    const t = v.trim();
    if (t !== "" && !/^[0-3]$/.test(t)) return;
    const job = [...partOf(e).job];
    job[i] = (t === "" ? null : Number(t)) as Rating;
    update(e, { job });
  };
  const ready = (e: SalesAdminEvaluation) => {
    const p = partOf(e);
    return p.job.every((x) => x !== null) && !!p.overall && !!p.recommendation.trim() && (!p.award?.trim() || !!p.awardJustification?.trim());
  };
  const readyRows = rows.filter(ready);
  // This head's Job Performance score (their own ratings, before averaging with a second head).
  const jobScore = (e: SalesAdminEvaluation) => {
    // Boxes not yet filled count as 0 here, so the score grows as you rate.
    const job = partOf(e).job;
    const sum = job.reduce<number>((t, x) => t + (typeof x === "number" ? x : 0), 0);
    return job.length ? (sum / (job.length * 3)) * saeWeights(e.form).job : 0;
  };

  const close = () => {
    if (busy) return;
    if (dirty.size && !window.confirm(`You have ${dirty.size} unsaved row${dirty.size === 1 ? "" : "s"}. Close without saving?`)) return;
    onClose();
  };

  async function run(sign: boolean) {
    if (!me) return;
    const todo = sign ? readyRows : rows.filter((e) => dirty.has(e.id));
    if (!todo.length) return;
    setBusy(sign ? "sign" : "save");
    setMessage(null);
    const failed: string[] = [];
    let done = 0;
    for (const e of todo) {
      try {
        await saveHeadPart(e.id, slotOf(e) ?? "head", partOf(e), sign ? me : null);
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

  const table = (form: SaeForm) => {
    const kpis = jobItems(form);
    const list = rows.filter((e) => e.form === form);
    return (
      <div key={form}>
        {forms.length > 1 && <div className="mb-1 text-xs font-semibold text-[var(--text-secondary)]">{SAE_FORMS[form].label}</div>}
        <div className="max-h-[55vh] overflow-auto rounded-lg border border-[var(--border-hairline)]">
          <table className="text-xs">
            <thead className="sticky top-0 z-20 bg-[var(--surface-1)]">
              <tr className="border-b border-[var(--border-hairline)] align-bottom text-[var(--text-muted)]">
                <th className="sticky left-0 z-30 min-w-[180px] bg-[var(--surface-1)] px-2 py-2 text-left font-medium">Employee</th>
                {kpis.map((k) => (
                  <th key={k.kra} className="w-[84px] min-w-[84px] px-1 py-2 text-center leading-tight font-medium" title={k.objective}>
                    {k.kra}
                  </th>
                ))}
                <th className="min-w-[80px] px-2 py-2 text-center font-medium">Job Performance</th>
                <th className="min-w-[150px] px-2 py-2 text-left font-medium">Overall rating *</th>
                <th className="min-w-[150px] px-2 py-2 text-left font-medium">Recommendation *</th>
                <th className="min-w-[200px] px-2 py-2 text-left font-medium">Comment</th>
                <th className="min-w-[170px] px-2 py-2 text-left font-medium">Recommended Special Award</th>
                <th className="min-w-[200px] px-2 py-2 text-left font-medium">Justification</th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {list.map((e) => {
                const p = partOf(e);
                return (
                  <tr key={e.id} className={`border-b border-[var(--gridline)] ${dirty.has(e.id) ? "bg-[var(--series-1)]/5" : ""}`}>
                    <td className="sticky left-0 z-10 bg-[var(--surface-1)] px-2 py-1">
                      <div className="font-medium text-[var(--text-primary)]">{e.employeeName}</div>
                      <div className="text-[10px] text-[var(--text-muted)]">
                        {e.hr?.employee?.position ?? ""} · {e.purpose.replace(" Evaluation", "").replace("Evaluation for ", "")} {e.period}
                      </div>
                    </td>
                    {p.job.map((r, i) => (
                      <td key={i} className="px-1 py-1">
                        <input
                          value={r ?? ""}
                          onChange={(ev) => rate(e, i, ev.target.value.slice(-1))}
                          inputMode="numeric"
                          aria-label={`${e.employeeName}: ${kpis[i]?.kra}`}
                          className={`${cellInput} text-center font-semibold ${r === null ? "" : r <= 1 ? "text-[var(--status-critical)]" : "text-[var(--text-primary)]"}`}
                        />
                      </td>
                    ))}
                    <td className="px-2 py-1 text-center font-bold text-[var(--text-primary)] tabular-nums">
                      {fmt(jobScore(e))}
                      <span className="text-[10px] font-normal text-[var(--text-muted)]">/{saeWeights(e.form).job}</span>
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
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <Modal open full onClose={close} title="Job Performance Rating Sheet — all employees you rate">
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
            {rows.length} employee{rows.length === 1 ? "" : "s"} waiting for your rating · {readyRows.length} complete · type 0–3 in each box (Tab to move)
          </span>
        </div>
        {!rows.length ? (
          <div className="rounded-lg border border-[var(--border-hairline)] px-3 py-6 text-center text-[var(--text-muted)]">No evaluations are waiting for your rating.</div>
        ) : (
          <div className="space-y-4">{forms.map(table)}</div>
        )}
        <div className="text-[11px] text-[var(--text-muted)]">
          0 = doesn&rsquo;t demonstrate · 1 = demonstrates poorly · 2 = satisfactorily · 3 = excellently. Point at a column title for the full objective. * Needed to sign. A row turns green when changed and gets a ✓ when complete.
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
