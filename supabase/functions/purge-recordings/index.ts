// purge-recordings: deletes meeting recordings older than
// chat_settings.recording_retention_days (phase 73), the files through the
// Storage API and then their rows. Called daily by pg_cron (phase 74).
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

  let deleted = 0;
  const failed: string[] = [];
  // Batches until none are left (rows whose file couldn't be removed are kept and skipped).
  for (let round = 0; round < 50; round++) {
    let q = admin.from("meeting_recordings").select("id, path").lt("created_at", cutoff).order("created_at").limit(BATCH);
    if (failed.length) q = q.not("path", "in", `(${failed.map((p) => `"${p.replace(/"/g, '\\"')}"`).join(",")})`);
    const { data: rows, error } = await q;
    if (error) return json({ error: error.message, deleted }, 500);
    if (!rows?.length) break;

    const { data: removed, error: rmErr } = await admin.storage.from("meeting-recordings").remove(rows.map((r) => r.path));
    if (rmErr) return json({ error: rmErr.message, deleted }, 500);
    // A file already gone counts as removed; only keep rows whose file still exists.
    const removedPaths = new Set((removed ?? []).map((o) => o.name));
    const stillThere = new Set<string>();
    if (removedPaths.size < rows.length) {
      for (const r of rows) {
        if (removedPaths.has(r.path)) continue;
        const folder = r.path.slice(0, r.path.lastIndexOf("/"));
        const file = r.path.slice(r.path.lastIndexOf("/") + 1);
        const { data: list } = await admin.storage.from("meeting-recordings").list(folder, { search: file });
        if (list?.some((o) => o.name === file)) stillThere.add(r.path);
      }
    }
    const ids = rows.filter((r) => !stillThere.has(r.path)).map((r) => r.id);
    failed.push(...stillThere);
    if (ids.length) {
      const { error: dErr } = await admin.from("meeting_recordings").delete().in("id", ids);
      if (dErr) return json({ error: dErr.message, deleted }, 500);
      deleted += ids.length;
    }
    if (rows.length < BATCH) break;
  }

  return json({ retentionDays: days, cutoff, deleted, failed });
});
