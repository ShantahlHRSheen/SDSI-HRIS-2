import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteShell } from "@/components/site/SiteShell";
import { NewsCard, PageBanner, newsDate } from "@/components/site/NewsCard";
import { COMPANIES, isCompanyId } from "@/lib/companies";
import { getNews, listNews } from "@/lib/server/site";

/* eslint-disable @next/next/no-img-element -- photo from the company-media bucket */

type Props = { params: Promise<{ co: string; id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { co, id } = await params;
  const n = isCompanyId(co) ? await getNews(co, id) : null;
  if (!n) return {};
  return { title: `${n.title} — ${COMPANIES[n.co].name}`, description: n.summary, openGraph: { title: n.title, description: n.summary, images: n.cover ? [n.cover] : [COMPANIES[n.co].logo] } };
}

export default async function NewsArticlePage({ params }: Props) {
  const { co, id } = await params;
  if (!isCompanyId(co)) notFound();
  const n = await getNews(co, id);
  if (!n) notFound();
  const c = COMPANIES[co];
  const more = (await listNews("all", 1, 4)).items.filter((x) => !(x.co === n.co && x.id === n.id)).slice(0, 3);
  return (
    <SiteShell>
      <PageBanner
        title="Newsroom"
        crumb={
          <>
            <Link href="/" className="hover:underline">Home</Link> / <Link href="/news" className="hover:underline">Newsroom</Link> / <Link href={`/news?co=${co}`} className="hover:underline">{c.name}</Link>
          </>
        }
      />
      <main className="mx-auto w-full max-w-3xl px-4 py-10">
        <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
          <img src={c.logo} alt="" className="h-7 w-7 rounded-full object-contain" />
          <span className="font-semibold" style={{ color: c.formTheme?.mid ?? "#0b6b45" }}>{c.name}</span>
          {n.date && <span className="text-[var(--text-muted)]">· {newsDate(n.date)}</span>}
        </div>
        <h1 className="text-3xl leading-tight font-bold text-[var(--text-primary)] sm:text-4xl">{n.title}</h1>
        {n.summary && <p className="mt-3 text-lg leading-relaxed text-[var(--text-secondary)]">{n.summary}</p>}
        {n.cover && <img src={n.cover} alt="" className="mt-6 w-full rounded-lg object-cover" />}
        <div className="mt-6 text-base leading-relaxed whitespace-pre-wrap text-[var(--text-primary)]">{n.body}</div>
        <Link href="/news" className="mt-10 inline-block text-sm font-semibold text-[#0b6b45] hover:underline">
          ← Back to the Newsroom
        </Link>
      </main>
      {more.length > 0 && (
        <section className="mx-auto w-full max-w-6xl px-4">
          <h2 className="mb-4 text-xl font-bold text-[var(--text-primary)]">More news</h2>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {more.map((m) => (
              <NewsCard key={`${m.co}-${m.id}`} n={m} />
            ))}
          </div>
        </section>
      )}
    </SiteShell>
  );
}
