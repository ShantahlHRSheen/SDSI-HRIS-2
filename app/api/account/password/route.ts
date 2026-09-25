import { createClient } from "@supabase/supabase-js";
import { getAdminClient, getCaller, MIN_PASSWORD_LENGTH } from "@/lib/server/supabase-admin";

// POST { newPassword, currentPassword? } — the signed-in user changes their
// own password. currentPassword is required unless the account is flagged
// must_change_password (a temporary password HR just issued, which the user
// has just signed in with). Clears that flag on success.
export async function POST(request: Request) {
  let admin;
  try {
    admin = getAdminClient();
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
  const caller = await getCaller(request, admin);
  if (!caller) return Response.json({ error: "Please sign in again." }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as { newPassword?: unknown; currentPassword?: unknown };
  const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";
  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    return Response.json({ error: `Use at least ${MIN_PASSWORD_LENGTH} characters.` }, { status: 400 });
  }

  const mustChange = caller.user.app_metadata?.must_change_password === true;
  if (!mustChange) {
    const currentPassword = typeof body.currentPassword === "string" ? body.currentPassword : "";
    // Verify the current password on a throwaway client so no session is kept.
    const verifier = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error } = await verifier.auth.signInWithPassword({ email: caller.user.email ?? "", password: currentPassword });
    if (error) return Response.json({ error: "Your current password is incorrect." }, { status: 400 });
    if (currentPassword === newPassword) return Response.json({ error: "Choose a password different from your current one." }, { status: 400 });
  }

  const { error } = await admin.auth.admin.updateUserById(caller.user.id, {
    password: newPassword,
    app_metadata: { ...caller.user.app_metadata, must_change_password: false },
  });
  if (error) return Response.json({ error: error.message }, { status: 400 });
  return Response.json({ ok: true });
}
