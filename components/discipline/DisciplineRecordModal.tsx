"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Download, ExternalLink, FileText, Gavel, Loader2, Paperclip, PenLine, Upload } from "lucide-react";
import { Modal } from "@/components/Modal";
import { Badge } from "@/components/Badge";
import { SignaturePad, type SignaturePadHandle } from "@/components/discipline/SignaturePad";
import { useHris } from "@/lib/store";
import { departmentName, formatDate, fullName, positionTitle } from "@/lib/helpers";
import { DISCIPLINARY_LABELS, type DisciplinaryRecord, type Employee } from "@/lib/types";
import { DISCIPLINE_TYPE_TONE, responseBadge } from "@/lib/discipline";
import { todayInManila } from "@/lib/leave-policy";
import { buildDisciplineResponsePdf, manilaDateTime } from "@/lib/discipline-pdf";
import { disciplineFileUrl, downloadDisciplineFile } from "@/lib/supabase/discipline-files";
import { buildSignedNotice } from "@/lib/discipline-notice";
import { SanctionForm } from "@/components/discipline/SanctionForm";

// mode: "manage" — HR / department head (attach notice, download responses)
//       "view"   — Upper Management (read-only, can download)
//       "employee" — the employee the record is addressed to (acknowledge, explain)
//       "manager" — the Department Manager who signs it (phase 51)
export type DisciplineModalMode = "manage" | "view" | "employee" | "manager";

const btn =
  "flex items-center gap-1.5 rounded-lg border border-[var(--border-hairline)] px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40 disabled:opacity-40";
const primary = "flex items-center justify-center gap-1.5 rounded-lg bg-[var(--series-1)] px-3 py-2 text-sm font-medium text-[var(--on-accent)] disabled:opacity-40";
const section = "rounded-lg border border-[var(--border-hairline)] p-4";

const safeName = (s: string) =>
  s
    .replace(/[^\w.-]+/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 80);

async function openFile(path: string, downloadName?: string) {
  // Open the tab first (popup blockers), then point it at the signed link.
  const tab = downloadName ? null : window.open("", "_blank");
  try {
    const url = await disciplineFileUrl(path, downloadName);
    if (tab) tab.location.href = url;
    else window.location.href = url;
  } catch (err) {
    tab?.close();
    alert(err instanceof Error ? err.message : "Couldn't open the file.");
  }
}

export function DisciplineRecordModal({
  record,
  employees,
  mode,
  onClose,
}: {
  record: DisciplinaryRecord | null;
  employees: Employee[];
  mode: DisciplineModalMode;
  onClose: () => void;
}) {
  return (
    <Modal open={!!record} onClose={onClose} title={record ? DISCIPLINARY_LABELS[record.type] : ""} wide>
      {record && <Body key={record.id} record={record} employees={employees} mode={mode} />}
    </Modal>
  );
}

function Body({ record, employees, mode }: { record: DisciplinaryRecord; employees: Employee[]; mode: DisciplineModalMode }) {
  const { attachDisciplinaryNotice, acknowledgeDisciplinaryRecord, submitDisciplinaryExplanation, signDisciplinaryRecord, receiveDisciplinaryExplanation, disciplinaryRecords, currentUser, currentEmployee } = useHris();
  const isHrManager = !!currentUser?.roles.includes("hr_admin");
  const managerName = (() => {
    const m = employees.find((e) => e.id === r.managerId);
    return m ? fullName(m) : "";
  })();
  // Always show the freshest copy of the record from the store.
  const r = disciplinaryRecords.find((d) => d.id === record.id) ?? record;
  const emp = employees.find((e) => e.id === r.employeeId);
  const issuer = employees.find((e) => e.id === r.issuedBy);
  const today = todayInManila();
  const badge = responseBadge(r, today, mode === "employee");

  const [signatureUrl, setSignatureUrl] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    if (r.ackSignaturePath)
      disciplineFileUrl(r.ackSignaturePath).then(
        (u) => live && setSignatureUrl(u),
        () => {},
      );
    return () => {
      live = false;
    };
  }, [r.ackSignaturePath]);

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const noticeInput = useRef<HTMLInputElement>(null);

  async function uploadNotice(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy("notice");
    setError(await attachDisciplinaryNotice(r.id, file));
    setBusy(null);
  }

  // A generated notice, printed with the signatures it has so far.
  async function openSigned() {
    setBusy("signed");
    setError(null);
    try {
      const bytes = await buildSignedNotice(r, employees);
      if (bytes) {
        const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
        window.open(url, "_blank");
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't build the notice.");
    }
    setBusy(null);
  }

  async function downloadAll() {
    if (!emp) return;
    setBusy("pdf");
    setError(null);
    try {
      const get = (p: string | null | undefined) => (p ? downloadDisciplineFile(p) : Promise.resolve(null));
      const signed = r.noticeData ? await buildSignedNotice(r, employees) : null;
      const [notice, signature, explanationFile, hrRecv, mgrRecv] = await Promise.all([
        signed ? Promise.resolve(new Blob([signed as BlobPart], { type: "application/pdf" })) : get(r.noticePath),
        get(r.ackSignaturePath),
        get(r.explanationFilePath),
        get(r.explHrSignaturePath),
        get(r.explMgrSignaturePath),
      ]);
      const hrReceiver = employees.find((e) => e.id === r.explHrReceiverId);
      const receipts = [
        ...(r.explHrReceivedAt ? [{ label: "HR Manager", name: hrReceiver ? fullName(hrReceiver) : "", at: r.explHrReceivedAt, signature: hrRecv }] : []),
        ...(r.explMgrReceivedAt ? [{ label: "Department Manager", name: managerName, at: r.explMgrReceivedAt, signature: mgrRecv }] : []),
      ];
      const bytes = await buildDisciplineResponsePdf({
        record: r,
        employeeName: fullName(emp),
        employeeNumber: emp.employeeNumber,
        position: positionTitle(emp.positionId),
        department: departmentName(emp.departmentId),
        issuedByName: issuer ? fullName(issuer) : r.issuedBy,
        notice,
        signature,
        explanationFile,
        receipts,
      });
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = safeName(`${DISCIPLINARY_LABELS[r.type]} ${fullName(emp)} ${r.date}`) + ".pdf";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't build the PDF.");
    }
    setBusy(null);
  }

  const canReplaceNotice = mode === "manage" && !r.acknowledgedAt;

  return (
    <div className="space-y-4 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-base font-semibold text-[var(--text-primary)]">{emp ? fullName(emp) : r.employeeId}</div>
          <div className="text-xs text-[var(--text-muted)]">{emp ? `${emp.employeeNumber} · ${positionTitle(emp.positionId)} · ${departmentName(emp.departmentId)}` : ""}</div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone={DISCIPLINE_TYPE_TONE[r.type]}>{DISCIPLINARY_LABELS[r.type]}</Badge>
          <Badge tone={badge.tone}>{badge.label}</Badge>
          {r.status === "resolved" && <Badge tone="good">Resolved</Badge>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-3">
        <div>
          <span className="text-[var(--text-muted)]">Date issued: </span>
          <span className="text-[var(--text-primary)]">{formatDate(r.date)}</span>
        </div>
        <div>
          <span className="text-[var(--text-muted)]">Issued by: </span>
          <span className="text-[var(--text-primary)]">{issuer ? fullName(issuer) : "—"}</span>
        </div>
        {r.requiresExplanation && (
          <div>
            <span className="text-[var(--text-muted)]">Explanation due: </span>
            <span
              className={`text-[var(--text-primary)] ${r.responseDue && r.responseDue < today && !r.explanationSubmittedAt ? "font-semibold text-[var(--status-critical)]" : ""}`}
            >
              {r.responseDue ? formatDate(r.responseDue) : "—"}
            </span>
          </div>
        )}
      </div>

      <div className="whitespace-pre-wrap text-[var(--text-secondary)]">{r.description}</div>

      {/* Notice file */}
      <div className={section}>
        <div className="mb-2 flex items-center gap-2 font-medium text-[var(--text-primary)]">
          <FileText size={16} /> Notice
        </div>
        {r.noticeData && (
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <button onClick={openSigned} disabled={busy !== null} className={btn}>
              {busy === "signed" ? <Loader2 size={14} className="animate-spin" /> : <ExternalLink size={14} />} Open the notice{r.hrSignedAt ? " (with signatures)" : ""}
            </button>
          </div>
        )}
        {r.noticePath && r.noticeData ? (
          <div className="text-xs text-[var(--text-muted)]">Unsigned copy as issued: {r.noticeFileName ?? "notice.pdf"}</div>
        ) : r.noticePath ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-1 text-[var(--text-secondary)]">{r.noticeFileName ?? "notice.pdf"}</span>
            <button onClick={() => openFile(r.noticePath!)} className={btn}>
              <ExternalLink size={14} /> Open
            </button>
            <button onClick={() => openFile(r.noticePath!, r.noticeFileName ?? "notice.pdf")} className={btn}>
              <Download size={14} /> Download
            </button>
            {canReplaceNotice && (
              <button onClick={() => noticeInput.current?.click()} disabled={busy !== null} className={btn}>
                <Upload size={14} /> {busy === "notice" ? "Uploading…" : "Replace PDF"}
              </button>
            )}
          </div>
        ) : mode === "manage" ? (
          <button onClick={() => noticeInput.current?.click()} disabled={busy !== null} className={btn}>
            <Upload size={14} /> {busy === "notice" ? "Uploading…" : "Attach the notice (PDF)"}
          </button>
        ) : (
          <div className="text-[var(--text-muted)]">No file attached — see the details above.</div>
        )}
        {mode === "manage" && r.acknowledgedAt && (
          <div className="mt-2 text-xs text-[var(--text-muted)]">The employee has acknowledged this notice, so its file can no longer be replaced.</div>
        )}
        <input ref={noticeInput} type="file" accept="application/pdf,.pdf" className="hidden" onChange={uploadNotice} />
      </div>

      {/* HR Manager → Department Manager signatures */}
      {r.signFlow && (
        <div className={section}>
          <div className="mb-2 flex items-center gap-2 font-medium text-[var(--text-primary)]">
            <PenLine size={16} /> Signatures
          </div>
          <SignStep
            title="HR Manager"
            signedAt={r.hrSignedAt}
            signerName={(() => {
              const s = employees.find((e) => e.id === r.hrSignerId);
              return s ? fullName(s) : undefined;
            })()}
            canSign={!r.hrSignedAt && !!currentUser?.roles.includes("hr_admin")}
            waiting="Waiting for the HR Manager to sign."
            onSign={async (png) => setError(await signDisciplinaryRecord(r.id, "hr", png))}
          />
          <div className="my-3 border-t border-[var(--gridline)]" />
          <SignStep
            title={`Department Manager${(() => {
              const m = employees.find((e) => e.id === r.managerId);
              return m ? ` — ${fullName(m)}` : "";
            })()}`}
            signedAt={r.managerSignedAt}
            canSign={!!r.hrSignedAt && !r.managerSignedAt && !!r.managerId && r.managerId === currentEmployee?.id}
            waiting={r.hrSignedAt ? "Waiting for the Department Manager to sign." : "Signs after the HR Manager."}
            onSign={async (png) => setError(await signDisciplinaryRecord(r.id, "manager", png))}
          />
          {!r.managerSignedAt && <div className="mt-3 text-xs text-[var(--text-muted)]">The employee receives this notice once both have signed.</div>}
        </div>
      )}

      {/* Acknowledgement */}
      <div className={section}>
        <div className="mb-2 flex items-center gap-2 font-medium text-[var(--text-primary)]">
          <PenLine size={16} /> Acknowledgement of receipt
        </div>
        {r.acknowledgedAt ? (
          <div>
            {signatureUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={signatureUrl} alt="Employee signature" className="mb-1 max-h-20 rounded bg-white p-1" />
            )}
            <div className="text-[var(--text-primary)]">{emp ? fullName(emp) : ""}</div>
            <div className="text-xs text-[var(--text-muted)]">Acknowledged on {manilaDateTime(r.acknowledgedAt)}</div>
          </div>
        ) : mode === "employee" ? (
          <AcknowledgeForm record={r} onDone={(err) => setError(err)} submit={acknowledgeDisciplinaryRecord} />
        ) : (
          <div className="text-[var(--text-muted)]">Waiting for the employee to open and sign for this notice.</div>
        )}
      </div>

      {/* Written explanation */}
      {(r.requiresExplanation || r.explanationSubmittedAt) && (
        <div className={section}>
          <div className="mb-2 flex items-center gap-2 font-medium text-[var(--text-primary)]">
            <Paperclip size={16} /> Written explanation
          </div>
          {r.explanationSubmittedAt ? (
            <div className="space-y-2">
              <div className="text-xs text-[var(--text-muted)]">Submitted on {manilaDateTime(r.explanationSubmittedAt)}</div>
              {r.explanation && <div className="rounded-md bg-[var(--gridline)]/30 p-3 whitespace-pre-wrap text-[var(--text-primary)]">{r.explanation}</div>}
              {r.explanationFilePath && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="mr-1 text-[var(--text-secondary)]">{r.explanationFileName ?? "explanation"}</span>
                  <button onClick={() => openFile(r.explanationFilePath!)} className={btn}>
                    <ExternalLink size={14} /> Open
                  </button>
                  <button onClick={() => openFile(r.explanationFilePath!, r.explanationFileName ?? "explanation")} className={btn}>
                    <Download size={14} /> Download
                  </button>
                </div>
              )}
              {/* Received by the HR Manager and the Department Manager (either order). */}
              {mode !== "employee" && (
                <div className="mt-3 space-y-3 border-t border-[var(--gridline)] pt-3">
                  <SignStep
                    title="Received by the HR Manager"
                    signedAt={r.explHrReceivedAt}
                    signerName={(() => {
                      const s = employees.find((e) => e.id === r.explHrReceiverId);
                      return s ? fullName(s) : undefined;
                    })()}
                    canSign={!r.explHrReceivedAt && isHrManager}
                    hint="Read the explanation above, then sign to receive it."
                    action="Sign as received"
                    waiting="Not yet received by the HR Manager."
                    onSign={async (png) => setError(await receiveDisciplinaryExplanation(r.id, "hr", png))}
                  />
                  {r.managerId && (
                    <SignStep
                      title={`Received by the Department Manager${managerName ? ` — ${managerName}` : ""}`}
                      signedAt={r.explMgrReceivedAt}
                      canSign={!r.explMgrReceivedAt && r.managerId === currentEmployee?.id}
                      hint="Read the explanation above, then sign to receive it."
                      action="Sign as received"
                      waiting="Not yet received by the Department Manager."
                      onSign={async (png) => setError(await receiveDisciplinaryExplanation(r.id, "manager", png))}
                    />
                  )}
                </div>
              )}
            </div>
          ) : mode === "employee" ? (
            r.acknowledgedAt ? (
              <ExplanationForm record={r} onDone={(err) => setError(err)} submit={submitDisciplinaryExplanation} />
            ) : (
              <div className="text-[var(--text-muted)]">Acknowledge receipt above first, then you can submit your explanation here.</div>
            )
          ) : (
            <div className="text-[var(--text-muted)]">Not submitted yet{r.responseDue ? ` — due ${formatDate(r.responseDue)}` : ""}.</div>
          )}
        </div>
      )}

      {/* Notice of Sanction (tardiness NTEs): HR decides once both have received the explanation. */}
      {r.noticeData?.kind === "tardiness" && mode !== "employee" && (() => {
        const nos = disciplinaryRecords.find((x) => x.noticeData?.kind === "sanction" && x.noticeData.nteId === r.id);
        const ready = !!r.explHrReceivedAt && !!r.explMgrReceivedAt;
        return (
          <div className={section}>
            <div className="mb-2 flex items-center gap-2 font-medium text-[var(--text-primary)]">
              <Gavel size={16} /> Notice of Sanction
            </div>
            {nos ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[var(--text-secondary)]">
                  Issued {formatDate(nos.date)} — {nos.noticeData?.kind === "sanction" ? nos.noticeData.sanction : ""}
                  {nos.acknowledgedAt ? ` · received by the employee ${manilaDateTime(nos.acknowledgedAt)}` : " · waiting for the employee to sign as received"}
                </span>
                <button
                  onClick={async () => {
                    const bytes = await buildSignedNotice(nos, employees);
                    if (bytes) window.open(URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" })), "_blank");
                  }}
                  className={btn}
                >
                  <ExternalLink size={14} /> Open
                </button>
              </div>
            ) : !ready ? (
              <div className="text-[var(--text-muted)]">Available once the HR Manager and the Department Manager have received the employee&rsquo;s written explanation.</div>
            ) : mode === "manage" && isHrManager ? (
              <SanctionForm nte={r} onIssued={() => setError(null)} />
            ) : (
              <div className="text-[var(--text-muted)]">Waiting for HR to issue the Notice of Sanction.</div>
            )}
          </div>
        );
      })()}

      {error && <div className="rounded-lg bg-[var(--status-critical)]/10 p-3 text-sm text-[var(--status-critical)]">{error}</div>}

      {mode !== "employee" && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border-hairline)] pt-3">
          <div className="text-xs text-[var(--text-muted)]">One PDF with the notice, the signed acknowledgement and the written explanation.</div>
          <button onClick={downloadAll} disabled={busy !== null || !emp} className={primary}>
            {busy === "pdf" ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />} Download complete file (PDF)
          </button>
        </div>
      )}
    </div>
  );
}

function SignStep({
  title,
  signedAt,
  signerName,
  canSign,
  waiting,
  onSign,
  hint = "Open the notice above, then sign below.",
  action = "Sign the notice",
}: {
  title: string;
  signedAt?: string | null;
  signerName?: string;
  canSign: boolean;
  waiting: string;
  onSign: (png: Blob) => Promise<void>;
  hint?: string;
  action?: string;
}) {
  const pad = useRef<SignaturePadHandle>(null);
  const [hasInk, setHasInk] = useState(false);
  const [saving, setSaving] = useState(false);
  return (
    <div>
      <div className="text-xs font-medium text-[var(--text-secondary)]">{title}</div>
      {signedAt ? (
        <div className="mt-1 flex items-center gap-1.5 text-[var(--status-good)]">
          <Check size={14} /> Signed{signerName ? ` by ${signerName}` : ""} on {manilaDateTime(signedAt)}
        </div>
      ) : canSign ? (
        <div className="mt-2 space-y-2">
          <p className="text-xs text-[var(--text-secondary)]">{hint}</p>
          <SignaturePad ref={pad} onChange={setHasInk} />
          <button
            onClick={async () => {
              const png = await pad.current?.toPng();
              if (!png) return;
              setSaving(true);
              await onSign(png);
              setSaving(false);
            }}
            disabled={!hasInk || saving}
            className={primary}
          >
            {saving ? <Loader2 size={15} className="animate-spin" /> : <PenLine size={15} />} {action}
          </button>
        </div>
      ) : (
        <div className="mt-1 text-[var(--text-muted)]">{waiting}</div>
      )}
    </div>
  );
}

function AcknowledgeForm({
  record,
  submit,
  onDone,
}: {
  record: DisciplinaryRecord;
  submit: (id: string, png: Blob) => Promise<string | null>;
  onDone: (err: string | null) => void;
}) {
  const pad = useRef<SignaturePadHandle>(null);
  const [hasInk, setHasInk] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [saving, setSaving] = useState(false);

  async function go() {
    const png = await pad.current?.toPng();
    if (!png) {
      onDone("Please sign in the box first.");
      return;
    }
    setSaving(true);
    onDone(await submit(record.id, png));
    setSaving(false);
  }

  return (
    <div className="space-y-3">
      {record.noticePath && <p className="text-xs text-[var(--text-secondary)]">Please open and read the notice above before signing.</p>}
      <SignaturePad ref={pad} onChange={setHasInk} />
      <label className="flex items-start gap-2 text-xs text-[var(--text-secondary)]">
        <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5" />
        <span>
          I acknowledge that I have received this {DISCIPLINARY_LABELS[record.type]}. I understand that signing confirms <strong>receipt only</strong> and does not mean I agree
          with its contents.
        </span>
      </label>
      <button onClick={go} disabled={!hasInk || !agreed || saving} className={primary}>
        {saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Acknowledge receipt
      </button>
    </div>
  );
}

function ExplanationForm({
  record,
  submit,
  onDone,
}: {
  record: DisciplinaryRecord;
  submit: (id: string, text: string, file: File | null) => Promise<string | null>;
  onDone: (err: string | null) => void;
}) {
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const ready = text.trim().length > 0 || !!file;

  async function go() {
    setSaving(true);
    onDone(await submit(record.id, text, file));
    setSaving(false);
    setConfirming(false);
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-[var(--text-secondary)]">
        Write your explanation below, and/or attach a PDF or photo of a handwritten letter.
        {record.responseDue && (
          <>
            {" "}
            Please submit by <strong>{formatDate(record.responseDue)}</strong>.
          </>
        )}
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={8}
        maxLength={20000}
        placeholder="Your written explanation…"
        className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-2 text-sm"
        aria-label="Written explanation"
      />
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => fileInput.current?.click()} className={btn}>
          <Paperclip size={14} /> {file ? "Change file" : "Attach PDF or photo"}
        </button>
        {file && (
          <span className="text-xs text-[var(--text-secondary)]">
            {file.name}{" "}
            <button type="button" onClick={() => setFile(null)} className="ml-1 text-[var(--status-critical)] underline">
              remove
            </button>
          </span>
        )}
        <input
          ref={fileInput}
          type="file"
          accept="application/pdf,.pdf,image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            e.target.value = "";
          }}
        />
      </div>
      {confirming ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--status-warning)]/40 bg-[var(--status-warning)]/10 p-3">
          <span className="text-xs text-[var(--text-primary)]">Once submitted, your explanation can&rsquo;t be changed. Submit now?</span>
          <button onClick={go} disabled={saving} className={primary}>
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Yes, submit
          </button>
          <button onClick={() => setConfirming(false)} disabled={saving} className={btn}>
            Keep editing
          </button>
        </div>
      ) : (
        <button onClick={() => setConfirming(true)} disabled={!ready} className={primary}>
          Submit explanation
        </button>
      )}
    </div>
  );
}
