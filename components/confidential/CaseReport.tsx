"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Download, FileText, Loader2, Paperclip, Plus, Trash2, Upload, X } from "lucide-react";
import { todayInManila } from "@/lib/leave-policy";
import { Badge } from "@/components/Badge";
import { FileViewer, canView, viewerKind, type ViewerFile } from "@/components/FileViewer";
import { currentCompany } from "@/lib/companies";
import { formatDate } from "@/lib/helpers";
import { buildCasePdf } from "@/lib/confidential-cases-pdf";
import {
  CASE_FILE_ACCEPT,
  CASE_STATUS,
  caseFileUrl,
  caseFiles,
  inlineRuns,
  removeCaseFile,
  textBlocks,
  uploadCaseFile,
  uploadSignedExplanation,
  type CaseInput,
  type CaseSection,
  type CaseStatus,
  type ConfidentialCase,
  type CaseFile,
} from "@/lib/confidential-cases";

const input = "w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-2 text-sm";
const lbl = "mb-1 block text-xs font-medium text-[var(--text-secondary)]";
const small = "flex items-center gap-1 rounded-lg border border-[var(--border-hairline)] px-2 py-1 text-xs text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40 disabled:opacity-40";

function Inline({ text }: { text: string }) {
  return (
    <>
      {inlineRuns(text).map((r, i) => (r.b ? <b key={i}>{r.t}</b> : <span key={i}>{r.t}</span>))}
    </>
  );
}

export function CaseStatusBadge({ status }: { status: CaseStatus }) {
  return <Badge tone={CASE_STATUS[status].tone}>{CASE_STATUS[status].label}</Badge>;
}

// ---- Reading a case ---------------------------------------------------------------

export function CaseView({ c }: { c: ConfidentialCase }) {
  const cell = "border border-[var(--border-hairline)] px-2.5 py-1.5 align-top";
  return (
    <div className="space-y-4 text-sm text-[var(--text-primary)]">
      <div>
        <div className="text-lg font-semibold">{c.title}</div>
        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-[var(--text-muted)]">
          {formatDate(c.caseDate)} · <CaseStatusBadge status={c.status} /> · by {c.createdByName || "HR"}
          {c.updatedAt && ` · updated ${formatDate(c.updatedAt)} by ${c.updatedByName ?? "HR"}`}
        </div>
        <div className="mt-2 font-semibold text-[var(--status-critical)]">CONFIDENTIAL — For the Chairman, the Vice Chairperson and HR only.</div>
        {c.summary.trim() && <p className="mt-1 text-[var(--text-secondary)] italic">{c.summary}</p>}
      </div>

      {c.details.some((d) => d.value.trim()) && (
        <section>
          <h3 className="mb-1.5 font-semibold">Report Details</h3>
          <table className="w-full border-collapse text-xs">
            <tbody>
              {c.details
                .filter((d) => d.label.trim() || d.value.trim())
                .map((d, i) => (
                  <tr key={i}>
                    <td className={`${cell} w-44 bg-[var(--gridline)]/25 font-medium`}>{d.label}</td>
                    <td className={`${cell} whitespace-pre-wrap`}>
                      <Inline text={d.value} />
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </section>
      )}

      {c.sections.map((s, i) => (
        <section key={i}>
          {s.heading.trim() && <h3 className="mb-1.5 font-semibold">{s.heading}</h3>}
          {s.kind === "table" ? (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-xs">
                <tbody>
                  {s.rows
                    .filter((r, ri) => ri === 0 || r.some((x) => x.trim()))
                    .map((r, ri) => (
                      <tr key={ri} className={ri === 0 ? "bg-[var(--gridline)]/25 font-semibold" : ""}>
                        {r.map((x, ci) => (
                          <td key={ci} className={`${cell} whitespace-pre-wrap`}>
                            <Inline text={x} />
                          </td>
                        ))}
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="space-y-1.5 text-[var(--text-secondary)]">
              {textBlocks(s.body).map((b, bi) =>
                b.kind === "p" ? (
                  <p key={bi}>
                    <Inline text={b.text} />
                  </p>
                ) : (
                  <ul key={bi} className="list-disc space-y-0.5 pl-5">
                    {b.items.map((it, ii) => (
                      <li key={ii}>
                        <Inline text={it} />
                      </li>
                    ))}
                  </ul>
                ),
              )}
            </div>
          )}
        </section>
      ))}

      {c.actions.length > 0 && (
        <section>
          <h3 className="mb-1.5 font-semibold">Actions Taken and Next Steps</h3>
          <ul className="space-y-1 text-[var(--text-secondary)]">
            {c.actions.map((a, i) => (
              <li key={i} className={a.done ? "" : ""}>
                {a.done ? "☒" : "☐"} <Inline text={a.text} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

export function DownloadCaseButton({ c }: { c: ConfidentialCase }) {
  const [viewer, setViewer] = useState<ViewerFile | null>(null);
  const [busy, setBusy] = useState(false);
  async function open() {
    setBusy(true);
    try {
      const bytes = await buildCasePdf(c, currentCompany().name);
      setViewer({ url: URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" })), name: `CONFIDENTIAL - ${c.title}.pdf`, kind: "pdf" });
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <button onClick={open} disabled={busy} className={small}>
        {busy ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />} PDF / print
      </button>
      {viewer && <FileViewer file={viewer} onClose={() => (URL.revokeObjectURL(viewer.url), setViewer(null))} />}
    </>
  );
}

// ---- Written explanations ------------------------------------------------------------

// Who was asked to explain, and their signed explanation once HR uploads it.
export function CaseExplanations({ c, canManage, onChanged }: { c: ConfidentialCase; canManage: boolean; onChanged: () => void }) {
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [viewer, setViewer] = useState<ViewerFile | null>(null);
  const pick = useRef<HTMLInputElement>(null);
  const [target, setTarget] = useState<number | null>(null);
  if (!c.explanations.length) return null;
  const received = c.explanations.filter((x) => x.receivedOn).length;

  async function upload(i: number, file: File) {
    setBusy(i);
    setError(null);
    try {
      await uploadSignedExplanation(c, i, file, todayInManila());
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't upload.");
    } finally {
      setBusy(null);
    }
  }
  async function open(path: string, name: string) {
    const url = await caseFileUrl(path);
    if (canView(name)) setViewer({ url, name, kind: viewerKind(name) });
    else window.open(url, "_blank", "noopener");
  }

  return (
    <section>
      <h3 className="mb-1.5 text-sm font-semibold text-[var(--text-primary)]">
        Written Explanations ({received} of {c.explanations.length} received)
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="bg-[var(--gridline)]/25 text-left">
              <th className="border border-[var(--border-hairline)] px-2.5 py-1.5 font-semibold">Name</th>
              <th className="border border-[var(--border-hairline)] px-2.5 py-1.5 font-semibold">Requested</th>
              <th className="border border-[var(--border-hairline)] px-2.5 py-1.5 font-semibold">Signed explanation</th>
            </tr>
          </thead>
          <tbody>
            {c.explanations.map((x, i) => (
              <tr key={i}>
                <td className="border border-[var(--border-hairline)] px-2.5 py-1.5 text-[var(--text-primary)]">{x.name}</td>
                <td className="border border-[var(--border-hairline)] px-2.5 py-1.5 text-[var(--text-secondary)]">{x.requestedOn ? formatDate(x.requestedOn) : "—"}</td>
                <td className="border border-[var(--border-hairline)] px-2.5 py-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    {x.receivedOn && x.path ? (
                      <>
                        <span className="font-medium text-[var(--status-good)]">Received {formatDate(x.receivedOn)}</span>
                        <button onClick={() => open(x.path, x.fileName)} className="flex items-center gap-1 text-[var(--series-1)] hover:underline">
                          <FileText size={12} /> {x.fileName}
                        </button>
                      </>
                    ) : (
                      <span className="text-[var(--status-warning)]">Awaiting</span>
                    )}
                    {canManage && (
                      <button
                        onClick={() => {
                          setTarget(i);
                          pick.current?.click();
                        }}
                        disabled={busy !== null}
                        className={`${small} ml-auto`}
                      >
                        {busy === i ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />} {x.path ? "Replace" : "Upload signed explanation"}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {error && <div className="mt-1 text-xs text-[var(--status-critical)]">{error}</div>}
      <input
        ref={pick}
        type="file"
        accept={CASE_FILE_ACCEPT}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f && target !== null) upload(target, f);
        }}
      />
      {viewer && <FileViewer file={viewer} onClose={() => setViewer(null)} />}
    </section>
  );
}

// ---- Attachments ----------------------------------------------------------------------

export function CaseFiles({ caseId, canManage }: { caseId: string; canManage: boolean }) {
  const [list, setList] = useState<CaseFile[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewer, setViewer] = useState<ViewerFile | null>(null);
  const pick = useRef<HTMLInputElement>(null);
  const load = useCallback(() => {
    caseFiles(caseId).then(setList, (e: Error) => setError(e.message));
  }, [caseId]);
  useEffect(() => load(), [load]);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save.");
    } finally {
      setBusy(false);
    }
  }
  async function open(f: CaseFile) {
    const url = await caseFileUrl(f.path);
    if (canView(f.name)) setViewer({ url, name: f.name, kind: viewerKind(f.name) });
    else window.open(url, "_blank", "noopener");
  }

  return (
    <section>
      <div className="mb-1.5 flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-[var(--text-primary)]">
          <Paperclip size={14} /> Attachments
        </h3>
        {canManage && (
          <button onClick={() => pick.current?.click()} disabled={busy} className={small}>
            {busy ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />} Attach a file
          </button>
        )}
      </div>
      {list && !list.length && <div className="text-xs text-[var(--text-muted)]">No files attached (e.g. written explanations, statements, photos).</div>}
      <ul className="space-y-1">
        {list?.map((f) => (
          <li key={f.path} className="flex items-center justify-between gap-2 rounded-lg bg-[var(--gridline)]/20 px-2.5 py-1.5 text-xs">
            <button onClick={() => open(f)} className="flex min-w-0 items-center gap-1.5 text-left text-[var(--series-1)] hover:underline">
              <FileText size={13} className="shrink-0" /> <span className="truncate">{f.name}</span>
            </button>
            <span className="flex shrink-0 items-center gap-2 text-[var(--text-muted)]">
              {formatDate(f.uploadedAt)}
              {canManage && (
                <button onClick={() => run(() => removeCaseFile(f.path))} disabled={busy} className="hover:text-[var(--status-critical)]" aria-label="Remove file">
                  <X size={13} />
                </button>
              )}
            </span>
          </li>
        ))}
      </ul>
      {error && <div className="mt-1 text-xs text-[var(--status-critical)]">{error}</div>}
      <input
        ref={pick}
        type="file"
        accept={CASE_FILE_ACCEPT}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f)
            run(async () => {
              await uploadCaseFile(caseId, f);
            });
        }}
      />
      {viewer && <FileViewer file={viewer} onClose={() => setViewer(null)} />}
    </section>
  );
}

// ---- HR: writing a case -----------------------------------------------------------------

export function CaseEditor({ value, onChange }: { value: CaseInput; onChange: (v: CaseInput) => void }) {
  const set = <K extends keyof CaseInput>(k: K, v: CaseInput[K]) => onChange({ ...value, [k]: v });
  const setSection = (i: number, patch: Partial<CaseSection>) => set("sections", value.sections.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const move = <T,>(list: T[], i: number, d: number) => {
    const out = [...list];
    const j = i + d;
    if (j < 0 || j >= out.length) return out;
    [out[i], out[j]] = [out[j], out[i]];
    return out;
  };

  return (
    <div className="space-y-5 text-sm">
      <div className="grid gap-3 sm:grid-cols-[1fr_160px_190px]">
        <div>
          <label className={lbl}>Title</label>
          <input value={value.title} onChange={(e) => set("title", e.target.value)} maxLength={200} className={input} />
        </div>
        <div>
          <label className={lbl}>Date</label>
          <input type="date" value={value.caseDate} onChange={(e) => set("caseDate", e.target.value)} className={input} />
        </div>
        <div>
          <label className={lbl}>Status</label>
          <select value={value.status} onChange={(e) => set("status", e.target.value as CaseStatus)} className={input}>
            {(Object.keys(CASE_STATUS) as CaseStatus[]).map((s) => (
              <option key={s} value={s}>
                {CASE_STATUS[s].label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className={lbl}>Summary (shown under the CONFIDENTIAL line)</label>
        <textarea value={value.summary} onChange={(e) => set("summary", e.target.value)} rows={2} maxLength={2000} className={input} />
      </div>

      <div>
        <div className="mb-1.5 text-xs font-semibold tracking-wide text-[var(--text-muted)] uppercase">Report details</div>
        <div className="space-y-1.5">
          {value.details.map((d, i) => (
            <div key={i} className="flex gap-2">
              <input value={d.label} onChange={(e) => set("details", value.details.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} placeholder="Item" className={`${input} w-48 shrink-0`} />
              <textarea
                value={d.value}
                onChange={(e) => set("details", value.details.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))}
                rows={1}
                placeholder="Details"
                className={input}
              />
              <button onClick={() => set("details", value.details.filter((_, j) => j !== i))} className="rounded p-2 text-[var(--text-muted)] hover:text-[var(--status-critical)]" aria-label="Remove row">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
        <button onClick={() => set("details", [...value.details, { label: "", value: "" }])} className={`${small} mt-2`}>
          <Plus size={12} /> Add a row
        </button>
      </div>

      <div>
        <div className="mb-1.5 text-xs font-semibold tracking-wide text-[var(--text-muted)] uppercase">Sections</div>
        <p className="mb-2 text-xs text-[var(--text-muted)]">
          In text: start a line with &ldquo;- &rdquo; for a bullet, and wrap words in **double asterisks** for bold.
        </p>
        <div className="space-y-3">
          {value.sections.map((s, i) => (
            <div key={i} className="space-y-2 rounded-lg border border-[var(--border-hairline)] p-3">
              <div className="flex gap-2">
                <input value={s.heading} onChange={(e) => setSection(i, { heading: e.target.value })} placeholder="Heading, e.g. Background" className={`${input} font-medium`} />
                <button onClick={() => set("sections", move(value.sections, i, -1))} className="rounded p-2 text-[var(--text-muted)]" aria-label="Move up">
                  <ArrowUp size={14} />
                </button>
                <button onClick={() => set("sections", move(value.sections, i, 1))} className="rounded p-2 text-[var(--text-muted)]" aria-label="Move down">
                  <ArrowDown size={14} />
                </button>
                <button onClick={() => set("sections", value.sections.filter((_, j) => j !== i))} className="rounded p-2 text-[var(--text-muted)] hover:text-[var(--status-critical)]" aria-label="Remove section">
                  <Trash2 size={14} />
                </button>
              </div>
              {s.kind === "text" ? (
                <textarea value={s.body} onChange={(e) => setSection(i, { body: e.target.value })} rows={6} className={input} />
              ) : (
                <TableEditor rows={s.rows} onChange={(rows) => setSection(i, { rows })} />
              )}
            </div>
          ))}
        </div>
        <div className="mt-2 flex gap-2">
          <button onClick={() => set("sections", [...value.sections, { heading: "", kind: "text", body: "", rows: [] }])} className={small}>
            <Plus size={12} /> Text section
          </button>
          <button
            onClick={() =>
              set("sections", [
                ...value.sections,
                {
                  heading: "",
                  kind: "table",
                  body: "",
                  rows: [
                    ["", "", ""],
                    ["", "", ""],
                  ],
                },
              ])
            }
            className={small}
          >
            <Plus size={12} /> Table section
          </button>
        </div>
      </div>

      <div>
        <div className="mb-1.5 text-xs font-semibold tracking-wide text-[var(--text-muted)] uppercase">Actions taken and next steps</div>
        <div className="space-y-1.5">
          {value.actions.map((a, i) => (
            <div key={i} className="flex items-center gap-2">
              <input type="checkbox" checked={a.done} onChange={(e) => set("actions", value.actions.map((x, j) => (j === i ? { ...x, done: e.target.checked } : x)))} aria-label="Done" />
              <input value={a.text} onChange={(e) => set("actions", value.actions.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))} className={input} />
              <button onClick={() => set("actions", value.actions.filter((_, j) => j !== i))} className="rounded p-2 text-[var(--text-muted)] hover:text-[var(--status-critical)]" aria-label="Remove">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
        <button onClick={() => set("actions", [...value.actions, { text: "", done: false }])} className={`${small} mt-2`}>
          <Plus size={12} /> Add an action
        </button>
      </div>

      <div>
        <div className="mb-1.5 text-xs font-semibold tracking-wide text-[var(--text-muted)] uppercase">Written explanations requested</div>
        <p className="mb-2 text-xs text-[var(--text-muted)]">Who was asked to explain. Upload each signed explanation from the case page once you receive it.</p>
        <div className="space-y-1.5">
          {value.explanations.map((x, i) => (
            <div key={i} className="flex items-center gap-2">
              <input value={x.name} onChange={(e) => set("explanations", value.explanations.map((y, j) => (j === i ? { ...y, name: e.target.value } : y)))} placeholder="Name" className={input} />
              <input
                type="date"
                value={x.requestedOn}
                onChange={(e) => set("explanations", value.explanations.map((y, j) => (j === i ? { ...y, requestedOn: e.target.value } : y)))}
                className={`${input} w-44 shrink-0`}
                aria-label="Requested on"
              />
              <span className={`w-28 shrink-0 text-xs ${x.receivedOn ? "text-[var(--status-good)]" : "text-[var(--status-warning)]"}`}>{x.receivedOn ? `Received ${formatDate(x.receivedOn)}` : "Awaiting"}</span>
              <button
                onClick={() => set("explanations", value.explanations.filter((_, j) => j !== i))}
                disabled={!!x.path}
                title={x.path ? "Has an uploaded explanation" : "Remove"}
                className="rounded p-2 text-[var(--text-muted)] hover:text-[var(--status-critical)] disabled:opacity-30"
                aria-label="Remove"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
        <button onClick={() => set("explanations", [...value.explanations, { name: "", requestedOn: value.caseDate, receivedOn: "", path: "", fileName: "" }])} className={`${small} mt-2`}>
          <Plus size={12} /> Add a person
        </button>
      </div>

      <div>
        <div className="mb-1.5 text-xs font-semibold tracking-wide text-[var(--text-muted)] uppercase">Sign-off (printed lines)</div>
        <div className="space-y-1.5">
          {value.signoff.map((s, i) => (
            <div key={i} className="flex gap-2">
              <input value={s.label} onChange={(e) => set("signoff", value.signoff.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} placeholder="Prepared by / Noted by" className={`${input} w-48 shrink-0`} />
              <input value={s.title} onChange={(e) => set("signoff", value.signoff.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} placeholder="Title" className={input} />
              <button onClick={() => set("signoff", value.signoff.filter((_, j) => j !== i))} className="rounded p-2 text-[var(--text-muted)] hover:text-[var(--status-critical)]" aria-label="Remove">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
        <button onClick={() => set("signoff", [...value.signoff, { label: "Noted by", title: "" }])} disabled={value.signoff.length >= 4} className={`${small} mt-2`}>
          <Plus size={12} /> Add a signer
        </button>
      </div>
    </div>
  );
}

function TableEditor({ rows, onChange }: { rows: string[][]; onChange: (rows: string[][]) => void }) {
  const cols = Math.max(1, ...rows.map((r) => r.length));
  const grid = rows.map((r) => Array.from({ length: cols }, (_, i) => r[i] ?? ""));
  const setCell = (ri: number, ci: number, v: string) => onChange(grid.map((r, i) => (i === ri ? r.map((x, j) => (j === ci ? v : x)) : r)));
  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-xs">
          <tbody>
            {grid.map((r, ri) => (
              <tr key={ri}>
                {r.map((x, ci) => (
                  <td key={ci} className="border border-[var(--border-hairline)] p-0.5 align-top">
                    <textarea value={x} onChange={(e) => setCell(ri, ci, e.target.value)} rows={ri === 0 ? 1 : 2} placeholder={ri === 0 ? "Column heading" : ""} className={`w-full min-w-28 resize-y bg-transparent px-1.5 py-1 ${ri === 0 ? "font-semibold" : ""}`} />
                  </td>
                ))}
                <td className="w-7 align-top">
                  {ri > 0 && (
                    <button onClick={() => onChange(grid.filter((_, i) => i !== ri))} className="p-1 text-[var(--text-muted)] hover:text-[var(--status-critical)]" aria-label="Remove row">
                      <X size={12} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-1.5 flex gap-2">
        <button onClick={() => onChange([...grid, Array(cols).fill("")])} className={small}>
          <Plus size={12} /> Row
        </button>
        <button onClick={() => onChange(grid.map((r) => [...r, ""]))} disabled={cols >= 6} className={small}>
          <Plus size={12} /> Column
        </button>
        <button onClick={() => onChange(grid.map((r) => r.slice(0, -1)))} disabled={cols <= 1} className={small}>
          <Trash2 size={12} /> Last column
        </button>
      </div>
    </div>
  );
}

