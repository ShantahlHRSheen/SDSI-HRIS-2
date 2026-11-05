"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Bell, MessageSquarePlus, MessagesSquare, Search, UserCircle2 } from "lucide-react";
import { conversationTitle, messagePreview, timeLabel } from "@/lib/chat";
import { useChat } from "./ChatProvider";
import { ChatAvatar } from "./ChatAvatar";
import { ChatThread } from "./ChatThread";
import { ChatPhotoModal, ChatSettingsModal, NewChatModal } from "./ChatModals";

export function ChatApp() {
  const chat = useChat()!;
  const { me, people, photo, online, conversations, loadError, setActiveId, notifications, enableNotifications } = chat;
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const selected = params.get("c");
  const [query, setQuery] = useState("");
  const [newOpen, setNewOpen] = useState(false);
  const [photoOpen, setPhotoOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const select = (id: string | null) => {
    setSettingsOpen(false);
    router.replace(id ? `${pathname}?c=${id}` : pathname, { scroll: false });
  };

  useEffect(() => {
    setActiveId(selected);
    return () => setActiveId(null);
  }, [selected, setActiveId]);

  const current = conversations?.find((c) => c.id === selected) ?? null;

  const shown = useMemo(() => {
    const t = query.trim().toLowerCase();
    const list = conversations ?? [];
    if (!t) return list;
    return list.filter((c) => {
      const names = c.members.map((m) => people.get(m.employeeId)).map((p) => (p ? `${p.firstName} ${p.lastName}` : ""));
      return `${conversationTitle(c, me, people)} ${names.join(" ")}`.toLowerCase().includes(t);
    });
  }, [conversations, query, people, me]);

  return (
    <div className="flex h-[calc(100dvh-11rem)] min-h-[460px] overflow-hidden rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-1)]">
      <NewChatModal open={newOpen} onClose={() => setNewOpen(false)} onOpened={select} />
      <ChatPhotoModal open={photoOpen} onClose={() => setPhotoOpen(false)} />
      {settingsOpen && current && <ChatSettingsModal conversation={current} onClose={() => setSettingsOpen(false)} onLeft={() => select(null)} />}

      <div className={`w-full shrink-0 flex-col border-r border-[var(--border-hairline)] lg:flex lg:w-80 ${selected ? "hidden" : "flex"}`}>
        <div className="flex items-center gap-2 border-b border-[var(--border-hairline)] p-2">
          <label className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-[var(--border-hairline)] px-2.5 py-1.5">
            <Search size={15} className="shrink-0 text-[var(--text-muted)]" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search chats" className="w-full bg-transparent text-sm outline-none" aria-label="Search chats" />
          </label>
          <button onClick={() => setPhotoOpen(true)} className="rounded-lg p-1 text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40" aria-label="My chat photo" title="My chat photo">
            {photo(me) ? <ChatAvatar name="" url={photo(me)} size={30} /> : <UserCircle2 size={22} />}
          </button>
          <button onClick={() => setNewOpen(true)} className="rounded-lg bg-[var(--series-1)] p-2 text-[var(--on-accent)]" aria-label="New chat" title="New chat or group">
            <MessageSquarePlus size={17} />
          </button>
        </div>
        {notifications === "default" && (
          <button onClick={enableNotifications} className="flex items-center gap-2 border-b border-[var(--border-hairline)] bg-[var(--series-1)]/8 px-3 py-2 text-left text-xs text-[var(--text-secondary)] hover:bg-[var(--series-1)]/12">
            <Bell size={14} className="shrink-0 text-[var(--series-1)]" />
            <span>
              <span className="font-medium text-[var(--series-1)]">Turn on notifications</span> to hear about new messages while you&rsquo;re in another tab.
            </span>
          </button>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {loadError && !conversations && <div className="p-4 text-center text-sm text-[var(--status-critical)]">{loadError}</div>}
          {!loadError && conversations === null && <div className="p-4 text-center text-sm text-[var(--text-muted)]">Loading…</div>}
          {conversations && shown.length === 0 && (
            <div className="p-6 text-center text-sm text-[var(--text-muted)]">
              {query ? "No chats match." : "No chats yet."}
              {!query && (
                <button onClick={() => setNewOpen(true)} className="mt-2 block w-full text-[var(--series-1)] hover:underline">
                  Start a chat or make a group
                </button>
              )}
            </div>
          )}
          {shown.map((c) => {
            const isGroup = c.kind === "group";
            const other = isGroup ? null : c.members.find((m) => m.employeeId !== me)?.employeeId ?? null;
            const title = conversationTitle(c, me, people);
            const unread = c.id === selected ? 0 : c.unread;
            return (
              <button
                key={c.id}
                onClick={() => select(c.id)}
                className={`flex w-full items-center gap-2.5 border-b border-[var(--gridline)] px-3 py-2.5 text-left hover:bg-[var(--gridline)]/40 ${selected === c.id ? "bg-[var(--series-1)]/10" : ""}`}
              >
                <ChatAvatar name={title} url={isGroup ? null : photo(other)} online={!!other && online.has(other)} group={isGroup} size={40} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className={`truncate text-sm text-[var(--text-primary)] ${unread ? "font-semibold" : ""}`}>{title}</span>
                    <span className="shrink-0 text-[11px] text-[var(--text-muted)]">{c.lastMessage ? timeLabel(c.lastMessage.createdAt) : ""}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`min-w-0 flex-1 truncate text-xs ${unread ? "font-medium text-[var(--text-primary)]" : "text-[var(--text-secondary)]"}`}>{messagePreview(c.lastMessage, me, people, isGroup)}</span>
                    {unread > 0 && <span className="shrink-0 rounded-full bg-[var(--status-critical)] px-1.5 text-[11px] font-semibold text-white">{unread}</span>}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className={`min-w-0 flex-1 flex-col ${selected ? "flex" : "hidden lg:flex"}`}>
        {current ? (
          <ChatThread key={current.id} conversation={current} onBack={() => select(null)} onSettings={() => setSettingsOpen(true)} />
        ) : selected && conversations ? (
          <div className="flex flex-1 flex-col items-center justify-center p-6 text-center text-sm text-[var(--text-muted)]">
            This chat isn&rsquo;t available — you may have left it.
            <button onClick={() => select(null)} className="mt-2 text-[var(--series-1)] hover:underline">
              Back to chats
            </button>
          </div>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center p-6 text-center text-sm text-[var(--text-muted)]">
            <MessagesSquare size={30} className="mb-2" />
            Choose a chat, or start a new one.
          </div>
        )}
      </div>
    </div>
  );
}
