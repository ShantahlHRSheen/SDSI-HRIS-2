import Link from "next/link";
import { COMPANIES } from "@/lib/companies";
import type { NewsCard as Card } from "@/lib/server/site";

/* eslint-disable @next/next/no-img-element -- photos from the company-media bucket */

export const newsDate = (d: string | null) => (d ? new Date(`${d}T00:00:00+08:00`).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", month: "long", day: "numeric", year: "numeric" }) : "");
export const newsHref = (n: Pick<Card, "co" | "id">) => `/news/${n.co}/${n.id}`;

// A press-release card: photo, company, date, title, excerpt, Read more.
export function NewsCard({ n }: { n: Card }) {
  const c = COMPANIES[n.co];
  const t = c.formTheme ?? { deep: "#013825", mid: "#0b6b45", accent: "#7cc9a0" };
  return (
    <article className="group flex flex-col overflow-hidden rounded-lg border border-[var(--border-hairline)] bg-white shadow-sm transition-shadow hover:shadow-md">
      <Link href={newsHref(n)} className="relative block aspect-[16/10] overflow-hidden bg-[#eef2f0]" tabIndex={-1} aria-hidden="true">
        {n.cover ? (
          <img src={n.cover} alt="" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
        ) : (
          <div className="flex h-full w-full items-center justify-center" style={{ background: `linear-gradient(135deg, ${t.deep}, ${t.mid})` }}>
            <img src={c.logo} alt="" className="h-20 w-20 rounded-full bg-white object-contain p-1 opacity-95" />
          </div>
        )}
      </Link>
      <div className="flex flex-1 flex-col gap-2 p-5">
        <div className="flex flex-wrap items-center gap-x-2 text-xs">
          <span className="font-semibold tracking-wide uppercase" style={{ color: t.mid }}>
            {c.shortName === "SDSI" ? "Shantahl" : c.shortName}
          </span>
          {n.date && <span className="text-[var(--text-muted)]">· {newsDate(n.date)}</span>}
        </div>
        <h3 className="text-lg leading-snug font-semibold text-[var(--text-primary)]">
          <Link href={newsHref(n)} className="hover:underline">
            {n.title}
          </Link>
        </h3>
        {n.summary && <p className="line-clamp-3 text-sm leading-relaxed text-[var(--text-secondary)]">{n.summary}</p>}
        <Link href={newsHref(n)} className="mt-auto pt-2 text-sm font-semibold" style={{ color: t.mid }}>
          Read more →
        </Link>
      </div>
    </article>
  );
}

// The banner under the header on inner pages.
export function PageBanner({ title, crumb, children }: { title: string; crumb?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="bg-gradient-to-r from-[#013825] to-[#0b6b45] text-white">
      <div className="mx-auto max-w-6xl px-4 py-10 sm:py-14">
        {crumb && <div className="mb-2 text-xs text-white/70">{crumb}</div>}
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{title}</h1>
        {children && <div className="mt-2 max-w-2xl text-sm text-white/85 sm:text-base">{children}</div>}
      </div>
    </div>
  );
}
