"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ImagePlus, MessageCircle, Search, Send, X } from "lucide-react";
import { useHris } from "@/lib/store";
import { reportSaveError } from "@/lib/save-errors";
import { fullName } from "@/lib/helpers";
import { prepareChatPhoto } from "@/lib/id-images";
import {
  countUnreadHrMessages,
  fetchHrInboxMessages,
  fetchHrThread,
  HR_CHAT_PHOTO_DAYS,
  HR_MESSAGE_MAX,
  hrChatPhotoUrls,
  markHrThreadRead,
  sendHrMessage,
  type HrMessage,
} from "@/lib/supabase/hr-messages";

// Fired after a conversation is marked read so the menu badge refreshes now
// instead of on its next poll.
const READ_EVENT = "hr-messages-read";
const THREAD_POLL_MS = 10_000;
const INBOX_POLL_MS = 20_000;
const BADGE_POLL_MS = 60_000;
// Signed photo links last an hour; refresh them a little before that.
const PHOTO_URL_MAX_AGE_MS = 50 * 60_000;

/* eslint-disable @next/next/no-img-element -- signed Supabase URLs and local previews; next/image adds nothing here */

function timeLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date().toLocaleDateString("en-PH", {
    timeZone: "Asia/Manila",
  });
  const day = d.toLocaleDateString("en-PH", { timeZone: "Asia/Manila" });
  const time = d.toLocaleTimeString("en-PH", {
    timeZone: "Asia/Manila",
    hour: "numeric",
    minute: "2-digit",
  });
  return day === today ? time : `${d.toLocaleDateString("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric" })}, ${time}`;
}

function usePolling(fn: () => void, ms: number) {
  useEffect(() => {
    fn();
    const t = window.setInterval(() => {
      if (document.visibilityState === "visible") fn();
    }, ms);
    return () => window.clearInterval(t);
  }, [fn, ms]);
}

// Unread count for the menu badge. Zero (and no requests) for demo logins.
export function useHrUnreadCount(): number {
  const { currentUser, isRealAccount } = useHris();
  const [count, setCount] = useState(0);
  const myId = currentUser?.employeeId ?? null;
  const isHr = !!currentUser?.roles.includes("hr_admin");
  const load = useCallback(() => {
    if (!isRealAccount || !myId) return;
    countUnreadHrMessages(myId, isHr).then(setCount, () => {});
  }, [isRealAccount, myId, isHr]);
  usePolling(load, BADGE_POLL_MS);
  useEffect(() => {
    window.addEventListener(READ_EVENT, load);
    return () => window.removeEventListener(READ_EVENT, load);
  }, [load]);
  return isRealAccount && myId ? count : 0;
}

export function ChatThread({ employeeId, viewerIsHr, otherName, onSent }: { employeeId: string; viewerIsHr: boolean; otherName: string; onSent?: () => void }) {
  const [messages, setMessages] = useState<HrMessage[] | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const lastCount = useRef(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const [photo, setPhoto] = useState<{ blob: Blob; preview: string } | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [photoUrls, setPhotoUrls] = useState<{
    urls: Record<string, string>;
    at: number;
  }>({ urls: {}, at: 0 });

  const load = useCallback(() => {
    fetchHrThread(employeeId).then(
      (m) => {
        setMessages(m);
        setLoadError(null);
        // Mark the other side's messages as read while this conversation is open.
        if (m.some((x) => !x.readAt && x.fromHr !== viewerIsHr)) {
          markHrThreadRead(employeeId).then(
            () => window.dispatchEvent(new Event(READ_EVENT)),
            () => {},
          );
        }
      },
      (err) => setLoadError(err instanceof Error ? err.message : "Couldn't load messages."),
    );
  }, [employeeId, viewerIsHr]);
  usePolling(load, THREAD_POLL_MS);

  useEffect(() => {
    if (messages && messages.length !== lastCount.current) {
      lastCount.current = messages.length;
      bottom.current?.scrollIntoView({ block: "end" });
    }
  }, [messages]);

  // Fetch viewing links for photos we don't have (fresh) links for yet.
  useEffect(() => {
    const paths = (messages ?? []).map((m) => m.imagePath).filter((p): p is string => !!p);
    const stale = Date.now() - photoUrls.at > PHOTO_URL_MAX_AGE_MS;
    const missing = stale ? paths : paths.filter((p) => !photoUrls.urls[p]);
    if (!missing.length) return;
    hrChatPhotoUrls(missing).then(
      (u) =>
        setPhotoUrls((prev) => ({
          urls: stale ? u : { ...prev.urls, ...u },
          at: stale ? Date.now() : prev.at,
        })),
      (err) => console.warn("Couldn't load chat photos", err),
    );
  }, [messages, photoUrls]);

  useEffect(
    () => () => {
      if (photo) URL.revokeObjectURL(photo.preview);
    },
    [photo],
  );

  async function pickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setPhotoError(null);
    setPreparing(true);
    try {
      const blob = await prepareChatPhoto(file);
      setPhoto({ blob, preview: URL.createObjectURL(blob) });
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : "That photo couldn't be used.");
    } finally {
      setPreparing(false);
    }
  }

  async function send() {
    const body = draft.trim();
    const sentPhoto = photo;
    if ((!body && !sentPhoto) || sending || preparing) return;
    setSending(true);
    try {
      const m = await sendHrMessage(employeeId, body, sentPhoto?.blob);
      setMessages((prev) => [...(prev ?? []), m]);
      // Clear only what was sent — keep anything typed or attached meanwhile.
      setDraft((cur) => (cur.trim() === body ? "" : cur));
      setPhoto((cur) => (cur === sentPhoto ? null : cur));
      onSent?.();
    } catch (err) {
      reportSaveError("Couldn't send the message", err);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-3 sm:px-4">
        {loadError && !messages && <div className="py-6 text-center text-sm text-[var(--status-critical)]">{loadError}</div>}
        {!loadError && !messages && <div className="py-6 text-center text-sm text-[var(--text-muted)]">Loading…</div>}
        {messages?.length === 0 && (
          <div className="py-10 text-center text-sm text-[var(--text-muted)]">
            {viewerIsHr ? `No messages with ${otherName} yet. Write the first one below.` : "No messages yet. Ask HR anything — only you and HR can see this conversation."}
          </div>
        )}
        {messages?.map((m) => {
          const mine = m.fromHr === viewerIsHr;
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[85%] sm:max-w-[70%]`}>
                {m.imagePath && (
                  <a href={photoUrls.urls[m.imagePath]} target="_blank" rel="noreferrer" className={`mb-1 block ${mine ? "ml-auto" : ""} w-fit`}>
                    {photoUrls.urls[m.imagePath] ? (
                      <img src={photoUrls.urls[m.imagePath]} alt="Photo" className="max-h-64 max-w-full rounded-xl border border-[var(--border-hairline)]" />
                    ) : (
                      <span className="flex h-40 w-40 items-center justify-center rounded-xl border border-[var(--border-hairline)] text-xs text-[var(--text-muted)]">
                        Loading photo…
                      </span>
                    )}
                  </a>
                )}
                {m.imageRemoved && (
                  <div
                    className={`mb-1 w-fit rounded-xl border border-dashed border-[var(--border-hairline)] px-3 py-2 text-xs text-[var(--text-muted)] italic ${mine ? "ml-auto" : ""}`}
                  >
                    Photo removed — photos are kept for {HR_CHAT_PHOTO_DAYS} days
                  </div>
                )}
                {m.body && (
                  <div
                    className={`w-fit rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap [overflow-wrap:anywhere] ${
                      mine
                        ? "ml-auto rounded-br-sm bg-[var(--series-1)] text-[var(--on-accent)]"
                        : "rounded-bl-sm border border-[var(--border-hairline)] bg-[var(--surface-1)] text-[var(--text-primary)]"
                    }`}
                  >
                    {m.body}
                  </div>
                )}
                <div className={`mt-0.5 px-1 text-[11px] text-[var(--text-muted)] ${mine ? "text-right" : ""}`}>
                  {!mine && (m.fromHr ? `HR · ${m.senderName} · ` : `${m.senderName} · `)}
                  {mine && m.fromHr && viewerIsHr && m.senderName ? `${m.senderName} · ` : ""}
                  {timeLabel(m.createdAt)}
                  {mine && (m.readAt ? " · Seen" : " · Sent")}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottom} />
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
        className="border-t border-[var(--border-hairline)] p-2 sm:p-3"
      >
        {(photo || preparing || photoError) && (
          <div className="mb-2 flex items-center gap-2">
            {preparing && <span className="text-xs text-[var(--text-muted)]">Preparing photo…</span>}
            {photo && (
              <div className="relative">
                <img src={photo.preview} alt="Photo to send" className="h-20 rounded-lg border border-[var(--border-hairline)]" />
                <button
                  type="button"
                  onClick={() => setPhoto(null)}
                  className="absolute -top-2 -right-2 rounded-full bg-[var(--surface-1)] p-0.5 text-[var(--text-secondary)] shadow"
                  aria-label="Remove photo"
                >
                  <X size={14} />
                </button>
              </div>
            )}
            {photoError && <span className="text-xs text-[var(--status-critical)]">{photoError}</span>}
          </div>
        )}
        <div className="flex items-end gap-2">
          <input ref={fileInput} type="file" accept="image/*" className="hidden" onChange={pickPhoto} />
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={sending || preparing}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[var(--border-hairline)] text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40 disabled:opacity-40"
            aria-label="Add a photo"
            title="Add a photo"
          >
            <ImagePlus size={18} />
          </button>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send();
              }
            }}
            maxLength={HR_MESSAGE_MAX}
            rows={1}
            placeholder={viewerIsHr ? `Reply to ${otherName}…` : "Write a message to HR…"}
            aria-label="Message"
            className="max-h-40 min-h-[40px] flex-1 resize-y rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={(!draft.trim() && !photo) || sending || preparing}
            className="flex h-10 items-center gap-1.5 rounded-lg bg-[var(--series-1)] px-3 text-sm font-medium text-[var(--on-accent)] disabled:opacity-40"
            aria-label="Send"
          >
            <Send size={16} /> <span className="hidden sm:inline">{sending ? "Sending…" : "Send"}</span>
          </button>
        </div>
        <div className="mt-1 px-1 text-[11px] text-[var(--text-muted)]">Photos are deleted automatically after {HR_CHAT_PHOTO_DAYS} days.</div>
      </form>
    </div>
  );
}

type Conversation = { employeeId: string; last: HrMessage; unread: number };

export function HrInbox() {
  const { employees, currentUser } = useHris();
  const myId = currentUser?.employeeId ?? "";
  const [inbox, setInbox] = useState<HrMessage[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const load = useCallback(() => {
    fetchHrInboxMessages().then(setInbox, (err) => reportSaveError("Couldn't load HR messages", err));
  }, []);
  usePolling(load, INBOX_POLL_MS);
  useEffect(() => {
    window.addEventListener(READ_EVENT, load);
    return () => window.removeEventListener(READ_EVENT, load);
  }, [load]);

  const byId = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);
  const nameOf = useCallback(
    (id: string) => {
      const e = byId.get(id);
      return e ? fullName(e) : "Former employee";
    },
    [byId],
  );

  const conversations = useMemo(() => {
    const map = new Map<string, Conversation>();
    for (const m of inbox ?? []) {
      if (m.employeeId === myId) continue;
      const c = map.get(m.employeeId) ?? {
        employeeId: m.employeeId,
        last: m,
        unread: 0,
      };
      if (!m.fromHr && !m.readAt) c.unread++;
      map.set(m.employeeId, c);
    }
    return [...map.values()].sort((a, b) => (a.last.createdAt < b.last.createdAt ? 1 : -1));
  }, [inbox, myId]);

  const q = query.trim().toLowerCase();
  const shown = q ? conversations.filter((c) => nameOf(c.employeeId).toLowerCase().includes(q)) : conversations;
  // Anyone without a conversation yet can be messaged by searching their name.
  const newMatches = q
    ? employees
        .filter(
          (e) =>
            e.id !== myId && e.status !== "resigned" && e.status !== "terminated" && !conversations.some((c) => c.employeeId === e.id) && fullName(e).toLowerCase().includes(q),
        )
        .slice(0, 8)
    : [];

  function open(id: string) {
    setSelected(id);
    setQuery("");
  }

  return (
    <div className="flex h-[calc(100dvh-11rem)] min-h-[420px] overflow-hidden rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-1)]">
      <div className={`w-full shrink-0 flex-col border-r border-[var(--border-hairline)] lg:flex lg:w-80 ${selected ? "hidden" : "flex"}`}>
        <div className="border-b border-[var(--border-hairline)] p-2">
          <label className="flex items-center gap-2 rounded-lg border border-[var(--border-hairline)] px-2.5 py-1.5">
            <Search size={15} className="text-[var(--text-muted)]" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search or start a new chat"
              className="w-full bg-transparent text-sm outline-none"
              aria-label="Search employees"
            />
          </label>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {inbox === null && <div className="p-4 text-center text-sm text-[var(--text-muted)]">Loading…</div>}
          {inbox !== null && shown.length === 0 && newMatches.length === 0 && (
            <div className="p-4 text-center text-sm text-[var(--text-muted)]">{q ? "No one found." : "No messages yet. Search an employee's name to start a chat."}</div>
          )}
          {shown.map((c) => (
            <button
              key={c.employeeId}
              onClick={() => open(c.employeeId)}
              className={`flex w-full items-start gap-2 border-b border-[var(--gridline)] px-3 py-2.5 text-left hover:bg-[var(--gridline)]/40 ${selected === c.employeeId ? "bg-[var(--series-1)]/10" : ""}`}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className={`truncate text-sm ${c.unread ? "font-semibold text-[var(--text-primary)]" : "text-[var(--text-primary)]"}`}>{nameOf(c.employeeId)}</span>
                  <span className="shrink-0 text-[11px] text-[var(--text-muted)]">{timeLabel(c.last.createdAt)}</span>
                </div>
                <div className="truncate text-xs text-[var(--text-secondary)]">
                  {c.last.fromHr ? "You: " : ""}
                  {c.last.body || (c.last.imagePath || c.last.imageRemoved ? "📷 Photo" : "")}
                </div>
              </div>
              {c.unread > 0 && <span className="mt-0.5 rounded-full bg-[var(--status-critical)] px-1.5 text-[11px] font-semibold text-white">{c.unread}</span>}
            </button>
          ))}
          {newMatches.length > 0 && (
            <>
              <div className="px-3 pt-3 pb-1 text-[11px] font-semibold text-[var(--text-muted)] uppercase">Start a new chat</div>
              {newMatches.map((e) => (
                <button key={e.id} onClick={() => open(e.id)} className="block w-full px-3 py-2 text-left text-sm text-[var(--text-primary)] hover:bg-[var(--gridline)]/40">
                  {fullName(e)} <span className="text-xs text-[var(--text-muted)]">{e.employeeNumber}</span>
                </button>
              ))}
            </>
          )}
        </div>
      </div>
      <div className={`min-w-0 flex-1 flex-col ${selected ? "flex" : "hidden lg:flex"}`}>
        {selected ? (
          <>
            <div className="flex items-center gap-2 border-b border-[var(--border-hairline)] px-3 py-2.5">
              <button onClick={() => setSelected(null)} className="rounded-md p-1 text-[var(--text-secondary)] lg:hidden" aria-label="Back to conversations">
                <ArrowLeft size={18} />
              </button>
              <div className="text-sm font-medium text-[var(--text-primary)]">{nameOf(selected)}</div>
              <div className="text-xs text-[var(--text-muted)]">{byId.get(selected)?.employeeNumber}</div>
            </div>
            <div className="min-h-0 flex-1">
              <ChatThread key={selected} employeeId={selected} viewerIsHr otherName={nameOf(selected)} onSent={load} />
            </div>
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center p-6 text-center text-sm text-[var(--text-muted)]">
            <MessageCircle size={28} className="mb-2" />
            Choose a conversation, or search an employee&rsquo;s name to start one.
          </div>
        )}
      </div>
    </div>
  );
}
