import type { Session } from "@supabase/supabase-js";
import { getSupabaseClient } from "./client";

// Real per-employee auth, layered alongside (not replacing) the existing
// demo click-to-select login in lib/store.tsx. Every function here is safe
// to call even when NEXT_PUBLIC_SUPABASE_URL/ANON_KEY aren't set yet — they
// resolve to a clear error instead of throwing, so the rest of the app (which
// still runs entirely on localStorage) is unaffected until Supabase is
// actually configured.

export function isSupabaseConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export async function signInWithPassword(email: string, password: string): Promise<{ session: Session | null; error: string | null }> {
  if (!isSupabaseConfigured()) {
    return { session: null, error: "Supabase login isn't configured yet — ask your admin to finish setup." };
  }
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    return { session: data.session, error: error?.message ?? null };
  } catch {
    return { session: null, error: "Couldn't reach the login server. Check your connection and try again." };
  }
}

export async function signOutSupabase(): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const supabase = getSupabaseClient();
  await supabase.auth.signOut();
}

export async function getInitialSession(): Promise<Session | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = getSupabaseClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session;
}

// Returns an unsubscribe function, or a no-op if Supabase isn't configured.
export function watchAuthState(onChange: (session: Session | null) => void): () => void {
  if (!isSupabaseConfigured()) return () => {};
  const supabase = getSupabaseClient();
  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((_event, session) => onChange(session));
  return () => subscription.unsubscribe();
}
