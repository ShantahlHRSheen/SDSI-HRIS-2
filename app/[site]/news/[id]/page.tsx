import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CompanyShell } from "@/components/site/CompanyShell";
import { NewsCard, PageBanner, newsDate } from "@/components/site/NewsCard";
import { NewsGallery } from "@/components/site/NewsGallery";
import { COMPANIES, isCompanyReady } from "@/lib/companies";
import { companyFromSlug, siteUrl } from "@/lib/careers";
import { getNews, listNews } from "@/lib/server/site";

/* eslint-disable @next/next/no-img-element -- photo from the company-media bucket */

type Props = { params: Promise<{ site: string; id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { site, id } = await params;
  const co = companyFromSlug(site);
  const n = co ? await getNews(co, id) : null;
  if (!co || !n) return {};
  return { title: `${n.title} — ${COMPANIES[co].name}`, description: n.summary, openGraph: { title: n.title, description: n.summary, images: n.cover ? [n.cover] : [COMPANIES[co].logo] } };
}

export default async function CompanyArticle({ params }: Props) {
  const { site, id } = await params;
  const co = companyFromSlug(site);
  if (!co || !isCompanyReady(co)) notFound();
  const n = await getNews(co, id);
  if (!n) notFound();
  const t = COMPANIES[co].formTheme ?? { deep: "#013825", mid: "#0b6b45", accent: "#7cc9a0" };
  const more = (await listNews(co, 1, 4)).items.filter((x) => x.id !== n.id).slice(0, 3);
  return (
    <CompanyShell co={co}>
      <PageBanner title="Newsroom" colors={[t.deep, t.mid]} crumb={<><Link href={siteUrl(co)} className="hover:underline">Home</Link> / <Link href={siteUrl(co, "news")} className="hover:underline">Newsroom</Link></>} />
      <main className="mx-auto w-full max-w-3xl px-4 py-10">
        {n.date && <div className="mb-3 text-sm font-semibold" style={{ color: t.mid }}>{newsDate(n.date)}</div>}
        <h1 className="text-3xl leading-tight font-bold text-[var(--text-primary)] sm:text-4xl">{n.title}</h1>
        {n.summary && <p className="mt-3 text-lg leading-relaxed text-[var(--text-secondary)]">{n.summary}</p>}
        {n.cover && <img src={n.cover} alt="" className="mt-6 w-full rounded-lg object-cover" />}
        <div className="mt-6 text-base leading-relaxed whitespace-pre-wrap text-[var(--text-primary)]">{n.body}</div>
        <NewsGallery photos={n.photos} title={n.title} />
        <Link href={siteUrl(co, "news")} className="mt-10 inline-block text-sm font-semibold hover:underline" style={{ color: t.mid }}>
          ← Back to the Newsroom
        </Link>
      </main>
      {more.length > 0 && (
        <section className="mx-auto w-full max-w-6xl px-4">
          <h2 className="mb-4 text-xl font-bold text-[var(--text-primary)]">More news</h2>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {more.map((m) => (
              <NewsCard key={m.id} n={m} own />
            ))}
          </div>
        </section>
      )}
    </CompanyShell>
  );
}
