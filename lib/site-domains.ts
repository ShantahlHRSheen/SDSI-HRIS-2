import type { CompanyId } from "./companies";

// Each company's own public website address (its domain), separate from the
// HRIS's (www.lsmgrouphris.com). On these addresses only that company's
// public pages open — its homepage, Newsroom, Careers and applicants' exam
// links; the sign-in page, the HRIS, the LSM Group site and the other
// companies don't (proxy.ts). Add a domain to the Vercel project first
// (Settings → Domains), then list it here.
export const SITE_DOMAINS: Record<CompanyId, string[]> = {
  sdsi: [],
  lsmbiz: [],
  daro: [],
};

// The path of each company's website on the HRIS address: /shantahl, …
export const SITE_SLUG: Record<CompanyId, string> = { sdsi: "shantahl", lsmbiz: "lsmbiz", daro: "daro" };

const bare = (host: string) => host.toLowerCase().replace(/:\d+$/, "").replace(/^www\./, "");

// The company whose own address this is, if any.
export function companyForHost(host: string | null | undefined): CompanyId | null {
  if (!host) return null;
  const h = bare(host);
  for (const co of Object.keys(SITE_DOMAINS) as CompanyId[]) if (SITE_DOMAINS[co].some((d) => bare(d) === h)) return co;
  return null;
}

// A link to share with the public: on the company's own address when it has
// one (without the /shantahl part), otherwise on the address the HRIS is open on.
// path is the HRIS path, e.g. /shantahl/careers?job=… or /careers/sdsi/exam/….
export function publicLink(co: CompanyId, path: string, origin: string): string {
  const domain = SITE_DOMAINS[co][0];
  if (!domain) return `${origin}${path}`;
  const slug = `/${SITE_SLUG[co]}`;
  const rest = path === slug ? "/" : path.startsWith(`${slug}/`) || path.startsWith(`${slug}?`) ? path.slice(slug.length) : path;
  return `https://${domain}${rest.startsWith("/") ? rest : `/${rest}`}`;
}
