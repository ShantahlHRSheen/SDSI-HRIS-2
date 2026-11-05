import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient } from "./supabase/client";
import { currentCompany } from "./companies";

// Meetings and calls (phases 73, 75, 76). Media goes browser to browser
// (WebRTC mesh); the database keeps who's in each meeting, its notes and
// recordings. Signaling runs on the private Realtime channel meeting:<id>.

const db = () => getSupabaseClient() as unknown as SupabaseClient;
const recordings = () => db().storage.from("meeting-recordings");

const SETUP = "Meetings isn't set up yet — ask HR to run the latest database update.";
const friendly = (msg: string) => (/meeting/i.test(msg) && /exist|find|not found|schema cache/i.test(msg) ? SETUP : msg);
const fail = (e: { message: string } | null) => {
  if (e) throw new Error(friendly(e.message));
};
type Row = Record<string, unknown>;

export type MeetingKind = "meeting" | "audio" | "video";
export interface Meeting {
  id: string;
  code: string;
  title: string;
  hostId: string | null;
  conversationId: string | null;
  kind: MeetingKind;
  createdAt: string;
  startedAt: string | null;
  endedAt: string | null;
  participants: { employeeId: string; role: "host" | "participant"; joinedAt: string | null; leftAt: string | null }[];
}
export type NoteKind = "note" | "action" | "decision" | "chat";
export interface MeetingNote {
  id: string;
  meetingId: string;
  authorId: string | null;
  kind: NoteKind;
  body: string;
  done: boolean;
  createdAt: string;
}
export interface Recording {
  id: string;
  meetingId: string;
  path: string;
  partCount: number;
  sizeBytes: number;
  durationSec: number;
  mimeType: string;
  recordedBy: string | null;
  createdAt: string;
  finishedAt: string | null;
}

// A meeting left open for this long is shown as ended.
export const STALE_MS = 12 * 60 * 60_000;
export const isLive = (m: Pick<Meeting, "endedAt" | "startedAt" | "createdAt">) =>
  !m.endedAt && Date.now() - new Date(m.startedAt ?? m.createdAt).getTime() < STALE_MS;

const toMeeting = (r: Row): Meeting => ({
  id: String(r.id),
  code: String(r.code),
  title: String(r.title ?? "Meeting"),
  hostId: (r.host_id as string | null) ?? null,
  conversationId: (r.conversation_id as string | null) ?? null,
  kind: (r.kind as MeetingKind) ?? "meeting",
  createdAt: String(r.created_at ?? ""),
  startedAt: (r.started_at as string | null) ?? null,
  endedAt: (r.ended_at as string | null) ?? null,
  participants: ((r.meeting_participants as Row[]) ?? []).map((p) => ({
    employeeId: String(p.employee_id),
    role: p.role as "host" | "participant",
    joinedAt: (p.joined_at as string | null) ?? null,
    leftAt: (p.left_at as string | null) ?? null,
  })),
});
export const toNote = (r: Row): MeetingNote => ({
  id: String(r.id),
  meetingId: String(r.meeting_id),
  authorId: (r.author_id as string | null) ?? null,
  kind: r.kind as NoteKind,
  body: String(r.body ?? ""),
  done: !!r.done,
  createdAt: String(r.created_at ?? ""),
});
const toRecording = (r: Row): Recording => ({
  id: String(r.id),
  meetingId: String(r.meeting_id),
  path: String(r.path),
  partCount: Number(r.part_count ?? 0),
  sizeBytes: Number(r.size_bytes ?? 0),
  durationSec: Number(r.duration_sec ?? 0),
  mimeType: String(r.mime_type ?? "video/webm"),
  recordedBy: (r.recorded_by as string | null) ?? null,
  createdAt: String(r.created_at ?? ""),
  finishedAt: (r.finished_at as string | null) ?? null,
});

const MEETING_COLS = "id, code, title, host_id, conversation_id, kind, created_at, started_at, ended_at, meeting_participants(employee_id, role, joined_at, left_at)";

// ---- Meetings -------------------------------------------------------------------------

export async function createMeeting(title: string, conversationId: string | null, kind: MeetingKind): Promise<{ id: string; code: string }> {
  const { data, error } = await db().rpc("meeting_create", { p_title: title, p_conversation: conversationId, p_kind: kind });
  fail(error);
  return data as { id: string; code: string };
}

export async function joinMeeting(code: string): Promise<string> {
  const { data, error } = await db().rpc("meeting_join", { p_code: code });
  fail(error);
  return String(data);
}

export async function leaveMeeting(id: string): Promise<boolean> {
  const { data, error } = await db().rpc("meeting_leave", { p_meeting: id });
  fail(error);
  return data === true;
}

// When the tab closes: leave without waiting for an answer.
export async function leaveMeetingOnUnload(id: string, accessToken: string) {
  const c = currentCompany();
  if (!c.supabaseUrl || !c.supabaseAnonKey) return;
  fetch(`${c.supabaseUrl}/rest/v1/rpc/meeting_leave`, {
    method: "POST",
    keepalive: true,
    headers: { apikey: c.supabaseAnonKey, Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ p_meeting: id }),
  }).catch(() => {});
}

// Adds co-workers to a meeting (phase 78) so they can see it, join and be rung.
export async function inviteToMeeting(id: string, members: string[]): Promise<number> {
  const { data, error } = await db().rpc("meeting_invite", { p_meeting: id, p_members: members });
  fail(error);
  return Number(data ?? 0);
}

export async function endMeeting(id: string): Promise<void> {
  const { error } = await db().rpc("meeting_end", { p_meeting: id });
  fail(error);
}

export async function fetchMeetingByCode(code: string): Promise<Meeting | null> {
  const { data, error } = await db().from("meetings").select(MEETING_COLS).eq("code", code.trim().toLowerCase()).maybeSingle();
  fail(error);
  return data ? toMeeting(data as Row) : null;
}

export async function fetchMyMeetings(): Promise<Meeting[]> {
  const { data, error } = await db().from("meetings").select(MEETING_COLS).order("created_at", { ascending: false }).limit(100);
  fail(error);
  return ((data as Row[]) ?? []).map(toMeeting);
}

// "kqx-wmtp-zra", or a pasted meeting link.
export function parseMeetingCode(input: string): string | null {
  const m = /([0-9a-z]{3}-[0-9a-z]{4}-[0-9a-z]{3})/i.exec(input.trim());
  return m ? m[1].toLowerCase() : null;
}
export const meetingLink = (code: string) => `${typeof window !== "undefined" ? window.location.origin : ""}/meetings/${code}`;

// ---- Notes ----------------------------------------------------------------------------

export async function fetchNotes(meetingId: string): Promise<MeetingNote[]> {
  const { data, error } = await db().from("meeting_notes").select("*").eq("meeting_id", meetingId).order("created_at");
  fail(error);
  return ((data as Row[]) ?? []).map(toNote);
}
export async function addNote(meetingId: string, me: string, kind: NoteKind, body: string): Promise<MeetingNote> {
  const { data, error } = await db().from("meeting_notes").insert({ meeting_id: meetingId, author_id: me, kind, body: body.trim().slice(0, 4000) }).select("*").single();
  fail(error);
  return toNote(data as Row);
}
export async function setNoteDone(id: string, done: boolean): Promise<void> {
  const { error } = await db().from("meeting_notes").update({ done, updated_at: new Date().toISOString() }).eq("id", id);
  fail(error);
}
export async function deleteNote(id: string): Promise<void> {
  const { error } = await db().from("meeting_notes").delete().eq("id", id);
  fail(error);
}

export function notesMarkdown(title: string, when: string, notes: MeetingNote[], name: (id: string | null) => string): string {
  const pick = (k: NoteKind) => notes.filter((n) => n.kind === k);
  const lines = [`# ${title}`, "", `_${when}_`, ""];
  const decisions = pick("decision");
  const actions = pick("action");
  const plain = pick("note");
  if (decisions.length) lines.push("## Decisions", ...decisions.map((n) => `- ${n.body}`), "");
  if (actions.length) lines.push("## Action items", ...actions.map((n) => `- [${n.done ? "x" : " "}] ${n.body}`), "");
  if (plain.length) lines.push("## Notes", ...plain.map((n) => `- ${n.body} — ${name(n.authorId)}`), "");
  if (!decisions.length && !actions.length && !plain.length) lines.push("_No notes._", "");
  return lines.join("\n");
}

export function downloadText(name: string, text: string, type = "text/markdown") {
  const href = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = href;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 10_000);
}

// ---- Recordings -----------------------------------------------------------------------
// A recording is uploaded in parts of about 45 MB while the meeting goes on:
// meeting-recordings/<meeting id>/<recording id>/0001.webm, 0002.webm, ...

export const PART_BYTES = 45 * 1024 * 1024;

export async function startRecording(meetingId: string, me: string, mimeType: string): Promise<Recording> {
  const id = crypto.randomUUID();
  const { data, error } = await db()
    .from("meeting_recordings")
    .insert({ id, meeting_id: meetingId, path: `${meetingId}/${id}`, recorded_by: me, mime_type: mimeType.split(";")[0] })
    .select("*")
    .single();
  fail(error);
  return toRecording(data as Row);
}

export async function uploadRecordingPart(rec: Recording, index: number, blob: Blob): Promise<void> {
  const name = `${rec.path}/${String(index).padStart(4, "0")}.webm`;
  const type = rec.mimeType || "video/webm";
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const { error } = await recordings().upload(name, blob, { contentType: type, upsert: true });
    if (!error) return;
    lastErr = error;
    await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
  }
  throw new Error(friendly((lastErr as { message?: string })?.message ?? "Couldn't upload the recording."));
}

export async function updateRecording(id: string, patch: { partCount: number; sizeBytes: number; durationSec: number; finished?: boolean }): Promise<void> {
  const { error } = await db()
    .from("meeting_recordings")
    .update({ part_count: patch.partCount, size_bytes: patch.sizeBytes, duration_sec: patch.durationSec, ...(patch.finished ? { finished_at: new Date().toISOString() } : {}) })
    .eq("id", id);
  fail(error);
}

export async function fetchRecordings(meetingIds: string[]): Promise<Recording[]> {
  if (!meetingIds.length) return [];
  const { data, error } = await db().from("meeting_recordings").select("*").in("meeting_id", meetingIds).order("created_at");
  fail(error);
  return ((data as Row[]) ?? []).map(toRecording);
}

// Deletes a recording: its parts, then its row (the recorder, the host, or HR — phase 77).
export async function deleteRecording(rec: Recording): Promise<void> {
  const { data: list, error } = await recordings().list(rec.path, { limit: 1000 });
  fail(error);
  const names = (list ?? []).filter((o) => o.id).map((o) => `${rec.path}/${o.name}`);
  if (names.length) {
    const { data: removed, error: rmErr } = await recordings().remove(names);
    fail(rmErr);
    if ((removed ?? []).length < names.length) throw new Error("You can't delete this recording — only the person who recorded it, the meeting's host or HR can.");
  }
  const { data, error: dErr } = await db().from("meeting_recordings").delete().eq("id", rec.id).select("id");
  fail(dErr);
  if (!(data as Row[] | null)?.length) throw new Error("You can't delete this recording — only the person who recorded it, the meeting's host or HR can.");
}

// Downloads the parts in order and joins them into one file.
export async function loadRecording(rec: Recording, onProgress?: (done: number, total: number) => void): Promise<Blob> {
  const { data: list, error } = await recordings().list(rec.path, { limit: 1000, sortBy: { column: "name", order: "asc" } });
  fail(error);
  const names = (list ?? []).filter((o) => o.id).map((o) => o.name).sort();
  if (!names.length) throw new Error("This recording has no saved parts.");
  const parts: Blob[] = [];
  for (let i = 0; i < names.length; i++) {
    const { data, error: dErr } = await recordings().download(`${rec.path}/${names[i]}`);
    fail(dErr);
    parts.push(data!);
    onProgress?.(i + 1, names.length);
  }
  return new Blob(parts, { type: rec.mimeType || "video/webm" });
}

// ---- Ringing --------------------------------------------------------------------------
// Sent to someone's own channel (user:<employee id>) through Realtime's
// broadcast endpoint; the policies let you reach people you share a chat with.

export type CallSignal =
  | { type: "invite"; meetingId: string; code: string; media: "audio" | "video"; conversationId: string; from: string; title: string; kind?: "call" | "meeting" }
  | { type: "cancel"; meetingId: string; from: string }
  | { type: "decline"; meetingId: string; from: string }
  | { type: "answered"; meetingId: string; from: string };

export async function sendToUser(employeeId: string, signal: CallSignal): Promise<void> {
  const c = currentCompany();
  const { data } = await getSupabaseClient().auth.getSession();
  const token = data.session?.access_token;
  if (!c.supabaseUrl || !c.supabaseAnonKey || !token) return;
  await fetch(`${c.supabaseUrl}/realtime/v1/api/broadcast`, {
    method: "POST",
    headers: { apikey: c.supabaseAnonKey, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messages: [{ topic: `user:${employeeId}`, event: "call", payload: signal, private: true }] }),
  }).catch(() => {});
}

// ---- ICE servers ----------------------------------------------------------------------

const STUN: RTCIceServer[] = [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }];
let iceCache: { servers: RTCIceServer[]; at: number } | null = null;

// Google STUN, plus Cloudflare TURN from the turn-credentials function when
// it's deployed (falls back to STUN only).
export async function iceServers(): Promise<RTCIceServer[]> {
  if (iceCache && Date.now() - iceCache.at < 60 * 60_000) return iceCache.servers;
  try {
    const { data, error } = await db().functions.invoke("turn-credentials", { body: {} });
    if (error) throw error;
    const servers = (data as { iceServers?: RTCIceServer[] })?.iceServers;
    if (servers?.length) {
      iceCache = { servers, at: Date.now() };
      return servers;
    }
  } catch {
    // Not deployed yet, or offline: direct connections still work on most networks.
  }
  return STUN;
}

// Video quality by meeting size.
export function qualityFor(people: number): { height: number; width: number; maxBitrate: number; label: string } {
  if (people <= 3) return { width: 1280, height: 720, maxBitrate: 1_500_000, label: "720p" };
  if (people <= 6) return { width: 854, height: 480, maxBitrate: 600_000, label: "480p" };
  return { width: 640, height: 360, maxBitrate: 300_000, label: "360p" };
}
