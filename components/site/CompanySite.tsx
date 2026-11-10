"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Briefcase, Menu, X } from "lucide-react";
import { COMPANIES, type CompanyId } from "@/lib/companies";
import { siteUrl } from "@/lib/careers";

/* eslint-disable @next/next/no-img-element -- static brand logos */

// One company's own website (/shantahl, /lsmbiz, /daro): its logo, colors,
// menu and an Apply now! button only — no sign-in, LSM Group or other-company links (the public
// can't reach those from here; see proxy.ts).
export function CompanySiteHeader({ co }: { co: CompanyId }) {
  const c = COMPANIES[co];
  const t = c.formTheme ?? { deep: "#013825", mid: "#0b6b45", accent: "#7cc9a0" };
  const path = usePathname();
  const [menu, setMenu] = useState(false);
  const items: [string, string][] = [
    [siteUrl(co), "Home"],
    [`${siteUrl(co)}#about`, "About"],
    ...(c.siteProducts?.length ? ([[`${siteUrl(co)}#products`, "Products"]] as [string, string][]) : []),
    [siteUrl(co, "news"), "Newsroom"],
    [siteUrl(co, "careers"), "Careers"],
  ];
  const link = ([href, label]: [string, string]) => {
    const on = href === siteUrl(co) ? path === href : !href.includes("#") && path.startsWith(href);
    return (
      <Link key={href} href={href} onClick={() => setMenu(false)} className="rounded-md px-3 py-2 text-sm font-medium transition-colors hover:opacity-100" style={{ color: on ? t.mid : "#2c3a33" }}>
        {label}
      </Link>
    );
  };
  return (
    <header className="sticky top-0 z-40 border-b border-[#dfe5e2] bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4">
        <Link href={siteUrl(co)} className="flex min-w-0 items-center gap-2.5" onClick={() => setMenu(false)}>
          <img src={c.logo} alt="" className="h-10 w-10 shrink-0 rounded-full object-contain" />
          <span className="truncate text-sm font-bold sm:text-base" style={{ color: t.deep }}>
            {c.name}
          </span>
        </Link>
        <nav className="ml-auto hidden items-center md:flex" aria-label="Main">
          {items.map(link)}
        </nav>
        {/* Apply now! — always in view, to the company's Careers. */}
        <Link
          href={siteUrl(co, "careers")}
          onClick={() => setMenu(false)}
          className="relative ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-sm font-extrabold tracking-wide uppercase shadow-md ring-2 ring-white transition-transform hover:scale-105 md:ml-2"
          style={{ background: t.accent, color: t.deep, boxShadow: `0 4px 14px ${t.accent}99` }}
        >
          <span className="absolute -top-1 -right-1 flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full rounded-full opacity-75 motion-safe:animate-ping" style={{ background: t.mid }} />
            <span className="relative inline-flex h-3 w-3 rounded-full ring-2 ring-white" style={{ background: t.mid }} />
          </span>
          <Briefcase size={15} /> Apply now!
        </Link>
        <button onClick={() => setMenu((v) => !v)} className="rounded-md p-2 text-[#2c3a33] md:hidden" aria-label="Menu" aria-expanded={menu}>
          {menu ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>
      {menu && (
        <nav className="flex flex-col border-t border-[#dfe5e2] bg-white px-4 py-2 md:hidden" aria-label="Main">
          {items.map(link)}
        </nav>
      )}
    </header>
  );
}

export function CompanySiteFooter({ co, address, phone, email }: { co: CompanyId; address: string; phone: string; email: string }) {
  const c = COMPANIES[co];
  const t = c.formTheme ?? { deep: "#013825", mid: "#0b6b45", accent: "#7cc9a0" };
  return (
    <footer className="mt-12 text-white/85" style={{ background: t.deep }}>
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:grid-cols-3">
        <div className="flex items-start gap-3">
          <img src={c.logo} alt="" className="h-12 w-12 rounded-full bg-white object-contain p-0.5" />
          <div>
            <div className="font-bold text-white">{c.name}</div>
          </div>
        </div>
        <ul className="space-y-1.5 text-sm">
          <li><Link href={siteUrl(co, "news")} className="hover:text-white hover:underline">Newsroom</Link></li>
          <li><Link href={siteUrl(co, "careers")} className="hover:text-white hover:underline">Careers</Link></li>
          {c.siteLinks?.map((l) => (
            <li key={l.url}>
              <a href={l.url} target="_blank" rel="noopener noreferrer" className="hover:text-white hover:underline">
                {l.name} ↗
              </a>
            </li>
          ))}
        </ul>
        <div className="space-y-1 text-sm text-white/75">
          {address && <p>{address}</p>}
          {phone && <p>{phone}</p>}
          {email && <p className="break-all">{email}</p>}
        </div>
      </div>
      <div className="border-t border-white/10 py-4 text-center text-xs text-white/60">
        © {new Date().getFullYear()} {c.name.replace(/\.$/, "")}. All rights reserved.
      </div>
    </footer>
  );
}
