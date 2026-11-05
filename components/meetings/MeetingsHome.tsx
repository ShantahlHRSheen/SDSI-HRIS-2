"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight, Copy, Download, Film, Loader2, LogIn, Phone, Plus, Video } from "lucide-react";
import { Modal } from "@/components/Modal";
import { reportSaveError } from "@/lib/save-errors";
import { fileSize, personName } from "@/lib/chat";
import {
  createMeeting,
  downloadText,
  fetchMyMeetings,
  fetchNotes,
  fetchRecordings,
  isLive,
  loadRecording,
  meetingLink,
  notesMarkdown,
  parseMeetingCode,
  type Meeting,
  type MeetingNote,
  type Recording,
} from "@/lib/meetings";
import { useChat } from "@/components/chat/ChatProvider";
import { ChatAvatar } from "@/components/chat/ChatAvatar";

const when = (iso: string) => new Date(iso).toLocaleString("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
function duration(m: Meeting): string {
  if (!m.endedAt || !m.startedAt) return "";
  const mins = Math.max(1, Math.round((new Date(m.endedAt).getTime() - new Date(m.startedAt).getTime()) / 60_000));
  return mins >= 60 ? `${Math.floor(mins / 60)} h ${mins % 60} min` : `${mins} min`;
}

export function MeetingsHome() {
  const { me, people, photo } = useChat()!;
  const router = useRouter();
  const [meetings, setMeetings] = useState<Meeting[] | null>(null);
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, MeetingNote[]>>({});

  const load = useCallback(() => {
    fetchMyMeetings().then(
      (m) => {
        setMeetings(m);
        fetchRecordings(m.map((x) => x.id)).then(setRecordings, () => {});
      },
      (e) => setError(e instanceof Error ? e.message : "Couldn't load meetings."),
    );
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function startNew() {
    setBusy(true);
    try {
      const m = await createMeeting(title.trim() || "Meeting", null, "meeting");
      router.push(`/meetings/${m.code}?join=1`);
    } catch (e) {
      reportSaveError("Couldn't start the meeting", e);
      setBusy(false);
    }
  }

  function joinWithCode() {
    const c = parseMeetingCode(code);
    if (!c) return setCodeError("Enter a code like abc-defg-hij, or paste the meeting link.");
    router.push(`/meetings/${c}`);
  }

  function toggle(m: Meeting) {
    if (open === m.id) return setOpen(null);
    setOpen(m.id);
    if (!notes[m.id]) fetchNotes(m.id).then((n) => setNotes((cur) => ({ ...cur, [m.id]: n })), () => {});
  }

  const live = (meetings ?? []).filter(isLive);
  const past = (meetings ?? []).filter((m) => !isLive(m));

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-1)] p-4">
          <div className="mb-1 text-sm font-semibold text-[var(--text-primary)]">Start a meeting</div>
          <p className="mb-3 text-xs text-[var(--text-secondary)]">You get a code and link to share with co-workers.</p>
          <button onClick={() => setNewOpen(true)} className="flex items-center gap-1.5 rounded-lg bg-[var(--series-1)] px-3 py-2 text-sm font-medium text-[var(--on-accent)]">
            <Plus size={16} /> New meeting
          </button>
        </div>
        <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-1)] p-4">
          <div className="mb-1 text-sm font-semibold text-[var(--text-primary)]">Join with a code</div>
          <p className="mb-3 text-xs text-[var(--text-secondary)]">Type the code or paste the link someone sent you.</p>
          <div className="flex gap-2">
            <input
              value={code}
              onChange={(e) => {
                setCode(e.target.value);
                setCodeError(null);
              }}
              onKeyDown={(e) => e.key === "Enter" && joinWithCode()}
              placeholder="abc-defg-hij"
              className="min-w-0 flex-1 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-2 text-sm"
              aria-label="Meeting code"
            />
            <button onClick={joinWithCode} disabled={!code.trim()} className="flex items-center gap-1.5 rounded-lg border border-[var(--border-hairline)] px-3 py-2 text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--gridline)]/40 disabled:opacity-40">
              <LogIn size={16} /> Join
            </button>
          </div>
          {codeError && <div className="mt-1 text-xs text-[var(--status-critical)]">{codeError}</div>}
        </div>
      </div>
      <p className="text-xs text-[var(--text-muted)]">Calls and meetings work best with up to 10 people with cameras on. To call someone, open their chat in Messages and press the phone or video button.</p>

      <Modal open={newOpen} onClose={() => setNewOpen(false)} title="New meeting">
        <label className="block text-sm">
          <span className="mb-1 block text-[var(--text-secondary)]">Title</span>
          <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && startNew()} maxLength={120} placeholder="e.g. Payroll cut-off review" className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-2" />
        </label>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={() => setNewOpen(false)} className="rounded-lg border border-[var(--border-hairline)] px-3 py-2 text-sm text-[var(--text-secondary)]">
            Cancel
          </button>
          <button onClick={startNew} disabled={busy} className="rounded-lg bg-[var(--series-1)] px-3 py-2 text-sm font-medium text-[var(--on-accent)] disabled:opacity-40">
            {busy ? "Starting…" : "Start and join"}
          </button>
        </div>
      </Modal>

      {error && <div className="text-sm text-[var(--status-critical)]">{error}</div>}
      {meetings === null && !error && <div className="text-sm text-[var(--text-muted)]">Loading…</div>}

      {live.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-[var(--text-primary)]">Happening now</h2>
          <div className="space-y-2">
            {live.map((m) => (
              <div key={m.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--series-1)]/40 bg-[var(--series-1)]/5 p-3">
                <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-[var(--status-good)]" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-[var(--text-primary)]">{m.title}</div>
                  <div className="text-xs text-[var(--text-muted)]">
                    Started {when(m.startedAt ?? m.createdAt)} by {personName(people.get(m.hostId ?? ""))} · {m.code}
                  </div>
                </div>
                <button onClick={() => navigator.clipboard.writeText(meetingLink(m.code))} className="rounded-lg p-2 text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40" aria-label="Copy link" title="Copy link">
                  <Copy size={16} />
                </button>
                <button onClick={() => router.push(`/meetings/${m.code}`)} className="rounded-lg bg-[var(--series-1)] px-3 py-1.5 text-sm font-medium text-[var(--on-accent)]">
                  Join
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {meetings && (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-[var(--text-primary)]">Past meetings and calls</h2>
          {past.length === 0 && <div className="rounded-xl border border-dashed border-[var(--border-hairline)] p-6 text-center text-sm text-[var(--text-muted)]">No past meetings yet.</div>}
          <div className="space-y-2">
            {past.map((m) => {
              const recs = recordings.filter((r) => r.meetingId === m.id && r.partCount > 0);
              const joined = m.participants.filter((p) => p.joinedAt);
              const isOpen = open === m.id;
              const n = notes[m.id]?.filter((x) => x.kind !== "chat");
              return (
                <div key={m.id} className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-1)]">
                  <button onClick={() => toggle(m)} className="flex w-full items-center gap-3 p-3 text-left">
                    {isOpen ? <ChevronDown size={16} className="text-[var(--text-muted)]" /> : <ChevronRight size={16} className="text-[var(--text-muted)]" />}
                    {m.kind === "audio" ? <Phone size={16} className="text-[var(--series-1)]" /> : <Video size={16} className="text-[var(--series-1)]" />}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-[var(--text-primary)]">{m.title}</div>
                      <div className="text-xs text-[var(--text-muted)]">
                        {when(m.startedAt ?? m.createdAt)}
                        {duration(m) ? ` · ${duration(m)}` : ""}
                        {joined.length < 2 && m.kind !== "meeting" ? " · Missed" : ""}
                      </div>
                    </div>
                    <div className="hidden -space-x-2 sm:flex">
                      {joined.slice(0, 5).map((p) => (
                        <span key={p.employeeId} className="rounded-full ring-2 ring-[var(--surface-1)]" title={personName(people.get(p.employeeId))}>
                          <ChatAvatar name={personName(people.get(p.employeeId))} url={photo(p.employeeId)} size={26} />
                        </span>
                      ))}
                    </div>
                    {recs.length > 0 && <Film size={16} className="text-[var(--text-secondary)]" aria-label="Has a recording" />}
                  </button>
                  {isOpen && (
                    <div className="space-y-3 border-t border-[var(--border-hairline)] p-3">
                      <div className="text-xs text-[var(--text-secondary)]">
                        <span className="font-medium">Joined:</span> {joined.map((p) => personName(people.get(p.employeeId))).join(", ") || "—"}
                      </div>
                      <div>
                        <div className="mb-1 flex items-center justify-between">
                          <span className="text-xs font-semibold text-[var(--text-primary)] uppercase">Notes</span>
                          {n && n.length > 0 && (
                            <button
                              onClick={() => downloadText(`${m.title} notes.md`, notesMarkdown(m.title, when(m.startedAt ?? m.createdAt), n, (id) => personName(people.get(id ?? ""))))}
                              className="flex items-center gap-1 text-xs text-[var(--series-1)] hover:underline"
                            >
                              <Download size={12} /> Export Markdown
                            </button>
                          )}
                        </div>
                        {!n && <div className="text-xs text-[var(--text-muted)]">Loading…</div>}
                        {n?.length === 0 && <div className="text-xs text-[var(--text-muted)]">No notes.</div>}
                        <ul className="space-y-1">
                          {n?.map((x) => (
                            <li key={x.id} className="text-sm text-[var(--text-primary)]">
                              <span className="mr-1.5 text-xs text-[var(--text-muted)]">{x.kind === "action" ? (x.done ? "☑" : "☐") : x.kind === "decision" ? "Decision ·" : "•"}</span>
                              {x.body}
                            </li>
                          ))}
                        </ul>
                      </div>
                      {recs.length > 0 && (
                        <div>
                          <div className="mb-1 text-xs font-semibold text-[var(--text-primary)] uppercase">Recordings</div>
                          <div className="space-y-2">
                            {recs.map((r) => (
                              <RecordingItem key={r.id} rec={r} title={m.title} by={personName(people.get(r.recordedBy ?? ""))} mine={r.recordedBy === me} />
                            ))}
                          </div>
                          <p className="mt-1 text-[11px] text-[var(--text-muted)]">Recordings are deleted automatically after 60 days.</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

function RecordingItem({ rec, title, by }: { rec: Recording; title: string; by: string; mine: boolean }) {
  const [url, setUrl] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  useEffect(() => () => void (url && URL.revokeObjectURL(url)), [url]);
  async function load(): Promise<string | null> {
    if (url) return url;
    setProgress("Loading…");
    try {
      const blob = await loadRecording(rec, (d, t) => setProgress(`Loading part ${d} of ${t}…`));
      const u = URL.createObjectURL(blob);
      setUrl(u);
      return u;
    } catch (e) {
      reportSaveError("Couldn't load the recording", e);
      return null;
    } finally {
      setProgress(null);
    }
  }
  async function download() {
    const u = await load();
    if (!u) return;
    const a = document.createElement("a");
    a.href = u;
    a.download = `${title} recording.webm`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
  const mins = Math.max(1, Math.round(rec.durationSec / 60));
  return (
    <div className="rounded-lg border border-[var(--border-hairline)] p-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <Film size={16} className="text-[var(--series-1)]" />
        <span className="min-w-0 flex-1 text-sm text-[var(--text-primary)]">
          {mins} min · {fileSize(rec.sizeBytes)} <span className="text-xs text-[var(--text-muted)]">· recorded by {by}{rec.finishedAt ? "" : " · incomplete"}</span>
        </span>
        {!url && (
          <button onClick={load} disabled={!!progress} className="rounded-lg border border-[var(--border-hairline)] px-2.5 py-1 text-xs text-[var(--text-primary)] hover:bg-[var(--gridline)]/40">
            Play
          </button>
        )}
        <button onClick={download} disabled={!!progress} className="flex items-center gap-1 rounded-lg border border-[var(--border-hairline)] px-2.5 py-1 text-xs text-[var(--text-primary)] hover:bg-[var(--gridline)]/40">
          <Download size={12} /> Download
        </button>
      </div>
      {progress && (
        <div className="mt-1 flex items-center gap-1 text-xs text-[var(--text-muted)]">
          <Loader2 size={12} className="animate-spin" /> {progress}
        </div>
      )}
      {url && <video src={url} controls className="mt-2 max-h-80 w-full rounded-lg bg-black" />}
    </div>
  );
}
