"use client";

import { useState } from "react";
import { Building2, ExternalLink, Globe } from "lucide-react";
import { useHris } from "@/lib/store";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { NewsAdmin } from "@/components/website/NewsAdmin";
import { JobPosts, ProfileModal } from "@/components/hiring/JobPosts";
import { currentCompany, currentCompanyId } from "@/lib/companies";
import { siteUrl } from "@/lib/careers";

// HR: the public company website (/) — news, job posts, company profile.
export default function WebsitePage() {
  const { isRealAccount, currentUser } = useHris();
  const [tab, setTab] = useState<"news" | "jobs">("news");
  const [profile, setProfile] = useState(false);
  const isHr = !!currentUser?.roles.includes("hr_admin");
  return (
    <div>
      <PageHeader title="Company Website" subtitle={`What the public sees for ${currentCompany().name}: news and press releases, job posts and the company profile.`} />
      {!isRealAccount || !isHr ? (
        <EmptyState icon={Globe} title="HR only" description="Sign in with an HR account." />
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex gap-1 border-b border-[var(--border-hairline)] text-sm" role="tablist">
              {(
                [
                  ["news", "News & press releases"],
                  ["jobs", "Job posts"],
                ] as const
              ).map(([k, label]) => (
                <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`-mb-px border-b-2 px-3 py-2 font-medium ${tab === k ? "border-[var(--series-1)] text-[var(--text-primary)]" : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]"}`}>
                  {label}
                </button>
              ))}
            </div>
            <div className="ml-auto flex gap-2">
              <button onClick={() => setProfile(true)} className="flex items-center gap-1.5 rounded-lg border border-[var(--border-hairline)] px-3 py-2 text-sm text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40">
                <Building2 size={16} /> Company profile
              </button>
              <a href={siteUrl(currentCompanyId())} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 rounded-lg border border-[var(--border-hairline)] px-3 py-2 text-sm text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40">
                <ExternalLink size={16} /> Open {currentCompany().shortName === "SDSI" ? "Shantahl" : currentCompany().shortName}&rsquo;s website
              </a>
            </div>
          </div>
          {tab === "news" ? <NewsAdmin /> : <JobPosts />}
          {profile && <ProfileModal onClose={() => setProfile(false)} />}
        </div>
      )}
    </div>
  );
}
