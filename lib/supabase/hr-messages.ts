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
  createdAt: string;
  readAt: string | null;
}

export const HR_MESSAGE_MAX = 2000;

type Row = { id: string; employee_id: string; sender_name: string; from_hr: boolean; body: string; created_at: string; read_at: string | null };

const toMessage = (r: Row): HrMessage => ({
  id: r.id,
  employeeId: r.employee_id,
  senderName: r.sender_name,
  fromHr: r.from_hr,
  body: r.body,
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

export async function sendHrMessage(employeeId: string, body: string): Promise<HrMessage> {
  const { data, error } = await getSupabaseClient().from("hr_messages").insert({ employee_id: employeeId, body: body.trim() }).select().single();
  if (error) throw error;
  return toMessage(data as Row);
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
