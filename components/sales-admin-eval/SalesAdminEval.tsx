"use client";

import { useCallback, useEffect, useState } from "react";
import { Eye, Loader2, Plus, Save, Signature, Trash2 } from "lucide-react";
import { useHris } from "@/lib/store";
import { Modal } from "@/components/Modal";
import { FileViewer, type ViewerFile } from "@/components/FileViewer";
import { MySignature } from "@/components/leave/LeaveApplication";
import { currentCompany } from "@/lib/companies";
import { loadHrLetterhead } from "@/lib/discipline-notice";
import { buildSaePdf } from "@/lib/sales-admin-eval-pdf";
import {
  fetchSalesAdminEvaluations,
  monthSalesScore,
  recommendSae,
  requiredSales,
  saeScores,
  saeSignatures,
  saveHeadPart,
  saeHeads,
  saveHrPart,
  SAE_BEHAVIOR,
  SAE_BEHAVIOR_KRA,
  SAE_OVERALL,
  SAE_SCALE,
  jobItems,
  saeWeights,
  emptyHeadPart,
  emptyHrPart,
  type Rating,
  type SaeHeadPart,
  type SaeHrPart,
  type SalesAdminEvaluation,
} from "@/lib/sales-admin-eval";

export const primary = "flex items-center gap-1.5 rounded-lg bg-[var(--series-1)] px-3 py-1.5 text-sm font-medium text-[var(--on-accent)] disabled:opacity-40";
export const secondary =
  "flex items-center gap-1.5 rounded-lg border border-[var(--border-hairline)] px-3 py-1.5 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40 disabled:opacity-40";
export const input = "w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-2 text-sm";
const label = "mb-1 block text-xs font-medium text-[var(--text-secondary)]";

export const saeConfig = () => {
  const c = currentCompany().salesAdminEval;
  return (
    c ?? {
      headId: "",
      vcId: "",
      chairmanId: "",
      headTitle: "Department Head",
      vcTitle: "Vice Chairperson",
      chairmanTitle: "Chairman",
      passMark: 90,
      positionPrefix: "",
    }
  );
};

export function useSalesAdminEvaluations() {
  const [items, setItems] = useState<SalesAdminEvaluation[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(
    () =>
      fetchSalesAdminEvaluations().then(
        (x) => (setItems(x), setError(null)),
        (e: Error) => setError(e.message),
      ),
    [],
  );
  useEffect(() => {
    reload();
  }, [reload]);
  return { items, error, reload };
}

// ---- Rating rows ----------------------------------------------------------------------

function RatingPicker({ value, onChange, disabled }: { value: Rating; onChange: (v: number) => void; disabled?: boolean }) {
  return (
    <div className="flex shrink-0 gap-1">
      {SAE_SCALE.map((s) => (
        <button
          key={s.value}
          type="button"
          disabled={disabled}
          title={`${s.label} (${s.tagalog})`}
          onClick={() => onChange(s.value)}
          className={`h-8 w-8 rounded-md border text-sm font-semibold ${
            value === s.value ? "border-[var(--series-1)] bg-[var(--series-1)] text-[var(--on-accent)]" : "border-[var(--border-hairline)] text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40"
          } disabled:cursor-default disabled:opacity-60`}
        >
          {s.value}
        </button>
      ))}
    </div>
  );
}

export function ScaleLegend() {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 rounded-lg bg-[var(--gridline)]/25 px-3 py-2 text-xs text-[var(--text-secondary)]">
      {SAE_SCALE.map((s) => (
        <span key={s.value}>
          <b className="text-[var(--text-primary)]">{s.value}</b> {s.label} <i>({s.tagalog})</i>
        </span>
      ))}
    </div>
  );
}

function Overall({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled?: boolean }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} className={input}>
      <option value="">Choose…</option>
      {SAE_OVERALL.map((o) => (
        <option key={o}>{o}</option>
      ))}
    </select>
  );
}

const fmt = (n: number) => n.toFixed(2);
const peso = (n: number) => `₱${(Number(n) || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function ScoreSummary({ e, hr }: { e: SalesAdminEvaluation; hr?: SaeHrPart | null }) {
  const cfg = saeConfig();
  const s = saeScores(e.form, hr ?? e.hr, saeHeads(e), cfg.passMark);
  const w = saeWeights(e.form);
  const cell = "rounded-lg bg-[var(--gridline)]/25 px-3 py-2";
  return (
    <div className={`grid grid-cols-2 gap-2 text-xs ${w.sales ? "sm:grid-cols-5" : "sm:grid-cols-4"}`}>
      <div className={cell}>
        Behavior ({w.behavior}) <div className="tabular text-sm font-semibold text-[var(--text-primary)]">{fmt(s.behavior)}</div>
      </div>
      <div className={cell}>
        Job Performance ({w.job}) <div className="tabular text-sm font-semibold text-[var(--text-primary)]">{fmt(s.job)}</div>
      </div>
      {w.sales > 0 && (
        <div className={cell}>
          Sales ({w.sales}) <div className="tabular text-sm font-semibold text-[var(--text-primary)]">{fmt(s.sales)}</div>
        </div>
      )}
      <div className={cell}>
        Actual score <div className="tabular text-sm font-semibold text-[var(--text-primary)]">{fmt(s.total)}</div>
      </div>
      <div className={cell}>
        Remarks (pass {cfg.passMark})
        <div className={`text-sm font-semibold ${!s.complete ? "text-[var(--text-muted)]" : s.passed ? "text-[var(--status-good)]" : "text-[var(--status-critical)]"}`}>
          {!s.complete ? "Incomplete" : s.passed ? "PASSED" : "FAILED"}
        </div>
      </div>
    </div>
  );
}

// ---- HR's part ------------------------------------------------------------------------

export function HrPartModal({ e, onClose, onChanged }: { e: SalesAdminEvaluation; onClose: () => void; onChanged: () => void }) {
  const { currentEmployee } = useHris();
  const [part, setPart] = useState<SaeHrPart>(() => ({
    ...emptyHrPart(),
    ...e.hr,
    behavior: SAE_BEHAVIOR.map((_, i) => e.hr?.behavior?.[i] ?? null),
  }));
  const [hasSignature, setHasSignature] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof SaeHrPart>(k: K, v: SaeHrPart[K]) => setPart((p) => ({ ...p, [k]: v }));
  const w = saeWeights(e.form);
  const withSales = w.sales > 0;
  const ready = part.behavior.every((x) => x !== null) && (!withSales || part.sales.some((m) => monthSalesScore(m) !== null)) && !!part.overall && !!part.recommendation.trim();

  async function save(sign: boolean) {
    if (!currentEmployee) return;
    setBusy(sign ? "sign" : "save");
    setError(null);
    try {
      const clean = {
        ...part,
        sales: withSales ? part.sales.filter((m) => m.month.trim() || m.ads || m.gross) : [],
      };
      await saveHrPart(e.id, clean, sign ? currentEmployee.id : null);
      onChanged();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Modal open wide onClose={() => !busy && onClose()} title={`HR's part — ${e.employeeName} (${e.purpose})`}>
      <div className="space-y-5 text-sm">
        <ScaleLegend />
        <div>
          <div className="mb-2 font-medium text-[var(--text-primary)]">
            Behavior ({w.behavior}%) — {SAE_BEHAVIOR_KRA}
          </div>
          <div className="space-y-1.5">
            {SAE_BEHAVIOR.map((item, i) => (
              <div key={i} className="flex items-center justify-between gap-3 rounded-lg px-2 py-1 hover:bg-[var(--gridline)]/20">
                <span className="text-[var(--text-secondary)]">
                  {i + 1}. {item}
                </span>
                <RatingPicker
                  value={part.behavior[i]}
                  onChange={(v) =>
                    set(
                      "behavior",
                      part.behavior.map((x, j) => (j === i ? v : x)),
                    )
                  }
                />
              </div>
            ))}
          </div>
        </div>

        {withSales && (
          <div>
            <div className="mb-1 font-medium text-[var(--text-primary)]">Sales ({w.sales}%)</div>
            <p className="mb-2 text-xs text-[var(--text-muted)]">
              Required sales are 3× the ads spent. Each month scores gross ÷ required × 80, at most 80; the Sales score is the average of the months.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-xs">
                <thead className="text-[var(--text-muted)]">
                  <tr>
                    <th className="px-1 py-1 text-left font-medium">Month</th>
                    <th className="px-1 py-1 text-right font-medium">Ads spent</th>
                    <th className="px-1 py-1 text-right font-medium">Required (3×)</th>
                    <th className="px-1 py-1 text-right font-medium">Gross sales</th>
                    <th className="px-1 py-1 text-right font-medium">Score</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {part.sales.map((m, i) => {
                    const upd = (patch: Partial<typeof m>) =>
                      set(
                        "sales",
                        part.sales.map((x, j) => (j === i ? { ...x, ...patch } : x)),
                      );
                    const score = monthSalesScore(m);
                    return (
                      <tr key={i}>
                        <td className="px-1 py-1">
                          <input value={m.month} onChange={(ev) => upd({ month: ev.target.value })} placeholder="e.g. July 2026" className={input} maxLength={40} />
                        </td>
                        <td className="px-1 py-1">
                          <input type="number" min={0} step="0.01" value={m.ads || ""} onChange={(ev) => upd({ ads: Number(ev.target.value) || 0 })} className={`${input} text-right`} />
                        </td>
                        <td className="tabular px-1 py-1 text-right text-[var(--text-secondary)]">{peso(requiredSales(m))}</td>
                        <td className="px-1 py-1">
                          <input type="number" min={0} step="0.01" value={m.gross || ""} onChange={(ev) => upd({ gross: Number(ev.target.value) || 0 })} className={`${input} text-right`} />
                        </td>
                        <td className="tabular px-1 py-1 text-right font-semibold text-[var(--text-primary)]">{score === null ? "—" : fmt(score)}</td>
                        <td className="px-1 py-1 text-right">
                          <button
                            onClick={() =>
                              set(
                                "sales",
                                part.sales.filter((_, j) => j !== i),
                              )
                            }
                            className="rounded p-1 text-[var(--text-muted)] hover:text-[var(--status-critical)]"
                            aria-label="Remove month"
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <button onClick={() => set("sales", [...part.sales, { month: "", ads: 0, gross: 0 }])} disabled={part.sales.length >= 24} className={`${secondary} mt-2`}>
              <Plus size={14} /> Add a month
            </button>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={label}>HR&rsquo;s overall rating</label>
            <Overall value={part.overall} onChange={(v) => set("overall", v)} />
          </div>
          <div>
            <label className={label}>HR&rsquo;s recommendation</label>
            <input value={part.recommendation} onChange={(ev) => set("recommendation", ev.target.value)} maxLength={300} placeholder="e.g. For regularization" className={input} />
          </div>
        </div>
        <div>
          <label className={label}>HR&rsquo;s comment</label>
          <textarea value={part.comment} onChange={(ev) => set("comment", ev.target.value)} rows={3} maxLength={3000} className={input} />
        </div>

        <ScoreSummary e={e} hr={part} />
        <MySignature onChange={setHasSignature} />
        {error && <div className="text-xs text-[var(--status-critical)]">{error}</div>}
        <div className="flex flex-wrap justify-end gap-2">
          <button onClick={() => save(false)} disabled={!!busy} className={secondary}>
            {busy === "save" ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Save draft
          </button>
          <button onClick={() => save(true)} disabled={!!busy || !ready || !hasSignature} className={primary}>
            {busy === "sign" ? <Loader2 size={15} className="animate-spin" /> : <Signature size={15} />} Sign &amp; submit
          </button>
        </div>
        {!ready && <div className="text-right text-xs text-[var(--text-muted)]">To sign: rate every item, enter the sales, and give the overall rating and recommendation.</div>}
      </div>
    </Modal>
  );
}

// ---- The Department Head's part -------------------------------------------------------

export function HeadPartModal({ e, onClose, onChanged }: { e: SalesAdminEvaluation; onClose: () => void; onChanged: () => void }) {
  const { currentEmployee } = useHris();
  const items = jobItems(e.form);
  // The caller's own part: the first or the second head's.
  const slot = e.headId === currentEmployee?.id ? "head" : "head2";
  const mine = slot === "head" ? e.head : e.head2;
  const [part, setPart] = useState<SaeHeadPart>(() => ({
    ...emptyHeadPart(e.form),
    ...mine,
    job: items.map((_, i) => mine?.job?.[i] ?? null),
  }));
  const [hasSignature, setHasSignature] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof SaeHeadPart>(k: K, v: SaeHeadPart[K]) => setPart((p) => ({ ...p, [k]: v }));
  const ready = part.job.every((x) => x !== null) && !!part.overall && !!part.recommendation.trim();

  async function save(sign: boolean) {
    if (!currentEmployee) return;
    setBusy(sign ? "sign" : "save");
    setError(null);
    try {
      await saveHeadPart(e.id, slot, part, sign ? currentEmployee.id : null);
      onChanged();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Modal open wide onClose={() => !busy && onClose()} title={`Job Performance — ${e.employeeName} (${e.purpose})`}>
      <div className="space-y-5 text-sm">
        <p className="text-[var(--text-secondary)]">
          As the Department Head, rate {e.employeeName}&rsquo;s job performance, then give your overall rating, comment and recommendation. HR rates the Behavior
          {e.form === "sales_admin" ? " and enters the sales" : ""}.
          {e.head2Id && ` ${slot === "head" ? e.head2Name || "The other head" : e.headName || "The other head"} also rates Job Performance; your ratings are averaged.`}
        </p>
        <ScaleLegend />
        <div className="space-y-1.5">
          {items.map((j, i) => (
            <div key={i} className="flex items-center justify-between gap-3 rounded-lg px-2 py-1 hover:bg-[var(--gridline)]/20">
              <span>
                <span className="font-medium text-[var(--text-primary)]">{j.kra}</span>
                <span className="block text-xs text-[var(--text-secondary)]">{j.objective}</span>
              </span>
              <RatingPicker
                value={part.job[i]}
                onChange={(v) =>
                  set(
                    "job",
                    part.job.map((x, k) => (k === i ? v : x)),
                  )
                }
              />
            </div>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={label}>Your overall rating</label>
            <Overall value={part.overall} onChange={(v) => set("overall", v)} />
          </div>
          <div>
            <label className={label}>Your recommendation</label>
            <input value={part.recommendation} onChange={(ev) => set("recommendation", ev.target.value)} maxLength={300} placeholder="e.g. For regularization" className={input} />
          </div>
        </div>
        <div>
          <label className={label}>Your comment</label>
          <textarea value={part.comment} onChange={(ev) => set("comment", ev.target.value)} rows={3} maxLength={3000} className={input} />
        </div>
        <MySignature onChange={setHasSignature} />
        {error && <div className="text-xs text-[var(--status-critical)]">{error}</div>}
        <div className="flex flex-wrap justify-end gap-2">
          <button onClick={() => save(false)} disabled={!!busy} className={secondary}>
            {busy === "save" ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Save draft
          </button>
          <button onClick={() => save(true)} disabled={!!busy || !ready || !hasSignature} className={primary}>
            {busy === "sign" ? <Loader2 size={15} className="animate-spin" /> : <Signature size={15} />} Sign &amp; submit
          </button>
        </div>
        {!ready && <div className="text-right text-xs text-[var(--text-muted)]">To sign: rate every item and give the overall rating and recommendation.</div>}
      </div>
    </Modal>
  );
}

// ---- Vice Chairperson / Chairman ------------------------------------------------------

export function RecommendModal({ e, onClose, onChanged }: { e: SalesAdminEvaluation; onClose: () => void; onChanged: () => void }) {
  const { currentEmployee } = useHris();
  const cfg = saeConfig();
  const role = e.status === "chairman" ? cfg.chairmanTitle : cfg.vcTitle;
  const [text, setText] = useState("");
  const [hasSignature, setHasSignature] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!currentEmployee) return;
    setBusy(true);
    setError(null);
    try {
      await recommendSae(e, currentEmployee.id, text);
      onChanged();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't submit.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={() => !busy && onClose()} title={`${role}'s recommendation — ${e.employeeName}`}>
      <div className="space-y-4 text-sm">
        <ScoreSummary e={e} />
        <Recommendations e={e} />
        <div className="flex justify-end">
          <ViewSaeButton e={e} />
        </div>
        <div>
          <label className={label}>Your recommendation</label>
          <textarea value={text} onChange={(ev) => setText(ev.target.value)} rows={3} maxLength={2000} placeholder="e.g. Approved for regularization" className={input} />
        </div>
        <MySignature onChange={setHasSignature} />
        {error && <div className="text-xs text-[var(--status-critical)]">{error}</div>}
        <div className="flex justify-end">
          <button onClick={submit} disabled={busy || !text.trim() || !hasSignature} className={primary}>
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Signature size={15} />} Sign &amp; submit
          </button>
        </div>
      </div>
    </Modal>
  );
}

// Each signer's rating / recommendation so far.
export function Recommendations({ e }: { e: SalesAdminEvaluation }) {
  const cfg = saeConfig();
  const rows: [string, string | null | undefined, string | null | undefined, string | null][] = [
    [`HR${e.hrName ? ` (${e.hrName})` : ""}`, e.hr?.overall, [e.hr?.recommendation, e.hr?.comment].filter(Boolean).join(" — "), e.hrSignedAt],
    [`${cfg.headTitle}${e.headName ? ` (${e.headName})` : ""}`, e.head?.overall, [e.head?.recommendation, e.head?.comment].filter(Boolean).join(" — "), e.headSignedAt],
    ...(e.head2Id
      ? [
          [
            `${cfg.headTitle}${e.head2Name ? ` (${e.head2Name})` : ""}`,
            e.head2?.overall,
            [e.head2?.recommendation, e.head2?.comment].filter(Boolean).join(" — "),
            e.head2SignedAt,
          ] as [string, string | null | undefined, string | null | undefined, string | null],
        ]
      : []),
    ...(e.vcId || e.vcSignedAt ? [[`${cfg.vcTitle}${e.vcName ? ` (${e.vcName})` : ""}`, null, e.vcRecommendation, e.vcSignedAt] as [string, null, string | null, string | null]] : []),
    [`${cfg.chairmanTitle}${e.chairmanName ? ` (${e.chairmanName})` : ""}`, null, e.chairmanRecommendation, e.chairmanSignedAt],
  ];
  return (
    <div className="space-y-1.5 text-xs">
      {rows.map(([who, overall, rec, at]) => (
        <div key={who} className="rounded-lg border border-[var(--border-hairline)] px-3 py-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-medium text-[var(--text-primary)]">{who}</span>
            <span className={at ? "text-[var(--status-good)]" : "text-[var(--text-muted)]"}>{at ? "Signed" : "Not yet signed"}</span>
          </div>
          {(overall || rec) && at && (
            <div className="mt-0.5 text-[var(--text-secondary)]">
              {overall && <b>{overall}. </b>}
              {rec}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ---- The printable form ---------------------------------------------------------------

export function ViewSaeButton({ e }: { e: SalesAdminEvaluation }) {
  const company = currentCompany();
  const cfg = saeConfig();
  const [viewer, setViewer] = useState<ViewerFile | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function open() {
    setBusy(true);
    setError(null);
    try {
      const bytes = await buildSaePdf({
        evaluation: e,
        companyName: company.name,
        passMark: cfg.passMark,
        letterhead: await loadHrLetterhead(),
        signatures: await saeSignatures(e),
        head: { name: e.headName ?? "", title: cfg.headTitle },
        head2: e.head2Id ? { name: e.head2Name ?? "", title: cfg.headTitle } : null,
        hr: { name: e.hrName ?? "", title: "HR Manager" },
        vc: { name: e.vcName ?? "", title: cfg.vcTitle },
        chairman: { name: e.chairmanName ?? "", title: cfg.chairmanTitle },
      });
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
      setViewer({
        url,
        name: `${e.form === "general" ? "Performance Evaluation" : "Sales Admin Evaluation"} - ${e.purpose} - ${e.employeeName}.pdf`,
        kind: "pdf",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't open the form.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        onClick={open}
        disabled={busy}
        className="flex items-center gap-1 rounded-lg border border-[var(--border-hairline)] px-2 py-1 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40 disabled:opacity-50"
      >
        {busy ? <Loader2 size={12} className="animate-spin" /> : <Eye size={12} />} View / print
      </button>
      {error && <div className="text-[11px] text-[var(--status-critical)]">{error}</div>}
      {viewer && <FileViewer file={viewer} onClose={() => (URL.revokeObjectURL(viewer.url), setViewer(null))} />}
    </>
  );
}
