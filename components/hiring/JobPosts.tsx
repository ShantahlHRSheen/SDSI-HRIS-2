"use client";

import { useCallback, useEffect, useState } from "react";
import { Building2, Copy, ExternalLink, Lock, Plus, Save, Send, Trash2 } from "lucide-react";
import { useHris } from "@/lib/store";
import { Badge } from "@/components/Badge";
import { Modal } from "@/components/Modal";
import { reportSaveError } from "@/lib/save-errors";
import { currentCompanyId } from "@/lib/companies";
import {
  JOB_STATUS,
  JOB_TYPES,
  applicationCounts,
  careersUrl,
  createJobPost,
  deleteJobPost,
  fetchJobPosts,
  fetchProfile,
  saveProfile,
  updateJobPost,
  type CompanyProfile,
  type JobPatch,
  type JobPost,
} from "@/lib/careers";
import { EDUCATION, fetchRequisitions, type Requisition } from "@/lib/requisition";

// HR: job posts for the public careers page, and the company profile shown
// there (lib/careers.ts). Online applications land in Applicants.

const input = "w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-2 text-sm disabled:opacity-70";
const lbl = "mb-1 block text-xs font-medium text-[var(--text-secondary)]";
const primary = "flex items-center gap-1.5 rounded-lg bg-[var(--series-1)] px-3 py-2 text-sm font-medium text-[var(--on-accent)] disabled:opacity-40";
const secondary = "flex items-center gap-1.5 rounded-lg border border-[var(--border-hairline)] px-3 py-2 text-sm text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40 disabled:opacity-40";
const danger = "flex items-center gap-1.5 rounded-lg border border-[var(--status-critical)]/50 px-3 py-2 text-sm text-[var(--status-critical)] hover:bg-[var(--status-critical)]/10 disabled:opacity-40";
const day = (iso: string | null) => (iso ? new Date(iso.length === 10 ? `${iso}T00:00:00+08:00` : iso).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric", year: "numeric" }) : "");

export function JobPosts() {
  const { branches, departments } = useHris();
  const [list, setList] = useState<JobPost[] | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [prfs, setPrfs] = useState<Requisition[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<JobPost | "new" | null>(null);
  const [seed, setSeed] = useState<JobPatch>({});
  const [profile, setProfile] = useState(false);

  const load = useCallback(() => {
    fetchJobPosts().then(
      (l) => {
        setList(l);
        setError(null);
      },
      (e) => setError(e instanceof Error ? e.message : "Couldn't load job posts."),
    );
    applicationCounts().then(setCounts, () => {});
    fetchRequisitions().then((l) => setPrfs(l.filter((r) => r.status === "approved")), () => {});
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const co = currentCompanyId();
  const place = (j: JobPost) => j.location || [branches.find((b) => b.id === j.branchId)?.name, departments.find((d) => d.id === j.departmentId)?.name].filter(Boolean).join(" · ");
  const posted = new Set((list ?? []).map((j) => j.requisitionId).filter(Boolean));

  function fromRequisition(id: string) {
    const r = prfs.find((x) => x.id === id);
    if (!r) return;
    const edu = r.education === "other" ? r.educationOther : (EDUCATION.find(([k]) => k === r.education)?.[1] ?? "");
    setSeed({
      title: r.position,
      branchId: r.branchId,
      departmentId: r.departmentId,
      employmentType: r.employmentType,
      slots: r.personnelNeeded,
      qualifications: [edu && `Education: ${edu}`, r.workExperience && `Experience: ${r.workExperience}`, r.skills && `Skills: ${r.skills}`].filter(Boolean).join("\n"),
      requisitionId: r.id,
    });
    setEditing("new");
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--text-secondary)]">
        Open posts appear on the public careers page and the HRIS homepage, where anyone can apply without an account. Applications arrive in <b>Applicants</b> as &ldquo;Applied online&rdquo;.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => {
            setSeed({});
            setEditing("new");
          }}
          className={primary}
        >
          <Plus size={16} /> New job post
        </button>
        {prfs.length > 0 && (
          <select className={`${input} w-auto`} value="" onChange={(e) => fromRequisition(e.target.value)} aria-label="Post from an approved requisition">
            <option value="">Post from an approved requisition…</option>
            {prfs.map((r) => (
              <option key={r.id} value={r.id}>
                {[r.prfNo, r.position, posted.has(r.id) ? "(already posted)" : ""].filter(Boolean).join(" · ")}
              </option>
            ))}
          </select>
        )}
        <button onClick={() => setProfile(true)} className={secondary}>
          <Building2 size={16} /> Company profile
        </button>
        <a href={careersUrl(co)} target="_blank" rel="noopener noreferrer" className={secondary}>
          <ExternalLink size={16} /> View careers page
        </a>
      </div>

      {error && <div className="text-sm text-[var(--status-critical)]">{error}</div>}
      {list === null && !error && <div className="text-sm text-[var(--text-muted)]">Loading…</div>}
      {list && list.length === 0 && <div className="rounded-xl border border-dashed border-[var(--border-hairline)] p-6 text-center text-sm text-[var(--text-muted)]">No job posts yet.</div>}
      <div className="space-y-2">
        {list?.map((j) => (
          <button key={j.id} onClick={() => setEditing(j)} className="flex w-full flex-wrap items-center gap-3 rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-1)] p-3 text-left hover:bg-[var(--gridline)]/30">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-[var(--text-primary)]">
                {j.title}
                {j.slots > 1 ? ` × ${j.slots}` : ""}
              </div>
              <div className="truncate text-xs text-[var(--text-muted)]">
                {[place(j), j.postedAt && `Posted ${day(j.postedAt)}`, j.closesOn && `Until ${day(j.closesOn)}`].filter(Boolean).join(" · ") || "—"}
              </div>
            </div>
            <span className="text-xs text-[var(--text-secondary)]">
              <b className="text-[var(--text-primary)]">{counts[j.id] ?? 0}</b> application{(counts[j.id] ?? 0) === 1 ? "" : "s"}
            </span>
            <Badge tone={JOB_STATUS[j.status].tone}>{JOB_STATUS[j.status].label}</Badge>
          </button>
        ))}
      </div>

      {editing && (
        <JobPostModal
          job={editing === "new" ? null : editing}
          seed={seed}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}
      {profile && <ProfileModal onClose={() => setProfile(false)} />}
    </div>
  );
}

function JobPostModal({ job, seed, onClose, onSaved }: { job: JobPost | null; seed: JobPatch; onClose: () => void; onSaved: () => void }) {
  const { branches, departments } = useHris();
  const [v, setV] = useState<JobPatch>(job ?? { slots: 1, ...seed });
  const [busy, setBusy] = useState(false);
  const set = (p: JobPatch) => setV((c) => ({ ...c, ...p }));
  const status = job?.status ?? "draft";
  const co = currentCompanyId();

  async function save(next?: JobPost["status"]) {
    if (!v.title?.trim()) return reportSaveError("Type the job title.");
    setBusy(true);
    try {
      const patch: JobPatch = { ...v, title: v.title.trim(), slots: Math.max(1, Math.min(500, Number(v.slots) || 1)), ...(next ? { status: next } : {}) };
      if (job) await updateJobPost(job.id, patch);
      else await createJobPost(patch);
      onSaved();
    } catch (e) {
      reportSaveError("Couldn't save the job post", e);
      setBusy(false);
    }
  }

  const area = (k: "summary" | "responsibilities" | "qualifications" | "benefits", label: string, hint: string) => (
    <label className="sm:col-span-2">
      <span className={lbl}>{label}</span>
      <textarea rows={4} className={input} placeholder={hint} value={v[k] ?? ""} onChange={(e) => set({ [k]: e.target.value })} />
    </label>
  );

  return (
    <Modal open onClose={onClose} title={job ? "Job post" : "New job post"} wide>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="sm:col-span-2">
          <span className={lbl}>Job title *</span>
          <input className={input} value={v.title ?? ""} onChange={(e) => set({ title: e.target.value })} placeholder="e.g. Sales Associate" />
        </label>
        <label>
          <span className={lbl}>Branch</span>
          <select className={input} value={v.branchId ?? ""} onChange={(e) => set({ branchId: e.target.value || null })}>
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
          <select className={input} value={v.departmentId ?? ""} onChange={(e) => set({ departmentId: e.target.value || null })}>
            <option value="">—</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className={lbl}>Location shown to applicants (optional)</span>
          <input className={input} value={v.location ?? ""} onChange={(e) => set({ location: e.target.value })} placeholder="e.g. Cabanatuan City" />
        </label>
        <label>
          <span className={lbl}>Employment type</span>
          <select className={input} value={v.employmentType ?? ""} onChange={(e) => set({ employmentType: (e.target.value || null) as JobPatch["employmentType"] })}>
            <option value="">—</option>
            {JOB_TYPES.map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className={lbl}>Number of openings</span>
          <input type="number" min={1} max={500} className={input} value={v.slots ?? 1} onChange={(e) => set({ slots: Number(e.target.value) })} />
        </label>
        <label>
          <span className={lbl}>Accept applications until (optional)</span>
          <input type="date" className={input} value={v.closesOn ?? ""} onChange={(e) => set({ closesOn: e.target.value || null })} />
        </label>
        {area("summary", "About the job", "A short description of the role.")}
        {area("responsibilities", "What you'll do", "One duty per line.")}
        {area("qualifications", "Qualifications", "Education, experience, skills — one per line.")}
        {area("benefits", "What we offer (optional)", "Benefits, perks — one per line.")}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Badge tone={JOB_STATUS[status].tone}>{JOB_STATUS[status].label}</Badge>
        {job && status === "open" && (
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard?.writeText(new URL(careersUrl(co, job.id), window.location.origin).toString());
            }}
            className={secondary}
            title="Copy the link to share on Facebook or job sites"
          >
            <Copy size={15} /> Copy link
          </button>
        )}
        <div className="ml-auto flex flex-wrap gap-2">
          {job && status !== "open" && (
            <button disabled={busy} onClick={() => window.confirm("Delete this job post?") && deleteJobPost(job.id).then(onSaved, (e) => reportSaveError("Couldn't delete", e))} className={danger}>
              <Trash2 size={15} /> Delete
            </button>
          )}
          <button disabled={busy} onClick={() => save()} className={secondary}>
            <Save size={15} /> Save{status === "draft" ? " draft" : ""}
          </button>
          {status === "open" ? (
            <button disabled={busy} onClick={() => save("closed")} className={secondary}>
              <Lock size={15} /> Close the post
            </button>
          ) : (
            <button disabled={busy} onClick={() => save("open")} className={primary}>
              <Send size={15} /> {status === "closed" ? "Reopen" : "Publish"} on the careers page
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}

export function ProfileModal({ onClose }: { onClose: () => void }) {
  const [v, setV] = useState<CompanyProfile | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    fetchProfile().then(setV, (e) => {
      reportSaveError("Couldn't load the company profile", e);
      onClose();
    });
  }, [onClose]);
  const set = (p: Partial<CompanyProfile>) => setV((c) => (c ? { ...c, ...p } : c));
  const one = (k: keyof CompanyProfile, label: string, ph = "") => (
    <label>
      <span className={lbl}>{label}</span>
      <input className={input} value={(v?.[k] as string) ?? ""} placeholder={ph} onChange={(e) => set({ [k]: e.target.value })} />
    </label>
  );
  const many = (k: keyof CompanyProfile, label: string, ph = "") => (
    <label className="sm:col-span-2">
      <span className={lbl}>{label}</span>
      <textarea rows={4} className={input} value={(v?.[k] as string) ?? ""} placeholder={ph} onChange={(e) => set({ [k]: e.target.value })} />
    </label>
  );
  return (
    <Modal open onClose={onClose} title="Company profile — public careers page" wide>
      {!v ? (
        <p className="text-sm text-[var(--text-muted)]">Loading…</p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">{one("tagline", "Tagline", "A short line under the company name")}</div>
            {many("about", "About us", "Who the company is, what it does, its history.")}
            {many("mission", "Mission")}
            {many("vision", "Vision")}
            {many("coreValues", "Core values", "One per line.")}
            {one("address", "Address", "Shown under Contact us")}
            {one("phone", "Phone")}
            {one("email", "Email for applicants")}
            {one("website", "Website (optional)")}
            {one("facebook", "Facebook page link (optional)")}
            {many("careersNote", "Note above the job list (optional)", "e.g. Walk-in applicants are welcome Monday to Friday, 9 AM to 4 PM.")}
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
                  await saveProfile(v);
                  onClose();
                } catch (e) {
                  reportSaveError("Couldn't save the company profile", e);
                  setBusy(false);
                }
              }}
              className={primary}
            >
              <Save size={16} /> Save
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
