"use client";

import { useState } from "react";
import { Car, FileText, Trash2 } from "lucide-react";
import { useHris } from "@/lib/store";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { Modal } from "@/components/Modal";
import { formatDate } from "@/lib/helpers";
import { TravelFormModal, TravelProgress, TravelRequestModal, useTravelAllowances } from "@/components/travel/TravelAllowance";
import { canApproveTravel, deleteTravelAllowance, travelStage, type TravelAllowance } from "@/lib/travel-allowance";

// Travel Allowance Request: filed and signed by the employee, approved by
// their supervisor, received by HR.
export default function TravelAllowancePage() {
  const { currentUser, currentEmployee, isRealAccount } = useHris();
  const { items, error, reload } = useTravelAllowances();
  const me = currentEmployee?.id;
  const isHr = !!currentUser?.roles.includes("hr_admin");
  const seesAll = !!currentUser?.roles.some((r) => ["hr_admin", "upper_management", "payroll_officer", "cfo", "treasurer", "sr_accounting_assistant", "sys_admin"].includes(r));
  const [filing, setFiling] = useState(false);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const viewing = items.find((t) => t.id === viewingId) ?? null;
  const [deleting, setDeleting] = useState<TravelAllowance | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const toApprove = items.filter((t) => canApproveTravel(t, me, isHr));
  const toReceive = isHr ? items.filter((t) => travelStage(t) === "waiting_hr" && t.employeeId !== me) : [];
  const mine = items.filter((t) => t.employeeId === me);
  const team = items.filter((t) => t.approverId === me && t.employeeId !== me);
  const all = items.filter((t) => !search || `${t.employeeName} ${t.driverName} ${t.destination}`.toLowerCase().includes(search.toLowerCase()));

  async function confirmDelete() {
    if (!deleting) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await deleteTravelAllowance(deleting);
      setDeleting(null);
      reload();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Couldn't delete.");
    } finally {
      setDeleteBusy(false);
    }
  }

  if (!isRealAccount) {
    return (
      <div>
        <PageHeader title="Travel Allowance" subtitle="Travel allowance requests." />
        <EmptyState icon={Car} title="Not available in the demo" description="Sign in with your employee account to file travel allowance requests." />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Travel Allowance"
        subtitle="Request a travel allowance: driver, date, destination and allowance (₱500). Your supervisor approves, then HR receives it."
        actions={
          <button onClick={() => setFiling(true)} className="flex items-center gap-1.5 rounded-lg bg-[var(--series-1)] px-3 py-2 text-sm font-medium text-[var(--on-accent)]">
            <Car size={16} /> File request
          </button>
        }
      />
      {error && <div className="mb-4 rounded-lg border border-[var(--status-critical)]/40 px-3 py-2 text-sm text-[var(--status-critical)]">{error}</div>}

      <Queue title={`Travel allowance requests for your approval (${toApprove.length})`} items={toApprove} action="Review & sign" onOpen={setViewingId} />
      <Queue title={`Travel allowance requests to receive (${toReceive.length})`} items={toReceive} action="Review & receive" onOpen={setViewingId} />

      <Section title="My travel allowance requests">
        {mine.length === 0 ? <EmptyState icon={Car} title="No requests yet" description="Requests you file appear here with their status." /> : <Table rows={mine} onOpen={setViewingId} />}
      </Section>

      {!seesAll && team.length > 0 && (
        <Section title="My team's travel allowance requests">
          <Table rows={team} showEmployee onOpen={setViewingId} />
        </Section>
      )}

      {seesAll && (
        <Section
          title="All travel allowance requests"
          right={<input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search employee, driver, destination…" className="w-64 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-1.5 text-xs" />}
        >
          {all.length === 0 ? (
            <EmptyState icon={Car} title="No requests" description="Travel allowance requests will appear here." />
          ) : (
            <Table rows={all} showEmployee onOpen={setViewingId} onDelete={isHr ? (t) => (setDeleteError(null), setDeleting(t)) : undefined} />
          )}
        </Section>
      )}

      {filing && <TravelRequestModal onClose={() => setFiling(false)} onDone={reload} />}
      {viewing && <TravelFormModal key={viewing.id} item={viewing} onClose={() => setViewingId(null)} onChanged={reload} />}
      <Modal open={!!deleting} onClose={() => !deleteBusy && setDeleting(null)} title="Delete travel allowance request">
        {deleting && (
          <div className="space-y-3 text-sm text-[var(--text-secondary)]">
            <p>
              Delete <span className="font-medium text-[var(--text-primary)]">{deleting.employeeName}</span>&rsquo;s travel allowance request ({formatDate(deleting.travelDate)}, {deleting.destination})? This can&rsquo;t be undone.
            </p>
            {deleteError && <div className="text-xs text-[var(--status-critical)]">{deleteError}</div>}
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeleting(null)} disabled={deleteBusy} className="rounded-lg px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40">
                Cancel
              </button>
              <button onClick={confirmDelete} disabled={deleteBusy} className="rounded-lg bg-[var(--status-critical)] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">
                {deleteBusy ? "Deleting…" : "Delete request"}
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

function Queue({ title, items, action, onOpen }: { title: string; items: TravelAllowance[]; action: string; onOpen: (id: string) => void }) {
  if (!items.length) return null;
  return (
    <div className="mb-4 rounded-xl border border-[var(--series-1)]/40 bg-[var(--surface-1)] p-4">
      <div className="mb-3 text-sm font-medium text-[var(--text-primary)]">{title}</div>
      <div className="space-y-2">
        {items.map((t) => (
          <div key={t.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[var(--gridline)]/20 px-3 py-2 text-sm">
            <div>
              <span className="font-medium text-[var(--text-primary)]">{t.employeeName}</span>
              <span className="text-[var(--text-secondary)]">
                {" "}
                — {formatDate(t.travelDate)}, {t.destination} · driver {t.driverName} · {t.withAllowance ? "with ₱500 allowance" : "no allowance"}
              </span>
            </div>
            <button onClick={() => onOpen(t.id)} className="flex items-center gap-1 rounded-lg bg-[var(--series-1)] px-2.5 py-1 text-xs font-medium text-[var(--on-accent)]">
              <FileText size={13} /> {action}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function Table({ rows, showEmployee = false, onOpen, onDelete }: { rows: TravelAllowance[]; showEmployee?: boolean; onOpen: (id: string) => void; onDelete?: (t: TravelAllowance) => void }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-[var(--border-hairline)] text-left text-xs text-[var(--text-muted)]">
            {showEmployee && <th className="px-3 py-2 font-medium">Employee</th>}
            <th className="px-3 py-2 font-medium">Date</th>
            <th className="px-3 py-2 font-medium">Destination</th>
            <th className="px-3 py-2 font-medium">Driver</th>
            <th className="px-3 py-2 font-medium">Allowance</th>
            <th className="px-3 py-2 font-medium">Status</th>
            <th className="px-3 py-2 font-medium">Form</th>
            {onDelete && <th className="px-3 py-2" />}
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => (
            <tr key={t.id} className="border-b border-[var(--gridline)] last:border-0">
              {showEmployee && <td className="px-3 py-2 text-[var(--text-primary)]">{t.employeeName}</td>}
              <td className="px-3 py-2 text-[var(--text-secondary)]">{formatDate(t.travelDate)}</td>
              <td className="max-w-xs px-3 py-2 text-[var(--text-secondary)]">
                <div className="line-clamp-2">{t.destination}</div>
              </td>
              <td className="px-3 py-2 text-[var(--text-secondary)]">{t.driverName}</td>
              <td className="tabular px-3 py-2 text-[var(--text-secondary)]">{t.withAllowance ? "₱500.00" : "None"}</td>
              <td className="px-3 py-2">
                <TravelProgress item={t} />
              </td>
              <td className="px-3 py-2">
                <button onClick={() => onOpen(t.id)} className="flex items-center gap-1 rounded-lg border border-[var(--border-hairline)] px-2 py-1 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40">
                  <FileText size={12} /> View
                </button>
              </td>
              {onDelete && (
                <td className="px-3 py-2 text-right">
                  <button onClick={() => onDelete(t)} className="rounded-md p-1 text-[var(--text-muted)] hover:text-[var(--status-critical)]" aria-label="Delete travel allowance request" title="Delete">
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
