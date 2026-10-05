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
import { currentCompany } from "../companies";

// One client per company (each company has its own database); the app only
// ever talks to the company chosen at sign-in (lib/companies.ts).
const cached = new Map<string, SupabaseClient<Database>>();

export function getSupabaseClient(): SupabaseClient<Database> {
  const company = currentCompany();
  const hit = cached.get(company.id);
  if (hit) return hit;

  const url = company.supabaseUrl;
  const anonKey = company.supabaseAnonKey;
  if (!url || !anonKey) {
    throw new Error(`${company.name}'s database isn't connected yet — ask your admin to finish setup.`);
  }

  const client = createClient<Database>(url, anonKey);
  cached.set(company.id, client);
  return client;
}
