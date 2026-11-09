"use client";

import { useState, useSyncExternalStore } from "react";
import { Check, Copy, ExternalLink, Link2 } from "lucide-react";
import { COMPANIES, COMPANY_ORDER, GROUP_NAME, isCompanyReady } from "@/lib/companies";
import { siteUrl } from "@/lib/careers";
import { publicLink } from "@/lib/site-domains";

/* eslint-disable @next/next/no-img-element -- small static brand logos */

// Each public website's link (the group's and each company's), to see and
// copy (for Facebook, chats, email). They follow the address the HRIS is open on (www.lsmgrouphris.com).
export function SiteLinks() {
  // The address the HRIS is open on (none while rendering on the server).
  const origin = useSyncExternalStore(
    () => () => {},
    () => window.location.origin,
    () => "",
  );
  const [copied, setCopied] = useState<string | null>(null);
  // One link per website: the group's and each company's.
  // Companies with their own address (lib/site-domains.ts) show that.
  const rows: { logo: string[]; name: string; url: (origin: string) => string }[] = [
    { logo: COMPANY_ORDER.map((id) => COMPANIES[id].logo), name: GROUP_NAME, url: (o) => o },
    ...COMPANY_ORDER.filter((id) => isCompanyReady(id)).map((id) => ({ logo: [COMPANIES[id].logo], name: COMPANIES[id].name, url: (o: string) => publicLink(id, siteUrl(id), o) })),
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
  return (
    <section className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-1)] p-4" aria-labelledby="site-links">
      <h2 id="site-links" className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-[var(--text-primary)]">
        <Link2 size={16} /> Website links
      </h2>
      <div className="space-y-2">
        {rows.map((r) => {
          const url = r.url(origin);
          return (
            <div key={r.name} className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--border-hairline)] p-2.5">
              <span className="flex w-64 shrink-0 items-center gap-2">
                <span className="flex -space-x-2">
                  {r.logo.map((l) => (
                    <img key={l} src={l} alt="" className="h-6 w-6 rounded-full border border-[var(--surface-1)] bg-white object-contain" />
                  ))}
                </span>
                <span className="text-sm leading-tight font-semibold text-[var(--text-primary)]">{r.name}</span>
              </span>
              <input readOnly value={url} onFocus={(e) => e.currentTarget.select()} aria-label={`${r.name} website link`} className="min-w-0 flex-1 basis-56 rounded-md border border-[var(--border-hairline)] bg-[var(--page-plane)] px-2 py-1.5 font-mono text-xs text-[var(--text-primary)]" />
              <button onClick={() => copy(url)} className="flex items-center gap-1 rounded-md border border-[var(--border-hairline)] px-2.5 py-1.5 text-xs text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40">
                {copied === url ? <Check size={13} className="text-[var(--status-good)]" /> : <Copy size={13} />} {copied === url ? "Copied" : "Copy"}
              </button>
              <a href={url} target="_blank" rel="noopener noreferrer" className="rounded-md p-1.5 text-[var(--text-muted)] hover:bg-[var(--gridline)]/40" aria-label={`Open the ${r.name} website`}>
                <ExternalLink size={14} />
              </a>
            </div>
          );
        })}
      </div>
    </section>
  );
}
