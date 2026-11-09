import type { Metadata } from "next";
import Link from "next/link";
import { SiteShell } from "@/components/site/SiteShell";
import { NewsCard, PageBanner } from "@/components/site/NewsCard";
import { COMPANIES, GROUP_NAME, isCompanyId, type CompanyId } from "@/lib/companies";
import { listNews, readyCompanies } from "@/lib/server/site";

export const metadata: Metadata = {
  title: `Newsroom — ${GROUP_NAME}`,
  description: `News and press releases from ${GROUP_NAME}: Shantahl Direct Sales, LSMBiz Credit and Daro Lending.`,
};

const PER = 9;
type Props = { searchParams: Promise<{ co?: string; page?: string }> };

export default async function NewsroomPage({ searchParams }: Props) {
  const sp = await searchParams;
  const co: CompanyId | "all" = isCompanyId(sp.co) ? sp.co : "all";
  const page = Math.max(1, Math.min(500, Number.parseInt(sp.page ?? "1", 10) || 1));
  const { items, total } = await listNews(co, page, PER);
  const pages = Math.max(1, Math.ceil(total / PER));
  const href = (c: CompanyId | "all", p = 1) => {
    const q = new URLSearchParams();
    if (c !== "all") q.set("co", c);
    if (p > 1) q.set("page", String(p));
    const s = q.toString();
    return `/news${s ? `?${s}` : ""}`;
  };
  const tabs: [CompanyId | "all", string][] = [["all", GROUP_NAME.replace(" of Companies", "")], ...readyCompanies().map((id) => [id, COMPANIES[id].name] as [CompanyId, string])];
  // Page numbers, with gaps: 1 … 4 5 6 … 12
  const nums = Array.from({ length: pages }, (_, i) => i + 1).filter((n) => n === 1 || n === pages || Math.abs(n - page) <= 1);

  return (
    <SiteShell>
      <PageBanner title="Newsroom" crumb={<><Link href="/" className="hover:underline">Home</Link> / Newsroom</>}>
        News and press releases from across the group.
      </PageBanner>
      <main className="mx-auto w-full max-w-6xl px-4 py-8">
        <nav className="mb-8 flex flex-wrap gap-2 border-b border-[var(--border-hairline)]" aria-label="Filter by company">
          {tabs.map(([id, label]) => (
            <Link
              key={id}
              href={href(id)}
              aria-current={co === id ? "page" : undefined}
              className={`-mb-px border-b-2 px-3 py-2.5 text-sm font-semibold ${co === id ? "border-[#0b6b45] text-[#0b6b45]" : "border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]"}`}
            >
              {label}
            </Link>
          ))}
        </nav>

        {items.length === 0 ? (
          <div className="rounded-lg border border-dashed border-[var(--border-hairline)] bg-white p-10 text-center text-sm text-[var(--text-muted)]">No news here yet. Please check back soon.</div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((n) => (
              <NewsCard key={`${n.co}-${n.id}`} n={n} />
            ))}
          </div>
        )}

        {pages > 1 && (
          <nav className="mt-10 flex flex-wrap items-center justify-center gap-1.5" aria-label="Pages">
            {page > 1 && (
              <Link href={href(co, page - 1)} className="rounded-md border border-[var(--border-hairline)] bg-white px-3 py-1.5 text-sm hover:border-[#0b6b45]">
                ‹ Previous
              </Link>
            )}
            {nums.map((n, i) => (
              <span key={n} className="flex items-center gap-1.5">
                {i > 0 && n - nums[i - 1] > 1 && <span className="px-1 text-[var(--text-muted)]">…</span>}
                <Link
                  href={href(co, n)}
                  aria-current={n === page ? "page" : undefined}
                  className={`min-w-9 rounded-md border px-3 py-1.5 text-center text-sm ${n === page ? "border-[#0b6b45] bg-[#0b6b45] font-semibold text-white" : "border-[var(--border-hairline)] bg-white hover:border-[#0b6b45]"}`}
                >
                  {n}
                </Link>
              </span>
            ))}
            {page < pages && (
              <Link href={href(co, page + 1)} className="rounded-md border border-[var(--border-hairline)] bg-white px-3 py-1.5 text-sm hover:border-[#0b6b45]">
                Next ›
              </Link>
            )}
          </nav>
        )}
      </main>
    </SiteShell>
  );
}
