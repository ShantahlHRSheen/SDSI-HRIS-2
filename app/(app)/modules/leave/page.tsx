"use client";

import { useMemo, useState } from "react";
import { CalendarPlus, CalendarRange, Check, FileText, Trash2, X } from "lucide-react";
import { useHris } from "@/lib/store";
import { PageHeader } from "@/components/PageHeader";
import { StatTile } from "@/components/StatTile";
import { Badge, type BadgeTone } from "@/components/Badge";
import { Modal } from "@/components/Modal";
import { EmptyState } from "@/components/EmptyState";
import { businessDaysBetween, formatDate, fullName } from "@/lib/helpers";
import { balanceFor, checkLeaveRequest, isSemiannual, todayInManila } from "@/lib/leave-policy";
import { ATTACHMENT_ACCEPT, ATTACHMENT_RETENTION_DAYS, KIND_LABEL, LeaveDocuments, prepareUpload, requiredKinds, validateUpload, withFileType } from "@/components/leave/LeaveAttachments";
import { LeaveApplicationModal, LeaveFormModal, FormProgress, canHeadForm, useLeaveForms } from "@/components/leave/LeaveApplication";
import { LEAVE_CATEGORIES, formStage, type LeaveForm } from "@/lib/leave-form";
import type { LeaveAttachmentKind, LeaveRequest, RequestStatus } from "@/lib/types";

const STATUS_TONE: Record<RequestStatus, BadgeTone> = {
  pending: "warning",
  approved: "good",
  rejected: "critical",
  cancelled: "muted",
};

export default function LeaveManagementPage() {
  const { employees, leaveTypes, leaveRequests, currentUser, currentEmployee, fileLeaveRequest, decideLeaveRequest, canAttachLeaveFiles, uploadLeaveAttachment, isRealAccount, deleteLeaveRequest } = useHris();
  // The online Application for Leave (real accounts): filed by the employee,
  // approved by their department head, received by HR.
  const { forms, error: formsError, reload: reloadForms } = useLeaveForms();
  const formByRequest = useMemo(() => new Map(forms.map((f) => [f.leaveRequestId, f])), [forms]);
  const [showApply, setShowApply] = useState(false);
  const [viewing, setViewing] = useState<string | null>(null);
  const viewingForm = viewing ? formByRequest.get(viewing) : undefined;
  const [showFile, setShowFile] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | RequestStatus>("all");
  const [search, setSearch] = useState("");

  const isHrOrUpper = currentUser?.roles.some((r) => ["hr_admin", "upper_management"].includes(r));
  const today = useMemo(() => todayInManila(), []);

  const isDeptHead = !!currentUser?.roles.includes("dept_head");
  const isHrManager = !!currentUser?.roles.includes("hr_admin");
  const formsToSign = forms.filter((f) => canHeadForm(f, currentEmployee?.id, isHrManager));
  const formsToReceive = isHrManager ? forms.filter((f) => formStage(f) === "waiting_hr" && f.employeeId !== currentEmployee?.id) : [];
  const requestById = useMemo(() => new Map(leaveRequests.map((r) => [r.id, r])), [leaveRequests]);

  // HR Manager: delete a leave request (with its form and files).
  const [deleting, setDeleting] = useState<LeaveRequest | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  async function confirmDelete() {
    if (!deleting) return;
    setDeleteBusy(true);
    setDeleteError(null);
    const err = await deleteLeaveRequest(deleting.id);
    setDeleteBusy(false);
    if (err) return setDeleteError(err);
    setDeleting(null);
    reloadForms();
  }

  // HR/upper management decide on everyone; a Dept Head decides on the
  // employees they supervise.
  function canDecide(employeeId: string): boolean {
    if (!currentEmployee) return false;
    if (isHrOrUpper) return true;
    const target = employees.find((e) => e.id === employeeId);
    return isDeptHead && !!target && target.supervisorId === currentEmployee.id;
  }

  // Remaining credits for the current period (half-year for VL/SL, year for
  // the rest), counting approved and pending requests.
  const balances = useMemo(() => {
    if (!currentEmployee) return [];
    return leaveTypes.map((lt) => ({ leaveType: lt, ...balanceFor(leaveRequests, currentEmployee.id, lt, today) }));
  }, [leaveTypes, leaveRequests, currentEmployee, today]);

  const myRequests = useMemo(
    () => leaveRequests.filter((r) => r.employeeId === currentEmployee?.id).sort((a, b) => (a.filedAt < b.filedAt ? 1 : -1)),
    [leaveRequests, currentEmployee],
  );

  // Requests filed without the online form (older ones) are still decided here directly.
  const pendingForMe = leaveRequests.filter((r) => r.status === "pending" && r.employeeId !== currentEmployee?.id && !formByRequest.has(r.id) && canDecide(r.employeeId));

  // Forms of the people the user supervises (whatever the user's role).
  const teamForms = forms.filter((f) => f.departmentHeadId === currentEmployee?.id && f.employeeId !== currentEmployee?.id);

  const teamRequests = useMemo(() => {
    if (isHrOrUpper || !isDeptHead || !currentEmployee) return [];
    const teamIds = new Set(employees.filter((e) => e.supervisorId === currentEmployee.id).map((e) => e.id));
    return leaveRequests.filter((r) => teamIds.has(r.employeeId)).sort((a, b) => (a.filedAt < b.filedAt ? 1 : -1));
  }, [isHrOrUpper, isDeptHead, currentEmployee, employees, leaveRequests]);

  const allRequests = useMemo(() => {
    return leaveRequests
      .filter((r) => (statusFilter === "all" ? true : r.status === statusFilter))
      .filter((r) => {
        const emp = employees.find((e) => e.id === r.employeeId);
        return emp ? fullName(emp).toLowerCase().includes(search.toLowerCase()) : true;
      })
      .sort((a, b) => (a.filedAt < b.filedAt ? 1 : -1));
  }, [leaveRequests, statusFilter, search, employees]);

  const [form, setForm] = useState({ leaveTypeId: leaveTypes[0]?.id ?? "", startDate: today, endDate: today, reason: "", halfDay: false });
  const [files, setFiles] = useState<Partial<Record<LeaveAttachmentKind, File>>>({});
  const [fileError, setFileError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const businessDays = form.startDate && form.endDate ? businessDaysBetween(form.startDate, form.endDate) : 0;
  // Half day only applies to a single-weekday request.
  const halfDayAllowed = businessDays === 1 && form.startDate === form.endDate;
  const computedDays = halfDayAllowed && form.halfDay ? 0.5 : businessDays;
  const selectedLeaveType = leaveTypes.find((lt) => lt.id === form.leaveTypeId);
  const creditError =
    currentEmployee && selectedLeaveType && computedDays > 0
      ? checkLeaveRequest(leaveRequests, { employeeId: currentEmployee.id, leaveType: selectedLeaveType, startDate: form.startDate, endDate: form.endDate, days: computedDays })
      : null;
  const formKinds = canAttachLeaveFiles ? requiredKinds(form.leaveTypeId) : [];
  const missingLeaveForm = formKinds.includes("leave_form") && !files.leave_form;

  function pickFile(kind: LeaveAttachmentKind, picked: File | undefined) {
    setFileError(null);
    if (!picked) return;
    const file = withFileType(picked);
    const invalid = validateUpload(file);
    if (invalid) {
      setFileError(invalid);
      return;
    }
    setFiles((f) => ({ ...f, [kind]: file }));
  }

  function closeFileModal() {
    setShowFile(false);
    setForm({ leaveTypeId: leaveTypes[0]?.id ?? "", startDate: today, endDate: today, reason: "", halfDay: false });
    setFiles({});
    setFileError(null);
  }

  async function submitFile() {
    if (!currentEmployee || !form.leaveTypeId || !form.reason || computedDays <= 0 || missingLeaveForm || creditError) return;
    setSubmitting(true);
    setFileError(null);
    const requestId = await fileLeaveRequest({
      employeeId: currentEmployee.id,
      leaveTypeId: form.leaveTypeId,
      startDate: form.startDate,
      endDate: form.endDate,
      days: computedDays,
      reason: form.reason,
    });
    if (!requestId) {
      setSubmitting(false);
      setFileError("Could not file the leave request — please try again.");
      return;
    }
    const failed: string[] = [];
    for (const kind of formKinds) {
      const file = files[kind];
      if (!file) continue;
      const err = await uploadLeaveAttachment({ leaveRequestId: requestId, employeeId: currentEmployee.id, kind, file: await prepareUpload(file) });
      if (err) failed.push(`${KIND_LABEL[kind]}: ${err}`);
    }
    setSubmitting(false);
    if (failed.length) {
      // The request itself is filed — the missing file can be uploaded from the table.
      setFileError(`Leave request filed, but the upload failed (${failed.join("; ")}). Use "Upload" on the request in My leave requests to try again.`);
      return;
    }
    closeFileModal();
  }

  function leaveTypeName(id: string) {
    return leaveTypes.find((lt) => lt.id === id)?.name ?? id;
  }

  return (
    <div>
      <PageHeader
        title="Leave Management"
        subtitle="File leave requests and track approvals. Vacation and Sick Leave credits are split into Jan–Jun and Jul–Dec; other leave types are per year. Pending requests count against your balance."
        actions={
          <button onClick={() => (isRealAccount ? setShowApply(true) : setShowFile(true))} className="flex items-center gap-1.5 rounded-lg bg-[var(--series-1)] px-3 py-2 text-sm font-medium text-[var(--on-accent)]">
            <CalendarPlus size={16} /> File leave
          </button>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
        {balances.map((b) => (
          <StatTile key={b.leaveType.id} label={b.leaveType.name} value={`${b.remaining}`} hint={isSemiannual(b.leaveType.id) ? `of ${b.credits} · ${b.period.label.slice(0, 7)}` : `of ${b.credits}`} compact />
        ))}
      </div>

      {formsError && <div className="mb-4 rounded-lg border border-[var(--status-critical)]/40 px-3 py-2 text-sm text-[var(--status-critical)]">{formsError}</div>}

      <FormQueue
        title={`Leave forms for your approval (${formsToSign.length})`}
        forms={formsToSign}
        requestById={requestById}
        action="Review & sign"
        onOpen={setViewing}
      />
      <FormQueue title={`Leave forms to receive (${formsToReceive.length})`} forms={formsToReceive} requestById={requestById} action="Review & receive" onOpen={setViewing} />

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
                    <div className="mt-1"><LeaveDocuments request={r} canUpload={false} /></div>
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
            onViewForm={setViewing}
            rows={myRequests.map((r) => ({
              id: r.id,
              request: r,
              form: formByRequest.get(r.id),
              canUpload: true,
              primary: leaveTypeName(r.leaveTypeId),
              secondary: `${formatDate(r.startDate)} – ${formatDate(r.endDate)} (${r.days}d)`,
              reason: r.reason,
              status: r.status,
              decisionNote: r.decisionNote,
            }))}
          />
        )}
      </div>

      {teamRequests.length === 0 && teamForms.length > 0 && (
        <div className="mb-4 rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-1)] p-4">
          <div className="mb-3 text-sm font-medium text-[var(--text-primary)]">My team&rsquo;s leave forms</div>
          <RequestsTable
            showEmployee
            onViewForm={setViewing}
            rows={teamForms.flatMap((f) => {
              const r = requestById.get(f.leaveRequestId);
              return r
                ? [
                    {
                      id: r.id,
                      request: r,
                      form: f,
                      canUpload: false,
                      employee: f.employeeName,
                      primary: leaveTypeName(r.leaveTypeId),
                      secondary: `${formatDate(r.startDate)} – ${formatDate(r.endDate)} (${r.days}d)`,
                      reason: r.reason,
                      status: r.status,
                      decisionNote: r.decisionNote,
                    },
                  ]
                : [];
            })}
          />
        </div>
      )}

      {teamRequests.length > 0 && (
        <div className="mb-4 rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-1)] p-4">
          <div className="mb-3 text-sm font-medium text-[var(--text-primary)]">My team&rsquo;s leave requests</div>
          <RequestsTable
            showEmployee
            onViewForm={setViewing}
            rows={teamRequests.map((r) => {
              const emp = employees.find((e) => e.id === r.employeeId);
              return {
                id: r.id,
                request: r,
                form: formByRequest.get(r.id),
                canUpload: false,
                employee: emp ? fullName(emp) : r.employeeId,
                primary: leaveTypeName(r.leaveTypeId),
                secondary: `${formatDate(r.startDate)} – ${formatDate(r.endDate)} (${r.days}d)`,
                reason: r.reason,
                status: r.status,
                decisionNote: r.decisionNote,
              };
            })}
          />
        </div>
      )}

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
              onViewForm={setViewing}
              onDelete={isHrManager ? (r) => (setDeleteError(null), setDeleting(r)) : undefined}
              rows={allRequests.map((r) => {
                const emp = employees.find((e) => e.id === r.employeeId);
                return {
                  id: r.id,
                  request: r,
                  form: formByRequest.get(r.id),
                  canUpload: false,
                  employee: emp ? fullName(emp) : formByRequest.get(r.id)?.employeeName ?? r.employeeId,
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

      <Modal open={!!deleting} onClose={() => !deleteBusy && setDeleting(null)} title="Delete leave request">
        {deleting && (
          <div className="space-y-3 text-sm text-[var(--text-secondary)]">
            <p>
              Delete{" "}
              <span className="font-medium text-[var(--text-primary)]">
                {(() => {
                  const emp = employees.find((e) => e.id === deleting.employeeId);
                  return emp ? fullName(emp) : (formByRequest.get(deleting.id)?.employeeName ?? deleting.employeeId);
                })()}
              </span>
              &rsquo;s {leaveTypeName(deleting.leaveTypeId)} ({formatDate(deleting.startDate)} – {formatDate(deleting.endDate)}, {deleting.days}d, {deleting.status})?
            </p>
            <p>Its leave form, signatures and attachments are deleted too, and the days go back to the employee&rsquo;s leave balance. This can&rsquo;t be undone.</p>
            {deleteError && <div className="text-xs text-[var(--status-critical)]">{deleteError}</div>}
            <div className="flex justify-end gap-2 pt-1">
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

      <LeaveApplicationModal open={showApply} onClose={() => setShowApply(false)} onFiled={reloadForms} />
      {viewingForm && <LeaveFormModal key={viewingForm.leaveRequestId} form={viewingForm} request={requestById.get(viewingForm.leaveRequestId)} onClose={() => setViewing(null)} onChanged={reloadForms} />}

      <Modal open={showFile} onClose={closeFileModal} title="File a leave request">
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
          {halfDayAllowed && (
            <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
              <input type="checkbox" checked={form.halfDay} onChange={(e) => setForm((f) => ({ ...f, halfDay: e.target.checked }))} />
              Half day
            </label>
          )}
          <div className="text-xs text-[var(--text-muted)]">Duration: {computedDays} business day(s)</div>
          {creditError && <div className="text-xs text-[var(--status-critical)]">{creditError}</div>}
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Reason</label>
            <textarea value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} rows={3} className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-2 text-sm" placeholder="Briefly describe the reason for this leave…" />
          </div>
          {formKinds.map((kind) => (
            <div key={kind}>
              <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">
                {KIND_LABEL[kind]} {kind === "leave_form" ? "(required)" : "(optional — you can add it later)"}
              </label>
              <input
                type="file"
                accept={ATTACHMENT_ACCEPT}
                onChange={(e) => pickFile(kind, e.target.files?.[0])}
                className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-[var(--gridline)] file:px-2 file:py-1 file:text-xs file:text-[var(--text-primary)]"
              />
              {files[kind] && <div className="mt-1 text-xs text-[var(--text-muted)]">{files[kind]!.name}</div>}
            </div>
          ))}
          {formKinds.length > 0 && (
            <div className="text-xs text-[var(--text-muted)]">
              Photo or PDF, up to 10 MB. Only you, your supervising department head and HR can open it; it&rsquo;s deleted {ATTACHMENT_RETENTION_DAYS} days after upload.
            </div>
          )}
          {fileError && <div className="text-xs text-[var(--status-critical)]">{fileError}</div>}
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={closeFileModal} className="rounded-lg px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40">{fileError?.startsWith("Leave request filed") ? "Close" : "Cancel"}</button>
            <button
              onClick={submitFile}
              disabled={submitting || !form.reason || computedDays <= 0 || missingLeaveForm || !!creditError || !!fileError?.startsWith("Leave request filed")}
              className="rounded-lg bg-[var(--series-1)] px-3 py-1.5 text-sm font-medium text-[var(--on-accent)] disabled:opacity-40"
            >
              {submitting ? "Submitting…" : "Submit request"}
            </button>
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

// Forms waiting on the user (to approve, or to receive).
function FormQueue({ title, forms, requestById, action, onOpen }: { title: string; forms: LeaveForm[]; requestById: Map<string, LeaveRequest>; action: string; onOpen: (id: string) => void }) {
  if (!forms.length) return null;
  return (
    <div className="mb-4 rounded-xl border border-[var(--series-1)]/40 bg-[var(--surface-1)] p-4">
      <div className="mb-3 text-sm font-medium text-[var(--text-primary)]">{title}</div>
      <div className="space-y-2">
        {forms.map((f) => {
          const r = requestById.get(f.leaveRequestId);
          return (
            <div key={f.leaveRequestId} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[var(--gridline)]/20 px-3 py-2 text-sm">
              <div>
                <span className="font-medium text-[var(--text-primary)]">{f.employeeName}</span>
                <span className="text-[var(--text-secondary)]">
                  {" "}
                  — {LEAVE_CATEGORIES.find((c) => c.id === f.category)?.label}
                  {r ? `, ${formatDate(r.startDate)}–${formatDate(r.endDate)} (${r.days}d)` : ""}
                </span>
                <div className="mt-1">
                  <FormProgress form={f} />
                </div>
              </div>
              <button onClick={() => onOpen(f.leaveRequestId)} className="flex items-center gap-1 rounded-lg bg-[var(--series-1)] px-2.5 py-1 text-xs font-medium text-[var(--on-accent)]">
                <FileText size={13} /> {action}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RequestsTable({
  rows,
  showEmployee = false,
  onViewForm,
  onDelete,
}: {
  rows: { id: string; request: LeaveRequest; form?: LeaveForm; canUpload: boolean; employee?: string; primary: string; secondary: string; reason: string; status: RequestStatus; decisionNote: string | null }[];
  showEmployee?: boolean;
  onViewForm?: (id: string) => void;
  onDelete?: (request: LeaveRequest) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] text-sm">
        <thead>
          <tr className="border-b border-[var(--border-hairline)] text-left text-xs text-[var(--text-muted)]">
            {showEmployee && <th className="px-3 py-2 font-medium">Employee</th>}
            <th className="px-3 py-2 font-medium">Type</th>
            <th className="px-3 py-2 font-medium">Period</th>
            <th className="px-3 py-2 font-medium">Reason</th>
            <th className="px-3 py-2 font-medium">Documents</th>
            <th className="px-3 py-2 font-medium">Status</th>
            {onDelete && <th className="px-3 py-2" />}
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
              <td className="px-3 py-2">
                {r.form && onViewForm && (
                  <button onClick={() => onViewForm(r.id)} className="mb-1 flex items-center gap-1 rounded-lg border border-[var(--border-hairline)] px-2 py-1 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40">
                    <FileText size={12} /> Leave form
                  </button>
                )}
                <LeaveDocuments request={r.request} canUpload={r.canUpload} onlineForm={!!r.form} />
              </td>
              <td className="px-3 py-2">{r.form ? <FormProgress form={r.form} /> : <Badge tone={STATUS_TONE[r.status]}>{r.status}</Badge>}</td>
              {onDelete && (
                <td className="px-3 py-2">
                  <button onClick={() => onDelete(r.request)} className="rounded-md p-1 text-[var(--text-muted)] hover:text-[var(--status-critical)]" aria-label="Delete leave request" title="Delete leave request">
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
