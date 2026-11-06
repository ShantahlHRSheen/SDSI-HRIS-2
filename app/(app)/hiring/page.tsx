"use client";

import { UserPlus } from "lucide-react";
import { useHris } from "@/lib/store";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { Hiring } from "@/components/hiring/Hiring";
import { approverTitle } from "@/lib/hiring";

// Hiring and Onboarding: HR screening → the Branch / Department Head →
// the final approver → onboarding (training, assessment, recommendation for
// employment signed by the Head, HR and the final approver).
export default function HiringPage() {
  const { isRealAccount } = useHris();
  return (
    <div>
      <PageHeader title="Hiring & Onboarding" subtitle={`Applicants from HR screening, the Branch / Department Head's interview and the ${approverTitle()}'s decision, through onboarding and the recommendation for employment.`} />
      {isRealAccount ? <Hiring /> : <EmptyState icon={UserPlus} title="Not available in the demo" description="Sign in with your employee account." />}
    </div>
  );
}
