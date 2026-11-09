"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Check, FileText, Plus, Save, Send, Trash2, Undo2, X } from "lucide-react";
import { useHris } from "@/lib/store";
import { Badge } from "@/components/Badge";
import { FileViewer, type ViewerFile } from "@/components/FileViewer";
import { MySignature } from "@/components/leave/LeaveApplication";
import { currentCompany } from "@/lib/companies";
import { fullName, positionTitle } from "@/lib/helpers";
import { reportSaveError } from "@/lib/save-errors";
import { buildRequisitionPdf } from "@/lib/requisition-pdf";
import {
  DECISIONS,
  EDUCATION,
  EMPLOYMENT_TYPES,
  HR_ACTIONS,
  PRF_STATUS,
  REQUEST_TYPES,
  createRequisition,
  decideRequisition,
  deleteRequisition,
  fetchPrfApproverId,
  fetchRequisitions,
  hrReviewRequisition,
  prfApproverTitle,
  prfSignatures,
  returnRequisition,
  submitRequisition,
  updateRequisition,
  type Decision,
  type PrfPatch,
  type Requisition,
} from "@/lib/requisition";
import { usePeople } from "@/components/hiring/Hiring";

/* eslint-disable @next/next/no-img-element -- signature images */

const input = "w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-2 text-sm disabled:opacity-70";
const lbl = "mb-1 block text-xs font-medium text-[var(--text-secondary)]";
const primary = "flex items-center gap-1.5 rounded-lg bg-[var(--series-1)] px-3 py-2 text-sm font-medium text-[var(--on-accent)] disabled:opacity-40";
const secondary = "flex items-center gap-1.5 rounded-lg border border-[var(--border-hairline)] px-3 py-2 text-sm text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40 disabled:opacity-40";
const danger = "flex items-center gap-1.5 rounded-lg border border-[var(--status-critical)]/50 px-3 py-2 text-sm text-[var(--status-critical)] hover:bg-[var(--status-critical)]/10 disabled:opacity-40";
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }) : "");

type Role = { isHr: boolean; me: string; approverId: string | null };
export function prfNeedsMe(r: Requisition, role: Role): boolean {
  if (r.createdBy === role.me && r.status === "draft") return true;
  if (role.isHr && r.status === "hr_review") return true;
  if (role.approverId === role.me && r.status === "approval") return true;
  return false;
}

export async function loadLogo(path: string | undefined): Promise<Uint8Array | null> {
  if (!path) return null;
  try {
    const res = await fetch(path);
    return res.ok ? new Uint8Array(await res.arrayBuffer()) : null;
  } catch {
    return null;
  }
}

export function Requisitions({ initialOpen = null }: { initialOpen?: string | null } = {}) {
  const { currentUser, currentEmployee, branches, departments } = useHris();
  const roles = currentUser?.roles ?? [];
  const isHr = roles.includes("hr_admin");
  const canStart = roles.some((r) => r === "dept_head" || r === "hr_admin" || r === "upper_management");
  const me = currentEmployee?.id ?? "";
  const [list, setList] = useState<Requisition[] | null>(null);
  const [approverId, setApproverId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(initialOpen);
  const [tab, setTab] = useState<"mine" | "all">("mine");
  const role: Role = { isHr, me, approverId };

  const load = useCallback(() => {
    fetchRequisitions().then(
      (l) => {
        setList(l);
        setError(null);
      },
      (e) => setError(e instanceof Error ? e.message : "Couldn't load requests."),
    );
    fetchPrfApproverId().then(setApproverId, () => {});
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function startNew() {
    try {
      const id = await createRequisition({
        position: "New position",
        requestedByName: currentEmployee ? `${currentEmployee.firstName} ${currentEmployee.lastName}`.trim() : "",
        requestedByPosition: currentEmployee ? positionTitle(currentEmployee.positionId) : "",
        branchId: currentEmployee?.branchId ?? null,
        departmentId: currentEmployee?.departmentId ?? null,
      });
      load();
      setOpen(id);
    } catch (e) {
      reportSaveError("Couldn't start a request", e);
    }
  }

  const current = list?.find((r) => r.id === open);
  if (current) return <RequisitionForm r={current} role={role} onBack={() => setOpen(null)} onChanged={load} />;

  const mine = (list ?? []).filter((r) => prfNeedsMe(r, role));
  const shown = tab === "mine" ? mine : (list ?? []);
  const place = (r: Requisition) => [branches.find((b) => b.id === r.branchId)?.name, departments.find((d) => d.id === r.departmentId)?.name].filter(Boolean).join(" · ");

  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--text-secondary)]">
        Personnel Requisition Form (HR-PRF-001): the Branch / Department Head fills it in and signs → HR reviews and recommends → the {prfApproverTitle()} approves. Approved requests can be linked to applicants.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {canStart && (
          <button onClick={startNew} className={primary}>
            <Plus size={16} /> New personnel requisition
          </button>
        )}
        <div className="flex gap-1 text-sm">
          {(
            [
              ["mine", `Needs my action${mine.length ? ` (${mine.length})` : ""}`],
              ["all", "All requests"],
            ] as const
          ).map(([k, label]) => (
            <button key={k} onClick={() => setTab(k)} className={`rounded-full px-3 py-1 ${tab === k ? "bg-[var(--series-1)] text-[var(--on-accent)]" : "border border-[var(--border-hairline)] text-[var(--text-secondary)]"}`}>
              {label}
            </button>
          ))}
        </div>
        {isHr && !approverId && <span className="text-xs text-[var(--status-warning)]">Choose the {prfApproverTitle()} for requisitions in Settings (Applicants tab).</span>}
      </div>
      {error && <div className="text-sm text-[var(--status-critical)]">{error}</div>}
      {list === null && !error && <div className="text-sm text-[var(--text-muted)]">Loading…</div>}
      {list && shown.length === 0 && <div className="rounded-xl border border-dashed border-[var(--border-hairline)] p-6 text-center text-sm text-[var(--text-muted)]">{tab === "mine" ? "Nothing needs your action." : "No requests yet."}</div>}
      <div className="space-y-2">
        {shown.map((r) => (
          <button key={r.id} onClick={() => setOpen(r.id)} className="flex w-full flex-wrap items-center gap-3 rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-1)] p-3 text-left hover:bg-[var(--gridline)]/30">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-[var(--text-primary)]">
                {r.position} <span className="font-normal text-[var(--text-muted)]">× {r.personnelNeeded}</span>
              </div>
              <div className="truncate text-xs text-[var(--text-muted)]">{[r.prfNo, place(r), r.requestedByName && `by ${r.requestedByName}`].filter(Boolean).join(" · ")}</div>
            </div>
            {prfNeedsMe(r, role) && <Badge tone="warning">Needs your action</Badge>}
            <Badge tone={PRF_STATUS[r.status].tone}>{PRF_STATUS[r.status].label}</Badge>
          </button>
        ))}
      </div>
    </div>
  );
}

function Checks<T extends string>({ options, value, onChange, disabled }: { options: [T, string][]; value: T | null; onChange: (v: T) => void; disabled?: boolean }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5">
      {options.map(([k, label]) => (
        <label key={k} className={`flex items-center gap-1.5 text-sm ${disabled ? "opacity-80" : "cursor-pointer"}`}>
          <input type="radio" checked={value === k} disabled={disabled} onChange={() => onChange(k)} /> {label}
        </label>
      ))}
    </div>
  );
}

function Part({ letter, title, sub, children }: { letter: string; title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-1)]">
      <div className="flex items-baseline gap-2 rounded-t-xl bg-[var(--series-1)]/12 px-4 py-2">
        <span className="text-sm font-semibold text-[var(--series-1)]">
          {letter}. {title}
        </span>
        {sub && <span className="text-xs text-[var(--text-muted)] italic">{sub}</span>}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function RequisitionForm({ r, role, onBack, onChanged }: { r: Requisition; role: Role; onBack: () => void; onChanged: () => void }) {
  const { branches, departments } = useHris();
  const employees = usePeople();
  const { isHr, me, approverId } = role;
  const isMaker = r.createdBy === me;
  const st = r.status;
  const editA = (isMaker && st === "draft") || (isHr && ["draft", "hr_review"].includes(st));
  const editF = isHr && st === "hr_review";
  const decide = approverId === me && (st === "approval" || st === "deferred");
  const [p, setP] = useState<PrfPatch>({});
  const [busy, setBusy] = useState(false);
  const [hasSig, setHasSig] = useState(false);
  const [decision, setDecision] = useState<Decision | null>(null);
  const [remarks, setRemarks] = useState("");
  const [returnNote, setReturnNote] = useState("");
  const [viewer, setViewer] = useState<ViewerFile | null>(null);
  const [sigUrls, setSigUrls] = useState<Partial<Record<"head" | "hr" | "approver", string>>>({});
  const v = { ...r, ...p };
  const set = (x: PrfPatch) => setP((c) => ({ ...c, ...x }));
  const nameOf = (id: string | null) => {
    const e = id ? employees.find((x) => x.id === id) : undefined;
    return e ? fullName(e) : "";
  };

  useEffect(() => {
    let urls: string[] = [];
    prfSignatures(r).then((s) => {
      const out: Partial<Record<"head" | "hr" | "approver", string>> = {};
      for (const [k, b] of Object.entries(s) as ["head" | "hr" | "approver", Uint8Array][]) out[k] = URL.createObjectURL(new Blob([b as BlobPart], { type: "image/png" }));
      urls = Object.values(out) as string[];
      setSigUrls(out);
    }, () => {});
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [r]);

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
      setP({});
      onChanged();
    } catch (e) {
      reportSaveError(label, e);
    } finally {
      setBusy(false);
    }
  }

  async function viewPdf() {
    try {
      const c = currentCompany();
      const [logo, letterhead, signatures] = await Promise.all([loadLogo(c.formLogo), loadLogo(c.hrLetterhead), prfSignatures(r)]);
      const pdf = await buildRequisitionPdf({
        r: v as Requisition,
        company: c,
        logo,
        letterhead,
        branch: branches.find((b) => b.id === v.branchId)?.name ?? "",
        department: departments.find((d) => d.id === v.departmentId)?.name ?? "",
        names: { head: v.requestedByName || nameOf(r.createdBy), hr: r.hrName || nameOf(r.hrBy), approver: r.decidedName || nameOf(r.decidedBy) || nameOf(approverId) },
        approverTitle: prfApproverTitle(),
        signatures,
      });
      setViewer({ url: URL.createObjectURL(new Blob([pdf as BlobPart], { type: "application/pdf" })), name: `Personnel Requisition ${r.prfNo ?? ""} ${r.position}.pdf`.replace(/\s+/g, " "), kind: "pdf" });
    } catch (e) {
      reportSaveError("Couldn't make the PDF", e);
    }
  }

  const sigBox = (label: string, url: string | undefined, name: string, at: string | null) => (
    <div className="rounded-lg border border-[var(--border-hairline)] p-2.5 text-center">
      <div className="flex h-12 items-center justify-center">{url ? <img src={url} alt="Signature" className="max-h-12 max-w-full object-contain" /> : <span className="text-xs text-[var(--text-muted)]">Not signed yet</span>}</div>
      <div className="mt-1 border-t border-[var(--border-hairline)] pt-1 text-xs font-medium text-[var(--text-primary)]">{name || "—"}</div>
      <div className="text-[11px] text-[var(--text-muted)]">{label}</div>
      {at && <div className="text-[10px] text-[var(--text-muted)]">{when(at)}</div>}
    </div>
  );

  return (
    <div className="space-y-4">
      {viewer && <FileViewer file={viewer} onClose={() => setViewer(null)} />}
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={onBack} className={secondary}>
          <ArrowLeft size={16} /> All requests
        </button>
        <div className="min-w-0 flex-1">
          <div className="truncate text-lg font-semibold text-[var(--text-primary)]">Personnel Requisition — {v.position}</div>
          <div className="text-xs text-[var(--text-muted)]">{r.prfNo ?? "Draft (numbered when sent to HR)"}</div>
        </div>
        <Badge tone={PRF_STATUS[st].tone}>{PRF_STATUS[st].label}</Badge>
        <button onClick={viewPdf} className={secondary}>
          <FileText size={15} /> View / print PDF
        </button>
        {((isMaker && st === "draft") || isHr) && (
          <button onClick={() => window.confirm("Delete this request?") && run("Couldn't delete", async () => { await deleteRequisition(r.id); onBack(); })} disabled={busy} className={danger}>
            <Trash2 size={15} />
          </button>
        )}
      </div>
      {st === "draft" && r.returnedNote && (
        <div className="rounded-lg border border-[var(--status-warning)]/50 bg-[var(--status-warning)]/10 px-3 py-2 text-sm text-[var(--text-primary)]">
          <b>Returned by HR:</b> {r.returnedNote}
        </div>
      )}

      <Part letter="A" title="REQUEST DETAILS" sub="(To be completed by the Requesting Department / Branch)">
        <div className="grid gap-3 sm:grid-cols-2">
          <label>
            <span className={lbl}>Position requested *</span>
            <input className={input} disabled={!editA} value={v.position} onChange={(e) => set({ position: e.target.value })} />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label>
              <span className={lbl}>Branch</span>
              <select className={input} disabled={!editA} value={v.branchId ?? ""} onChange={(e) => set({ branchId: e.target.value || null })}>
                <option value="">—</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className={lbl}>Department</span>
              <select className={input} disabled={!editA} value={v.departmentId ?? ""} onChange={(e) => set({ departmentId: e.target.value || null })}>
                <option value="">—</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label>
              <span className={lbl}>Requested by (name)</span>
              <input className={input} disabled={!editA} value={v.requestedByName} onChange={(e) => set({ requestedByName: e.target.value })} />
            </label>
            <label>
              <span className={lbl}>Position</span>
              <input className={input} disabled={!editA} value={v.requestedByPosition} onChange={(e) => set({ requestedByPosition: e.target.value })} />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label>
              <span className={lbl}>Number of personnel needed</span>
              <input type="number" min={1} max={500} className={input} disabled={!editA} value={v.personnelNeeded} onChange={(e) => set({ personnelNeeded: Math.max(1, Number(e.target.value) || 1) })} />
            </label>
            <label>
              <span className={lbl}>Target date of hiring</span>
              <input type="date" className={input} disabled={!editA} value={v.targetDate ?? ""} onChange={(e) => set({ targetDate: e.target.value || null })} />
            </label>
          </div>
          <div className="sm:col-span-2">
            <span className={lbl}>Employment type *</span>
            <Checks options={EMPLOYMENT_TYPES} value={v.employmentType} disabled={!editA} onChange={(k) => set({ employmentType: k })} />
          </div>
        </div>
      </Part>

      <div className="grid gap-4 lg:grid-cols-2">
        <Part letter="B" title="TYPE OF REQUEST">
          <div className="space-y-2">
            {REQUEST_TYPES.map(([k, label]) => (
              <label key={k} className="flex items-center gap-2 text-sm">
                <input type="radio" checked={v.requestType === k} disabled={!editA} onChange={() => set({ requestType: k })} /> {label}
                {k === "other" && v.requestType === "other" && <input className={`${input} ml-1 max-w-[220px] py-1`} disabled={!editA} value={v.requestTypeOther} onChange={(e) => set({ requestTypeOther: e.target.value })} />}
              </label>
            ))}
          </div>
        </Part>
        <Part letter="C" title="REASON FOR REQUEST">
          <label className="block">
            <span className={lbl}>Why is additional personnel or a replacement needed? *</span>
            <textarea rows={4} className={input} disabled={!editA} value={v.reason} onChange={(e) => set({ reason: e.target.value })} />
          </label>
          <label className="mt-2 block">
            <span className={lbl}>If replacement, name of previous employee</span>
            <input className={input} disabled={!editA} value={v.previousEmployee} onChange={(e) => set({ previousEmployee: e.target.value })} />
          </label>
        </Part>
      </div>

      <Part letter="D" title="JOB REQUIREMENTS">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <span className={lbl}>Educational attainment (minimum)</span>
            <div className="space-y-1.5">
              {EDUCATION.map(([k, label]) => (
                <label key={k} className="flex items-center gap-2 text-sm">
                  <input type="radio" checked={v.education === k} disabled={!editA} onChange={() => set({ education: k })} /> {label}
                  {k === "other" && v.education === "other" && <input className={`${input} ml-1 max-w-[220px] py-1`} disabled={!editA} value={v.educationOther} onChange={(e) => set({ educationOther: e.target.value })} />}
                </label>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <label className="block">
              <span className={lbl}>Required work experience</span>
              <textarea rows={2} className={input} disabled={!editA} value={v.workExperience} onChange={(e) => set({ workExperience: e.target.value })} />
            </label>
            <label className="block">
              <span className={lbl}>Required skills / qualifications</span>
              <textarea rows={3} className={input} disabled={!editA} value={v.skills} onChange={(e) => set({ skills: e.target.value })} />
            </label>
          </div>
        </div>
      </Part>

      <Part letter="E" title="APPROVALS">
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="space-y-2">
            <div className="text-xs font-semibold text-[var(--text-primary)]">1. Requesting Department / Branch Head</div>
            <Checks
              options={[
                ["recommended", "Recommended for approval"],
                ["not_recommended", "Not recommended"],
              ]}
              value={v.headRecommendation}
              disabled={!(isMaker && st === "draft")}
              onChange={(k) => set({ headRecommendation: k })}
            />
            <textarea rows={2} className={input} placeholder="Remarks" disabled={!(isMaker && st === "draft")} value={v.headRemarks} onChange={(e) => set({ headRemarks: e.target.value })} />
            {sigBox("Requesting Head", sigUrls.head, v.requestedByName, r.headSignedAt)}
          </div>
          <div className="space-y-2">
            <div className="text-xs font-semibold text-[var(--text-primary)]">2. HR review and recommendation</div>
            <div className="text-sm text-[var(--text-secondary)]">{r.hrAction ? HR_ACTIONS.find(([k]) => k === r.hrAction)?.[1] : st === "hr_review" ? "Waiting for HR (section F)" : "—"}</div>
            {sigBox("HR Department", sigUrls.hr, r.hrName || nameOf(r.hrBy), r.hrSignedAt)}
          </div>
          <div className="space-y-2">
            <div className="text-xs font-semibold text-[var(--text-primary)]">3. Final approval — {prfApproverTitle()}</div>
            {r.decision ? (
              <div className="text-sm">
                <Badge tone={r.decision === "approved" ? "good" : r.decision === "deferred" ? "info" : "critical"}>{DECISIONS.find(([k]) => k === r.decision)?.[1]}</Badge>
                {r.decisionRemarks && <p className="mt-1 whitespace-pre-wrap text-[var(--text-secondary)]">{r.decisionRemarks}</p>}
              </div>
            ) : (
              <div className="text-sm text-[var(--text-muted)]">{st === "approval" ? "Waiting for approval" : "—"}</div>
            )}
            {sigBox(prfApproverTitle(), sigUrls.approver, r.decidedName || nameOf(r.decidedBy), r.decidedAt)}
          </div>
        </div>
      </Part>

      <Part letter="F" title="HR DEPARTMENT ASSESSMENT" sub="(To be completed by HR)">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <span className={lbl}>HR action</span>
            <Checks options={HR_ACTIONS} value={v.hrAction} disabled={!editF} onChange={(k) => set({ hrAction: k })} />
          </div>
          <label>
            <span className={lbl}>HR remarks / next steps</span>
            <textarea rows={3} className={input} disabled={!editF} value={v.hrRemarks} onChange={(e) => set({ hrRemarks: e.target.value })} />
          </label>
          <label>
            <span className={lbl}>Date received</span>
            <input type="date" className={input} disabled={!editF} value={v.hrReceivedAt ?? ""} onChange={(e) => set({ hrReceivedAt: e.target.value || null })} />
          </label>
          <label>
            <span className={lbl}>Target recruitment completion</span>
            <input type="date" className={input} disabled={!editF} value={v.hrTargetCompletion ?? ""} onChange={(e) => set({ hrTargetCompletion: e.target.value || null })} />
          </label>
        </div>
      </Part>

      {/* ---- Actions for whoever's turn it is ---- */}
      {editA && Object.keys(p).length > 0 && !(isMaker && st === "draft") && (
        <button onClick={() => run("Couldn't save", () => updateRequisition(r.id, p))} disabled={busy} className={secondary}>
          <Save size={15} /> Save
        </button>
      )}
      {isMaker && st === "draft" && (
        <div className="space-y-3 rounded-xl border border-[var(--series-1)]/40 p-4">
          <div className="flex flex-wrap gap-2">
            <button onClick={() => run("Couldn't save", () => updateRequisition(r.id, p))} disabled={busy || !Object.keys(p).length} className={secondary}>
              <Save size={15} /> Save draft
            </button>
          </div>
          <MySignature onChange={setHasSig} />
          <button onClick={() => run("Couldn't send", () => submitRequisition(r.id, me, p))} disabled={busy || !hasSig} className={primary}>
            <Send size={15} /> Sign and send to HR
          </button>
        </div>
      )}
      {editF && (
        <div className="space-y-3 rounded-xl border border-[var(--series-1)]/40 p-4">
          <MySignature onChange={setHasSig} />
          <div className="flex flex-wrap gap-2">
            <button onClick={() => run("Couldn't send", () => hrReviewRequisition(r.id, me, p))} disabled={busy || !hasSig} className={primary}>
              <Send size={15} /> Sign and send to the {prfApproverTitle()}
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2 border-t border-[var(--border-hairline)] pt-3">
            <input className={`${input} max-w-md`} placeholder="What should the Head change?" value={returnNote} onChange={(e) => setReturnNote(e.target.value)} />
            <button onClick={() => run("Couldn't return it", () => returnRequisition(r.id, returnNote))} disabled={busy || !returnNote.trim()} className={secondary}>
              <Undo2 size={15} /> Return to the Head
            </button>
          </div>
        </div>
      )}
      {decide && (
        <div className="space-y-3 rounded-xl border border-[var(--series-1)]/40 p-4">
          <div className="text-sm font-semibold text-[var(--text-primary)]">Your decision</div>
          <Checks options={DECISIONS} value={decision} onChange={setDecision} />
          <textarea rows={2} className={input} placeholder="Remarks" value={remarks} onChange={(e) => setRemarks(e.target.value)} />
          <MySignature onChange={setHasSig} />
          <button onClick={() => decision && run("Couldn't save the decision", () => decideRequisition(r.id, me, decision, remarks))} disabled={busy || !hasSig || !decision} className={primary}>
            {decision === "disapproved" ? <X size={15} /> : <Check size={15} />} Sign and submit
          </button>
        </div>
      )}
      <p className="rounded-lg bg-[var(--status-warning)]/10 px-3 py-2 text-xs text-[var(--text-secondary)]">
        <b>Note:</b> All personnel requests must be submitted to the HR Department for evaluation and approval before conducting recruitment or hiring activities. No department or branch is allowed to hire or promise employment to any applicant without prior management approval.
      </p>
    </div>
  );
}
