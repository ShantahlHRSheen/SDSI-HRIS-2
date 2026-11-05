"use client";

import { useMemo, useRef, useState } from "react";
import { Check, Crown, ImagePlus, LogOut, Search, Trash2, UserMinus, UserPlus } from "lucide-react";
import { Modal } from "@/components/Modal";
import { reportSaveError } from "@/lib/save-errors";
import {
  addMembers,
  createGroup,
  leaveGroup,
  openDirectChat,
  personName,
  removeMember,
  renameGroup,
  setMyChatPhoto,
  type ChatPerson,
  type Conversation,
} from "@/lib/chat";
import { useChat } from "./ChatProvider";
import { ChatAvatar } from "./ChatAvatar";


const btn = "rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-40";
const primary = `${btn} bg-[var(--series-1)] text-[var(--on-accent)]`;
const secondary = `${btn} border border-[var(--border-hairline)] text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40`;

// Search the company's employees; pick one or several.
function PeoplePicker({ exclude, selected, onToggle, single = false }: { exclude: string[]; selected: string[]; onToggle: (id: string) => void; single?: boolean }) {
  const { directory, photo, online } = useChat()!;
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (directory ?? [])
      .filter((p) => !exclude.includes(p.id))
      .filter((p) => !t || `${p.firstName} ${p.lastName} ${p.nickname} ${p.position} ${p.department}`.toLowerCase().includes(t));
  }, [directory, exclude, q]);
  return (
    <div>
      <label className="flex items-center gap-2 rounded-lg border border-[var(--border-hairline)] px-2.5 py-1.5">
        <Search size={15} className="text-[var(--text-muted)]" />
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, position or department" className="w-full bg-transparent text-sm outline-none" aria-label="Search people" />
      </label>
      <div className="mt-2 max-h-72 overflow-y-auto rounded-lg border border-[var(--border-hairline)]">
        {directory === null && <div className="p-3 text-center text-sm text-[var(--text-muted)]">Loading…</div>}
        {directory && list.length === 0 && <div className="p-3 text-center text-sm text-[var(--text-muted)]">No one found.</div>}
        {list.map((p) => {
          const on = selected.includes(p.id);
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => onToggle(p.id)}
              className={`flex w-full items-center gap-2.5 border-b border-[var(--gridline)] px-3 py-2 text-left last:border-b-0 hover:bg-[var(--gridline)]/40 ${on ? "bg-[var(--series-1)]/10" : ""}`}
            >
              <ChatAvatar name={personName(p)} url={photo(p.id)} online={online.has(p.id)} size={32} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-[var(--text-primary)]">{personName(p)}</span>
                <span className="block truncate text-xs text-[var(--text-muted)]">{[p.position, p.department].filter(Boolean).join(" · ")}</span>
              </span>
              {!single && (
                <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${on ? "border-[var(--series-1)] bg-[var(--series-1)] text-[var(--on-accent)]" : "border-[var(--border-hairline)]"}`}>
                  {on && <Check size={13} />}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function NewChatModal({ open, onClose, onOpened }: { open: boolean; onClose: () => void; onOpened: (id: string) => void }) {
  const { me, reload } = useChat()!;
  const [selected, setSelected] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const group = selected.length > 1;

  function close() {
    setSelected([]);
    setName("");
    onClose();
  }
  async function start() {
    if (!selected.length || busy) return;
    if (group && !name.trim()) return;
    setBusy(true);
    try {
      const id = group ? await createGroup(name.trim(), selected) : await openDirectChat(selected[0]);
      reload();
      onOpened(id);
      close();
    } catch (e) {
      reportSaveError(group ? "Couldn't create the group" : "Couldn't open the chat", e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={close} title="New chat">
      <p className="mb-3 text-sm text-[var(--text-secondary)]">Pick one person for a direct chat, or several to make a group.</p>
      <PeoplePicker exclude={[me]} selected={selected} onToggle={(id) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))} />
      {group && (
        <label className="mt-3 block text-sm">
          <span className="mb-1 block text-[var(--text-secondary)]">Group name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="e.g. HR Team" className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-2" />
        </label>
      )}
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={close} className={secondary}>
          Cancel
        </button>
        <button type="button" onClick={start} disabled={!selected.length || busy || (group && !name.trim())} className={primary}>
          {busy ? "Opening…" : group ? `Create group (${selected.length + 1})` : "Message"}
        </button>
      </div>
    </Modal>
  );
}

export function ChatSettingsModal({ conversation, onClose, onLeft }: { conversation: Conversation; onClose: () => void; onLeft: () => void }) {
  const { me, people, photo, online, reload } = useChat()!;
  const isGroup = conversation.kind === "group";
  const amOwner = conversation.members.some((m) => m.employeeId === me && m.role === "owner");
  const [name, setName] = useState(conversation.name ?? "");
  const [adding, setAdding] = useState(false);
  const [toAdd, setToAdd] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
      reload();
    } catch (e) {
      reportSaveError(label, e);
    } finally {
      setBusy(false);
    }
  }

  if (!isGroup) {
    const other = conversation.members.find((m) => m.employeeId !== me)?.employeeId ?? "";
    const p = people.get(other);
    return (
      <Modal open onClose={onClose} title="Chat details">
        <div className="flex flex-col items-center text-center">
          <ChatAvatar name={personName(p)} url={photo(other)} online={online.has(other)} size={80} />
          <div className="mt-3 text-base font-semibold text-[var(--text-primary)]">{personName(p)}</div>
          <div className="text-sm text-[var(--text-secondary)]">{[p?.position, p?.department].filter(Boolean).join(" · ")}</div>
          <div className="mt-1 text-xs text-[var(--text-muted)]">{online.has(other) ? "Online now" : "Offline"}</div>
          <p className="mt-4 text-xs text-[var(--text-muted)]">Only the two of you can see this conversation.</p>
        </div>
      </Modal>
    );
  }

  const members = [...conversation.members].sort((a, b) => (a.role === b.role ? personName(people.get(a.employeeId)).localeCompare(personName(people.get(b.employeeId))) : a.role === "owner" ? -1 : 1));

  return (
    <Modal open onClose={onClose} title="Group settings">
      <label className="block text-sm">
        <span className="mb-1 block text-[var(--text-secondary)]">Group name</span>
        <div className="flex gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} className="min-w-0 flex-1 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-2" />
          <button
            type="button"
            disabled={busy || !name.trim() || name.trim() === conversation.name}
            onClick={() => run("Couldn't rename the group", () => renameGroup(conversation.id, name.trim()))}
            className={primary}
          >
            Rename
          </button>
        </div>
      </label>

      <div className="mt-4 mb-1 flex items-center justify-between">
        <span className="text-sm font-medium text-[var(--text-primary)]">{conversation.members.length} members</span>
        {!adding && (
          <button type="button" onClick={() => setAdding(true)} className="flex items-center gap-1 text-sm text-[var(--series-1)] hover:underline">
            <UserPlus size={15} /> Add people
          </button>
        )}
      </div>
      {adding ? (
        <div>
          <PeoplePicker exclude={conversation.members.map((m) => m.employeeId)} selected={toAdd} onToggle={(id) => setToAdd((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))} />
          <div className="mt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setAdding(false);
                setToAdd([]);
              }}
              className={secondary}
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!toAdd.length || busy}
              onClick={() =>
                run("Couldn't add people", async () => {
                  await addMembers(conversation.id, toAdd);
                  setAdding(false);
                  setToAdd([]);
                })
              }
              className={primary}
            >
              Add {toAdd.length || ""}
            </button>
          </div>
        </div>
      ) : (
        <div className="max-h-72 overflow-y-auto rounded-lg border border-[var(--border-hairline)]">
          {members.map((m) => {
            const p = people.get(m.employeeId);
            return (
              <div key={m.employeeId} className="flex items-center gap-2.5 border-b border-[var(--gridline)] px-3 py-2 last:border-b-0">
                <ChatAvatar name={personName(p)} url={photo(m.employeeId)} online={online.has(m.employeeId)} size={32} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1 truncate text-sm text-[var(--text-primary)]">
                    {personName(p)}
                    {m.employeeId === me && <span className="text-xs text-[var(--text-muted)]">(you)</span>}
                    {m.role === "owner" && <Crown size={13} className="text-[var(--status-warning)]" aria-label="Owner" />}
                  </span>
                  <span className="block truncate text-xs text-[var(--text-muted)]">{p?.position}</span>
                </span>
                {amOwner && m.employeeId !== me && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => window.confirm(`Remove ${personName(p)} from the group?`) && run("Couldn't remove them", () => removeMember(conversation.id, m.employeeId))}
                    className="rounded-md p-1.5 text-[var(--text-muted)] hover:bg-[var(--gridline)]/50 hover:text-[var(--status-critical)]"
                    aria-label={`Remove ${personName(p)}`}
                    title="Remove from group"
                  >
                    <UserMinus size={16} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
      <p className="mt-2 text-xs text-[var(--text-muted)]">Anyone in the group can add people. {amOwner ? "As the owner, you can remove members." : "Only the owner can remove members."}</p>

      <div className="mt-4 flex justify-between border-t border-[var(--border-hairline)] pt-3">
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            window.confirm("Leave this group? You won't see its messages anymore.") &&
            run("Couldn't leave the group", async () => {
              await leaveGroup(conversation.id);
              onLeft();
            })
          }
          className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-[var(--status-critical)] hover:bg-[var(--status-critical)]/10"
        >
          <LogOut size={15} /> Leave group
        </button>
        <button type="button" onClick={onClose} className={secondary}>
          Done
        </button>
      </div>
    </Modal>
  );
}

export function ChatPhotoModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { me, people, photo, reloadDirectory } = useChat()!;
  const mine: ChatPerson | undefined = people.get(me);
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function save(file: File | null) {
    setBusy(true);
    try {
      await setMyChatPhoto(me, file, mine?.avatarPath ?? null);
      reloadDirectory();
    } catch (e) {
      reportSaveError(file ? "Couldn't save your chat photo" : "Couldn't remove your chat photo", e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="My chat photo">
      <div className="flex flex-col items-center text-center">
        <ChatAvatar name={personName(mine)} url={photo(me)} size={96} />
        <p className="mt-3 text-sm text-[var(--text-secondary)]">Your photo in Messages and Meetings. It&rsquo;s separate from your ID photo, and everyone in the company can see it.</p>
        <input
          ref={input}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) save(f);
          }}
        />
        <div className="mt-4 flex gap-2">
          <button type="button" disabled={busy} onClick={() => input.current?.click()} className={`${primary} flex items-center gap-1.5`}>
            <ImagePlus size={16} /> {busy ? "Saving…" : mine?.avatarPath ? "Change photo" : "Upload photo"}
          </button>
          {mine?.avatarPath && (
            <button type="button" disabled={busy} onClick={() => save(null)} className={`${secondary} flex items-center gap-1.5`}>
              <Trash2 size={15} /> Remove
            </button>
          )}
        </div>
        <p className="mt-2 text-[11px] text-[var(--text-muted)]">JPG, PNG or WebP. It&rsquo;s cropped to a square.</p>
      </div>
    </Modal>
  );
}
