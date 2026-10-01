"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, PenLine } from "lucide-react";
import { useHris } from "@/lib/store";
import { Modal } from "@/components/Modal";
import { Badge } from "@/components/Badge";
import { businessDaysBetween } from "@/lib/helpers";
import { checkLeaveRequest, todayInManila } from "@/lib/leave-policy";
import { prepareSignature } from "@/lib/id-images";
import {
  HEAD_DAY_FIELDS,
  LEAVE_CATEGORIES,
  defaultHeadDays,
  formProgress,
  formStage,
  isSickCategory,
  leaveCredits,
  type HeadDays,
  type LeaveCategory,
  type LeaveForm,
} from "@/lib/leave-form";
import {
  decideLeaveForm,
  fetchLeaveForms,
  fetchMyLeaveFormDetails,
  leaveFormSignatureUrls,
  mySignatureUrl,
  receiveLeaveForm,
  saveMySignature,
  signLeaveForm,
  submitLeaveForm,
  type LeaveFormSigner,
} from "@/lib/supabase/leave-forms";
import { LeaveFormDocument, type LeaveFormDocData } from "@/components/leave/LeaveFormDocument";
import { ATTACHMENT_ACCEPT, prepareUpload, validateUpload, withFileType } from "@/components/leave/LeaveAttachments";
import { PrintPage, PrintStack } from "@/components/vouchers/PrintStack";
import type { LeaveRequest } from "@/lib/types";

// ---- Data -------------------------------------------------------------------

// Every leave form the user may see (real accounts only).
export function useLeaveForms() {
  const { isRealAccount } = useHris();
  const [forms, setForms] = useState<LeaveForm[]>([]);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(() => {
    if (!isRealAccount) return;
    fetchLeaveForms().then(
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

// The signed-in user's saved signature.
function useMySignature() {
  const { currentEmployee } = useHris();
  const id = currentEmployee?.id;
  const [url, setUrl] = useState<string | null>(null);
  const reload = useCallback(() => {
    if (id) mySignatureUrl(id).then(setUrl, () => setUrl(null));
  }, [id]);
  useEffect(() => reload(), [reload]);
  return { url, reload };
}

// "Your signature" — upload once, used on every form you sign (a photo of
// your signature on white paper; the background is removed automatically).
function MySignature({ onChange }: { onChange?: (hasSignature: boolean) => void }) {
  const { currentEmployee } = useHris();
  const { url, reload } = useMySignature();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => onChange?.(!!url), [url, onChange]);

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !currentEmployee) return;
    setBusy(true);
    setError(null);
    try {
      await saveMySignature(currentEmployee.id, await prepareSignature(file));
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save the signature.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-[var(--border-hairline)] p-3">
      <div className="mb-2 text-xs font-medium text-[var(--text-secondary)]">Your signature</div>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex h-14 w-44 items-center justify-center rounded-md bg-white">
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL from Supabase Storage
            <img src={url} alt="Your signature" className="max-h-12 max-w-40 object-contain" />
          ) : (
            <span className="text-xs text-[#777]">No signature yet</span>
          )}
        </div>
        <button
          type="button"
          onClick={() => input.current?.click()}
          disabled={busy}
          className="flex items-center gap-1.5 rounded-lg border border-[var(--border-hairline)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40 disabled:opacity-40"
        >
          <PenLine size={14} /> {busy ? "Saving…" : url ? "Replace signature" : "Upload signature"}
        </button>
      </div>
      <div className="mt-1.5 text-[11px] text-[var(--text-muted)]">A photo of your signature on white paper — the background is removed automatically. It&rsquo;s saved for the next forms you sign.</div>
      {error && <div className="mt-1 text-xs text-[var(--status-critical)]">{error}</div>}
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={pick} />
    </div>
  );
}

// ---- Filing (employee) --------------------------------------------------------

export function LeaveApplicationModal({ open, onClose, onFiled }: { open: boolean; onClose: () => void; onFiled: () => void }) {
  const { currentEmployee, leaveTypes, leaveRequests, fileLeaveRequest, uploadLeaveAttachment } = useHris();
  const today = useMemo(() => todayInManila(), []);
  const [details, setDetails] = useState<{ designation: string; branch: string; department: string; departmentHead: string } | null>(null);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    fetchMyLeaveFormDetails().then(setDetails, (e: Error) => setDetailsError(e.message));
  }, [open]);

  const blank = { applicationDate: today, category: "vacation_with_pay" as LeaveCategory, sickPlace: null as "hospital" | "out_patient" | null, sickDetails: "", reason: "", startDate: today, endDate: today, halfDay: false };
  const [form, setForm] = useState(blank);
  const [medical, setMedical] = useState<File | null>(null);
  const [hasSignature, setHasSignature] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A request already filed whose form didn't go through — retried without filing again.
  const [filedId, setFiledId] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);

  const category = LEAVE_CATEGORIES.find((c) => c.id === form.category)!;
  const leaveType = leaveTypes.find((t) => t.id === category.leaveTypeId);
  const businessDays = form.startDate && form.endDate && form.endDate >= form.startDate ? businessDaysBetween(form.startDate, form.endDate) : 0;
  const halfDayAllowed = businessDays === 1 && form.startDate === form.endDate;
  const days = halfDayAllowed && form.halfDay ? 0.5 : businessDays;
  const sick = isSickCategory(form.category);
  const credits = currentEmployee ? leaveCredits(leaveRequests, currentEmployee.id, leaveTypes, form.category, form.startDate, days, form.applicationDate || today) : null;
  const creditError =
    currentEmployee && leaveType && days > 0 && !filedId
      ? checkLeaveRequest(leaveRequests, { employeeId: currentEmployee.id, leaveType, startDate: form.startDate, endDate: form.endDate, days })
      : null;
  const reasonNeeded = !sick;
  const missing = !form.applicationDate
    ? "Enter the date of application."
    : days <= 0
      ? "Choose the inclusive dates (weekdays)."
      : sick && !form.sickPlace
        ? "For sick leave, choose In Hospital or Out Patient."
        : sick && form.sickPlace === "hospital" && !form.sickDetails.trim()
          ? "Specify the hospital."
          : reasonNeeded && !form.reason.trim()
            ? "Enter the reason."
            : !hasSignature
              ? "Upload your signature to sign the form."
              : null;

  function close() {
    setForm(blank);
    setMedical(null);
    setError(null);
    setFiledId(null);
    setPreview(false);
    onClose();
  }

  async function submit() {
    if (!currentEmployee || !credits || missing || creditError) return;
    setBusy(true);
    setError(null);
    try {
      let id = filedId;
      if (!id) {
        const reasonText = form.reason.trim() || `${category.label}${sick && form.sickPlace ? ` (${form.sickPlace === "hospital" ? `In Hospital: ${form.sickDetails.trim()}` : "Out Patient"})` : ""}`;
        id = await fileLeaveRequest({ employeeId: currentEmployee.id, leaveTypeId: category.leaveTypeId, startDate: form.startDate, endDate: form.endDate, days, reason: reasonText });
        if (!id) throw new Error("Couldn't file the leave request — please try again.");
        setFiledId(id);
      }
      await signLeaveForm(id, currentEmployee.id, "applicant");
      await submitLeaveForm({
        leaveRequestId: id,
        employeeId: currentEmployee.id,
        applicationDate: form.applicationDate,
        category: form.category,
        sickPlace: sick ? form.sickPlace : null,
        sickDetails: sick && form.sickPlace === "hospital" ? form.sickDetails : "",
        reason: form.reason,
        credits,
      });
      if (medical) {
        const err = await uploadLeaveAttachment({ leaveRequestId: id, employeeId: currentEmployee.id, kind: "medical_certificate", file: await prepareUpload(medical) });
        if (err) {
          onFiled();
          setError(`Your leave form was submitted, but the medical certificate didn't upload (${err}). Add it from "My leave requests".`);
          setBusy(false);
          return;
        }
      }
      onFiled();
      close();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't submit the form.");
    } finally {
      setBusy(false);
    }
  }

  const docData: LeaveFormDocData | null =
    currentEmployee && credits
      ? {
          leaveRequestId: "",
          employeeId: currentEmployee.id,
          applicationDate: form.applicationDate,
          category: form.category,
          sickPlace: sick ? form.sickPlace : null,
          sickDetails: form.sickDetails,
          reason: form.reason,
          credits,
          employeeName: `${currentEmployee.firstName} ${currentEmployee.lastName}`,
          designation: details?.designation ?? "",
          branch: details?.branch ?? "",
          department: details?.department ?? "",
          departmentHeadId: null,
          departmentHead: details?.departmentHead ?? "",
          submittedAt: null,
          headDays: null,
          headDecision: null,
          headReason: null,
          headSignedBy: null,
          headSignedName: null,
          headSignedAt: null,
          receivedBy: null,
          receivedName: null,
          receivedAt: null,
          startDate: form.startDate,
          endDate: form.endDate,
          days,
        }
      : null;

  const input = "w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-2 text-sm";
  const lbl = "mb-1 block text-xs font-medium text-[var(--text-secondary)]";
  const ro = "rounded-lg bg-[var(--gridline)]/30 px-3 py-2 text-sm text-[var(--text-primary)]";

  return (
    <Modal open={open} onClose={close} title="Application for Leave" wide>
      {preview && docData ? (
        <div>
          <div className="overflow-x-auto rounded-lg bg-white p-4">
            <div className="min-w-[600px]">
              <LeaveFormDocument form={docData} />
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
              <div className={lbl}>Name of employee</div>
              <div className={ro}>{currentEmployee ? `${currentEmployee.firstName} ${currentEmployee.lastName}` : ""}</div>
            </div>
            <div>
              <label className={lbl} htmlFor="lf-date">
                Date of application
              </label>
              <input id="lf-date" type="date" value={form.applicationDate} onChange={(e) => setForm((f) => ({ ...f, applicationDate: e.target.value }))} className={input} />
            </div>
            <div>
              <div className={lbl}>Designation</div>
              <div className={ro}>{details?.designation || "—"}</div>
            </div>
            <div>
              <div className={lbl}>Branch</div>
              <div className={ro}>{details?.branch || "—"}</div>
            </div>
            <div>
              <div className={lbl}>Department</div>
              <div className={ro}>{details?.department || "—"}</div>
            </div>
            <div>
              <div className={lbl}>Department head</div>
              <div className={ro}>{details?.departmentHead || "— (HR will approve)"}</div>
            </div>
          </div>
          {detailsError && <div className="text-xs text-[var(--status-critical)]">{detailsError}</div>}

          <div>
            <div className="mb-2 text-xs font-semibold tracking-wide text-[var(--text-primary)] uppercase">Details of application</div>
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {LEAVE_CATEGORIES.map((c) => (
                <label key={c.id} className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                  <input type="radio" name="lf-category" checked={form.category === c.id} onChange={() => setForm((f) => ({ ...f, category: c.id }))} />
                  {c.label}
                </label>
              ))}
            </div>
          </div>

          {sick && (
            <div className="space-y-2 rounded-lg border border-[var(--border-hairline)] p-3">
              <div className="text-xs font-medium text-[var(--text-secondary)]">In case of sick leave</div>
              <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                <input type="radio" name="lf-sick" checked={form.sickPlace === "hospital"} onChange={() => setForm((f) => ({ ...f, sickPlace: "hospital" }))} />
                In Hospital (specify)
              </label>
              {form.sickPlace === "hospital" && (
                <input value={form.sickDetails} onChange={(e) => setForm((f) => ({ ...f, sickDetails: e.target.value }))} maxLength={300} placeholder="Hospital name" aria-label="Hospital" className={input} />
              )}
              <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                <input type="radio" name="lf-sick" checked={form.sickPlace === "out_patient"} onChange={() => setForm((f) => ({ ...f, sickPlace: "out_patient" }))} />
                Out Patient
              </label>
              <div>
                <label className={lbl}>Medical certificate (optional — you can add it later)</label>
                <input
                  type="file"
                  accept={ATTACHMENT_ACCEPT}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    const file = withFileType(f);
                    const bad = validateUpload(file);
                    setError(bad);
                    setMedical(bad ? null : file);
                  }}
                  className="w-full text-xs text-[var(--text-secondary)] file:mr-3 file:rounded-md file:border-0 file:bg-[var(--gridline)] file:px-2 file:py-1 file:text-xs file:text-[var(--text-primary)]"
                />
              </div>
            </div>
          )}

          <div>
            <label className={lbl} htmlFor="lf-reason">
              Reason {sick ? "(optional)" : "(in case of vacation / absent)"}
            </label>
            <textarea id="lf-reason" value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} rows={3} maxLength={1000} className={input} />
          </div>

          <div>
            <div className={lbl}>Inclusive dates</div>
            <div className="grid grid-cols-2 gap-3">
              <input type="date" aria-label="From" value={form.startDate} onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value, endDate: f.endDate < e.target.value ? e.target.value : f.endDate }))} className={input} />
              <input type="date" aria-label="To" value={form.endDate} min={form.startDate} onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))} className={input} />
            </div>
            <div className="mt-1 flex items-center gap-4 text-xs text-[var(--text-muted)]">
              <span>
                {days} working day{days === 1 ? "" : "s"}
              </span>
              {halfDayAllowed && (
                <label className="flex items-center gap-1.5">
                  <input type="checkbox" checked={form.halfDay} onChange={(e) => setForm((f) => ({ ...f, halfDay: e.target.checked }))} /> Half day
                </label>
              )}
            </div>
            {creditError && <div className="mt-1 text-xs text-[var(--status-critical)]">{creditError}</div>}
          </div>

          {credits && (
            <div className="rounded-lg border border-[var(--border-hairline)] p-3">
              <div className="mb-2 text-xs font-semibold tracking-wide text-[var(--text-primary)] uppercase">Certificate of leave credits</div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-[var(--text-muted)]">
                    <th className="text-left font-medium" />
                    <th className="text-right font-medium">Vacation</th>
                    <th className="text-right font-medium">Sick</th>
                  </tr>
                </thead>
                <tbody className="tabular text-[var(--text-secondary)]">
                  <tr>
                    <td>Balance</td>
                    <td className="text-right">{credits.vl}</td>
                    <td className="text-right">{credits.sl}</td>
                  </tr>
                  <tr>
                    <td>Less this application</td>
                    <td className="text-right">{credits.lessVl}</td>
                    <td className="text-right">{credits.lessSl}</td>
                  </tr>
                  <tr className="font-semibold text-[var(--text-primary)]">
                    <td>Net balance</td>
                    <td className="text-right">{Math.round((credits.vl - credits.lessVl) * 100) / 100}</td>
                    <td className="text-right">{Math.round((credits.sl - credits.lessSl) * 100) / 100}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          <MySignature onChange={setHasSignature} />
          <div className="text-xs text-[var(--text-muted)]">Submitting signs the form with your signature (Applicant&rsquo;s Signature above Printed Name). Your department head and HR will see it.</div>

          {(error || (missing && !busy)) && <div className={`text-xs ${error ? "text-[var(--status-critical)]" : "text-[var(--text-muted)]"}`}>{error ?? missing}</div>}
          <div className="flex flex-wrap justify-end gap-2 pt-1">
            <button onClick={() => setPreview(true)} disabled={!docData} className="mr-auto rounded-lg border border-[var(--border-hairline)] px-3 py-1.5 text-sm text-[var(--text-secondary)] disabled:opacity-40">
              Preview form
            </button>
            <button onClick={close} className="rounded-lg px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40">
              Cancel
            </button>
            <button onClick={submit} disabled={busy || !!missing || !!creditError} className="rounded-lg bg-[var(--series-1)] px-3 py-1.5 text-sm font-medium text-[var(--on-accent)] disabled:opacity-40">
              {busy ? "Submitting…" : "Sign & submit"}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

// ---- Viewing, approving, receiving -----------------------------------------------

export function FormProgress({ form }: { form: LeaveForm }) {
  const p = formProgress(form);
  return <Badge tone={p.tone}>{p.label}</Badge>;
}

// Can the signed-in user fill in the department head's part of this form?
export function canHeadForm(form: LeaveForm, me: string | undefined, isHrManager: boolean): boolean {
  if (!me || form.employeeId === me || formStage(form) !== "waiting_head") return false;
  return form.departmentHeadId ? form.departmentHeadId === me : isHrManager;
}

// Render with key={form.leaveRequestId} so each form starts afresh.
export function LeaveFormModal({ form, request, onClose, onChanged }: { form: LeaveForm; request: LeaveRequest | undefined; onClose: () => void; onChanged: () => void }) {
  const { currentEmployee, currentUser } = useHris();
  const me = currentEmployee?.id;
  const isHr = !!currentUser?.roles.includes("hr_admin");
  const [sigs, setSigs] = useState<Partial<Record<LeaveFormSigner, string>>>({});
  const id = form.leaveRequestId;
  const loadSigs = useCallback(() => {
    if (id) leaveFormSignatureUrls(id).then(setSigs, () => setSigs({}));
  }, [id]);
  useEffect(() => loadSigs(), [loadSigs]);

  const [decision, setDecision] = useState<"approved" | "disapproved" | null>(null);
  const [reason, setReason] = useState("");
  const [headDays, setHeadDays] = useState<HeadDays>(() => (request ? defaultHeadDays(form.category, request.days) : {}));
  const [hasSignature, setHasSignature] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [printing, setPrinting] = useState(false);
  const stopPrinting = useCallback(() => setPrinting(false), []);
  const stage = formStage(form);
  const canHead = canHeadForm(form, me, isHr);
  const canReceive = isHr && stage === "waiting_hr" && form.employeeId !== me;
  const doc: LeaveFormDocData = {
    ...form,
    startDate: request?.startDate ?? "",
    endDate: request?.endDate ?? "",
    days: request?.days ?? 0,
    headDays: stage === "waiting_head" ? headDays : form.headDays,
  };

  async function decide() {
    if (!me || !decision) return;
    setBusy(true);
    setError(null);
    try {
      await signLeaveForm(form.leaveRequestId, me, "head");
      await decideLeaveForm(form.leaveRequestId, decision, reason, headDays);
      onChanged();
      loadSigs();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't submit.");
    } finally {
      setBusy(false);
    }
  }

  async function receive() {
    if (!me) return;
    setBusy(true);
    setError(null);
    try {
      await signLeaveForm(form.leaveRequestId, me, "hr");
      await receiveLeaveForm(form.leaveRequestId);
      onChanged();
      loadSigs();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't receive the form.");
    } finally {
      setBusy(false);
    }
  }

  const input = "w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-2 text-sm";
  return (
    <Modal open onClose={onClose} title={`Application for Leave — ${form.employeeName}`} wide>
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <FormProgress form={form} />
          {stage === "received" && (
            <button onClick={() => setPrinting(true)} className="ml-auto flex items-center gap-1.5 rounded-lg bg-[var(--series-1)] px-3 py-1.5 text-sm font-medium text-[var(--on-accent)]">
              <Download size={14} /> Download (PDF)
            </button>
          )}
        </div>
        <div className="overflow-x-auto rounded-lg bg-white p-4">
          <div className="min-w-[600px]">
            <LeaveFormDocument form={doc} signatures={sigs} />
          </div>
        </div>
        {stage === "received" && <div className="text-xs text-[var(--text-muted)]">Download opens the print window — choose &ldquo;Save as PDF&rdquo; to keep a copy.</div>}

        {canHead && (
          <div className="space-y-3 rounded-lg border border-[var(--border-hairline)] p-3">
            <div className="text-sm font-semibold text-[var(--text-primary)]">Department Head&rsquo;s approval</div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {HEAD_DAY_FIELDS.map((f) => (
                <label key={f.id} className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                  <input
                    type="number"
                    min={0}
                    step={0.5}
                    value={headDays[f.id] ?? ""}
                    onChange={(e) => setHeadDays((d) => ({ ...d, [f.id]: e.target.value === "" ? undefined : Math.max(0, Number(e.target.value)) }))}
                    className="w-16 rounded-md border border-[var(--border-hairline)] bg-[var(--surface-1)] px-2 py-1 text-right text-sm"
                    aria-label={f.label}
                  />
                  {f.label}
                </label>
              ))}
            </div>
            <div className="flex flex-wrap gap-4 text-sm text-[var(--text-secondary)]">
              <label className="flex items-center gap-2">
                <input type="radio" name="lf-decision" checked={decision === "approved"} onChange={() => setDecision("approved")} /> Approved
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" name="lf-decision" checked={decision === "disapproved"} onChange={() => setDecision("disapproved")} /> Disapproved
              </label>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]" htmlFor="lf-head-reason">
                {decision === "disapproved" ? "Disapproved due to (required)" : "Remarks (optional)"}
              </label>
              <input id="lf-head-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} className={input} />
            </div>
            <MySignature onChange={setHasSignature} />
            {error && <div className="text-xs text-[var(--status-critical)]">{error}</div>}
            <div className="flex justify-end">
              <button
                onClick={decide}
                disabled={busy || !decision || !hasSignature || (decision === "disapproved" && !reason.trim())}
                className="rounded-lg bg-[var(--series-1)] px-3 py-1.5 text-sm font-medium text-[var(--on-accent)] disabled:opacity-40"
              >
                {busy ? "Submitting…" : "Sign & submit to HR"}
              </button>
            </div>
          </div>
        )}

        {canReceive && (
          <div className="space-y-3 rounded-lg border border-[var(--border-hairline)] p-3">
            <div className="text-sm font-semibold text-[var(--text-primary)]">Receive (HR Manager)</div>
            <MySignature onChange={setHasSignature} />
            {error && <div className="text-xs text-[var(--status-critical)]">{error}</div>}
            <div className="flex justify-end">
              <button onClick={receive} disabled={busy || !hasSignature} className="rounded-lg bg-[var(--series-1)] px-3 py-1.5 text-sm font-medium text-[var(--on-accent)] disabled:opacity-40">
                {busy ? "Receiving…" : "Sign & receive"}
              </button>
            </div>
          </div>
        )}
      </div>
      {printing && (
        <PrintStack onDone={stopPrinting}>
          <PrintPage form>
            <LeaveFormDocument form={doc} signatures={sigs} />
          </PrintPage>
        </PrintStack>
      )}
    </Modal>
  );
}
