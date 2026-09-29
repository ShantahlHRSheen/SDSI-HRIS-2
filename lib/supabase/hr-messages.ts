import { getSupabaseClient } from "./client";

// Private employee ↔ HR chat (supabase/migrate_phase16_hr_messages.sql).
// One conversation per employee, keyed by their employee id. The database
// fills in the sender, name, "from HR" and time, so only employee_id and
// body are sent.

export interface HrMessage {
  id: string;
  employeeId: string;
  senderName: string;
  fromHr: boolean;
  body: string;
  imagePath: string | null;
  // Set once the daily cleanup has deleted the photo (30 days after sending).
  imageRemoved: boolean;
  createdAt: string;
  readAt: string | null;
}

export const HR_MESSAGE_MAX = 2000;
export const HR_CHAT_BUCKET = "hr-chat-images";
export const HR_CHAT_PHOTO_DAYS = 30;

type Row = {
  id: string;
  employee_id: string;
  sender_name: string;
  from_hr: boolean;
  body: string;
  image_path?: string | null;
  image_removed_at?: string | null;
  created_at: string;
  read_at: string | null;
};

const toMessage = (r: Row): HrMessage => ({
  id: r.id,
  employeeId: r.employee_id,
  senderName: r.sender_name,
  fromHr: r.from_hr,
  body: r.body,
  imagePath: r.image_path ?? null,
  imageRemoved: !!r.image_removed_at,
  createdAt: r.created_at,
  readAt: r.read_at,
});

export async function fetchHrThread(employeeId: string): Promise<HrMessage[]> {
  const { data, error } = await getSupabaseClient().from("hr_messages").select("*").eq("employee_id", employeeId).order("created_at", { ascending: true });
  if (error) throw error;
  return (data as Row[]).map(toMessage);
}

// HR's inbox: the newest messages across all conversations (grouped by the
// page). Capped so the inbox stays quick even after years of use.
export async function fetchHrInboxMessages(): Promise<HrMessage[]> {
  const { data, error } = await getSupabaseClient().from("hr_messages").select("*").order("created_at", { ascending: false }).limit(2000);
  if (error) throw error;
  return (data as Row[]).map(toMessage);
}

// Sends text and/or a photo (already shrunk by prepareChatPhoto). The photo
// goes in the conversation's folder; if the message then fails, the orphaned
// file is cleaned up by the daily job with the other expired photos.
export async function sendHrMessage(employeeId: string, body: string, photo?: Blob | null): Promise<HrMessage> {
  const client = getSupabaseClient();
  let imagePath: string | null = null;
  if (photo) {
    imagePath = `${employeeId}/${crypto.randomUUID()}.jpg`;
    const { error: upErr } = await client.storage.from(HR_CHAT_BUCKET).upload(imagePath, photo, { contentType: "image/jpeg" });
    if (upErr) throw upErr;
  }
  const { data, error } = await client
    .from("hr_messages")
    .insert({ employee_id: employeeId, body: body.trim(), ...(imagePath ? { image_path: imagePath } : {}) })
    .select()
    .single();
  if (error) throw error;
  return toMessage(data as Row);
}

// Short-lived (1 hour) viewing links for chat photos, keyed by path.
export async function hrChatPhotoUrls(paths: string[]): Promise<Record<string, string>> {
  if (!paths.length) return {};
  const { data, error } = await getSupabaseClient().storage.from(HR_CHAT_BUCKET).createSignedUrls(paths, 3600);
  if (error) throw error;
  const urls: Record<string, string> = {};
  for (const d of data) if (d.path && d.signedUrl) urls[d.path] = d.signedUrl;
  return urls;
}

export async function markHrThreadRead(employeeId: string): Promise<void> {
  const client = getSupabaseClient() as unknown as { rpc: (f: string, a: Record<string, unknown>) => PromiseLike<{ error: { message: string } | null }> };
  const { error } = await client.rpc("mark_hr_thread_read", { thread_employee_id: employeeId });
  if (error) throw new Error(error.message);
}

// Unread messages waiting for me: for HR, employees' messages (other than
// in HR's own conversation); for an employee, HR's replies to them.
export async function countUnreadHrMessages(myEmployeeId: string, isHr: boolean): Promise<number> {
  const base = getSupabaseClient().from("hr_messages").select("id", { count: "exact", head: true }).is("read_at", null);
  const q = isHr ? base.eq("from_hr", false).neq("employee_id", myEmployeeId) : base.eq("employee_id", myEmployeeId).eq("from_hr", true);
  const { count, error } = await q;
  if (error) throw error;
  return count ?? 0;
}

// ---- Reactions (supabase/migrate_phase21_hr_message_reactions.sql) ----------
// One per person per message; the database fills in who reacted.

export type HrReaction = "smile" | "laugh" | "sad" | "heart" | "like" | "celebrate";

export const HR_REACTIONS: { value: HrReaction; emoji: string; label: string }[] = [
  { value: "like", emoji: "👍", label: "Like" },
  { value: "heart", emoji: "❤️", label: "Heart" },
  { value: "smile", emoji: "😊", label: "Smile" },
  { value: "laugh", emoji: "😂", label: "Laugh" },
  { value: "sad", emoji: "😢", label: "Sad" },
  { value: "celebrate", emoji: "🎉", label: "Celebrate" },
];

export interface HrMessageReaction {
  messageId: string;
  reactorEmployeeId: string;
  reactorName: string;
  reaction: HrReaction;
}

type ReactionRow = { message_id: string; reactor_employee_id: string; reactor_name: string; reaction: HrReaction };
type LooseQuery = PromiseLike<{ data: unknown; error: { message: string } | null }> & {
  select: (c?: string) => LooseQuery;
  in: (col: string, v: string[]) => LooseQuery;
  eq: (col: string, v: string) => LooseQuery;
  upsert: (v: Record<string, unknown>, o?: { onConflict: string }) => LooseQuery;
  delete: () => LooseQuery;
};
const reactionsTable = () => (getSupabaseClient() as unknown as { from: (t: string) => LooseQuery }).from("hr_message_reactions");

// Reactions for these messages. Resolves to [] if reactions aren't set up yet.
export async function fetchHrReactions(messageIds: string[]): Promise<HrMessageReaction[]> {
  const out: HrMessageReaction[] = [];
  for (let i = 0; i < messageIds.length; i += 200) {
    const { data, error } = await reactionsTable()
      .select("message_id, reactor_employee_id, reactor_name, reaction")
      .in("message_id", messageIds.slice(i, i + 200));
    if (error) {
      if (/hr_message_reactions/.test(error.message)) return [];
      throw new Error(error.message);
    }
    for (const r of data as ReactionRow[]) out.push({ messageId: r.message_id, reactorEmployeeId: r.reactor_employee_id, reactorName: r.reactor_name, reaction: r.reaction });
  }
  return out;
}

// Set my reaction (replacing any previous one), or remove it with null.
export async function setHrReaction(messageId: string, myEmployeeId: string, reaction: HrReaction | null): Promise<void> {
  const q =
    reaction === null
      ? reactionsTable().delete().eq("message_id", messageId).eq("reactor_employee_id", myEmployeeId)
      : reactionsTable().upsert({ message_id: messageId, reactor_employee_id: myEmployeeId, reaction }, { onConflict: "message_id,reactor_employee_id" });
  const { error } = await q;
  if (error) throw new Error(/hr_message_reactions/.test(error.message) ? "Reactions aren't set up yet — ask HR to run the latest database update." : error.message);
}
