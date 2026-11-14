"use client";

import { useState } from "react";
import { Baby, Pencil, Plus, Trash2 } from "lucide-react";
import { useHris } from "@/lib/store";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { Modal } from "@/components/Modal";
import { deleteMaternityBenefit, longDate, mbMyStep, type MaternityBenefit, type MbStep } from "@/lib/maternity";
import { MbStatusBadge, PrepareMbModal, STEP_LABEL, SignMbModal, ViewMbButton, peso, primary, secondary, useMaternityBenefits } from "@/components/maternity/Maternity";

// SSS Maternity Benefit Payment Voucher: HR computes and prepares it; it's
// checked, approved twice, released, and received by the employee.
export default function MaternityBenefitPage() {
  const { currentUser, currentEmployee, isRealAccount } = useHris();
  const { items, error, reload } = useMaternityBenefits();
  const isHr = !!currentUser?.roles.includes("hr_admin");
  const me = currentEmployee?.id;
  const [editing, setEditing] = useState<MaternityBenefit | "new" | null>(null);
  const [signing, setSigning] = useState<{ item: MaternityBenefit; step: Exclude<MbStep, "hr"> } | null>(null);
  const [deleting, setDeleting] = useState<MaternityBenefit | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const list = items ?? [];
  const mine = list.filter((r) => mbMyStep(r, me));
  const drafts = isHr ? list.filter((r) => r.status === "hr") : [];

  async function confirmDelete() {
    if (!deleting) return;
    setBusy(true);
    setActionError(null);
    try {
      await deleteMaternityBenefit(deleting.id);
      setDeleting(null);
      reload();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Couldn't delete.");
    } finally {
      setBusy(false);
    }
  }

  if (!isRealAccount) {
    return (
      <div>
        <PageHeader title="Maternity Benefit" subtitle="SSS maternity benefit computation and payment voucher." />
        <EmptyState icon={Baby} title="Not available in the demo" description="Sign in with your employee account." />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Maternity Benefit"
        subtitle="SSS maternity benefit computation and payment voucher (RA 11210): prepared by HR, checked, approved, released, and received by the employee."
        actions={
          isHr && (
            <button onClick={() => (setActionError(null), setEditing("new"))} className={primary}>
              <Plus size={16} /> New voucher
            </button>
          )
        }
      />
      {(error || actionError) && <div className="mb-4 rounded-lg border border-[var(--status-critical)]/40 px-3 py-2 text-sm text-[var(--status-critical)]">{error || actionError}</div>}

      {[
        { title: "Waiting for your signature", rows: mine, label: (r: MaternityBenefit) => (mbMyStep(r, me) === "receive" ? "Check & receive" : `Sign as ${STEP_LABEL[mbMyStep(r, me)!]}`), open: (r: MaternityBenefit) => setSigning({ item: r, step: mbMyStep(r, me)! }) },
        { title: "Drafts to send", rows: drafts, label: () => "Open", open: (r: MaternityBenefit) => setEditing(r) },
      ].map(
        (q) =>
          q.rows.length > 0 && (
            <div key={q.title} className="mb-4 rounded-xl border-2 border-[var(--series-1)]/40 bg-[var(--surface-1)] p-4">
              <div className="mb-3 text-sm font-semibold text-[var(--text-primary)]">
                {q.title} ({q.rows.length})
              </div>
              <div className="space-y-2">
                {q.rows.map((r) => (
                  <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[var(--gridline)]/20 px-3 py-2 text-sm">
                    <div>
                      <span className="font-medium text-[var(--text-primary)]">{r.employeeName}</span>
                      <span className="text-[var(--text-secondary)]"> — net {peso(r.netAmount)}</span>
                      {r.returnedNote && <div className="text-xs text-[var(--status-critical)]">Returned by {r.returnedBy}: {r.returnedNote}</div>}
                    </div>
                    <button onClick={() => q.open(r)} className={primary}>
                      {q.label(r)}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ),
      )}

      {items && !list.length && (
        <EmptyState icon={Baby} title="No maternity benefit vouchers" description={isHr ? "Start one with New voucher." : "Vouchers addressed to you show here."} />
      )}
      {list.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-1)]">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-[var(--border-hairline)] text-left text-xs text-[var(--text-muted)]">
                <th className="px-3 py-2 font-medium">Employee</th>
                <th className="px-3 py-2 font-medium">Delivery</th>
                <th className="px-3 py-2 text-right font-medium">Net amount</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {list.map((r) => (
                <tr key={r.id} className="border-b border-[var(--gridline)] last:border-0">
                  <td className="px-3 py-2 font-medium text-[var(--text-primary)]">{r.employeeName}</td>
                  <td className="px-3 py-2 text-[var(--text-secondary)]">{longDate(r.data.deliveryDate)}</td>
                  <td className="px-3 py-2 text-right text-[var(--text-primary)] tabular-nums">{peso(r.netAmount)}</td>
                  <td className="px-3 py-2">
                    <MbStatusBadge item={r} />
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-end gap-1.5">
                      <ViewMbButton item={r} />
                      {isHr && r.status === "hr" && (
                        <button onClick={() => setEditing(r)} className={`${secondary} px-2 py-1 text-xs`}>
                          <Pencil size={12} /> Edit
                        </button>
                      )}
                      {isHr && r.status !== "done" && (
                        <button onClick={() => (setActionError(null), setDeleting(r))} className="rounded-lg p-1.5 text-[var(--text-muted)] hover:text-[var(--status-critical)]" aria-label="Delete">
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && <PrepareMbModal key={editing === "new" ? "new" : editing.id} item={editing === "new" ? null : editing} onClose={() => setEditing(null)} onChanged={reload} />}
      {signing && <SignMbModal item={signing.item} step={signing.step} onClose={() => setSigning(null)} onChanged={reload} />}
      {deleting && (
        <Modal open onClose={() => !busy && setDeleting(null)} title="Delete this voucher?">
          <p className="mb-4 text-sm text-[var(--text-secondary)]">The maternity benefit voucher of {deleting.employeeName} and its signatures will be deleted.</p>
          <div className="flex justify-end gap-2">
            <button onClick={() => setDeleting(null)} disabled={busy} className={secondary}>
              Cancel
            </button>
            <button onClick={confirmDelete} disabled={busy} className="rounded-lg bg-[var(--status-critical)] px-3 py-2 text-sm font-medium text-white disabled:opacity-40">
              Delete
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
