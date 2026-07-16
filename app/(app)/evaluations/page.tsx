"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, ClipboardList, Plus } from "lucide-react";
import { useHris } from "@/lib/store";
import { PageHeader } from "@/components/PageHeader";
import { Badge, type BadgeTone } from "@/components/Badge";
import { Modal } from "@/components/Modal";
import { EmptyState } from "@/components/EmptyState";
import { CURRENT_EVAL_PERIOD } from "@/lib/mock-data";
import { formatDate, fullName, positionTitle, scopeEmployeesForViewer } from "@/lib/helpers";
import {
  computeCategorySubtotals,
  computeKpiPoints,
  computeOverallScore,
  KPI_TEMPLATE,
  newCriteriaFromTemplate,
  ratingBand,
  type KpiCategory,
  type RatingBand,
} from "@/lib/performance-eval";
import type { EvaluationCriterion, EvaluationStatus } from "@/lib/types";

const STATUS_TONE: Record<EvaluationStatus, BadgeTone> = {
  draft: "muted",
  submitted: "info",
  acknowledged: "good",
};

const BAND_TONE: Record<RatingBand, BadgeTone> = {
  Excellent: "good",
  Good: "info",
  "Needs Improvement": "warning",
  Failed: "critical",
};

const SCORE_LABELS: Record<number, string> = { 0: "Failed", 1: "Needs Improvement", 2: "Good", 3: "Excellent" };
const CATEGORY_ORDER: KpiCategory[] = ["Behavior", "Job Performance"];

function anchorFor(label: string, score: number): string {
  const kpi = KPI_TEMPLATE.find((k) => k.label === label);
  if (!kpi) return "";
  return kpi.anchors[score as 0 | 1 | 2 | 3] ?? "";
}

export default function EvaluationsPage() {
  const { evaluations, employees, currentEmployee, currentUser, addEvaluation, setEvaluationStatus } = useHris();
  const [statusFilter, setStatusFilter] = useState<"all" | EvaluationStatus>("all");
  const [showCreate, setShowCreate] = useState(false);
  const [detail, setDetail] = useState<string | null>(null);

  const canCreate = currentUser?.roles.some((r) => ["hr_admin", "dept_head"].includes(r));

  const visibleEmployeeIds = useMemo(() => {
    const scoped = scopeEmployeesForViewer(employees, currentUser?.roles ?? [], currentEmployee);
    return new Set(scoped.map((e) => e.id));
  }, [employees, currentUser, currentEmployee]);

  const rows = useMemo(() => {
    return evaluations
      .filter((e) => visibleEmployeeIds.has(e.employeeId))
      .filter((e) => (statusFilter === "all" ? true : e.status === statusFilter))
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }, [evaluations, statusFilter, visibleEmployeeIds]);

  const evaluableEmployees = useMemo(() => {
    if (currentUser?.roles.includes("hr_admin")) return employees.filter((e) => e.supervisorId);
    if (currentEmployee) return employees.filter((e) => e.supervisorId === currentEmployee.id);
    return [];
  }, [employees, currentUser, currentEmployee]);

  const [form, setForm] = useState<{ employeeId: string; comments: string; criteria: EvaluationCriterion[] }>({
    employeeId: "",
    comments: "",
    criteria: newCriteriaFromTemplate(),
  });

  function resetForm() {
    setForm({ employeeId: "", comments: "", criteria: newCriteriaFromTemplate() });
  }

  function setScore(index: number, score: number) {
    setForm((f) => {
      const criteria = [...f.criteria];
      criteria[index] = { ...criteria[index], score };
      return { ...f, criteria };
    });
  }

  function setRemarks(index: number, remarks: string) {
    setForm((f) => {
      const criteria = [...f.criteria];
      criteria[index] = { ...criteria[index], remarks };
      return { ...f, criteria };
    });
  }

  const missingRemarks = form.criteria.filter((c) => c.score <= 1 && !c.remarks.trim());
  const canSubmitForm = !!form.employeeId && missingRemarks.length === 0;
  const liveOverall = computeOverallScore(form.criteria);
  const liveSubtotals = computeCategorySubtotals(form.criteria);

  function submit(status: EvaluationStatus) {
    if (!canSubmitForm || !currentEmployee) return;
    addEvaluation({
      employeeId: form.employeeId,
      evaluatorId: currentEmployee.id,
      period: CURRENT_EVAL_PERIOD,
      criteria: form.criteria,
      overallScore: liveOverall,
      comments: form.comments || "No additional comments.",
      status,
    });
    setShowCreate(false);
    resetForm();
  }

  const detailEval = evaluations.find((e) => e.id === detail);
  const detailSubtotals = detailEval ? computeCategorySubtotals(detailEval.criteria) : [];
  const detailBand = detailEval ? ratingBand(detailEval.overallScore) : null;

  return (
    <div>
      <PageHeader
        title="Performance Evaluations"
        subtitle={`Current period: ${CURRENT_EVAL_PERIOD} — KPI-based (Behavior 40% / Job Performance 60%), rated 0-3 per KPI.`}
        actions={
          canCreate && (
            <button onClick={() => setShowCreate(true)} className="flex items-center gap-1.5 rounded-lg bg-[var(--series-1)] px-3 py-2 text-sm font-medium text-[var(--on-accent)]">
              <Plus size={16} /> New evaluation
            </button>
          )
        }
      />

      <div className="mb-4 flex gap-2">
        {(["all", "draft", "submitted", "acknowledged"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium capitalize ${statusFilter === s ? "bg-[var(--series-1)] text-[var(--on-accent)]" : "border border-[var(--border-hairline)] text-[var(--text-secondary)]"}`}
          >
            {s}
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={ClipboardList} title="No evaluations found" description="Try a different status filter, or create a new evaluation for a direct report." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-1)]">
          <table className="w-full min-w-[680px] text-sm">
            <thead>
              <tr className="border-b border-[var(--border-hairline)] text-left text-xs text-[var(--text-muted)]">
                <th className="px-4 py-2 font-medium">Employee</th>
                <th className="px-4 py-2 font-medium">Period</th>
                <th className="px-4 py-2 font-medium">Overall score</th>
                <th className="px-4 py-2 font-medium">Rating</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Date</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((ev) => {
                const emp = employees.find((e) => e.id === ev.employeeId);
                const band = ratingBand(ev.overallScore);
                return (
                  <tr key={ev.id} onClick={() => setDetail(ev.id)} className="cursor-pointer border-b border-[var(--gridline)] last:border-0 hover:bg-[var(--gridline)]/20">
                    <td className="px-4 py-2.5">
                      <div className="font-medium text-[var(--text-primary)]">{emp ? fullName(emp) : ev.employeeId}</div>
                      <div className="text-xs text-[var(--text-muted)]">{emp ? positionTitle(emp.positionId) : ""}</div>
                    </td>
                    <td className="px-4 py-2.5 text-[var(--text-secondary)]">{ev.period}</td>
                    <td className="tabular px-4 py-2.5 font-medium text-[var(--text-primary)]">{ev.overallScore.toFixed(1)}%</td>
                    <td className="px-4 py-2.5"><Badge tone={BAND_TONE[band]}>{band}</Badge></td>
                    <td className="px-4 py-2.5"><Badge tone={STATUS_TONE[ev.status]}>{ev.status}</Badge></td>
                    <td className="tabular px-4 py-2.5 text-[var(--text-secondary)]">{formatDate(ev.createdAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="New performance evaluation" wide>
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Employee</label>
            <select
              value={form.employeeId}
              onChange={(e) => setForm((f) => ({ ...f, employeeId: e.target.value }))}
              className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-2 text-sm"
            >
              <option value="">Select a direct report…</option>
              {evaluableEmployees.map((e) => (
                <option key={e.id} value={e.id}>{fullName(e)} — {positionTitle(e.positionId)}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center justify-between rounded-lg bg-[var(--gridline)]/30 px-3 py-2 text-sm">
            <span className="text-[var(--text-secondary)]">Live overall score</span>
            <span className="flex items-center gap-2">
              <span className="tabular font-semibold text-[var(--text-primary)]">{liveOverall.toFixed(1)}%</span>
              <Badge tone={BAND_TONE[ratingBand(liveOverall)]}>{ratingBand(liveOverall)}</Badge>
            </span>
          </div>

          {CATEGORY_ORDER.map((category) => {
            const subtotal = liveSubtotals.find((s) => s.category === category);
            return (
              <div key={category} className="space-y-3">
                <div className="flex items-center justify-between border-b border-[var(--gridline)] pb-1 text-xs font-semibold uppercase text-[var(--text-muted)]">
                  <span>{category} ({Math.round((subtotal?.weightSum ?? 0) * 100)}%)</span>
                  <span className="tabular">{((subtotal?.pointsSum ?? 0) * 100).toFixed(1)} pts</span>
                </div>
                {form.criteria.map((c, i) => {
                  if (c.category !== category) return null;
                  const needsRemark = c.score <= 1;
                  const missing = needsRemark && !c.remarks.trim();
                  return (
                    <div key={c.label} className="rounded-lg border border-[var(--border-hairline)] p-3">
                      <div className="mb-2 flex items-center justify-between gap-2 text-sm">
                        <span className="font-medium text-[var(--text-primary)]">{c.label}</span>
                        <span className="shrink-0 text-xs text-[var(--text-muted)]">
                          weight {(c.weight * 100).toFixed(2)}% · {(computeKpiPoints(c.score, c.weight) * 100).toFixed(2)} pts
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {[0, 1, 2, 3].map((s) => (
                          <button
                            key={s}
                            onClick={() => setScore(i, s)}
                            className={`rounded-lg px-2.5 py-1.5 text-xs font-medium ${c.score === s ? "bg-[var(--series-1)] text-[var(--on-accent)]" : "border border-[var(--border-hairline)] text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40"}`}
                          >
                            {s} – {SCORE_LABELS[s]}
                          </button>
                        ))}
                      </div>
                      <div className="mt-1.5 text-xs text-[var(--text-muted)]">{anchorFor(c.label, c.score)}</div>
                      {needsRemark && (
                        <div className="mt-2">
                          <textarea
                            value={c.remarks}
                            onChange={(e) => setRemarks(i, e.target.value)}
                            rows={2}
                            placeholder="Required: justify this rating…"
                            className={`w-full rounded-lg border px-3 py-2 text-xs ${missing ? "border-[var(--status-critical)]" : "border-[var(--border-hairline)]"} bg-[var(--surface-1)]`}
                          />
                          {missing && (
                            <div className="mt-1 flex items-center gap-1 text-xs text-[var(--status-critical)]">
                              <AlertTriangle size={12} /> Justification required for a rating of 0 or 1.
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}

          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Overall comments</label>
            <textarea
              value={form.comments}
              onChange={(e) => setForm((f) => ({ ...f, comments: e.target.value }))}
              rows={3}
              className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-2 text-sm"
              placeholder="Optional remarks…"
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={() => submit("draft")} disabled={!canSubmitForm} className="rounded-lg border border-[var(--border-hairline)] px-3 py-1.5 text-sm text-[var(--text-secondary)] disabled:opacity-40">Save as draft</button>
            <button onClick={() => submit("submitted")} disabled={!canSubmitForm} className="rounded-lg bg-[var(--series-1)] px-3 py-1.5 text-sm font-medium text-[var(--on-accent)] disabled:opacity-40">Submit evaluation</button>
          </div>
        </div>
      </Modal>

      <Modal open={!!detailEval} onClose={() => setDetail(null)} title="Evaluation detail" wide>
        {detailEval && detailBand && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium text-[var(--text-primary)]">
                  {(() => { const e = employees.find((x) => x.id === detailEval.employeeId); return e ? fullName(e) : detailEval.employeeId; })()}
                </div>
                <div className="text-xs text-[var(--text-muted)]">{detailEval.period}</div>
              </div>
              <Badge tone={STATUS_TONE[detailEval.status]}>{detailEval.status}</Badge>
            </div>

            {CATEGORY_ORDER.map((category) => {
              const subtotal = detailSubtotals.find((s) => s.category === category);
              return (
                <div key={category} className="space-y-1.5">
                  <div className="flex items-center justify-between border-b border-[var(--gridline)] pb-1 text-xs font-semibold uppercase text-[var(--text-muted)]">
                    <span>{category} ({Math.round((subtotal?.weightSum ?? 0) * 100)}%)</span>
                    <span className="tabular">{((subtotal?.pointsSum ?? 0) * 100).toFixed(1)} pts</span>
                  </div>
                  {detailEval.criteria.filter((c) => c.category === category).map((c) => (
                    <div key={c.label} className="text-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-[var(--text-secondary)]">{c.label}</span>
                        <span className="tabular font-medium text-[var(--text-primary)]">{c.score} – {SCORE_LABELS[c.score]}</span>
                      </div>
                      {c.remarks && <div className="mt-0.5 text-xs italic text-[var(--text-muted)]">{c.remarks}</div>}
                    </div>
                  ))}
                </div>
              );
            })}

            <div className="flex items-center justify-between border-t border-[var(--gridline)] pt-2 text-sm font-semibold">
              <span>Overall</span>
              <span className="flex items-center gap-2">
                <span className="tabular">{detailEval.overallScore.toFixed(1)}%</span>
                <Badge tone={BAND_TONE[detailBand]}>{detailBand}</Badge>
              </span>
            </div>
            <div className="rounded-lg bg-[var(--gridline)]/30 p-3 text-sm text-[var(--text-secondary)]">{detailEval.comments}</div>
            {detailEval.status !== "acknowledged" && (
              <div className="flex justify-end gap-2">
                {detailEval.status === "draft" && (
                  <button onClick={() => setEvaluationStatus(detailEval.id, "submitted")} className="rounded-lg border border-[var(--border-hairline)] px-3 py-1.5 text-sm">Submit</button>
                )}
                <button onClick={() => setEvaluationStatus(detailEval.id, "acknowledged")} className="rounded-lg bg-[var(--series-1)] px-3 py-1.5 text-sm font-medium text-[var(--on-accent)]">Mark acknowledged</button>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
