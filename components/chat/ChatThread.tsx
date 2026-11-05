"use client";

import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { ArrowLeft, Download, FileText, Loader2, Paperclip, Phone, Send, Settings2, Smile, Trash2, Upload, X } from "lucide-react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { reportSaveError } from "@/lib/save-errors";
import { canView, FileViewer, saveFile, type ViewerFile } from "@/components/FileViewer";
import { EmojiPicker } from "@/components/messages/EmojiPicker";
import {
  attachmentProblem,
  callLabel,
  CHAT_MAX_ATTACHMENTS,
  CHAT_MESSAGE_MAX,
  clockLabel,
  conversationTitle,
  dayKey,
  dayLabel,
  deleteMessage,
  fetchMessages,
  fileDownloadUrl,
  fileSize,
  fileUrls,
  markRead,
  PAGE_SIZE,
  personName,
  sendMessage,
  toMessage,
  type ChatAttachment,
  type ChatMessage,
  type Conversation,
} from "@/lib/chat";
import { useChat } from "./ChatProvider";
import { ChatAvatar } from "./ChatAvatar";

/* eslint-disable @next/next/no-img-element -- signed Supabase URLs and local previews */

const URL_MAX_AGE = 50 * 60_000;
const TYPING_SHOW_MS = 4000;
const TYPING_SEND_MS = 2500;

// Plain-text links become clickable (http/https only).
function Linkified({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s<>"]+)/g);
  return (
    <>
      {parts.map((p, i) =>
        /^https?:\/\//.test(p) ? (
          <a key={i} href={p} target="_blank" rel="noopener noreferrer" className="underline [overflow-wrap:anywhere]">
            {p}
          </a>
        ) : (
          <Fragment key={i}>{p}</Fragment>
        ),
      )}
    </>
  );
}

function isEmojiOnly(text: string): boolean {
  const t = text.trim();
  return !!t && [...t].length <= 12 && /^(?:\p{Extended_Pictographic}|\p{Emoji_Modifier}|️|‍|\s)+$/u.test(t);
}

interface Pending {
  id: number;
  file: File;
  preview: string | null;
}
let pendingId = 0;

export function ChatThread({ conversation, onBack, onSettings }: { conversation: Conversation; onBack: () => void; onSettings: () => void }) {
  const chat = useChat()!;
  const { me, people, photo, online, patch } = chat;
  const id = conversation.id;
  const isGroup = conversation.kind === "group";
  const title = conversationTitle(conversation, me, people);
  const other = isGroup ? null : conversation.members.find((m) => m.employeeId !== me)?.employeeId ?? null;

  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [urls, setUrls] = useState<{ map: Record<string, string>; at: number }>({ map: {}, at: 0 });
  const [viewer, setViewer] = useState<ViewerFile | null>(null);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState<Pending[]>([]);
  const [attachError, setAttachError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [typing, setTyping] = useState<Record<string, number>>({});
  const [now, setNow] = useState(() => Date.now());

  const scroller = useRef<HTMLDivElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const channel = useRef<RealtimeChannel | null>(null);
  const lastTypingSent = useRef(0);
  const stickToBottom = useRef(true);
  const prependFrom = useRef<number | null>(null);
  const dragDepth = useRef(0);

  // ---- Reading ----------------------------------------------------------------------

  const readTimer = useRef<number | null>(null);
  const markReadSoon = useCallback(() => {
    if (readTimer.current) window.clearTimeout(readTimer.current);
    readTimer.current = window.setTimeout(() => {
      if (document.visibilityState !== "visible") return;
      const at = new Date().toISOString();
      patch(id, (c) => ({ ...c, unread: 0, members: c.members.map((m) => (m.employeeId === me ? { ...m, lastReadAt: at } : m)) }));
      markRead(id).then(
        () => channel.current?.send({ type: "broadcast", event: "read", payload: { employeeId: me, at } }),
        () => {},
      );
    }, 600);
  }, [id, me, patch]);

  useEffect(() => {
    let live = true;
    fetchMessages(id).then(
      (m) => {
        if (!live) return;
        setMessages(m);
        setHasMore(m.length === PAGE_SIZE);
        markReadSoon();
      },
      (e) => live && setLoadError(e instanceof Error ? e.message : "Couldn't load messages."),
    );
    const vis = () => document.visibilityState === "visible" && markReadSoon();
    document.addEventListener("visibilitychange", vis);
    return () => {
      live = false;
      document.removeEventListener("visibilitychange", vis);
      if (readTimer.current) window.clearTimeout(readTimer.current);
    };
  }, [id, markReadSoon]);

  // ---- Live updates -----------------------------------------------------------------

  useEffect(() => {
    const client = getSupabaseClient();
    let ch: RealtimeChannel | null = null;
    let cancelled = false;
    (async () => {
      await client.realtime.setAuth();
      if (cancelled) return;
      ch = client.channel(`chat:${id}`, { config: { private: true } });
      ch.on("broadcast", { event: "message" }, ({ payload }) => {
        const p = payload as { op: string; message: Record<string, unknown> };
        const m = toMessage(p.message);
        setMessages((cur) => {
          if (!cur) return cur;
          if (cur.some((x) => x.id === m.id)) return cur.map((x) => (x.id === m.id ? m : x));
          return p.op === "INSERT" ? [...cur, m] : cur;
        });
        if (p.op === "INSERT" && m.senderId !== me) {
          setTyping((t) => {
            const next = { ...t };
            delete next[m.senderId ?? ""];
            return next;
          });
          markReadSoon();
        }
      })
        .on("broadcast", { event: "typing" }, ({ payload }) => {
          const who = (payload as { employeeId?: string }).employeeId;
          if (who && who !== me) setTyping((t) => ({ ...t, [who]: Date.now() + TYPING_SHOW_MS }));
        })
        .on("broadcast", { event: "read" }, ({ payload }) => {
          const p = payload as { employeeId?: string; at?: string };
          if (p.employeeId && p.at) patch(id, (c) => ({ ...c, members: c.members.map((m) => (m.employeeId === p.employeeId ? { ...m, lastReadAt: p.at! } : m)) }));
        })
        .subscribe();
      channel.current = ch;
    })();
    return () => {
      cancelled = true;
      channel.current = null;
      if (ch) client.removeChannel(ch);
    };
  }, [id, me, markReadSoon, patch]);

  // Typing indicators fade on their own.
  const typingNames = Object.entries(typing)
    .filter(([, until]) => until > now)
    .map(([who]) => people.get(who)?.firstName ?? "Someone");
  const anyTyping = Object.values(typing).some((until) => until > now);
  useEffect(() => {
    if (!anyTyping) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [anyTyping]);

  function sendTyping() {
    const t = Date.now();
    if (t - lastTypingSent.current < TYPING_SEND_MS) return;
    lastTypingSent.current = t;
    channel.current?.send({ type: "broadcast", event: "typing", payload: { employeeId: me } });
  }

  // ---- Scrolling --------------------------------------------------------------------

  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el || !messages) return;
    if (prependFrom.current !== null) {
      el.scrollTop = el.scrollHeight - prependFrom.current;
      prependFrom.current = null;
    } else if (stickToBottom.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  async function loadOlder() {
    if (!messages?.length || !hasMore || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const older = await fetchMessages(id, messages[0].createdAt);
      prependFrom.current = scroller.current ? scroller.current.scrollHeight - scroller.current.scrollTop : null;
      setHasMore(older.length === PAGE_SIZE);
      setMessages((cur) => [...older.filter((o) => !cur?.some((c) => c.id === o.id)), ...(cur ?? [])]);
    } catch (e) {
      reportSaveError("Couldn't load older messages", e);
    } finally {
      setLoadingOlder(false);
    }
  }

  function onScroll() {
    const el = scroller.current;
    if (!el) return;
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    if (el.scrollTop < 80) loadOlder();
  }

  // ---- Attachment links -------------------------------------------------------------

  useEffect(() => {
    const paths = (messages ?? []).flatMap((m) => m.attachments.filter((a) => a.type.startsWith("image/")).map((a) => a.path));
    const stale = Date.now() - urls.at > URL_MAX_AGE;
    const missing = stale ? paths : paths.filter((p) => !urls.map[p]);
    if (!missing.length) return;
    fileUrls(missing).then(
      (u) => setUrls((prev) => ({ map: stale ? u : { ...prev.map, ...u }, at: stale ? Date.now() : prev.at })),
      () => {},
    );
  }, [messages, urls]);

  async function openFile(a: ChatAttachment) {
    try {
      if (canView(a.name, a.type)) {
        const u = urls.map[a.path] ?? (await fileUrls([a.path]))[a.path];
        setViewer({ url: u, name: a.name, kind: a.type.startsWith("image/") ? "image" : "pdf" });
      } else await saveFile(await fileDownloadUrl(a.path, a.name), a.name);
    } catch (e) {
      reportSaveError("Couldn't open the file", e);
    }
  }
  async function download(a: ChatAttachment) {
    try {
      await saveFile(await fileDownloadUrl(a.path, a.name), a.name);
    } catch (e) {
      reportSaveError("Couldn't download the file", e);
    }
  }

  // ---- Composing --------------------------------------------------------------------

  const addFiles = useCallback((list: FileList | File[]) => {
    const incoming = [...list];
    if (!incoming.length) return;
    setAttachError(null);
    setPending((cur) => {
      const room = CHAT_MAX_ATTACHMENTS - cur.length;
      const ok: Pending[] = [];
      for (const f of incoming) {
        const problem = attachmentProblem(f);
        if (problem) {
          setAttachError(problem);
          continue;
        }
        if (ok.length >= room) {
          setAttachError(`Up to ${CHAT_MAX_ATTACHMENTS} files per message.`);
          break;
        }
        ok.push({ id: ++pendingId, file: f, preview: f.type.startsWith("image/") ? URL.createObjectURL(f) : null });
      }
      return [...cur, ...ok];
    });
  }, []);

  function removePending(pid: number) {
    setPending((cur) => {
      const p = cur.find((x) => x.id === pid);
      if (p?.preview) URL.revokeObjectURL(p.preview);
      return cur.filter((x) => x.id !== pid);
    });
  }

  function insertEmoji(emoji: string) {
    const el = textarea.current;
    const start = el?.selectionStart ?? draft.length;
    const end = el?.selectionEnd ?? draft.length;
    setDraft((draft.slice(0, start) + emoji + draft.slice(end)).slice(0, CHAT_MESSAGE_MAX));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + emoji.length, start + emoji.length);
    });
  }

  async function send() {
    const body = draft.trim();
    const sentFiles = pending;
    if ((!body && !sentFiles.length) || sending) return;
    setSending(true);
    stickToBottom.current = true;
    try {
      const m = await sendMessage(id, me, body, sentFiles.map((p) => p.file));
      setMessages((cur) => (cur && !cur.some((x) => x.id === m.id) ? [...cur, m] : cur));
      patch(id, (c) => ({ ...c, lastMessage: m, lastMessageAt: m.createdAt }));
      setDraft((cur) => {
        const rest = cur.trimStart();
        return rest.startsWith(body) ? rest.slice(body.length).trimStart() : cur;
      });
      setPending((cur) => {
        sentFiles.forEach((p) => p.preview && URL.revokeObjectURL(p.preview));
        return cur.filter((p) => !sentFiles.includes(p));
      });
      setAttachError(null);
    } catch (e) {
      reportSaveError("Couldn't send the message", e);
    } finally {
      setSending(false);
    }
  }

  async function remove(m: ChatMessage) {
    if (!window.confirm("Delete this message for everyone?")) return;
    try {
      await deleteMessage(m.id);
      setMessages((cur) => cur?.map((x) => (x.id === m.id ? { ...x, kind: "deleted", body: "", attachments: [], deletedAt: new Date().toISOString() } : x)) ?? cur);
    } catch (e) {
      reportSaveError("Couldn't delete the message", e);
    }
  }

  // ---- Seen -------------------------------------------------------------------------

  const myLast = useMemo(() => [...(messages ?? [])].reverse().find((m) => m.senderId === me && m.kind !== "system"), [messages, me]);
  const seenBy = myLast ? conversation.members.filter((m) => m.employeeId !== me && m.lastReadAt >= myLast.createdAt) : [];

  const subtitle = isGroup
    ? `${conversation.members.length} members`
    : other && online.has(other)
      ? "Online"
      : [people.get(other ?? "")?.position, "Offline"].filter(Boolean).join(" · ");

  return (
    <div
      className="relative flex h-full min-h-0 flex-col"
      onDragEnter={(e) => {
        if (!e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        dragDepth.current++;
        setDragging(true);
      }}
      onDragOver={(e) => e.dataTransfer.types.includes("Files") && e.preventDefault()}
      onDragLeave={() => {
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (!dragDepth.current) setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        dragDepth.current = 0;
        setDragging(false);
        addFiles(e.dataTransfer.files);
      }}
    >
      {viewer && <FileViewer file={viewer} onClose={() => setViewer(null)} />}
      {dragging && (
        <div className="pointer-events-none absolute inset-2 z-20 flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-[var(--series-1)] bg-[var(--surface-1)]/90 text-sm font-medium text-[var(--series-1)]">
          <Upload size={28} className="mb-2" />
          Drop files to send to {title}
        </div>
      )}

      <div className="flex items-center gap-2.5 border-b border-[var(--border-hairline)] px-3 py-2.5">
        <button onClick={onBack} className="rounded-md p-1 text-[var(--text-secondary)] lg:hidden" aria-label="Back to chats">
          <ArrowLeft size={18} />
        </button>
        <ChatAvatar name={title} url={isGroup ? null : photo(other)} online={!!other && online.has(other)} group={isGroup} size={36} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-[var(--text-primary)]">{title}</div>
          <div className="truncate text-xs text-[var(--text-muted)]">{subtitle}</div>
        </div>
        <button
          onClick={onSettings}
          className="rounded-lg p-2 text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40"
          aria-label={isGroup ? "Group settings" : "Chat details"}
          title={isGroup ? "Group settings" : "Chat details"}
        >
          <Settings2 size={18} />
        </button>
      </div>

      <div ref={scroller} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto px-3 py-3 sm:px-4">
        {loadError && !messages && <div className="py-6 text-center text-sm text-[var(--status-critical)]">{loadError}</div>}
        {!loadError && !messages && <div className="py-6 text-center text-sm text-[var(--text-muted)]">Loading…</div>}
        {messages && hasMore && messages.length > 0 && (
          <div className="py-2 text-center">
            <button onClick={loadOlder} disabled={loadingOlder} className="text-xs text-[var(--text-muted)] hover:underline">
              {loadingOlder ? "Loading…" : "Load older messages"}
            </button>
          </div>
        )}
        {messages?.length === 0 && (
          <div className="py-10 text-center text-sm text-[var(--text-muted)]">{isGroup ? "No messages yet. Say hello to the group." : `No messages yet. Say hello to ${title}.`}</div>
        )}
        {messages?.map((m, i) => {
          const prev = messages[i - 1];
          const newDay = !prev || dayKey(prev.createdAt) !== dayKey(m.createdAt);
          const mine = m.senderId === me;
          const run =
            !newDay &&
            prev &&
            prev.senderId === m.senderId &&
            prev.kind !== "system" &&
            prev.kind !== "call" &&
            new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime() < 5 * 60_000;
          const sender = people.get(m.senderId ?? "");
          return (
            <Fragment key={m.id}>
              {newDay && (
                <div className="my-3 flex items-center gap-3 text-[11px] text-[var(--text-muted)]">
                  <span className="h-px flex-1 bg-[var(--gridline)]" />
                  {dayLabel(m.createdAt)}
                  <span className="h-px flex-1 bg-[var(--gridline)]" />
                </div>
              )}
              {m.kind === "system" ? (
                <div className="my-2 text-center text-xs text-[var(--text-muted)]">
                  {mine ? "You" : personName(sender)} {m.body} · {clockLabel(m.createdAt)}
                </div>
              ) : m.kind === "call" ? (
                <div className="my-2 flex justify-center">
                  <span className="flex items-center gap-1.5 rounded-full border border-[var(--border-hairline)] px-3 py-1 text-xs text-[var(--text-secondary)]">
                    <Phone size={13} /> {callLabel(m)} · {clockLabel(m.createdAt)}
                  </span>
                </div>
              ) : (
                <div className={`group flex items-end gap-2 ${run ? "mt-0.5" : "mt-3"} ${mine ? "flex-row-reverse" : ""}`}>
                  {!mine && (
                    <span className="w-8 shrink-0">{!run && <ChatAvatar name={personName(sender)} url={photo(m.senderId)} online={!!m.senderId && online.has(m.senderId)} size={32} />}</span>
                  )}
                  <div className={`flex max-w-[85%] flex-col sm:max-w-[70%] ${mine ? "items-end" : "items-start"}`}>
                    {!run && !mine && isGroup && <div className="mb-0.5 px-1 text-[11px] font-medium text-[var(--text-secondary)]">{personName(sender)}</div>}
                    {m.kind === "deleted" ? (
                      <div className="rounded-2xl border border-dashed border-[var(--border-hairline)] px-3 py-2 text-sm text-[var(--text-muted)] italic">
                        {mine ? "You deleted this message" : "This message was deleted"}
                      </div>
                    ) : (
                      <>
                        {m.attachments.some((a) => a.type.startsWith("image/")) && (
                          <div className={`mb-1 flex flex-wrap gap-1 ${mine ? "justify-end" : ""}`}>
                            {m.attachments
                              .filter((a) => a.type.startsWith("image/"))
                              .map((a) => (
                                <button key={a.path} type="button" onClick={() => openFile(a)} className="block overflow-hidden rounded-xl border border-[var(--border-hairline)]" title={`${a.name} · click to enlarge`}>
                                  {urls.map[a.path] ? (
                                    <img src={urls.map[a.path]} alt={a.name} className="max-h-60 max-w-[260px] object-cover" style={a.width && a.height ? { aspectRatio: `${a.width} / ${a.height}` } : undefined} />
                                  ) : (
                                    <span className="flex h-32 w-40 items-center justify-center text-xs text-[var(--text-muted)]">Loading photo…</span>
                                  )}
                                </button>
                              ))}
                          </div>
                        )}
                        {m.attachments
                          .filter((a) => !a.type.startsWith("image/"))
                          .map((a) => (
                            <div key={a.path} className="mb-1 flex w-full max-w-sm items-center gap-2 rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-2">
                              <FileText size={20} className="shrink-0 text-[var(--series-1)]" />
                              <button type="button" onClick={() => openFile(a)} className="min-w-0 flex-1 text-left" title={canView(a.name, a.type) ? "View" : "Download"}>
                                <div className="truncate text-sm text-[var(--text-primary)]">{a.name}</div>
                                <div className="text-[11px] text-[var(--text-muted)]">{fileSize(a.size)}</div>
                              </button>
                              <button type="button" onClick={() => download(a)} className="shrink-0 rounded-md p-1.5 text-[var(--text-secondary)] hover:bg-[var(--gridline)]/50" aria-label={`Download ${a.name}`} title="Download">
                                <Download size={16} />
                              </button>
                            </div>
                          ))}
                        {m.body &&
                          (isEmojiOnly(m.body) ? (
                            <div className="text-4xl leading-tight">{m.body}</div>
                          ) : (
                            <div
                              className={`w-fit rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap [overflow-wrap:anywhere] ${
                                mine
                                  ? "rounded-br-sm bg-[var(--series-1)] text-[var(--on-accent)]"
                                  : "rounded-bl-sm border border-[var(--border-hairline)] bg-[var(--surface-1)] text-[var(--text-primary)]"
                              }`}
                            >
                              <Linkified text={m.body} />
                            </div>
                          ))}
                      </>
                    )}
                    {(!messages[i + 1] || messages[i + 1].senderId !== m.senderId || m === myLast) && (
                      <div className="mt-0.5 px-1 text-[11px] text-[var(--text-muted)]">
                        {clockLabel(m.createdAt)}
                        {m === myLast && m.kind !== "deleted" && (isGroup ? (seenBy.length ? ` · Seen by ${seenBy.length}` : " · Sent") : seenBy.length ? " · Seen" : " · Sent")}
                      </div>
                    )}
                  </div>
                  {mine && m.kind !== "deleted" && (
                    <button
                      type="button"
                      onClick={() => remove(m)}
                      className="mb-5 shrink-0 rounded-full p-1 text-[var(--text-muted)] opacity-60 hover:bg-[var(--gridline)]/50 hover:text-[var(--status-critical)] focus:opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                      aria-label="Delete message"
                      title="Delete"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              )}
            </Fragment>
          );
        })}
      </div>

      <div className="h-5 px-4 text-xs text-[var(--text-muted)] italic" aria-live="polite">
        {typingNames.length ? `${typingNames.join(", ")} ${typingNames.length > 1 ? "are" : "is"} typing…` : ""}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
        className="border-t border-[var(--border-hairline)] p-2 sm:p-3"
      >
        {(pending.length > 0 || attachError) && (
          <div className="mb-2 flex flex-wrap items-center gap-2">
            {pending.map((p) => (
              <div key={p.id} className="relative">
                {p.preview ? (
                  <img src={p.preview} alt={p.file.name} className="h-16 w-16 rounded-lg border border-[var(--border-hairline)] object-cover" />
                ) : (
                  <div className="flex h-16 max-w-[180px] items-center gap-2 rounded-lg border border-[var(--border-hairline)] px-2.5 text-xs">
                    <FileText size={16} className="shrink-0 text-[var(--series-1)]" />
                    <span className="min-w-0">
                      <span className="block truncate text-[var(--text-primary)]">{p.file.name}</span>
                      <span className="text-[var(--text-muted)]">{fileSize(p.file.size)}</span>
                    </span>
                  </div>
                )}
                {!sending && (
                  <button type="button" onClick={() => removePending(p.id)} className="absolute -top-2 -right-2 rounded-full bg-[var(--surface-1)] p-0.5 text-[var(--text-secondary)] shadow" aria-label={`Remove ${p.file.name}`}>
                    <X size={14} />
                  </button>
                )}
              </div>
            ))}
            {attachError && <span className="text-xs text-[var(--status-critical)]">{attachError}</span>}
          </div>
        )}
        <div className="flex items-end gap-2">
          <input
            ref={fileInput}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files) addFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={sending}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[var(--border-hairline)] text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40 disabled:opacity-40"
            aria-label="Attach photos or files"
            title="Attach photos or files (up to 50 MB each)"
          >
            <Paperclip size={18} />
          </button>
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => setShowEmoji((v) => !v)}
              className="flex h-10 w-10 items-center justify-center rounded-lg border border-[var(--border-hairline)] text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40"
              aria-label="Add an emoji"
              title="Add an emoji"
            >
              <Smile size={18} />
            </button>
            {showEmoji && <EmojiPicker onPick={insertEmoji} onClose={() => setShowEmoji(false)} />}
          </div>
          <textarea
            ref={textarea}
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              if (e.target.value.trim()) sendTyping();
            }}
            onPaste={(e) => {
              const pasted = [...e.clipboardData.files];
              if (pasted.length) {
                e.preventDefault();
                addFiles(pasted);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send();
              }
            }}
            maxLength={CHAT_MESSAGE_MAX}
            rows={1}
            placeholder={`Message ${title}…`}
            aria-label="Message"
            className="max-h-40 min-h-[40px] flex-1 resize-y rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={(!draft.trim() && !pending.length) || sending}
            className="flex h-10 items-center gap-1.5 rounded-lg bg-[var(--series-1)] px-3 text-sm font-medium text-[var(--on-accent)] disabled:opacity-40"
            aria-label="Send"
          >
            {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            <span className="hidden sm:inline">{sending ? (pending.length ? "Uploading…" : "Sending…") : "Send"}</span>
          </button>
        </div>
        <div className="mt-1 px-1 text-[11px] text-[var(--text-muted)]">Enter to send, Shift+Enter for a new line. Drag files here or paste a photo — up to 50 MB each.</div>
      </form>
    </div>
  );
}
