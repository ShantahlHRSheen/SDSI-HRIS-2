import { generateTemporaryPassword, getAdminClient, getCaller, isHrAdmin } from "@/lib/server/supabase-admin";

// POST { employeeId } — HR/system admins only. Issues a temporary password
// for the employee's login (creating the login from their email on file if
// they don't have one yet) and flags it so they must choose their own
// password on next sign-in. The password is returned once, for HR to hand
// over; it isn't stored anywhere readable.
export async function POST(request: Request) {
  let admin;
  try {
    admin = getAdminClient();
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
  const caller = await getCaller(request, admin);
  if (!caller) return Response.json({ error: "Please sign in again." }, { status: 401 });
  if (!isHrAdmin(caller)) return Response.json({ error: "Only HR can reset passwords." }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as { employeeId?: unknown };
  const employeeId = typeof body.employeeId === "string" ? body.employeeId : "";
  const { data: employee, error: empErr } = await admin.from("employees").select("id, email, user_id").eq("id", employeeId).maybeSingle();
  if (empErr) return Response.json({ error: empErr.message }, { status: 500 });
  if (!employee) return Response.json({ error: "Employee not found." }, { status: 404 });

  const password = generateTemporaryPassword();

  if (employee.user_id) {
    const { data: existing, error: getErr } = await admin.auth.admin.getUserById(employee.user_id);
    if (getErr || !existing.user) return Response.json({ error: getErr?.message ?? "Login not found." }, { status: 500 });
    const { error } = await admin.auth.admin.updateUserById(employee.user_id, {
      password,
      app_metadata: { ...existing.user.app_metadata, must_change_password: true },
    });
    if (error) return Response.json({ error: error.message }, { status: 400 });
    return Response.json({ email: existing.user.email, password, created: false });
  }

  if (!employee.email) {
    return Response.json({ error: "This employee has no email on file — add one in Edit first." }, { status: 400 });
  }
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: employee.email,
    password,
    email_confirm: true,
    app_metadata: { must_change_password: true },
  });
  if (createErr || !created.user) return Response.json({ error: createErr?.message ?? "Could not create the login." }, { status: 400 });
  // The on_auth_user_created trigger links by email; link explicitly as well.
  const { error: linkErr } = await admin.from("employees").update({ user_id: created.user.id }).eq("id", employee.id);
  if (linkErr) return Response.json({ error: `Login created but not linked: ${linkErr.message}` }, { status: 500 });
  return Response.json({ email: employee.email, password, created: true });
}
