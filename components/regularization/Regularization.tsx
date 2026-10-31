"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Eye, Loader2, Plus, Save, Send, Signature, Trash2, Undo2 } from "lucide-react";
import { useHris } from "@/lib/store";
import { Modal } from "@/components/Modal";
import { Badge } from "@/components/Badge";
import { FileViewer, type ViewerFile } from "@/components/FileViewer";
import { MySignature } from "@/components/leave/LeaveApplication";
import { currentCompany } from "@/lib/companies";
import { fullName, positionTitle } from "@/lib/helpers";
import { todayInManila } from "@/lib/leave-policy";
import { mySignatureUrl } from "@/lib/supabase/leave-forms";
import { buildRegularizationPdf } from "@/lib/regularization-pdf";
import {
  createRegularization,
  draftRegData,
  fetchRegularizations,
  receiveRegularization,
  regAllowanceTotal,
  regSignatures,
  regStatusLabel,
  returnRegularization,
  saveRegularization,
  sendRegularization,
  signRegularization,
  type RegData,
  type RegSigner,
  type Regularization,
} from "@/lib/regularization";

export const input = "w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-2 text-sm";
const lbl = "mb-1 block text-xs font-medium text-[var(--text-secondary)]";
export const primary = "flex items-center gap-1.5 rounded-lg bg-[var(--series-1)] px-3 py-2 text-sm font-medium text-[var(--on-accent)] disabled:opacity-40";
export const secondary = "flex items-center gap-1.5 rounded-lg border border-[var(--border-hairline)] px-3 py-2 text-sm text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40 disabled:opacity-40";
const peso = (n: number) => `₱${(Number(n) || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const regConfig = () => currentCompany().regularization;

export function useRegularizations() {
  const { isRealAccount } = useHris();
  const [items, setItems] = useState<Regularization[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(() => {
    if (!isRealAccount) return;
    fetchRegularizations().then(
      (t) => (setItems(t), setError(null)),
      (e: Error) => setError(e.message),
    );
  }, [isRealAccount]);
  useEffect(() => reload(), [reload]);
  return { items, error, reload };
}

export function RegStatus({ item }: { item: Regularization }) {
  const s = regStatusLabel(item);
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

// "Lowel Bxxx Magdadaro" → "Lowel B. Magdadaro".
const withInitial = (e: { firstName: string; middleName?: string; lastName: string }) => `${e.firstName}${e.middleName?.trim() ? ` ${e.middleName.trim().charAt(0)}.` : ""} ${e.lastName}`;

async function pdfUrl(r: Pick<Regularization, "data" | "hrName" | "hrSignedAt" | "signedAt" | "receivedAt">, signatures: Partial<Record<RegSigner, Uint8Array>>, hrName: string): Promise<string> {
  const bytes = await buildRegularizationPdf({
    data: r.data,
    hrName: r.hrName || hrName,
    hrTitle: "HR Manager",
    signatures,
    signedAt: { hr: r.hrSignedAt, chairman: r.signedAt, employee: r.receivedAt },
    headerLines: regConfig()?.headerLines ?? [],
  });
  return URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
}
const fileName = (d: RegData) => `Regularization - ${d.employeeName}.pdf`;

// ---- HR: prepare / edit, sign and send ----------------------------------------------

export function PrepareRegModal({ item, onClose, onChanged }: { item: Regularization | null; onClose: () => void; onChanged: () => void }) {
  const { employees, currentEmployee } = useHris();
  const cfg = regConfig();
  const today = useMemo(() => todayInManila(), []);
  const people = useMemo(() => employees.filter((e) => e.status === "active" || e.status === "on_leave").sort((a, b) => fullName(a).localeCompare(fullName(b))), [employees]);
  const [employeeId, setEmployeeId] = useState(item?.employeeId ?? "");
  const [search, setSearch] = useState("");
  const [signatoryId, setSignatoryId] = useState(item?.signatoryId ?? cfg?.signatoryId ?? "");
  const [data, setData] = useState<RegData | null>(item?.data ?? null);
  const [hasSignature, setHasSignature] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [viewer, setViewer] = useState<ViewerFile | null>(null);
  const signer = employees.find((e) => e.id === signatoryId);
  const q = search.trim().toLowerCase();
  const shown = people.filter((e) => !q || [e.firstName, e.lastName, e.employeeNumber, positionTitle(e.positionId)].some((x) => x?.toLowerCase().includes(q)));

  function pickEmployee(id: string) {
    setEmployeeId(id);
    const e = employees.find((x) => x.id === id);
    if (!e) return setData(null);
    setData(
      draftRegData({
        employee: e,
        position: positionTitle(e.positionId).replace(/^—$/, ""),
        employerName: cfg?.employerName ?? currentCompany().name,
        employerAddress: cfg?.employerAddress ?? currentCompany().info.address,
        place: cfg?.place ?? "",
        allowances: cfg?.allowances ?? [],
        signatory: { name: signer ? withInitial(signer) : "", title: cfg?.signatoryTitle ?? "Chairman" },
        today,
      }),
    );
  }
  const set = <K extends keyof RegData>(k: K, v: RegData[K]) => setData((d) => (d ? { ...d, [k]: v } : d));
  function pickSignatory(id: string) {
    setSignatoryId(id);
    const s = employees.find((e) => e.id === id);
    if (s && data) set("signatory", { ...data.signatory, name: withInitial(s) });
  }

  const ready = !!data && !!employeeId && !!signatoryId && !!data.position.trim() && data.dailyWage > 0 && !!data.effectiveDate && !!data.signatory.name.trim();

  async function save(send: boolean) {
    if (!data || !currentEmployee) return;
    setBusy(send ? "send" : "save");
    setError(null);
    try {
      let id = item?.id;
      if (id) await saveRegularization(id, data, signatoryId);
      else id = await createRegularization(employeeId, signatoryId, data);
      if (send) await sendRegularization(id, currentEmployee.id);
      onChanged();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save.");
    } finally {
      setBusy(null);
    }
  }

  async function preview() {
    if (!data || !currentEmployee) return;
    setBusy("preview");
    try {
      const url = await mySignatureUrl(currentEmployee.id);
      const sig = url ? new Uint8Array(await (await fetch(url)).arrayBuffer()) : null;
      setViewer({ url: await pdfUrl({ data, hrName: null, hrSignedAt: sig ? new Date().toISOString() : null, signedAt: null, receivedAt: null }, sig ? { hr: sig } : {}, withInitial(currentEmployee)), name: fileName(data), kind: "pdf" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't make the preview.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Modal open wide onClose={() => !busy && onClose()} title={item ? `Regularization — ${item.employeeName}` : "New regularization"}>
      <div className="space-y-4 text-sm">
        {item?.returnedNote && (
          <div className="rounded-lg border border-[var(--status-critical)]/40 px-3 py-2 text-xs text-[var(--text-secondary)]">
            <b className="text-[var(--text-primary)]">Returned by {item.signatoryName}:</b> {item.returnedNote}
          </div>
        )}
        {!item && (
          <div>
            <label className={lbl}>Employee</label>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, employee no. or position…" className={`${input} mb-1.5`} />
            <select value={employeeId} onChange={(e) => pickEmployee(e.target.value)} className={input}>
              <option value="">Choose…</option>
              {shown.map((e) => (
                <option key={e.id} value={e.id}>
                  {fullName(e)} — {positionTitle(e.positionId)} ({e.employmentStatus})
                </option>
              ))}
            </select>
          </div>
        )}
        {data && (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Name on the contract" value={data.employeeName} onChange={(v) => set("employeeName", v.toUpperCase())} />
              <Field label="Salutation (notice)" value={data.salutation} onChange={(v) => set("salutation", v)} />
              <div>
                <label className={lbl}>Pronoun</label>
                <select value={data.female ? "f" : "m"} onChange={(e) => set("female", e.target.value === "f")} className={input}>
                  <option value="f">her / she</option>
                  <option value="m">his / he</option>
                </select>
              </div>
              <Field label="Civil status" value={data.civilStatus} onChange={(v) => set("civilStatus", v)} placeholder="Blank prints a line to fill in" />
              <div className="sm:col-span-2">
                <Field label="Address" value={data.address} onChange={(v) => set("address", v)} placeholder="Blank prints a line to fill in" />
              </div>
              <Field label="Position" value={data.position} onChange={(v) => set("position", v)} />
              <Field label="Effective date (regular)" type="date" value={data.effectiveDate} onChange={(v) => set("effectiveDate", v)} />
              <Field label="Contract date (made and executed)" type="date" value={data.contractDate} onChange={(v) => set("contractDate", v)} />
              <Field label="Notice date" type="date" value={data.noticeDate} onChange={(v) => set("noticeDate", v)} />
              <Field label="Place signed" value={data.place} onChange={(v) => set("place", v)} />
              <Field label="Basic daily wage (₱)" type="number" value={String(data.dailyWage || "")} onChange={(v) => set("dailyWage", Number(v) || 0)} />
            </div>

            <div>
              <div className="mb-1 text-xs font-semibold tracking-wide text-[var(--text-muted)] uppercase">Daily allowances (de minimis)</div>
              <div className="space-y-1.5">
                {data.allowances.map((a, i) => (
                  <div key={i} className="flex gap-2">
                    <input value={a.label} onChange={(e) => set("allowances", data.allowances.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} className={input} />
                    <input
                      type="number"
                      step="0.01"
                      value={a.amount || ""}
                      onChange={(e) => set("allowances", data.allowances.map((x, j) => (j === i ? { ...x, amount: Number(e.target.value) || 0 } : x)))}
                      className={`${input} w-32 text-right`}
                    />
                    <button onClick={() => set("allowances", data.allowances.filter((_, j) => j !== i))} className="rounded p-2 text-[var(--text-muted)] hover:text-[var(--status-critical)]" aria-label="Remove">
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
              <button onClick={() => set("allowances", [...data.allowances, { label: "", amount: 0 }])} disabled={data.allowances.length >= 8} className={`${secondary} mt-2 text-xs`}>
                <Plus size={13} /> Add an allowance
              </button>
              <div className="mt-2 text-xs text-[var(--text-secondary)]">
                Total daily allowances {peso(regAllowanceTotal(data))} · Total daily compensation <b>{peso(data.dailyWage + regAllowanceTotal(data))}</b>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className={lbl}>Signs for the employer</label>
                <select value={signatoryId} onChange={(e) => pickSignatory(e.target.value)} className={input}>
                  <option value="">Choose…</option>
                  {people
                    .filter((e) => e.id !== employeeId)
                    .map((e) => (
                      <option key={e.id} value={e.id}>
                        {fullName(e)}
                      </option>
                    ))}
                </select>
              </div>
              <Field label="Their title" value={data.signatory.title} onChange={(v) => set("signatory", { ...data.signatory, title: v })} />
            </div>

            <MySignature onChange={setHasSignature} />
            <div className="text-xs text-[var(--text-muted)]">
              Sending signs the notice as HR and sends the contract to {signer ? signer.firstName : "the signatory"} to sign. Then {data.employeeName || "the employee"} receives both and signs.
            </div>
          </>
        )}
        {error && <div className="text-xs text-[var(--status-critical)]">{error}</div>}
        <div className="flex flex-wrap justify-end gap-2">
          <button onClick={preview} disabled={!!busy || !data} className={`${secondary} mr-auto`}>
            {busy === "preview" ? <Loader2 size={15} className="animate-spin" /> : <Eye size={15} />} Preview
          </button>
          <button onClick={() => save(false)} disabled={!!busy || !ready} className={secondary}>
            {busy === "save" ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Save draft
          </button>
          <button onClick={() => save(true)} disabled={!!busy || !ready || !hasSignature} className={primary}>
            {busy === "send" ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} Sign &amp; send to {signer ? signer.firstName : "signatory"}
          </button>
        </div>
      </div>
      {viewer && <FileViewer file={viewer} onClose={() => (URL.revokeObjectURL(viewer.url), setViewer(null))} />}
    </Modal>
  );
}

function Field({ label, value, onChange, type = "text", placeholder }: { label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string }) {
  return (
    <div>
      <label className={lbl}>{label}</label>
      <input type={type} step={type === "number" ? "0.01" : undefined} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className={input} />
    </div>
  );
}

// ---- The Chairman signs, or the employee receives ---------------------------------

export function SignRegModal({ item, as, onClose, onChanged }: { item: Regularization; as: "chairman" | "employee"; onClose: () => void; onChanged: () => void }) {
  const { currentEmployee } = useHris();
  const [hasSignature, setHasSignature] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [returning, setReturning] = useState(false);
  const [note, setNote] = useState("");
  const d = item.data;

  async function run(kind: string, fn: () => Promise<void>) {
    setBusy(kind);
    setError(null);
    try {
      await fn();
      onChanged();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't submit.");
    } finally {
      setBusy(null);
    }
  }
  const me = currentEmployee?.id ?? "";

  return (
    <Modal open onClose={() => !busy && onClose()} title={as === "chairman" ? `Sign the regular contract — ${item.employeeName}` : "Your regularization"}>
      <div className="space-y-4 text-sm">
        {as === "chairman" ? (
          <p className="text-[var(--text-secondary)]">
            You sign the Regular Contract of Employment for the employer ({d.signatory.title}). HR ({item.hrName ?? "—"}) prepared it and signed the Notice of Regularization. After you sign, {d.employeeName} receives both.
          </p>
        ) : (
          <p className="text-[var(--text-secondary)]">
            Congratulations! Please read your Regular Contract of Employment and the Notice of Regularization and Salary Adjustment. Signing confirms you received them: you sign the contract as the Employee and the notice&rsquo;s conforme.
          </p>
        )}
        <div className="grid grid-cols-2 gap-2 rounded-lg bg-[var(--gridline)]/25 px-3 py-2 text-xs sm:grid-cols-4">
          <div>
            Position <div className="font-semibold text-[var(--text-primary)]">{d.position}</div>
          </div>
          <div>
            Effective <div className="font-semibold text-[var(--text-primary)]">{d.effectiveDate}</div>
          </div>
          <div>
            Daily wage <div className="font-semibold text-[var(--text-primary)]">{peso(d.dailyWage)}</div>
          </div>
          <div>
            Daily total <div className="font-semibold text-[var(--text-primary)]">{peso(d.dailyWage + regAllowanceTotal(d))}</div>
          </div>
        </div>
        <div className="flex justify-end">
          <ViewRegButton item={item} />
        </div>
        <MySignature onChange={setHasSignature} />
        {error && <div className="text-xs text-[var(--status-critical)]">{error}</div>}
        {returning ? (
          <div className="space-y-2">
            <label className={lbl}>What needs changing?</label>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={1000} className={input} />
            <div className="flex justify-end gap-2">
              <button onClick={() => setReturning(false)} disabled={!!busy} className={secondary}>
                Back
              </button>
              <button onClick={() => run("return", () => returnRegularization(item.id, note))} disabled={!!busy || !note.trim()} className={primary}>
                {busy === "return" ? <Loader2 size={15} className="animate-spin" /> : <Undo2 size={15} />} Return to HR
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap justify-end gap-2">
            {as === "chairman" && (
              <button onClick={() => setReturning(true)} disabled={!!busy} className={secondary}>
                <Undo2 size={15} /> Return to HR
              </button>
            )}
            <button
              onClick={() => run("sign", () => (as === "chairman" ? signRegularization(item.id, me) : receiveRegularization(item.id, me)))}
              disabled={!!busy || !hasSignature}
              className={primary}
            >
              {busy === "sign" ? <Loader2 size={15} className="animate-spin" /> : <Signature size={15} />} {as === "chairman" ? "Sign the contract" : "Sign & receive"}
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}

// ---- Viewing / printing ---------------------------------------------------------------

export function ViewRegButton({ item }: { item: Regularization }) {
  const [viewer, setViewer] = useState<ViewerFile | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function open() {
    setBusy(true);
    setError(null);
    try {
      setViewer({ url: await pdfUrl(item, await regSignatures(item), item.hrName ?? ""), name: fileName(item.data), kind: "pdf" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't open it.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <button onClick={open} disabled={busy} className="flex items-center gap-1 rounded-lg border border-[var(--border-hairline)] px-2 py-1 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40 disabled:opacity-50">
        {busy ? <Loader2 size={12} className="animate-spin" /> : <Eye size={12} />} View / print
      </button>
      {error && <div className="text-[11px] text-[var(--status-critical)]">{error}</div>}
      {viewer && <FileViewer file={viewer} onClose={() => (URL.revokeObjectURL(viewer.url), setViewer(null))} />}
    </>
  );
}
