import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient } from "./supabase/client";
import { currentCompany } from "./companies";
import { loadBitmap, prepareBulletinPhoto, toBlob } from "./id-images";

// Messages (supabase/migrate_phase73_messaging.sql): direct and group chats
// between the company's employees. Each employee sees only the chats they're
// in (Row Level Security); membership changes go through the chat_* functions.
// Realtime channels: chat:<conversation id> (messages, typing, read),
// user:<employee id> (chat activity for the menu badge and notifications),
// company:presence (who's online).

export const chatEnabled = () => !!currentCompany().chat;

const db = () => getSupabaseClient() as unknown as SupabaseClient;
const files = () => db().storage.from("chat-files");
const avatars = () => db().storage.from("chat-avatars");

const SETUP = "Messages isn't set up yet — ask HR to run the latest database update.";
const friendly = (msg: string) => (/(conversation|chat_|messages)/i.test(msg) && /exist|find|not found|schema cache/i.test(msg) ? SETUP : msg);
const fail = (e: { message: string } | null) => {
  if (e) throw new Error(friendly(e.message));
};

export const CHAT_FILE_MAX = 50 * 1024 * 1024;
export const CHAT_MAX_ATTACHMENTS = 10;
export const CHAT_MESSAGE_MAX = 8000;
export const PAGE_SIZE = 40;

export interface ChatPerson {
  id: string;
  firstName: string;
  lastName: string;
  nickname: string;
  position: string;
  department: string;
  avatarPath: string | null;
}
export const personName = (p: Pick<ChatPerson, "firstName" | "lastName"> | undefined) => (p ? `${p.firstName} ${p.lastName}`.trim() : "Former member");

export interface ChatAttachment {
  path: string;
  name: string;
  size: number;
  type: string;
  width?: number;
  height?: number;
}
export type MessageKind = "text" | "system" | "call" | "deleted";
export interface ChatMessage {
  id: string;
  conversationId: string;
  senderId: string | null;
  kind: MessageKind;
  body: string;
  attachments: ChatAttachment[];
  meta: Record<string, unknown>;
  createdAt: string;
  deletedAt: string | null;
}
export interface ChatMember {
  employeeId: string;
  role: "owner" | "member";
  lastReadAt: string;
}
export interface Conversation {
  id: string;
  kind: "direct" | "group";
  name: string | null;
  lastMessageAt: string;
  unread: number;
  lastMessage: ChatMessage | null;
  members: ChatMember[];
}

type Row = Record<string, unknown>;
export const toMessage = (r: Row): ChatMessage => ({
  id: String(r.id),
  conversationId: String(r.conversation_id ?? r.conversationId ?? ""),
  senderId: (r.sender_id as string | null) ?? null,
  kind: (r.kind as MessageKind) ?? "text",
  body: String(r.body ?? ""),
  attachments: Array.isArray(r.attachments) ? (r.attachments as ChatAttachment[]) : [],
  meta: (r.meta as Record<string, unknown>) ?? {},
  createdAt: String(r.created_at ?? ""),
  deletedAt: (r.deleted_at as string | null) ?? null,
});

// ---- People -------------------------------------------------------------------------

export async function fetchDirectory(): Promise<ChatPerson[]> {
  const { data, error } = await db().rpc("chat_directory");
  fail(error);
  return ((data as Row[]) ?? []).map((r) => ({
    id: String(r.id),
    firstName: String(r.first_name ?? ""),
    lastName: String(r.last_name ?? ""),
    nickname: String(r.nickname ?? ""),
    position: String(r.position_title ?? ""),
    department: String(r.department ?? ""),
    avatarPath: (r.avatar_path as string | null) ?? null,
  }));
}

// Viewing links for chat photos (an hour).
export async function avatarUrls(paths: string[]): Promise<Record<string, string>> {
  if (!paths.length) return {};
  const { data, error } = await avatars().createSignedUrls(paths, 3600);
  fail(error);
  const out: Record<string, string> = {};
  for (const d of data ?? []) if (d.signedUrl && d.path) out[d.path] = d.signedUrl;
  return out;
}

// A square 256 px JPEG of the chosen photo.
async function squarePhoto(file: Blob): Promise<Blob> {
  const img = await loadBitmap(file);
  const side = Math.min(img.width, img.height);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, 256, 256);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, 256, 256);
  return toBlob(canvas, "image/jpeg", 0.85);
}

// Sets (or, with null, removes) my chat photo. Returns the new path.
export async function setMyChatPhoto(me: string, file: Blob | null, oldPath: string | null): Promise<string | null> {
  let path: string | null = null;
  if (file) {
    const blob = await squarePhoto(file);
    path = `${me}/${Date.now()}.jpg`;
    const { error } = await avatars().upload(path, blob, { contentType: "image/jpeg" });
    fail(error);
  }
  const { error } = await db().from("chat_profiles").upsert({ employee_id: me, avatar_path: path, updated_at: new Date().toISOString() });
  if (error) {
    if (path) await avatars().remove([path]);
    fail(error);
  }
  if (oldPath && oldPath !== path) await avatars().remove([oldPath]);
  return path;
}

// ---- Conversations --------------------------------------------------------------------

export async function fetchConversations(): Promise<Conversation[]> {
  const { data, error } = await db().rpc("chat_my_conversations");
  fail(error);
  return ((data as Row[]) ?? []).map((r) => ({
    id: String(r.id),
    kind: r.kind as "direct" | "group",
    name: (r.name as string | null) ?? null,
    lastMessageAt: String(r.last_message_at ?? ""),
    unread: Number(r.unread ?? 0),
    lastMessage: r.last_message ? toMessage({ ...(r.last_message as Row), conversation_id: r.id }) : null,
    members: ((r.members as Row[]) ?? []).map((m) => ({ employeeId: String(m.employeeId), role: m.role as "owner" | "member", lastReadAt: String(m.lastReadAt ?? "") })),
  }));
}

const rpc = async <T>(fn: string, args: Row): Promise<T> => {
  const { data, error } = await db().rpc(fn, args);
  fail(error);
  return data as T;
};
export const openDirectChat = (other: string) => rpc<string>("chat_open_direct", { p_other: other });
export const createGroup = (name: string, members: string[]) => rpc<string>("chat_create_group", { p_name: name, p_members: members });
export const renameGroup = (id: string, name: string) => rpc<void>("chat_rename_group", { p_conversation: id, p_name: name });
export const addMembers = (id: string, members: string[]) => rpc<void>("chat_add_members", { p_conversation: id, p_members: members });
export const removeMember = (id: string, employee: string) => rpc<void>("chat_remove_member", { p_conversation: id, p_employee: employee });
export const leaveGroup = (id: string) => rpc<void>("chat_leave_group", { p_conversation: id });
export const markRead = (id: string) => rpc<void>("chat_mark_read", { p_conversation: id });

// ---- Messages -------------------------------------------------------------------------

const MESSAGE_COLS = "id, conversation_id, sender_id, kind, body, attachments, meta, created_at, deleted_at";

// The newest page, or the page before `before` (oldest first).
export async function fetchMessages(conversationId: string, before?: string): Promise<ChatMessage[]> {
  // Same-moment ties (a call message and its notes summary): the call first.
  let q = db().from("messages").select(MESSAGE_COLS).eq("conversation_id", conversationId).order("created_at", { ascending: false }).order("kind", { ascending: false }).limit(PAGE_SIZE);
  if (before) q = q.lt("created_at", before);
  const { data, error } = await q;
  fail(error);
  return ((data as Row[]) ?? []).map(toMessage).reverse();
}

export async function fetchMessage(id: string): Promise<ChatMessage | null> {
  const { data, error } = await db().from("messages").select(MESSAGE_COLS).eq("id", id).maybeSingle();
  fail(error);
  return data ? toMessage(data as Row) : null;
}

export function attachmentProblem(file: File): string | null {
  if (file.size > CHAT_FILE_MAX) return `${file.name} is over 50 MB.`;
  if (!file.size) return `${file.name} is empty.`;
  return null;
}

const isImage = (f: Blob) => /^image\/(jpeg|png|webp|gif)$/.test(f.type);

async function imageSize(file: Blob): Promise<{ width: number; height: number } | null> {
  try {
    const b = await createImageBitmap(file);
    return { width: b.width, height: b.height };
  } catch {
    return null;
  }
}

// Uploads the files to the conversation's folder, then posts the message.
// Photos are shrunk first (longest side 1600 px); GIFs stay as they are.
export async function sendMessage(conversationId: string, me: string, body: string, attach: File[]): Promise<ChatMessage> {
  const uploaded: ChatAttachment[] = [];
  try {
    for (const original of attach.slice(0, CHAT_MAX_ATTACHMENTS)) {
      const problem = attachmentProblem(original);
      if (problem) throw new Error(problem);
      const file = isImage(original) ? await prepareBulletinPhoto(original).catch(() => original) : original;
      const safe = original.name.replace(/[^A-Za-z0-9._ -]+/g, "_").slice(-100) || "file";
      const name = file !== original && file.type === "image/jpeg" && !/\.jpe?g$/i.test(safe) ? safe.replace(/\.[^.]*$/, "") + ".jpg" : safe;
      const path = `${conversationId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${name}`;
      const { error } = await files().upload(path, file, { contentType: file.type || "application/octet-stream" });
      if (error) throw new Error(/exceeded|too large|size/i.test(error.message) ? `${original.name} is over 50 MB.` : friendly(error.message));
      const dims = isImage(file) ? await imageSize(file) : null;
      uploaded.push({ path, name: original.name, size: file.size, type: file.type || "application/octet-stream", ...(dims ?? {}) });
    }
    const { data, error } = await db()
      .from("messages")
      .insert({ conversation_id: conversationId, sender_id: me, kind: "text", body: body.slice(0, CHAT_MESSAGE_MAX), attachments: uploaded })
      .select(MESSAGE_COLS)
      .single();
    fail(error);
    return toMessage(data as Row);
  } catch (err) {
    if (uploaded.length) await files().remove(uploaded.map((u) => u.path));
    throw err;
  }
}

// Deletes my message; its files are removed too.
export async function deleteMessage(id: string): Promise<void> {
  const atts = await rpc<ChatAttachment[]>("chat_delete_message", { p_message: id });
  if (atts?.length) await files().remove(atts.map((a) => a.path));
}

export async function fileUrls(paths: string[]): Promise<Record<string, string>> {
  if (!paths.length) return {};
  const { data, error } = await files().createSignedUrls(paths, 3600);
  fail(error);
  const out: Record<string, string> = {};
  for (const d of data ?? []) if (d.signedUrl && d.path) out[d.path] = d.signedUrl;
  return out;
}

export async function fileDownloadUrl(path: string, name: string): Promise<string> {
  const { data, error } = await files().createSignedUrl(path, 300, { download: name });
  fail(error);
  return data!.signedUrl;
}

// ---- Display helpers ------------------------------------------------------------------

export function conversationTitle(c: Pick<Conversation, "kind" | "name" | "members">, me: string, people: Map<string, ChatPerson>): string {
  if (c.kind === "group") return c.name ?? "Group";
  const other = c.members.find((m) => m.employeeId !== me);
  return other ? personName(people.get(other.employeeId)) : "Just you";
}

export function messagePreview(m: ChatMessage | null, me: string, people: Map<string, ChatPerson>, isGroup: boolean): string {
  if (!m) return "No messages yet";
  const who = m.senderId === me ? "You" : people.get(m.senderId ?? "")?.firstName ?? "Someone";
  if (m.kind === "deleted") return `${who === "You" ? "You" : who} deleted a message`;
  if (m.kind === "system") return `${who} ${m.body}`;
  if (m.kind === "call") return callLabel(m);
  const att = m.attachments.length ? (m.attachments.every((a) => a.type.startsWith("image/")) ? "📷 Photo" : `📎 ${m.attachments[0].name}`) : "";
  const text = m.body || att;
  return isGroup || m.senderId === me ? `${who}: ${text}` : text;
}

export function callLabel(m: ChatMessage): string {
  const video = m.meta.media === "video";
  const secs = Number(m.meta.durationSec ?? 0);
  if (m.meta.missed || !secs) return video ? "Missed video call" : "Missed call";
  const mins = Math.max(1, Math.round(secs / 60));
  return `${video ? "Video call" : "Call"} ended · ${mins} min`;
}

export function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function timeLabel(iso: string): string {
  const d = new Date(iso);
  const opts = { timeZone: "Asia/Manila" } as const;
  const day = d.toLocaleDateString("en-PH", opts);
  if (day === new Date().toLocaleDateString("en-PH", opts)) return d.toLocaleTimeString("en-PH", { ...opts, hour: "numeric", minute: "2-digit" });
  const yesterday = new Date(Date.now() - 86_400_000).toLocaleDateString("en-PH", opts);
  if (day === yesterday) return "Yesterday";
  return d.toLocaleDateString("en-PH", { ...opts, month: "short", day: "numeric" });
}

export const clockLabel = (iso: string) => new Date(iso).toLocaleTimeString("en-PH", { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit" });
export const dayLabel = (iso: string) => {
  const opts = { timeZone: "Asia/Manila" } as const;
  const d = new Date(iso).toLocaleDateString("en-PH", opts);
  if (d === new Date().toLocaleDateString("en-PH", opts)) return "Today";
  if (d === new Date(Date.now() - 86_400_000).toLocaleDateString("en-PH", opts)) return "Yesterday";
  return new Date(iso).toLocaleDateString("en-PH", { ...opts, weekday: "short", month: "long", day: "numeric", year: "numeric" });
};
export const dayKey = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
