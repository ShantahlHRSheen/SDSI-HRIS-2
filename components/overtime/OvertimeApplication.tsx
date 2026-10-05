"use client";

import { companyStorageKey } from "@/lib/companies";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Printer } from "lucide-react";
import { useHris } from "@/lib/store";
import { Modal } from "@/components/Modal";
import { Badge } from "@/components/Badge";
import { todayInManila } from "@/lib/leave-policy";
import { otFinal, otProgress, otStage, scheduleLabel, type OvertimeForm } from "@/lib/overtime-form";
import { fetchMyLeaveFormDetails, type LeaveFormSigner } from "@/lib/supabase/leave-forms";
import {
  decideOvertimeForm,
  fetchOvertimeForms,
  hrDecideOvertimeForm,
  overtimeFormExists,
  overtimeFormSignatureUrls,
  resubmitOvertimeForm,
  signOvertimeForm,
  submitOvertimeForm,
  type OvertimeFormInput,
} from "@/lib/supabase/overtime-forms";
import { MySignature } from "@/components/leave/LeaveApplication";
import { OvertimeFormDocument, type OvertimeFormDocData } from "@/components/overtime/OvertimeFormDocument";
import { PrintPage, PrintStack } from "@/components/vouchers/PrintStack";
import { DownloadPdfButton, PdfPage } from "@/components/pdf/DownloadPdfButton";

// Every overtime form the user may see (real accounts only).
export function useOvertimeForms() {
  const { isRealAccount } = useHris();
  const [forms, setForms] = useState<OvertimeForm[]>([]);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(() => {
    if (!isRealAccount) return;
    fetchOvertimeForms().then(
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

export function OtProgress({ form }: { form: OvertimeForm }) {
  const p = otProgress(form);
  return <Badge tone={p.tone}>{p.label}</Badge>;
}

export function canHeadOt(form: OvertimeForm, me: string | undefined, isHrManager: boolean): boolean {
  if (!me || form.employeeId === me || otStage(form) !== "waiting_head") return false;
  return form.departmentHeadId ? form.departmentHeadId === me : isHrManager;
}

// The regular schedule last entered, remembered in this browser.
const SCHEDULE_KEY = "hris.otSchedule";
const rememberedSchedule = () => {
  try {
    return window.localStorage.getItem(companyStorageKey(SCHEDULE_KEY)) ?? "";
  } catch {
    return "";
  }
};

// ---- Filing / clarifying (employee) -------------------------------------------

// `returned`: a form HR returned for clarification — corrected and resubmitted.
export function OvertimeApplicationModal({ open, returned, onClose, onDone }: { open: boolean; returned?: OvertimeForm; onClose: () => void; onDone: () => void }) {
  const { currentEmployee, workSchedules, fileOvertimeRequest, reloadRequests } = useHris();
  const today = useMemo(() => todayInManila(), []);
  const [details, setDetails] = useState<{ designation: string; branch: string; department: string; departmentHead: string } | null>(null);
  useEffect(() => {
    if (open && !returned) fetchMyLeaveFormDetails().then(setDetails, () => setDetails(null));
  }, [open, returned]);
  const schedules = workSchedules.map(scheduleLabel);
  const [form, setForm] = useState<OvertimeFormInput>(() =>
    returned
      ? { schedule: returned.schedule, otDate: returned.otDate, hours: returned.hoursRequested, tasks: returned.tasks, reason: returned.reason }
      : { schedule: rememberedSchedule(), otDate: today, hours: 2, tasks: "", reason: "" },
  );
  const [hasSignature, setHasSignature] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filedId, setFiledId] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);
  const otherSchedule = form.schedule !== "" && !schedules.includes(form.schedule);
  const [typing, setTyping] = useState(otherSchedule);

  const missing = !form.schedule.trim()
    ? "Enter your regular working schedule."
    : !form.otDate
      ? "Enter the date of overtime."
      : !(form.hours > 0 && form.hours <= 24)
        ? "Enter the overtime hours (up to 24)."
        : !form.tasks.trim()
          ? "Enter the tasks to be done."
          : !form.reason.trim()
            ? "Enter why these tasks can't be done during your regular schedule."
            : !hasSignature
              ? "Upload your signature to sign the form."
              : null;

  async function submit() {
    if (!currentEmployee || missing) return;
    setBusy(true);
    setError(null);
    try {
      try {
        window.localStorage.setItem(companyStorageKey(SCHEDULE_KEY), form.schedule.trim());
      } catch {
        /* not remembered */
      }
      if (returned) {
        await signOvertimeForm(returned.overtimeRequestId, currentEmployee.id, "applicant");
        await resubmitOvertimeForm(returned.overtimeRequestId, form);
      } else {
        let id = filedId;
        if (!id) {
          id = await fileOvertimeRequest({ employeeId: currentEmployee.id, date: form.otDate, hours: form.hours, reason: form.reason.trim() });
          if (!id) throw new Error("Couldn't file the overtime request — please try again.");
          setFiledId(id);
        }
        // A retry after a dropped connection may find the form already in.
        const done = filedId ? await overtimeFormExists(id) : false;
        if (!done) await signOvertimeForm(id, currentEmployee.id, "applicant");
        if (!done) await submitOvertimeForm(id, currentEmployee.id, form);
      }
      await reloadRequests();
      onDone();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't submit the form.");
    } finally {
      setBusy(false);
    }
  }

  const doc: OvertimeFormDocData | null = currentEmployee
    ? {
        overtimeRequestId: "",
        employeeId: currentEmployee.id,
        schedule: form.schedule,
        otDate: form.otDate,
        hoursRequested: form.hours,
        tasks: form.tasks,
        reason: form.reason,
        employeeName: returned?.employeeName ?? `${currentEmployee.firstName} ${currentEmployee.lastName}`,
        position: returned?.position ?? details?.designation ?? "",
        branch: returned?.branch ?? details?.branch ?? "",
        department: returned?.department ?? details?.department ?? "",
        departmentHeadId: null,
        departmentHead: returned?.departmentHead ?? details?.departmentHead ?? "",
        submittedAt: null,
        resubmissions: 0,
        headDecision: null,
        headHours: null,
        headReason: null,
        headSignedName: null,
        headSignedAt: null,
        hrDecision: null,
        hrReason: null,
        hrSignedName: null,
        hrSignedAt: null,
      }
    : null;

  const input = "w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-2 text-sm";
  const lbl = "mb-1 block text-xs font-medium text-[var(--text-secondary)]";
  const ro = "rounded-lg bg-[var(--gridline)]/30 px-3 py-2 text-sm text-[var(--text-primary)]";

  return (
    <Modal open={open} onClose={onClose} title={returned ? "Overtime form — clarify & resubmit" : "Overtime Authorization Form"} wide>
      {preview && doc ? (
        <div>
          <div className="overflow-x-auto rounded-lg bg-white p-4">
            <div className="min-w-[560px]">
              <OvertimeFormDocument form={doc} />
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
          {returned && (
            <div className="rounded-lg border border-[var(--status-serious)]/50 px-3 py-2 text-sm text-[var(--text-primary)]">
              <span className="font-semibold">Returned by HR for clarification:</span> {returned.hrReason}
              <div className="mt-1 text-xs text-[var(--text-muted)]">Correct the form and sign it again — it goes back to your department head.</div>
            </div>
          )}
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

          <div>
            <label className={lbl} htmlFor="ot-schedule">
              Regular working schedule
            </label>
            {!typing ? (
              <select
                id="ot-schedule"
                value={schedules.includes(form.schedule) ? form.schedule : ""}
                onChange={(e) => (e.target.value === "__other" ? (setTyping(true), setForm((f) => ({ ...f, schedule: "" }))) : setForm((f) => ({ ...f, schedule: e.target.value })))}
                className={input}
              >
                <option value="">Choose your schedule…</option>
                {schedules.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
                <option value="__other">Other (type it)…</option>
              </select>
            ) : (
              <div className="flex gap-2">
                <input id="ot-schedule" value={form.schedule} onChange={(e) => setForm((f) => ({ ...f, schedule: e.target.value }))} maxLength={120} placeholder="e.g. 8:00 AM – 5:00 PM, Mon–Sat" className={input} />
                <button type="button" onClick={() => setTyping(false)} className="shrink-0 rounded-lg border border-[var(--border-hairline)] px-2 text-xs text-[var(--text-secondary)]">
                  List
                </button>
              </div>
            )}
          </div>

          <div className="text-xs font-semibold tracking-wide text-[var(--text-primary)] uppercase">Overtime details</div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl} htmlFor="ot-date">
                Date of overtime
              </label>
              <input id="ot-date" type="date" value={form.otDate} onChange={(e) => setForm((f) => ({ ...f, otDate: e.target.value }))} className={input} />
            </div>
            <div>
              <label className={lbl} htmlFor="ot-hours">
                Number of OT hours requested
              </label>
              <input id="ot-hours" type="number" min={0.5} max={24} step={0.5} value={form.hours} onChange={(e) => setForm((f) => ({ ...f, hours: Number(e.target.value) }))} className={input} />
            </div>
          </div>
          <div>
            <label className={lbl} htmlFor="ot-tasks">
              Tasks to be done
            </label>
            <textarea id="ot-tasks" value={form.tasks} onChange={(e) => setForm((f) => ({ ...f, tasks: e.target.value }))} rows={3} maxLength={1000} className={input} />
          </div>
          <div>
            <label className={lbl} htmlFor="ot-reason">
              Reason why these tasks can&rsquo;t be done during regular working schedule
            </label>
            <textarea id="ot-reason" value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} rows={3} maxLength={1000} className={input} />
          </div>

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
              {busy ? "Submitting…" : returned ? "Sign & resubmit" : "Sign & submit"}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

// ---- Viewing, approving, verifying ---------------------------------------------

// Render with key={form.overtimeRequestId} so each form starts afresh.
export function OvertimeFormModal({ form, onClose, onChanged, onClarify }: { form: OvertimeForm; onClose: () => void; onChanged: () => void; onClarify: () => void }) {
  const { currentEmployee, currentUser, reloadRequests } = useHris();
  const me = currentEmployee?.id;
  const isHr = !!currentUser?.roles.includes("hr_admin");
  const [sigs, setSigs] = useState<Partial<Record<LeaveFormSigner, string>>>({});
  const id = form.overtimeRequestId;
  const loadSigs = useCallback(() => {
    overtimeFormSignatureUrls(id).then(setSigs, () => setSigs({}));
  }, [id]);
  useEffect(() => loadSigs(), [loadSigs]);

  const stage = otStage(form);
  const canHead = canHeadOt(form, me, isHr);
  const canHr = isHr && stage === "waiting_hr" && form.employeeId !== me;
  const canClarify = stage === "returned" && form.employeeId === me;
  const [headDecision, setHeadDecision] = useState<"approved" | "disapproved" | null>(null);
  const [headHours, setHeadHours] = useState(form.hoursRequested);
  const [hrDecision, setHrDecision] = useState<"verified" | "disapproved" | "returned" | null>(null);
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
    me && headDecision
      ? run(async () => {
          await signOvertimeForm(id, me, "head");
          await decideOvertimeForm(id, headDecision, headDecision === "approved" ? headHours : null, reason);
        })
      : undefined;
  const hrDecide = () =>
    me && hrDecision
      ? run(async () => {
          await signOvertimeForm(id, me, "hr");
          await hrDecideOvertimeForm(id, hrDecision, reason);
        })
      : undefined;

  const input = "w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-2 text-sm";
  return (
    <Modal open onClose={onClose} title={`Overtime form — ${form.employeeName}`} wide>
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <OtProgress form={form} />
          {otFinal(form) && (
            <div className="ml-auto flex items-start gap-2">
              <button onClick={() => setPrinting(true)} className="flex items-center gap-1.5 rounded-lg border border-[var(--border-hairline)] px-3 py-1.5 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40">
                <Printer size={14} /> Print
              </button>
              <DownloadPdfButton filename={`Overtime-Form-${form.employeeName.replace(/[^A-Za-z0-9]+/g, "-")}-${form.otDate}.pdf`}>
                <PdfPage form>
                  <OvertimeFormDocument form={form} signatures={sigs} />
                </PdfPage>
              </DownloadPdfButton>
            </div>
          )}
          {canClarify && (
            <button onClick={onClarify} className="ml-auto rounded-lg bg-[var(--series-1)] px-3 py-1.5 text-sm font-medium text-[var(--on-accent)]">
              Clarify &amp; resubmit
            </button>
          )}
        </div>
        <div className="overflow-x-auto rounded-lg bg-white p-4">
          <div className="min-w-[560px]">
            <OvertimeFormDocument form={form} signatures={sigs} />
          </div>
        </div>
        {otFinal(form) && <div className="text-xs text-[var(--text-muted)]">Download opens the print window — choose &ldquo;Save as PDF&rdquo; to keep a copy.</div>}

        {canHead && (
          <div className="space-y-3 rounded-lg border border-[var(--border-hairline)] p-3">
            <div className="text-sm font-semibold text-[var(--text-primary)]">Department Head&rsquo;s approval</div>
            <div className="flex flex-wrap items-center gap-4 text-sm text-[var(--text-secondary)]">
              <label className="flex items-center gap-2">
                <input type="radio" name="ot-head" checked={headDecision === "approved"} onChange={() => setHeadDecision("approved")} /> Approved
              </label>
              {headDecision === "approved" && (
                <label className="flex items-center gap-2 text-xs">
                  Approved overtime hours
                  <input type="number" min={0.5} max={form.hoursRequested} step={0.5} value={headHours} onChange={(e) => setHeadHours(Number(e.target.value))} className="w-20 rounded-md border border-[var(--border-hairline)] bg-[var(--surface-1)] px-2 py-1 text-right text-sm" />
                  <span className="text-[var(--text-muted)]">of {form.hoursRequested} requested</span>
                </label>
              )}
              <label className="flex items-center gap-2">
                <input type="radio" name="ot-head" checked={headDecision === "disapproved"} onChange={() => setHeadDecision("disapproved")} /> Disapproved
              </label>
            </div>
            {headDecision === "disapproved" && (
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]" htmlFor="ot-head-reason">
                  Reason of disapproval
                </label>
                <input id="ot-head-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} className={input} />
              </div>
            )}
            <MySignature onChange={setHasSignature} />
            {error && <div className="text-xs text-[var(--status-critical)]">{error}</div>}
            <div className="flex justify-end">
              <button
                onClick={decide}
                disabled={busy || !headDecision || !hasSignature || (headDecision === "disapproved" && !reason.trim()) || (headDecision === "approved" && !(headHours > 0 && headHours <= form.hoursRequested))}
                className="rounded-lg bg-[var(--series-1)] px-3 py-1.5 text-sm font-medium text-[var(--on-accent)] disabled:opacity-40"
              >
                {busy ? "Submitting…" : headDecision === "disapproved" ? "Sign & disapprove" : "Sign & submit to HR"}
              </button>
            </div>
          </div>
        )}

        {canHr && (
          <div className="space-y-3 rounded-lg border border-[var(--border-hairline)] p-3">
            <div className="text-sm font-semibold text-[var(--text-primary)]">HR Department&rsquo;s receipt</div>
            <div className="flex flex-wrap gap-4 text-sm text-[var(--text-secondary)]">
              <label className="flex items-center gap-2">
                <input type="radio" name="ot-hr" checked={hrDecision === "verified"} onChange={() => setHrDecision("verified")} /> Verified
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" name="ot-hr" checked={hrDecision === "disapproved"} onChange={() => setHrDecision("disapproved")} /> Disapproved
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" name="ot-hr" checked={hrDecision === "returned"} onChange={() => setHrDecision("returned")} /> Returned for clarification
              </label>
            </div>
            {hrDecision === "verified" && <div className="text-xs text-[var(--text-muted)]">The {form.headHours}h approved by the department head will count in payroll.</div>}
            {(hrDecision === "disapproved" || hrDecision === "returned") && (
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]" htmlFor="ot-hr-reason">
                  Reason
                </label>
                <input id="ot-hr-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} className={input} />
              </div>
            )}
            <MySignature onChange={setHasSignature} />
            {error && <div className="text-xs text-[var(--status-critical)]">{error}</div>}
            <div className="flex justify-end">
              <button
                onClick={hrDecide}
                disabled={busy || !hrDecision || !hasSignature || (hrDecision !== "verified" && !reason.trim())}
                className="rounded-lg bg-[var(--series-1)] px-3 py-1.5 text-sm font-medium text-[var(--on-accent)] disabled:opacity-40"
              >
                {busy ? "Submitting…" : "Sign & submit"}
              </button>
            </div>
          </div>
        )}
      </div>
      {printing && (
        <PrintStack onDone={stopPrinting}>
          <PrintPage form>
            <OvertimeFormDocument form={form} signatures={sigs} />
          </PrintPage>
        </PrintStack>
      )}
    </Modal>
  );
}
