import { ArrowUpRight, Globe } from "lucide-react";

// "Our Websites" on a company's website (lib/companies.ts siteLinks).
export function OurWebsites({ links, t }: { links: { name: string; url: string; about?: string }[]; t: { deep: string; mid: string; accent: string } }) {
  return (
    <section id="websites" className="mx-auto w-full max-w-6xl scroll-mt-20 px-4 pt-14">
      <div className="mb-6">
        <h2 className="text-2xl font-bold tracking-tight text-[var(--text-primary)] sm:text-3xl">Our Websites</h2>
        <div className="mt-2 h-1 w-12 rounded-full" style={{ background: t.mid }} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {links.map((l) => {
          const host = l.url.replace(/^https?:\/\//, "").replace(/\/$/, "");
          return (
            <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer" className="group flex items-center gap-4 rounded-2xl border border-[var(--border-hairline)] bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-white" style={{ background: `linear-gradient(135deg, ${t.deep}, ${t.mid})` }}>
                <Globe size={22} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-[var(--text-primary)]">{l.name}</span>
                <span className="block truncate text-sm" style={{ color: t.mid }}>
                  {host}
                </span>
                {l.about && <span className="mt-1 block text-xs text-[var(--text-muted)]">{l.about}</span>}
              </span>
              <ArrowUpRight size={20} className="shrink-0 text-[var(--text-muted)] transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </a>
          );
        })}
      </div>
    </section>
  );
}
