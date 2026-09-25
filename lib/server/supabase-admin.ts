import "server-only";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { randomInt } from "node:crypto";

// Server-only helpers for account management routes. The service-role key
// bypasses Row Level Security, so every route must first identify the caller
// from their own access token (getCaller) and check what they're allowed to do.

export function getAdminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not configured on the server.");
  return createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

export interface Caller {
  user: User;
  employee: { id: string; roles: string[] } | null;
}

// Resolves "Authorization: Bearer <access token>" to the signed-in user and
// their employee record, or null if the token is missing or invalid.
export async function getCaller(request: Request, admin: SupabaseClient): Promise<Caller | null> {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return null;
  const { data: employee } = await admin.from("employees").select("id, roles").eq("user_id", data.user.id).maybeSingle();
  return { user: data.user, employee: employee ?? null };
}

export function isHrAdmin(caller: Caller): boolean {
  return !!caller.employee?.roles.some((r) => r === "hr_admin" || r === "sys_admin");
}

export const MIN_PASSWORD_LENGTH = 8;

// Easy to read aloud or type from a note: no 0/O, 1/l/I look-alikes.
export function generateTemporaryPassword(): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnpqrstuvwxyz";
  const digits = "23456789";
  const pick = (chars: string, n: number) => Array.from({ length: n }, () => chars[randomInt(chars.length)]).join("");
  return `${pick(upper, 1)}${pick(lower, 3)}-${pick(digits, 4)}-${pick(upper, 1)}${pick(lower, 2)}`;
}
