import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";

// Not wired into the app yet — lib/store.tsx (localStorage) is still the
// active data layer. This exists so the Supabase migration can be built up
// and tested independently before any page switches over. See
// supabase/schema.sql for the table definitions this client talks to.
//
// Needs NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in
// .env.local (see .env.local.example) — both are safe to expose client-side;
// access control is enforced by the RLS policies in supabase/schema.sql, not
// by keeping this key secret.
let cached: SupabaseClient<Database> | null = null;

export function getSupabaseClient(): SupabaseClient<Database> {
  if (cached) return cached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      "Supabase is not configured — set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local."
    );
  }

  cached = createClient<Database>(url, anonKey);
  return cached;
}
