import { PART_BYTES, startRecording, updateRecording, uploadRecordingPart, type Recording } from "./meetings";

// Records a meeting in the browser: every video tile is drawn onto one
// canvas, every voice is mixed into one track, and MediaRecorder encodes the
// two. A Web Worker keeps the drawing clock ticking while the tab is in the
// background (timers on the page itself are slowed down there). The file is
// uploaded in parts of about 45 MB as it records.

export interface RecordTile {
  key: string;
  name: string;
  stream: MediaStream;
  camOn: boolean;
  screen: boolean;
}

const W = 1280;
const H = 720;
const FPS = 15;
const MAX_BYTES = 2 * 1024 * 1024 * 1024 - PART_BYTES;

const WORKER = `let t=null;onmessage=(e)=>{if(e.data.cmd==="start"){clearInterval(t);t=setInterval(()=>postMessage(0),e.data.ms)}else{clearInterval(t)}}`;

function pickMime(): string {
  for (const m of ["video/webm;codecs=vp8,opus", "video/webm;codecs=vp9,opus", "video/webm"]) if (MediaRecorder.isTypeSupported(m)) return m;
  return "video/webm";
}

export class MeetingRecorder {
  private canvas = document.createElement("canvas");
  private ctx = this.canvas.getContext("2d")!;
  private audio = new AudioContext();
  private dest = this.audio.createMediaStreamDestination();
  private sources = new Map<string, MediaStreamAudioSourceNode>();
  private videos = new Map<string, HTMLVideoElement>();
  private worker: Worker;
  private workerUrl: string;
  private recorder: MediaRecorder | null = null;
  private buffer: Blob[] = [];
  private bufferBytes = 0;
  private part = 0;
  private total = 0;
  private uploads: Promise<void> = Promise.resolve();
  private started = 0;
  private rec: Recording | null = null;
  private tiles: RecordTile[] = [];
  error: string | null = null;

  constructor(
    private meetingId: string,
    private me: string,
    private onProblem: (message: string) => void,
  ) {
    this.canvas.width = W;
    this.canvas.height = H;
    this.workerUrl = URL.createObjectURL(new Blob([WORKER], { type: "text/javascript" }));
    this.worker = new Worker(this.workerUrl);
    this.worker.onmessage = () => this.draw();
  }

  get recording() {
    return !!this.recorder && this.recorder.state === "recording";
  }

  async start(tiles: RecordTile[]): Promise<void> {
    const mime = pickMime();
    this.rec = await startRecording(this.meetingId, this.me, mime);
    this.setTiles(tiles);
    await this.audio.resume();
    const stream = new MediaStream([...this.canvas.captureStream(FPS).getVideoTracks(), ...this.dest.stream.getAudioTracks()]);
    this.recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 2_000_000, audioBitsPerSecond: 96_000 });
    this.recorder.ondataavailable = (e) => {
      if (!e.data.size) return;
      this.buffer.push(e.data);
      this.bufferBytes += e.data.size;
      this.total += e.data.size;
      if (this.bufferBytes >= PART_BYTES) this.flush(false);
      if (this.total >= MAX_BYTES && this.recording) {
        this.onProblem("The recording reached 2 GB and was stopped.");
        this.recorder?.stop();
      }
    };
    this.started = Date.now();
    this.recorder.start(4000);
    this.worker.postMessage({ cmd: "start", ms: Math.round(1000 / FPS) });
  }

  // Stops, uploads what's left, and returns the saved recording.
  async stop(): Promise<Recording | null> {
    this.worker.postMessage({ cmd: "stop" });
    if (this.recorder && this.recorder.state !== "inactive") {
      await new Promise<void>((resolve) => {
        this.recorder!.onstop = () => resolve();
        this.recorder!.stop();
      });
    }
    this.flush(true);
    await this.uploads;
    this.cleanup();
    return this.rec;
  }

  private flush(final: boolean) {
    const rec = this.rec;
    if (!rec) return;
    const parts = this.buffer.splice(0);
    this.bufferBytes = 0;
    const index = parts.length ? ++this.part : this.part;
    const blob = parts.length ? new Blob(parts, { type: rec.mimeType }) : null;
    const total = this.total;
    const secs = Math.round((Date.now() - this.started) / 1000);
    this.uploads = this.uploads.then(async () => {
      try {
        if (blob) await uploadRecordingPart(rec, index, blob);
        await updateRecording(rec.id, { partCount: index, sizeBytes: total, durationSec: secs, finished: final });
      } catch (e) {
        this.error = e instanceof Error ? e.message : "Couldn't upload part of the recording.";
        this.onProblem(this.error);
      }
    });
  }

  // Who's on screen and heard; called whenever the room changes.
  setTiles(tiles: RecordTile[]) {
    this.tiles = tiles;
    const keep = new Set<string>();
    for (const t of tiles) {
      keep.add(t.key);
      let v = this.videos.get(t.key);
      if (!v) {
        v = document.createElement("video");
        v.muted = true;
        v.playsInline = true;
        this.videos.set(t.key, v);
      }
      if (v.srcObject !== t.stream) {
        v.srcObject = t.stream;
        v.play().catch(() => {});
      }
      // Voices: one source per audio track.
      for (const track of t.stream.getAudioTracks()) {
        const id = `${t.key}:${track.id}`;
        keep.add(id);
        if (!this.sources.has(id)) {
          const src = this.audio.createMediaStreamSource(new MediaStream([track]));
          src.connect(this.dest);
          this.sources.set(id, src);
        }
      }
    }
    for (const [k, v] of this.videos) if (!keep.has(k)) {
      v.srcObject = null;
      this.videos.delete(k);
    }
    for (const [k, s] of this.sources) if (!keep.has(k)) {
      s.disconnect();
      this.sources.delete(k);
    }
  }

  private draw() {
    const ctx = this.ctx;
    ctx.fillStyle = "#0b1110";
    ctx.fillRect(0, 0, W, H);
    const screen = this.tiles.find((t) => t.screen && t.camOn);
    const rest = this.tiles.filter((t) => t !== screen);
    if (screen) {
      // Shared screen large, everyone else in a strip on the right.
      this.drawTile(screen, 0, 0, W - 240, H, true);
      rest.slice(0, 5).forEach((t, i) => this.drawTile(t, W - 236, 4 + i * 143, 232, 139, false));
      return;
    }
    const n = Math.max(1, rest.length);
    const cols = Math.ceil(Math.sqrt(n));
    const rows = Math.ceil(n / cols);
    const tw = W / cols;
    const th = H / rows;
    rest.forEach((t, i) => this.drawTile(t, (i % cols) * tw + 3, Math.floor(i / cols) * th + 3, tw - 6, th - 6, false));
  }

  private drawTile(t: RecordTile, x: number, y: number, w: number, h: number, contain: boolean) {
    const ctx = this.ctx;
    const v = this.videos.get(t.key);
    ctx.fillStyle = "#16201e";
    ctx.fillRect(x, y, w, h);
    if (t.camOn && v && v.videoWidth) {
      const r = contain ? Math.min(w / v.videoWidth, h / v.videoHeight) : Math.max(w / v.videoWidth, h / v.videoHeight);
      const dw = v.videoWidth * r;
      const dh = v.videoHeight * r;
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, w, h);
      ctx.clip();
      ctx.drawImage(v, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
      ctx.restore();
    } else {
      const initials = t.name.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("");
      const r = Math.min(w, h) * 0.18;
      ctx.fillStyle = "#1f5c4c";
      ctx.beginPath();
      ctx.arc(x + w / 2, y + h / 2, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#e6fff7";
      ctx.font = `600 ${Math.round(r * 0.8)}px system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(initials, x + w / 2, y + h / 2);
    }
    ctx.font = "500 16px system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    const label = t.screen ? `${t.name} (screen)` : t.name;
    const lw = ctx.measureText(label).width + 16;
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(x + 8, y + h - 34, lw, 26);
    ctx.fillStyle = "#ffffff";
    ctx.fillText(label, x + 16, y + h - 15);
  }

  private cleanup() {
    this.worker.terminate();
    URL.revokeObjectURL(this.workerUrl);
    for (const s of this.sources.values()) s.disconnect();
    this.sources.clear();
    for (const v of this.videos.values()) v.srcObject = null;
    this.videos.clear();
    this.audio.close().catch(() => {});
    this.recorder = null;
  }
}
