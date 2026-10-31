"use client";

import { useState } from "react";
import { BadgeCheck, Pencil, Plus, Trash2 } from "lucide-react";
import { useHris } from "@/lib/store";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { Modal } from "@/components/Modal";
import { formatDate } from "@/lib/helpers";
import { deleteRegularization, type Regularization } from "@/lib/regularization";
import { PrepareRegModal, RegStatus, SignRegModal, ViewRegButton, primary, secondary, useRegularizations } from "@/components/regularization/Regularization";

// Regularization: HR prepares the Regular Contract of Employment and the
// Notice of Regularization and Salary Adjustment and signs the notice; the
// Chairman signs the contract; the employee receives both.
export default function RegularizationPage() {
  const { currentUser, currentEmployee, isRealAccount } = useHris();
  const { items, error, reload } = useRegularizations();
  const isHr = !!currentUser?.roles.includes("hr_admin");
  const me = currentEmployee?.id;
  const [editing, setEditing] = useState<Regularization | "new" | null>(null);
  const [signing, setSigning] = useState<{ item: Regularization; as: "chairman" | "employee" } | null>(null);
  const [deleting, setDeleting] = useState<Regularization | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const list = items ?? [];
  const toSign = list.filter((r) => r.status === "chairman" && r.signatoryId === me);
  const toReceive = list.filter((r) => r.status === "employee" && r.employeeId === me);
  const drafts = isHr ? list.filter((r) => r.status === "hr") : [];

  async function confirmDelete() {
    if (!deleting) return;
    setBusy(true);
    setActionError(null);
    try {
      await deleteRegularization(deleting.id);
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
        <PageHeader title="Regularization" subtitle="Regular contract and notice of regularization." />
        <EmptyState icon={BadgeCheck} title="Not available in the demo" description="Sign in with your employee account." />
      </div>
    );
  }

  const queue = (title: string, rows: Regularization[], label: string, open: (r: Regularization) => void) =>
    rows.length > 0 && (
      <div className="mb-4 rounded-xl border border-[var(--series-1)]/40 bg-[var(--surface-1)] p-4">
        <div className="mb-3 text-sm font-medium text-[var(--text-primary)]">
          {title} ({rows.length})
        </div>
        <div className="space-y-2">
          {rows.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[var(--gridline)]/20 px-3 py-2 text-sm">
              <div>
                <span className="font-medium text-[var(--text-primary)]">{r.employeeName}</span>
                <span className="text-[var(--text-secondary)]">
                  {" "}
                  — {r.data.position} · regular effective {formatDate(r.data.effectiveDate)}
                </span>
                {r.returnedNote && <div className="text-xs text-[var(--status-critical)]">Returned: {r.returnedNote}</div>}
              </div>
              <button onClick={() => open(r)} className={primary}>
                {label}
              </button>
            </div>
          ))}
        </div>
      </div>
    );

  return (
    <div>
      <PageHeader
        title="Regularization"
        subtitle="HR prepares the Regular Contract of Employment and the Notice of Regularization; the Chairman signs the contract; the employee receives and signs both."
        actions={
          isHr && (
            <button onClick={() => (setActionError(null), setEditing("new"))} className={primary}>
              <Plus size={16} /> New regularization
            </button>
          )
        }
      />
      {(error || actionError) && <div className="mb-4 rounded-lg border border-[var(--status-critical)]/40 px-3 py-2 text-sm text-[var(--status-critical)]">{error || actionError}</div>}

      {queue("Contracts for you to sign", toSign, "Review & sign", (r) => setSigning({ item: r, as: "chairman" }))}
      {queue("Your regularization — please receive", toReceive, "Read & receive", (r) => setSigning({ item: r, as: "employee" }))}
      {queue("Drafts to send", drafts, "Open", (r) => setEditing(r))}

      {items && !list.length && (
        <EmptyState icon={BadgeCheck} title="No regularizations" description={isHr ? "Start one with New regularization." : "Your regularization contract shows here once it's ready for you."} />
      )}
      {list.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-1)]">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-[var(--border-hairline)] text-left text-xs text-[var(--text-muted)]">
                <th className="px-3 py-2 font-medium">Employee</th>
                <th className="px-3 py-2 font-medium">Position</th>
                <th className="px-3 py-2 font-medium">Regular effective</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {list.map((r) => (
                <tr key={r.id} className="border-b border-[var(--gridline)] last:border-0">
                  <td className="px-3 py-2 font-medium text-[var(--text-primary)]">{r.employeeName}</td>
                  <td className="px-3 py-2 text-[var(--text-secondary)]">{r.data.position}</td>
                  <td className="px-3 py-2 text-[var(--text-secondary)]">{formatDate(r.data.effectiveDate)}</td>
                  <td className="px-3 py-2">
                    <RegStatus item={r} />
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-end gap-1.5">
                      <ViewRegButton item={r} />
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

      {editing && <PrepareRegModal key={editing === "new" ? "new" : editing.id} item={editing === "new" ? null : editing} onClose={() => setEditing(null)} onChanged={reload} />}
      {signing && <SignRegModal item={signing.item} as={signing.as} onClose={() => setSigning(null)} onChanged={reload} />}
      {deleting && (
        <Modal open onClose={() => !busy && setDeleting(null)} title="Delete regularization?">
          <p className="mb-4 text-sm text-[var(--text-secondary)]">The regularization of {deleting.employeeName} and its signatures will be deleted.</p>
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
