import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CompanyShell } from "@/components/site/CompanyShell";
import { NewsCard, PageBanner } from "@/components/site/NewsCard";
import { Pager } from "@/components/site/Pager";
import { COMPANIES, isCompanyReady } from "@/lib/companies";
import { companyFromSlug, siteUrl } from "@/lib/careers";
import { listNews } from "@/lib/server/site";

const PER = 9;
type Props = { params: Promise<{ site: string }>; searchParams: Promise<{ page?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const co = companyFromSlug((await params).site);
  return co ? { title: `Newsroom — ${COMPANIES[co].name}`, description: `News and press releases from ${COMPANIES[co].name}.` } : {};
}

export default async function CompanyNewsroom({ params, searchParams }: Props) {
  const co = companyFromSlug((await params).site);
  if (!co || !isCompanyReady(co)) notFound();
  const c = COMPANIES[co];
  const t = c.formTheme ?? { deep: "#013825", mid: "#0b6b45", accent: "#7cc9a0" };
  const page = Math.max(1, Math.min(500, Number.parseInt((await searchParams).page ?? "1", 10) || 1));
  const { items, total } = await listNews(co, page, PER);
  return (
    <CompanyShell co={co}>
      <PageBanner title="Newsroom" colors={[t.deep, t.mid]} crumb={<><Link href={siteUrl(co)} className="hover:underline">Home</Link> / Newsroom</>}>
        News and press releases from {c.name}.
      </PageBanner>
      <main className="mx-auto w-full max-w-6xl px-4 py-10">
        {items.length === 0 ? (
          <div className="rounded-lg border border-dashed border-[var(--border-hairline)] bg-white p-10 text-center text-sm text-[var(--text-muted)]">No news yet. Please check back soon.</div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((n) => (
              <NewsCard key={n.id} n={n} own />
            ))}
          </div>
        )}
        <Pager page={page} pages={Math.max(1, Math.ceil(total / PER))} href={(p) => `${siteUrl(co, "news")}${p > 1 ? `?page=${p}` : ""}`} color={t.mid} />
      </main>
    </CompanyShell>
  );
}
