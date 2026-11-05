"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { useHris } from "@/lib/store";
import { currentCompany } from "@/lib/companies";
import { getSupabaseClient } from "@/lib/supabase/client";
import {
  avatarUrls,
  chatEnabled,
  conversationTitle,
  fetchConversations,
  fetchDirectory,
  fetchMessage,
  messagePreview,
  type ChatPerson,
  type Conversation,
} from "@/lib/chat";
import { sendToUser, type CallSignal } from "@/lib/meetings";
import { IncomingCall, type IncomingInvite } from "@/components/meetings/IncomingCall";

// Messages state shared by every page: who's online (Presence on
// company:presence), my conversations and unread counts (refreshed from my
// user:<id> channel), chat photos, and browser notifications for new
// messages while the tab is in the background.

interface ChatState {
  enabled: boolean;
  me: string;
  people: Map<string, ChatPerson>;
  directory: ChatPerson[] | null;
  photo: (employeeId: string | null | undefined) => string | null;
  online: Set<string>;
  conversations: Conversation[] | null;
  loadError: string | null;
  unreadTotal: number;
  reload: () => void;
  reloadDirectory: () => void;
  patch: (id: string, fn: (c: Conversation) => Conversation) => void;
  activeId: string | null;
  setActiveId: (id: string | null) => void;
  notifications: NotificationPermission | "unsupported";
  enableNotifications: () => void;
  // The meeting this tab is in (no ringing for it).
  setInMeeting: (id: string | null) => void;
}

// Call answers (decline) reach the caller's meeting room as this window event.
export const CALL_EVENT = "hris-call-signal";
const RING_MS = 45_000;

const Ctx = createContext<ChatState | null>(null);
export const useChat = () => useContext(Ctx);

const PHOTO_MAX_AGE = 50 * 60_000;

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const { currentUser, isRealAccount } = useHris();
  const router = useRouter();
  const me = currentUser?.employeeId ?? "";
  const enabled = chatEnabled() && isRealAccount && !!me;

  const [directory, setDirectory] = useState<ChatPerson[] | null>(null);
  const [photos, setPhotos] = useState<{ urls: Record<string, string>; at: number }>({ urls: {}, at: 0 });
  const [online, setOnline] = useState<Set<string>>(new Set());
  const [conversations, setConversations] = useState<Conversation[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<NotificationPermission | "unsupported">(() =>
    typeof window !== "undefined" && "Notification" in window ? Notification.permission : "unsupported",
  );
  const activeRef = useRef<string | null>(null);
  const [incoming, setIncoming] = useState<IncomingInvite | null>(null);
  const inMeeting = useRef<string | null>(null);
  const setInMeeting = useCallback((id: string | null) => {
    inMeeting.current = id;
  }, []);
  useEffect(() => {
    activeRef.current = activeId;
  }, [activeId]);

  const people = useMemo(() => new Map((directory ?? []).map((p) => [p.id, p])), [directory]);
  const peopleRef = useRef(people);
  const convRef = useRef(conversations);
  useEffect(() => {
    peopleRef.current = people;
    convRef.current = conversations;
  }, [people, conversations]);

  const reloadDirectory = useCallback(() => {
    if (!enabled) return;
    fetchDirectory().then(setDirectory, (e) => setLoadError(e instanceof Error ? e.message : "Couldn't load people."));
  }, [enabled]);

  const reload = useCallback(() => {
    if (!enabled) return;
    fetchConversations().then(
      (c) => {
        // The open chat is being read as messages come in.
        setConversations(c.map((x) => (x.id === activeRef.current ? { ...x, unread: 0 } : x)));
        setLoadError(null);
      },
      (e) => setLoadError(e instanceof Error ? e.message : "Couldn't load your chats."),
    );
  }, [enabled]);

  // Coalesce bursts of activity into one refresh.
  const timer = useRef<number | null>(null);
  const reloadSoon = useCallback(() => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(reload, 400);
  }, [reload]);

  useEffect(() => {
    reloadDirectory();
    reload();
  }, [reloadDirectory, reload]);

  // Fallback refresh, and on returning to the tab.
  useEffect(() => {
    if (!enabled) return;
    const t = window.setInterval(() => document.visibilityState === "visible" && reload(), 90_000);
    const vis = () => document.visibilityState === "visible" && reload();
    document.addEventListener("visibilitychange", vis);
    return () => {
      window.clearInterval(t);
      document.removeEventListener("visibilitychange", vis);
    };
  }, [enabled, reload]);

  // Chat photos: signed links, refreshed before they expire.
  useEffect(() => {
    const paths = (directory ?? []).map((p) => p.avatarPath).filter((p): p is string => !!p);
    const stale = Date.now() - photos.at > PHOTO_MAX_AGE;
    const missing = stale ? paths : paths.filter((p) => !photos.urls[p]);
    if (!missing.length) return;
    avatarUrls(missing).then(
      (u) => setPhotos((prev) => ({ urls: stale ? u : { ...prev.urls, ...u }, at: stale ? Date.now() : prev.at })),
      () => {},
    );
  }, [directory, photos]);
  const photo = useCallback(
    (id: string | null | undefined) => {
      const path = id ? people.get(id)?.avatarPath : null;
      return path ? photos.urls[path] ?? null : null;
    },
    [people, photos],
  );

  const notify = useCallback(
    async (conversationId: string, messageId: string) => {
      if (!("Notification" in window) || Notification.permission !== "granted") return;
      if (document.visibilityState === "visible") return;
      const m = await fetchMessage(messageId).catch(() => null);
      if (!m || m.kind === "deleted") return;
      const conv = convRef.current?.find((c) => c.id === conversationId);
      const ppl = peopleRef.current;
      const sender = ppl.get(m.senderId ?? "");
      const isGroup = conv?.kind === "group";
      const title = isGroup && conv ? conversationTitle(conv, me, ppl) : sender ? `${sender.firstName} ${sender.lastName}` : "New message";
      const body = messagePreview(m, me, ppl, !!isGroup);
      const n = new Notification(title, { body, tag: conversationId, icon: currentCompany().logo });
      n.onclick = () => {
        window.focus();
        router.push(`/chat?c=${conversationId}`);
        n.close();
      };
    },
    [me, router],
  );

  const onCall = useCallback(
    (sig: CallSignal) => {
      if (sig.type === "invite") {
        if (sig.from === me || inMeeting.current === sig.meetingId) return;
        setIncoming(sig);
        if ("Notification" in window && Notification.permission === "granted" && document.visibilityState !== "visible") {
          const caller = peopleRef.current.get(sig.from);
          const n = new Notification(sig.kind === "meeting" ? `Meeting invite: ${sig.title}` : `Incoming ${sig.media === "video" ? "video" : "voice"} call`, { body: caller ? `${caller.firstName} ${caller.lastName}` : sig.title, tag: `call-${sig.meetingId}`, icon: currentCompany().logo, requireInteraction: true });
          n.onclick = () => {
            window.focus();
            n.close();
          };
        }
      } else if (sig.type === "cancel") {
        setIncoming((cur) => (cur?.meetingId === sig.meetingId ? null : cur));
      } else {
        window.dispatchEvent(new CustomEvent(CALL_EVENT, { detail: sig }));
      }
    },
    [me],
  );

  // Unanswered calls stop ringing.
  useEffect(() => {
    if (!incoming) return;
    const t = window.setTimeout(() => setIncoming(null), RING_MS);
    return () => window.clearTimeout(t);
  }, [incoming]);

  // Realtime: presence and my own channel.
  useEffect(() => {
    if (!enabled) return;
    const client = getSupabaseClient();
    let presence: RealtimeChannel | null = null;
    let mine: RealtimeChannel | null = null;
    let cancelled = false;
    (async () => {
      await client.realtime.setAuth();
      if (cancelled) return;
      presence = client.channel("company:presence", { config: { private: true, presence: { key: me } } });
      presence
        .on("presence", { event: "sync" }, () => setOnline(new Set(Object.keys(presence!.presenceState()))))
        .subscribe((status) => {
          if (status === "SUBSCRIBED") presence!.track({ at: new Date().toISOString() });
        });
      mine = client.channel(`user:${me}`, { config: { private: true } });
      mine
        .on("broadcast", { event: "chat-activity" }, ({ payload }) => {
          reloadSoon();
          const p = payload as { op?: string; conversationId?: string; messageId?: string; senderId?: string };
          if (p.op === "INSERT" && p.senderId && p.senderId !== me && p.conversationId && p.messageId) notify(p.conversationId, p.messageId);
        })
        .on("broadcast", { event: "call" }, ({ payload }) => onCall(payload as CallSignal))
        .subscribe();
    })().catch(() => {});
    return () => {
      cancelled = true;
      if (presence) client.removeChannel(presence);
      if (mine) client.removeChannel(mine);
    };
  }, [enabled, me, reloadSoon, notify, onCall]);

  const patch = useCallback((id: string, fn: (c: Conversation) => Conversation) => {
    setConversations((cur) => cur?.map((c) => (c.id === id ? fn(c) : c)) ?? cur);
  }, []);

  const enableNotifications = useCallback(() => {
    if (!("Notification" in window)) return;
    Notification.requestPermission().then(setNotifications, () => {});
  }, []);

  const unreadTotal = enabled ? (conversations ?? []).reduce((n, c) => n + (c.id === activeId ? 0 : c.unread), 0) : 0;

  const value: ChatState = {
    enabled,
    me,
    people,
    directory,
    photo,
    online,
    conversations,
    loadError,
    unreadTotal,
    reload,
    reloadDirectory,
    patch,
    activeId,
    setActiveId,
    notifications,
    enableNotifications,
    setInMeeting,
  };
  return (
    <Ctx.Provider value={value}>
      {children}
      {incoming && (
        <IncomingCall
          invite={incoming}
          caller={people.get(incoming.from)}
          photo={photo(incoming.from)}
          onAccept={() => {
            setIncoming(null);
            router.push(`/meetings/${incoming.code}${incoming.kind === "meeting" ? "" : "?join=1"}`);
          }}
          onDecline={() => {
            sendToUser(incoming.from, { type: "decline", meetingId: incoming.meetingId, from: me });
            setIncoming(null);
          }}
        />
      )}
    </Ctx.Provider>
  );
}
