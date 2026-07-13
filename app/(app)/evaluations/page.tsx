"use client";

import { useMemo, useState } from "react";
import { ClipboardList, Plus } from "lucide-react";
import { useHris } from "@/lib/store";
import { PageHeader } from "@/components/PageHeader";
import { Badge, type BadgeTone } from "@/components/Badge";
import { Modal } from "@/components/Modal";
import { EmptyState } from "@/components/EmptyState";
import { CURRENT_EVAL_PERIOD, EVAL_CRITERIA_TEMPLATE } from "@/lib/mock-data";
import { formatDate, fullName, positionTitle } from "@/lib/helpers";
import type { EvaluationCriterion, EvaluationStatus } from "@/lib/types";

const STATUS_TONE: Record<EvaluationStatus, BadgeTone> = {
  draft: "muted",
  submitted: "info",
  acknowledged: "good",
};

export default function EvaluationsPage() {
  const { evaluations, employees, currentEmployee, currentUser, addEvaluation, setEvaluationStatus } = useHris();
  const [statusFilter, setStatusFilter] = useState<"all" | EvaluationStatus>("all");
  const [showCreate, setShowCreate] = useState(false);
  const [detail, setDetail] = useState<string | null>(null);

  const canCreate = currentUser?.roles.some((r) => ["hr_admin", "dept_head"].includes(r));

  const rows = useMemo(() => {
    return evaluations
      .filter((e) => (statusFilter === "all" ? true : e.status === statusFilter))
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }, [evaluations, statusFilter]);

  const evaluableEmployees = useMemo(() => {
    if (currentUser?.roles.includes("hr_admin")) return employees.filter((e) => e.supervisorId);
    if (currentEmployee) return employees.filter((e) => e.supervisorId === currentEmployee.id);
    return [];
  }, [employees, currentUser, currentEmployee]);

  const [form, setForm] = useState<{ employeeId: string; comments: string; scores: number[] }>({
    employeeId: "",
    comments: "",
    scores: EVAL_CRITERIA_TEMPLATE.map(() => 3),
  });

  function resetForm() {
    setForm({ employeeId: "", comments: "", scores: EVAL_CRITERIA_TEMPLATE.map(() => 3) });
  }

  function submit(status: EvaluationStatus) {
    if (!form.employeeId || !currentEmployee) return;
    const criteria: EvaluationCriterion[] = EVAL_CRITERIA_TEMPLATE.map((c, i) => ({ ...c, score: form.scores[i] }));
    const overallScore = Math.round(criteria.reduce((s, c) => s + c.score * c.weight, 0) * 10) / 10;
    addEvaluation({
      employeeId: form.employeeId,
      evaluatorId: currentEmployee.id,
      period: CURRENT_EVAL_PERIOD,
      criteria,
      overallScore,
      comments: form.comments || "No additional comments.",
      status,
    });
    setShowCreate(false);
    resetForm();
  }

  const detailEval = evaluations.find((e) => e.id === detail);

  return (
    <div>
      <PageHeader
        title="Performance Evaluations"
        subtitle={`Current period: ${CURRENT_EVAL_PERIOD}`}
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
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-[var(--border-hairline)] text-left text-xs text-[var(--text-muted)]">
                <th className="px-4 py-2 font-medium">Employee</th>
                <th className="px-4 py-2 font-medium">Period</th>
                <th className="px-4 py-2 font-medium">Overall score</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Date</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((ev) => {
                const emp = employees.find((e) => e.id === ev.employeeId);
                return (
                  <tr key={ev.id} onClick={() => setDetail(ev.id)} className="cursor-pointer border-b border-[var(--gridline)] last:border-0 hover:bg-[var(--gridline)]/20">
                    <td className="px-4 py-2.5">
                      <div className="font-medium text-[var(--text-primary)]">{emp ? fullName(emp) : ev.employeeId}</div>
                      <div className="text-xs text-[var(--text-muted)]">{emp ? positionTitle(emp.positionId) : ""}</div>
                    </td>
                    <td className="px-4 py-2.5 text-[var(--text-secondary)]">{ev.period}</td>
                    <td className="tabular px-4 py-2.5 font-medium text-[var(--text-primary)]">{ev.overallScore.toFixed(1)} / 5</td>
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
          <div className="space-y-3">
            {EVAL_CRITERIA_TEMPLATE.map((c, i) => (
              <div key={c.label}>
                <div className="mb-1 flex items-center justify-between text-xs font-medium text-[var(--text-secondary)]">
                  <span>{c.label} <span className="text-[var(--text-muted)]">({Math.round(c.weight * 100)}%)</span></span>
                  <span className="tabular text-[var(--text-primary)]">{form.scores[i].toFixed(1)}</span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={5}
                  step={0.5}
                  value={form.scores[i]}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setForm((f) => {
                      const scores = [...f.scores];
                      scores[i] = v;
                      return { ...f, scores };
                    });
                  }}
                  className="w-full accent-[var(--series-1)]"
                />
              </div>
            ))}
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Comments</label>
            <textarea
              value={form.comments}
              onChange={(e) => setForm((f) => ({ ...f, comments: e.target.value }))}
              rows={3}
              className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-2 text-sm"
              placeholder="Optional remarks…"
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={() => submit("draft")} disabled={!form.employeeId} className="rounded-lg border border-[var(--border-hairline)] px-3 py-1.5 text-sm text-[var(--text-secondary)] disabled:opacity-40">Save as draft</button>
            <button onClick={() => submit("submitted")} disabled={!form.employeeId} className="rounded-lg bg-[var(--series-1)] px-3 py-1.5 text-sm font-medium text-[var(--on-accent)] disabled:opacity-40">Submit evaluation</button>
          </div>
        </div>
      </Modal>

      <Modal open={!!detailEval} onClose={() => setDetail(null)} title="Evaluation detail" wide>
        {detailEval && (
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
            <div className="space-y-2">
              {detailEval.criteria.map((c) => (
                <div key={c.label} className="flex items-center justify-between text-sm">
                  <span className="text-[var(--text-secondary)]">{c.label}</span>
                  <span className="tabular font-medium text-[var(--text-primary)]">{c.score.toFixed(1)} / 5</span>
                </div>
              ))}
              <div className="flex items-center justify-between border-t border-[var(--gridline)] pt-2 text-sm font-semibold">
                <span>Overall</span>
                <span className="tabular">{detailEval.overallScore.toFixed(1)} / 5</span>
              </div>
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
