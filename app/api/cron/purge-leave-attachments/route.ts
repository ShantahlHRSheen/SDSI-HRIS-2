import { createClient } from "@supabase/supabase-js";

// Daily cleanup (scheduled in vercel.json): deletes leave-request files
// (signed leave forms, medical certificates) from storage 30 days after
// upload to free up space. The attachment record stays, with deleted_at set,
// so the app can show that the file was removed.
//
// Needs these environment variables on the server (Vercel > Settings >
// Environment Variables), never exposed to the browser:
//   SUPABASE_SERVICE_ROLE_KEY — storage deletes need the service role
//   CRON_SECRET               — Vercel sends it as a Bearer token on cron calls
const RETENTION_DAYS = 30;
const BUCKET = "leave-attachments";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return Response.json({ error: "NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not configured" }, { status: 500 });
  }

  const supabase = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data: expired, error } = await supabase
    .from("leave_request_attachments")
    .select("id, storage_path")
    .is("deleted_at", null)
    .lt("uploaded_at", cutoff)
    .limit(1000);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  let deleted = 0;
  const failures: string[] = [];
  for (let i = 0; i < expired.length; i += 100) {
    const batch = expired.slice(i, i + 100);
    // remove() skips paths that are already gone, so a retried batch is safe.
    const { error: rmErr } = await supabase.storage.from(BUCKET).remove(batch.map((a) => a.storage_path));
    if (rmErr) {
      failures.push(rmErr.message);
      continue;
    }
    const { error: markErr } = await supabase
      .from("leave_request_attachments")
      .update({ deleted_at: new Date().toISOString() })
      .in("id", batch.map((a) => a.id));
    if (markErr) failures.push(markErr.message);
    else deleted += batch.length;
  }

  return Response.json({ cutoff, expired: expired.length, deleted, failures }, { status: failures.length ? 500 : 200 });
}
