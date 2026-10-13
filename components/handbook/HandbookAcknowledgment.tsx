"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Clock, FileSignature, Printer, Search, Trash2 } from "lucide-react";
import { useHris } from "@/lib/store";
import { Modal } from "@/components/Modal";
import { MySignature } from "@/components/leave/LeaveApplication";
import { HandbookAckDocument, manilaDateTime } from "@/components/handbook/HandbookAckDocument";
import { PrintPage, PrintStack } from "@/components/vouchers/PrintStack";
import { DownloadPdfButton, PdfPage } from "@/components/pdf/DownloadPdfButton";
import { branchName, departmentName, fullName, positionTitle } from "@/lib/helpers";
import { currentCompany } from "@/lib/companies";
import {
  deleteHandbookAck,
  fetchFirstDownloads,
  fetchHandbookAcks,
  handbookAckSignatures,
  receiveHandbookAck,
  saveHandbookInfo,
  submitHandbookAck,
  type HandbookAck,
  type HandbookInfo,
  type HandbookLanguage,
} from "@/lib/supabase/handbook-acks";
import type { CompanyDocument } from "@/lib/supabase/company-documents";

// The Employee Handbook Acknowledgment Form on the Employee Handbook page:
// - every employee opens / downloads the handbook (recorded), then fills in
//   and signs the form for the current version;
// - the HR Manager sets the version and effective date, and verifies and
//   signs each form as received;
// - HR and upper management see who has signed, and can download each
//   employee's handbook with their signed form.

const button = "flex items-center gap-1.5 rounded-lg border border-[var(--border-hairline)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40 disabled:opacity-40";
const primary = "flex items-center gap-1.5 rounded-lg bg-[var(--series-1)] px-3 py-1.5 text-xs font-medium text-[var(--on-accent)] disabled:opacity-40";
const fileSafe = (s: string) => s.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "");

export function useHandbookAcks(enabled: boolean) {
  const [acks, setAcks] = useState<HandbookAck[]>([]);
  const [downloads, setDownloads] = useState<Map<string, string>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(() => {
    if (!enabled) return;
    Promise.all([fetchHandbookAcks(), fetchFirstDownloads()]).then(
      ([a, d]) => {
        setAcks(a);
        setDownloads(d);
        setError(null);
      },
      (e: Error) => setError(e.message),
    );
  }, [enabled]);
  useEffect(() => reload(), [reload]);
  return { acks, downloads, error, reload };
}

// ---- Version and effective date (HR Manager) -------------------------------------

export function HandbookInfoEditor({ info, onSaved }: { info: HandbookInfo; onSaved: () => void }) {
  const { currentEmployee } = useHris();
  const [version, setVersion] = useState(info.version);
  const [effective, setEffective] = useState(info.effectiveDate ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const changed = version.trim() !== info.version || (effective || null) !== info.effectiveDate;

  async function save() {
    if (!currentEmployee) return;
    setBusy(true);
    setMsg(null);
    try {
      await saveHandbookInfo({ version, effectiveDate: effective || null }, currentEmployee.id);
      setMsg("Saved.");
      onSaved();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Couldn't save.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-end gap-2 text-xs">
      <label className="flex flex-col gap-1 text-[var(--text-muted)]">
        Handbook version
        <input value={version} onChange={(e) => setVersion(e.target.value)} maxLength={40} placeholder="e.g. 2026-1" className="w-28 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-2 py-1.5 text-[var(--text-primary)]" />
      </label>
      <label className="flex flex-col gap-1 text-[var(--text-muted)]">
        Effective date
        <input type="date" value={effective} onChange={(e) => setEffective(e.target.value)} className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-2 py-1.5 text-[var(--text-primary)]" />
      </label>
      <button onClick={save} disabled={busy || !changed} className={button}>
        {busy ? "Saving…" : "Save"}
      </button>
      {msg && <span className="text-[var(--text-muted)]">{msg}</span>}
      <div className="basis-full text-[11px] text-[var(--text-muted)]">Changing the version asks everyone to download the handbook and sign a new acknowledgment.</div>
    </div>
  );
}

// ---- The employee's own form --------------------------------------------------------

export function MyHandbookAck({ info, acks, downloads, doc, onChanged }: { info: HandbookInfo; acks: HandbookAck[]; downloads: Map<string, string>; doc: CompanyDocument | null; onChanged: () => void }) {
  const { currentEmployee } = useHris();
  const [filling, setFilling] = useState(false);
  const [viewing, setViewing] = useState<HandbookAck | null>(null);
  if (!currentEmployee) return null;
  const mine = acks.filter((a) => a.employeeId === currentEmployee.id);
  const current = mine.find((a) => a.handbookVersion === info.version);
  const firstDownload = downloads.get(`${currentEmployee.id}|${info.version}`) ?? null;

  return (
    <div className="mb-4 rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-1)] p-4">
      <div className="flex flex-wrap items-center gap-3">
        <FileSignature size={18} className="text-[var(--series-1)]" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-[var(--text-primary)]">Handbook Acknowledgment Form{info.version && ` — version ${info.version}`}</div>
          <div className="text-xs text-[var(--text-secondary)]">
            {current
              ? `Signed ${manilaDateTime(current.signedAt)}${current.receivedAt ? " · received by HR" : " · waiting for HR to receive it"}`
              : firstDownload
                ? "Please read the handbook, then fill out and sign the acknowledgment form."
                : "First open or download the handbook (the buttons above), read it, then sign the acknowledgment form here."}
          </div>
        </div>
        {current ? (
          <button onClick={() => setViewing(current)} className={button}>
            View / Download my form
          </button>
        ) : (
          <button onClick={() => setFilling(true)} disabled={!firstDownload} className={primary}>
            <FileSignature size={14} /> Fill out & sign
          </button>
        )}
      </div>
      {mine.filter((a) => a !== current).length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2 text-xs text-[var(--text-muted)]">
          Earlier versions:
          {mine
            .filter((a) => a !== current)
            .map((a) => (
              <button key={a.id} onClick={() => setViewing(a)} className="text-[var(--series-1)] underline">
                {a.handbookVersion || "(no version)"}
              </button>
            ))}
        </div>
      )}
      {filling && firstDownload && (
        <FillModal
          info={info}
          accessedAt={firstDownload}
          onClose={() => setFilling(false)}
          onDone={() => {
            setFilling(false);
            onChanged();
          }}
        />
      )}
      {viewing && <AckModal ack={viewing} doc={viewing.handbookVersion === info.version ? doc : null} onClose={() => setViewing(null)} onChanged={onChanged} />}
    </div>
  );
}

function FillModal({ info, accessedAt, onClose, onDone }: { info: HandbookInfo; accessedAt: string; onClose: () => void; onDone: () => void }) {
  const { currentEmployee } = useHris();
  const [language, setLanguage] = useState<HandbookLanguage>("english");
  const [explained, setExplained] = useState("");
  const [hasSignature, setHasSignature] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!currentEmployee) return null;
  const e = currentEmployee;
  const dept = departmentName(e.departmentId);
  const br = branchName(e.branchId);
  const draft: HandbookAck = {
    id: "draft",
    employeeId: e.id,
    handbookVersion: info.version,
    handbookEffective: info.effectiveDate,
    language,
    explainedLanguage: language === "explained" ? explained : "",
    employeeName: `${e.firstName} ${e.lastName}`,
    employeeNumber: e.employeeNumber,
    position: positionTitle(e.positionId),
    departmentBranch: [dept, br].filter((x) => x && x !== "—").join(" / "),
    accessedAt,
    signedAt: new Date().toISOString(),
    hrVerified: null,
    hrLogRef: null,
    receivedName: null,
    receivedPosition: null,
    receivedAt: null,
  };
  const missing = language === "explained" && !explained.trim() ? "Enter the language the handbook was explained to you in." : !hasSignature ? "Upload your signature to sign the form." : null;

  async function submit() {
    if (missing) return;
    setBusy(true);
    setError(null);
    try {
      await submitHandbookAck(e.id, language, explained);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't submit the form.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Employee Handbook Acknowledgment Form" wide>
      <div className="space-y-3">
        <div className="rounded-lg border border-[var(--border-hairline)] p-3 text-sm">
          <div className="mb-2 text-xs font-medium text-[var(--text-secondary)]">4. Language (check one)</div>
          <label className="flex items-start gap-2 text-[var(--text-primary)]">
            <input type="radio" checked={language === "english"} onChange={() => setLanguage("english")} className="mt-1" />I read and understand English, the language in which the Handbook is written.
          </label>
          <label className="mt-2 flex items-start gap-2 text-[var(--text-primary)]">
            <input type="radio" checked={language === "explained"} onChange={() => setLanguage("explained")} className="mt-1" />
            <span>
              The contents of the Handbook were explained to me by Human Resources in{" "}
              <input
                value={explained}
                onChange={(ev) => {
                  setExplained(ev.target.value);
                  setLanguage("explained");
                }}
                maxLength={60}
                placeholder="e.g. Tagalog"
                className="w-32 rounded-md border border-[var(--border-hairline)] bg-[var(--surface-1)] px-2 py-0.5 text-sm"
              />
              , a language I understand.
            </span>
          </label>
        </div>
        <MySignature onChange={setHasSignature} />
        <div className="text-xs text-[var(--text-muted)]">Please read the whole form below. Your name, ID no., position, department and the date you downloaded the handbook are filled in from the HRIS.</div>
        <div className="max-h-[50vh] overflow-auto rounded-lg bg-white p-4">
          <div className="min-w-[560px]">
            <HandbookAckDocument ack={draft} />
          </div>
        </div>
        {error && <div className="text-sm text-[var(--status-critical)]">{error}</div>}
        <div className="flex flex-wrap items-center justify-end gap-2">
          {missing && <span className="mr-auto text-xs text-[var(--text-muted)]">{missing}</span>}
          <button onClick={onClose} className={button}>
            Cancel
          </button>
          <button onClick={submit} disabled={!!missing || busy} className={primary}>
            <FileSignature size={14} /> {busy ? "Signing…" : "Sign & submit"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ---- One form: view, print, download (with the handbook), HR receive ------------------

function AckModal({ ack, doc, onClose, onChanged }: { ack: HandbookAck; doc: CompanyDocument | null; onClose: () => void; onChanged: () => void }) {
  const { currentUser, currentEmployee } = useHris();
  const isHr = !!currentUser?.roles.includes("hr_admin");
  const [sigs, setSigs] = useState<{ employee?: string; hr?: string }>({});
  const [printing, setPrinting] = useState(false);
  const stopPrinting = useCallback(() => setPrinting(false), []);
  const [verified, setVerified] = useState<boolean | null>(true);
  const [logRef, setLogRef] = useState(ack.accessedAt ? `HRIS download ${manilaDateTime(ack.accessedAt)}` : "");
  const [hasSignature, setHasSignature] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadSigs = useCallback(() => {
    handbookAckSignatures(ack).then(setSigs, () => setSigs({}));
  }, [ack]);
  useEffect(() => loadSigs(), [loadSigs]);

  const base = `${currentCompany().shortName}-Handbook-Acknowledgment-${fileSafe(ack.employeeName)}${ack.handbookVersion ? `-v${fileSafe(ack.handbookVersion)}` : ""}`;
  const pages = (
    <>
      <PdfPage form>
        <HandbookAckDocument ack={ack} signatures={sigs} page={1} />
      </PdfPage>
      <PdfPage form>
        <HandbookAckDocument ack={ack} signatures={sigs} page={2} />
      </PdfPage>
    </>
  );
  const handbookBytes = useMemo(
    () =>
      doc
        ? async () => {
            const res = await fetch(doc.url);
            if (!res.ok) throw new Error("Couldn't download the handbook.");
            return res.arrayBuffer();
          }
        : undefined,
    [doc],
  );

  async function receive() {
    if (!currentEmployee || verified === null) return;
    setBusy(true);
    setError(null);
    try {
      await receiveHandbookAck(ack, currentEmployee.id, verified, logRef);
      onChanged();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't receive the form.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm(`Remove ${ack.employeeName}'s signed acknowledgment? They will need to sign it again.`)) return;
    setBusy(true);
    setError(null);
    try {
      await deleteHandbookAck(ack.id);
      onChanged();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't remove the form.");
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={`Handbook acknowledgment — ${ack.employeeName}`} wide>
      <div className="space-y-3">
        <div className="flex flex-wrap items-start justify-end gap-2">
          {isHr && (
            <button onClick={remove} disabled={busy} className={`${button} mr-auto`}>
              <Trash2 size={14} /> Remove
            </button>
          )}
          <button onClick={() => setPrinting(true)} className={button}>
            <Printer size={14} /> Print
          </button>
          <DownloadPdfButton filename={`${base}.pdf`} label="Download form" className={button}>
            {pages}
          </DownloadPdfButton>
          {handbookBytes && (
            <DownloadPdfButton filename={`${currentCompany().shortName}-Employee-Handbook-with-Acknowledgment-${fileSafe(ack.employeeName)}.pdf`} label="Download handbook + signed form" prependPdf={handbookBytes}>
              {pages}
            </DownloadPdfButton>
          )}
        </div>
        <div className="overflow-x-auto rounded-lg bg-white p-4">
          <div className="min-w-[560px]">
            <HandbookAckDocument ack={ack} signatures={sigs} />
          </div>
        </div>
        {isHr && !ack.receivedAt && (
          <div className="space-y-2 rounded-lg border border-[var(--border-hairline)] p-3 text-sm">
            <div className="text-xs font-medium text-[var(--text-secondary)]">For Human Resources use</div>
            <div className="text-xs text-[var(--text-muted)]">
              HRIS record: first opened / downloaded {ack.accessedAt ? manilaDateTime(ack.accessedAt) : "—"} (version {ack.handbookVersion || "—"}).
            </div>
            <div className="flex flex-wrap items-center gap-4 text-[var(--text-primary)]">
              HRIS download record verified:
              <label className="flex items-center gap-1">
                <input type="radio" checked={verified === true} onChange={() => setVerified(true)} /> Yes
              </label>
              <label className="flex items-center gap-1">
                <input type="radio" checked={verified === false} onChange={() => setVerified(false)} /> No
              </label>
            </div>
            <label className="flex flex-col gap-1 text-xs text-[var(--text-muted)]">
              HRIS log reference or date-time stamp
              <input value={logRef} onChange={(e) => setLogRef(e.target.value)} maxLength={120} className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-2 py-1.5 text-sm text-[var(--text-primary)]" />
            </label>
            <MySignature onChange={setHasSignature} />
            {error && <div className="text-sm text-[var(--status-critical)]">{error}</div>}
            <div className="flex justify-end">
              <button onClick={receive} disabled={busy || !hasSignature || verified === null} className={primary}>
                <CheckCircle2 size={14} /> {busy ? "Signing…" : "Sign as received & verified"}
              </button>
            </div>
          </div>
        )}
        {error && (!isHr || ack.receivedAt) && <div className="text-sm text-[var(--status-critical)]">{error}</div>}
      </div>
      {printing && (
        <PrintStack onDone={stopPrinting}>
          <PrintPage form>
            <HandbookAckDocument ack={ack} signatures={sigs} page={1} />
          </PrintPage>
          <PrintPage form>
            <HandbookAckDocument ack={ack} signatures={sigs} page={2} />
          </PrintPage>
        </PrintStack>
      )}
    </Modal>
  );
}

// ---- Everyone's forms (HR and upper management) -------------------------------------

type Status = "all" | "not_signed" | "to_receive" | "received";

export function HandbookAckList({ info, acks, downloads, doc, onChanged }: { info: HandbookInfo; acks: HandbookAck[]; downloads: Map<string, string>; doc: CompanyDocument | null; onChanged: () => void }) {
  const { employees } = useHris();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<Status>("all");
  const [viewing, setViewing] = useState<HandbookAck | null>(null);

  const current = new Map(acks.filter((a) => a.handbookVersion === info.version).map((a) => [a.employeeId, a]));
  const rows = employees
    .filter((e) => e.status !== "resigned" && e.status !== "terminated")
    .map((e) => ({ employee: e, ack: current.get(e.id) ?? null, downloaded: downloads.get(`${e.id}|${info.version}`) ?? null }))
    .sort((a, b) => fullName(a.employee).localeCompare(fullName(b.employee)));
  const counts = {
    signed: rows.filter((r) => r.ack).length,
    toReceive: rows.filter((r) => r.ack && !r.ack.receivedAt).length,
  };
  const shown = rows.filter((r) => {
    if (search && !fullName(r.employee).toLowerCase().includes(search.toLowerCase())) return false;
    if (status === "not_signed") return !r.ack;
    if (status === "to_receive") return !!r.ack && !r.ack.receivedAt;
    if (status === "received") return !!r.ack?.receivedAt;
    return true;
  });

  return (
    <div className="mt-6 rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-1)] p-4">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-[var(--text-primary)]">Acknowledgment forms{info.version && ` — version ${info.version}`}</div>
          <div className="text-xs text-[var(--text-muted)]">
            {counts.signed} of {rows.length} employees signed{counts.toReceive ? ` · ${counts.toReceive} waiting for HR to receive` : ""}
          </div>
        </div>
        <select value={status} onChange={(e) => setStatus(e.target.value as Status)} className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-2 py-1.5 text-xs">
          <option value="all">All employees</option>
          <option value="not_signed">Not signed yet</option>
          <option value="to_receive">Signed — to receive</option>
          <option value="received">Received</option>
        </select>
        <div className="relative">
          <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search employee…" className="w-44 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] py-1.5 pl-7 pr-2 text-xs" />
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-[var(--border-hairline)] text-left text-xs text-[var(--text-muted)]">
              <th className="px-3 py-2 font-medium">Employee</th>
              <th className="px-3 py-2 font-medium">Downloaded</th>
              <th className="px-3 py-2 font-medium">Signed</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {shown.map(({ employee, ack, downloaded }) => (
              <tr key={employee.id} className="border-b border-[var(--gridline)] last:border-0">
                <td className="px-3 py-2 text-[var(--text-primary)]">{fullName(employee)}</td>
                <td className="tabular px-3 py-2 text-xs text-[var(--text-secondary)]">{downloaded ? manilaDateTime(downloaded) : "—"}</td>
                <td className="tabular px-3 py-2 text-xs text-[var(--text-secondary)]">{ack ? manilaDateTime(ack.signedAt) : "—"}</td>
                <td className="px-3 py-2 text-xs">
                  {!ack ? (
                    <span className="text-[var(--text-muted)]">Not signed</span>
                  ) : ack.receivedAt ? (
                    <span className="flex items-center gap-1 text-[var(--status-good)]">
                      <CheckCircle2 size={13} /> Received
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-[var(--status-warning)]">
                      <Clock size={13} /> Signed — to receive
                    </span>
                  )}
                </td>
                <td className="px-3 py-2">
                  {ack && (
                    <button onClick={() => setViewing(ack)} className={button}>
                      View / Download
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {!shown.length && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-xs text-[var(--text-muted)]">
                  No employees match.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {acks.some((a) => a.handbookVersion !== info.version) && (
        <div className="mt-3 text-xs text-[var(--text-muted)]">
          Forms signed for earlier versions:{" "}
          {acks
            .filter((a) => a.handbookVersion !== info.version)
            .map((a, i) => (
              <span key={a.id}>
                {i > 0 && ", "}
                <button onClick={() => setViewing(a)} className="text-[var(--series-1)] underline">
                  {a.employeeName} (v{a.handbookVersion || "—"})
                </button>
              </span>
            ))}
        </div>
      )}
      {/* The handbook file is the current version, so it's only joined to forms for that version. */}
      {viewing && <AckModal ack={viewing} doc={viewing.handbookVersion === info.version ? doc : null} onClose={() => setViewing(null)} onChanged={onChanged} />}
    </div>
  );
}
