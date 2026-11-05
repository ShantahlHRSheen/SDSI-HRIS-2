"use client";

import { Suspense } from "react";
import { MessagesSquare } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { useChat } from "@/components/chat/ChatProvider";
import { ChatApp } from "@/components/chat/ChatApp";
import { chatEnabled } from "@/lib/chat";

// Messages: direct and group chats between the company's employees.
export default function ChatPage() {
  const chat = useChat();
  return (
    <div>
      <PageHeader title="Messages" subtitle="Chat with your co-workers, one-on-one or in groups. Only the people in a chat can see it." />
      {!chatEnabled() ? (
        <EmptyState icon={MessagesSquare} title="Not available for this company yet" description="Messages is turned on company by company." />
      ) : !chat?.enabled ? (
        <EmptyState icon={MessagesSquare} title="Sign in with your employee account" description="Messages needs your own employee login." />
      ) : (
        <Suspense fallback={<div className="py-6 text-center text-sm text-[var(--text-muted)]">Loading…</div>}>
          <ChatApp />
        </Suspense>
      )}
    </div>
  );
}
