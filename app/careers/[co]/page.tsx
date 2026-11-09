import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CompanyCareers } from "@/components/careers/Careers";
import { SiteShell } from "@/components/site/SiteShell";
import { COMPANIES, isCompanyId, isCompanyReady } from "@/lib/companies";

type Props = { params: Promise<{ co: string }>; searchParams: Promise<{ job?: string | string[] }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { co } = await params;
  if (!isCompanyId(co)) return {};
  const c = COMPANIES[co];
  return {
    title: `${c.name} — Company profile & careers`,
    description: `About ${c.name} and its open positions. Apply online.`,
    openGraph: { title: `Careers — ${c.name}`, description: `Open positions at ${c.name}. Apply online.`, images: [c.logo] },
  };
}

export default async function CompanyCareersPage({ params, searchParams }: Props) {
  const { co } = await params;
  if (!isCompanyId(co) || !isCompanyReady(co)) notFound();
  const job = (await searchParams).job;
  return (
    <SiteShell>
      <CompanyCareers co={co} initialJob={typeof job === "string" ? job : null} />
    </SiteShell>
  );
}
