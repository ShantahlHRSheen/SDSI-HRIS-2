import { createClient } from "@supabase/supabase-js";
import { currentCompany, currentCompanyId } from "./companies";
import { getSupabaseClient, setGuestClient } from "./supabase/client";

// Joining a meeting as a guest (phase 79, app/api/meetings/guest): the HRIS
// server makes a temporary guest login; this browser uses it through its
// own client, kept in memory only, until the guest leaves.

export interface GuestPass {
  meetingId: string;
  title: string;
  userId: string;
}

let token: string | null = null;

export async function requestGuestPass(code: string, name: string): Promise<GuestPass> {
  const res = await fetch("/api/meetings/guest", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-company": currentCompanyId() },
    body: JSON.stringify({ code, name }),
  });
  const body = (await res.json().catch(() => ({}))) as { error?: string; meetingId?: string; title?: string; userId?: string; accessToken?: string; refreshToken?: string };
  if (!res.ok || !body.accessToken || !body.refreshToken) throw new Error(body.error ?? "Couldn't join as a guest.");
  const c = currentCompany();
  const client = createClient(c.supabaseUrl!, c.supabaseAnonKey!, { auth: { persistSession: false, autoRefreshToken: true, storageKey: "hris-meeting-guest" } });
  const { error } = await client.auth.setSession({ access_token: body.accessToken, refresh_token: body.refreshToken });
  if (error) throw new Error(error.message);
  client.auth.onAuthStateChange((_e, session) => {
    token = session?.access_token ?? token;
  });
  token = body.accessToken;
  setGuestClient(client as unknown as Parameters<typeof setGuestClient>[0]);
  return { meetingId: body.meetingId!, title: body.title ?? "Meeting", userId: body.userId! };
}

export async function guestStatus(meetingId: string): Promise<string> {
  const { data, error } = await (getSupabaseClient() as unknown as { rpc: (f: string, a: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }> }).rpc("meeting_guest_status", { p_meeting: meetingId });
  if (error) throw new Error(error.message);
  return String(data ?? "left");
}

// Leaves and deletes the guest login. keepalive: also works as the tab closes.
export function endGuestPass() {
  const t = token;
  token = null;
  setGuestClient(null);
  if (!t) return;
  fetch("/api/meetings/guest", { method: "DELETE", keepalive: true, headers: { Authorization: `Bearer ${t}`, "x-company": currentCompanyId() } }).catch(() => {});
}
