"use client";

import { useEffect, useState } from "react";
import { CalendarClock, Pencil, Plus, Trash2 } from "lucide-react";
import { useHris } from "@/lib/store";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { Modal } from "@/components/Modal";
import { longDate, deleteProbationExtension, peMyPart, type PeSigner, type ProbationExtension } from "@/lib/probation-extension";
import { PeStatus, PreparePeModal, SignPeModal, ViewPeButton, primary, secondary, useProbationExtensions } from "@/components/probation/ProbationExtension";

// Extension of Probationary Employment: HR prepares and signs; the Department
// Head notes; the Chairman approves; the employee signs the conforme.
export default function ProbationExtensionPage() {
  const { currentUser, currentEmployee, isRealAccount } = useHris();
  const { items, error, reload } = useProbationExtensions();
  const isHr = !!currentUser?.roles.includes("hr_admin");
  const me = currentEmployee?.id;
  const [editing, setEditing] = useState<ProbationExtension | "new" | null>(null);
  const [signing, setSigning] = useState<{ item: ProbationExtension; as: Exclude<PeSigner, "hr"> } | null>(null);
  const [deleting, setDeleting] = useState<ProbationExtension | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const list = items ?? [];
  const toSign = list.filter((r) => peMyPart(r, me) === "employee");
  const drafts = isHr ? list.filter((r) => r.status === "hr") : [];

  // Opened from the sign-in alert (?open=<id>): straight to signing.
  const [openId] = useState(() => (typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("open")));
  const [opened, setOpened] = useState(false);
  useEffect(() => {
    if (opened || !openId || !items) return;
    const r = items.find((x) => x.id === openId);
    const as = r ? peMyPart(r, me) : null;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time open from the link
    if (r && as) setSigning({ item: r, as });
    setOpened(true);
  }, [items, openId, opened, me]);

  async function confirmDelete() {
    if (!deleting) return;
    setBusy(true);
    setActionError(null);
    try {
      await deleteProbationExtension(deleting.id);
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
        <PageHeader title="Probation Extension" subtitle="Extension of probationary employment." />
        <EmptyState icon={CalendarClock} title="Not available in the demo" description="Sign in with your employee account." />
      </div>
    );
  }

  const queue = (title: string, rows: ProbationExtension[], label: string, open: (r: ProbationExtension) => void, urgent = false) =>
    rows.length > 0 && (
      <div className={`mb-4 rounded-xl border-2 p-4 ${urgent ? "border-[var(--status-critical)]" : "border-[var(--series-1)]/40"} bg-[var(--surface-1)]`}>
        <div className={`mb-3 text-sm font-semibold ${urgent ? "text-[var(--status-critical)]" : "text-[var(--text-primary)]"}`}>
          {title} ({rows.length})
        </div>
        <div className="space-y-2">
          {rows.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[var(--gridline)]/20 px-3 py-2 text-sm">
              <div>
                <span className="font-medium text-[var(--text-primary)]">{r.employeeName}</span>
                <span className="text-[var(--text-secondary)]">
                  {" "}
                  — {r.data.position} · extended until {longDate(r.data.extendTo)}
                </span>
                {r.returnedNote && <div className="text-xs text-[var(--status-critical)]">Returned by {r.returnedBy}: {r.returnedNote}</div>}
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
        title="Probation Extension"
        subtitle="Extension of Probationary Employment: HR prepares, signs and sends it, and the employee gets it right away to sign the conforme. Noted by and Approved by are printed on the letter only."
        actions={
          isHr && (
            <button onClick={() => (setActionError(null), setEditing("new"))} className={primary}>
              <Plus size={16} /> New extension
            </button>
          )
        }
      />
      {(error || actionError) && <div className="mb-4 rounded-lg border border-[var(--status-critical)]/40 px-3 py-2 text-sm text-[var(--status-critical)]">{error || actionError}</div>}

      {queue("Your notice — please read and sign", toSign, "Read & sign", (r) => setSigning({ item: r, as: "employee" }), true)}
      {queue("Drafts to send", drafts, "Open", (r) => setEditing(r))}

      {items && !list.length && (
        <EmptyState icon={CalendarClock} title="No probation extensions" description={isHr ? "Start one with New extension." : "A notice addressed to you shows here."} />
      )}
      {list.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-1)]">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-[var(--border-hairline)] text-left text-xs text-[var(--text-muted)]">
                <th className="px-3 py-2 font-medium">Employee</th>
                <th className="px-3 py-2 font-medium">Position</th>
                <th className="px-3 py-2 font-medium">Extended</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {list.map((r) => (
                <tr key={r.id} className="border-b border-[var(--gridline)] last:border-0">
                  <td className="px-3 py-2 font-medium text-[var(--text-primary)]">{r.employeeName}</td>
                  <td className="px-3 py-2 text-[var(--text-secondary)]">{r.data.position}</td>
                  <td className="px-3 py-2 text-[var(--text-secondary)]">
                    {longDate(r.data.extendFrom)} – {longDate(r.data.extendTo)}
                  </td>
                  <td className="px-3 py-2">
                    <PeStatus item={r} />
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-end gap-1.5">
                      <ViewPeButton item={r} />
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

      {editing && <PreparePeModal key={editing === "new" ? "new" : editing.id} item={editing === "new" ? null : editing} onClose={() => setEditing(null)} onChanged={reload} />}
      {signing && <SignPeModal item={signing.item} as={signing.as} onClose={() => setSigning(null)} onChanged={reload} />}
      {deleting && (
        <Modal open onClose={() => !busy && setDeleting(null)} title="Delete this extension notice?">
          <p className="mb-4 text-sm text-[var(--text-secondary)]">The extension notice of {deleting.employeeName} and its signatures will be deleted.</p>
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
