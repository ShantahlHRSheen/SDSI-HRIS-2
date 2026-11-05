// turn-credentials: short-lived TURN credentials for calls and meetings, from
// Cloudflare Realtime TURN. Only signed-in employees of the company, and guests
// admitted to a live meeting, get them.
//
// Deploy:  supabase functions deploy turn-credentials
// Secrets: supabase secrets set CLOUDFLARE_TURN_KEY_ID=<TURN key ID> CLOUDFLARE_TURN_API_TOKEN=<API token>
//
// The key ID and token stay here (Edge Function secrets); the browser only
// ever receives credentials that expire (TTL below).

import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const TTL_SECONDS = 4 * 60 * 60;
const STUN = [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }];

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  // The caller's own session decides: an active employee of this company.
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return json({ error: "Sign in first." }, 401);
  const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false },
  });
  const { data: member, error: mErr } = await userClient.rpc("app_is_company_member");
  // Guests admitted to a live meeting (phase 79) may use the relay too.
  const guest = member === true ? null : await userClient.rpc("app_is_admitted_guest");
  if (mErr || (member !== true && guest?.data !== true)) return json({ error: "Only the company's employees and admitted guests can make calls." }, 403);

  const keyId = Deno.env.get("CLOUDFLARE_TURN_KEY_ID");
  const token = Deno.env.get("CLOUDFLARE_TURN_API_TOKEN");
  if (!keyId || !token) return json({ iceServers: STUN, turn: false, note: "TURN secrets not set" });

  const res = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(keyId)}/credentials/generate-ice-servers`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ ttl: TTL_SECONDS }),
  });
  if (!res.ok) return json({ iceServers: STUN, turn: false, note: `Cloudflare TURN error ${res.status}` });
  const data = await res.json();
  // { iceServers: [...] } (generate-ice-servers) or { iceServers: {...} } (older generate).
  const cf = Array.isArray(data.iceServers) ? data.iceServers : data.iceServers ? [data.iceServers] : [];
  return json({ iceServers: [...STUN, ...cf], turn: cf.length > 0, ttl: TTL_SECONDS });
});
