"use client";

import { useCallback, useEffect, useState } from "react";
import { Building2, Copy, ExternalLink, ImagePlus, Lock, Plus, Save, Send, Trash2, X } from "lucide-react";
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
import { fetchExams, type Exam } from "@/lib/exams";
import { publicLink } from "@/lib/site-domains";
import { COVER_ACCEPT, coverUrl, removeCover, uploadImage } from "@/lib/news";

/* eslint-disable @next/next/no-img-element -- photos from the company-media bucket */

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
  const [exams, setExams] = useState<Exam[]>([]);
  // Banner photos uploaded while this is open (removed if not kept).
  const [uploaded, setUploaded] = useState<string[]>([]);
  async function close() {
    await Promise.all(uploaded.map(removeCover));
    onClose();
  }
  useEffect(() => {
    fetchExams().then((l) => setExams(l.filter((e) => e.status === "active" || e.id === v.examId)), () => {});
    // once, on open
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function save(next?: JobPost["status"]) {
    if (!v.title?.trim()) return reportSaveError("Type the job title.");
    setBusy(true);
    try {
      const full: JobPatch = { ...v, title: v.title.trim(), slots: Math.max(1, Math.min(500, Number(v.slots) || 1)), ...(next ? { status: next } : {}) };
      // Only what changed (and no empty exam settings), so a company that
      // hasn't run the exam updates (phases 85–86) can still save posts.
      const patch = Object.fromEntries(
        Object.entries(full).filter(([k, val]) => {
          if (k === "id" || k === "postedAt" || k === "updatedAt") return false;
          if (job) return JSON.stringify(val) !== JSON.stringify((job as unknown as Record<string, unknown>)[k]);
          return !((k === "examId" || k === "psychScreening" || k === "bannerPhotoPath") && !val);
        }),
      ) as JobPatch;
      if (job) await updateJobPost(job.id, patch);
      else await createJobPost(patch);
      // A banner replaced or removed, and ones uploaded but not kept.
      const keep = full.bannerPhotoPath ?? null;
      await Promise.all([...uploaded, job?.bannerPhotoPath].filter((x): x is string => !!x && x !== keep).map(removeCover));
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
    <Modal open onClose={close} title={job ? "Job post" : "New job post"} wide>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="sm:col-span-2">
          <span className={lbl}>Job title *</span>
          <input className={input} value={v.title ?? ""} onChange={(e) => set({ title: e.target.value })} placeholder="e.g. Sales Associate" />
        </label>
        <div className="sm:col-span-2">
          <span className={lbl}>Hiring banner photo (optional — JPG, PNG or WebP up to 5 MB; also the picture when the link is shared on Facebook)</span>
          {v.bannerPhotoPath ? (
            <div className="relative w-fit">
              <img src={coverUrl(v.bannerPhotoPath) ?? ""} alt="" className="max-h-64 rounded-lg border border-[var(--border-hairline)] object-contain" />
              <button onClick={() => set({ bannerPhotoPath: null })} className="absolute top-1.5 right-1.5 rounded-full bg-black/60 p-1 text-white" aria-label="Remove the banner">
                <X size={14} />
              </button>
            </div>
          ) : (
            <label className={`${secondary} w-fit cursor-pointer`}>
              <ImagePlus size={16} /> {busy ? "Uploading…" : "Upload a banner"}
              <input
                type="file"
                accept={COVER_ACCEPT}
                className="hidden"
                disabled={busy}
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (!f) return;
                  setBusy(true);
                  try {
                    const path = await uploadImage(f, "jobs");
                    setUploaded((u) => [...u, path]);
                    set({ bannerPhotoPath: path });
                  } catch (err) {
                    reportSaveError("Couldn't upload the banner", err);
                  } finally {
                    setBusy(false);
                  }
                }}
              />
            </label>
          )}
        </div>
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
        <label className="sm:col-span-2">
          <span className={lbl}>Initial exam for online applicants (optional)</span>
          <select className={input} value={v.examId ?? ""} onChange={(e) => set({ examId: e.target.value || null })}>
            <option value="">{exams.length ? "— No exam —" : "— No active exams (build one in Hiring → Exams) —"}</option>
            {exams.map((e) => (
              <option key={e.id} value={e.id}>
                {e.title}
                {e.status !== "active" ? " (not active)" : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)] sm:col-span-2">
          <input type="checkbox" checked={!!v.psychScreening} onChange={(e) => set({ psychScreening: e.target.checked })} />
          Also give the Psychological screening (30 statements, about 10 minutes; results for HR only)
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
              void navigator.clipboard?.writeText(publicLink(co, careersUrl(co, job.id), window.location.origin));
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
  const [orig, setOrig] = useState<CompanyProfile | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploaded, setUploaded] = useState<string[]>([]);
  useEffect(() => {
    fetchProfile().then(
      (p) => {
        setV(p);
        setOrig(p);
      },
      (e) => {
        reportSaveError("Couldn't load the company profile", e);
        onClose();
      },
    );
  }, [onClose]);
  const set = (p: Partial<CompanyProfile>) => setV((c) => (c ? { ...c, ...p } : c));
  const one = (k: keyof CompanyProfile, label: string, ph = "") => (
    <label>
      <span className={lbl}>{label}</span>
      <input className={input} value={(v?.[k] as string) ?? ""} placeholder={ph} onChange={(e) => set({ [k]: e.target.value })} />
    </label>
  );
  const many = (k: keyof CompanyProfile, label: string, ph = "", rows = 4) => (
    <label className="sm:col-span-2">
      <span className={lbl}>{label}</span>
      <textarea rows={rows} className={input} value={(v?.[k] as string) ?? ""} placeholder={ph} onChange={(e) => set({ [k]: e.target.value })} />
    </label>
  );
  const photo = (k: "heroPhotoPath" | "founderPhotoPath", label: string, tall = false) => {
    const url = coverUrl(v?.[k] ?? null);
    return (
      <div className="sm:col-span-1">
        <span className={lbl}>{label}</span>
        {url ? (
          <div className="relative w-fit">
            <img src={url} alt="" className={`${tall ? "aspect-[4/5] w-40" : "aspect-[16/9] w-72"} rounded-lg object-cover`} />
            <button onClick={() => set({ [k]: null })} className="absolute top-1.5 right-1.5 rounded-full bg-black/60 p-1 text-white" aria-label="Remove the photo">
              <X size={14} />
            </button>
          </div>
        ) : (
          <label className={`${secondary} w-fit cursor-pointer`}>
            <ImagePlus size={16} /> {busy ? "Uploading…" : "Add a photo"}
            <input
              type="file"
              accept={COVER_ACCEPT}
              className="hidden"
              disabled={busy}
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (!f) return;
                setBusy(true);
                try {
                  const path = await uploadImage(f, "profile");
                  setUploaded((u) => [...u, path]);
                  set({ [k]: path });
                } catch (err) {
                  reportSaveError("Couldn't upload the photo", err);
                } finally {
                  setBusy(false);
                }
              }}
            />
          </label>
        )}
      </div>
    );
  };
  async function close() {
    await Promise.all(uploaded.map(removeCover));
    onClose();
  }
  return (
    <Modal open onClose={close} title="Company profile — public website" wide>
      {!v ? (
        <p className="text-sm text-[var(--text-muted)]">Loading…</p>
      ) : (
        <>
          <p className="mb-3 text-xs text-[var(--text-muted)]">Shown on the company&rsquo;s own website (homepage, About, Founder, Careers, Contact). Photos can be seen by anyone with the link.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">{one("tagline", "Tagline", "A short line under the company name")}</div>
            {photo("heroPhotoPath", "Homepage banner photo (wide)")}
            <div className="hidden sm:block" />
            {many("about", "About us", "Who the company is, what it does, its history.")}
            {many("mission", "Mission")}
            {many("vision", "Vision")}
            {many("coreValues", "Core values", "One per line.")}
            <div className="pt-2 text-xs font-semibold text-[var(--text-primary)] uppercase sm:col-span-2">Our Founder</div>
            {one("founderName", "Founder's name")}
            {one("founderTitle", "Title", "e.g. Founder and Chairperson")}
            {many("founderMessage", "Founder's message or story", "", 5)}
            {photo("founderPhotoPath", "Founder's photo (portrait)", true)}
            <div className="hidden sm:block" />
            <div className="pt-2 text-xs font-semibold text-[var(--text-primary)] uppercase sm:col-span-2">Contact and careers</div>
            {one("address", "Address", "Shown under Contact us")}
            {one("phone", "Phone")}
            {one("email", "Email for applicants")}
            {one("website", "Website (optional)")}
            {one("facebook", "Facebook page link (optional)")}
            {many("careersNote", "Note above the job list (optional)", "e.g. Walk-in applicants are welcome Monday to Friday, 9 AM to 4 PM.")}
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button onClick={close} className={secondary}>
              Cancel
            </button>
            <button
              disabled={busy}
              onClick={async () => {
                if (!orig) return;
                setBusy(true);
                try {
                  // Only what changed, so a company that hasn't run the
                  // website update for founders (phase 87) can still save.
                  const changed = Object.fromEntries(Object.entries(v).filter(([k, val]) => val !== orig[k as keyof CompanyProfile])) as Partial<CompanyProfile>;
                  if (Object.keys(changed).length) await saveProfile(changed);
                  // Photos replaced or removed, and ones uploaded but not kept.
                  const keep = new Set([v.heroPhotoPath, v.founderPhotoPath].filter(Boolean));
                  await Promise.all([...uploaded, orig.heroPhotoPath, orig.founderPhotoPath].filter((x): x is string => !!x && !keep.has(x)).map(removeCover));
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
