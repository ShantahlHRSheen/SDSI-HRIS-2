"use client";

import Link from "next/link";
import { LogIn } from "lucide-react";
import { useHris } from "@/lib/store";
import { COMPANIES, COMPANY_ORDER, GROUP_NAME } from "@/lib/companies";

/* eslint-disable @next/next/no-img-element -- static brand logos */

// The LSM Group website's top bar: the group, and Employee Login (upper
// right), which goes to the sign-in at the bottom of the homepage.
export function SiteHeader() {
  const { ready, currentUser } = useHris();
  return (
    <header className="sticky top-0 z-40 border-b border-[#dfe5e2] bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4">
        <Link href="/" className="flex min-w-0 items-center gap-2.5">
          <span className="flex shrink-0 -space-x-2">
            {COMPANY_ORDER.map((id) => (
              <img key={id} src={COMPANIES[id].logo} alt="" className="h-8 w-8 rounded-full border-2 border-white bg-white object-contain" />
            ))}
          </span>
          <span className="truncate text-sm font-bold tracking-tight text-[#013825] sm:text-base">{GROUP_NAME}</span>
        </Link>
        <Link
          href={ready && currentUser ? "/dashboard" : "/#login"}
          className="ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[#0b6b45] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#095a3a]"
        >
          <LogIn size={15} /> {ready && currentUser ? "Open HRIS" : "Employee Login"}
        </Link>
      </div>
    </header>
  );
}
