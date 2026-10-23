"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Eye, FileCheck2, Loader2, X } from "lucide-react";
import { useHris } from "@/lib/store";
import { Modal } from "@/components/Modal";
import { Badge } from "@/components/Badge";
import { FileViewer, type ViewerFile } from "@/components/FileViewer";
import { MySignature } from "@/components/leave/LeaveApplication";
import { currentCompany } from "@/lib/companies";
import { positionTitle } from "@/lib/helpers";
import { todayInManila } from "@/lib/leave-policy";
import { mySignatureUrl } from "@/lib/supabase/leave-forms";
import { buildCoePdf, type CoeImages } from "@/lib/coe-pdf";
import {
  COE_PURPOSES,
  coeSignature,
  coeStatusLabel,
  declineCoe,
  defaultCompensation,
  draftCoeData,
  fetchCoeRequests,
  issueCoe,
  requestCoe,
  type CoeData,
  type CoeRequest,
} from "@/lib/coe";
import type { Employee } from "@/lib/types";

export function useCoeRequests() {
  const { isRealAccount } = useHris();
  const [items, setItems] = useState<CoeRequest[]>([]);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(() => {
    if (!isRealAccount) return;
    fetchCoeRequests().then(
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

export function CoeStatus({ item }: { item: CoeRequest }) {
  const s = coeStatusLabel(item);
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

const input = "w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-2 text-sm";
const lbl = "mb-1 block text-xs font-medium text-[var(--text-secondary)]";
const primary = "flex items-center gap-1.5 rounded-lg bg-[var(--series-1)] px-3 py-2 text-sm font-medium text-[var(--on-accent)] disabled:opacity-40";
const secondary = "flex items-center gap-1.5 rounded-lg border border-[var(--border-hairline)] px-3 py-2 text-sm text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40 disabled:opacity-40";

// The company's COE images (letterhead, footer, watermark).
async function companyImages(): Promise<CoeImages> {
  const c = currentCompany().coe;
  const get = async (src?: string) => (src ? new Uint8Array(await (await fetch(src)).arrayBuffer()) : null);
  const [header, footer, watermark] = await Promise.all([get(c?.header), get(c?.footer), get(c?.watermark)]);
  return { header, footer, watermark };
}

async function pdfUrl(data: CoeData, signature: Uint8Array | null): Promise<string> {
  const bytes = await buildCoePdf(data, { ...(await companyImages()), signature });
  return URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
}

const fileName = (d: CoeData) => `COE - ${d.fullName}.pdf`;

// ---- Asking for one ---------------------------------------------------------------

export function RequestCoeModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { currentEmployee } = useHris();
  const [purpose, setPurpose] = useState(COE_PURPOSES[0]);
  const [other, setOther] = useState("");
  const [withCompensation, setWithCompensation] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const finalPurpose = purpose === "Other" ? other.trim() : purpose;

  async function submit() {
    if (!currentEmployee) return;
    setBusy(true);
    setError(null);
    try {
      await requestCoe(currentEmployee.id, finalPurpose, withCompensation);
      onDone();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't send the request.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={() => !busy && onClose()} title="Request a Certificate of Employment">
      <div className="space-y-4 text-sm">
        <div>
          <label className={lbl}>Purpose</label>
          <select value={purpose} onChange={(e) => setPurpose(e.target.value)} className={input}>
            {[...COE_PURPOSES, "Other"].map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          {purpose === "Other" && <input value={other} onChange={(e) => setOther(e.target.value)} maxLength={200} placeholder="e.g. scholarship application" className={`${input} mt-2`} />}
        </div>
        <label className="flex items-start gap-2 text-[var(--text-primary)]">
          <input type="checkbox" checked={withCompensation} onChange={(e) => setWithCompensation(e.target.checked)} className="mt-0.5 accent-[var(--series-1)]" />
          <span>
            Include my compensation
            <span className="block text-xs text-[var(--text-muted)]">Shows your monthly salary (or daily rate) and allowance — often needed for loans and visas.</span>
          </span>
        </label>
        <p className="text-xs text-[var(--text-muted)]">HR reviews and signs it; you&rsquo;ll download the signed certificate here once it&rsquo;s issued.</p>
        {error && <div className="text-xs text-[var(--status-critical)]">{error}</div>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} disabled={busy} className={secondary}>
            Cancel
          </button>
          <button onClick={submit} disabled={busy || !finalPurpose} className={primary}>
            {busy ? <Loader2 size={15} className="animate-spin" /> : <FileCheck2 size={15} />} Send request
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ---- HR: review, sign and issue -----------------------------------------------------

export function IssueCoeModal({ item, onClose, onChanged }: { item: CoeRequest; onClose: () => void; onChanged: () => void }) {
  const { currentEmployee, employees } = useHris();
  const company = currentCompany();
  const employee = employees.find((e) => e.id === item.employeeId);
  const [data, setData] = useState<CoeData | null>(() => (employee && currentEmployee ? initialData(employee, currentEmployee, item) : null));
  const [hasSignature, setHasSignature] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState("");
  const [viewer, setViewer] = useState<ViewerFile | null>(null);
  const set = <K extends keyof CoeData>(k: K, v: CoeData[K]) => setData((d) => (d ? { ...d, [k]: v } : d));
  const ready = !!data && !!data.fullName.trim() && !!data.position.trim() && !!data.start && (data.current || !!data.end);

  async function preview() {
    if (!data || !currentEmployee) return;
    setBusy("preview");
    setError(null);
    try {
      const sigUrl = await mySignatureUrl(currentEmployee.id);
      const sig = sigUrl ? new Uint8Array(await (await fetch(sigUrl)).arrayBuffer()) : null;
      setViewer({ url: await pdfUrl(data, sig), name: fileName(data), kind: "pdf" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't make the preview.");
    } finally {
      setBusy(null);
    }
  }

  async function issue() {
    if (!data || !currentEmployee) return;
    setBusy("issue");
    setError(null);
    try {
      await issueCoe(item, currentEmployee.id, data);
      onChanged();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't issue the certificate.");
    } finally {
      setBusy(null);
    }
  }

  async function decline() {
    setBusy("decline");
    setError(null);
    try {
      await declineCoe(item, reason);
      onChanged();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't decline the request.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Modal open onClose={() => !busy && onClose()} title={`Certificate of Employment — ${item.employeeName}`} wide>
      {!data ? (
        <div className="text-sm text-[var(--text-muted)]">This employee&rsquo;s record isn&rsquo;t available.</div>
      ) : (
        <div className="space-y-4 text-sm">
          <div className="rounded-lg bg-[var(--gridline)]/25 px-3 py-2 text-xs text-[var(--text-secondary)]">
            Requested {item.purpose ? <>for <span className="font-medium text-[var(--text-primary)]">{item.purpose}</span></> : null}
            {item.withCompensation ? " · with compensation" : " · without compensation"}. Check the wording below (taken from the 201 file), then preview, sign and issue.
          </div>
          <div className="grid gap-3 sm:grid-cols-[110px_1fr]">
            <div>
              <label className={lbl}>Title</label>
              <select value={data.honorific} onChange={(e) => set("honorific", e.target.value as CoeData["honorific"])} className={input}>
                <option value="MR.">MR.</option>
                <option value="MS.">MS.</option>
              </select>
            </div>
            <div>
              <label className={lbl}>Full name (as printed)</label>
              <input value={data.fullName} onChange={(e) => set("fullName", e.target.value.toUpperCase())} className={input} />
            </div>
          </div>
          <div>
            <label className={lbl}>Resident of (address; leave blank to leave it out)</label>
            <input value={data.address} onChange={(e) => set("address", e.target.value)} placeholder="e.g. Cabanatuan City, Nueva Ecija, Philippines" className={input} />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className={lbl}>Employed since</label>
              <input type="date" value={data.start} onChange={(e) => set("start", e.target.value)} className={input} />
            </div>
            <div>
              <label className={lbl}>Still employed?</label>
              <select value={data.current ? "yes" : "no"} onChange={(e) => set("current", e.target.value === "yes")} className={input}>
                <option value="yes">Yes — &ldquo;is an employee&rdquo;</option>
                <option value="no">No — &ldquo;was an employee&rdquo;</option>
              </select>
            </div>
            {!data.current && (
              <div>
                <label className={lbl}>Last day</label>
                <input type="date" value={data.end ?? ""} onChange={(e) => set("end", e.target.value || null)} className={input} />
              </div>
            )}
          </div>
          <div>
            <label className={lbl}>Position</label>
            <input value={data.position} onChange={(e) => set("position", e.target.value)} className={input} />
          </div>
          <div>
            <label className={lbl}>Added after the position (optional)</label>
            <input
              value={data.extra}
              onChange={(e) => set("extra", e.target.value)}
              placeholder="e.g. and was also a Freelance Multimedia Artist of the company from June 16, 2026 upto September 30, 2026"
              className={input}
            />
          </div>
          <div className="rounded-lg border border-[var(--border-hairline)] p-3">
            <label className="flex items-center gap-2 text-[var(--text-primary)]">
              <input
                type="checkbox"
                checked={!!data.compensation}
                onChange={(e) => set("compensation", e.target.checked && employee ? defaultCompensation(employee) : null)}
                className="accent-[var(--series-1)]"
              />
              Show compensation
            </label>
            {data.compensation && (
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <div>
                  <label className={lbl}>Basis</label>
                  <select value={data.compensation.basis} onChange={(e) => set("compensation", { ...data.compensation!, basis: e.target.value as "monthly" | "daily" })} className={input}>
                    <option value="monthly">Monthly salary</option>
                    <option value="daily">Daily rate</option>
                  </select>
                </div>
                <div>
                  <label className={lbl}>{data.compensation.basis === "daily" ? "Daily rate (₱)" : "Monthly basic salary (₱)"}</label>
                  <input type="number" min={0} value={data.compensation.basic} onChange={(e) => set("compensation", { ...data.compensation!, basic: Number(e.target.value) || 0 })} className={input} />
                </div>
                <div>
                  <label className={lbl}>{data.compensation.basis === "daily" ? "Daily allowance (₱)" : "Monthly allowance (₱)"}</label>
                  <input type="number" min={0} value={data.compensation.allowance} onChange={(e) => set("compensation", { ...data.compensation!, allowance: Number(e.target.value) || 0 })} className={input} />
                </div>
              </div>
            )}
          </div>
          <div>
            <label className={lbl}>Purpose (completes &ldquo;…issued at the request of {data.honorific === "MS." ? "Ms." : "Mr."} {data.lastName}, for …&rdquo;; blank = &ldquo;whatever legal purpose it may serve {data.female ? "her" : "him"}&rdquo;)</label>
            <input value={data.purpose} onChange={(e) => set("purpose", e.target.value)} className={input} />
          </div>
          <div className="text-xs text-[var(--text-muted)]">
            Signed by {data.signer.name} ({data.signer.title}) · issued {data.issueDate} at {company.name} {data.issuedAt}
          </div>

          <MySignature onChange={setHasSignature} />
          {error && <div className="text-xs text-[var(--status-critical)]">{error}</div>}

          {declining ? (
            <div className="space-y-2 rounded-lg border border-[var(--status-critical)]/40 p-3">
              <label className={lbl}>Reason for declining (the employee sees it)</label>
              <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} className={input} />
              <div className="flex justify-end gap-2">
                <button onClick={() => setDeclining(false)} disabled={!!busy} className={secondary}>
                  Back
                </button>
                <button onClick={decline} disabled={!!busy || !reason.trim()} className="flex items-center gap-1.5 rounded-lg bg-[var(--status-critical)] px-3 py-2 text-sm font-medium text-white disabled:opacity-40">
                  {busy === "decline" ? <Loader2 size={15} className="animate-spin" /> : <X size={15} />} Decline request
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap justify-end gap-2">
              <button onClick={() => setDeclining(true)} disabled={!!busy} className={secondary}>
                <X size={15} /> Decline
              </button>
              <button onClick={preview} disabled={!!busy || !ready} className={secondary}>
                {busy === "preview" ? <Loader2 size={15} className="animate-spin" /> : <Eye size={15} />} Preview
              </button>
              <button onClick={issue} disabled={!!busy || !ready || !hasSignature} className={primary}>
                {busy === "issue" ? <Loader2 size={15} className="animate-spin" /> : <FileCheck2 size={15} />} Sign &amp; issue
              </button>
            </div>
          )}
          {!hasSignature && <div className="text-right text-xs text-[var(--status-warning)]">Upload your signature above to sign and issue.</div>}
          {!ready && <div className="text-right text-xs text-[var(--status-warning)]">Fill in the name, position and dates.</div>}
        </div>
      )}
      {viewer && <FileViewer file={viewer} onClose={() => setViewer(null)} />}
    </Modal>
  );
}

function initialData(employee: Employee, me: Employee, item: CoeRequest): CoeData {
  const company = currentCompany();
  const mi = me.middleName?.trim() ? ` ${me.middleName.trim().charAt(0).toUpperCase()}.` : "";
  return draftCoeData({
    employee,
    request: item,
    position: positionTitle(employee.positionId).replace(/^—$/, ""),
    company: company.info.name,
    issuedAt: company.coe?.issuedAt ?? "",
    issueDate: todayInManila(),
    signer: {
      name: `${me.firstName}${mi} ${me.lastName}`,
      title: `${positionTitle(me.positionId).replace(/^—$/, "HR Manager")}, ${company.info.name}`,
      contact: company.coe?.contact ?? company.info.phone,
      email: company.coe?.email ?? company.info.email,
    },
  });
}

// ---- Viewing an issued certificate -----------------------------------------------

export function ViewCoeButton({ item }: { item: CoeRequest }) {
  const [viewer, setViewer] = useState<ViewerFile | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const data = item.data;
  const open = useMemo(
    () => async () => {
      if (!data) return;
      setBusy(true);
      setError(null);
      try {
        setViewer({ url: await pdfUrl(data, await coeSignature(item)), name: fileName(data), kind: "pdf" });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't open the certificate.");
      } finally {
        setBusy(false);
      }
    },
    [data, item],
  );
  if (item.status !== "issued" || !data) return null;
  return (
    <>
      <button onClick={open} disabled={busy} className="flex items-center gap-1 rounded-lg border border-[var(--border-hairline)] px-2 py-1 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40 disabled:opacity-50">
        {busy ? <Loader2 size={12} className="animate-spin" /> : <Eye size={12} />} View / download
      </button>
      {error && <div className="text-[11px] text-[var(--status-critical)]">{error}</div>}
      {viewer && <FileViewer file={viewer} onClose={() => setViewer(null)} />}
    </>
  );
}
