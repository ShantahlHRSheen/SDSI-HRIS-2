"use client";

import { useState } from "react";
import { ClipboardCheck, Loader2 } from "lucide-react";
import { manilaDateTime } from "@/lib/discipline-pdf";
import { RECOMMENDATIONS, saveAssessment, type DisciplineAssessment } from "@/lib/discipline-assessment";
import type { DisciplinaryRecord } from "@/lib/types";

const section = "rounded-lg border border-[var(--border-hairline)] p-4";
const input = "w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-2 text-sm";

// The Department Head's comment on the written explanation and the action
// they recommend to HR. Not shown to the employee.
export function AssessmentSection({
  record: r,
  assessment,
  issuerName,
  canAssess,
  onSaved,
}: {
  record: DisciplinaryRecord;
  assessment: DisciplineAssessment | null;
  issuerName: string;
  canAssess: boolean;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(!assessment && canAssess);
  const [comment, setComment] = useState(assessment?.comment ?? "");
  const known = assessment && RECOMMENDATIONS.includes(assessment.recommendation);
  const [choice, setChoice] = useState(assessment ? (known ? assessment.recommendation : "Other") : "");
  const [other, setOther] = useState(assessment && !known ? assessment.recommendation : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recommendation = choice === "Other" ? other.trim() : choice;

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await saveAssessment(r.id, comment, recommendation);
      setEditing(false);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={section}>
      <div className="mb-1 flex items-center gap-2 font-medium text-[var(--text-primary)]">
        <ClipboardCheck size={16} /> Department Head&rsquo;s assessment
      </div>
      <p className="mb-3 text-xs text-[var(--text-muted)]">
        {issuerName || "The Department Head"} comments on the written explanation and recommends to HR the disciplinary action to give. The employee doesn&rsquo;t see this.
      </p>

      {assessment && !editing && (
        <div className="space-y-2 text-sm">
          <div>
            <span className="text-xs text-[var(--text-muted)]">Recommended action: </span>
            <span className="font-semibold text-[var(--text-primary)]">{assessment.recommendation}</span>
          </div>
          <div className="rounded-md bg-[var(--gridline)]/30 p-3 whitespace-pre-wrap text-[var(--text-primary)]">{assessment.comment}</div>
          <div className="text-xs text-[var(--text-muted)]">
            {assessment.assessorName} · {manilaDateTime(assessment.assessedAt)}
          </div>
          {canAssess && r.status !== "resolved" && (
            <button onClick={() => setEditing(true)} className="text-xs text-[var(--series-1)] hover:underline">
              Edit assessment
            </button>
          )}
        </div>
      )}

      {editing && (
        <div className="space-y-3 text-sm">
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Your comment on the explanation</label>
            <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={5} maxLength={4000} placeholder="Is the explanation valid? What happened, what you verified, any prior incidents…" className={input} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Recommended disciplinary action</label>
            <select value={choice} onChange={(e) => setChoice(e.target.value)} className={input}>
              <option value="">Choose…</option>
              {[...RECOMMENDATIONS, "Other"].map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
            {choice === "Other" && <input value={other} onChange={(e) => setOther(e.target.value)} maxLength={200} placeholder="e.g. Final written warning and salary deduction for the loss" className={`${input} mt-2`} />}
          </div>
          {error && <div className="text-xs text-[var(--status-critical)]">{error}</div>}
          <div className="flex justify-end gap-2">
            {assessment && (
              <button onClick={() => setEditing(false)} disabled={busy} className="rounded-lg px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40">
                Cancel
              </button>
            )}
            <button onClick={save} disabled={busy || !comment.trim() || !recommendation} className="flex items-center gap-1.5 rounded-lg bg-[var(--series-1)] px-3 py-1.5 text-sm font-medium text-[var(--on-accent)] disabled:opacity-40">
              {busy ? <Loader2 size={14} className="animate-spin" /> : <ClipboardCheck size={14} />} Send to HR
            </button>
          </div>
        </div>
      )}

      {!assessment && !canAssess && <div className="text-sm text-[var(--text-muted)]">Waiting for {issuerName || "the Department Head"} to comment and recommend an action.</div>}
    </div>
  );
}
