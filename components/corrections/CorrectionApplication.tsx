"use client";

import { isSecondSupervisorOf } from "@/lib/co-supervisor";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pencil, Printer } from "lucide-react";
import { useHris } from "@/lib/store";
import { Modal } from "@/components/Modal";
import { Badge } from "@/components/Badge";
import { todayInManila } from "@/lib/leave-policy";
import { CORRECTION_TYPES, correctionEditable, correctionProgress, correctionStage, correctionTypeLabel, timeLabel, type CorrectionForm, type CorrectionType } from "@/lib/correction-form";
import { fetchMyLeaveFormDetails, type LeaveFormSigner } from "@/lib/supabase/leave-forms";
import {
  correctionFormExists,
  correctionFormSignatureUrls,
  decideCorrectionForm,
  editCorrectionForm,
  fetchCorrectionForms,
  receiveCorrectionForm,
  signCorrectionForm,
  submitCorrectionForm,
  type CorrectionFormInput,
} from "@/lib/supabase/correction-forms";
import { MySignature } from "@/components/leave/LeaveApplication";
import { CorrectionFormDocument, type CorrectionFormDocData } from "@/components/corrections/CorrectionFormDocument";
import { PrintPage, PrintStack } from "@/components/vouchers/PrintStack";
import { DownloadPdfButton, PdfPage } from "@/components/pdf/DownloadPdfButton";
import { BranchDecision } from "@/components/forms/BranchApproval";
import { NO_BRANCH, canBranch } from "@/lib/branch-approval";

// Every attendance correction form the user may see (real accounts only).
export function useCorrectionForms() {
  const { isRealAccount } = useHris();
  const [forms, setForms] = useState<CorrectionForm[]>([]);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(() => {
    if (!isRealAccount) return;
    fetchCorrectionForms().then(
      (f) => {
        setForms(f);
        setError(null);
      },
      (e: Error) => setError(e.message),
    );
  }, [isRealAccount]);
  useEffect(() => reload(), [reload]);
  return { forms, error, reload };
}

export function CorrectionProgress({ form }: { form: CorrectionForm }) {
  const p = correctionProgress(form);
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <Badge tone={p.tone}>{p.label}</Badge>
      {form.editedAt && <Badge tone="muted">Edited by employee</Badge>}
    </span>
  );
}

const editedOn = (at: string) => new Date(at).toLocaleString("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });

// The note that the employee changed the form, with the earlier versions.
export function CorrectionEditNote({ form }: { form: CorrectionForm }) {
  const [open, setOpen] = useState(false);
  if (!form.editedAt) return null;
  const n = form.editCount ?? 1;
  const versions = [...(form.editHistory ?? [])].reverse();
  return (
    <div className="rounded-lg border border-[var(--status-warning)]/40 px-3 py-2 text-xs text-[var(--text-secondary)]" style={{ background: "color-mix(in srgb, var(--status-warning) 8%, transparent)" }}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span>
          <span className="font-semibold text-[var(--text-primary)]">Edited by the employee</span> — last on {editedOn(form.editedAt)}
          {n > 1 ? ` (${n} edits)` : ""}. The form shows the current version.
        </span>
        {versions.length > 0 && (
          <button onClick={() => setOpen((v) => !v)} className="text-[var(--series-1)] hover:underline">
            {open ? "Hide earlier versions" : `Show earlier version${versions.length > 1 ? "s" : ""}`}
          </button>
        )}
      </div>
      {open && (
        <div className="mt-2 space-y-1.5">
          {versions.map((v, i) => (
            <div key={i} className="rounded-md bg-[var(--surface-1)] px-2.5 py-1.5">
              <div className="text-[var(--text-muted)]">Before the edit on {editedOn(v.replacedAt)}</div>
              <div className="text-[var(--text-primary)]">
                {v.date} · {correctionTypeLabel(v.type)} · in {timeLabel(v.timeIn) || "—"} · out {timeLabel(v.timeOut) || "—"}
              </div>
              <div className="whitespace-pre-wrap">{v.reason}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// The employee changes their form before the Department Head signs it.
function CorrectionEditPanel({ form, onClose, onSaved }: { form: CorrectionForm; onClose: () => void; onSaved: () => Promise<void> }) {
  const today = useMemo(() => todayInManila(), []);
  const [draft, setDraft] = useState<CorrectionFormInput>({
    date: form.correctionDate,
    type: form.correctionType,
    timeIn: form.timeIn ?? "",
    timeOut: form.timeOut ?? "",
    reason: form.reason,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const missing = correctionMissing(draft, today);

  async function save() {
    if (missing) return;
    setBusy(true);
    setError(null);
    try {
      await editCorrectionForm(form.correctionRequestId, {
        ...draft,
        timeIn: needsIn(draft.type) ? draft.timeIn : "",
        timeOut: needsOut(draft.type) ? draft.timeOut : "",
      });
      await onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save the changes.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-[var(--series-1)]/40 p-3">
      <div className="text-sm font-semibold text-[var(--text-primary)]">Edit your request</div>
      <div className="text-xs text-[var(--text-muted)]">
        You can change it until your Department Head signs. Your approvers will see a note that you edited it, and the earlier version.
        {form.branchDecision === "approved" ? " It goes back to the branch approver for approval." : ""}
      </div>
      <CorrectionFields form={draft} setForm={setDraft} today={today} idPrefix="ac-edit" />
      {(error || missing) && <div className={`text-xs ${error ? "text-[var(--status-critical)]" : "text-[var(--text-muted)]"}`}>{error ?? missing}</div>}
      <div className="flex justify-end gap-2">
        <button onClick={onClose} disabled={busy} className="rounded-lg px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40">
          Cancel
        </button>
        <button onClick={save} disabled={busy || !!missing} className="rounded-lg bg-[var(--series-1)] px-3 py-1.5 text-sm font-medium text-[var(--on-accent)] disabled:opacity-40">
          {busy ? "Saving…" : "Save changes"}
        </button>
      </div>
    </div>
  );
}

export function canHeadCorrection(form: CorrectionForm, me: string | undefined, isHrManager: boolean): boolean {
  if (!me || form.employeeId === me || correctionStage(form) !== "waiting_head") return false;
  return form.departmentHeadId ? form.departmentHeadId === me || isSecondSupervisorOf(form.employeeId, me) : isHrManager;
}

// Time in / out the correction asks for, by type.
const needsIn = (t: CorrectionType) => t !== "missed_out";
const needsOut = (t: CorrectionType) => t !== "missed_in";

// ---- The correction details (filing and editing) ----------------------------------

export function CorrectionFields({
  form,
  setForm,
  today,
  idPrefix = "ac",
}: {
  form: CorrectionFormInput;
  setForm: React.Dispatch<React.SetStateAction<CorrectionFormInput>>;
  today: string;
  idPrefix?: string;
}) {
  const input = "w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-2 text-sm";
  const lbl = "mb-1 block text-xs font-medium text-[var(--text-secondary)]";
  const timeIn = needsIn(form.type) ? form.timeIn : "";
  const timeOut = needsOut(form.type) ? form.timeOut : "";
  return (
    <>
          <div>
            <label className={lbl} htmlFor={`${idPrefix}-date`}>
              Date to be corrected
            </label>
            <input id={`${idPrefix}-date`} type="date" max={today} value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} className={input} />
          </div>
          <div>
            <div className={lbl}>Correction needed</div>
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {CORRECTION_TYPES.map((t) => (
                <label key={t.id} className="flex items-center gap-2 text-sm text-[var(--text-primary)]">
                  <input type="radio" name={`${idPrefix}-type`} checked={form.type === t.id} onChange={() => setForm((f) => ({ ...f, type: t.id }))} /> {t.label}
                </label>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl} htmlFor={`${idPrefix}-in`}>
                Correct time in
              </label>
              <input id={`${idPrefix}-in`} type="time" value={timeIn} disabled={!needsIn(form.type)} onChange={(e) => setForm((f) => ({ ...f, timeIn: e.target.value }))} className={`${input} disabled:opacity-40`} />
            </div>
            <div>
              <label className={lbl} htmlFor={`${idPrefix}-out`}>
                Correct time out
              </label>
              <input id={`${idPrefix}-out`} type="time" value={timeOut} disabled={!needsOut(form.type)} onChange={(e) => setForm((f) => ({ ...f, timeOut: e.target.value }))} className={`${input} disabled:opacity-40`} />
            </div>
          </div>
          <div>
            <label className={lbl} htmlFor={`${idPrefix}-reason`}>
              Reason / explanation
            </label>
            <textarea
              id={`${idPrefix}-reason`}
              value={form.reason}
              onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
              rows={3}
              maxLength={1000}
              placeholder="Explain the discrepancy (missed punch, wrong shift, device failure, etc.)…"
              className={input}
            />
          </div>

    </>
  );
}

// What a correction still lacks before it can be submitted, or null.
export function correctionMissing(form: CorrectionFormInput, today: string): string | null {
  const timeIn = needsIn(form.type) ? form.timeIn : "";
  const timeOut = needsOut(form.type) ? form.timeOut : "";
  return !form.date
    ? "Enter the date to be corrected."
    : form.date > today
      ? "The date can't be in the future."
      : (form.type === "missed_in" || form.type === "missed_both") && !timeIn
        ? "Enter the correct time in."
        : (form.type === "missed_out" || form.type === "missed_both") && !timeOut
          ? "Enter the correct time out."
          : !timeIn && !timeOut
            ? "Enter the correct time in and / or time out."
            : !form.reason.trim()
              ? "Enter the reason / explanation."
              : null;
}

// ---- Filing (employee) ------------------------------------------------------------

export function CorrectionApplicationModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const { currentEmployee, fileCorrectionRequest, reloadRequests } = useHris();
  const today = useMemo(() => todayInManila(), []);
  const [details, setDetails] = useState<{ designation: string; branch: string; department: string; departmentHead: string } | null>(null);
  useEffect(() => {
    if (open) fetchMyLeaveFormDetails().then(setDetails, () => setDetails(null));
  }, [open]);
  const [form, setForm] = useState<CorrectionFormInput>({ date: today, type: "missed_in", timeIn: "08:00", timeOut: "17:00", reason: "" });
  const [hasSignature, setHasSignature] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filedId, setFiledId] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);
  const timeIn = needsIn(form.type) ? form.timeIn : "";
  const timeOut = needsOut(form.type) ? form.timeOut : "";

  // A missed punch needs that time; the other kinds need at least one time.
  const missing = correctionMissing(form, today) ?? (!hasSignature ? "Upload your signature to sign the form." : null);

  async function submit() {
    if (!currentEmployee || missing) return;
    setBusy(true);
    setError(null);
    const input = { ...form, timeIn, timeOut };
    try {
      let id = filedId;
      if (!id) {
        id = await fileCorrectionRequest({ employeeId: currentEmployee.id, date: form.date, requestedTimeIn: timeIn || null, requestedTimeOut: timeOut || null, reason: form.reason.trim() });
        if (!id) throw new Error("Couldn't file the correction request — please try again.");
        setFiledId(id);
      }
      // A retry after a dropped connection may find the form already in.
      const done = filedId ? await correctionFormExists(id) : false;
      if (!done) await signCorrectionForm(id, currentEmployee.id, "applicant");
      if (!done) await submitCorrectionForm(id, currentEmployee.id, input);
      await reloadRequests();
      onDone();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't submit the form.");
    } finally {
      setBusy(false);
    }
  }

  const doc: CorrectionFormDocData | null = currentEmployee
    ? {
        correctionRequestId: "",
        employeeId: currentEmployee.id,
        correctionDate: form.date,
        correctionType: form.type,
        timeIn: timeIn || null,
        timeOut: timeOut || null,
        reason: form.reason,
        employeeName: `${currentEmployee.firstName} ${currentEmployee.lastName}`,
        position: details?.designation ?? "",
        branch: details?.branch ?? "",
        department: details?.department ?? "",
        departmentHeadId: null,
        departmentHead: details?.departmentHead ?? "",
        submittedAt: null,
        headDecision: null,
        headReason: null,
        headSignedName: null,
        headSignedAt: null,
        receivedName: null,
        receivedAt: null,
        ...NO_BRANCH,
      }
    : null;

  const lbl = "mb-1 block text-xs font-medium text-[var(--text-secondary)]";
  const ro = "rounded-lg bg-[var(--gridline)]/30 px-3 py-2 text-sm text-[var(--text-primary)]";

  return (
    <Modal open={open} onClose={onClose} title="Attendance Correction Form" wide>
      {preview && doc ? (
        <div>
          <div className="overflow-x-auto rounded-lg bg-white p-4">
            <div className="min-w-[560px]">
              <CorrectionFormDocument form={doc} />
            </div>
          </div>
          <div className="mt-3 flex justify-end">
            <button onClick={() => setPreview(false)} className="rounded-lg border border-[var(--border-hairline)] px-3 py-1.5 text-sm text-[var(--text-secondary)]">
              Back to the form
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div>
              <div className={lbl}>Name</div>
              <div className={ro}>{doc?.employeeName}</div>
            </div>
            <div>
              <div className={lbl}>Position</div>
              <div className={ro}>{doc?.position || "—"}</div>
            </div>
            <div>
              <div className={lbl}>Branch</div>
              <div className={ro}>{doc?.branch || "—"}</div>
            </div>
            <div>
              <div className={lbl}>Department</div>
              <div className={ro}>{doc?.department || "—"}</div>
            </div>
            <div className="sm:col-span-2">
              <div className={lbl}>Department head</div>
              <div className={ro}>{doc?.departmentHead || "— (HR will approve)"}</div>
            </div>
          </div>

          <div className="text-xs font-semibold tracking-wide text-[var(--text-primary)] uppercase">Correction details</div>
          <CorrectionFields form={form} setForm={setForm} today={today} />

          <MySignature onChange={setHasSignature} />
          <div className="text-xs text-[var(--text-muted)]">Submitting signs the form with your signature (Employee&rsquo;s signature over printed name). Your department head and HR will see it.</div>

          {(error || missing) && <div className={`text-xs ${error ? "text-[var(--status-critical)]" : "text-[var(--text-muted)]"}`}>{error ?? missing}</div>}
          <div className="flex flex-wrap justify-end gap-2 pt-1">
            <button onClick={() => setPreview(true)} disabled={!doc} className="mr-auto rounded-lg border border-[var(--border-hairline)] px-3 py-1.5 text-sm text-[var(--text-secondary)] disabled:opacity-40">
              Preview form
            </button>
            <button onClick={onClose} className="rounded-lg px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40">
              Cancel
            </button>
            <button onClick={submit} disabled={busy || !!missing} className="rounded-lg bg-[var(--series-1)] px-3 py-1.5 text-sm font-medium text-[var(--on-accent)] disabled:opacity-40">
              {busy ? "Submitting…" : "Sign & submit"}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

// ---- Viewing, approving, receiving ------------------------------------------------

// Render with key={form.correctionRequestId} so each form starts afresh.
export function CorrectionFormModal({ form, onClose, onChanged }: { form: CorrectionForm; onClose: () => void; onChanged: () => void }) {
  const { currentEmployee, currentUser, reloadRequests } = useHris();
  const me = currentEmployee?.id;
  const isHr = !!currentUser?.roles.includes("hr_admin");
  const [sigs, setSigs] = useState<Partial<Record<LeaveFormSigner, string>>>({});
  const id = form.correctionRequestId;
  const loadSigs = useCallback(() => {
    correctionFormSignatureUrls(id).then(setSigs, () => setSigs({}));
  }, [id]);
  useEffect(() => loadSigs(), [loadSigs]);

  const stage = correctionStage(form);
  const canHead = canHeadCorrection(form, me, isHr);
  const canReceive = isHr && stage === "waiting_hr" && form.employeeId !== me;
  const canEdit = !!me && form.employeeId === me && correctionEditable(form);
  const [editing, setEditing] = useState(false);
  const [decision, setDecision] = useState<"approved" | "disapproved" | null>(null);
  const [reason, setReason] = useState("");
  const [hasSignature, setHasSignature] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [printing, setPrinting] = useState(false);
  const stopPrinting = useCallback(() => setPrinting(false), []);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await reloadRequests();
      onChanged();
      loadSigs();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't submit.");
    } finally {
      setBusy(false);
    }
  }

  const decide = () =>
    me && decision
      ? run(async () => {
          await signCorrectionForm(id, me, "head");
          await decideCorrectionForm(id, decision, reason);
        })
      : undefined;
  const receive = () =>
    me
      ? run(async () => {
          await signCorrectionForm(id, me, "hr");
          await receiveCorrectionForm(id);
        })
      : undefined;

  const input = "w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-2 text-sm";
  const filename = `Attendance-Correction-${form.employeeName.replace(/[^A-Za-z0-9]+/g, "-")}-${form.correctionDate}.pdf`;
  return (
    <Modal open onClose={onClose} title={`Attendance correction form — ${form.employeeName}`} wide>
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <CorrectionProgress form={form} />
          <div className="ml-auto flex items-start gap-2">
            {canEdit && !editing && (
              <button onClick={() => setEditing(true)} className="flex items-center gap-1.5 rounded-lg border border-[var(--series-1)]/60 px-3 py-1.5 text-sm font-medium text-[var(--series-1)] hover:bg-[var(--series-1)]/10">
                <Pencil size={14} /> Edit request
              </button>
            )}
            <button onClick={() => setPrinting(true)} className="flex items-center gap-1.5 rounded-lg border border-[var(--border-hairline)] px-3 py-1.5 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40">
              <Printer size={14} /> Print
            </button>
            <DownloadPdfButton filename={filename}>
              <PdfPage form>
                <CorrectionFormDocument form={form} signatures={sigs} />
              </PdfPage>
            </DownloadPdfButton>
          </div>
        </div>
        <CorrectionEditNote form={form} />
        {editing && (
          <CorrectionEditPanel
            form={form}
            onClose={() => setEditing(false)}
            onSaved={async () => {
              await reloadRequests();
              onChanged();
            }}
          />
        )}
        <div className="overflow-x-auto rounded-lg bg-white p-4">
          <div className="min-w-[560px]">
            <CorrectionFormDocument form={form} signatures={sigs} />
          </div>
        </div>

        {canBranch(form, me) && <BranchDecision kind="corr" requestId={id} onDone={async () => { await reloadRequests(); onChanged(); loadSigs(); }} />}

        {canHead && (
          <div className="space-y-3 rounded-lg border border-[var(--border-hairline)] p-3">
            <div className="text-sm font-semibold text-[var(--text-primary)]">Department Head&rsquo;s approval</div>
            <div className="flex flex-wrap items-center gap-4 text-sm text-[var(--text-secondary)]">
              <label className="flex items-center gap-2">
                <input type="radio" name="ac-head" checked={decision === "approved"} onChange={() => setDecision("approved")} /> Approved
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" name="ac-head" checked={decision === "disapproved"} onChange={() => setDecision("disapproved")} /> Disapproved
              </label>
            </div>
            {decision === "disapproved" && (
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]" htmlFor="ac-head-reason">
                  Reason of disapproval
                </label>
                <input id="ac-head-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} className={input} />
              </div>
            )}
            <MySignature onChange={setHasSignature} />
            {error && <div className="text-xs text-[var(--status-critical)]">{error}</div>}
            <div className="flex justify-end">
              <button
                onClick={decide}
                disabled={busy || !decision || !hasSignature || (decision === "disapproved" && !reason.trim())}
                className="rounded-lg bg-[var(--series-1)] px-3 py-1.5 text-sm font-medium text-[var(--on-accent)] disabled:opacity-40"
              >
                {busy ? "Submitting…" : decision === "disapproved" ? "Sign & disapprove" : "Sign & approve"}
              </button>
            </div>
          </div>
        )}

        {canReceive && (
          <div className="space-y-3 rounded-lg border border-[var(--border-hairline)] p-3">
            <div className="text-sm font-semibold text-[var(--text-primary)]">HR Department&rsquo;s receipt</div>
            <div className="text-xs text-[var(--text-muted)]">
              {form.headDecision === "approved" ? "Approved by the department head — update the attendance record if needed." : "Disapproved by the department head."} Signing marks the form as received.
            </div>
            <MySignature onChange={setHasSignature} />
            {error && <div className="text-xs text-[var(--status-critical)]">{error}</div>}
            <div className="flex justify-end">
              <button onClick={receive} disabled={busy || !hasSignature} className="rounded-lg bg-[var(--series-1)] px-3 py-1.5 text-sm font-medium text-[var(--on-accent)] disabled:opacity-40">
                {busy ? "Submitting…" : "Sign as received"}
              </button>
            </div>
          </div>
        )}
        {error && !canHead && !canReceive && <div className="text-xs text-[var(--status-critical)]">{error}</div>}
      </div>
      {printing && (
        <PrintStack onDone={stopPrinting}>
          <PrintPage form>
            <CorrectionFormDocument form={form} signatures={sigs} />
          </PrintPage>
        </PrintStack>
      )}
    </Modal>
  );
}
