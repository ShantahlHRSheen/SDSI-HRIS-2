import { getSupabaseClient } from "./client";

// Browser-side calls to the account routes (app/api/account/password,
// app/api/admin/employee-login). Each sends the signed-in user's access token
// so the server can check who is asking.

async function postWithSession<T>(path: string, body: unknown): Promise<T & { error?: string }> {
  const supabase = getSupabaseClient();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return { error: "Please sign in again." } as T & { error?: string };
  try {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as T & { error?: string };
    if (!res.ok && !json.error) json.error = `Request failed (${res.status}).`;
    return json;
  } catch {
    return { error: "Couldn't reach the server. Check your connection and try again." } as T & { error?: string };
  }
}

// Resolves to an error message, or null on success. Refreshes the session
// afterwards so a cleared "must change password" flag takes effect.
export async function changeOwnPassword(newPassword: string, currentPassword?: string): Promise<string | null> {
  const res = await postWithSession<{ ok?: boolean }>("/api/account/password", { newPassword, currentPassword });
  if (res.error) return res.error;
  await getSupabaseClient().auth.refreshSession();
  return null;
}

export interface IssuedLogin {
  email: string;
  password: string;
  created: boolean;
}

export async function issueEmployeeLogin(employeeId: string): Promise<IssuedLogin | { error: string }> {
  const res = await postWithSession<IssuedLogin>("/api/admin/employee-login", { employeeId });
  return res.error ? { error: res.error } : res;
}
