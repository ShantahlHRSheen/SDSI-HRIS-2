"use client";

import { Video } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { useChat } from "@/components/chat/ChatProvider";
import { useState } from "react";
import { MeetingsHome } from "@/components/meetings/MeetingsHome";
import { HrMeetingLog } from "@/components/meetings/HrMeetingLog";
import { useHris } from "@/lib/store";
import { chatEnabled } from "@/lib/chat";

// Meetings: start one or join with a code; past meetings with their notes and recordings.
export default function MeetingsPage() {
  const chat = useChat();
  const isHr = !!useHris().currentUser?.roles.includes("hr_admin");
  const [tab, setTab] = useState<"mine" | "log">("mine");
  return (
    <div>
      <PageHeader title="Meetings" subtitle="Video meetings with your co-workers. Only the people in a meeting can see its notes and recordings." />
      {!chatEnabled() ? (
        <EmptyState icon={Video} title="Not available for this company yet" description="Meetings is turned on company by company." />
      ) : !chat?.enabled ? (
        <EmptyState icon={Video} title="Sign in with your employee account" description="Meetings needs your own employee login." />
      ) : (
        <>
          {isHr && (
            <div className="mb-4 flex gap-1 border-b border-[var(--border-hairline)] text-sm">
              {(
                [
                  ["mine", "My meetings"],
                  ["log", "Call & meeting log (HR)"],
                ] as const
              ).map(([k, label]) => (
                <button key={k} onClick={() => setTab(k)} className={`-mb-px border-b-2 px-3 py-2 font-medium ${tab === k ? "border-[var(--series-1)] text-[var(--series-1)]" : "border-transparent text-[var(--text-secondary)]"}`}>
                  {label}
                </button>
              ))}
            </div>
          )}
          {isHr && tab === "log" ? <HrMeetingLog /> : <MeetingsHome />}
        </>
      )}
    </div>
  );
}
