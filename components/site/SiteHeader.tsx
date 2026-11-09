"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, LogIn, Menu, X } from "lucide-react";
import { useHris } from "@/lib/store";
import { siteUrl } from "@/lib/careers";
import { COMPANIES, COMPANY_ORDER, GROUP_NAME, isCompanyReady } from "@/lib/companies";

/* eslint-disable @next/next/no-img-element -- static brand logos */

// The public website's top bar: the group, the menu, and Employee Login
// (upper right) — which opens /login, where employees choose their company.
export function SiteHeader() {
  const path = usePathname();
  const { ready, currentUser } = useHris();
  const [menu, setMenu] = useState(false);
  const [cos, setCos] = useState(false);
  const drop = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const off = (e: MouseEvent) => drop.current && !drop.current.contains(e.target as Node) && setCos(false);
    document.addEventListener("click", off);
    return () => document.removeEventListener("click", off);
  }, []);
  const companies = COMPANY_ORDER.filter(isCompanyReady);
  const link = (href: string, label: string) => (
    <Link
      href={href}
      onClick={() => setMenu(false)}
      className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${path === href || (href !== "/" && path.startsWith(href)) ? "text-[#0b6b45]" : "text-[#2c3a33] hover:text-[#0b6b45]"}`}
    >
      {label}
    </Link>
  );
  return (
    <header className="sticky top-0 z-40 border-b border-[#dfe5e2] bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4">
        <Link href="/" className="flex items-center gap-2.5" onClick={() => setMenu(false)}>
          <span className="flex -space-x-2">
            {COMPANY_ORDER.map((id) => (
              <img key={id} src={COMPANIES[id].logo} alt="" className="h-8 w-8 rounded-full border-2 border-white bg-white object-contain" />
            ))}
          </span>
          <span className="leading-tight">
            <span className="block text-sm font-bold tracking-tight text-[#013825] sm:text-base">{GROUP_NAME}</span>
          </span>
        </Link>

        <nav className="ml-auto hidden items-center md:flex" aria-label="Main">
          {link("/", "Home")}
          <div className="relative" ref={drop}>
            <button onClick={() => setCos((v) => !v)} aria-expanded={cos} className="flex items-center gap-1 rounded-md px-3 py-2 text-sm font-medium text-[#2c3a33] hover:text-[#0b6b45]">
              Our Companies <ChevronDown size={15} />
            </button>
            {cos && (
              <div className="absolute left-0 mt-1 w-72 rounded-lg border border-[#dfe5e2] bg-white p-1.5 shadow-lg">
                {companies.map((id) => (
                  <Link key={id} href={siteUrl(id)} onClick={() => setCos(false)} className="flex items-center gap-2.5 rounded-md px-2 py-2 text-sm text-[#16211c] hover:bg-[#f0f4f2]">
                    <img src={COMPANIES[id].logo} alt="" className="h-8 w-8 rounded-full object-contain" />
                    {COMPANIES[id].name}
                  </Link>
                ))}
              </div>
            )}
          </div>
          {link("/news", "Newsroom")}
          {link("/careers", "Careers")}
        </nav>

        <Link
          href={ready && currentUser ? "/dashboard" : "/login"}
          className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-[#0b6b45] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#095a3a] md:ml-2"
        >
          <LogIn size={15} /> {ready && currentUser ? "Open HRIS" : "Employee Login"}
        </Link>
        <button onClick={() => setMenu((v) => !v)} className="rounded-md p-2 text-[#2c3a33] md:hidden" aria-label="Menu" aria-expanded={menu}>
          {menu ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>
      {menu && (
        <nav className="border-t border-[#dfe5e2] bg-white px-4 py-2 md:hidden" aria-label="Main">
          <div className="flex flex-col">
            {link("/", "Home")}
            {link("/news", "Newsroom")}
            {link("/careers", "Careers")}
            <div className="mt-1 border-t border-[#eef2f0] pt-1 text-xs font-semibold text-[#6f7d76] uppercase">
              <span className="block px-3 py-2">Our Companies</span>
            </div>
            {companies.map((id) => (
              <Link key={id} href={siteUrl(id)} onClick={() => setMenu(false)} className="flex items-center gap-2 px-3 py-2 text-sm text-[#16211c]">
                <img src={COMPANIES[id].logo} alt="" className="h-6 w-6 rounded-full object-contain" /> {COMPANIES[id].name}
              </Link>
            ))}
          </div>
        </nav>
      )}
    </header>
  );
}
