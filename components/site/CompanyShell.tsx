import { CompanySiteFooter, CompanySiteHeader } from "@/components/site/CompanySite";
import { COMPANIES, type CompanyId } from "@/lib/companies";
import { getProfile } from "@/lib/server/site";

// Every page of a company's own website, in the light .site look.
export async function CompanyShell({ co, children }: { co: CompanyId; children: React.ReactNode }) {
  const c = COMPANIES[co];
  const p = await getProfile(co);
  return (
    <div className="site flex min-h-full flex-1 flex-col">
      <CompanySiteHeader co={co} />
      <div className="flex flex-1 flex-col">{children}</div>
      <CompanySiteFooter co={co} address={p?.address || c.info.address} phone={p?.phone || c.info.phone} email={p?.email || c.info.email} />
    </div>
  );
}
