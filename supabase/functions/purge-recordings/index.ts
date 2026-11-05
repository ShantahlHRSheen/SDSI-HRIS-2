// purge-recordings: deletes meeting recordings older than
// chat_settings.recording_retention_days (phase 73): each recording's parts
// (phase 75) through the Storage API, then its row. Called daily by pg_cron (phase 74).
//
// Deploy:  supabase functions deploy purge-recordings --no-verify-jwt
// Secret:  supabase secrets set PURGE_RECORDINGS_SECRET=<random value>
//          (the same value goes in the Vault secret purge_recordings_secret)
//
// The caller must send that value in the x-cron-secret header. The service
// role key is provided to Edge Functions by Supabase; it never leaves here.

import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const BATCH = 100;

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const expected = Deno.env.get("PURGE_RECORDINGS_SECRET") ?? "";
  const given = req.headers.get("x-cron-secret") ?? "";
  if (!expected || !safeEqual(given, expected)) return json({ error: "Not allowed" }, 401);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

  const { data: settings, error: sErr } = await admin.from("chat_settings").select("recording_retention_days").maybeSingle();
  if (sErr) return json({ error: sErr.message }, 500);
  const days = Number(settings?.recording_retention_days ?? 60);
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();

  // Each recording is a folder of parts: <meeting id>/<recording id>/0001.webm, ...
  let deleted = 0;
  const failed: string[] = [];
  const bucket = admin.storage.from("meeting-recordings");
  for (let round = 0; round < 50; round++) {
    let q = admin.from("meeting_recordings").select("id, path").lt("created_at", cutoff).order("created_at").limit(BATCH);
    if (failed.length) q = q.not("id", "in", `(${failed.join(",")})`);
    const { data: rows, error } = await q;
    if (error) return json({ error: error.message, deleted }, 500);
    if (!rows?.length) break;

    const done: string[] = [];
    for (const r of rows) {
      const { data: parts, error: lErr } = await bucket.list(r.path, { limit: 1000 });
      if (lErr) {
        failed.push(r.id);
        continue;
      }
      const names = (parts ?? []).filter((o) => o.id).map((o) => `${r.path}/${o.name}`);
      if (names.length) {
        const { error: rmErr } = await bucket.remove(names);
        if (rmErr) {
          failed.push(r.id);
          continue;
        }
      }
      done.push(r.id);
    }
    if (done.length) {
      const { error: dErr } = await admin.from("meeting_recordings").delete().in("id", done);
      if (dErr) return json({ error: dErr.message, deleted }, 500);
      deleted += done.length;
    }
    if (rows.length < BATCH) break;
  }

  return json({ retentionDays: days, cutoff, deleted, failed });
});
