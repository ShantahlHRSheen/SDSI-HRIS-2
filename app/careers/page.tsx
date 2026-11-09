import type { Metadata } from "next";
import Link from "next/link";
import { GroupCareers } from "@/components/careers/Careers";
import { SiteShell } from "@/components/site/SiteShell";
import { PageBanner } from "@/components/site/NewsCard";
import { GROUP_NAME } from "@/lib/companies";

export const metadata: Metadata = {
  title: `Careers — ${GROUP_NAME}`,
  description: "Open positions at Shantahl Direct Sales, LSMBiz Credit and Daro Lending. Apply online.",
};

export default function CareersPage() {
  return (
    <SiteShell>
      <PageBanner title="Careers" crumb={<><Link href="/" className="hover:underline">Home</Link> / Careers</>}>
        Grow with us. Choose a company to see its open positions and apply online — no account needed.
      </PageBanner>
      <main className="mx-auto w-full max-w-6xl px-4 py-10">
        <GroupCareers />
      </main>
    </SiteShell>
  );
}
