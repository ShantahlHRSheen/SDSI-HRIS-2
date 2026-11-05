"use client";

import { Suspense } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { Video } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { useChat } from "@/components/chat/ChatProvider";
import { MeetingRoom } from "@/components/meetings/MeetingRoom";
import { chatEnabled } from "@/lib/chat";
import { parseMeetingCode } from "@/lib/meetings";

function Room() {
  const params = useParams<{ code: string }>();
  const search = useSearchParams();
  const code = parseMeetingCode(decodeURIComponent(params.code ?? ""));
  if (!code) return <EmptyState icon={Video} title="That isn't a meeting link" description="Check the code — it looks like abc-defg-hij." />;
  return <MeetingRoom key={code} code={code} autoJoin={search.get("join") === "1"} />;
}

// A meeting or call: /meetings/<code> (?join=1 skips the camera check).
export default function MeetingRoomPage() {
  const chat = useChat();
  if (!chatEnabled()) return <EmptyState icon={Video} title="Not available for this company yet" description="Meetings is turned on company by company." />;
  if (!chat?.enabled) return <EmptyState icon={Video} title="Sign in with your employee account" description="Meetings needs your own employee login." />;
  return (
    <Suspense fallback={null}>
      <Room />
    </Suspense>
  );
}
