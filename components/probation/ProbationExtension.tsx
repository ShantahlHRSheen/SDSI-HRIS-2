"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CalendarClock, Eye, Loader2, Plus, Save, Send, Signature, Target, Trash2, Undo2 } from "lucide-react";
import { useHris } from "@/lib/store";
import { Modal } from "@/components/Modal";
import { Badge } from "@/components/Badge";
import { FileViewer, type ViewerFile } from "@/components/FileViewer";
import { MySignature } from "@/components/leave/LeaveApplication";
import { currentCompany } from "@/lib/companies";
import { departmentName, fullName, positionTitle } from "@/lib/helpers";
import { todayInManila } from "@/lib/leave-policy";
import { mySignatureUrl } from "@/lib/supabase/leave-forms";
import { buildProbationExtensionPdf } from "@/lib/probation-extension-pdf";
import {
  createProbationExtension,
  draftPeData,
  fetchProbationExtensions,
  longDate,
  peBlocks,
  peConforme,
  pePassed,
  peSignatures,
  peStatusLabel,
  peTotal,
  returnProbationExtension,
  saveProbationExtension,
  signProbationExtension,
  withProbationEnd,
  type PeData,
  type PeSigner,
  type ProbationExtension,
  type Run,
} from "@/lib/probation-extension";

export const input = "w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-2 text-sm";
const lbl = "mb-1 block text-xs font-medium text-[var(--text-secondary)]";
export const primary = "flex items-center gap-1.5 rounded-lg bg-[var(--series-1)] px-3 py-2 text-sm font-medium text-[var(--on-accent)] disabled:opacity-40";
export const secondary = "flex items-center gap-1.5 rounded-lg border border-[var(--border-hairline)] px-3 py-2 text-sm text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40 disabled:opacity-40";

export function useProbationExtensions() {
  const { isRealAccount } = useHris();
  const [items, setItems] = useState<ProbationExtension[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(() => {
    if (!isRealAccount) return;
    fetchProbationExtensions().then(
      (t) => (setItems(t), setError(null)),
      (e: Error) => setError(e.message),
    );
  }, [isRealAccount]);
  useEffect(() => reload(), [reload]);
  return { items, error, reload };
}

export function PeStatus({ item }: { item: ProbationExtension }) {
  const s = peStatusLabel(item);
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

const withInitial = (e: { firstName: string; middleName?: string; lastName: string }) => `${e.firstName}${e.middleName?.trim() ? ` ${e.middleName.trim().charAt(0)}.` : ""} ${e.lastName}`;
const headerLines = () => currentCompany().regularization?.headerLines ?? [currentCompany().info.address].filter(Boolean);
const fileName = (d: PeData) => `Extension of Probationary Employment - ${d.employeeName}.pdf`;
const signedAtOf = (r: Pick<ProbationExtension, "hrSignedAt" | "notedAt" | "approvedAt" | "receivedAt">) => ({ hr: r.hrSignedAt, noted: r.notedAt, approved: r.approvedAt, employee: r.receivedAt });

async function pdfUrl(data: PeData, signatures: Partial<Record<PeSigner, Uint8Array>>, signedAt: Partial<Record<PeSigner, string | null>>) {
  const bytes = await buildProbationExtensionPdf({ data, signatures, signedAt, headerLines: headerLines() });
  return URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
}

// ---- The letter on screen ---------------------------------------------------------

function Runs({ runs }: { runs: Run[] }) {
  return (
    <>
      {runs.map((r, i) =>
        r.b ? (
          <b key={i} className="font-semibold text-black">
            {r.t}
          </b>
        ) : (
          <span key={i}>{r.t}</span>
        ),
      )}
    </>
  );
}

export function LetterView({ item, data, signatures }: { item?: ProbationExtension; data: PeData; signatures?: Partial<Record<PeSigner, string>> }) {
  const s = signatures ?? {};
  const at: Partial<Record<PeSigner, string | null>> = item ? signedAtOf(item) : {};
  const sign = (who: PeSigner, label: string, name: string, title: string) => (
    <div>
      {label && <div className="text-sm">{label}</div>}
      <div className="flex h-12 items-end">
        {/* eslint-disable-next-line @next/next/no-img-element -- signed URL */}
        {s[who] && <img src={s[who]} alt="" className="max-h-12 max-w-[170px] object-contain" />}
      </div>
      <div className="text-sm font-bold uppercase">{name}</div>
      <div className="text-xs">{title}</div>
      {at[who] && <div className="text-[10px] text-neutral-500 italic">Signed {longDate(at[who]!.slice(0, 10))}</div>}
    </div>
  );
  return (
    <div className="rounded-lg bg-white px-5 py-6 font-serif text-[13.5px] leading-relaxed text-neutral-800 shadow-inner sm:px-9">
      <div className="border-b-2 border-black pb-2 text-center">
        <div className="text-lg font-bold tracking-wide text-black uppercase">{data.employerName}</div>
        {headerLines().map((l) => (
          <div key={l} className="text-[11px] text-neutral-500">
            {l}
          </div>
        ))}
      </div>
      <div className="mt-5 space-y-3">
        {peBlocks(data).map((b, i) => {
          if (b.k === "date") return <p key={i}>{b.t}</p>;
          if (b.k === "address")
            return (
              <div key={i}>
                {b.lines.map((l, j) => (
                  <div key={j}>
                    <Runs runs={l} />
                  </div>
                ))}
              </div>
            );
          if (b.k === "subject")
            return (
              <p key={i} className="font-bold text-black">
                Subject: {b.t}
              </p>
            );
          if (b.k === "h")
            return (
              <h3 key={i} className="pt-2 font-bold text-black">
                {b.t}
              </h3>
            );
          if (b.k === "p")
            return (
              <p key={i} className="text-justify">
                <Runs runs={b.runs} />
              </p>
            );
          if (b.k === "list") {
            const L = b.numbered ? "ol" : "ul";
            return (
              <L key={i} className={`space-y-1.5 pl-7 text-justify ${b.numbered ? "list-decimal" : "list-disc"}`}>
                {b.items.map((it, j) => (
                  <li key={j}>
                    <Runs runs={it} />
                  </li>
                ))}
              </L>
            );
          }
          return (
            <table key={i} className="w-full border-collapse text-[13px]">
              <thead>
                <tr>
                  {["Criteria", "Weight", "Score"].map((h) => (
                    <th key={h} className="border border-neutral-700 px-2 py-1 text-left font-bold text-black">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {b.rows.map((r, j) => (
                  <tr key={j}>
                    {r.map((c, k) => (
                      <td key={k} className="border border-neutral-700 px-2 py-1">
                        {c}
                      </td>
                    ))}
                  </tr>
                ))}
                <tr className="font-bold text-black">
                  <td className="border border-neutral-700 px-2 py-1">{b.total[0]}</td>
                  <td className="border border-neutral-700 px-2 py-1" />
                  <td className={`border border-neutral-700 px-2 py-1 ${pePassed(data) ? "text-green-700" : "text-red-700"}`}>{b.total[1]}</td>
                </tr>
              </tbody>
            </table>
          );
        })}
      </div>
      <div className="mt-6 grid gap-6 sm:grid-cols-2">
        {sign("hr", "Sincerely,", data.hrName, data.hrTitle)}
        {sign("noted", "Noted by:", data.notedName, data.notedTitle)}
        {sign("approved", "Approved by:", data.approverName, data.approverTitle)}
      </div>
      <div className="mt-6 rounded border-2 border-black px-4 py-3">
        <div className="text-center font-bold tracking-widest text-black">CONFORME</div>
        <p className="mt-2 text-justify">{peConforme(data)}</p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="flex h-12 items-end">
              {/* eslint-disable-next-line @next/next/no-img-element -- signed URL */}
              {s.employee && <img src={s.employee} alt="" className="max-h-12 max-w-[180px] object-contain" />}
            </div>
            <div className="w-60 border-t border-black pt-0.5 text-sm font-bold uppercase">{data.employeeName}</div>
            <div className="text-xs">Signature over Printed Name</div>
          </div>
          <div className="text-sm">
            Date: <span className="inline-block min-w-[140px] border-b border-black">{at.employee ? longDate(at.employee.slice(0, 10)) : ""}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// Signature images as blob URLs, for the on-screen letter.
function useSignatureUrls(item: ProbationExtension | null) {
  const [urls, setUrls] = useState<Partial<Record<PeSigner, string>>>({});
  useEffect(() => {
    if (!item) return;
    let made: string[] = [];
    let live = true;
    peSignatures(item).then((sigs) => {
      if (!live) return;
      const out: Partial<Record<PeSigner, string>> = {};
      for (const [k, v] of Object.entries(sigs) as [PeSigner, Uint8Array][]) out[k] = URL.createObjectURL(new Blob([v as BlobPart], { type: "image/png" }));
      made = Object.values(out) as string[];
      setUrls(out);
    });
    return () => {
      live = false;
      made.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [item]);
  return urls;
}

// ---- HR: prepare / edit, sign and send ----------------------------------------------

export function PreparePeModal({ item, onClose, onChanged }: { item: ProbationExtension | null; onClose: () => void; onChanged: () => void }) {
  const { employees, currentEmployee } = useHris();
  const today = useMemo(() => todayInManila(), []);
  const people = useMemo(() => employees.filter((e) => e.status === "active" || e.status === "on_leave").sort((a, b) => fullName(a).localeCompare(fullName(b))), [employees]);
  const probationary = people.filter((e) => e.employmentStatus === "probationary");
  const [employeeId, setEmployeeId] = useState(item?.employeeId ?? "");
  const [notedId, setNotedId] = useState(item?.notedId ?? "");
  const [approverId, setApproverId] = useState(item?.approverId ?? currentCompany().regularization?.signatoryId ?? "");
  const [data, setData] = useState<PeData | null>(item?.data ?? null);
  const [hasSignature, setHasSignature] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [viewer, setViewer] = useState<ViewerFile | null>(null);
  const nameOf = (id: string) => {
    const e = employees.find((x) => x.id === id);
    return e ? withInitial(e) : "";
  };

  function pickEmployee(id: string) {
    setEmployeeId(id);
    const e = employees.find((x) => x.id === id);
    if (!e) return setData(null);
    const head = e.supervisorId && e.supervisorId !== currentEmployee?.id ? e.supervisorId : notedId;
    if (head) setNotedId(head);
    setData(
      draftPeData({
        employee: e,
        position: positionTitle(e.positionId).replace(/^—$/, ""),
        department: departmentName(e.departmentId).replace(/^—$/, ""),
        employerName: currentCompany().name,
        today,
        hrName: currentEmployee ? withInitial(currentEmployee) : "",
        notedName: head ? nameOf(head) : "",
        approverName: nameOf(approverId),
      }),
    );
  }
  const set = <K extends keyof PeData>(k: K, v: PeData[K]) => setData((d) => (d ? { ...d, [k]: v } : d));

  const ready = !!data && !!employeeId && !!notedId && !!approverId && !!data.position.trim() && !!data.probationEnds && !!data.extendFrom && !!data.extendTo && !!data.reevalBy;

  async function save(send: boolean) {
    if (!data || !currentEmployee) return;
    setBusy(send ? "send" : "save");
    setError(null);
    try {
      let id = item?.id;
      if (id) await saveProbationExtension(id, notedId, approverId, data);
      else id = await createProbationExtension(employeeId, notedId, approverId, data);
      if (send) await signProbationExtension(id, currentEmployee.id, "hr");
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
      setViewer({ url: await pdfUrl(data, sig ? { hr: sig } : {}, {}), name: fileName(data), kind: "pdf" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't make the preview.");
    } finally {
      setBusy(null);
    }
  }

  const pick = (value: string, onPick: (id: string) => void, exclude: string[]) => (
    <select value={value} onChange={(e) => onPick(e.target.value)} className={input}>
      <option value="">Choose…</option>
      {people
        .filter((e) => !exclude.includes(e.id))
        .map((e) => (
          <option key={e.id} value={e.id}>
            {fullName(e)} — {positionTitle(e.positionId)}
          </option>
        ))}
    </select>
  );

  return (
    <Modal open wide onClose={() => !busy && onClose()} title={item ? `Extension of probation — ${item.employeeName}` : "New extension of probation"}>
      <div className="space-y-4 text-sm">
        {item?.returnedNote && (
          <div className="rounded-lg border border-[var(--status-critical)]/40 px-3 py-2 text-xs text-[var(--text-secondary)]">
            <b className="text-[var(--text-primary)]">Returned by {item.returnedBy}:</b> {item.returnedNote}
          </div>
        )}
        {!item && (
          <div>
            <label className={lbl}>Employee (probationary)</label>
            <select value={employeeId} onChange={(e) => pickEmployee(e.target.value)} className={input}>
              <option value="">Choose…</option>
              {(probationary.length ? probationary : people).map((e) => (
                <option key={e.id} value={e.id}>
                  {fullName(e)} — {positionTitle(e.positionId)}
                </option>
              ))}
            </select>
          </div>
        )}
        {data && (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Name on the letter" value={data.employeeName} onChange={(v) => set("employeeName", v.toUpperCase())} />
              <Field label="Salutation" value={data.salutation} onChange={(v) => set("salutation", v)} />
              <div>
                <label className={lbl}>Ms. / Mr.</label>
                <select value={data.female ? "f" : "m"} onChange={(e) => set("female", e.target.value === "f")} className={input}>
                  <option value="f">Ms.</option>
                  <option value="m">Mr.</option>
                </select>
              </div>
              <Field label="Position" value={data.position} onChange={(v) => set("position", v)} />
              <Field label="Department" value={data.department} onChange={(v) => set("department", v)} />
              <Field label="Letter date" type="date" value={data.letterDate} onChange={(v) => set("letterDate", v)} />
              <Field label="Date hired" type="date" value={data.hiredOn} onChange={(v) => set("hiredOn", v)} />
              <Field label="Probation ends" type="date" value={data.probationEnds} onChange={(v) => setData((d) => (d ? withProbationEnd(d, v) : d))} />
              <Field label="Evaluation completed on" type="date" value={data.evalDate} onChange={(v) => set("evalDate", v)} />
            </div>

            <div>
              <div className="mb-1 text-xs font-semibold tracking-wide text-[var(--text-muted)] uppercase">Evaluation results</div>
              <div className="space-y-1.5">
                {data.scores.map((s, i) => (
                  <div key={i} className="flex gap-2">
                    <input value={s.criteria} onChange={(e) => set("scores", data.scores.map((x, j) => (j === i ? { ...x, criteria: e.target.value } : x)))} className={input} aria-label="Criteria" />
                    <input type="number" value={s.weight || ""} onChange={(e) => set("scores", data.scores.map((x, j) => (j === i ? { ...x, weight: Number(e.target.value) || 0 } : x)))} className={`${input} w-20 text-right`} aria-label="Weight %" placeholder="%" />
                    <input type="number" step="0.01" value={s.score || ""} onChange={(e) => set("scores", data.scores.map((x, j) => (j === i ? { ...x, score: Number(e.target.value) || 0 } : x)))} className={`${input} w-24 text-right`} aria-label="Score" placeholder="Score" />
                    <button onClick={() => set("scores", data.scores.filter((_, j) => j !== i))} className="rounded p-2 text-[var(--text-muted)] hover:text-[var(--status-critical)]" aria-label="Remove">
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <button onClick={() => set("scores", [...data.scores, { criteria: "", weight: 0, score: 0 }])} disabled={data.scores.length >= 8} className={`${secondary} text-xs`}>
                  <Plus size={13} /> Add a row
                </button>
                <label className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
                  Passing score <input type="number" value={data.passingScore || ""} onChange={(e) => set("passingScore", Number(e.target.value) || 0)} className={`${input} w-20 text-right`} />
                </label>
                <span className="text-xs">
                  Actual score <b className={pePassed(data) ? "text-[var(--status-good)]" : "text-[var(--status-critical)]"}>{peTotal(data)}</b>
                </span>
              </div>
            </div>

            <Area label="What the Department Head noted / why the extension" value={data.remarks} onChange={(v) => set("remarks", v)} rows={4} />

            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Extended from" type="date" value={data.extendFrom} onChange={(v) => set("extendFrom", v)} />
              <Field label="Extended until" type="date" value={data.extendTo} onChange={(v) => set("extendTo", v)} />
              <Field label="Re-evaluation on or before" type="date" value={data.reevalBy} onChange={(v) => set("reevalBy", v)} />
            </div>

            <div>
              <div className="mb-1 text-xs font-semibold tracking-wide text-[var(--text-muted)] uppercase">Areas to improve (standards)</div>
              <div className="space-y-2">
                {data.standards.map((s, i) => (
                  <div key={i} className="flex gap-2">
                    <div className="flex-1 space-y-1">
                      <input value={s.title} onChange={(e) => set("standards", data.standards.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} placeholder="Title (e.g. Sales target)" className={`${input} font-medium`} />
                      <textarea value={s.text} onChange={(e) => set("standards", data.standards.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))} rows={2} className={input} />
                    </div>
                    <button onClick={() => set("standards", data.standards.filter((_, j) => j !== i))} className="self-start rounded p-2 text-[var(--text-muted)] hover:text-[var(--status-critical)]" aria-label="Remove">
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
              <button onClick={() => set("standards", [...data.standards, { title: "", text: "" }])} disabled={data.standards.length >= 12} className={`${secondary} mt-2 text-xs`}>
                <Plus size={13} /> Add a standard
              </button>
            </div>

            <Area label="Closing paragraph" value={data.closing} onChange={(v) => set("closing", v)} rows={2} />

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className={lbl}>Noted by (printed only)</label>
                {pick(notedId, (id) => (setNotedId(id), set("notedName", nameOf(id))), [employeeId])}
              </div>
              <Field label="Their title" value={data.notedTitle} onChange={(v) => set("notedTitle", v)} />
              <div>
                <label className={lbl}>Approved by (printed only)</label>
                {pick(approverId, (id) => (setApproverId(id), set("approverName", nameOf(id))), [employeeId])}
              </div>
              <Field label="Their title" value={data.approverTitle} onChange={(v) => set("approverTitle", v)} />
              <Field label="HR name (Sincerely)" value={data.hrName} onChange={(v) => set("hrName", v)} />
              <Field label="HR title" value={data.hrTitle} onChange={(v) => set("hrTitle", v)} />
            </div>

            <MySignature onChange={setHasSignature} />
            <div className="text-xs text-[var(--text-muted)]">
              Sending signs the letter as HR and sends it to {data.employeeName || "the employee"} right away: they see it as soon as they sign in and sign the conforme. Noted by and Approved by are printed on the letter only — they don&rsquo;t sign.
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
            {busy === "send" ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} Sign &amp; send
          </button>
        </div>
      </div>
      {viewer && <FileViewer file={viewer} onClose={() => (URL.revokeObjectURL(viewer.url), setViewer(null))} />}
    </Modal>
  );
}

function Field({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <div>
      <label className={lbl}>{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} className={input} />
    </div>
  );
}
function Area({ label, value, onChange, rows }: { label: string; value: string; onChange: (v: string) => void; rows: number }) {
  return (
    <div>
      <label className={lbl}>{label}</label>
      <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={rows} className={input} />
    </div>
  );
}

// ---- Noted by / Approved by / the employee's CONFORME --------------------------------

export function SignPeModal({ item, as, onClose, onChanged }: { item: ProbationExtension; as: Exclude<PeSigner, "hr">; onClose: () => void; onChanged: () => void }) {
  const { currentEmployee } = useHris();
  const [hasSignature, setHasSignature] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [returning, setReturning] = useState(false);
  const [note, setNote] = useState("");
  const sigs = useSignatureUrls(item);
  const d = item.data;
  const me = currentEmployee?.id ?? "";
  const employee = as === "employee";

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

  const title = employee ? "Important notice — please read and sign" : as === "noted" ? `Note the extension — ${item.employeeName}` : `Approve the extension — ${item.employeeName}`;
  const signLabel = employee ? "Sign the Conforme" : as === "noted" ? "Sign as Noted by" : "Sign as Approved by";

  return (
    <Modal open wide onClose={() => !busy && onClose()} title={title}>
      <div className="space-y-4 text-sm">
        {employee ? (
          <div className="overflow-hidden rounded-xl border-2 border-[var(--status-critical)]">
            <div className="flex items-center gap-2 bg-[var(--status-critical)] px-4 py-2.5 font-bold tracking-wide text-white uppercase">
              <AlertTriangle size={18} className="shrink-0 animate-pulse" /> Action required: Extension of your probationary employment
            </div>
            <div className="grid gap-3 p-4 sm:grid-cols-3" style={{ background: "color-mix(in srgb, var(--status-critical) 8%, var(--surface-1))" }}>
              <Fact icon={<CalendarClock size={16} />} label="Probation extended until" value={longDate(d.extendTo)} />
              <Fact icon={<Target size={16} />} label="Re-evaluation on or before" value={longDate(d.reevalBy)} />
              <Fact icon={<AlertTriangle size={16} />} label="Passing score needed" value={`${d.passingScore} (you got ${peTotal(d)})`} />
            </div>
          </div>
        ) : (
          <p className="text-[var(--text-secondary)]">
            {as === "noted"
              ? `HR (${item.hrName ?? "—"}) sent this extension of probation to ${item.employeeName}. Sign as Noted by.`
              : `HR (${item.hrName ?? "—"}) sent this extension of probation to ${item.employeeName}. Sign as Approved by.`}
            {item.status === "employee" ? " If something needs changing, you can return it to HR while the employee hasn't signed yet." : ` ${item.employeeName} already signed the conforme.`}
          </p>
        )}

        <div className="max-h-[55vh] overflow-y-auto rounded-xl border border-[var(--border-hairline)] bg-neutral-100 p-2 sm:p-3">
          <LetterView item={item} data={d} signatures={sigs} />
        </div>
        <div className="flex justify-end">
          <ViewPeButton item={item} />
        </div>

        {employee && (
          <label className="flex items-start gap-2 rounded-lg border-2 border-[var(--series-1)]/60 bg-[var(--gridline)]/20 px-3 py-2.5">
            <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5 h-4 w-4" />
            <span className="text-[var(--text-primary)]">
              <b>CONFORME.</b> {peConforme(d)}
            </span>
          </label>
        )}
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
              <button onClick={() => run("return", () => returnProbationExtension(item.id, note))} disabled={!!busy || !note.trim()} className={primary}>
                {busy === "return" ? <Loader2 size={15} className="animate-spin" /> : <Undo2 size={15} />} Return to HR
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap justify-end gap-2">
            {!employee && item.status === "employee" && (
              <button onClick={() => setReturning(true)} disabled={!!busy} className={secondary}>
                <Undo2 size={15} /> Return to HR
              </button>
            )}
            <button onClick={() => run("sign", () => signProbationExtension(item.id, me, as))} disabled={!!busy || !hasSignature || (employee && !agreed)} className={primary}>
              {busy === "sign" ? <Loader2 size={15} className="animate-spin" /> : <Signature size={15} />} {signLabel}
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}

function Fact({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-xs font-medium text-[var(--status-critical)]">
        {icon} {label}
      </div>
      <div className="mt-0.5 text-base font-bold text-[var(--text-primary)]">{value}</div>
    </div>
  );
}

// ---- Viewing / printing ---------------------------------------------------------------

export function ViewPeButton({ item }: { item: ProbationExtension }) {
  const [viewer, setViewer] = useState<ViewerFile | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function open() {
    setBusy(true);
    setError(null);
    try {
      setViewer({ url: await pdfUrl(item.data, await peSignatures(item), signedAtOf(item)), name: fileName(item.data), kind: "pdf" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't open it.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <button onClick={open} disabled={busy} className="flex items-center gap-1 rounded-lg border border-[var(--border-hairline)] px-2 py-1 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40 disabled:opacity-50">
        {busy ? <Loader2 size={12} className="animate-spin" /> : <Eye size={12} />} View / print PDF
      </button>
      {error && <div className="text-[11px] text-[var(--status-critical)]">{error}</div>}
      {viewer && <FileViewer file={viewer} onClose={() => (URL.revokeObjectURL(viewer.url), setViewer(null))} />}
    </>
  );
}
