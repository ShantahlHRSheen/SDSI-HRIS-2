"use client";

import { useState, useSyncExternalStore } from "react";
import { Check, Copy, ExternalLink, Link2 } from "lucide-react";
import { COMPANIES, COMPANY_ORDER, GROUP_NAME, isCompanyReady } from "@/lib/companies";
import { siteUrl } from "@/lib/careers";

/* eslint-disable @next/next/no-img-element -- small static brand logos */

// The public websites' full links, to see and copy (for Facebook, chats,
// email). They follow the address the HRIS is open on (www.lsmgrouphris.com).
export function SiteLinks() {
  // The address the HRIS is open on (none while rendering on the server).
  const origin = useSyncExternalStore(
    () => () => {},
    () => window.location.origin,
    () => "",
  );
  const [copied, setCopied] = useState<string | null>(null);
  const rows: { logo: string[]; name: string; links: [string, string][] }[] = [
    { logo: COMPANY_ORDER.map((id) => COMPANIES[id].logo), name: GROUP_NAME, links: [["Website", "/"], ["Newsroom", "/news"], ["Careers", "/careers"], ["Employee login", "/login"]] },
    ...COMPANY_ORDER.filter((id) => isCompanyReady(id)).map((id) => ({
      logo: [COMPANIES[id].logo],
      name: COMPANIES[id].name,
      links: [["Website", siteUrl(id)], ["Newsroom", siteUrl(id, "news")], ["Careers", siteUrl(id, "careers")]] as [string, string][],
    })),
  ];
  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      window.prompt("Copy this link:", url);
    }
    setCopied(url);
    setTimeout(() => setCopied((c) => (c === url ? null : c)), 1800);
  }
  if (!origin) return null;
  const full = (path: string) => `${origin}${path === "/" ? "" : path}`;
  return (
    <section className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-1)] p-4" aria-labelledby="site-links">
      <h2 id="site-links" className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-[var(--text-primary)]">
        <Link2 size={16} /> Website links
      </h2>
      <div className="space-y-3">
        {rows.map((r) => (
          <div key={r.name} className="rounded-lg border border-[var(--border-hairline)] p-3">
            <div className="mb-2 flex items-center gap-2">
              <span className="flex -space-x-2">
                {r.logo.map((l) => (
                  <img key={l} src={l} alt="" className="h-6 w-6 rounded-full border border-[var(--surface-1)] bg-white object-contain" />
                ))}
              </span>
              <span className="text-sm font-semibold text-[var(--text-primary)]">{r.name}</span>
            </div>
            <div className="space-y-1.5">
              {r.links.map(([label, path]) => {
                const url = full(path);
                return (
                  <div key={label} className="flex flex-wrap items-center gap-2">
                    <span className="w-24 shrink-0 text-xs text-[var(--text-muted)]">{label}</span>
                    <input readOnly value={url} onFocus={(e) => e.currentTarget.select()} aria-label={`${r.name} ${label} link`} className="min-w-0 flex-1 basis-56 rounded-md border border-[var(--border-hairline)] bg-[var(--page-plane)] px-2 py-1.5 font-mono text-xs text-[var(--text-primary)]" />
                    <button onClick={() => copy(url)} className="flex items-center gap-1 rounded-md border border-[var(--border-hairline)] px-2.5 py-1.5 text-xs text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40">
                      {copied === url ? <Check size={13} className="text-[var(--status-good)]" /> : <Copy size={13} />} {copied === url ? "Copied" : "Copy"}
                    </button>
                    <a href={url} target="_blank" rel="noopener noreferrer" className="rounded-md p-1.5 text-[var(--text-muted)] hover:bg-[var(--gridline)]/40" aria-label={`Open ${r.name} ${label}`}>
                      <ExternalLink size={14} />
                    </a>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
