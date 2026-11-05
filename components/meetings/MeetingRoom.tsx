"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Check,
  Circle,
  Copy,
  Download,
  Hand,
  Loader2,
  MessageSquare,
  Mic,
  MicOff,
  MonitorUp,
  MonitorX,
  NotebookPen,
  PhoneOff,
  Settings,
  Signal,
  SignalLow,
  SignalMedium,
  SmilePlus,
  Square,
  Trash2,
  Users,
  Video,
  VideoOff,
  X,
} from "lucide-react";
import { getSupabaseClient } from "@/lib/supabase/client";
import { reportSaveError } from "@/lib/save-errors";
import { personName } from "@/lib/chat";
import { MeshRoom, type LinkQuality, type MemberState, type RemotePeer } from "@/lib/mesh";
import { MeetingRecorder, type RecordTile } from "@/lib/meeting-recorder";
import { startRingback } from "@/lib/tones";
import {
  addNote,
  deleteNote,
  downloadText,
  endMeeting,
  fetchMeetingByCode,
  fetchNotes,
  iceServers,
  isLive,
  joinMeeting,
  leaveMeeting,
  leaveMeetingOnUnload,
  loadRecording,
  meetingLink,
  notesMarkdown,
  qualityFor,
  sendToUser,
  setNoteDone,
  toNote,
  type Meeting,
  type MeetingNote,
  type NoteKind,
  type Recording,
} from "@/lib/meetings";
import { CALL_EVENT, useChat } from "@/components/chat/ChatProvider";
import { ChatAvatar } from "@/components/chat/ChatAvatar";
import type { CallSignal } from "@/lib/meetings";

const RING_MS = 45_000;
const REACTIONS = ["👍", "👏", "😂", "❤️", "🎉", "😮"];
const BIG_MEETING = 10;

type Phase = "loading" | "lobby" | "joining" | "in" | "ended" | "error";
interface Snap {
  remotes: RemotePeer[];
  me: MemberState;
  local: MediaStream;
  localVideoId: string | null;
  count: number;
  quality: LinkQuality;
}
interface Tile {
  key: string;
  employeeId: string;
  name: string;
  stream: MediaStream;
  videoId: string | null;
  state: MemberState;
  quality: LinkQuality;
  isMe: boolean;
}

async function getMic(deviceId?: string): Promise<MediaStreamTrack | null> {
  try {
    const s = await navigator.mediaDevices.getUserMedia({ audio: deviceId ? { deviceId: { exact: deviceId }, echoCancellation: true, noiseSuppression: true } : { echoCancellation: true, noiseSuppression: true } });
    return s.getAudioTracks()[0] ?? null;
  } catch {
    return null;
  }
}
async function getCam(deviceId: string | undefined, people: number): Promise<MediaStreamTrack | null> {
  const q = qualityFor(people);
  try {
    const s = await navigator.mediaDevices.getUserMedia({ video: { ...(deviceId ? { deviceId: { exact: deviceId } } : {}), width: { ideal: q.width }, height: { ideal: q.height }, frameRate: { ideal: 24 } } });
    return s.getVideoTracks()[0] ?? null;
  } catch {
    return null;
  }
}

function QualityIcon({ q, size = 14 }: { q: LinkQuality; size?: number }) {
  const label = q === "good" ? "Good connection" : q === "fair" ? "Fair connection" : q === "poor" ? "Weak connection" : "Connecting…";
  const color = q === "good" ? "var(--status-good)" : q === "fair" ? "var(--status-warning)" : q === "poor" ? "var(--status-critical)" : "var(--text-muted)";
  const Icon = q === "good" ? Signal : q === "fair" ? SignalMedium : SignalLow;
  return (
    <span title={label} aria-label={label} style={{ color }} className="inline-flex">
      <Icon size={size} />
    </span>
  );
}

function VideoEl({ stream, videoId, muted, mirror, hidden, contain }: { stream: MediaStream; videoId: string | null; muted: boolean; mirror: boolean; hidden: boolean; contain: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    if (v.srcObject !== stream) v.srcObject = stream;
    v.play().catch(() => {});
  }, [stream, videoId]);
  return (
    <video
      ref={ref}
      autoPlay
      playsInline
      muted={muted}
      className={`absolute inset-0 h-full w-full ${contain ? "object-contain" : "object-cover"} ${mirror ? "-scale-x-100" : ""} ${hidden ? "invisible" : ""}`}
    />
  );
}

// How loud each person is; the loudest speaker is highlighted.
function useSpeakers(entries: { key: string; stream: MediaStream; audioId: string | null }[]) {
  const [active, setActive] = useState<string | null>(null);
  const sig = entries.map((e) => `${e.key}:${e.audioId}`).join("|");
  const entriesRef = useRef(entries);
  useEffect(() => {
    entriesRef.current = entries;
  });
  useEffect(() => {
    let ctx: AudioContext;
    try {
      ctx = new AudioContext();
    } catch {
      return;
    }
    const nodes = entriesRef.current
      .filter((e) => e.audioId)
      .map((e) => {
        const track = e.stream.getAudioTracks()[0];
        const src = ctx.createMediaStreamSource(new MediaStream([track]));
        const an = ctx.createAnalyser();
        an.fftSize = 512;
        src.connect(an);
        return { key: e.key, an, buf: new Uint8Array(an.fftSize) };
      });
    let last: { key: string; at: number } | null = null;
    const t = window.setInterval(() => {
      if (ctx.state === "suspended") ctx.resume().catch(() => {});
      let best: { key: string; level: number } | null = null;
      for (const n of nodes) {
        n.an.getByteTimeDomainData(n.buf);
        let sum = 0;
        for (const v of n.buf) sum += (v - 128) * (v - 128);
        const level = Math.sqrt(sum / n.buf.length);
        if (level > 6 && (!best || level > best.level)) best = { key: n.key, level };
      }
      const now = Date.now();
      if (best) last = { key: best.key, at: now };
      setActive(last && now - last.at < 1500 ? last.key : null);
    }, 300);
    return () => {
      window.clearInterval(t);
      ctx.close().catch(() => {});
    };
  }, [sig]);
  return active;
}

export function MeetingRoom({ code, autoJoin }: { code: string; autoJoin: boolean }) {
  const chat = useChat()!;
  const { me, people, photo, setInMeeting } = chat;
  const router = useRouter();
  const nameOf = useCallback((id: string | null | undefined) => personName(people.get(id ?? "")), [people]);

  const [phase, setPhase] = useState<Phase>("loading");
  const [error, setError] = useState<string | null>(null);
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [room, setRoom] = useState<MeshRoom | null>(null);
  const [snap, setSnap] = useState<Snap | null>(null);
  const [notes, setNotes] = useState<MeetingNote[]>([]);
  const [panel, setPanel] = useState<"people" | "notes" | "chat" | null>(null);
  const [reactions, setReactions] = useState<{ id: number; sid: string; emoji: string }[]>([]);
  const [showReactions, setShowReactions] = useState(false);
  const [showDevices, setShowDevices] = useState(false);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [micId, setMicId] = useState<string>("");
  const [camId, setCamId] = useState<string>("");
  const [recorder, setRecorder] = useState<MeetingRecorder | null>(null);
  const [recBusy, setRecBusy] = useState(false);
  const [savedRec, setSavedRec] = useState<Recording | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [declined, setDeclined] = useState<string[]>([]);
  const [now, setNow] = useState(() => Date.now());
  // Lobby choices and preview.
  const [wantMic, setWantMic] = useState(true);
  const [wantCam, setWantCam] = useState(true);
  const [preview, setPreview] = useState<MediaStream | null>(null);

  const roomRef = useRef<MeshRoom | null>(null);
  const tokenRef = useRef<string | null>(null);
  const meetingRef = useRef<Meeting | null>(null);
  const everJoinedRef = useRef(false);
  const leftRef = useRef(false);
  const recorderRef = useRef<MeetingRecorder | null>(null);
  const camWasOnRef = useRef(false);

  useEffect(() => {
    meetingRef.current = meeting;
    recorderRef.current = recorder;
  }, [meeting, recorder]);

  // ---- Load ---------------------------------------------------------------------------

  useEffect(() => {
    let live = true;
    fetchMeetingByCode(code).then(
      (m) => {
        if (!live) return;
        setMeeting(m);
        if (m && !isLive(m)) setPhase("ended");
        else {
          if (m?.kind === "audio") setWantCam(false);
          setPhase(autoJoin ? "joining" : "lobby");
        }
      },
      (e) => {
        if (!live) return;
        setError(e instanceof Error ? e.message : "Couldn't open the meeting.");
        setPhase("error");
      },
    );
    return () => {
      live = false;
    };
  }, [code, autoJoin]);

  // Lobby preview.
  useEffect(() => {
    if (phase !== "lobby") return;
    let stream: MediaStream | null = null;
    let live = true;
    (async () => {
      const tracks: MediaStreamTrack[] = [];
      if (wantCam) {
        const t = await getCam(camId || undefined, 2);
        if (t) tracks.push(t);
      }
      if (!live) return tracks.forEach((t) => t.stop());
      stream = new MediaStream(tracks);
      setPreview(stream);
      navigator.mediaDevices.enumerateDevices().then(setDevices, () => {});
    })();
    return () => {
      live = false;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [phase, wantCam, camId]);

  const refresh = useCallback(() => {
    const r = roomRef.current;
    if (!r) return;
    setSnap({ remotes: r.remotes(), me: r.state, local: r.localStream, localVideoId: r.video?.id ?? null, count: r.count, quality: r.myQuality() });
    if (r.remotes().length) everJoinedRef.current = true;
  }, []);

  // ---- Join ---------------------------------------------------------------------------

  const join = useCallback(async () => {
    setPhase("joining");
    try {
      const id = await joinMeeting(code);
      const m = (await fetchMeetingByCode(code)) ?? meetingRef.current;
      if (!m) throw new Error("No meeting has that code.");
      setMeeting(m);
      setInMeeting(id);
      const { data } = await getSupabaseClient().auth.getSession();
      tokenRef.current = data.session?.access_token ?? null;
      const ice = await iceServers();
      const r = new MeshRoom(id, me, ice, refresh, (event, payload) => {
        if (event === "reaction") {
          const rid = Date.now() + Math.random();
          setReactions((cur) => [...cur, { id: rid, sid: String(payload.from), emoji: String(payload.emoji) }]);
          window.setTimeout(() => setReactions((cur) => cur.filter((x) => x.id !== rid)), 3500);
        } else if (event === "note") {
          const p = payload as { op: string; note: Record<string, unknown> };
          const n = toNote(p.note);
          setNotes((cur) => (p.op === "DELETE" ? cur.filter((x) => x.id !== n.id) : cur.some((x) => x.id === n.id) ? cur.map((x) => (x.id === n.id ? n : x)) : [...cur, n]));
        } else if (event === "ended") {
          finish(true);
        }
      });
      roomRef.current = r;
      setRoom(r);
      const mic = wantMic ? await getMic(micId || undefined) : null;
      const cam = wantCam ? await getCam(camId || undefined, 2) : null;
      preview?.getTracks().forEach((t) => t.stop());
      setPreview(null);
      await r.setMic(mic);
      await r.setVideo(cam);
      await r.join();
      await r.publishState({ mic: !!mic, cam: !!cam });
      if (wantMic && !mic) setNotice("Your microphone isn't available — check the browser's permission for this site.");
      if (wantCam && !cam) setNotice("Your camera isn't available — check the browser's permission for this site.");
      fetchNotes(id).then(setNotes, () => {});
      navigator.mediaDevices.enumerateDevices().then(setDevices, () => {});
      setPhase("in");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't join the meeting.");
      setPhase("error");
    }
    // finish is stable for the life of the room
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, me, refresh, setInMeeting, wantMic, wantCam, micId, camId, preview]);

  useEffect(() => {
    if (phase === "joining" && !roomRef.current) {
      const t = window.setTimeout(() => join(), 0);
      return () => window.clearTimeout(t);
    }
  }, [phase, join]);

  // ---- Leave --------------------------------------------------------------------------

  const stopRecording = useCallback(async () => {
    const rec = recorderRef.current;
    if (!rec) return null;
    setRecBusy(true);
    setSaving("Saving the recording…");
    await roomRef.current?.publishState({ rec: false });
    const saved = await rec.stop().catch((e) => {
      reportSaveError("Couldn't save the recording", e);
      return null;
    });
    setRecorder(null);
    setRecBusy(false);
    setSaving(null);
    if (saved) setSavedRec(saved);
    return saved;
  }, []);

  async function finish(ended: boolean) {
    if (leftRef.current) return;
    leftRef.current = true;
    const r = roomRef.current;
    const m = meetingRef.current;
    if (recorderRef.current) await stopRecording();
    // A call nobody answered: stop their phones ringing.
    if (m && m.kind !== "meeting" && !everJoinedRef.current) {
      for (const p of m.participants) if (p.employeeId !== me) sendToUser(p.employeeId, { type: "cancel", meetingId: m.id, from: me });
    }
    r?.leave();
    roomRef.current = null;
    setInMeeting(null);
    if (m) await leaveMeeting(m.id).catch(() => {});
    setPhase("ended");
    if (ended) setNotice("The meeting has ended.");
  }

  useEffect(() => {
    const onHide = () => {
      const m = meetingRef.current;
      if (m && roomRef.current && !leftRef.current && tokenRef.current) leaveMeetingOnUnload(m.id, tokenRef.current);
    };
    window.addEventListener("pagehide", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      // Leaving the page (another menu item) leaves the meeting.
      if (roomRef.current && !leftRef.current) {
        leftRef.current = true;
        recorderRef.current?.stop();
        roomRef.current.leave();
        const m = meetingRef.current;
        if (m) leaveMeeting(m.id).catch(() => {});
        setInMeeting(null);
      }
    };
  }, [setInMeeting]);

  // ---- Calling (a call from a chat, before anyone answers) ---------------------------

  const isCall = !!meeting && meeting.kind !== "meeting" && !!meeting.conversationId;
  const calling = phase === "in" && isCall && !!snap && snap.remotes.length === 0 && !everJoinedRef.current && meeting?.hostId === me;
  const invitees = useMemo(() => (meeting?.participants ?? []).filter((p) => p.employeeId !== me), [meeting, me]);

  useEffect(() => {
    if (!calling) return;
    const stop = startRingback();
    const t = window.setTimeout(() => finish(false), RING_MS);
    return () => {
      stop();
      window.clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calling]);

  useEffect(() => {
    const on = (e: Event) => {
      const sig = (e as CustomEvent<CallSignal>).detail;
      if (sig.type !== "decline" || sig.meetingId !== meetingRef.current?.id) return;
      setDeclined((cur) => (cur.includes(sig.from) ? cur : [...cur, sig.from]));
    };
    window.addEventListener(CALL_EVENT, on);
    return () => window.removeEventListener(CALL_EVENT, on);
  }, []);
  const allDeclined = calling && invitees.length > 0 && invitees.every((p) => declined.includes(p.employeeId));
  useEffect(() => {
    if (!allDeclined) return;
    const t = window.setTimeout(() => finish(false), 2000);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allDeclined]);

  // Elapsed time.
  useEffect(() => {
    if (phase !== "in") return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [phase]);

  // ---- Tiles --------------------------------------------------------------------------

  const tiles: Tile[] = useMemo(() => {
    if (!snap) return [];
    const mine: Tile = { key: room?.sid ?? "me", employeeId: me, name: nameOf(me), stream: snap.local, videoId: snap.localVideoId, state: snap.me, quality: snap.quality, isMe: true };
    return [
      mine,
      ...snap.remotes.map((r) => ({ key: r.sid, employeeId: r.state.employeeId, name: nameOf(r.state.employeeId), stream: r.stream, videoId: r.stream.getVideoTracks()[0]?.id ?? null, state: r.state, quality: r.quality, isMe: false })),
    ];
  }, [snap, room, me, nameOf]);

  const speaking = useSpeakers(tiles.map((t) => ({ key: t.key, stream: t.stream, audioId: t.stream.getAudioTracks()[0]?.id ?? null })));
  const screenTile = tiles.find((t) => t.state.screen && t.state.cam);
  const recordingBy = tiles.find((t) => t.state.rec);

  // Keep the recording's tiles in step with the room.
  useEffect(() => {
    if (!recorder) return;
    recorder.setTiles(tiles.map<RecordTile>((t) => ({ key: t.key, name: t.name, stream: t.stream, camOn: t.state.cam, screen: t.state.screen })));
  }, [recorder, tiles]);

  // ---- Controls -----------------------------------------------------------------------

  async function toggleMic() {
    const r = room;
    if (!r) return;
    if (!r.mic) {
      const t = await getMic(micId || undefined);
      if (!t) return setNotice("Your microphone isn't available — check the browser's permission for this site.");
      await r.setMic(t);
      return r.publishState({ mic: true });
    }
    r.mic.enabled = !r.state.mic;
    await r.publishState({ mic: !r.state.mic });
  }

  async function toggleCam() {
    const r = room;
    if (!r || r.state.screen) return;
    if (r.state.cam) {
      await r.setVideo(null);
      return r.publishState({ cam: false });
    }
    const t = await getCam(camId || undefined, r.count);
    if (!t) return setNotice("Your camera isn't available — check the browser's permission for this site.");
    await r.setVideo(t);
    await r.publishState({ cam: true });
  }

  async function toggleScreen() {
    const r = room;
    if (!r) return;
    if (r.state.screen) return stopScreen();
    let screen: MediaStream;
    try {
      screen = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 15 } }, audio: false });
    } catch {
      return;
    }
    const track = screen.getVideoTracks()[0];
    if (!track) return;
    camWasOnRef.current = r.state.cam;
    track.contentHint = "detail";
    track.onended = () => stopScreen();
    await r.setVideo(track);
    await r.publishState({ screen: true, cam: true });
  }

  async function stopScreen() {
    const r = roomRef.current;
    if (!r || !r.state.screen) return;
    const cam = camWasOnRef.current ? await getCam(camId || undefined, r.count) : null;
    await r.setVideo(cam);
    await r.publishState({ screen: false, cam: !!cam });
  }

  async function pickMic(id: string) {
    setMicId(id);
    const r = room;
    if (!r) return;
    const t = await getMic(id);
    if (!t) return;
    t.enabled = r.state.mic;
    await r.setMic(t);
  }
  async function pickCam(id: string) {
    setCamId(id);
    const r = room;
    if (!r || !r.state.cam || r.state.screen) return;
    const t = await getCam(id, r.count);
    if (t) await r.setVideo(t);
  }

  async function toggleRecording() {
    if (!room || !meeting || recBusy) return;
    if (recorder) return void stopRecording();
    setRecBusy(true);
    try {
      const rec = new MeetingRecorder(meeting.id, me, (msg) => setNotice(msg));
      await rec.start(tiles.map((t) => ({ key: t.key, name: t.name, stream: t.stream, camOn: t.state.cam, screen: t.state.screen })));
      setRecorder(rec);
      await room.publishState({ rec: true });
    } catch (e) {
      reportSaveError("Couldn't start recording", e);
    } finally {
      setRecBusy(false);
    }
  }

  async function downloadRecording(rec: Recording) {
    setSaving("Preparing the download…");
    try {
      const blob = await loadRecording(rec, (d, t) => setSaving(`Preparing the download… ${d}/${t}`));
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = `${meeting?.title ?? "Meeting"} recording.webm`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(href), 30_000);
    } catch (e) {
      reportSaveError("Couldn't download the recording", e);
    } finally {
      setSaving(null);
    }
  }

  // ---- Screens other than the room -----------------------------------------------------

  const backHref = meeting?.conversationId ? `/chat?c=${meeting.conversationId}` : "/meetings";

  if (phase === "loading" || phase === "joining") {
    return (
      <Shell>
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-sm text-white/80">
          <Loader2 className="animate-spin" />
          {phase === "joining" ? "Joining…" : "Opening the meeting…"}
        </div>
      </Shell>
    );
  }
  if (phase === "error" || phase === "ended") {
    return (
      <Shell>
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center text-white">
          {phase === "error" ? <AlertTriangle className="text-[var(--status-warning)]" /> : <PhoneOff />}
          <div className="text-lg font-semibold">{phase === "error" ? "Couldn't join" : notice === "The meeting has ended." ? "The meeting has ended" : meeting && !isLive(meeting) && !room ? "This meeting has ended" : "You left the meeting"}</div>
          {phase === "error" && <div className="max-w-md text-sm text-white/70">{error}</div>}
          {saving && (
            <div className="flex items-center gap-2 text-sm text-white/80">
              <Loader2 size={16} className="animate-spin" /> {saving}
            </div>
          )}
          {savedRec && (
            <button onClick={() => downloadRecording(savedRec)} disabled={!!saving} className="flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-2 text-sm hover:bg-white/20">
              <Download size={16} /> Download the recording
            </button>
          )}
          <div className="mt-2 flex gap-2">
            <button onClick={() => router.push(backHref)} className="rounded-lg bg-[var(--series-1)] px-4 py-2 text-sm font-medium text-[var(--on-accent)]">
              {meeting?.conversationId ? "Back to the chat" : "Back to Meetings"}
            </button>
            {phase === "ended" && meeting && isLive(meeting) && !notice?.includes("ended") && (
              <button
                onClick={() => {
                  leftRef.current = false;
                  setSavedRec(null);
                  setPhase("lobby");
                }}
                className="rounded-lg border border-white/20 px-4 py-2 text-sm text-white hover:bg-white/10"
              >
                Rejoin
              </button>
            )}
          </div>
        </div>
      </Shell>
    );
  }
  if (phase === "lobby") {
    const mics = devices.filter((d) => d.kind === "audioinput");
    const cams = devices.filter((d) => d.kind === "videoinput");
    return (
      <Shell>
        <div className="flex flex-1 items-center justify-center p-4">
          <div className="w-full max-w-lg text-white">
            <div className="mb-1 text-lg font-semibold">{meeting?.title ?? "Meeting"}</div>
            <div className="mb-4 text-sm text-white/60">Code {code} · Check your camera and mic, then join.</div>
            <div className="relative aspect-video overflow-hidden rounded-2xl bg-black">
              {preview && wantCam && preview.getVideoTracks().length > 0 ? (
                <VideoEl stream={preview} videoId={preview.getVideoTracks()[0]?.id ?? null} muted mirror hidden={false} contain={false} />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center">
                  <ChatAvatar name={nameOf(me)} url={photo(me)} size={88} />
                </div>
              )}
              <div className="absolute inset-x-0 bottom-3 flex justify-center gap-3">
                <RoundBtn on={wantMic} onClick={() => setWantMic((v) => !v)} label={wantMic ? "Mic on" : "Mic off"} icon={wantMic ? Mic : MicOff} />
                <RoundBtn on={wantCam} onClick={() => setWantCam((v) => !v)} label={wantCam ? "Camera on" : "Camera off"} icon={wantCam ? Video : VideoOff} />
              </div>
            </div>
            {(mics.length > 1 || cams.length > 1) && (
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <DeviceSelect label="Microphone" list={mics} value={micId} onChange={setMicId} />
                <DeviceSelect label="Camera" list={cams} value={camId} onChange={setCamId} />
              </div>
            )}
            <div className="mt-4 flex gap-2">
              <button onClick={() => setPhase("joining")} className="flex-1 rounded-lg bg-[var(--series-1)] px-4 py-2.5 text-sm font-semibold text-[var(--on-accent)]">
                Join now
              </button>
              <button onClick={() => router.push(backHref)} className="rounded-lg border border-white/20 px-4 py-2.5 text-sm text-white hover:bg-white/10">
                Cancel
              </button>
            </div>
          </div>
        </div>
      </Shell>
    );
  }

  // ---- The room -----------------------------------------------------------------------

  const st = snap?.me;
  const count = snap?.count ?? 1;
  const elapsed = meeting?.startedAt ? Math.max(0, Math.floor((now - new Date(meeting.startedAt).getTime()) / 1000)) : 0;
  const clock = `${Math.floor(elapsed / 3600) ? `${Math.floor(elapsed / 3600)}:` : ""}${String(Math.floor((elapsed % 3600) / 60)).padStart(2, "0")}:${String(elapsed % 60).padStart(2, "0")}`;
  const others = tiles.filter((t) => t !== screenTile);
  const cols = others.length <= 1 ? 1 : others.length <= 4 ? 2 : others.length <= 9 ? 3 : 4;
  const amHost = meeting?.hostId === me;
  const canShare = typeof navigator !== "undefined" && !!navigator.mediaDevices?.getDisplayMedia;

  const renderTile = (t: Tile, big: boolean) => {
    const camOn = t.state.cam && !!t.videoId;
    const myReactions = reactions.filter((r) => r.sid === t.key);
    return (
      <div key={t.key} className={`relative overflow-hidden rounded-xl bg-[#16201e] ${speaking === t.key ? "ring-2 ring-[var(--series-1)]" : ""} ${big ? "h-full" : "aspect-video"}`}>
        <VideoEl stream={t.stream} videoId={t.videoId} muted={t.isMe} mirror={t.isMe && !t.state.screen} hidden={!camOn} contain={t.state.screen} />
        {!camOn && (
          <div className="absolute inset-0 flex items-center justify-center">
            <ChatAvatar name={t.name} url={photo(t.employeeId)} size={big ? 96 : 64} />
          </div>
        )}
        <div className="absolute inset-x-2 bottom-2 flex items-center gap-1.5">
          <span className="flex min-w-0 items-center gap-1.5 rounded-md bg-black/55 px-2 py-0.5 text-xs text-white">
            {!t.state.mic && <Labeled label="Muted" className="shrink-0 text-[var(--status-critical)]" icon={MicOff} size={12} />}
            <span className="truncate">
              {t.isMe ? `${t.name} (you)` : t.name}
              {t.state.screen ? " · sharing screen" : ""}
            </span>
          </span>
          <span className="rounded-md bg-black/55 px-1 py-0.5">
            <QualityIcon q={t.quality} size={12} />
          </span>
        </div>
        {t.state.hand && (
          <span className="absolute top-2 left-2 flex items-center gap-1 rounded-md bg-[var(--status-warning)] px-1.5 py-0.5 text-xs font-medium text-black">
            <Hand size={12} /> Hand raised
          </span>
        )}
        <div className="pointer-events-none absolute right-3 bottom-10 flex flex-col items-center gap-1">
          {myReactions.map((r) => (
            <span key={r.id} className="animate-bounce text-3xl">
              {r.emoji}
            </span>
          ))}
        </div>
      </div>
    );
  };

  return (
    <Shell>
      {/* Top bar */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-white sm:px-4">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{meeting?.title}</div>
          <div className="flex items-center gap-2 text-xs text-white/60">
            <span>{clock}</span>·<span>{count} in the meeting</span>·<span>{qualityFor(count).label}</span>
            <button
              onClick={() => navigator.clipboard.writeText(meetingLink(code)).then(() => setNotice("Meeting link copied."))}
              className="flex items-center gap-1 hover:text-white"
              title="Copy the meeting link"
            >
              <Copy size={12} /> {code}
            </button>
          </div>
        </div>
        <span className="flex items-center gap-1 text-xs text-white/70" title="Your connection">
          <QualityIcon q={snap?.quality ?? "connecting"} /> {snap?.quality === "poor" ? "Weak connection" : snap?.quality === "fair" ? "Fair connection" : snap?.quality === "connecting" ? "Connecting…" : "Good connection"}
        </span>
      </div>
      {recordingBy && (
        <div className="mx-3 mb-2 flex items-center gap-2 rounded-lg bg-[var(--status-critical)]/90 px-3 py-1.5 text-xs font-medium text-white sm:mx-4" role="status">
          <Circle size={10} className="animate-pulse fill-white" /> Recording{recordingBy.isMe ? " — you started it" : ` — started by ${recordingBy.name}`}. Everyone in the meeting is recorded.
        </div>
      )}
      {count > BIG_MEETING && (
        <div className="mx-3 mb-2 rounded-lg bg-[var(--status-warning)]/90 px-3 py-1.5 text-xs text-black sm:mx-4">
          With more than {BIG_MEETING} people, video may be choppy. Turning cameras off helps.
        </div>
      )}
      {notice && (
        <div className="mx-3 mb-2 flex items-center gap-2 rounded-lg bg-white/10 px-3 py-1.5 text-xs text-white sm:mx-4">
          <span className="flex-1">{notice}</span>
          <button onClick={() => setNotice(null)} aria-label="Dismiss">
            <X size={14} />
          </button>
        </div>
      )}
      {savedRec && (
        <div className="mx-3 mb-2 flex items-center gap-2 rounded-lg bg-white/10 px-3 py-1.5 text-xs text-white sm:mx-4">
          <Check size={14} className="text-[var(--status-good)]" />
          <span className="flex-1">Recording saved. It&rsquo;s also listed under Meetings.</span>
          <button onClick={() => downloadRecording(savedRec)} disabled={!!saving} className="flex items-center gap-1 underline">
            <Download size={13} /> {saving ?? "Download"}
          </button>
          <button onClick={() => setSavedRec(null)} aria-label="Dismiss">
            <X size={14} />
          </button>
        </div>
      )}

      <div className="flex min-h-0 flex-1 gap-3 px-3 pb-2 sm:px-4">
        {/* Stage */}
        <div className="relative min-h-0 min-w-0 flex-1">
          {calling ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-white">
              <div className="flex -space-x-3">
                {invitees.slice(0, 4).map((p) => (
                  <span key={p.employeeId} className="animate-pulse rounded-full ring-4 ring-[#0b1110]">
                    <ChatAvatar name={nameOf(p.employeeId)} url={photo(p.employeeId)} size={80} />
                  </span>
                ))}
              </div>
              <div className="text-lg font-semibold">
                {allDeclined ? "Declined" : `Calling ${invitees.length === 1 ? nameOf(invitees[0].employeeId) : `${invitees.length} people`}…`}
              </div>
              {declined.length > 0 && !allDeclined && <div className="text-sm text-white/60">{declined.map((d) => nameOf(d)).join(", ")} declined</div>}
              <div className="mt-4 w-56">{tiles[0] && renderTile(tiles[0], false)}</div>
            </div>
          ) : screenTile ? (
            <div className="flex h-full flex-col gap-2 lg:flex-row">
              <div className="min-h-0 flex-1">{renderTile(screenTile, true)}</div>
              <div className="flex shrink-0 gap-2 overflow-auto lg:w-56 lg:flex-col">{others.map((t) => <div key={t.key} className="w-40 shrink-0 lg:w-full">{renderTile(t, false)}</div>)}</div>
            </div>
          ) : (
            <div className="grid h-full content-center gap-2 overflow-auto" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
              {others.map((t) => renderTile(t, false))}
            </div>
          )}
        </div>

        {/* Side panel */}
        {panel && (
          <aside className="fixed inset-x-0 bottom-20 top-24 z-10 mx-3 flex flex-col overflow-hidden rounded-xl bg-[var(--surface-1)] sm:static sm:mx-0 sm:w-80 sm:shrink-0">
            <div className="flex items-center border-b border-[var(--border-hairline)] text-sm">
              {(["people", "notes", "chat"] as const).map((p) => (
                <button key={p} onClick={() => setPanel(p)} className={`flex-1 px-2 py-2.5 font-medium capitalize ${panel === p ? "border-b-2 border-[var(--series-1)] text-[var(--series-1)]" : "text-[var(--text-secondary)]"}`}>
                  {p === "people" ? `People (${count})` : p}
                </button>
              ))}
              <button onClick={() => setPanel(null)} className="px-2 text-[var(--text-muted)]" aria-label="Close panel">
                <X size={16} />
              </button>
            </div>
            {panel === "people" && <PeoplePanel tiles={tiles} speaking={speaking} photo={photo} hostId={meeting?.hostId ?? null} />}
            {panel === "notes" && meeting && (
              <NotesPanel meeting={meeting} me={me} amHost={amHost} notes={notes.filter((n) => n.kind !== "chat")} nameOf={nameOf} onAdded={(n) => setNotes((cur) => (cur.some((x) => x.id === n.id) ? cur.map((x) => (x.id === n.id ? n : x)) : [...cur, n]))} />
            )}
            {panel === "chat" && meeting && (
              <MeetingChat meeting={meeting} me={me} notes={notes.filter((n) => n.kind === "chat")} nameOf={nameOf} photo={photo} onAdded={(n) => setNotes((cur) => (cur.some((x) => x.id === n.id) ? cur : [...cur, n]))} />
            )}
          </aside>
        )}
      </div>

      {/* Controls */}
      <div className="relative flex flex-wrap items-center justify-center gap-2 px-3 pt-1 pb-3">
        <RoundBtn on={!!st?.mic} onClick={toggleMic} label={st?.mic ? "Mute" : "Unmute"} icon={st?.mic ? Mic : MicOff} />
        <RoundBtn on={!!st?.cam && !st?.screen} onClick={toggleCam} label={st?.cam && !st?.screen ? "Turn camera off" : "Turn camera on"} icon={st?.cam && !st?.screen ? Video : VideoOff} disabled={!!st?.screen} />
        {canShare && <RoundBtn on={!st?.screen} active={!!st?.screen} onClick={toggleScreen} label={st?.screen ? "Stop sharing" : "Share screen"} icon={st?.screen ? MonitorX : MonitorUp} />}
        <RoundBtn on={!st?.hand} active={!!st?.hand} onClick={() => room?.publishState({ hand: !st?.hand })} label={st?.hand ? "Lower hand" : "Raise hand"} icon={Hand} />
        <div className="relative">
          <RoundBtn on onClick={() => setShowReactions((v) => !v)} label="Reactions" icon={SmilePlus} />
          {showReactions && (
            <div className="absolute bottom-full left-1/2 mb-2 flex -translate-x-1/2 gap-1 rounded-full bg-[var(--surface-1)] p-1 shadow-xl">
              {REACTIONS.map((e) => (
                <button
                  key={e}
                  onClick={() => {
                    room?.react(e);
                    setShowReactions(false);
                  }}
                  className="flex h-9 w-9 items-center justify-center rounded-full text-xl hover:scale-125"
                  aria-label={`React ${e}`}
                >
                  {e}
                </button>
              ))}
            </div>
          )}
        </div>
        <RoundBtn
          on={!recorder}
          active={!!recorder}
          onClick={toggleRecording}
          label={recorder ? "Stop recording" : recordingBy ? `${recordingBy.name} is recording` : "Record"}
          icon={recorder ? Square : Circle}
          disabled={recBusy || (!!recordingBy && !recorder)}
        />
        <div className="relative">
          <RoundBtn
            on
            onClick={() => {
              setShowDevices((v) => !v);
              navigator.mediaDevices.enumerateDevices().then(setDevices, () => {});
            }}
            label="Microphone and camera"
            icon={Settings}
          />
          {showDevices && (
            <div className="absolute bottom-full left-1/2 z-20 mb-2 w-72 -translate-x-1/2 space-y-2 rounded-xl bg-[var(--surface-1)] p-3 shadow-xl">
              <DeviceSelect label="Microphone" list={devices.filter((d) => d.kind === "audioinput")} value={micId} onChange={pickMic} dark={false} />
              <DeviceSelect label="Camera" list={devices.filter((d) => d.kind === "videoinput")} value={camId} onChange={pickCam} dark={false} />
              <button onClick={() => setShowDevices(false)} className="w-full rounded-lg border border-[var(--border-hairline)] py-1.5 text-xs text-[var(--text-secondary)]">
                Done
              </button>
            </div>
          )}
        </div>
        <RoundBtn on={panel !== "people"} active={panel === "people"} onClick={() => setPanel(panel === "people" ? null : "people")} label="People" icon={Users} />
        <RoundBtn on={panel !== "notes"} active={panel === "notes"} onClick={() => setPanel(panel === "notes" ? null : "notes")} label="Notes" icon={NotebookPen} />
        <RoundBtn on={panel !== "chat"} active={panel === "chat"} onClick={() => setPanel(panel === "chat" ? null : "chat")} label="Chat" icon={MessageSquare} />
        <button onClick={() => finish(false)} className="flex h-11 items-center gap-1.5 rounded-full bg-[var(--status-critical)] px-4 text-sm font-semibold text-white" aria-label="Leave">
          <PhoneOff size={18} /> Leave
        </button>
        {amHost && !calling && (
          <button
            onClick={async () => {
              if (!meeting || !window.confirm("End the meeting for everyone?")) return;
              try {
                if (recorderRef.current) await stopRecording();
                await endMeeting(meeting.id);
              } catch (e) {
                reportSaveError("Couldn't end the meeting", e);
              }
            }}
            className="h-11 rounded-full border border-[var(--status-critical)] px-4 text-sm font-medium text-[var(--status-critical)] hover:bg-[var(--status-critical)]/10"
          >
            End for everyone
          </button>
        )}
        {saving && (
          <span className="absolute -top-6 flex items-center gap-1 text-xs text-white/80">
            <Loader2 size={12} className="animate-spin" /> {saving}
          </span>
        )}
      </div>
    </Shell>
  );
}

function Labeled({ label, className, icon: Icon, size = 15 }: { label: string; className: string; icon: React.ComponentType<{ size?: number }>; size?: number }) {
  return (
    <span role="img" aria-label={label} title={label} className={`inline-flex ${className}`}>
      <Icon size={size} />
    </span>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="fixed inset-0 z-40 flex flex-col bg-[#0b1110]">{children}</div>;
}

function RoundBtn({ on, active, onClick, label, icon: Icon, disabled }: { on: boolean; active?: boolean; onClick: () => void; label: string; icon: React.ComponentType<{ size?: number }>; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`flex h-11 w-11 items-center justify-center rounded-full transition-colors disabled:opacity-40 ${
        active ? "bg-[var(--series-1)] text-[var(--on-accent)]" : on ? "bg-white/12 text-white hover:bg-white/20" : "bg-[var(--status-critical)] text-white"
      }`}
    >
      <Icon size={19} />
    </button>
  );
}

function DeviceSelect({ label, list, value, onChange, dark = true }: { label: string; list: MediaDeviceInfo[]; value: string; onChange: (id: string) => void; dark?: boolean }) {
  return (
    <label className={`block text-xs ${dark ? "text-white/70" : "text-[var(--text-secondary)]"}`}>
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`mt-1 w-full rounded-lg border px-2 py-1.5 text-sm ${dark ? "border-white/20 bg-white/5 text-white" : "border-[var(--border-hairline)] bg-[var(--surface-1)] text-[var(--text-primary)]"}`}
      >
        <option value="">Default</option>
        {list.map((d, i) => (
          <option key={d.deviceId || i} value={d.deviceId}>
            {d.label || `${label} ${i + 1}`}
          </option>
        ))}
      </select>
    </label>
  );
}

function PeoplePanel({ tiles, speaking, photo, hostId }: { tiles: Tile[]; speaking: string | null; photo: (id: string) => string | null; hostId: string | null }) {
  const sorted = [...tiles].sort((a, b) => Number(b.state.hand) - Number(a.state.hand));
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      {sorted.map((t) => (
        <div key={t.key} className="flex items-center gap-2.5 border-b border-[var(--gridline)] px-3 py-2">
          <span className={`rounded-full ${speaking === t.key ? "ring-2 ring-[var(--series-1)]" : ""}`}>
            <ChatAvatar name={t.name} url={photo(t.employeeId)} size={32} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm text-[var(--text-primary)]">
              {t.name}
              {t.isMe ? " (you)" : ""}
            </span>
            <span className="text-xs text-[var(--text-muted)]">{t.employeeId === hostId ? "Host" : "Participant"}</span>
          </span>
          {t.state.hand && <Labeled label="Hand raised" className="text-[var(--status-warning)]" icon={Hand} />}
          {t.state.mic ? <Labeled label="Mic on" className="text-[var(--text-secondary)]" icon={Mic} /> : <Labeled label="Muted" className="text-[var(--status-critical)]" icon={MicOff} />}
          {t.state.cam ? <Labeled label="Camera on" className="text-[var(--text-secondary)]" icon={Video} /> : <Labeled label="Camera off" className="text-[var(--text-muted)]" icon={VideoOff} />}
          <QualityIcon q={t.quality} />
        </div>
      ))}
    </div>
  );
}

const KIND_LABEL: Record<Exclude<NoteKind, "chat">, string> = { note: "Note", action: "Action item", decision: "Decision" };

function NotesPanel({ meeting, me, amHost, notes, nameOf, onAdded }: { meeting: Meeting; me: string; amHost: boolean; notes: MeetingNote[]; nameOf: (id: string | null) => string; onAdded: (n: MeetingNote) => void }) {
  function tick(n: MeetingNote, done: boolean) {
    onAdded({ ...n, done });
    setNoteDone(n.id, done).catch((err) => {
      onAdded(n);
      reportSaveError("Couldn't update the action item", err);
    });
  }
  const [kind, setKind] = useState<Exclude<NoteKind, "chat">>("note");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(0);
  async function add() {
    const body = text.trim();
    if (!body) return;
    setText("");
    setBusy((n) => n + 1);
    try {
      onAdded(await addNote(meeting.id, me, kind, body));
    } catch (e) {
      setText((cur) => cur || body);
      reportSaveError("Couldn't add the note", e);
    } finally {
      setBusy((n) => n - 1);
    }
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between px-3 pt-2 text-xs text-[var(--text-muted)]">
        <span>Everyone in the meeting can add and tick these.</span>
        <button
          onClick={() => downloadText(`${meeting.title} notes.md`, notesMarkdown(meeting.title, new Date(meeting.startedAt ?? meeting.createdAt).toLocaleString("en-PH", { timeZone: "Asia/Manila" }), notes, nameOf))}
          className="flex shrink-0 items-center gap-1 text-[var(--series-1)] hover:underline"
          title="Export as Markdown"
        >
          <Download size={12} /> Export
        </button>
      </div>
      <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-3">
        {notes.length === 0 && <div className="py-6 text-center text-sm text-[var(--text-muted)]">No notes yet.</div>}
        {notes.map((n) => (
          <div key={n.id} className="group flex items-start gap-2 rounded-lg border border-[var(--border-hairline)] px-2.5 py-2">
            {n.kind === "action" ? (
              <input type="checkbox" checked={n.done} onChange={(e) => tick(n, e.target.checked)} className="mt-0.5" aria-label="Done" />
            ) : (
              <span className={`mt-0.5 shrink-0 rounded px-1 text-[10px] font-semibold uppercase ${n.kind === "decision" ? "bg-[var(--series-1)]/15 text-[var(--series-1)]" : "bg-[var(--gridline)] text-[var(--text-secondary)]"}`}>
                {n.kind === "decision" ? "Decision" : "Note"}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <div className={`text-sm whitespace-pre-wrap [overflow-wrap:anywhere] text-[var(--text-primary)] ${n.kind === "action" && n.done ? "text-[var(--text-muted)] line-through" : ""}`}>{n.body}</div>
              <div className="text-[11px] text-[var(--text-muted)]">{nameOf(n.authorId)}</div>
            </div>
            {(n.authorId === me || amHost) && (
              <button onClick={() => deleteNote(n.id).catch((e) => reportSaveError("Couldn't delete the note", e))} className="text-[var(--text-muted)] opacity-60 hover:text-[var(--status-critical)] sm:opacity-0 sm:group-hover:opacity-100" aria-label="Delete note">
                <Trash2 size={13} />
              </button>
            )}
          </div>
        ))}
      </div>
      <div className="border-t border-[var(--border-hairline)] p-2">
        <div className="mb-1.5 flex gap-1">
          {(Object.keys(KIND_LABEL) as (keyof typeof KIND_LABEL)[]).map((k) => (
            <button key={k} onClick={() => setKind(k)} className={`rounded-full px-2 py-0.5 text-xs ${kind === k ? "bg-[var(--series-1)] text-[var(--on-accent)]" : "border border-[var(--border-hairline)] text-[var(--text-secondary)]"}`}>
              {KIND_LABEL[k]}
            </button>
          ))}
        </div>
        <div className="flex gap-1.5">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
            placeholder={`Add ${KIND_LABEL[kind].toLowerCase()}…`}
            maxLength={4000}
            className="min-w-0 flex-1 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-2.5 py-1.5 text-sm"
            aria-label="New note"
          />
          <button onClick={add} disabled={!text.trim()} className="rounded-lg bg-[var(--series-1)] px-3 text-sm font-medium text-[var(--on-accent)] disabled:opacity-40">
            {busy ? <Loader2 size={14} className="animate-spin" /> : "Add"}
          </button>
        </div>
      </div>
    </div>
  );
}

function MeetingChat({ meeting, me, notes, nameOf, photo, onAdded }: { meeting: Meeting; me: string; notes: MeetingNote[]; nameOf: (id: string | null) => string; photo: (id: string) => string | null; onAdded: (n: MeetingNote) => void }) {
  const [text, setText] = useState("");
  const bottom = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [notes.length]);
  async function send() {
    const body = text.trim();
    if (!body) return;
    setText("");
    try {
      onAdded(await addNote(meeting.id, me, "chat", body));
    } catch (e) {
      setText(body);
      reportSaveError("Couldn't send", e);
    }
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
        {notes.length === 0 && <div className="py-6 text-center text-sm text-[var(--text-muted)]">Messages here are seen by everyone in the meeting.</div>}
        {notes.map((n) => (
          <div key={n.id} className="flex items-start gap-2">
            <ChatAvatar name={nameOf(n.authorId)} url={n.authorId ? photo(n.authorId) : null} size={26} />
            <div className="min-w-0">
              <div className="text-[11px] text-[var(--text-muted)]">
                {n.authorId === me ? "You" : nameOf(n.authorId)} · {new Date(n.createdAt).toLocaleTimeString("en-PH", { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit" })}
              </div>
              <div className="text-sm whitespace-pre-wrap [overflow-wrap:anywhere] text-[var(--text-primary)]">{n.body}</div>
            </div>
          </div>
        ))}
        <div ref={bottom} />
      </div>
      <div className="flex gap-1.5 border-t border-[var(--border-hairline)] p-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Message everyone…"
          maxLength={4000}
          className="min-w-0 flex-1 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-2.5 py-1.5 text-sm"
          aria-label="Meeting chat message"
        />
        <button onClick={send} disabled={!text.trim()} className="rounded-lg bg-[var(--series-1)] px-3 text-sm font-medium text-[var(--on-accent)] disabled:opacity-40">
          Send
        </button>
      </div>
    </div>
  );
}
