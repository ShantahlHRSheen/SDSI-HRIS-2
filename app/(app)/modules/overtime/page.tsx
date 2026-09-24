"use client";

import { useState } from "react";
import { Check, Clock, X } from "lucide-react";
import { useHris } from "@/lib/store";
import { PageHeader } from "@/components/PageHeader";
import { Badge, type BadgeTone } from "@/components/Badge";
import { Modal } from "@/components/Modal";
import { EmptyState } from "@/components/EmptyState";
import { formatDate, fullName } from "@/lib/helpers";
import { TODAY } from "@/lib/mock-data";
import type { RequestStatus } from "@/lib/types";

const STATUS_TONE: Record<RequestStatus, BadgeTone> = {
  pending: "warning",
  approved: "good",
  rejected: "critical",
  cancelled: "muted",
};

export default function OvertimePage() {
  const { employees, overtimeRequests, currentUser, currentEmployee, fileOvertimeRequest, decideOvertimeRequest } = useHris();
  const [showFile, setShowFile] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | RequestStatus>("all");
  const [search, setSearch] = useState("");

  const isHrOrUpper = currentUser?.roles.some((r) => ["hr_admin", "upper_management"].includes(r));

  function canDecide(employeeId: string): boolean {
    if (!currentEmployee) return false;
    if (isHrOrUpper) return true;
    const target = employees.find((e) => e.id === employeeId);
    return !!target && target.supervisorId === currentEmployee.id;
  }

  const myRequests = overtimeRequests.filter((r) => r.employeeId === currentEmployee?.id).sort((a, b) => (a.filedAt < b.filedAt ? 1 : -1));
  const pendingForMe = overtimeRequests.filter((r) => r.status === "pending" && r.employeeId !== currentEmployee?.id && canDecide(r.employeeId));

  const allRequests = overtimeRequests
    .filter((r) => (statusFilter === "all" ? true : r.status === statusFilter))
    .filter((r) => {
      const emp = employees.find((e) => e.id === r.employeeId);
      return emp ? fullName(emp).toLowerCase().includes(search.toLowerCase()) : true;
    })
    .sort((a, b) => (a.filedAt < b.filedAt ? 1 : -1));

  const [form, setForm] = useState({ date: TODAY, hours: 2, reason: "" });

  function submitFile() {
    if (!currentEmployee || !form.reason || form.hours <= 0) return;
    fileOvertimeRequest({ employeeId: currentEmployee.id, date: form.date, hours: form.hours, reason: form.reason });
    setShowFile(false);
    setForm({ date: TODAY, hours: 2, reason: "" });
  }

  return (
    <div>
      <PageHeader
        title="Overtime"
        subtitle="File overtime requests and track supervisor approval."
        actions={
          <button onClick={() => setShowFile(true)} className="flex items-center gap-1.5 rounded-lg bg-[var(--series-1)] px-3 py-2 text-sm font-medium text-[var(--on-accent)]">
            <Clock size={16} /> File overtime
          </button>
        }
      />

      {pendingForMe.length > 0 && (
        <div className="mb-4 rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-1)] p-4">
          <div className="mb-3 text-sm font-medium text-[var(--text-primary)]">Pending your approval ({pendingForMe.length})</div>
          <div className="space-y-2">
            {pendingForMe.map((r) => {
              const emp = employees.find((e) => e.id === r.employeeId);
              return (
                <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[var(--gridline)]/20 px-3 py-2 text-sm">
                  <div>
                    <span className="font-medium text-[var(--text-primary)]">{emp ? fullName(emp) : r.employeeId}</span>
                    <span className="text-[var(--text-secondary)]"> — {r.hours}h on {formatDate(r.date)}</span>
                    <div className="text-xs text-[var(--text-muted)]">{r.reason}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => decideOvertimeRequest(r.id, "approved")} className="flex items-center gap-1 rounded-lg bg-[var(--status-good)] px-2.5 py-1 text-xs font-medium text-[var(--on-accent)]"><Check size={13} /> Approve</button>
                    <button onClick={() => setRejectTarget(r.id)} className="flex items-center gap-1 rounded-lg border border-[var(--border-hairline)] px-2.5 py-1 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40"><X size={13} /> Reject</button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="mb-4 rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-1)] p-4">
        <div className="mb-3 text-sm font-medium text-[var(--text-primary)]">My overtime requests</div>
        {myRequests.length === 0 ? (
          <EmptyState icon={Clock} title="No overtime requests yet" description="Requests you file will appear here with their approval status." />
        ) : (
          <RequestsTable
            rows={myRequests.map((r) => ({ id: r.id, primary: `${r.hours}h`, secondary: formatDate(r.date), reason: r.reason, status: r.status, decisionNote: r.decisionNote }))}
          />
        )}
      </div>

      {isHrOrUpper && (
        <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-1)] p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm font-medium text-[var(--text-primary)]">All overtime requests</div>
            <div className="flex flex-wrap items-center gap-2">
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)} className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-2.5 py-1.5 text-xs">
                <option value="all">All statuses</option>
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
              </select>
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search employee…" className="w-48 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-1.5 text-xs" />
            </div>
          </div>
          {allRequests.length === 0 ? (
            <EmptyState icon={Clock} title="No matching requests" description="Adjust your filters or search." />
          ) : (
            <RequestsTable
              showEmployee
              rows={allRequests.map((r) => {
                const emp = employees.find((e) => e.id === r.employeeId);
                return { id: r.id, employee: emp ? fullName(emp) : r.employeeId, primary: `${r.hours}h`, secondary: formatDate(r.date), reason: r.reason, status: r.status, decisionNote: r.decisionNote };
              })}
            />
          )}
        </div>
      )}

      <Modal open={showFile} onClose={() => setShowFile(false)} title="File an overtime request">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Date</label>
              <input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Hours</label>
              <input type="number" min={0.5} max={12} step={0.5} value={form.hours} onChange={(e) => setForm((f) => ({ ...f, hours: Number(e.target.value) }))} className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-2 text-sm" />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Reason</label>
            <textarea value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} rows={3} className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-2 text-sm" placeholder="Briefly describe why overtime is needed…" />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={() => setShowFile(false)} className="rounded-lg px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40">Cancel</button>
            <button onClick={submitFile} disabled={!form.reason || form.hours <= 0} className="rounded-lg bg-[var(--series-1)] px-3 py-1.5 text-sm font-medium text-[var(--on-accent)] disabled:opacity-40">Submit request</button>
          </div>
        </div>
      </Modal>

      <Modal open={!!rejectTarget} onClose={() => setRejectTarget(null)} title="Reject overtime request">
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Reason (optional)</label>
            <textarea value={rejectNote} onChange={(e) => setRejectNote(e.target.value)} rows={3} className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-2 text-sm" placeholder="Let the employee know why this was rejected…" />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={() => setRejectTarget(null)} className="rounded-lg px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40">Cancel</button>
            <button
              onClick={() => {
                if (rejectTarget) decideOvertimeRequest(rejectTarget, "rejected", rejectNote || undefined);
                setRejectTarget(null);
                setRejectNote("");
              }}
              className="rounded-lg bg-[var(--status-critical)] px-3 py-1.5 text-sm font-medium text-white"
            >
              Reject request
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function RequestsTable({
  rows,
  showEmployee = false,
}: {
  rows: { id: string; employee?: string; primary: string; secondary: string; reason: string; status: RequestStatus; decisionNote: string | null }[];
  showEmployee?: boolean;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-sm">
        <thead>
          <tr className="border-b border-[var(--border-hairline)] text-left text-xs text-[var(--text-muted)]">
            {showEmployee && <th className="px-3 py-2 font-medium">Employee</th>}
            <th className="px-3 py-2 font-medium">Hours</th>
            <th className="px-3 py-2 font-medium">Date</th>
            <th className="px-3 py-2 font-medium">Reason</th>
            <th className="px-3 py-2 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-[var(--gridline)] last:border-0">
              {showEmployee && <td className="px-3 py-2 text-[var(--text-primary)]">{r.employee}</td>}
              <td className="tabular px-3 py-2 text-[var(--text-primary)]">{r.primary}</td>
              <td className="px-3 py-2 text-[var(--text-secondary)]">{r.secondary}</td>
              <td className="max-w-xs px-3 py-2 text-[var(--text-secondary)]">
                <div className="line-clamp-2">{r.reason}</div>
                {r.decisionNote && <div className="mt-1 text-xs text-[var(--text-muted)]">Note: {r.decisionNote}</div>}
              </td>
              <td className="px-3 py-2"><Badge tone={STATUS_TONE[r.status]}>{r.status}</Badge></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
