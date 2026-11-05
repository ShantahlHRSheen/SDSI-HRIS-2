import { randomBytes, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { companyDatabase, companyFromRequest, getAdminClient } from "@/lib/server/supabase-admin";

// Guests in meetings (phase 79). POST { code, name } — anyone with a live
// meeting's link: makes a temporary guest login (app_metadata.guest), puts
// it in the meeting's waiting room, and returns its session. DELETE (with
// the guest's own token): the guest leaves; the login is deleted.
// Guest logins can't read anything else in the HRIS ("no guests" policies).

const MAX_GUESTS = 30;
const LIVE_MS = 12 * 60 * 60_000;

export async function POST(request: Request) {
  const company = companyFromRequest(request);
  let admin, db;
  try {
    admin = getAdminClient(company);
    db = companyDatabase(company);
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
  const body = (await request.json().catch(() => ({}))) as { code?: unknown; name?: unknown };
  const code = typeof body.code === "string" ? body.code.trim().toLowerCase() : "";
  const name = typeof body.name === "string" ? body.name.replace(/\s+/g, " ").trim().slice(0, 60) : "";
  if (!/^[0-9a-z]{3}-[0-9a-z]{4}-[0-9a-z]{3}$/.test(code)) return Response.json({ error: "That isn't a meeting link." }, { status: 400 });
  if (name.length < 2) return Response.json({ error: "Type your name so the host knows who you are." }, { status: 400 });

  const { data: meeting } = await admin.from("meetings").select("id, title, started_at, created_at, ended_at").eq("code", code).maybeSingle();
  const started = meeting ? new Date(meeting.started_at ?? meeting.created_at).getTime() : 0;
  if (!meeting || meeting.ended_at || Date.now() - started > LIVE_MS) return Response.json({ error: "This meeting has ended, or the link is wrong." }, { status: 404 });
  const { count } = await admin.from("meeting_guests").select("user_id", { count: "exact", head: true }).eq("meeting_id", meeting.id).in("status", ["waiting", "admitted"]);
  if ((count ?? 0) >= MAX_GUESTS) return Response.json({ error: "This meeting has too many guests waiting. Ask the host." }, { status: 429 });

  const email = `guest-${randomUUID()}@guests.hris.invalid`;
  const password = randomBytes(24).toString("base64url");
  const { data: created, error: cErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { guest: true, meeting_id: meeting.id },
    user_metadata: { name },
  });
  if (cErr || !created.user) return Response.json({ error: cErr?.message ?? "Couldn't make a guest pass." }, { status: 500 });

  const { error: gErr } = await admin.from("meeting_guests").insert({ user_id: created.user.id, meeting_id: meeting.id, name });
  if (gErr) {
    await admin.auth.admin.deleteUser(created.user.id);
    return Response.json({ error: gErr.message }, { status: 500 });
  }
  const anon = createClient(db.url, db.anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: signed, error: sErr } = await anon.auth.signInWithPassword({ email, password });
  if (sErr || !signed.session) {
    await admin.auth.admin.deleteUser(created.user.id);
    return Response.json({ error: sErr?.message ?? "Couldn't sign the guest in." }, { status: 500 });
  }
  return Response.json({
    meetingId: meeting.id,
    title: meeting.title,
    userId: created.user.id,
    accessToken: signed.session.access_token,
    refreshToken: signed.session.refresh_token,
  });
}

export async function DELETE(request: Request) {
  let admin;
  try {
    admin = getAdminClient(companyFromRequest(request));
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return Response.json({ error: "No guest pass." }, { status: 401 });
  const { data } = await admin.auth.getUser(token);
  const user = data.user;
  if (!user || user.app_metadata?.guest !== true) return Response.json({ error: "Not a guest pass." }, { status: 403 });
  await admin.from("meeting_guests").update({ status: "left" }).eq("user_id", user.id).in("status", ["waiting", "admitted"]);
  await admin.auth.admin.deleteUser(user.id);
  return Response.json({ ok: true });
}
