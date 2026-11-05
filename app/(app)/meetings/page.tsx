"use client";

import { Video } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { useChat } from "@/components/chat/ChatProvider";
import { MeetingsHome } from "@/components/meetings/MeetingsHome";
import { chatEnabled } from "@/lib/chat";

// Meetings: start one or join with a code; past meetings with their notes and recordings.
export default function MeetingsPage() {
  const chat = useChat();
  return (
    <div>
      <PageHeader title="Meetings" subtitle="Video meetings with your co-workers. Only the people in a meeting can see its notes and recordings." />
      {!chatEnabled() ? (
        <EmptyState icon={Video} title="Not available for this company yet" description="Meetings is turned on company by company." />
      ) : !chat?.enabled ? (
        <EmptyState icon={Video} title="Sign in with your employee account" description="Meetings needs your own employee login." />
      ) : (
        <MeetingsHome />
      )}
    </div>
  );
}
