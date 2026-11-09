"use client";

import { useState } from "react";
import { UserPlus } from "lucide-react";
import { useHris } from "@/lib/store";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { Hiring } from "@/components/hiring/Hiring";
import { Requisitions } from "@/components/hiring/Requisitions";
import { Overview } from "@/components/hiring/Overview";
import { approverTitle } from "@/lib/hiring";

// Hiring and Onboarding: personnel requisitions (Head → HR → final approver),
// then applicants from HR screening → the Branch / Department Head → the final
// approver → onboarding (training, assessment, recommendation for employment).
export default function HiringPage() {
  const { isRealAccount } = useHris();
  const [tab, setTab] = useState<"overview" | "applicants" | "requisitions">("overview");
  // Opened from the overview; the key remounts the tab on that record.
  const [openId, setOpenId] = useState<{ id: string; n: number } | null>(null);
  const go = (t: "applicants" | "requisitions", id: string) => {
    setOpenId((o) => ({ id, n: (o?.n ?? 0) + 1 }));
    setTab(t);
  };
  return (
    <div>
      <PageHeader title="Hiring & Onboarding" subtitle={`Personnel requisitions, then applicants from HR screening, the Branch / Department Head's interview and the ${approverTitle()}'s decision, through onboarding and the recommendation for employment.`} />
      {isRealAccount ? (
        <div className="space-y-4">
          <div className="flex gap-1 border-b border-[var(--border-hairline)] text-sm" role="tablist">
            {(
              [
                ["overview", "Overview"],
                ["applicants", "Applicants"],
                ["requisitions", "Personnel requisitions"],
              ] as const
            ).map(([k, label]) => (
              <button key={k} role="tab" aria-selected={tab === k} onClick={() => {
                  setOpenId(null);
                  setTab(k);
                }} className={`-mb-px border-b-2 px-3 py-2 font-medium ${tab === k ? "border-[var(--series-1)] text-[var(--text-primary)]" : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)]"}`}>
                {label}
              </button>
            ))}
          </div>
          {tab === "overview" && <Overview onOpenApplicant={(id) => go("applicants", id)} onOpenRequisition={(id) => go("requisitions", id)} />}
          {tab === "applicants" && <Hiring key={openId?.n ?? 0} initialOpen={openId?.id ?? null} />}
          {tab === "requisitions" && <Requisitions key={openId?.n ?? 0} initialOpen={openId?.id ?? null} />}
        </div>
      ) : (
        <EmptyState icon={UserPlus} title="Not available in the demo" description="Sign in with your employee account." />
      )}
    </div>
  );
}
