import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Briefcase, MapPin } from "lucide-react";
import { SiteShell } from "@/components/site/SiteShell";
import { NewsCard } from "@/components/site/NewsCard";
import { COMPANIES, GROUP_NAME } from "@/lib/companies";
import { careersUrl, jobTypeLabel, siteUrl } from "@/lib/careers";
import { getProfile, listJobs, listNews, readyCompanies } from "@/lib/server/site";

/* eslint-disable @next/next/no-img-element -- static brand logos */

// The public company website: the group, its companies, news and careers.
// Employees sign in from "Employee Login" (upper right) at /login.
type Props = { searchParams: Promise<{ next?: string }> };

export default async function HomePage({ searchParams }: Props) {
  // Older sign-in links (/?next=/meetings/…) go to the sign-in page.
  const next = (await searchParams).next;
  if (typeof next === "string" && next) redirect(`/login?next=${encodeURIComponent(next)}`);

  const cos = readyCompanies();
  const [profiles, jobs, news] = await Promise.all([
    Promise.all(cos.map((co) => getProfile(co))),
    Promise.all(cos.map(async (co) => (await listJobs(co)).map((j) => ({ ...j, co })))),
    listNews("all", 1, 3),
  ]);
  const allJobs = jobs.flat().sort((a, b) => (b.postedAt ?? "").localeCompare(a.postedAt ?? ""));

  return (
    <SiteShell>
      {/* Hero */}
      <section className="relative overflow-hidden bg-[#013825] text-white">
        <div className="absolute inset-0 opacity-30" style={{ background: "radial-gradient(ellipse 60% 80% at 85% 20%, #2fbf7f 0%, transparent 60%), radial-gradient(ellipse 50% 60% at 10% 100%, #0b6b45 0%, transparent 70%)" }} />
        <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-4 py-16 sm:py-24 lg:grid-cols-[1.3fr_1fr]">
          <div>
            <p className="text-sm font-semibold tracking-[0.2em] text-[#9fe3c1] uppercase">Welcome to</p>
            <h1 className="mt-2 text-4xl leading-tight font-bold tracking-tight sm:text-5xl">{GROUP_NAME}</h1>
            <p className="mt-4 max-w-xl text-base text-white/85 sm:text-lg">
              {cos.map((co) => COMPANIES[co].name).join(", ").replace(/, ([^,]*)$/, " and $1")}, together as one group.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/careers" className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-[#013825] hover:bg-[#e6f5ee]">
                <Briefcase size={16} /> Join our team
              </Link>
              <Link href="/news" className="inline-flex items-center gap-2 rounded-full border border-white/40 px-5 py-2.5 text-sm font-semibold text-white hover:bg-white/10">
                Latest news <ArrowRight size={16} />
              </Link>
            </div>
          </div>
          <div className="flex items-center justify-center gap-4 lg:justify-end">
            {cos.map((co, i) => (
              <Link key={co} href={siteUrl(co)} title={COMPANIES[co].name} className={`rounded-full bg-white p-1.5 shadow-xl transition-transform hover:scale-105 ${i === 1 ? "-mt-10" : "mt-6"}`}>
                <img src={COMPANIES[co].logo} alt={COMPANIES[co].name} className="h-24 w-24 rounded-full object-contain sm:h-32 sm:w-32" />
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Our companies */}
      <section className="mx-auto w-full max-w-6xl px-4 py-14">
        <SectionHead title="Our Companies" />
        <div className="grid gap-6 md:grid-cols-3">
          {cos.map((co, i) => {
            const c = COMPANIES[co];
            const p = profiles[i];
            const t = c.formTheme ?? { deep: "#013825", mid: "#0b6b45", accent: "#7cc9a0" };
            return (
              <Link key={co} href={siteUrl(co)} className="group flex flex-col overflow-hidden rounded-lg border border-[var(--border-hairline)] bg-white shadow-sm transition-shadow hover:shadow-md">
                <div className="flex h-36 items-center justify-center" style={{ background: `linear-gradient(135deg, ${t.deep}, ${t.mid})` }}>
                  <img src={c.logo} alt="" className="h-24 w-24 rounded-full bg-white object-contain p-1 shadow-lg transition-transform group-hover:scale-105" />
                </div>
                <div className="flex flex-1 flex-col gap-2 p-5">
                  <h3 className="text-lg font-semibold text-[var(--text-primary)]">{c.name}</h3>
                  {p?.tagline && <p className="text-sm font-medium" style={{ color: t.mid }}>{p.tagline}</p>}
                  {p?.about && <p className="line-clamp-3 text-sm leading-relaxed text-[var(--text-secondary)]">{p.about}</p>}
                  <span className="mt-auto pt-2 text-sm font-semibold" style={{ color: t.mid }}>
                    Company profile →
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Latest news */}
      {news.items.length > 0 && (
        <section className="bg-white py-14">
          <div className="mx-auto max-w-6xl px-4">
            <SectionHead title="Latest News" href="/news" more="View all news" />
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {news.items.map((n) => (
                <NewsCard key={`${n.co}-${n.id}`} n={n} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Careers */}
      <section className="mx-auto w-full max-w-6xl px-4 py-14">
        <SectionHead title="Careers" href="/careers" more="See all open positions" />
        {allJobs.length === 0 ? (
          <div className="rounded-lg border border-dashed border-[var(--border-hairline)] bg-white p-8 text-center text-sm text-[var(--text-muted)]">No open positions right now. Please check back soon.</div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {allJobs.slice(0, 6).map((j) => {
              const c = COMPANIES[j.co];
              return (
                <Link key={`${j.co}-${j.id}`} href={careersUrl(j.co, j.id)} className="flex items-center gap-4 rounded-lg border border-[var(--border-hairline)] bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
                  <img src={c.logo} alt="" className="h-11 w-11 shrink-0 rounded-full object-contain" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold text-[var(--text-primary)]">{j.title}</div>
                    <div className="flex flex-wrap gap-x-3 text-xs text-[var(--text-muted)]">
                      <span>{c.name}</span>
                      {j.place && (
                        <span className="inline-flex items-center gap-1">
                          <MapPin size={12} /> {j.place}
                        </span>
                      )}
                      {j.employmentType && <span>{jobTypeLabel(j.employmentType)}</span>}
                    </div>
                  </div>
                  <span className="shrink-0 rounded-full bg-[#0b6b45] px-3 py-1 text-xs font-semibold text-white">Apply</span>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </SiteShell>
  );
}

function SectionHead({ title, href, more }: { title: string; href?: string; more?: string }) {
  return (
    <div className="mb-6 flex flex-wrap items-end gap-3">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-[var(--text-primary)] sm:text-3xl">{title}</h2>
        <div className="mt-2 h-1 w-12 rounded-full bg-[#0b6b45]" />
      </div>
      {href && (
        <Link href={href} className="ml-auto text-sm font-semibold text-[#0b6b45] hover:underline">
          {more} →
        </Link>
      )}
    </div>
  );
}
