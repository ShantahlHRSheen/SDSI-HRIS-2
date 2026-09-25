"use client";

import { MessageCircle } from "lucide-react";
import { useHris } from "@/lib/store";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { ChatThread, HrInbox } from "@/components/messages/HrChat";

// HR (hr_admin) gets the inbox of every employee's conversation; everyone
// else gets their own private conversation with HR.
export default function MessagesPage() {
  const { currentUser, isRealAccount } = useHris();
  const isHr = !!currentUser?.roles.includes("hr_admin");

  if (!isRealAccount || !currentUser?.employeeId) {
    return (
      <div>
        <PageHeader title="Chat with HR" subtitle="Private messages between you and the HR Department." />
        <EmptyState icon={MessageCircle} title="Not available in the demo" description="Sign in with your employee account to message HR." />
      </div>
    );
  }

  if (isHr) {
    return (
      <div>
        <PageHeader title="HR Messages" subtitle="Private conversations with employees. Only HR and the employee can see each conversation." />
        <HrInbox />
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Chat with HR" subtitle="Private messages between you and the HR Department. HR usually replies within office hours." />
      <div className="flex h-[calc(100dvh-11rem)] min-h-[420px] flex-col overflow-hidden rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-1)]">
        <ChatThread employeeId={currentUser.employeeId} viewerIsHr={false} otherName="HR" />
      </div>
    </div>
  );
}
