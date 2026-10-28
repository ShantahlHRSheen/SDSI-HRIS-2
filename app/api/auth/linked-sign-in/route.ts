import { createClient } from "@supabase/supabase-js";
import { COMPANIES } from "@/lib/companies";
import { companyFromRequest, getAdminClient } from "@/lib/server/supabase-admin";

// POST { email, password } — called by the sign-in page after a password is
// rejected (lib/supabase/auth.ts). For the few people a company lists in
// linkedSignIn (lib/companies.ts), the password is checked against the other
// company's database instead; if it's right there, it becomes their password
// here too (creating their login here if they don't have one yet), so the
// sign-in can be retried. Every failure gives the same answer, so this can't
// be used to find out who is on the list.
const failed = () => Response.json({ error: "Invalid login credentials" }, { status: 401 });

export async function POST(request: Request) {
  try {
    return await adoptLinkedPassword(request);
  } catch {
    return failed();
  }
}

async function adoptLinkedPassword(request: Request): Promise<Response> {
  const companyId = companyFromRequest(request);
  const linked = COMPANIES[companyId].linkedSignIn;
  if (!linked?.length) return failed();

  const body = (await request.json().catch(() => ({}))) as { email?: unknown; password?: unknown };
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!email || !password) return failed();

  let admin;
  try {
    admin = getAdminClient(companyId);
  } catch {
    return failed();
  }
  const { data: employee } = await admin
    .from("employees")
    .select("id, user_id, employee_number, status")
    .ilike("email", email.replace(/[\\%_]/g, (c) => `\\${c}`))
    .in("employee_number", linked.flatMap((l) => l.employeeNumbers))
    .maybeSingle();
  if (!employee || employee.status === "resigned" || employee.status === "terminated") return failed();

  // Check the password against the other company's database, on a throwaway
  // client. Signing out "local" ends only this check's session, not theirs.
  const from = linked.find((l) => l.employeeNumbers.includes(employee.employee_number))?.from;
  if (!from) return failed();
  const source = COMPANIES[from];
  if (!source.supabaseUrl || !source.supabaseAnonKey) return failed();
  const verifier = createClient(source.supabaseUrl, source.supabaseAnonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: verified, error: verifyError } = await verifier.auth.signInWithPassword({ email, password });
  if (verifyError || !verified.session) return failed();
  await verifier.auth.signOut({ scope: "local" });

  if (employee.user_id) {
    const { data: existing, error: getErr } = await admin.auth.admin.getUserById(employee.user_id);
    if (getErr || !existing.user || existing.user.email?.toLowerCase() !== email) return failed();
    const { error } = await admin.auth.admin.updateUserById(employee.user_id, {
      password,
      app_metadata: { ...existing.user.app_metadata, must_change_password: false },
    });
    return error ? failed() : Response.json({ ok: true });
  }

  const { data: created, error: createErr } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (createErr || !created.user) return failed();
  // The on_auth_user_created trigger links by email; link explicitly as well.
  await admin.from("employees").update({ user_id: created.user.id }).eq("id", employee.id);
  return Response.json({ ok: true });
}
