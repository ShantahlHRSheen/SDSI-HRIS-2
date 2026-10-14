"use client";

import { useState } from "react";
import { useHris } from "@/lib/store";
import { MySignature } from "@/components/leave/LeaveApplication";
import { decideBranch, type BranchApproval, type FormKind } from "@/lib/branch-approval";

const exact = { WebkitPrintColorAdjust: "exact", printColorAdjust: "exact" } as const;
const signedOn = (iso: string | null) => (iso ? new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Manila", month: "short", day: "numeric", year: "numeric" }).format(new Date(iso)) : "");

// The branch approver's part, filled in on the form (approve / disapprove + sign).
export function BranchDecision({ kind, requestId, onDone }: { kind: FormKind; requestId: string; onDone: () => Promise<void> | void }) {
  const { currentEmployee } = useHris();
  const [decision, setDecision] = useState<"approved" | "disapproved" | null>(null);
  const [reason, setReason] = useState("");
  const [hasSignature, setHasSignature] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!currentEmployee || !decision) return;
    setBusy(true);
    setError(null);
    try {
      await decideBranch(kind, requestId, currentEmployee.id, decision, reason);
      await onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't submit.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-[var(--border-hairline)] p-3">
      <div className="text-sm font-semibold text-[var(--text-primary)]">Branch approval</div>
      <div className="text-xs text-[var(--text-muted)]">After you approve, it goes to the department head, then to HR.</div>
      <div className="flex flex-wrap gap-4 text-sm text-[var(--text-secondary)]">
        <label className="flex items-center gap-2">
          <input type="radio" name="branch-decision" checked={decision === "approved"} onChange={() => setDecision("approved")} /> Approved
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" name="branch-decision" checked={decision === "disapproved"} onChange={() => setDecision("disapproved")} /> Disapproved
        </label>
      </div>
      {decision === "disapproved" && (
        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]" htmlFor="branch-reason">
            Reason of disapproval
          </label>
          <input id="branch-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-2 text-sm" />
        </div>
      )}
      <MySignature onChange={setHasSignature} />
      {error && <div className="text-xs text-[var(--status-critical)]">{error}</div>}
      <div className="flex justify-end">
        <button
          onClick={submit}
          disabled={busy || !decision || !hasSignature || (decision === "disapproved" && !reason.trim())}
          className="rounded-lg bg-[var(--series-1)] px-3 py-1.5 text-sm font-medium text-[var(--on-accent)] disabled:opacity-40"
        >
          {busy ? "Submitting…" : decision === "disapproved" ? "Sign & disapprove" : "Sign & send to department head"}
        </button>
      </div>
    </div>
  );
}

// The branch approval on the printed form (only when the form has one).
export function BranchApprovalBlock({ form, signature }: { form: BranchApproval; signature?: string }) {
  if (!form.branchApproverId && !form.branchSignedName) return null;
  const decided = !!form.branchDecision;
  const box = (on: boolean) => <span style={{ fontSize: "11pt", marginRight: "6px" }}>{on ? "☑" : "☐"}</span>;
  return (
    <div style={{ border: "1px solid #222", marginTop: "10px", padding: "6px 8px", fontSize: "9.5pt", breakInside: "avoid" }}>
      <div style={{ ...exact, background: "#e8e8e8", fontWeight: 700, textAlign: "center", letterSpacing: "0.5px", margin: "-6px -8px 6px", padding: "4px 0", borderBottom: "1px solid #222" }}>BRANCH APPROVAL</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", alignItems: "end" }}>
        <div style={{ lineHeight: 1.7 }}>
          <div>
            {box(form.branchDecision === "approved")}Approved
          </div>
          <div>
            {box(form.branchDecision === "disapproved")}Disapproved due to: <span style={{ borderBottom: "1px solid #555" }}>{form.branchDecision === "disapproved" ? form.branchReason : ""}</span>
          </div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ height: "40px", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
            {decided && signature && (
              // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL from Supabase Storage
              <img src={signature} alt="Signature" style={{ maxHeight: "48px", maxWidth: "170px", marginBottom: "-14px", ...exact }} />
            )}
          </div>
          <div style={{ borderBottom: "1px solid #111", fontWeight: 700, textTransform: "uppercase", minHeight: "16px" }}>{form.branchSignedName ?? form.branchApprover}</div>
          <div style={{ fontSize: "8.5pt" }}>Branch Approver{form.branchSignedAt ? ` · ${signedOn(form.branchSignedAt)}` : ""}</div>
        </div>
      </div>
    </div>
  );
}
