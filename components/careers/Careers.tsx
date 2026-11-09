"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Briefcase, Building2, CalendarDays, CheckCircle2, Globe, ThumbsUp, Mail, MapPin, Phone, Send, Users } from "lucide-react";
import { Modal } from "@/components/Modal";
import { COMPANIES, COMPANY_ORDER, GROUP_NAME, isCompanyReady, type CompanyId } from "@/lib/companies";
import { examUrl } from "@/lib/exams";
import { RESUME_ACCEPT, RESUME_MAX_BYTES, careersUrl, siteUrl, jobTypeLabel, type PublicCareers, type PublicJob } from "@/lib/careers";

/* eslint-disable @next/next/no-img-element -- static brand logos */

// The public careers pages: /careers (all companies) and /careers/<company>
// (its profile and open jobs, with the application form). Data comes from
// app/api/careers; applications go to app/api/careers/apply.

const theme = (co: CompanyId) => COMPANIES[co].formTheme ?? { deep: "#0b3d2a", mid: "#1f7a5c", accent: "#7cc9a0" };
const fmtDate = (d: string | null) => (d ? new Date(d.length === 10 ? `${d}T00:00:00+08:00` : d).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", month: "long", day: "numeric", year: "numeric" }) : "");

export function useCareers(co: CompanyId | null) {
  const [data, setData] = useState<PublicCareers | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!co || !isCompanyReady(co)) return;
    let live = true;
    fetch(`/api/careers?co=${co}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: PublicCareers) => live && setData(d))
      .catch(() => live && setError(true));
    return () => {
      live = false;
    };
  }, [co]);
  return { data, error };
}

// ---- All companies (the homepage section and /careers) ------------------------------

export function GroupCareers({ compact = false }: { compact?: boolean }) {
  const ready = COMPANY_ORDER.filter((c) => isCompanyReady(c));
  return (
    <section className="w-full" aria-labelledby="careers-heading">
      <h2 id="careers-heading" className="sr-only">
        Careers at {GROUP_NAME}
      </h2>
      <div className="grid gap-3 sm:grid-cols-3">
        {ready.map((co) => (
          <CompanyCard key={co} co={co} compact={compact} />
        ))}
      </div>
    </section>
  );
}

function CompanyCard({ co, compact }: { co: CompanyId; compact: boolean }) {
  const { data } = useCareers(co);
  const c = COMPANIES[co];
  const t = theme(co);
  const jobs = data?.jobs ?? [];
  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-1)]">
      <div className="flex items-center gap-3 px-4 py-3" style={{ background: `linear-gradient(120deg, ${t.deep}, ${t.mid})` }}>
        <img src={c.logo} alt="" className="h-11 w-11 shrink-0 rounded-full bg-white object-contain p-0.5" />
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-white">{c.name}</div>
          {data?.profile?.tagline && <div className="truncate text-xs text-white/80">{data.profile.tagline}</div>}
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="text-xs font-medium text-[var(--text-muted)] uppercase">{data ? (jobs.length ? `${jobs.length} open position${jobs.length > 1 ? "s" : ""}` : "No open positions right now") : "Loading…"}</div>
        <ul className="space-y-1">
          {jobs.slice(0, compact ? 3 : 6).map((j) => (
            <li key={j.id}>
              <Link href={careersUrl(co, j.id)} className="block rounded-lg px-2 py-1.5 text-sm hover:bg-[var(--gridline)]/40">
                <span className="font-medium text-[var(--text-primary)]">{j.title}</span>
                {j.place && <span className="block truncate text-xs text-[var(--text-muted)]">{j.place}</span>}
              </Link>
            </li>
          ))}
        </ul>
        <Link href={siteUrl(co)} className="mt-auto inline-flex items-center gap-1 text-sm font-medium hover:underline" style={{ color: t.mid }}>
          Visit {c.shortName === "SDSI" ? "Shantahl" : c.shortName}{jobs.length ? " & see all jobs" : ""} →
        </Link>
      </div>
    </div>
  );
}

// ---- One company: /careers/<company> ------------------------------------------------

// jobsOnly: just the open positions (the company website's Careers page).
export function CompanyCareers({ co, initialJob, jobsOnly = false }: { co: CompanyId; initialJob: string | null; jobsOnly?: boolean }) {
  const { data, error } = useCareers(co);
  const c = COMPANIES[co];
  const t = theme(co);
  const [open, setOpen] = useState<string | null>(initialJob);
  const job = data?.jobs.find((j) => j.id === open) ?? null;
  const p = data?.profile;
  const address = p?.address || c.info.address;
  const phone = p?.phone || c.info.phone;
  const email = p?.email || c.info.email;

  function choose(id: string | null) {
    setOpen(id);
    const u = new URL(window.location.href);
    if (id) u.searchParams.set("job", id);
    else u.searchParams.delete("job");
    window.history.replaceState(null, "", u);
  }

  return (
    <div className="flex flex-1 flex-col">
      {!jobsOnly && (
      <section className="relative overflow-hidden" style={{ background: `linear-gradient(120deg, ${t.deep}, ${t.mid})` }}>
        <div className="mx-auto max-w-5xl px-4 py-4">
          <div className="flex flex-col items-center gap-3 py-8 text-center sm:flex-row sm:text-left">
            <img src={c.logo} alt="" className="h-24 w-24 shrink-0 rounded-full bg-white object-contain p-1 shadow-lg" />
            <div>
              <h1 className="text-2xl font-semibold text-white sm:text-3xl">{c.name}</h1>
              {p?.tagline && <p className="mt-1 text-base text-white/85">{p.tagline}</p>}
              <a href="#jobs" className="mt-3 inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-semibold" style={{ background: t.accent, color: t.deep }}>
                <Briefcase size={15} /> {data ? `${data.jobs.length} open position${data.jobs.length === 1 ? "" : "s"}` : "Open positions"}
              </a>
            </div>
          </div>
        </div>
      </section>
      )}

      <main className="mx-auto w-full max-w-5xl flex-1 space-y-8 px-4 py-8">
        {error && <p className="text-sm text-[var(--status-critical)]">The careers page couldn&rsquo;t load. Please refresh.</p>}

        {!jobsOnly && (p?.about || p?.mission || p?.vision || p?.coreValues) && (
          <section aria-labelledby="about" className="grid gap-4 lg:grid-cols-3">
            {p?.about && (
              <div className="lg:col-span-3">
                <h2 id="about" className="mb-2 text-lg font-semibold text-[var(--text-primary)]">
                  About us
                </h2>
                <p className="text-sm leading-relaxed whitespace-pre-wrap text-[var(--text-secondary)]">{p.about}</p>
              </div>
            )}
            {[
              ["Mission", p?.mission],
              ["Vision", p?.vision],
              ["Core values", p?.coreValues],
            ]
              .filter(([, v]) => v)
              .map(([k, v]) => (
                <div key={k} className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-1)] p-4" style={{ borderTop: `3px solid ${t.mid}` }}>
                  <h3 className="mb-1.5 text-sm font-semibold text-[var(--text-primary)]">{k}</h3>
                  <p className="text-sm leading-relaxed whitespace-pre-wrap text-[var(--text-secondary)]">{v}</p>
                </div>
              ))}
          </section>
        )}

        <section id="jobs" aria-labelledby="jobs-heading" className="scroll-mt-4">
          <h2 id="jobs-heading" className="mb-1 text-lg font-semibold text-[var(--text-primary)]">
            Open positions
          </h2>
          {p?.careersNote && <p className="mb-3 text-sm whitespace-pre-wrap text-[var(--text-secondary)]">{p.careersNote}</p>}
          {!data && !error && <p className="text-sm text-[var(--text-muted)]">Loading…</p>}
          {data && data.jobs.length === 0 && (
            <div className="rounded-xl border border-dashed border-[var(--border-hairline)] p-6 text-center text-sm text-[var(--text-muted)]">No open positions right now. Please check again soon.</div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            {data?.jobs.map((j) => (
              <button key={j.id} onClick={() => choose(j.id)} className="flex flex-col gap-2 overflow-hidden rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-1)] p-4 text-left transition-shadow hover:shadow-md">
                {j.banner && (
                  <div className="-mx-4 -mt-4 mb-1 aspect-[16/9] bg-[#eef2f0]">
                    <img src={j.banner} alt="" className="h-full w-full object-contain" />
                  </div>
                )}
                <div className="flex items-start gap-2">
                  <span className="min-w-0 flex-1 text-base font-semibold text-[var(--text-primary)]">{j.title}</span>
                  <span className="shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold" style={{ background: t.accent, color: t.deep }}>
                    Apply
                  </span>
                </div>
                <JobFacts j={j} />
                {j.summary && <p className="line-clamp-2 text-sm text-[var(--text-secondary)]">{j.summary}</p>}
              </button>
            ))}
          </div>
        </section>

        {!jobsOnly && (
        <section aria-labelledby="contact" className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-1)] p-4">
          <h2 id="contact" className="mb-2 text-sm font-semibold text-[var(--text-primary)]">
            Contact us
          </h2>
          <ul className="grid gap-2 text-sm text-[var(--text-secondary)] sm:grid-cols-2">
            {address && <Fact icon={MapPin}>{address}</Fact>}
            {phone && <Fact icon={Phone}>{phone}</Fact>}
            {email && (
              <Fact icon={Mail}>
                <a href={`mailto:${email}`} className="hover:underline">
                  {email}
                </a>
              </Fact>
            )}
            {p?.website && (
              <Fact icon={Globe}>
                <a href={safeHref(p.website)} target="_blank" rel="noopener noreferrer" className="hover:underline">
                  {p.website}
                </a>
              </Fact>
            )}
            {p?.facebook && (
              <Fact icon={ThumbsUp}>
                <a href={safeHref(p.facebook)} target="_blank" rel="noopener noreferrer" className="hover:underline">
                  Facebook page
                </a>
              </Fact>
            )}
          </ul>
        </section>
        )}
      </main>

      {job && <JobModal co={co} job={job} onClose={() => choose(null)} />}
      {open && data && !job && (
        <Modal open onClose={() => choose(null)} title="Job not found">
          <p className="text-sm text-[var(--text-secondary)]">This position is no longer open. See the other open positions on this page.</p>
        </Modal>
      )}
    </div>
  );
}

// Only http(s) links from the profile become links.
function safeHref(u: string): string {
  const v = u.trim();
  const withScheme = /^https?:\/\//i.test(v) ? v : `https://${v}`;
  try {
    const url = new URL(withScheme);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : "#";
  } catch {
    return "#";
  }
}

function Fact({ icon: Icon, children }: { icon: typeof MapPin; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <Icon size={15} className="mt-0.5 shrink-0 text-[var(--text-muted)]" />
      <span className="min-w-0 break-words">{children}</span>
    </li>
  );
}

function JobFacts({ j }: { j: PublicJob }) {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-[var(--text-muted)]">
      {j.place && (
        <span className="inline-flex items-center gap-1">
          <MapPin size={13} /> {j.place}
        </span>
      )}
      {j.employmentType && (
        <span className="inline-flex items-center gap-1">
          <Building2 size={13} /> {jobTypeLabel(j.employmentType)}
        </span>
      )}
      {j.slots > 1 && (
        <span className="inline-flex items-center gap-1">
          <Users size={13} /> {j.slots} openings
        </span>
      )}
      {j.closesOn && (
        <span className="inline-flex items-center gap-1">
          <CalendarDays size={13} /> Until {fmtDate(j.closesOn)}
        </span>
      )}
    </div>
  );
}

function JobModal({ co, job, onClose }: { co: CompanyId; job: PublicJob; onClose: () => void }) {
  const t = theme(co);
  const [applying, setApplying] = useState(false);
  return (
    <Modal open onClose={onClose} title={job.title} wide>
      {!applying ? (
        <div className="space-y-4">
          {job.banner && <img src={job.banner} alt={`${job.title} — hiring`} className="max-h-[70vh] w-full rounded-lg bg-[#eef2f0] object-contain" />}
          <JobFacts j={job} />
          {[
            ["About the job", job.summary],
            ["What you'll do", job.responsibilities],
            ["Qualifications", job.qualifications],
            ["What we offer", job.benefits],
          ]
            .filter(([, v]) => v)
            .map(([k, v]) => (
              <div key={k}>
                <h3 className="mb-1 text-sm font-semibold text-[var(--text-primary)]">{k}</h3>
                <p className="text-sm leading-relaxed whitespace-pre-wrap text-[var(--text-secondary)]">{v}</p>
              </div>
            ))}
          <div className="flex justify-end">
            <button onClick={() => setApplying(true)} className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold text-white" style={{ background: t.mid }}>
              <Send size={15} /> Apply for this job
            </button>
          </div>
        </div>
      ) : (
        <ApplyForm co={co} job={job} onBack={() => setApplying(false)} />
      )}
    </Modal>
  );
}

const field = "w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--page-plane)] px-3 py-2 text-sm text-[var(--text-primary)]";
const lbl = "mb-1 block text-xs font-medium text-[var(--text-secondary)]";

function ApplyForm({ co, job, onBack }: { co: CompanyId; job: PublicJob; onBack: () => void }) {
  const t = theme(co);
  const c = COMPANIES[co];
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [links, setLinks] = useState<{ token: string; label: string; what: string }[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const fileError = useMemo(() => (file && file.size > RESUME_MAX_BYTES ? "Your resume is too large. Up to 4 MB, please." : null), [file]);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (fileError) return;
    setBusy(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    form.set("co", co);
    form.set("jobId", job.id);
    try {
      const res = await fetch("/api/careers/apply", { method: "POST", body: form });
      const body = (await res.json().catch(() => ({}))) as { error?: string; examToken?: string | null; psychToken?: string | null };
      if (!res.ok) throw new Error(body.error ?? "Your application couldn't be sent. Please try again.");
      setLinks([
        ...(body.examToken ? [{ token: body.examToken, label: "Take the initial exam", what: "Initial exam" }] : []),
        ...(body.psychToken ? [{ token: body.psychToken, label: "Take the psychological screening", what: "Psychological screening (about 10 minutes)" }] : []),
      ]);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Your application couldn't be sent. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (done)
    return (
      <div className="space-y-3 py-4 text-center">
        <CheckCircle2 size={44} className="mx-auto" style={{ color: t.mid }} />
        <p className="text-base font-semibold text-[var(--text-primary)]">Thank you — your application was sent!</p>
        {links.length ? (
          <div className="space-y-3 rounded-lg border border-[var(--border-hairline)] p-4 text-left">
            <p className="text-sm font-semibold text-[var(--text-primary)]">Next: {links.length > 1 ? "two short tests" : links[0].what.toLowerCase()}</p>
            <p className="text-sm text-[var(--text-secondary)]">
              Take {links.length > 1 ? "them" : "it"} now, or save the link{links.length > 1 ? "s" : ""} below and take {links.length > 1 ? "them" : "it"} within 7 days. Each link is only for you — don&rsquo;t share it. Open each in a new tab.
            </p>
            {links.map((l) => (
              <div key={l.token} className="space-y-1.5">
                <div className="text-xs font-medium text-[var(--text-muted)]">{l.what}</div>
                <a href={examUrl(co, l.token)} target="_blank" rel="noopener" className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold text-white" style={{ background: t.mid }}>
                  {l.label}
                </a>
                <input readOnly value={typeof window === "undefined" ? "" : new URL(examUrl(co, l.token), window.location.origin).toString()} onFocus={(e) => e.currentTarget.select()} className={`${field} text-xs`} aria-label={`Your link: ${l.what}`} />
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-[var(--text-secondary)]">
            {c.name}&rsquo;s HR team will review it and contact you by email or phone if you&rsquo;re shortlisted for {job.title}.
          </p>
        )}
      </div>
    );

  return (
    <form onSubmit={submit} className="space-y-3">
      <button type="button" onClick={onBack} className="inline-flex items-center gap-1 text-xs text-[var(--text-muted)] hover:underline">
        <ArrowLeft size={13} /> Back to the job
      </button>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="sm:col-span-2">
          <span className={lbl}>Full name *</span>
          <input name="name" required minLength={2} maxLength={100} autoComplete="name" className={field} />
        </label>
        <label>
          <span className={lbl}>Email *</span>
          <input name="email" type="email" required maxLength={200} autoComplete="email" className={field} />
        </label>
        <label>
          <span className={lbl}>Contact number *</span>
          <input name="phone" type="tel" required pattern="[0-9+()\-\s]{7,30}" autoComplete="tel" placeholder="09XX XXX XXXX" className={field} />
        </label>
        <label className="sm:col-span-2">
          <span className={lbl}>Address *</span>
          <input name="address" required minLength={3} maxLength={300} autoComplete="street-address" className={field} />
        </label>
        <label className="sm:col-span-2">
          <span className={lbl}>Resume * (PDF, Word or photo, up to 4 MB)</span>
          <input name="resume" type="file" required accept={RESUME_ACCEPT} onChange={(e) => setFile(e.target.files?.[0] ?? null)} className={`${field} file:mr-3 file:rounded-md file:border-0 file:bg-[var(--gridline)] file:px-2 file:py-1 file:text-xs`} />
          {fileError && <span className="mt-1 block text-xs text-[var(--status-critical)]">{fileError}</span>}
        </label>
        <label className="sm:col-span-2">
          <span className={lbl}>Message to HR (optional)</span>
          <textarea name="coverLetter" rows={4} maxLength={4000} placeholder="Tell us a little about yourself and why you'd like this job." className={field} />
        </label>
        {/* Left empty by people; bots fill it in. */}
        <input name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 opacity-0" />
      </div>
      <label className="flex items-start gap-2 text-xs text-[var(--text-secondary)]">
        <input type="checkbox" name="consent" value="yes" required className="mt-0.5" />
        <span>
          I agree that {c.name} may collect and use the information and resume I send here only to process my application and to contact me about it, in line with the Data Privacy Act of 2012
          (RA 10173). I can ask HR to see, correct or delete my information.
        </span>
      </label>
      {error && <p className="text-sm text-[var(--status-critical)]">{error}</p>}
      <div className="flex justify-end">
        <button type="submit" disabled={busy || !!fileError} className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" style={{ background: t.mid }}>
          <Send size={15} /> {busy ? "Sending…" : "Send application"}
        </button>
      </div>
    </form>
  );
}
