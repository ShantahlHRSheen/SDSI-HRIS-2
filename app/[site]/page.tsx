import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Briefcase, Mail, MapPin, Phone, Quote } from "lucide-react";
import { CompanyShell } from "@/components/site/CompanyShell";
import { NewsCard } from "@/components/site/NewsCard";
import { HeroSlider } from "@/components/site/HeroSlider";
import { Products } from "@/components/site/Products";
import { OurWebsites } from "@/components/site/OurWebsites";
import { ShantahlAbout } from "@/components/site/about/ShantahlAbout";
import { COMPANIES, isCompanyReady } from "@/lib/companies";
import { careersUrl, companyFromSlug, jobTypeLabel, siteUrl } from "@/lib/careers";
import { getProfile, listJobs, listNews, mediaUrl } from "@/lib/server/site";

/* eslint-disable @next/next/no-img-element -- logos and photos from the company-media bucket */

// A company's own homepage: /shantahl, /lsmbiz, /daro.
type Props = { params: Promise<{ site: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const co = companyFromSlug((await params).site);
  if (!co) return {};
  const c = COMPANIES[co];
  const p = await getProfile(co);
  return { title: c.name, description: p?.tagline || `${c.name} — about us, news and careers.`, openGraph: { title: c.name, description: p?.tagline || undefined, images: [mediaUrl(co, p?.heroPhotoPath) ?? c.logo] } };
}

export default async function CompanyHome({ params }: Props) {
  const co = companyFromSlug((await params).site);
  if (!co || !isCompanyReady(co)) notFound();
  const c = COMPANIES[co];
  const t = c.formTheme ?? { deep: "#013825", mid: "#0b6b45", accent: "#7cc9a0" };
  const [p, jobs, news] = await Promise.all([getProfile(co), listJobs(co), listNews(co, 1, 3)]);
  const hero = mediaUrl(co, p?.heroPhotoPath);
  const founderPhoto = mediaUrl(co, p?.founderPhotoPath);
  // Shantahl's vision and mission are in its designed About Us.
  const pillars = (co === "sdsi" ? [["Core values", p?.coreValues]] : [
    ["Mission", p?.mission],
    ["Vision", p?.vision],
    ["Core values", p?.coreValues],
  ]).filter(([, v]) => v) as [string, string][];

  return (
    <CompanyShell co={co}>
      {/* Hero: the company's slides, or its banner */}
      {c.siteSlides?.length ? (
        <HeroSlider slides={c.siteSlides} color={t.accent} />
      ) : (
        <>
      <section className="relative overflow-hidden text-white" style={{ background: `linear-gradient(120deg, ${t.deep}, ${t.mid})` }}>
        {hero && <img src={hero} alt="" className="absolute inset-0 h-full w-full object-cover" />}
        {hero && <div className="absolute inset-0" style={{ background: `linear-gradient(100deg, ${t.deep}f2 0%, ${t.deep}b3 45%, ${t.deep}33 100%)` }} />}
        <div className="relative mx-auto flex max-w-6xl flex-col items-start gap-6 px-4 py-16 sm:py-24">
          <img src={c.logo} alt="" className="h-24 w-24 rounded-full bg-white object-contain p-1 shadow-xl sm:h-28 sm:w-28" />
          <div>
            <h1 className="text-4xl leading-tight font-bold tracking-tight sm:text-5xl">{c.name}</h1>
            {p?.tagline && <p className="mt-3 max-w-2xl text-lg text-white/90">{p.tagline}</p>}
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href="#about" className="rounded-full bg-white px-5 py-2.5 text-sm font-semibold" style={{ color: t.deep }}>
              About us
            </Link>
            <Link href={siteUrl(co, "careers")} className="inline-flex items-center gap-2 rounded-full border border-white/50 px-5 py-2.5 text-sm font-semibold text-white hover:bg-white/10">
              <Briefcase size={16} /> {jobs.length ? `${jobs.length} open position${jobs.length === 1 ? "" : "s"}` : "Careers"}
            </Link>
          </div>
        </div>
      </section>

        </>
      )}

      {/* About */}
      <section id="about" className="mx-auto w-full max-w-6xl scroll-mt-20 px-4 py-14">
        {co === "sdsi" ? (
          // Shantahl's designed About Us; HR's mission / vision / values follow.
          <ShantahlAbout t={t} />
        ) : (
          <>
            <Head title={`About ${c.name}`} color={t.mid} />
            {p?.about ? <p className="max-w-3xl text-base leading-relaxed whitespace-pre-wrap text-[var(--text-secondary)]">{p.about}</p> : <p className="text-sm text-[var(--text-muted)]">Our company profile is coming soon.</p>}
          </>
        )}
        {pillars.length > 0 && (
          <div className={`grid gap-4 md:grid-cols-3 ${co === "sdsi" ? "mt-16" : "mt-8"}`}>
            {pillars.map(([k, v]) => (
              <div key={k} className="rounded-lg border border-[var(--border-hairline)] bg-white p-5 shadow-sm" style={{ borderTop: `4px solid ${t.mid}` }}>
                <h3 className="mb-2 font-semibold text-[var(--text-primary)]">{k}</h3>
                <p className="text-sm leading-relaxed whitespace-pre-wrap text-[var(--text-secondary)]">{v}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Our Products */}
      {!!c.siteProducts?.length && <Products items={c.siteProducts} t={t} eyebrow={co === "sdsi" ? "Cosmetics · Wellness · Centapure" : undefined} />}

      {/* Founder */}
      {(p?.founderName || p?.founderMessage) && (
        <section className="bg-white py-14">
          <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 md:grid-cols-[280px_1fr]">
            <div className="mx-auto w-56 md:w-full">
              {founderPhoto ? (
                <img src={founderPhoto} alt={p?.founderName ?? ""} className="aspect-[4/5] w-full rounded-lg object-cover shadow-lg" />
              ) : (
                <div className="flex aspect-[4/5] w-full items-center justify-center rounded-lg shadow-lg" style={{ background: `linear-gradient(135deg, ${t.deep}, ${t.mid})` }}>
                  <img src={c.logo} alt="" className="h-24 w-24 rounded-full bg-white object-contain p-1" />
                </div>
              )}
            </div>
            <div>
              <div className="text-xs font-semibold tracking-[0.2em] uppercase" style={{ color: t.mid }}>
                Our Founder
              </div>
              {p?.founderMessage && (
                <blockquote className="mt-4 text-lg leading-relaxed whitespace-pre-wrap text-[var(--text-primary)] sm:text-xl">
                  <Quote size={28} className="mb-2 opacity-30" style={{ color: t.mid }} />
                  {p.founderMessage}
                </blockquote>
              )}
              {p?.founderName && (
                <div className="mt-5">
                  <div className="text-lg font-bold text-[var(--text-primary)]">{p.founderName}</div>
                  {p.founderTitle && <div className="text-sm text-[var(--text-muted)]">{p.founderTitle}</div>}
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Newsroom */}
      {news.items.length > 0 && (
        <section className="mx-auto w-full max-w-6xl px-4 py-14">
          <Head title="Newsroom" color={t.mid} href={siteUrl(co, "news")} more="View all news" />
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {news.items.map((n) => (
              <NewsCard key={n.id} n={n} own />
            ))}
          </div>
        </section>
      )}

      {/* Careers */}
      <section className="bg-white py-14">
        <div className="mx-auto max-w-6xl px-4">
          <Head title="Careers" color={t.mid} href={siteUrl(co, "careers")} more="See all open positions" />
          {p?.careersNote && <p className="mb-4 text-sm whitespace-pre-wrap text-[var(--text-secondary)]">{p.careersNote}</p>}
          {jobs.length === 0 ? (
            <div className="rounded-lg border border-dashed border-[var(--border-hairline)] p-8 text-center text-sm text-[var(--text-muted)]">No open positions right now. Please check back soon.</div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {jobs.slice(0, 6).map((j) => (
                <Link key={j.id} href={careersUrl(co, j.id)} className="flex items-center gap-4 rounded-lg border border-[var(--border-hairline)] bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
                  {j.banner && <img src={j.banner} alt="" className="h-14 w-20 shrink-0 rounded-md bg-[#eef2f0] object-cover" />}
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold text-[var(--text-primary)]">{j.title}</div>
                    <div className="flex flex-wrap gap-x-3 text-xs text-[var(--text-muted)]">
                      {j.place && (
                        <span className="inline-flex items-center gap-1">
                          <MapPin size={12} /> {j.place}
                        </span>
                      )}
                      {j.employmentType && <span>{jobTypeLabel(j.employmentType)}</span>}
                      {j.slots > 1 && <span>{j.slots} openings</span>}
                    </div>
                  </div>
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold text-white" style={{ background: t.mid }}>
                    Apply <ArrowRight size={12} />
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Our Websites */}
      {!!c.siteLinks?.length && <OurWebsites links={c.siteLinks} t={t} />}

      {/* Contact */}
      <section className="mx-auto w-full max-w-6xl px-4 pt-14">
        <Head title="Contact us" color={t.mid} />
        <div className="grid gap-4 text-sm text-[var(--text-secondary)] sm:grid-cols-3">
          {(p?.address || c.info.address) && (
            <div className="flex gap-2">
              <MapPin size={18} style={{ color: t.mid }} className="shrink-0" /> {p?.address || c.info.address}
            </div>
          )}
          {(p?.phone || c.info.phone) && (
            <div className="flex gap-2">
              <Phone size={18} style={{ color: t.mid }} className="shrink-0" /> {p?.phone || c.info.phone}
            </div>
          )}
          {(p?.email || c.info.email) && (
            <div className="flex gap-2 break-all">
              <Mail size={18} style={{ color: t.mid }} className="shrink-0" /> {p?.email || c.info.email}
            </div>
          )}
        </div>
      </section>
    </CompanyShell>
  );
}

function Head({ title, color, href, more }: { title: string; color: string; href?: string; more?: string }) {
  return (
    <div className="mb-6 flex flex-wrap items-end gap-3">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-[var(--text-primary)] sm:text-3xl">{title}</h2>
        <div className="mt-2 h-1 w-12 rounded-full" style={{ background: color }} />
      </div>
      {href && (
        <Link href={href} className="ml-auto text-sm font-semibold hover:underline" style={{ color }}>
          {more} →
        </Link>
      )}
    </div>
  );
}
