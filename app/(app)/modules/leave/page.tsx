"use client";

import { useMemo, useState } from "react";
import { CalendarPlus, CalendarRange, Check, X } from "lucide-react";
import { useHris } from "@/lib/store";
import { PageHeader } from "@/components/PageHeader";
import { StatTile } from "@/components/StatTile";
import { Badge, type BadgeTone } from "@/components/Badge";
import { Modal } from "@/components/Modal";
import { EmptyState } from "@/components/EmptyState";
import { businessDaysBetween, formatDate, fullName } from "@/lib/helpers";
import { TODAY } from "@/lib/mock-data";
import type { RequestStatus } from "@/lib/types";

const STATUS_TONE: Record<RequestStatus, BadgeTone> = {
  pending: "warning",
  approved: "good",
  rejected: "critical",
  cancelled: "muted",
};

export default function LeaveManagementPage() {
  const { employees, leaveTypes, leaveRequests, currentUser, currentEmployee, fileLeaveRequest, decideLeaveRequest } = useHris();
  const [showFile, setShowFile] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | RequestStatus>("all");
  const [search, setSearch] = useState("");

  const isHrOrUpper = currentUser?.roles.some((r) => ["hr_admin", "upper_management"].includes(r));
  const year = TODAY.slice(0, 4);

  function canDecide(employeeId: string): boolean {
    if (!currentEmployee) return false;
    if (isHrOrUpper) return true;
    const target = employees.find((e) => e.id === employeeId);
    return !!target && target.supervisorId === currentEmployee.id;
  }

  const balances = useMemo(() => {
    if (!currentEmployee) return [];
    return leaveTypes.map((lt) => {
      const used = leaveRequests
        .filter((r) => r.employeeId === currentEmployee.id && r.leaveTypeId === lt.id && r.status === "approved" && r.startDate.startsWith(year))
        .reduce((s, r) => s + r.days, 0);
      return { leaveType: lt, used, remaining: Math.max(lt.defaultCredits - used, 0) };
    });
  }, [leaveTypes, leaveRequests, currentEmployee, year]);

  const myRequests = useMemo(
    () => leaveRequests.filter((r) => r.employeeId === currentEmployee?.id).sort((a, b) => (a.filedAt < b.filedAt ? 1 : -1)),
    [leaveRequests, currentEmployee],
  );

  const pendingForMe = leaveRequests.filter((r) => r.status === "pending" && r.employeeId !== currentEmployee?.id && canDecide(r.employeeId));

  const allRequests = useMemo(() => {
    return leaveRequests
      .filter((r) => (statusFilter === "all" ? true : r.status === statusFilter))
      .filter((r) => {
        const emp = employees.find((e) => e.id === r.employeeId);
        return emp ? fullName(emp).toLowerCase().includes(search.toLowerCase()) : true;
      })
      .sort((a, b) => (a.filedAt < b.filedAt ? 1 : -1));
  }, [leaveRequests, statusFilter, search, employees]);

  const [form, setForm] = useState({ leaveTypeId: leaveTypes[0]?.id ?? "", startDate: TODAY, endDate: TODAY, reason: "" });
  const computedDays = form.startDate && form.endDate ? businessDaysBetween(form.startDate, form.endDate) : 0;

  function submitFile() {
    if (!currentEmployee || !form.leaveTypeId || !form.reason || computedDays <= 0) return;
    fileLeaveRequest({
      employeeId: currentEmployee.id,
      leaveTypeId: form.leaveTypeId,
      startDate: form.startDate,
      endDate: form.endDate,
      days: computedDays,
      reason: form.reason,
    });
    setShowFile(false);
    setForm({ leaveTypeId: leaveTypes[0]?.id ?? "", startDate: TODAY, endDate: TODAY, reason: "" });
  }

  function leaveTypeName(id: string) {
    return leaveTypes.find((lt) => lt.id === id)?.name ?? id;
  }

  return (
    <div>
      <PageHeader
        title="Leave Management"
        subtitle="File leave requests and track approvals — balances are computed from each leave type's default annual credits."
        actions={
          <button onClick={() => setShowFile(true)} className="flex items-center gap-1.5 rounded-lg bg-[var(--series-1)] px-3 py-2 text-sm font-medium text-[var(--on-accent)]">
            <CalendarPlus size={16} /> File leave
          </button>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
        {balances.map((b) => (
          <StatTile key={b.leaveType.id} label={b.leaveType.name} value={`${b.remaining}`} hint={`of ${b.leaveType.defaultCredits}`} compact />
        ))}
      </div>

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
                    <span className="text-[var(--text-secondary)]"> — {leaveTypeName(r.leaveTypeId)}, {formatDate(r.startDate)}–{formatDate(r.endDate)} ({r.days}d)</span>
                    <div className="text-xs text-[var(--text-muted)]">{r.reason}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => decideLeaveRequest(r.id, "approved")} className="flex items-center gap-1 rounded-lg bg-[var(--status-good)] px-2.5 py-1 text-xs font-medium text-[var(--on-accent)]"><Check size={13} /> Approve</button>
                    <button onClick={() => setRejectTarget(r.id)} className="flex items-center gap-1 rounded-lg border border-[var(--border-hairline)] px-2.5 py-1 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40"><X size={13} /> Reject</button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="mb-4 rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-1)] p-4">
        <div className="mb-3 text-sm font-medium text-[var(--text-primary)]">My leave requests</div>
        {myRequests.length === 0 ? (
          <EmptyState icon={CalendarRange} title="No leave requests yet" description="Requests you file will appear here with their approval status." />
        ) : (
          <RequestsTable
            rows={myRequests.map((r) => ({
              id: r.id,
              primary: leaveTypeName(r.leaveTypeId),
              secondary: `${formatDate(r.startDate)} – ${formatDate(r.endDate)} (${r.days}d)`,
              reason: r.reason,
              status: r.status,
              decisionNote: r.decisionNote,
            }))}
          />
        )}
      </div>

      {isHrOrUpper && (
        <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-1)] p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm font-medium text-[var(--text-primary)]">All leave requests</div>
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
            <EmptyState icon={CalendarRange} title="No matching requests" description="Adjust your filters or search." />
          ) : (
            <RequestsTable
              showEmployee
              rows={allRequests.map((r) => {
                const emp = employees.find((e) => e.id === r.employeeId);
                return {
                  id: r.id,
                  employee: emp ? fullName(emp) : r.employeeId,
                  primary: leaveTypeName(r.leaveTypeId),
                  secondary: `${formatDate(r.startDate)} – ${formatDate(r.endDate)} (${r.days}d)`,
                  reason: r.reason,
                  status: r.status,
                  decisionNote: r.decisionNote,
                };
              })}
            />
          )}
        </div>
      )}

      <Modal open={showFile} onClose={() => setShowFile(false)} title="File a leave request">
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Leave type</label>
            <select value={form.leaveTypeId} onChange={(e) => setForm((f) => ({ ...f, leaveTypeId: e.target.value }))} className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-2 text-sm">
              {leaveTypes.map((lt) => (
                <option key={lt.id} value={lt.id}>{lt.name}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Start date</label>
              <input type="date" value={form.startDate} onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))} className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">End date</label>
              <input type="date" value={form.endDate} onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))} className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-2 text-sm" />
            </div>
          </div>
          <div className="text-xs text-[var(--text-muted)]">Computed duration: {computedDays} business day(s)</div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Reason</label>
            <textarea value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} rows={3} className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-2 text-sm" placeholder="Briefly describe the reason for this leave…" />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={() => setShowFile(false)} className="rounded-lg px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40">Cancel</button>
            <button onClick={submitFile} disabled={!form.reason || computedDays <= 0} className="rounded-lg bg-[var(--series-1)] px-3 py-1.5 text-sm font-medium text-[var(--on-accent)] disabled:opacity-40">Submit request</button>
          </div>
        </div>
      </Modal>

      <Modal open={!!rejectTarget} onClose={() => setRejectTarget(null)} title="Reject leave request">
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Reason (optional)</label>
            <textarea value={rejectNote} onChange={(e) => setRejectNote(e.target.value)} rows={3} className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-2 text-sm" placeholder="Let the employee know why this was rejected…" />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={() => setRejectTarget(null)} className="rounded-lg px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40">Cancel</button>
            <button
              onClick={() => {
                if (rejectTarget) decideLeaveRequest(rejectTarget, "rejected", rejectNote || undefined);
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
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-[var(--border-hairline)] text-left text-xs text-[var(--text-muted)]">
            {showEmployee && <th className="px-3 py-2 font-medium">Employee</th>}
            <th className="px-3 py-2 font-medium">Type</th>
            <th className="px-3 py-2 font-medium">Period</th>
            <th className="px-3 py-2 font-medium">Reason</th>
            <th className="px-3 py-2 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-[var(--gridline)] last:border-0">
              {showEmployee && <td className="px-3 py-2 text-[var(--text-primary)]">{r.employee}</td>}
              <td className="px-3 py-2 text-[var(--text-primary)]">{r.primary}</td>
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
