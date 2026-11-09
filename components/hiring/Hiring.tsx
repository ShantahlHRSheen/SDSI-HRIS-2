"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Check, FileText, Loader2, Plus, Save, Search, Send, Settings, Trash2, Undo2, Upload, X } from "lucide-react";
import { useHris } from "@/lib/store";
import { Badge } from "@/components/Badge";
import { Modal } from "@/components/Modal";
import { FileViewer, canView, saveFile, type ViewerFile } from "@/components/FileViewer";
import { MySignature } from "@/components/leave/LeaveApplication";
import { fullName } from "@/lib/helpers";
import { reportSaveError } from "@/lib/save-errors";
import {
  HIRING_FILE_ACCEPT,
  STATUS_LABEL,
  applicantFileUrl,
  applicantFiles,
  approve,
  approverTitle,
  assessmentTotals,
  createApplicant,
  deleteApplicant,
  fetchApplicants,
  fetchApproverId,
  fileKind,
  finalDecide,
  headSave,
  headSubmit,
  headSubmitEval,
  hrSign,
  removeApplicantFile,
  returnEval,
  setApproverId,
  signatureUrls,
  updateApplicant,
  uploadApplicantFile,
  type Applicant,
  type AssessmentItem,
  type HeadPatch,
  type HiringFile,
  type HrPatch,
  type TrainingItem,
} from "@/lib/hiring";
import { fetchPrfApproverId, fetchRequisitions, prfApproverTitle, setPrfApproverId, type Requisition } from "@/lib/requisition";

/* eslint-disable @next/next/no-img-element -- signed signature images */

const input = "w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-2 text-sm disabled:opacity-70";
const lbl = "mb-1 block text-xs font-medium text-[var(--text-secondary)]";
const primary = "flex items-center gap-1.5 rounded-lg bg-[var(--series-1)] px-3 py-2 text-sm font-medium text-[var(--on-accent)] disabled:opacity-40";
const secondary = "flex items-center gap-1.5 rounded-lg border border-[var(--border-hairline)] px-3 py-2 text-sm text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40 disabled:opacity-40";
const danger = "flex items-center gap-1.5 rounded-lg border border-[var(--status-critical)]/50 px-3 py-2 text-sm text-[var(--status-critical)] hover:bg-[var(--status-critical)]/10 disabled:opacity-40";

// datetime-local in Manila time ↔ timestamptz
const toLocal = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() + 8 * 3600_000).toISOString().slice(0, 16) : "");
const fromLocal = (v: string) => (v ? new Date(`${v}:00+08:00`).toISOString() : null);
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }) : "—");

type Role = { isHr: boolean; me: string; approverId: string | null };

// Staff plus admin-only accounts (lib/companies.ts adminAccountNumbers), who
// can be a Head or the approver without being on the company's roster.
export function usePeople() {
  const { employees, adminAccounts } = useHris();
  return useMemo(() => (adminAccounts.length ? [...employees, ...adminAccounts] : employees), [employees, adminAccounts]);
}

function useNames() {
  const employees = usePeople();
  return useCallback(
    (id: string | null | undefined, fallback = "—") => {
      const e = id ? employees.find((x) => x.id === id) : undefined;
      return e ? fullName(e) : fallback;
    },
    [employees],
  );
}

// What's waiting for this person.
export function needsMe(a: Applicant, r: Role): boolean {
  if (r.isHr && (a.status === "screening" || a.status === "hr_sign")) return true;
  if (r.isHr && a.status === "onboarding" && (!a.orientationAt || !a.handbookReceivedAt || !a.teamMeetingAt)) return true;
  if (a.headId === r.me && (a.status === "head" || (a.status === "onboarding" && !a.evalSubmittedAt))) return true;
  if (r.approverId === r.me && (a.status === "final" || a.status === "approval")) return true;
  return false;
}

export function Hiring({ initialOpen = null }: { initialOpen?: string | null } = {}) {
  const { currentUser, currentEmployee, branches, departments } = useHris();
  const isHr = !!currentUser?.roles.includes("hr_admin");
  const me = currentEmployee?.id ?? "";
  const [list, setList] = useState<Applicant[] | null>(null);
  const [approverId, setApprover] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(initialOpen);
  const [tab, setTab] = useState<"mine" | "progress" | "hired" | "closed" | "all">("mine");
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  const [settings, setSettings] = useState(false);
  const role: Role = { isHr, me, approverId };

  const load = useCallback(() => {
    fetchApplicants().then(
      (l) => {
        setList(l);
        setError(null);
      },
      (e) => setError(e instanceof Error ? e.message : "Couldn't load applicants."),
    );
    fetchApproverId().then(setApprover, () => {});
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const mine = (list ?? []).filter((a) => needsMe(a, role));
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    let l = list ?? [];
    if (tab === "mine") l = l.filter((a) => needsMe(a, role));
    else if (tab === "progress") l = l.filter((a) => !["hired", "rejected", "not_hired", "withdrawn"].includes(a.status));
    else if (tab === "hired") l = l.filter((a) => a.status === "hired");
    else if (tab === "closed") l = l.filter((a) => ["rejected", "not_hired", "withdrawn"].includes(a.status));
    return t ? l.filter((a) => `${a.name} ${a.position} ${a.email}`.toLowerCase().includes(t)) : l;
    // role is derived from isHr / me / approverId
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list, tab, q, isHr, me, approverId]);

  const current = list?.find((a) => a.id === open) ?? null;
  if (current) return <ApplicantDetail a={current} role={role} onBack={() => setOpen(null)} onChanged={load} />;

  const branchName = (id: string | null) => branches.find((b) => b.id === id)?.name ?? "";
  const deptName = (id: string | null) => departments.find((d) => d.id === id)?.name ?? "";

  return (
    <div className="space-y-4">
      {isHr && (
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => setAdding(true)} className={primary}>
            <Plus size={16} /> Add applicant
          </button>
          <button onClick={() => setSettings(true)} className={secondary}>
            <Settings size={16} /> Settings
          </button>
          {!approverId && <span className="text-xs text-[var(--status-warning)]">Choose the {approverTitle()} in Settings first.</span>}
        </div>
      )}
      {adding && <AddApplicantModal onClose={() => setAdding(false)} onSaved={(id) => { setAdding(false); load(); setOpen(id); }} />}
      {settings && <SettingsModal approverId={approverId} onClose={() => setSettings(false)} onSaved={(id) => { setApprover(id); setSettings(false); }} />}

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1 text-sm">
          {(
            [
              ["mine", `Needs my action${mine.length ? ` (${mine.length})` : ""}`],
              ["progress", "In progress"],
              ["hired", "Hired"],
              ["closed", "Not hired / closed"],
              ["all", "All"],
            ] as const
          ).map(([k, label]) => (
            <button key={k} onClick={() => setTab(k)} className={`rounded-full px-3 py-1 ${tab === k ? "bg-[var(--series-1)] text-[var(--on-accent)]" : "border border-[var(--border-hairline)] text-[var(--text-secondary)]"}`}>
              {label}
            </button>
          ))}
        </div>
        <label className="ml-auto flex min-w-[200px] items-center gap-2 rounded-lg border border-[var(--border-hairline)] px-2.5 py-1.5">
          <Search size={15} className="text-[var(--text-muted)]" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search applicants" className="w-full bg-transparent text-sm outline-none" aria-label="Search applicants" />
        </label>
      </div>

      {error && <div className="text-sm text-[var(--status-critical)]">{error}</div>}
      {list === null && !error && <div className="text-sm text-[var(--text-muted)]">Loading…</div>}
      {list && shown.length === 0 && (
        <div className="rounded-xl border border-dashed border-[var(--border-hairline)] p-6 text-center text-sm text-[var(--text-muted)]">
          {tab === "mine" ? "Nothing needs your action." : "No applicants here."}
        </div>
      )}
      <div className="space-y-2">
        {shown.map((a) => (
          <button key={a.id} onClick={() => setOpen(a.id)} className="flex w-full flex-wrap items-center gap-3 rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-1)] p-3 text-left hover:bg-[var(--gridline)]/30">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-[var(--text-primary)]">{a.name}</div>
              <div className="truncate text-xs text-[var(--text-muted)]">{[a.position, branchName(a.branchId), deptName(a.departmentId)].filter(Boolean).join(" · ") || "—"}</div>
            </div>
            {needsMe(a, role) && <Badge tone="warning">Needs your action</Badge>}
            <Badge tone={STATUS_LABEL[a.status].tone}>{STATUS_LABEL[a.status].label}</Badge>
          </button>
        ))}
      </div>
    </div>
  );
}

// ---- Adding and settings (HR) ----------------------------------------------------------

function InfoFields({ v, set, disabled }: { v: HrPatch; set: (p: HrPatch) => void; disabled?: boolean }) {
  const { branches, departments } = useHris();
  // Approved personnel requisitions this applicant can be hired against.
  const [prfs, setPrfs] = useState<Requisition[]>([]);
  useEffect(() => {
    fetchRequisitions().then((l) => setPrfs(l.filter((r) => r.status === "approved" || r.id === v.requisitionId)), () => {});
    // only on open
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {(prfs.length > 0 || v.requisitionId) && (
        <label className="sm:col-span-2">
          <span className={lbl}>Personnel requisition (approved)</span>
          <select
            className={input}
            disabled={disabled}
            value={v.requisitionId ?? ""}
            onChange={(e) => {
              const r = prfs.find((x) => x.id === e.target.value);
              set(r ? { requisitionId: r.id, position: v.position?.trim() ? v.position : r.position, branchId: v.branchId ?? r.branchId, departmentId: v.departmentId ?? r.departmentId } : { requisitionId: null });
            }}
          >
            <option value="">— None —</option>
            {prfs.map((r) => (
              <option key={r.id} value={r.id}>
                {[r.prfNo, r.position, branches.find((b) => b.id === r.branchId)?.name, departments.find((d) => d.id === r.departmentId)?.name].filter(Boolean).join(" · ")}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="sm:col-span-2">
        <span className={lbl}>Full name *</span>
        <input className={input} disabled={disabled} value={v.name ?? ""} onChange={(e) => set({ name: e.target.value })} />
      </label>
      <label>
        <span className={lbl}>Email</span>
        <input className={input} disabled={disabled} type="email" value={v.email ?? ""} onChange={(e) => set({ email: e.target.value })} />
      </label>
      <label>
        <span className={lbl}>Contact number</span>
        <input className={input} disabled={disabled} value={v.contactNumber ?? ""} onChange={(e) => set({ contactNumber: e.target.value })} />
      </label>
      <label className="sm:col-span-2">
        <span className={lbl}>Address</span>
        <input className={input} disabled={disabled} value={v.address ?? ""} onChange={(e) => set({ address: e.target.value })} />
      </label>
      <label>
        <span className={lbl}>Position applied for</span>
        <input className={input} disabled={disabled} value={v.position ?? ""} onChange={(e) => set({ position: e.target.value })} />
      </label>
      <label>
        <span className={lbl}>Branch</span>
        <select className={input} disabled={disabled} value={v.branchId ?? ""} onChange={(e) => set({ branchId: e.target.value || null })}>
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
        <select className={input} disabled={disabled} value={v.departmentId ?? ""} onChange={(e) => set({ departmentId: e.target.value || null })}>
          <option value="">—</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

function AddApplicantModal({ onClose, onSaved }: { onClose: () => void; onSaved: (id: string) => void }) {
  const [v, setV] = useState<HrPatch>({});
  const [busy, setBusy] = useState(false);
  async function save() {
    if (!v.name?.trim()) return;
    setBusy(true);
    try {
      onSaved(await createApplicant({ ...v, name: v.name.trim() }));
    } catch (e) {
      reportSaveError("Couldn't add the applicant", e);
      setBusy(false);
    }
  }
  return (
    <Modal open onClose={onClose} title="Add applicant" wide>
      <InfoFields v={v} set={(p) => setV((cur) => ({ ...cur, ...p }))} />
      <div className="mt-4 flex justify-end gap-2">
        <button onClick={onClose} className={secondary}>
          Cancel
        </button>
        <button onClick={save} disabled={busy || !v.name?.trim()} className={primary}>
          <Plus size={16} /> {busy ? "Adding…" : "Add"}
        </button>
      </div>
    </Modal>
  );
}

function SettingsModal({ approverId, onClose, onSaved }: { approverId: string | null; onClose: () => void; onSaved: (id: string | null) => void }) {
  const employees = usePeople();
  const [v, setV] = useState(approverId ?? "");
  const [prf, setPrf] = useState<string | null>(null);
  const [prf0, setPrf0] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    fetchPrfApproverId().then(
      (id) => {
        setPrf(id ?? "");
        setPrf0(id ?? "");
      },
      () => {},
    );
  }, []);
  const active = employees.filter((e) => e.status === "active" || e.status === "on_leave").sort((a, b) => fullName(a).localeCompare(fullName(b)));
  const options = active.map((e) => (
    <option key={e.id} value={e.id}>
      {fullName(e)}
    </option>
  ));
  return (
    <Modal open onClose={onClose} title="Hiring settings">
      <div className="space-y-4">
        <label className="block">
          <span className={lbl}>{approverTitle()} — gives the final hiring decision and approves the recommendation for employment</span>
          <select className={input} value={v} onChange={(e) => setV(e.target.value)}>
            <option value="">— Choose —</option>
            {options}
          </select>
        </label>
        <label className="block">
          <span className={lbl}>{prfApproverTitle()} — approves personnel requisitions</span>
          <select className={input} value={prf ?? ""} disabled={prf === null} onChange={(e) => setPrf(e.target.value)}>
            <option value="">— Choose —</option>
            {options}
          </select>
        </label>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button onClick={onClose} className={secondary}>
          Cancel
        </button>
        <button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await setApproverId(v || null);
              if (prf !== null && prf !== prf0) await setPrfApproverId(prf || null);
              onSaved(v || null);
            } catch (e) {
              reportSaveError("Couldn't save the settings", e);
              setBusy(false);
            }
          }}
          className={primary}
        >
          <Save size={16} /> Save
        </button>
      </div>
    </Modal>
  );
}

// ---- One applicant ------------------------------------------------------------------------

function Section({ n, title, who, done, children }: { n: number; title: string; who: string; done?: boolean; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-1)] p-4">
      <div className="mb-3 flex flex-wrap items-baseline gap-2">
        <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${done ? "bg-[var(--status-good)] text-white" : "bg-[var(--series-1)]/15 text-[var(--series-1)]"}`}>{done ? <Check size={13} /> : n}</span>
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">{title}</h2>
        <span className="text-xs text-[var(--text-muted)]">{who}</span>
      </div>
      {children}
    </section>
  );
}

function Result({ value, onChange, disabled }: { value: "passed" | "failed" | null; onChange: (v: "passed" | "failed") => void; disabled?: boolean }) {
  return (
    <div className="flex gap-2">
      {(["passed", "failed"] as const).map((r) => (
        <button
          key={r}
          type="button"
          disabled={disabled}
          onClick={() => onChange(r)}
          className={`rounded-lg border px-3 py-1.5 text-sm capitalize ${value === r ? (r === "passed" ? "border-[var(--status-good)] bg-[var(--status-good)]/15 text-[var(--status-good)]" : "border-[var(--status-critical)] bg-[var(--status-critical)]/15 text-[var(--status-critical)]") : "border-[var(--border-hairline)] text-[var(--text-secondary)]"} disabled:opacity-70`}
        >
          {r}
        </button>
      ))}
    </div>
  );
}

function Files({ a, kind, canAdd, canDelete }: { a: Applicant; kind: "resume" | "background"; canAdd: boolean; canDelete: boolean }) {
  const [list, setList] = useState<HiringFile[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [viewer, setViewer] = useState<ViewerFile | null>(null);
  const load = useCallback(() => applicantFiles(a.id).then((l) => setList(l.filter((f) => fileKind(f) === kind)), () => setList([])), [a.id, kind]);
  useEffect(() => {
    load();
  }, [load]);
  async function add(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setBusy(true);
    try {
      await uploadApplicantFile(a.id, kind, f);
      await load();
    } catch (err) {
      reportSaveError("Couldn't upload the file", err);
    } finally {
      setBusy(false);
    }
  }
  async function openFile(f: HiringFile) {
    try {
      const url = await applicantFileUrl(f.path);
      if (canView(f.name)) setViewer({ url, name: f.name, kind: /\.pdf$/i.test(f.name) ? "pdf" : "image" });
      else await saveFile(url, f.name);
    } catch (err) {
      reportSaveError("Couldn't open the file", err);
    }
  }
  return (
    <div className="space-y-1.5">
      {viewer && <FileViewer file={viewer} onClose={() => setViewer(null)} />}
      {list?.length === 0 && <div className="text-xs text-[var(--text-muted)]">No files yet.</div>}
      {list?.map((f) => (
        <div key={f.path} className="flex items-center gap-2 rounded-lg border border-[var(--border-hairline)] px-2.5 py-1.5 text-sm">
          <FileText size={15} className="shrink-0 text-[var(--series-1)]" />
          <button onClick={() => openFile(f)} className="min-w-0 flex-1 truncate text-left text-[var(--text-primary)] hover:underline">
            {f.name}
          </button>
          {canDelete && (
            <button
              onClick={() => window.confirm(`Remove ${f.name}?`) && removeApplicantFile(f.path).then(load, (e) => reportSaveError("Couldn't remove the file", e))}
              className="text-[var(--text-muted)] hover:text-[var(--status-critical)]"
              aria-label={`Remove ${f.name}`}
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      ))}
      {canAdd && (
        <label className={`${secondary} w-fit cursor-pointer`}>
          {busy ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />} {kind === "resume" ? "Upload resume" : "Upload a file"}
          <input type="file" accept={HIRING_FILE_ACCEPT} className="hidden" onChange={add} disabled={busy} />
        </label>
      )}
    </div>
  );
}

function ApplicantDetail({ a, role, onBack, onChanged }: { a: Applicant; role: Role; onBack: () => void; onChanged: () => void }) {
  const employees = usePeople();
  const nameOf = useNames();
  const { isHr, me, approverId } = role;
  const isHead = a.headId === me;
  const isApprover = approverId === me;
  const st = a.status;
  const [busy, setBusy] = useState(false);
  const [hr, setHr] = useState<HrPatch>({});
  const [head, setHead] = useState<HeadPatch>({});
  const [comment, setComment] = useState("");
  const [hasSig, setHasSig] = useState(false);
  const [sigs, setSigs] = useState<Partial<Record<"head" | "hr" | "approver", string>>>({});
  useEffect(() => {
    signatureUrls(a).then(setSigs, () => {});
  }, [a]);

  const v = { ...a, ...hr };
  const h = { ...a, ...head };
  const training: TrainingItem[] = (head.training ?? a.training) as TrainingItem[];
  const assessment: AssessmentItem[] = (head.trainingAssessment ?? a.trainingAssessment) as AssessmentItem[];
  const totals = assessmentTotals(assessment);
  const onboardingStarted = ["onboarding", "hr_sign", "approval", "hired", "not_hired"].includes(st);
  const hrEdits1 = isHr && st === "screening";
  const headEdits2 = isHead && st === "head";
  const headEdits4 = isHead && st === "onboarding";
  const heads = employees.filter((e) => (e.status === "active" || e.status === "on_leave") && e.id !== a.id).sort((x, y) => fullName(x).localeCompare(fullName(y)));

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
      setHr({});
      setHead({});
      setComment("");
      onChanged();
    } catch (e) {
      reportSaveError(label, e);
    } finally {
      setBusy(false);
    }
  }
  const saveHr = (extra: HrPatch = {}) => run("Couldn't save", () => updateApplicant(a.id, { ...hr, ...extra }));
  const saveHead = () => run("Couldn't save", () => headSave(a.id, head));

  function sendToHead() {
    if (!v.shortlisted) return reportSaveError("Mark the applicant as shortlisted first.");
    if (v.hrInterviewResult !== "passed") return reportSaveError("The HR interview result must be Passed.");
    if (!v.headId || !v.headInterviewAt) return reportSaveError("Choose the Head and the interview schedule.");
    saveHr({ status: "head" });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={onBack} className={secondary}>
          <ArrowLeft size={16} /> All applicants
        </button>
        <div className="min-w-0 flex-1">
          <div className="truncate text-lg font-semibold text-[var(--text-primary)]">{a.name}</div>
          <div className="text-xs text-[var(--text-muted)]">{a.position || "—"}</div>
        </div>
        <Badge tone={STATUS_LABEL[st].tone}>{STATUS_LABEL[st].label}</Badge>
        {isHr && (
          <button
            onClick={() => window.confirm(`Delete ${a.name}'s record and files? This can't be undone.`) && run("Couldn't delete", async () => { await deleteApplicant(a.id); onBack(); })}
            className={danger}
            disabled={busy}
          >
            <Trash2 size={15} /> Delete
          </button>
        )}
      </div>

      {/* ---- Section 1 ---- */}
      <Section n={1} title="Application and HR interview" who="HR" done={st !== "screening"}>
        <div className="space-y-4">
          <div>
            <div className="mb-2 text-xs font-semibold text-[var(--text-primary)] uppercase">A. Application information</div>
            <InfoFields v={v} set={(p) => setHr((c) => ({ ...c, ...p }))} disabled={!isHr} />
          </div>
          <div>
            <div className="mb-2 flex items-center gap-3 text-xs font-semibold text-[var(--text-primary)] uppercase">
              B. Resume
              <label className="flex items-center gap-1.5 font-normal normal-case">
                <input type="checkbox" checked={v.shortlisted} disabled={!hrEdits1} onChange={(e) => setHr((c) => ({ ...c, shortlisted: e.target.checked }))} /> Shortlisted
              </label>
            </div>
            <Files a={a} kind="resume" canAdd={isHr} canDelete={isHr} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2 text-xs font-semibold text-[var(--text-primary)] uppercase">C–D. Initial interview with HR and notes</div>
            <label>
              <span className={lbl}>Interview date and time</span>
              <input type="datetime-local" className={input} disabled={!hrEdits1} value={toLocal(v.hrInterviewAt)} onChange={(e) => setHr((c) => ({ ...c, hrInterviewAt: fromLocal(e.target.value) }))} />
            </label>
            <div>
              <span className={lbl}>Result</span>
              <Result value={v.hrInterviewResult} disabled={!hrEdits1} onChange={(r) => setHr((c) => ({ ...c, hrInterviewResult: r }))} />
            </div>
            <label className="sm:col-span-2">
              <span className={lbl}>Interview notes</span>
              <textarea rows={4} className={input} disabled={!hrEdits1} value={v.hrInterviewNotes} onChange={(e) => setHr((c) => ({ ...c, hrInterviewNotes: e.target.value }))} />
            </label>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2 text-xs font-semibold text-[var(--text-primary)] uppercase">E. Interview with the Branch / Department Head</div>
            <label>
              <span className={lbl}>Branch / Department Head</span>
              <select className={input} disabled={!isHr || !["screening", "head"].includes(st)} value={v.headId ?? ""} onChange={(e) => setHr((c) => ({ ...c, headId: e.target.value || null }))}>
                <option value="">— Choose —</option>
                {heads.map((e) => (
                  <option key={e.id} value={e.id}>
                    {fullName(e)}
                  </option>
                ))}
                {v.headId && !heads.some((e) => e.id === v.headId) && <option value={v.headId}>{nameOf(v.headId, "Assigned Head")}</option>}
              </select>
            </label>
            <label>
              <span className={lbl}>Interview schedule</span>
              <input type="datetime-local" className={input} disabled={!isHr || !["screening", "head"].includes(st)} value={toLocal(v.headInterviewAt)} onChange={(e) => setHr((c) => ({ ...c, headInterviewAt: fromLocal(e.target.value) }))} />
            </label>
          </div>
          {isHr && (
            <div className="flex flex-wrap gap-2">
              {Object.keys(hr).length > 0 && (
                <button onClick={() => saveHr()} disabled={busy} className={secondary}>
                  <Save size={15} /> Save
                </button>
              )}
              {st === "screening" && (
                <>
                  <button onClick={sendToHead} disabled={busy} className={primary}>
                    <Send size={15} /> Send to the Head for interview
                  </button>
                  <button onClick={() => window.confirm("Close this application as not passed?") && saveHr({ status: "rejected" })} disabled={busy} className={danger}>
                    <X size={15} /> Not passed
                  </button>
                </>
              )}
              {!["hired", "rejected", "not_hired", "withdrawn"].includes(st) && (
                <button onClick={() => window.confirm("Mark this applicant as withdrawn?") && saveHr({ status: "withdrawn" })} disabled={busy} className={secondary}>
                  Withdrawn
                </button>
              )}
            </div>
          )}
        </div>
      </Section>

      {/* ---- Section 2 ---- */}
      {st !== "screening" && (
        <Section n={2} title="Interview, background investigation and recommendation" who={`Branch / Department Head — ${nameOf(a.headId, isHead ? "you" : "assigned Head")} · ${when(a.headInterviewAt)}`} done={!!a.headSubmittedAt}>
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2 text-xs font-semibold text-[var(--text-primary)] uppercase">A. Interview with the Head</div>
              <label className="sm:col-span-2">
                <span className={lbl}>Interview notes</span>
                <textarea rows={4} className={input} disabled={!headEdits2} value={h.headInterviewNotes} onChange={(e) => setHead((c) => ({ ...c, headInterviewNotes: e.target.value }))} />
              </label>
              <div>
                <span className={lbl}>Result</span>
                <Result value={(h.headInterviewResult || null) as "passed" | "failed" | null} disabled={!headEdits2} onChange={(r) => setHead((c) => ({ ...c, headInterviewResult: r }))} />
              </div>
            </div>
            {(h.headInterviewResult === "passed" || a.backgroundFindings) && (
              <div className="space-y-2">
                <div className="text-xs font-semibold text-[var(--text-primary)] uppercase">B. Background investigation and findings</div>
                <textarea rows={4} className={input} disabled={!headEdits2} placeholder="References called, previous employers, records checked, findings…" value={h.backgroundFindings} onChange={(e) => setHead((c) => ({ ...c, backgroundFindings: e.target.value }))} />
                <div>
                  <span className={lbl}>Result</span>
                  <Result value={(h.backgroundResult || null) as "passed" | "failed" | null} disabled={!headEdits2} onChange={(r) => setHead((c) => ({ ...c, backgroundResult: r }))} />
                </div>
                <Files a={a} kind="background" canAdd={headEdits2 || isHr} canDelete={isHr} />
              </div>
            )}
            <div className="space-y-2">
              <div className="text-xs font-semibold text-[var(--text-primary)] uppercase">C. Assessment and recommendation</div>
              <textarea rows={4} className={input} disabled={!headEdits2} placeholder="Strengths, concerns, fit for the position…" value={h.headAssessment} onChange={(e) => setHead((c) => ({ ...c, headAssessment: e.target.value }))} />
              <div className="flex gap-2">
                {(
                  [
                    ["hire", "Recommend for hiring"],
                    ["do_not_hire", "Do not recommend"],
                  ] as const
                ).map(([k, label]) => (
                  <button
                    key={k}
                    type="button"
                    disabled={!headEdits2}
                    onClick={() => setHead((c) => ({ ...c, headRecommendation: k }))}
                    className={`rounded-lg border px-3 py-1.5 text-sm ${h.headRecommendation === k ? (k === "hire" ? "border-[var(--status-good)] bg-[var(--status-good)]/15 text-[var(--status-good)]" : "border-[var(--status-critical)] bg-[var(--status-critical)]/15 text-[var(--status-critical)]") : "border-[var(--border-hairline)] text-[var(--text-secondary)]"} disabled:opacity-70`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            {headEdits2 && (
              <div className="flex flex-wrap gap-2">
                <button onClick={saveHead} disabled={busy || !Object.keys(head).length} className={secondary}>
                  <Save size={15} /> Save
                </button>
                <button
                  onClick={() =>
                    window.confirm(h.headRecommendation === "hire" ? `Send your recommendation to the ${approverTitle()}?` : "Submit — the application will be closed as not recommended?") &&
                    run("Couldn't submit", async () => {
                      if (Object.keys(head).length) await headSave(a.id, head);
                      await headSubmit(a.id);
                    })
                  }
                  disabled={busy}
                  className={primary}
                >
                  <Send size={15} /> Submit
                </button>
              </div>
            )}
          </div>
        </Section>
      )}

      {/* ---- Section 3 ---- */}
      {(st === "final" || a.finalDecidedAt) && (
        <Section n={3} title="Final hiring decision" who={approverTitle()} done={!!a.finalDecidedAt}>
          {a.finalDecidedAt ? (
            <div className="text-sm text-[var(--text-primary)]">
              <Badge tone={a.finalDecision === "hire" ? "good" : "critical"}>{a.finalDecision === "hire" ? "Hire" : "Do not hire"}</Badge>
              <span className="ml-2 text-xs text-[var(--text-muted)]">
                {nameOf(a.finalDecidedBy, approverTitle())} · {when(a.finalDecidedAt)}
              </span>
              {a.finalComment && <p className="mt-2 whitespace-pre-wrap text-[var(--text-secondary)]">{a.finalComment}</p>}
            </div>
          ) : isApprover ? (
            <div className="space-y-2">
              <textarea rows={3} className={input} placeholder="Comment (optional)" value={comment} onChange={(e) => setComment(e.target.value)} />
              <div className="flex gap-2">
                <button onClick={() => window.confirm(`Hire ${a.name}?`) && run("Couldn't save the decision", () => finalDecide(a.id, true, comment))} disabled={busy} className={primary}>
                  <Check size={15} /> Hire
                </button>
                <button onClick={() => window.confirm(`Not hire ${a.name}?`) && run("Couldn't save the decision", () => finalDecide(a.id, false, comment))} disabled={busy} className={danger}>
                  <X size={15} /> Do not hire
                </button>
              </div>
            </div>
          ) : (
            <div className="text-sm text-[var(--text-muted)]">Waiting for the {approverTitle()}&rsquo;s decision.</div>
          )}
        </Section>
      )}

      {/* ---- Section 4 ---- */}
      {onboardingStarted && (
        <Section n={4} title="Onboarding" who="HR, the Head and the final approver" done={st === "hired" || st === "not_hired"}>
          <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-3">
              <label>
                <span className={lbl}>Orientation done</span>
                <input type="date" className={input} disabled={!isHr || !["onboarding", "hr_sign", "approval"].includes(st)} value={v.orientationAt ?? ""} onChange={(e) => setHr((c) => ({ ...c, orientationAt: e.target.value || null }))} />
              </label>
              <label>
                <span className={lbl}>Employee handbook received</span>
                <input type="date" className={input} disabled={!isHr || !["onboarding", "hr_sign", "approval"].includes(st)} value={v.handbookReceivedAt ?? ""} onChange={(e) => setHr((c) => ({ ...c, handbookReceivedAt: e.target.value || null }))} />
              </label>
              <label>
                <span className={lbl}>Met the team</span>
                <input type="date" className={input} disabled={!isHr || !["onboarding", "hr_sign", "approval"].includes(st)} value={v.teamMeetingAt ?? ""} onChange={(e) => setHr((c) => ({ ...c, teamMeetingAt: e.target.value || null }))} />
              </label>
              {isHr && ["orientationAt", "handbookReceivedAt", "teamMeetingAt"].some((k) => k in hr) && (
                <div className="sm:col-span-3">
                  <button onClick={() => saveHr()} disabled={busy} className={secondary}>
                    <Save size={15} /> Save
                  </button>
                </div>
              )}
            </div>

            <div>
              <div className="mb-2 text-xs font-semibold text-[var(--text-primary)] uppercase">Work / skills training — filled in by the Head</div>
              <TrainingTable rows={training} edit={headEdits4} onChange={(rows) => setHead((c) => ({ ...c, training: rows }))} />
            </div>

            <div>
              <div className="mb-2 text-xs font-semibold text-[var(--text-primary)] uppercase">Assessment of training — filled in by the Head</div>
              <AssessmentTable rows={assessment} edit={headEdits4} onChange={(rows) => setHead((c) => ({ ...c, trainingAssessment: rows }))} />
              {assessment.length > 0 && (
                <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
                  <span className="text-[var(--text-secondary)]">
                    Total score: <b className="text-[var(--text-primary)]">{totals.score}</b> / required {totals.required}
                  </span>
                  {totals.scored && <Badge tone={totals.passed ? "good" : "critical"}>{totals.passed ? "Meets the required score" : "Below the required score"}</Badge>}
                </div>
              )}
            </div>

            <div>
              <span className={lbl}>Recommendation for employment — the Head</span>
              <textarea rows={3} className={input} disabled={!headEdits4} value={h.evalRecommendation} onChange={(e) => setHead((c) => ({ ...c, evalRecommendation: e.target.value }))} />
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <SigBox label={`Recommended by — ${nameOf(a.headId, "Branch / Department Head")}`} url={sigs.head} at={a.evalSubmittedAt} />
              <SigBox label={`Received by HR — ${nameOf(a.hrSignedBy, "HR")}`} url={sigs.hr} at={a.hrSignedAt} />
              <SigBox label={`${a.approval === "disapproved" ? "Disapproved" : "Approved"} by — ${nameOf(a.approvedBy, approverTitle())}`} url={sigs.approver} at={a.approvedAt} />
            </div>
            {a.approvedAt && (
              <div className="text-sm">
                <Badge tone={a.approval === "approved" ? "good" : "critical"}>{a.approval === "approved" ? "Approved" : "Disapproved"}</Badge>
                {a.approvalComment && <p className="mt-2 whitespace-pre-wrap text-[var(--text-secondary)]">{a.approvalComment}</p>}
              </div>
            )}

            {headEdits4 && (
              <div className="space-y-3 rounded-lg border border-[var(--border-hairline)] p-3">
                <div className="flex flex-wrap gap-2">
                  <button onClick={saveHead} disabled={busy || !Object.keys(head).length} className={secondary}>
                    <Save size={15} /> Save
                  </button>
                </div>
                <MySignature onChange={setHasSig} />
                <button
                  onClick={() =>
                    run("Couldn't send", async () => {
                      if (Object.keys(head).length) await headSave(a.id, head);
                      await headSubmitEval(a.id, me);
                    })
                  }
                  disabled={busy || !hasSig}
                  className={primary}
                >
                  <Send size={15} /> Sign and send the recommendation to HR
                </button>
              </div>
            )}
            {isHr && st === "hr_sign" && (
              <div className="space-y-3 rounded-lg border border-[var(--border-hairline)] p-3">
                <MySignature onChange={setHasSig} />
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => run("Couldn't sign", () => hrSign(a.id, me))} disabled={busy || !hasSig} className={primary}>
                    <Send size={15} /> Receive, sign and send to the {approverTitle()}
                  </button>
                  <button onClick={() => window.confirm("Return the assessment to the Head for changes?") && run("Couldn't return it", () => returnEval(a.id))} disabled={busy} className={secondary}>
                    <Undo2 size={15} /> Return to the Head
                  </button>
                </div>
              </div>
            )}
            {st === "hired" && (
              <div className="space-y-2 rounded-lg border border-[var(--border-hairline)] p-3">
                <div className="text-xs font-semibold text-[var(--text-primary)] uppercase">Contract signing — HR</div>
                <div className="flex flex-wrap items-end gap-2">
                  <label>
                    <span className={lbl}>Contract signed on</span>
                    <input type="date" className={input} disabled={!isHr} value={v.contractSignedAt ?? ""} onChange={(e) => setHr((c) => ({ ...c, contractSignedAt: e.target.value || null }))} />
                  </label>
                  {isHr && "contractSignedAt" in hr && (
                    <button onClick={() => saveHr()} disabled={busy} className={secondary}>
                      <Save size={15} /> Save
                    </button>
                  )}
                  {!a.contractSignedAt && <Badge tone="warning">Waiting for contract signing</Badge>}
                </div>
              </div>
            )}
            {isApprover && st === "approval" && (
              <div className="space-y-3 rounded-lg border border-[var(--border-hairline)] p-3">
                <textarea rows={3} className={input} placeholder="Comment" value={comment} onChange={(e) => setComment(e.target.value)} />
                <MySignature onChange={setHasSig} />
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => run("Couldn't approve", () => approve(a.id, me, true, comment))} disabled={busy || !hasSig} className={primary}>
                    <Check size={15} /> Approve
                  </button>
                  <button onClick={() => window.confirm("Disapprove the recommendation for employment?") && run("Couldn't save", () => approve(a.id, me, false, comment))} disabled={busy || !hasSig} className={danger}>
                    <X size={15} /> Disapprove
                  </button>
                </div>
              </div>
            )}
          </div>
        </Section>
      )}
    </div>
  );
}

function SigBox({ label, url, at }: { label: string; url?: string; at: string | null }) {
  return (
    <div className="rounded-lg border border-[var(--border-hairline)] p-2.5 text-center">
      <div className="flex h-14 items-center justify-center">{url ? <img src={url} alt="Signature" className="max-h-14 max-w-full object-contain" /> : <span className="text-xs text-[var(--text-muted)]">{at ? "Signed" : "Not signed yet"}</span>}</div>
      <div className="mt-1 border-t border-[var(--border-hairline)] pt-1 text-[11px] text-[var(--text-secondary)]">{label}</div>
      {at && <div className="text-[10px] text-[var(--text-muted)]">{when(at)}</div>}
    </div>
  );
}

function TrainingTable({ rows, edit, onChange }: { rows: TrainingItem[]; edit: boolean; onChange: (r: TrainingItem[]) => void }) {
  const set = (i: number, p: Partial<TrainingItem>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...p } : r)));
  if (!rows.length && !edit) return <div className="text-xs text-[var(--text-muted)]">Not filled in yet.</div>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] text-sm">
        <thead>
          <tr className="text-left text-xs text-[var(--text-muted)]">
            <th className="py-1 pr-2 font-medium">Skill to learn</th>
            <th className="py-1 pr-2 font-medium">Training schedule</th>
            <th className="py-1 pr-2 font-medium">Status</th>
            {edit && <th />}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td className="py-1 pr-2">{edit ? <input className={input} value={r.skill} onChange={(e) => set(i, { skill: e.target.value })} /> : r.skill}</td>
              <td className="py-1 pr-2">{edit ? <input className={input} placeholder="e.g. Nov 10–14, 9 AM" value={r.schedule} onChange={(e) => set(i, { schedule: e.target.value })} /> : r.schedule}</td>
              <td className="py-1 pr-2">
                {edit ? (
                  <select className={input} value={r.status} onChange={(e) => set(i, { status: e.target.value as TrainingItem["status"] })}>
                    <option value="planned">Planned</option>
                    <option value="ongoing">On-going</option>
                    <option value="completed">Completed</option>
                  </select>
                ) : (
                  <Badge tone={r.status === "completed" ? "good" : r.status === "ongoing" ? "info" : "muted"}>{r.status === "ongoing" ? "On-going" : r.status === "completed" ? "Completed" : "Planned"}</Badge>
                )}
              </td>
              {edit && (
                <td>
                  <button onClick={() => onChange(rows.filter((_, j) => j !== i))} className="text-[var(--text-muted)] hover:text-[var(--status-critical)]" aria-label="Remove">
                    <Trash2 size={14} />
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {edit && (
        <button onClick={() => onChange([...rows, { skill: "", schedule: "", status: "planned" }])} className={`${secondary} mt-2`}>
          <Plus size={15} /> Add a skill
        </button>
      )}
    </div>
  );
}

function AssessmentTable({ rows, edit, onChange }: { rows: AssessmentItem[]; edit: boolean; onChange: (r: AssessmentItem[]) => void }) {
  const set = (i: number, p: Partial<AssessmentItem>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...p } : r)));
  const num = (v: string) => (v === "" ? null : Math.max(0, Number(v)));
  if (!rows.length && !edit) return <div className="text-xs text-[var(--text-muted)]">Not filled in yet.</div>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] text-sm">
        <thead>
          <tr className="text-left text-xs text-[var(--text-muted)]">
            <th className="py-1 pr-2 font-medium">What is assessed</th>
            <th className="w-32 py-1 pr-2 font-medium">Score required</th>
            <th className="w-32 py-1 pr-2 font-medium">Score</th>
            {edit && <th />}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td className="py-1 pr-2">{edit ? <input className={input} value={r.item} onChange={(e) => set(i, { item: e.target.value })} /> : r.item}</td>
              <td className="py-1 pr-2">{edit ? <input type="number" min={0} className={input} value={r.required ?? ""} onChange={(e) => set(i, { required: num(e.target.value) ?? 0 })} /> : r.required}</td>
              <td className="py-1 pr-2">{edit ? <input type="number" min={0} className={input} value={r.score ?? ""} onChange={(e) => set(i, { score: num(e.target.value) })} /> : (r.score ?? "—")}</td>
              {edit && (
                <td>
                  <button onClick={() => onChange(rows.filter((_, j) => j !== i))} className="text-[var(--text-muted)] hover:text-[var(--status-critical)]" aria-label="Remove">
                    <Trash2 size={14} />
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {edit && (
        <button onClick={() => onChange([...rows, { item: "", required: 0, score: null }])} className={`${secondary} mt-2`}>
          <Plus size={15} /> Add an item to assess
        </button>
      )}
    </div>
  );
}
