import { createClient } from "@supabase/supabase-js";
import { COMPANY_ORDER } from "@/lib/companies";
import { companyDatabase } from "@/lib/server/supabase-admin";

// Daily (vercel.json): deletes meeting guest logins (app_metadata.guest)
// older than 12 hours — guests who closed the tab without leaving.
// Needs SUPABASE_SERVICE_ROLE_KEY (+ _LSMBIZ / _DARO) and CRON_SECRET.
const MAX_AGE_MS = 12 * 60 * 60_000;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const results: Record<string, number | string> = {};
  for (const id of COMPANY_ORDER) {
    let db;
    try {
      db = companyDatabase(id);
    } catch {
      continue;
    }
    const admin = createClient(db.url, db.serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    let removed = 0;
    for (let page = 1; page < 50; page++) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) {
        results[id] = error.message;
        break;
      }
      const users = data.users ?? [];
      for (const u of users) {
        if (u.app_metadata?.guest === true && Date.now() - new Date(u.created_at).getTime() > MAX_AGE_MS) {
          await admin.from("meeting_guests").update({ status: "left" }).eq("user_id", u.id).in("status", ["waiting", "admitted"]);
          const { error: dErr } = await admin.auth.admin.deleteUser(u.id);
          if (!dErr) removed++;
        }
      }
      if (users.length < 1000) break;
    }
    if (results[id] === undefined) results[id] = removed;
  }
  return Response.json(results);
}
