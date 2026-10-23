"use client";

import { useMemo, useState } from "react";
import { FileBadge, FileCheck2, Loader2, Trash2 } from "lucide-react";
import { useHris } from "@/lib/store";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { Modal } from "@/components/Modal";
import { formatDate, fullName } from "@/lib/helpers";
import { CoeStatus, IssueCoeModal, RequestCoeModal, ViewCoeButton, useCoeRequests } from "@/components/coe/Coe";
import { deleteCoe, requestCoe, type CoeRequest } from "@/lib/coe";

// Certificate of Employment: employees ask for one; HR reviews the wording,
// signs and issues it (or declines) — or issues one directly for anyone,
// former employees included.
export default function CoePage() {
  const { currentUser, currentEmployee, employees, isRealAccount } = useHris();
  const { items, error, reload } = useCoeRequests();
  const isHr = !!currentUser?.roles.includes("hr_admin");
  const me = currentEmployee?.id;
  const [requesting, setRequesting] = useState(false);
  const [issuingId, setIssuingId] = useState<string | null>(null);
  const issuing = items.find((r) => r.id === issuingId) ?? null;
  const [search, setSearch] = useState("");
  const [deleting, setDeleting] = useState<CoeRequest | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [direct, setDirect] = useState(false);
  const [directEmployee, setDirectEmployee] = useState("");

  const mine = items.filter((r) => r.employeeId === me);
  const pending = isHr ? items.filter((r) => r.status === "pending") : [];
  const all = items.filter((r) => !search || r.employeeName.toLowerCase().includes(search.toLowerCase()));
  const people = useMemo(() => [...employees].sort((a, b) => fullName(a).localeCompare(fullName(b))), [employees]);

  async function startDirect() {
    if (!directEmployee) return;
    setBusy(true);
    setActionError(null);
    try {
      const id = await requestCoe(directEmployee, "", false);
      await reload();
      setDirect(false);
      setDirectEmployee("");
      setIssuingId(id);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Couldn't start the certificate.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    setBusy(true);
    setActionError(null);
    try {
      await deleteCoe(deleting);
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
        <PageHeader title="Certificate of Employment" subtitle="Request and download your COE." />
        <EmptyState icon={FileBadge} title="Not available in the demo" description="Sign in with your employee account to request a Certificate of Employment." />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Certificate of Employment"
        subtitle="Request a COE for a loan, visa, new job or any other purpose. HR signs it, and you download it here."
        actions={
          <div className="flex flex-wrap gap-2">
            {isHr && (
              <button onClick={() => (setActionError(null), setDirect(true))} className="flex items-center gap-1.5 rounded-lg border border-[var(--border-hairline)] px-3 py-2 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40">
                <FileCheck2 size={16} /> Issue for an employee
              </button>
            )}
            {currentEmployee && (
              <button onClick={() => setRequesting(true)} className="flex items-center gap-1.5 rounded-lg bg-[var(--series-1)] px-3 py-2 text-sm font-medium text-[var(--on-accent)]">
                <FileBadge size={16} /> Request a COE
              </button>
            )}
          </div>
        }
      />
      {error && <div className="mb-4 rounded-lg border border-[var(--status-critical)]/40 px-3 py-2 text-sm text-[var(--status-critical)]">{error}</div>}

      {pending.length > 0 && (
        <div className="mb-4 rounded-xl border border-[var(--series-1)]/40 bg-[var(--surface-1)] p-4">
          <div className="mb-3 text-sm font-medium text-[var(--text-primary)]">COE requests to sign ({pending.length})</div>
          <div className="space-y-2">
            {pending.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[var(--gridline)]/20 px-3 py-2 text-sm">
                <div>
                  <span className="font-medium text-[var(--text-primary)]">{r.employeeName}</span>
                  <span className="text-[var(--text-secondary)]">
                    {" "}
                    — {r.purpose || "no purpose given"} · {r.withCompensation ? "with compensation" : "without compensation"} · {formatDate(r.requestedAt)}
                  </span>
                </div>
                <button onClick={() => setIssuingId(r.id)} className="flex items-center gap-1 rounded-lg bg-[var(--series-1)] px-2.5 py-1 text-xs font-medium text-[var(--on-accent)]">
                  <FileCheck2 size={13} /> Review &amp; sign
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <Section title="My COE requests">
        {mine.length === 0 ? <EmptyState icon={FileBadge} title="No requests yet" description="Use “Request a COE”. Once HR issues it, you can view and download it here." /> : <Table rows={mine} />}
      </Section>

      {isHr && (
        <Section
          title="All COE requests"
          right={<input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search employee…" className="w-56 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-1.5 text-xs" />}
        >
          {all.length === 0 ? (
            <EmptyState icon={FileBadge} title="No requests" description="COE requests and issued certificates appear here." />
          ) : (
            <Table rows={all} showEmployee onSign={(r) => setIssuingId(r.id)} onDelete={(r) => (setActionError(null), setDeleting(r))} />
          )}
        </Section>
      )}

      {requesting && <RequestCoeModal onClose={() => setRequesting(false)} onDone={reload} />}
      {issuing && <IssueCoeModal key={issuing.id} item={issuing} onClose={() => setIssuingId(null)} onChanged={reload} />}

      <Modal open={direct} onClose={() => !busy && setDirect(false)} title="Issue a COE for an employee">
        <div className="space-y-3 text-sm">
          <p className="text-[var(--text-secondary)]">Choose the employee — current or former. You&rsquo;ll check the wording, then sign and issue it.</p>
          <select value={directEmployee} onChange={(e) => setDirectEmployee(e.target.value)} className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-2 text-sm">
            <option value="">Choose an employee…</option>
            {people.map((e) => (
              <option key={e.id} value={e.id}>
                {fullName(e)}
                {e.status === "resigned" || e.status === "terminated" ? ` (${e.status})` : ""}
              </option>
            ))}
          </select>
          {actionError && <div className="text-xs text-[var(--status-critical)]">{actionError}</div>}
          <div className="flex justify-end gap-2">
            <button onClick={() => setDirect(false)} disabled={busy} className="rounded-lg px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40">
              Cancel
            </button>
            <button onClick={startDirect} disabled={busy || !directEmployee} className="flex items-center gap-1.5 rounded-lg bg-[var(--series-1)] px-3 py-1.5 text-sm font-medium text-[var(--on-accent)] disabled:opacity-40">
              {busy ? <Loader2 size={14} className="animate-spin" /> : <FileCheck2 size={14} />} Continue
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={!!deleting} onClose={() => !busy && setDeleting(null)} title="Delete COE request">
        {deleting && (
          <div className="space-y-3 text-sm text-[var(--text-secondary)]">
            <p>
              Delete <span className="font-medium text-[var(--text-primary)]">{deleting.employeeName}</span>&rsquo;s COE {deleting.status === "issued" ? "(issued)" : "request"} from {formatDate(deleting.requestedAt)}? This can&rsquo;t be undone.
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

function Table({ rows, showEmployee = false, onSign, onDelete }: { rows: CoeRequest[]; showEmployee?: boolean; onSign?: (r: CoeRequest) => void; onDelete?: (r: CoeRequest) => void }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-[var(--border-hairline)] text-left text-xs text-[var(--text-muted)]">
            {showEmployee && <th className="px-3 py-2 font-medium">Employee</th>}
            <th className="px-3 py-2 font-medium">Requested</th>
            <th className="px-3 py-2 font-medium">Purpose</th>
            <th className="px-3 py-2 font-medium">Compensation</th>
            <th className="px-3 py-2 font-medium">Status</th>
            <th className="px-3 py-2 font-medium">Certificate</th>
            {onDelete && <th className="px-3 py-2" />}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-[var(--gridline)] align-top last:border-0">
              {showEmployee && <td className="px-3 py-2 text-[var(--text-primary)]">{r.employeeName}</td>}
              <td className="px-3 py-2 text-[var(--text-secondary)]">{formatDate(r.requestedAt)}</td>
              <td className="px-3 py-2 text-[var(--text-secondary)]">{r.purpose || "—"}</td>
              <td className="px-3 py-2 text-[var(--text-secondary)]">{r.withCompensation ? "Included" : "Not included"}</td>
              <td className="px-3 py-2">
                <CoeStatus item={r} />
                {r.status === "declined" && r.declineReason && <div className="mt-1 max-w-xs text-xs text-[var(--text-muted)]">{r.declineReason}</div>}
                {r.status === "issued" && r.decidedAt && <div className="mt-1 text-xs text-[var(--text-muted)]">{formatDate(r.decidedAt)}{r.decidedName ? ` · ${r.decidedName}` : ""}</div>}
              </td>
              <td className="px-3 py-2">
                {r.status === "issued" ? (
                  <ViewCoeButton item={r} />
                ) : r.status === "pending" && onSign ? (
                  <button onClick={() => onSign(r)} className="flex items-center gap-1 rounded-lg bg-[var(--series-1)] px-2 py-1 text-xs font-medium text-[var(--on-accent)]">
                    <FileCheck2 size={12} /> Review &amp; sign
                  </button>
                ) : (
                  <span className="text-xs text-[var(--text-muted)]">—</span>
                )}
              </td>
              {onDelete && (
                <td className="px-3 py-2 text-right">
                  <button onClick={() => onDelete(r)} className="rounded-md p-1 text-[var(--text-muted)] hover:text-[var(--status-critical)]" aria-label="Delete COE request" title="Delete">
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
