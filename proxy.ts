import { NextResponse, type NextRequest } from "next/server";
import { SITE_DOMAINS, SITE_SLUG, companyForHost } from "@/lib/site-domains";
import type { CompanyId } from "@/lib/companies";

// A company's own website address (lib/site-domains.ts) shows only that
// company's public pages: its homepage, Newsroom, Careers (with applying)
// and applicants' exam links. Everything else — the sign-in page, the HRIS,
// the LSM Group site, the other companies — sends visitors to the company's
// homepage. The HRIS address (www.lsmgrouphris.com) is unchanged.

export function proxy(request: NextRequest) {
  const co = companyForHost(request.headers.get("host"));
  if (!co) return onHrisAddress(request);

  const { pathname } = request.nextUrl;
  const slug = `/${SITE_SLUG[co]}`;
  const to = (path: string) => {
    const url = request.nextUrl.clone();
    url.pathname = path;
    return NextResponse.rewrite(url);
  };

  // The public careers data, applying and exams.
  if (pathname === "/api/careers") {
    // Only this company's jobs and profile.
    return request.nextUrl.searchParams.get("co") === co ? NextResponse.next() : NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  if (pathname === "/api/careers/apply" || pathname === "/api/careers/exam") return NextResponse.next();
  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Not found." }, { status: 404 });

  // This company's pages, with or without /shantahl in front.
  if (pathname === "/") return to(slug);
  if (pathname === slug || pathname.startsWith(`${slug}/`)) {
    // Shown without /shantahl on the company's own address.
    const clean = request.nextUrl.clone();
    clean.pathname = pathname.slice(slug.length) || "/";
    return NextResponse.redirect(clean, 308);
  }
  if (pathname === "/news" || /^\/news\/[0-9a-f-]{36}$/i.test(pathname)) return to(`${slug}${pathname}`);
  if (pathname === "/careers") return to(`${slug}/careers`);
  // An applicant's exam link for this company.
  if (pathname.startsWith(`/careers/${co}/exam/`)) return NextResponse.next();

  // Anything else: the company's homepage.
  const home = request.nextUrl.clone();
  home.pathname = "/";
  home.search = "";
  return NextResponse.redirect(home);
}

// On the HRIS address: a company's pages (/shantahl/…, old /careers/sdsi
// links, applicants' exam links) move to its own address when it has one,
// so the public never lands on the HRIS's.
function onHrisAddress(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  for (const co of Object.keys(SITE_SLUG) as CompanyId[]) {
    const domain = SITE_DOMAINS[co][0];
    if (!domain) continue;
    const slug = `/${SITE_SLUG[co]}`;
    let rest: string | null = null;
    if (pathname === slug || pathname.startsWith(`${slug}/`)) rest = pathname.slice(slug.length) || "/";
    else if (pathname.startsWith(`/careers/${co}/exam/`)) rest = pathname;
    else if (pathname === `/careers/${co}`) rest = "/careers";
    if (rest !== null) return NextResponse.redirect(`https://${domain}${rest}${search}`, 308);
  }
  return NextResponse.next();
}

export const config = {
  // Not for the app's own files, icons, brand pictures and other static files.
  matcher: ["/((?!_next/|brand/|favicon|icon|apple-icon|manifest|robots|sitemap|.*\\.[a-zA-Z0-9]+$).*)"],
};
