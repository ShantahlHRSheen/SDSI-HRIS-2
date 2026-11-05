"use client";

import { useEffect } from "react";
import { Phone, PhoneOff, Video } from "lucide-react";
import { startRingtone } from "@/lib/tones";
import { personName, type ChatPerson } from "@/lib/chat";
import { ChatAvatar } from "@/components/chat/ChatAvatar";

export interface IncomingInvite {
  meetingId: string;
  code: string;
  media: "audio" | "video";
  conversationId: string;
  from: string;
  title: string;
}

// The incoming-call popup, with a ringtone, shown on any page.
export function IncomingCall({ invite, caller, photo, onAccept, onDecline }: { invite: IncomingInvite; caller: ChatPerson | undefined; photo: string | null; onAccept: () => void; onDecline: () => void }) {
  useEffect(() => startRingtone(), []);
  const video = invite.media === "video";
  const name = personName(caller);
  const group = invite.title && invite.title !== "Call" && invite.title !== name ? invite.title : null;
  return (
    <div className="fixed inset-x-0 top-4 z-[60] flex justify-center px-4" role="alertdialog" aria-label={`Incoming call from ${name}`}>
      <div className="flex w-full max-w-sm items-center gap-3 rounded-2xl border border-[var(--border-hairline)] bg-[var(--surface-1)] p-4 shadow-2xl">
        <span className="animate-pulse">
          <ChatAvatar name={name} url={photo} size={52} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-[var(--text-primary)]">{name}</div>
          <div className="truncate text-xs text-[var(--text-secondary)]">
            Incoming {video ? "video" : "voice"} call{group ? ` · ${group}` : ""}
          </div>
        </div>
        <button onClick={onDecline} className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--status-critical)] text-white" aria-label="Decline" title="Decline">
          <PhoneOff size={20} />
        </button>
        <button onClick={onAccept} className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--status-good)] text-white" aria-label="Accept" title="Accept">
          {video ? <Video size={20} /> : <Phone size={20} />}
        </button>
      </div>
    </div>
  );
}
