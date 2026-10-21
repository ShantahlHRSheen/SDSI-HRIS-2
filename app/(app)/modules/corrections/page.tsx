"use client";

import { useApplyApprovedCorrections } from "@/components/attendance/useApplyApprovedCorrections";
import { Fragment, useMemo, useState } from "react";
import { CutoffHeaderRow, CutoffSelect, cutoffOf, cutoffsIn } from "@/lib/cutoff";
import { Check, FileEdit, FileText, X } from "lucide-react";
import { useHris } from "@/lib/store";
import { useMarkWorkforceSeen } from "@/components/workforce/WorkforceBadges";
import { EncodedBox, usePayrollEncoded } from "@/lib/supabase/payroll-encoded";
import { canBranch } from "@/lib/branch-approval";
import { PageHeader } from "@/components/PageHeader";
import { Badge, type BadgeTone } from "@/components/Badge";
import { Modal } from "@/components/Modal";
import { EmptyState } from "@/components/EmptyState";
import { formatDate, fullName } from "@/lib/helpers";
import { TODAY } from "@/lib/mock-data";
import type { RequestStatus } from "@/lib/types";
import { CorrectionApplicationModal, CorrectionFormModal, CorrectionProgress, canHeadCorrection, useCorrectionForms } from "@/components/corrections/CorrectionApplication";
import { correctionStage, timeLabel, type CorrectionForm } from "@/lib/correction-form";

const STATUS_TONE: Record<RequestStatus, BadgeTone> = {
  pending: "warning",
  approved: "good",
  rejected: "critical",
  cancelled: "muted",
};

export default function AttendanceCorrectionsPage() {
  const { employees, correctionRequests, currentUser, currentEmployee, fileCorrectionRequest, decideCorrectionRequest, isRealAccount } = useHris();
  // Approved attendance corrections update biometrics attendance.
  useApplyApprovedCorrections();
  // The online Attendance Correction Form (real accounts): filed and signed
  // by the employee, approved by their department head, received by HR.
  const { forms, error: formsError, reload: reloadForms } = useCorrectionForms();
  useMarkWorkforceSeen("corr");
  const formByRequest = useMemo(() => new Map(forms.map((f) => [f.correctionRequestId, f])), [forms]);
  const [showApply, setShowApply] = useState(false);
  const [viewing, setViewing] = useState<string | null>(null);
  const viewingForm = viewing ? formByRequest.get(viewing) : undefined;
  const isHrManager = !!currentUser?.roles.includes("hr_admin");
  // To sign as branch approver or as department head.
  const formsToSign = forms.filter((f) => canBranch(f, currentEmployee?.id) || canHeadCorrection(f, currentEmployee?.id, isHrManager));
  const formsToReceive = isHrManager ? forms.filter((f) => correctionStage(f) === "waiting_hr" && f.employeeId !== currentEmployee?.id) : [];
  const teamForms = forms.filter((f) => (f.departmentHeadId === currentEmployee?.id || f.branchApproverId === currentEmployee?.id) && f.employeeId !== currentEmployee?.id);
  const [showFile, setShowFile] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | RequestStatus>("all");
  // "All requests" are grouped by payroll cut-off (and can show just one).
  const [cutoffFilter, setCutoffFilter] = useState("all");
  const [search, setSearch] = useState("");
  // "Encoded in payroll" ticks (HR / payroll), shown beside each name in "All requests".
  const encoded = usePayrollEncoded("corr");
  const [encodedFilter, setEncodedFilter] = useState<"all" | "no" | "yes">("all");

  const isHrOrUpper = currentUser?.roles.some((r) => ["hr_admin", "upper_management"].includes(r));

  // The employee's own supervisor decides (Upper Management included — they
  // see everyone's requests but only decide on their own people); HR on anyone.
  function canDecide(employeeId: string): boolean {
    if (!currentEmployee) return false;
    if (currentUser?.roles.includes("hr_admin")) return true;
    const target = employees.find((e) => e.id === employeeId);
    return !!target && target.supervisorId === currentEmployee.id;
  }

  const myRequests = correctionRequests.filter((r) => r.employeeId === currentEmployee?.id).sort((a, b) => (a.filedAt < b.filedAt ? 1 : -1));
  // Requests filed without the online form (older ones) are still decided here directly.
  const pendingForMe = correctionRequests.filter((r) => r.status === "pending" && r.employeeId !== currentEmployee?.id && !formByRequest.has(r.id) && canDecide(r.employeeId));

  const allRequests = correctionRequests
    .filter((r) => (statusFilter === "all" ? true : r.status === statusFilter))
    .filter((r) => {
      const emp = employees.find((e) => e.id === r.employeeId);
      return emp ? fullName(emp).toLowerCase().includes(search.toLowerCase()) : true;
    })
    .filter((r) => cutoffFilter === "all" || cutoffOf(r.date).key === cutoffFilter)
    .sort((a, b) => cutoffOf(b.date).key.localeCompare(cutoffOf(a.date).key) || (a.filedAt < b.filedAt ? 1 : -1));

  const [form, setForm] = useState({ date: TODAY, requestedTimeIn: "08:00", requestedTimeOut: "17:00", reason: "" });

  function submitFile() {
    if (!currentEmployee || !form.reason) return;
    fileCorrectionRequest({
      employeeId: currentEmployee.id,
      date: form.date,
      requestedTimeIn: form.requestedTimeIn || null,
      requestedTimeOut: form.requestedTimeOut || null,
      reason: form.reason,
    });
    setShowFile(false);
    setForm({ date: TODAY, requestedTimeIn: "08:00", requestedTimeOut: "17:00", reason: "" });
  }

  function periodLabel(timeIn: string | null, timeOut: string | null) {
    return `${timeLabel(timeIn) || "—"} – ${timeLabel(timeOut) || "—"}`;
  }

  return (
    <div>
      <PageHeader
        title="Attendance Corrections"
        subtitle="Request a correction for a missing punch, wrong time, or biometric failure."
        actions={
          <button onClick={() => (isRealAccount && !formsError ? setShowApply(true) : setShowFile(true))} className="flex items-center gap-1.5 rounded-lg bg-[var(--series-1)] px-3 py-2 text-sm font-medium text-[var(--on-accent)]">
            <FileEdit size={16} /> File correction
          </button>
        }
      />

      {/* Until the database update is run the old request is filed instead; HR sees why. */}
      {formsError && isHrManager && <div className="mb-4 rounded-lg border border-[var(--status-critical)]/40 px-3 py-2 text-sm text-[var(--status-critical)]">{formsError}</div>}
      <FormQueue title={`Correction forms for your approval (${formsToSign.length})`} forms={formsToSign} action="Review & sign" onOpen={(f) => setViewing(f.correctionRequestId)} />
      <FormQueue title={`Correction forms to receive (${formsToReceive.length})`} forms={formsToReceive} action="Review & receive" onOpen={(f) => setViewing(f.correctionRequestId)} />

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
                    <span className="text-[var(--text-secondary)]"> — {formatDate(r.date)}, requesting {periodLabel(r.requestedTimeIn, r.requestedTimeOut)}</span>
                    <div className="text-xs text-[var(--text-muted)]">{r.reason}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => decideCorrectionRequest(r.id, "approved")} className="flex items-center gap-1 rounded-lg bg-[var(--status-good)] px-2.5 py-1 text-xs font-medium text-[var(--on-accent)]"><Check size={13} /> Approve</button>
                    <button onClick={() => setRejectTarget(r.id)} className="flex items-center gap-1 rounded-lg border border-[var(--border-hairline)] px-2.5 py-1 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40"><X size={13} /> Reject</button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="mb-4 rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-1)] p-4">
        <div className="mb-3 text-sm font-medium text-[var(--text-primary)]">My correction requests</div>
        {myRequests.length === 0 ? (
          <EmptyState icon={FileEdit} title="No correction requests yet" description="Requests you file will appear here with their approval status." />
        ) : (
          <RequestsTable
            onViewForm={setViewing}
            rows={myRequests.map((r) => ({ id: r.id, form: formByRequest.get(r.id), primary: periodLabel(r.requestedTimeIn, r.requestedTimeOut), secondary: formatDate(r.date), reason: r.reason, status: r.status, decisionNote: r.decisionNote }))}
          />
        )}
      </div>

      {!isHrOrUpper && teamForms.length > 0 && (
        <div className="mb-4 rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-1)] p-4">
          <div className="mb-3 text-sm font-medium text-[var(--text-primary)]">My team&rsquo;s correction forms</div>
          <RequestsTable
            showEmployee
            onViewForm={setViewing}
            rows={teamForms.map((f) => {
              const r = correctionRequests.find((x) => x.id === f.correctionRequestId);
              return { id: f.correctionRequestId, form: f, employee: f.employeeName, primary: periodLabel(f.timeIn, f.timeOut), secondary: formatDate(f.correctionDate), reason: f.reason, status: r?.status ?? "pending", decisionNote: r?.decisionNote ?? null };
            })}
          />
        </div>
      )}

      {isHrOrUpper && (
        <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-1)] p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm font-medium text-[var(--text-primary)]">All correction requests</div>
            <div className="flex flex-wrap items-center gap-2">
              <CutoffSelect value={cutoffFilter} onChange={setCutoffFilter} cutoffs={cutoffsIn(correctionRequests.map((r) => r.date))} />
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)} className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-2.5 py-1.5 text-xs">
                <option value="all">All statuses</option>
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
              </select>
              {encoded.ready && (
                <select value={encodedFilter} onChange={(e) => setEncodedFilter(e.target.value as typeof encodedFilter)} className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-2.5 py-1.5 text-xs" aria-label="Encoded in payroll">
                  <option value="all">Payroll: all</option>
                  <option value="no">Not yet encoded</option>
                  <option value="yes">Encoded in payroll</option>
                </select>
              )}
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search employee…" className="w-48 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-1.5 text-xs" />
            </div>
          </div>
          {allRequests.length === 0 ? (
            <EmptyState icon={FileEdit} title="No matching requests" description="Adjust your filters or search." />
          ) : (
            <RequestsTable
              showEmployee
              onViewForm={setViewing}
              encoded={encoded}
              rows={allRequests.filter((r) => encodedFilter === "all" || encoded.marks.has(r.id) === (encodedFilter === "yes")).map((r) => {
                const emp = employees.find((e) => e.id === r.employeeId);
                return { id: r.id, cutoff: cutoffOf(r.date).label, form: formByRequest.get(r.id), employee: emp ? fullName(emp) : r.employeeId, primary: periodLabel(r.requestedTimeIn, r.requestedTimeOut), secondary: formatDate(r.date), reason: r.reason, status: r.status, decisionNote: r.decisionNote };
              })}
            />
          )}
        </div>
      )}

      {showApply && <CorrectionApplicationModal open onClose={() => setShowApply(false)} onDone={reloadForms} />}
      {viewingForm && <CorrectionFormModal key={viewingForm.correctionRequestId} form={viewingForm} onClose={() => setViewing(null)} onChanged={reloadForms} />}

      <Modal open={showFile} onClose={() => setShowFile(false)} title="File an attendance correction">
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Date</label>
            <input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-2 text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Requested time in</label>
              <input type="time" value={form.requestedTimeIn} onChange={(e) => setForm((f) => ({ ...f, requestedTimeIn: e.target.value }))} className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Requested time out</label>
              <input type="time" value={form.requestedTimeOut} onChange={(e) => setForm((f) => ({ ...f, requestedTimeOut: e.target.value }))} className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-2 text-sm" />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Reason</label>
            <textarea value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} rows={3} className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-2 text-sm" placeholder="Explain the discrepancy (missed punch, wrong shift, device failure, etc.)…" />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={() => setShowFile(false)} className="rounded-lg px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40">Cancel</button>
            <button onClick={submitFile} disabled={!form.reason} className="rounded-lg bg-[var(--series-1)] px-3 py-1.5 text-sm font-medium text-[var(--on-accent)] disabled:opacity-40">Submit request</button>
          </div>
        </div>
      </Modal>

      <Modal open={!!rejectTarget} onClose={() => setRejectTarget(null)} title="Reject correction request">
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Reason (optional)</label>
            <textarea value={rejectNote} onChange={(e) => setRejectNote(e.target.value)} rows={3} className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-2 text-sm" placeholder="Let the employee know why this was rejected…" />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={() => setRejectTarget(null)} className="rounded-lg px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40">Cancel</button>
            <button
              onClick={() => {
                if (rejectTarget) decideCorrectionRequest(rejectTarget, "rejected", rejectNote || undefined);
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

// Forms waiting on the user (to approve or receive).
function FormQueue({ title, forms, action, onOpen }: { title: string; forms: CorrectionForm[]; action: string; onOpen: (f: CorrectionForm) => void }) {
  if (!forms.length) return null;
  return (
    <div className="mb-4 rounded-xl border border-[var(--series-1)]/40 bg-[var(--surface-1)] p-4">
      <div className="mb-3 text-sm font-medium text-[var(--text-primary)]">{title}</div>
      <div className="space-y-2">
        {forms.map((f) => (
          <div key={f.correctionRequestId} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[var(--gridline)]/20 px-3 py-2 text-sm">
            <div>
              <span className="font-medium text-[var(--text-primary)]">{f.employeeName}</span>
              <span className="text-[var(--text-secondary)]">
                {" "}
                — {formatDate(f.correctionDate)}, {timeLabel(f.timeIn) || "—"} – {timeLabel(f.timeOut) || "—"}
              </span>
              <div className="line-clamp-1 text-xs text-[var(--text-muted)]">{f.reason}</div>
            </div>
            <button onClick={() => onOpen(f)} className="flex items-center gap-1 rounded-lg bg-[var(--series-1)] px-2.5 py-1 text-xs font-medium text-[var(--on-accent)]">
              <FileText size={13} /> {action}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function RequestsTable({
  rows,
  showEmployee = false,
  encoded,
  onViewForm,
}: {
  rows: { id: string; cutoff?: string; form?: CorrectionForm; employee?: string; primary: string; secondary: string; reason: string; status: RequestStatus; decisionNote: string | null }[];
  showEmployee?: boolean;
  encoded?: ReturnType<typeof usePayrollEncoded>;
  onViewForm?: (id: string) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-sm">
        <thead>
          <tr className="border-b border-[var(--border-hairline)] text-left text-xs text-[var(--text-muted)]">
            {showEmployee && <th className="px-3 py-2 font-medium">{encoded?.ready ? "Encoded · Employee" : "Employee"}</th>}
            <th className="px-3 py-2 font-medium">Requested time</th>
            <th className="px-3 py-2 font-medium">Date</th>
            <th className="px-3 py-2 font-medium">Reason</th>
            <th className="px-3 py-2 font-medium">Status</th>
            <th className="px-3 py-2 font-medium">Form</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <Fragment key={r.id}>
              {r.cutoff && r.cutoff !== rows[i - 1]?.cutoff && <CutoffHeaderRow label={r.cutoff} count={rows.filter((x) => x.cutoff === r.cutoff).length} colSpan={(showEmployee ? 1 : 0) + 5} />}
              <tr className="border-b border-[var(--gridline)] last:border-0">
              {showEmployee && (
                <td className="px-3 py-2 text-[var(--text-primary)]">
                  <span className="flex items-center gap-2">
                    {encoded?.ready && <EncodedBox id={r.id} marks={encoded.marks} canTick={encoded.canTick} onToggle={encoded.toggle} />}
                    {r.employee}
                  </span>
                </td>
              )}
              <td className="tabular px-3 py-2 text-[var(--text-primary)]">{r.primary}</td>
              <td className="px-3 py-2 text-[var(--text-secondary)]">{r.secondary}</td>
              <td className="max-w-xs px-3 py-2 text-[var(--text-secondary)]">
                <div className="line-clamp-2">{r.reason}</div>
                {r.decisionNote && <div className="mt-1 text-xs text-[var(--text-muted)]">Note: {r.decisionNote}</div>}
              </td>
              <td className="px-3 py-2">{r.form ? <CorrectionProgress form={r.form} /> : <Badge tone={STATUS_TONE[r.status]}>{r.status}</Badge>}</td>
              <td className="px-3 py-2">
                {r.form && onViewForm ? (
                  <button onClick={() => onViewForm(r.id)} className="flex items-center gap-1 rounded-lg border border-[var(--border-hairline)] px-2 py-1 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40">
                    <FileText size={12} /> Correction form
                  </button>
                ) : (
                  <span className="text-xs text-[var(--text-muted)]">—</span>
                )}
              </td>
              </tr>
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
