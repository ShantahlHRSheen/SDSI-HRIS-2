"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Eye, Loader2, Plus, Send, Signature, Trash2, X } from "lucide-react";
import { useHris } from "@/lib/store";
import { Modal } from "@/components/Modal";
import { Badge } from "@/components/Badge";
import { FileViewer, type ViewerFile } from "@/components/FileViewer";
import { MySignature } from "@/components/leave/LeaveApplication";
import { currentCompany } from "@/lib/companies";
import { fullName, positionTitle } from "@/lib/helpers";
import { todayInManila } from "@/lib/leave-policy";
import { mySignatureUrl } from "@/lib/supabase/leave-forms";
import { buildMplPdf, MPL_FORM_URL } from "@/lib/mpl-pdf";
import {
  MPL_MAX_LINES,
  declineMpl,
  draftMplData,
  fetchMplRequests,
  mplSignature,
  mplStatusLabel,
  mplTotals,
  prepareMpl,
  requestMpl,
  signMpl,
  signatoryName,
  standingNetPay,
  type MplAddress,
  type MplData,
  type MplLine,
  type MplRequest,
} from "@/lib/mpl";

export function useMplRequests() {
  const { isRealAccount } = useHris();
  const [items, setItems] = useState<MplRequest[]>([]);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(() => {
    if (!isRealAccount) return;
    fetchMplRequests().then(
      (t) => {
        setItems(t);
        setError(null);
      },
      (e: Error) => setError(e.message),
    );
  }, [isRealAccount]);
  useEffect(() => reload(), [reload]);
  return { items, error, reload };
}

export function MplStatus({ item }: { item: MplRequest }) {
  const s = mplStatusLabel(item);
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

const input = "w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-2 text-sm";
const lbl = "mb-1 block text-xs font-medium text-[var(--text-secondary)]";
const primary = "flex items-center gap-1.5 rounded-lg bg-[var(--series-1)] px-3 py-2 text-sm font-medium text-[var(--on-accent)] disabled:opacity-40";
const secondary = "flex items-center gap-1.5 rounded-lg border border-[var(--border-hairline)] px-3 py-2 text-sm text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40 disabled:opacity-40";
const peso = (n: number) => `₱${(Number(n) || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

async function pdfUrl(data: MplData, signature: Uint8Array | null, signedAt: string | null): Promise<string> {
  const form = new Uint8Array(await (await fetch(MPL_FORM_URL)).arrayBuffer());
  const bytes = await buildMplPdf(form, data, signature, signedAt);
  return URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
}
const fileName = (d: MplData) => `Pag-IBIG MPL Form - ${d.borrowerName}.pdf`;

// ---- Asking for one ---------------------------------------------------------------

export function RequestMplModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { currentEmployee } = useHris();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!currentEmployee) return;
    setBusy(true);
    setError(null);
    try {
      await requestMpl(currentEmployee.id, note);
      onDone();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't send the request.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={() => !busy && onClose()} title="Request a Pag-IBIG Multi-Purpose Loan form">
      <div className="space-y-4 text-sm">
        <p className="text-[var(--text-secondary)]">
          HR fills in the employer&rsquo;s part and the Certificate of Net Pay, and the authorized signatory signs it. You then download the form here, fill in your own details, loan amount, term and purpose, and sign it before filing it at Pag-IBIG.
        </p>
        <div>
          <label className={lbl}>Note to HR (optional)</label>
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="e.g. needed by Friday" className={input} />
        </div>
        {error && <div className="text-xs text-[var(--status-critical)]">{error}</div>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} disabled={busy} className={secondary}>
            Cancel
          </button>
          <button onClick={submit} disabled={busy} className={primary}>
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} Send request
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ---- HR: check the employer's part and net pay, send to the signatory ---------------

export function PrepareMplModal({ item, onClose, onChanged }: { item: MplRequest; onClose: () => void; onChanged: () => void }) {
  const { employees } = useHris();
  const company = currentCompany();
  const cfg = company.pagibigMpl;
  const employee = employees.find((e) => e.id === item.employeeId);
  const people = useMemo(() => employees.filter((e) => e.status === "active" || e.status === "on_leave").sort((a, b) => fullName(a).localeCompare(fullName(b))), [employees]);
  const [signatoryId, setSignatoryId] = useState(cfg?.signatoryId && cfg.signatoryId !== item.employeeId ? cfg.signatoryId : "");
  const signer = employees.find((e) => e.id === signatoryId);
  const [data, setData] = useState<MplData | null>(() =>
    employee
      ? draftMplData({
          employee,
          employerName: company.info.name,
          address: cfg?.address ?? { unit: "", building: "", house: "", street: company.info.address, subdivision: "", barangay: "", city: "", province: "", zip: "" },
          employerPagibigId: cfg?.employerPagibigId ?? "",
          signatory: signer ? { name: signatoryName(signer), designation: positionTitle(signer.positionId).replace(/^—$/, "") } : { name: "", designation: "" },
          today: todayInManila(),
        })
      : null,
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState("");
  const [viewer, setViewer] = useState<ViewerFile | null>(null);
  const set = <K extends keyof MplData>(k: K, v: MplData[K]) => setData((d) => (d ? { ...d, [k]: v } : d));
  const setAddr = (k: keyof MplAddress, v: string) => setData((d) => (d ? { ...d, address: { ...d.address, [k]: v } } : d));
  const ready = !!data && !!signatoryId && !!data.signatory.name.trim() && !!data.employerName.trim() && !!data.borrowerName.trim() && data.basic > 0;

  function pickSignatory(id: string) {
    setSignatoryId(id);
    const s = employees.find((e) => e.id === id);
    if (s) set("signatory", { name: signatoryName(s), designation: positionTitle(s.positionId).replace(/^—$/, "") });
  }

  async function preview() {
    if (!data) return;
    setBusy("preview");
    setError(null);
    try {
      setViewer({ url: await pdfUrl(data, null, null), name: fileName(data), kind: "pdf" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't make the preview.");
    } finally {
      setBusy(null);
    }
  }

  async function send() {
    if (!data) return;
    setBusy("send");
    setError(null);
    try {
      await prepareMpl(item, data, signatoryId);
      onChanged();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't send the form.");
    } finally {
      setBusy(null);
    }
  }

  async function decline() {
    setBusy("decline");
    setError(null);
    try {
      await declineMpl(item, reason);
      onChanged();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't decline.");
    } finally {
      setBusy(null);
    }
  }

  const totals = data ? mplTotals(data) : null;
  const a = data?.address;

  return (
    <Modal open onClose={() => !busy && onClose()} title={`Pag-IBIG loan form — ${item.employeeName}`} wide>
      {!data || !a ? (
        <div className="text-sm text-[var(--text-muted)]">This employee&rsquo;s record isn&rsquo;t available.</div>
      ) : (
        <div className="space-y-4 text-sm">
          {item.note && <div className="rounded-lg bg-[var(--gridline)]/25 px-3 py-2 text-xs text-[var(--text-secondary)]">Note from the employee: {item.note}</div>}

          <div className="text-xs font-semibold tracking-wide text-[var(--text-muted)] uppercase">Employer (page 1)</div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={lbl}>Employer / business name</label>
              <input value={data.employerName} onChange={(e) => set("employerName", e.target.value)} className={input} />
            </div>
            <div>
              <label className={lbl}>Pag-IBIG employer ID no.</label>
              <input value={data.employerPagibigId} onChange={(e) => set("employerPagibigId", e.target.value)} placeholder="from your Pag-IBIG employer registration" className={input} />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-4">
            {(
              [
                ["unit", "Unit / floor"],
                ["building", "Building"],
                ["house", "Lot / house no."],
                ["street", "Street"],
                ["subdivision", "Subdivision"],
                ["barangay", "Barangay"],
                ["city", "City / municipality"],
                ["province", "Province"],
              ] as [keyof MplAddress, string][]
            ).map(([k, label]) => (
              <div key={k}>
                <label className={lbl}>{label}</label>
                <input value={a[k]} onChange={(e) => setAddr(k, e.target.value)} className={input} />
              </div>
            ))}
            <div>
              <label className={lbl}>ZIP code</label>
              <input value={a.zip} onChange={(e) => setAddr("zip", e.target.value)} className={input} />
            </div>
            <div>
              <label className={lbl}>Employee ID number</label>
              <input value={data.employeeNumber} onChange={(e) => set("employeeNumber", e.target.value)} className={input} />
            </div>
            <div>
              <label className={lbl}>Date of employment</label>
              <input type="date" value={data.dateOfEmployment} onChange={(e) => set("dateOfEmployment", e.target.value)} className={input} />
            </div>
          </div>

          <div className="text-xs font-semibold tracking-wide text-[var(--text-muted)] uppercase">Certificate of Net Pay (page 2)</div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className={lbl}>Name of borrower</label>
              <input value={data.borrowerName} onChange={(e) => set("borrowerName", e.target.value.toUpperCase())} className={input} />
            </div>
            <div>
              <label className={lbl}>For the month of</label>
              <input value={data.month} onChange={(e) => set("month", e.target.value.toUpperCase())} className={input} />
            </div>
            <div>
              <label className={lbl}>Basic salary (monthly, ₱)</label>
              <input type="number" min={0} value={data.basic} onChange={(e) => set("basic", Number(e.target.value) || 0)} className={input} />
            </div>
          </div>
          <Lines title="Add: allowances" lines={data.allowances} onChange={(l) => set("allowances", l)} />
          <Lines title="Less: deductions" lines={data.deductions} onChange={(l) => set("deductions", l)} />
          {employee && (
            <button
              type="button"
              onClick={() => setData((d) => (d ? { ...d, ...standingNetPay(employee) } : d))}
              className="text-xs text-[var(--series-1)] hover:underline"
            >
              Reset to the 201 file&rsquo;s pay and computed contributions
            </button>
          )}
          {totals && (
            <div className="grid grid-cols-3 gap-3 rounded-lg bg-[var(--gridline)]/25 px-3 py-2 text-xs">
              <div>
                Gross monthly income <div className="tabular text-sm font-semibold text-[var(--text-primary)]">{peso(totals.gross)}</div>
              </div>
              <div>
                Total deductions <div className="tabular text-sm font-semibold text-[var(--text-primary)]">{peso(totals.deductions)}</div>
              </div>
              <div>
                Net monthly income <div className="tabular text-sm font-semibold text-[var(--text-primary)]">{peso(totals.net)}</div>
              </div>
            </div>
          )}

          <div className="text-xs font-semibold tracking-wide text-[var(--text-muted)] uppercase">Authorized signatory</div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className={lbl}>Signs the form</label>
              <select value={signatoryId} onChange={(e) => pickSignatory(e.target.value)} className={input}>
                <option value="">Choose…</option>
                {people
                  .filter((e) => e.id !== item.employeeId)
                  .map((e) => (
                    <option key={e.id} value={e.id}>
                      {fullName(e)}
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <label className={lbl}>Printed name</label>
              <input value={data.signatory.name} onChange={(e) => set("signatory", { ...data.signatory, name: e.target.value.toUpperCase() })} className={input} />
            </div>
            <div>
              <label className={lbl}>Designation</label>
              <input value={data.signatory.designation} onChange={(e) => set("signatory", { ...data.signatory, designation: e.target.value })} className={input} />
            </div>
          </div>

          {error && <div className="text-xs text-[var(--status-critical)]">{error}</div>}
          {declining ? (
            <DeclineBox busy={busy} reason={reason} setReason={setReason} onBack={() => setDeclining(false)} onDecline={decline} />
          ) : (
            <div className="flex flex-wrap justify-end gap-2">
              <button onClick={() => setDeclining(true)} disabled={!!busy} className={secondary}>
                <X size={15} /> Decline
              </button>
              <button onClick={preview} disabled={!!busy || !data.borrowerName} className={secondary}>
                {busy === "preview" ? <Loader2 size={15} className="animate-spin" /> : <Eye size={15} />} Preview
              </button>
              <button onClick={send} disabled={!!busy || !ready} className={primary}>
                {busy === "send" ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} Send to {signer ? signer.firstName : "signatory"} to sign
              </button>
            </div>
          )}
          {!ready && <div className="text-right text-xs text-[var(--status-warning)]">Fill in the employer name, borrower, basic salary and the signatory.</div>}
        </div>
      )}
      {viewer && <FileViewer file={viewer} onClose={() => setViewer(null)} />}
    </Modal>
  );
}

function Lines({ title, lines, onChange }: { title: string; lines: MplLine[]; onChange: (l: MplLine[]) => void }) {
  return (
    <div>
      <div className={lbl}>{title} (up to {MPL_MAX_LINES})</div>
      <div className="space-y-2">
        {lines.map((l, i) => (
          <div key={i} className="grid grid-cols-[1fr_140px_32px] gap-2">
            <input value={l.label} onChange={(e) => onChange(lines.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} placeholder="e.g. Rice allowance / SSS loan" className={input} />
            <input type="number" min={0} value={l.amount} onChange={(e) => onChange(lines.map((x, j) => (j === i ? { ...x, amount: Number(e.target.value) || 0 } : x)))} className={input} />
            <button type="button" onClick={() => onChange(lines.filter((_, j) => j !== i))} className="rounded-md text-[var(--text-muted)] hover:text-[var(--status-critical)]" aria-label="Remove line">
              <Trash2 size={15} />
            </button>
          </div>
        ))}
        {lines.length < MPL_MAX_LINES && (
          <button type="button" onClick={() => onChange([...lines, { label: "", amount: 0 }])} className="flex items-center gap-1 text-xs text-[var(--series-1)] hover:underline">
            <Plus size={13} /> Add line
          </button>
        )}
      </div>
    </div>
  );
}

function DeclineBox({ busy, reason, setReason, onBack, onDecline }: { busy: string | null; reason: string; setReason: (s: string) => void; onBack: () => void; onDecline: () => void }) {
  return (
    <div className="space-y-2 rounded-lg border border-[var(--status-critical)]/40 p-3">
      <label className={lbl}>Reason for declining (the employee sees it)</label>
      <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} className={input} />
      <div className="flex justify-end gap-2">
        <button onClick={onBack} disabled={!!busy} className={secondary}>
          Back
        </button>
        <button onClick={onDecline} disabled={!!busy || !reason.trim()} className="flex items-center gap-1.5 rounded-lg bg-[var(--status-critical)] px-3 py-2 text-sm font-medium text-white disabled:opacity-40">
          {busy === "decline" ? <Loader2 size={15} className="animate-spin" /> : <X size={15} />} Decline
        </button>
      </div>
    </div>
  );
}

// ---- The authorized signatory signs -------------------------------------------------

export function SignMplModal({ item, onClose, onChanged }: { item: MplRequest; onClose: () => void; onChanged: () => void }) {
  const { currentEmployee } = useHris();
  const [hasSignature, setHasSignature] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState("");
  const [viewer, setViewer] = useState<ViewerFile | null>(null);
  const d = item.data;
  const totals = d ? mplTotals(d) : null;

  async function preview() {
    if (!d || !currentEmployee) return;
    setBusy("preview");
    setError(null);
    try {
      const url = await mySignatureUrl(currentEmployee.id);
      const sig = url ? new Uint8Array(await (await fetch(url)).arrayBuffer()) : null;
      setViewer({ url: await pdfUrl(d, sig, new Date().toISOString()), name: fileName(d), kind: "pdf" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't make the preview.");
    } finally {
      setBusy(null);
    }
  }

  async function sign() {
    if (!currentEmployee) return;
    setBusy("sign");
    setError(null);
    try {
      await signMpl(item, currentEmployee.id);
      onChanged();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't sign.");
    } finally {
      setBusy(null);
    }
  }

  async function decline() {
    setBusy("decline");
    setError(null);
    try {
      await declineMpl(item, reason);
      onChanged();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't decline.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Modal open onClose={() => !busy && onClose()} title={`Sign Pag-IBIG loan form — ${item.employeeName}`}>
      {!d || !totals ? (
        <div className="text-sm text-[var(--text-muted)]">This form has no details yet.</div>
      ) : (
        <div className="space-y-4 text-sm">
          <p className="text-[var(--text-secondary)]">
            You sign as the employer&rsquo;s authorized signatory ({d.signatory.designation || "—"}): on page 1 and on the Certificate of Net Pay. HR ({item.preparedName ?? "—"}) prepared the figures.
          </p>
          <div className="grid grid-cols-3 gap-3 rounded-lg bg-[var(--gridline)]/25 px-3 py-2 text-xs">
            <div>
              Gross monthly income <div className="tabular text-sm font-semibold text-[var(--text-primary)]">{peso(totals.gross)}</div>
            </div>
            <div>
              Total deductions <div className="tabular text-sm font-semibold text-[var(--text-primary)]">{peso(totals.deductions)}</div>
            </div>
            <div>
              Net monthly income <div className="tabular text-sm font-semibold text-[var(--text-primary)]">{peso(totals.net)}</div>
            </div>
          </div>
          <MySignature onChange={setHasSignature} />
          {error && <div className="text-xs text-[var(--status-critical)]">{error}</div>}
          {declining ? (
            <DeclineBox busy={busy} reason={reason} setReason={setReason} onBack={() => setDeclining(false)} onDecline={decline} />
          ) : (
            <div className="flex flex-wrap justify-end gap-2">
              <button onClick={() => setDeclining(true)} disabled={!!busy} className={secondary}>
                <X size={15} /> Decline
              </button>
              <button onClick={preview} disabled={!!busy} className={secondary}>
                {busy === "preview" ? <Loader2 size={15} className="animate-spin" /> : <Eye size={15} />} Preview
              </button>
              <button onClick={sign} disabled={!!busy || !hasSignature} className={primary}>
                {busy === "sign" ? <Loader2 size={15} className="animate-spin" /> : <Signature size={15} />} Sign the form
              </button>
            </div>
          )}
          {!hasSignature && <div className="text-right text-xs text-[var(--status-warning)]">Upload your signature above to sign.</div>}
        </div>
      )}
      {viewer && <FileViewer file={viewer} onClose={() => setViewer(null)} />}
    </Modal>
  );
}

// ---- Viewing the signed form ------------------------------------------------------

export function ViewMplButton({ item }: { item: MplRequest }) {
  const [viewer, setViewer] = useState<ViewerFile | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const d = item.data;
  if (!d || (item.status !== "signed" && item.status !== "signatory")) return null;

  async function open() {
    if (!d) return;
    setBusy(true);
    setError(null);
    try {
      const signed = item.status === "signed";
      setViewer({ url: await pdfUrl(d, signed ? await mplSignature(item) : null, signed ? item.signedAt : null), name: fileName(d), kind: "pdf" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't open the form.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button onClick={open} disabled={busy} className="flex items-center gap-1 rounded-lg border border-[var(--border-hairline)] px-2 py-1 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40 disabled:opacity-50">
        {busy ? <Loader2 size={12} className="animate-spin" /> : <Eye size={12} />} {item.status === "signed" ? "View / download" : "View (unsigned)"}
      </button>
      {error && <div className="text-[11px] text-[var(--status-critical)]">{error}</div>}
      {viewer && <FileViewer file={viewer} onClose={() => setViewer(null)} />}
    </>
  );
}
