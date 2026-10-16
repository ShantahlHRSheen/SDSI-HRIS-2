import type { Session } from "@supabase/supabase-js";
import { getSupabaseClient } from "./client";
import { currentCompany, currentCompanyId, isCompanyReady } from "../companies";

// Real per-employee auth, layered alongside (not replacing) the existing
// demo click-to-select login in lib/store.tsx. Every function here is safe
// to call even when NEXT_PUBLIC_SUPABASE_URL/ANON_KEY aren't set yet — they
// resolve to a clear error instead of throwing, so the rest of the app (which
// still runs entirely on localStorage) is unaffected until Supabase is
// actually configured.

// The chosen company's database is connected (lib/companies.ts).
export function isSupabaseConfigured(): boolean {
  return isCompanyReady(currentCompanyId());
}

export async function signInWithPassword(email: string, password: string): Promise<{ session: Session | null; error: string | null }> {
  if (!isSupabaseConfigured()) {
    return { session: null, error: "Supabase login isn't configured yet — ask your admin to finish setup." };
  }
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    // A few people use their sign-in from another company's HRIS here
    // (lib/companies.ts linkedSignIn): if that password is right there, it's
    // saved here too, and the sign-in is tried once more.
    if (error && currentCompany().linkedSignIn && (await adoptLinkedPassword(email, password))) {
      const retry = await supabase.auth.signInWithPassword({ email, password });
      return { session: retry.data.session, error: retry.error?.message ?? null };
    }
    return { session: data.session, error: error?.message ?? null };
  } catch {
    return { session: null, error: "Couldn't reach the login server. Check your connection and try again." };
  }
}

async function adoptLinkedPassword(email: string, password: string): Promise<boolean> {
  try {
    const res = await fetch("/api/auth/linked-sign-in", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-company": currentCompanyId() },
      body: JSON.stringify({ email, password }),
    });
    return res.ok;
  } catch {
    return false;
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
