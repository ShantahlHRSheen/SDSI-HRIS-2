import { getSupabaseClient } from "./client";

// Example typed queries demonstrating how pages will eventually read from
// Supabase instead of lib/store.tsx's localStorage state. Not called from
// anywhere in the app yet — safe to extend/delete as the real migration
// takes shape.

export async function signInWithPassword(email: string, password: string) {
  const supabase = getSupabaseClient();
  return supabase.auth.signInWithPassword({ email, password });
}

export async function signOut() {
  const supabase = getSupabaseClient();
  return supabase.auth.signOut();
}

// Resolves the employees row for whoever is currently signed in, via the
// employees.user_id -> auth.users.id link. RLS already scopes this to "your
// own row or an elevated role can see everyone" — this just fetches it.
export async function getCurrentEmployee() {
  const supabase = getSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase.from("employees").select("*").eq("user_id", user.id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function getEmployees() {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.from("employees").select("*").order("last_name");
  if (error) throw error;
  return data;
}

export async function getAttendanceForPeriod(periodId: string) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("attendance_period_records")
    .select("*")
    .eq("period_id", periodId);
  if (error) throw error;
  return data;
}

export async function getPayrollPeriods() {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("payroll_periods")
    .select("*")
    .order("period_start");
  if (error) throw error;
  return data;
}
