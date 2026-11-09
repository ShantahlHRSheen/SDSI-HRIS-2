import Link from "next/link";
import { SiteHeader } from "@/components/site/SiteHeader";
import { siteUrl } from "@/lib/careers";
import { SITE_DOMAINS } from "@/lib/site-domains";
import { COMPANIES, COMPANY_ORDER, GROUP_NAME, isCompanyReady } from "@/lib/companies";

/* eslint-disable @next/next/no-img-element -- static brand logos */

// Every public page: header, the page, footer — in the light .site look.
// flush: no gap above the footer (the homepage ends with the dark sign-in).
export function SiteShell({ children, flush = false }: { children: React.ReactNode; flush?: boolean }) {
  const companies = COMPANY_ORDER.filter(isCompanyReady);
  return (
    <div className="site flex min-h-full flex-1 flex-col">
      <SiteHeader />
      <div className="flex flex-1 flex-col">{children}</div>
      <footer className={`${flush ? "" : "mt-12 "}bg-[#013825] text-white/85`}>
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <div className="text-base font-bold text-white">{GROUP_NAME}</div>
            <ul className="mt-3 space-y-1.5 text-sm">
              <li>
                <Link href="/#login" className="hover:text-white hover:underline">
                  Employee Login
                </Link>
              </li>
            </ul>
          </div>
          {companies.map((id) => {
            const c = COMPANIES[id];
            return (
              <div key={id} className="text-sm">
                <Link href={SITE_DOMAINS[id][0] ? `https://${SITE_DOMAINS[id][0]}` : siteUrl(id)} className="flex items-center gap-2 font-semibold text-white hover:underline">
                  <img src={c.logo} alt="" className="h-7 w-7 rounded-full bg-white object-contain" /> {c.name}
                </Link>
                {c.info.address && <p className="mt-2 text-white/70">{c.info.address}</p>}
                {c.info.phone && <p className="text-white/70">{c.info.phone}</p>}
                {c.info.email && <p className="break-all text-white/70">{c.info.email}</p>}
              </div>
            );
          })}
        </div>
        <div className="border-t border-white/10 py-4 text-center text-xs text-white/60">
          © {new Date().getFullYear()} {GROUP_NAME}. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
