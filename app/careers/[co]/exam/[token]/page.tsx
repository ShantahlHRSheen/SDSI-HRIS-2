import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ExamTaker } from "@/components/careers/ExamTaker";
import { SiteShell } from "@/components/site/SiteShell";
import { COMPANIES, isCompanyId, isCompanyReady } from "@/lib/companies";

type Props = { params: Promise<{ co: string; token: string }> };

// The secret link stays out of search engines and other sites' logs.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { co } = await params;
  return { title: isCompanyId(co) ? `Initial exam — ${COMPANIES[co].name}` : "Initial exam", robots: { index: false, follow: false }, referrer: "no-referrer" };
}

export default async function ExamPage({ params }: Props) {
  const { co, token } = await params;
  if (!isCompanyId(co) || !isCompanyReady(co) || !/^[A-Za-z0-9_-]{40,60}$/.test(token)) notFound();
  return (
    <SiteShell>
      <ExamTaker co={co} token={token} />
    </SiteShell>
  );
}
