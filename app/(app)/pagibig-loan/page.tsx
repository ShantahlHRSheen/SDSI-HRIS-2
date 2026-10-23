"use client";

import { useMemo, useState } from "react";
import { FileSignature, FileText, Landmark, Loader2, Trash2 } from "lucide-react";
import { useHris } from "@/lib/store";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { Modal } from "@/components/Modal";
import { formatDate, fullName } from "@/lib/helpers";
import { MplStatus, PrepareMplModal, RequestMplModal, SignMplModal, ViewMplButton, useMplRequests } from "@/components/mpl/Mpl";
import { deleteMpl, requestMpl, type MplRequest } from "@/lib/mpl";

// Pag-IBIG Multi-Purpose Loan Application Form: the employee asks; HR fills
// the employer's part and the Certificate of Net Pay and sends it to the
// authorized signatory, who signs; the employee downloads and prints it.
export default function PagibigLoanPage() {
  const { currentUser, currentEmployee, employees, isRealAccount } = useHris();
  const { items, error, reload } = useMplRequests();
  const isHr = !!currentUser?.roles.includes("hr_admin");
  const me = currentEmployee?.id;
  const [requesting, setRequesting] = useState(false);
  const [preparingId, setPreparingId] = useState<string | null>(null);
  const [signingId, setSigningId] = useState<string | null>(null);
  const preparing = items.find((r) => r.id === preparingId) ?? null;
  const signing = items.find((r) => r.id === signingId) ?? null;
  const [search, setSearch] = useState("");
  const [deleting, setDeleting] = useState<MplRequest | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [direct, setDirect] = useState(false);
  const [directEmployee, setDirectEmployee] = useState("");

  const mine = items.filter((r) => r.employeeId === me);
  const toPrepare = isHr ? items.filter((r) => r.status === "hr") : [];
  const toSign = items.filter((r) => r.status === "signatory" && r.signatoryId === me);
  const all = items.filter((r) => !search || r.employeeName.toLowerCase().includes(search.toLowerCase()));
  const people = useMemo(() => employees.filter((e) => e.status === "active" || e.status === "on_leave").sort((a, b) => fullName(a).localeCompare(fullName(b))), [employees]);

  async function startDirect() {
    if (!directEmployee) return;
    setBusy(true);
    setActionError(null);
    try {
      const id = await requestMpl(directEmployee, "");
      await reload();
      setDirect(false);
      setDirectEmployee("");
      setPreparingId(id);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Couldn't start the form.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    setBusy(true);
    setActionError(null);
    try {
      await deleteMpl(deleting);
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
        <PageHeader title="Pag-IBIG Loan Form" subtitle="Pag-IBIG Multi-Purpose Loan Application Form." />
        <EmptyState icon={Landmark} title="Not available in the demo" description="Sign in with your employee account to request the form." />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Pag-IBIG Loan Form"
        subtitle="Pag-IBIG Multi-Purpose Loan Application Form (HQP-SLF-065): HR fills in the employer's part and your Certificate of Net Pay, and the authorized signatory signs it."
        actions={
          <div className="flex flex-wrap gap-2">
            {isHr && (
              <button onClick={() => (setActionError(null), setDirect(true))} className="flex items-center gap-1.5 rounded-lg border border-[var(--border-hairline)] px-3 py-2 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40">
                <FileText size={16} /> Prepare for an employee
              </button>
            )}
            {currentEmployee && (
              <button onClick={() => setRequesting(true)} className="flex items-center gap-1.5 rounded-lg bg-[var(--series-1)] px-3 py-2 text-sm font-medium text-[var(--on-accent)]">
                <Landmark size={16} /> Request the form
              </button>
            )}
          </div>
        }
      />
      {error && <div className="mb-4 rounded-lg border border-[var(--status-critical)]/40 px-3 py-2 text-sm text-[var(--status-critical)]">{error}</div>}

      <Queue title={`Pag-IBIG loan forms for you to sign (${toSign.length})`} items={toSign} action="Review & sign" onOpen={setSigningId} />
      <Queue title={`Pag-IBIG loan forms to prepare (${toPrepare.length})`} items={toPrepare} action="Prepare" onOpen={setPreparingId} />

      <Section title="My Pag-IBIG loan forms">
        {mine.length === 0 ? (
          <EmptyState icon={Landmark} title="No requests yet" description="Use “Request the form”. Once it's signed, download and print it, fill in your part and sign it, then file it at Pag-IBIG." />
        ) : (
          <Table rows={mine} />
        )}
      </Section>

      {isHr && (
        <Section
          title="All Pag-IBIG loan forms"
          right={<input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search employee…" className="w-56 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-1.5 text-xs" />}
        >
          {all.length === 0 ? (
            <EmptyState icon={Landmark} title="No requests" description="Pag-IBIG loan form requests appear here." />
          ) : (
            <Table rows={all} showEmployee onPrepare={(r) => setPreparingId(r.id)} onDelete={(r) => (setActionError(null), setDeleting(r))} />
          )}
        </Section>
      )}

      {requesting && <RequestMplModal onClose={() => setRequesting(false)} onDone={reload} />}
      {preparing && <PrepareMplModal key={preparing.id} item={preparing} onClose={() => setPreparingId(null)} onChanged={reload} />}
      {signing && <SignMplModal key={signing.id} item={signing} onClose={() => setSigningId(null)} onChanged={reload} />}

      <Modal open={direct} onClose={() => !busy && setDirect(false)} title="Prepare a Pag-IBIG loan form">
        <div className="space-y-3 text-sm">
          <p className="text-[var(--text-secondary)]">Choose the employee. You&rsquo;ll check the employer&rsquo;s part and net pay, then send it to the authorized signatory.</p>
          <select value={directEmployee} onChange={(e) => setDirectEmployee(e.target.value)} className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-2 text-sm">
            <option value="">Choose an employee…</option>
            {people.map((e) => (
              <option key={e.id} value={e.id}>
                {fullName(e)}
              </option>
            ))}
          </select>
          {actionError && <div className="text-xs text-[var(--status-critical)]">{actionError}</div>}
          <div className="flex justify-end gap-2">
            <button onClick={() => setDirect(false)} disabled={busy} className="rounded-lg px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40">
              Cancel
            </button>
            <button onClick={startDirect} disabled={busy || !directEmployee} className="flex items-center gap-1.5 rounded-lg bg-[var(--series-1)] px-3 py-1.5 text-sm font-medium text-[var(--on-accent)] disabled:opacity-40">
              {busy ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />} Continue
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={!!deleting} onClose={() => !busy && setDeleting(null)} title="Delete Pag-IBIG loan form">
        {deleting && (
          <div className="space-y-3 text-sm text-[var(--text-secondary)]">
            <p>
              Delete <span className="font-medium text-[var(--text-primary)]">{deleting.employeeName}</span>&rsquo;s Pag-IBIG loan form request from {formatDate(deleting.requestedAt)}? This can&rsquo;t be undone.
            </p>
            {actionError && <div className="text-xs text-[var(--status-critical)]">{actionError}</div>}
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeleting(null)} disabled={busy} className="rounded-lg px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40">
                Cancel
              </button>
              <button onClick={confirmDelete} disabled={busy} className="rounded-lg bg-[var(--status-critical)] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">
                {busy ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function Section({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="mb-4 rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-1)] p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm font-medium text-[var(--text-primary)]">{title}</div>
        {right}
      </div>
      {children}
    </div>
  );
}

function Queue({ title, items, action, onOpen }: { title: string; items: MplRequest[]; action: string; onOpen: (id: string) => void }) {
  if (!items.length) return null;
  return (
    <div className="mb-4 rounded-xl border border-[var(--series-1)]/40 bg-[var(--surface-1)] p-4">
      <div className="mb-3 text-sm font-medium text-[var(--text-primary)]">{title}</div>
      <div className="space-y-2">
        {items.map((r) => (
          <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[var(--gridline)]/20 px-3 py-2 text-sm">
            <div>
              <span className="font-medium text-[var(--text-primary)]">{r.employeeName}</span>
              <span className="text-[var(--text-secondary)]">
                {" "}
                — requested {formatDate(r.requestedAt)}
                {r.note ? ` · ${r.note}` : ""}
              </span>
            </div>
            <button onClick={() => onOpen(r.id)} className="flex items-center gap-1 rounded-lg bg-[var(--series-1)] px-2.5 py-1 text-xs font-medium text-[var(--on-accent)]">
              <FileSignature size={13} /> {action}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function Table({ rows, showEmployee = false, onPrepare, onDelete }: { rows: MplRequest[]; showEmployee?: boolean; onPrepare?: (r: MplRequest) => void; onDelete?: (r: MplRequest) => void }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[620px] text-sm">
        <thead>
          <tr className="border-b border-[var(--border-hairline)] text-left text-xs text-[var(--text-muted)]">
            {showEmployee && <th className="px-3 py-2 font-medium">Employee</th>}
            <th className="px-3 py-2 font-medium">Requested</th>
            <th className="px-3 py-2 font-medium">Status</th>
            <th className="px-3 py-2 font-medium">Form</th>
            {onDelete && <th className="px-3 py-2" />}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-[var(--gridline)] align-top last:border-0">
              {showEmployee && <td className="px-3 py-2 text-[var(--text-primary)]">{r.employeeName}</td>}
              <td className="px-3 py-2 text-[var(--text-secondary)]">{formatDate(r.requestedAt)}</td>
              <td className="px-3 py-2">
                <MplStatus item={r} />
                {r.status === "declined" && r.declineReason && (
                  <div className="mt-1 max-w-xs text-xs text-[var(--text-muted)]">
                    {r.declinedName ? `${r.declinedName}: ` : ""}
                    {r.declineReason}
                  </div>
                )}
                {r.status === "signed" && r.signedAt && <div className="mt-1 text-xs text-[var(--text-muted)]">Signed {formatDate(r.signedAt)}{r.signatoryName ? ` · ${r.signatoryName}` : ""}</div>}
              </td>
              <td className="px-3 py-2">
                {r.status === "hr" && onPrepare ? (
                  <button onClick={() => onPrepare(r)} className="flex items-center gap-1 rounded-lg bg-[var(--series-1)] px-2 py-1 text-xs font-medium text-[var(--on-accent)]">
                    <FileSignature size={12} /> Prepare
                  </button>
                ) : (
                  <ViewMplButton item={r} />
                )}
              </td>
              {onDelete && (
                <td className="px-3 py-2 text-right">
                  <button onClick={() => onDelete(r)} className="rounded-md p-1 text-[var(--text-muted)] hover:text-[var(--status-critical)]" aria-label="Delete Pag-IBIG loan form" title="Delete">
                    <Trash2 size={15} />
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
