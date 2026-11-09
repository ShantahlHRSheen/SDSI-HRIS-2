import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CompanyCareers } from "@/components/careers/Careers";
import { CompanyShell } from "@/components/site/CompanyShell";
import { PageBanner } from "@/components/site/NewsCard";
import { COMPANIES, isCompanyReady } from "@/lib/companies";
import { companyFromSlug, siteUrl } from "@/lib/careers";

type Props = { params: Promise<{ site: string }>; searchParams: Promise<{ job?: string | string[] }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const co = companyFromSlug((await params).site);
  if (!co) return {};
  const c = COMPANIES[co];
  return { title: `Careers — ${c.name}`, description: `Open positions at ${c.name}. Apply online.`, openGraph: { title: `Careers — ${c.name}`, images: [c.logo] } };
}

export default async function CompanyCareersPage({ params, searchParams }: Props) {
  const co = companyFromSlug((await params).site);
  if (!co || !isCompanyReady(co)) notFound();
  const c = COMPANIES[co];
  const t = c.formTheme ?? { deep: "#013825", mid: "#0b6b45", accent: "#7cc9a0" };
  const job = (await searchParams).job;
  return (
    <CompanyShell co={co}>
      <PageBanner title="Careers" colors={[t.deep, t.mid]} crumb={<><Link href={siteUrl(co)} className="hover:underline">Home</Link> / Careers</>}>
        Grow with {c.name}. Apply online — no account needed.
      </PageBanner>
      <CompanyCareers co={co} initialJob={typeof job === "string" ? job : null} jobsOnly />
    </CompanyShell>
  );
}
