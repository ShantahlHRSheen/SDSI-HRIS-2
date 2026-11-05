import type { RealtimeChannel } from "@supabase/supabase-js";
import { getSupabaseClient } from "./supabase/client";
import { qualityFor } from "./meetings";

// A meeting's media: every browser connects to every other one (mesh).
// Signaling (offers, answers, ICE candidates) is broadcast on the private
// Realtime channel meeting:<id>; Presence on it says who's in the room (set
// once on joining — Realtime limits how often presence can change). Mic /
// camera / hand / screen / recording changes are broadcast as "state", and
// everyone re-sends theirs when someone new joins.
//
// Each pair: the browser whose session id sorts first makes the offer with an
// audio and a video transceiver; the other answers on the same ones. Turning
// the camera on/off, switching devices and screen sharing swap the sending
// track in place (replaceTrack) — no renegotiation. "Perfect negotiation"
// covers the rare renegotiation (an ICE restart after a dropped connection).

export interface MemberState {
  employeeId: string; // "guest:<login id>" for a guest
  name: string;
  mic: boolean;
  cam: boolean;
  screen: boolean;
  hand: boolean;
  rec: boolean;
  joinedAt: number;
}
export type LinkQuality = "good" | "fair" | "poor" | "connecting" | "failed";

export interface RemotePeer {
  sid: string;
  state: MemberState;
  stream: MediaStream;
  quality: LinkQuality;
}

interface Peer {
  sid: string;
  pc: RTCPeerConnection;
  stream: MediaStream;
  audio: RTCRtpSender | null;
  video: RTCRtpSender | null;
  initiator: boolean;
  makingOffer: boolean;
  ignoreOffer: boolean;
  pendingCandidates: RTCIceCandidateInit[];
  quality: LinkQuality;
  cap: number; // adaptive video bitrate cap (bps)
  goodRuns: number;
  lastLost: number;
  lastSent: number;
}

type Signal = { from: string; to: string; description?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit | null };

export class MeshRoom {
  readonly sid = crypto.randomUUID();
  private channel: RealtimeChannel | null = null;
  private peers = new Map<string, Peer>();
  private members = new Map<string, MemberState>();
  private states = new Map<string, MemberState>();
  private stateTimer: number | null = null;
  private statsTimer: number | null = null;
  private closed = false;
  mic: MediaStreamTrack | null = null;
  video: MediaStreamTrack | null = null; // camera or screen
  readonly localStream = new MediaStream();
  state: MemberState;

  constructor(
    private meetingId: string,
    employeeId: string,
    name: string,
    private ice: RTCIceServer[],
    private onChange: () => void,
    private onEvent: (event: string, payload: Record<string, unknown>) => void,
  ) {
    this.state = { employeeId, name, mic: false, cam: false, screen: false, hand: false, rec: false, joinedAt: Date.now() };
  }

  // ---- Room ---------------------------------------------------------------------------

  async join(): Promise<void> {
    const client = getSupabaseClient();
    await client.realtime.setAuth();
    const ch = client.channel(`meeting:${this.meetingId}`, { config: { private: true, presence: { key: this.sid }, broadcast: { self: false } } });
    this.channel = ch;
    ch.on("presence", { event: "sync" }, () => this.syncPresence())
      .on("broadcast", { event: "state" }, ({ payload }) => this.onState(payload as { sid: string; state: MemberState }))
      .on("broadcast", { event: "signal" }, ({ payload }) => this.onSignal(payload as Signal))
      .on("broadcast", { event: "reaction" }, ({ payload }) => this.onEvent("reaction", payload as Record<string, unknown>))
      .on("broadcast", { event: "note" }, ({ payload }) => this.onEvent("note", payload as Record<string, unknown>))
      .on("broadcast", { event: "guest" }, ({ payload }) => this.onEvent("guest", payload as Record<string, unknown>))
      .on("broadcast", { event: "ended" }, ({ payload }) => this.onEvent("ended", payload as Record<string, unknown>));
    await new Promise<void>((resolve, reject) => {
      const t = window.setTimeout(() => reject(new Error("Couldn't connect to the meeting. Check your internet and try again.")), 15000);
      ch.subscribe((status) => {
        if (status === "SUBSCRIBED") {
          window.clearTimeout(t);
          resolve();
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          window.clearTimeout(t);
          reject(new Error("You're not allowed in this meeting, or the connection failed."));
        }
      });
    });
    await ch.track(this.state);
    this.statsTimer = window.setInterval(() => this.checkStats(), 3000);
  }

  leave() {
    this.closed = true;
    if (this.statsTimer) window.clearInterval(this.statsTimer);
    if (this.stateTimer) window.clearTimeout(this.stateTimer);
    for (const p of this.peers.values()) p.pc.close();
    this.peers.clear();
    if (this.channel) getSupabaseClient().removeChannel(this.channel);
    this.channel = null;
    this.mic?.stop();
    this.video?.stop();
  }

  remotes(): RemotePeer[] {
    const out: RemotePeer[] = [];
    for (const [sid, state] of this.members) {
      if (sid === this.sid) continue;
      const p = this.peers.get(sid);
      out.push({ sid, state: this.states.get(sid) ?? state, stream: p?.stream ?? new MediaStream(), quality: p?.quality ?? "connecting" });
    }
    return out.sort((a, b) => a.state.joinedAt - b.state.joinedAt);
  }

  get count() {
    return Math.max(1, this.members.size);
  }

  myQuality(): LinkQuality {
    const qs = [...this.peers.values()].map((p) => p.quality);
    if (!qs.length) return "good";
    if (qs.includes("poor") || qs.includes("failed")) return "poor";
    if (qs.includes("fair")) return "fair";
    if (qs.every((q) => q === "connecting")) return "connecting";
    return "good";
  }

  async publishState(patch: Partial<MemberState> = {}) {
    this.state = { ...this.state, ...patch };
    this.sendState();
    this.onChange();
  }

  private sendState() {
    this.channel?.send({ type: "broadcast", event: "state", payload: { sid: this.sid, state: this.state } });
  }

  private onState(p: { sid: string; state: MemberState }) {
    if (!p?.sid || p.sid === this.sid) return;
    this.states.set(p.sid, p.state);
    this.onChange();
  }

  react(emoji: string) {
    const payload = { from: this.sid, employeeId: this.state.employeeId, emoji };
    this.channel?.send({ type: "broadcast", event: "reaction", payload });
    this.onEvent("reaction", payload);
  }

  private syncPresence() {
    if (!this.channel || this.closed) return;
    const st = this.channel.presenceState<MemberState>();
    const before = new Set(this.members.keys());
    this.members = new Map(Object.entries(st).map(([sid, metas]) => [sid, metas[metas.length - 1] as unknown as MemberState]));
    for (const sid of this.states.keys()) if (!this.members.has(sid)) this.states.delete(sid);
    // Someone new: tell them our current state (once, shortly).
    if ([...this.members.keys()].some((sid) => sid !== this.sid && !before.has(sid)) && !this.stateTimer) {
      this.stateTimer = window.setTimeout(() => {
        this.stateTimer = null;
        this.sendState();
      }, 400);
    }
    for (const sid of this.members.keys()) if (sid !== this.sid && !this.peers.has(sid) && this.sid < sid) this.createPeer(sid, true);
    for (const sid of [...this.peers.keys()]) if (!this.members.has(sid)) this.closePeer(sid);
    this.applyQuality();
    this.onChange();
  }

  // ---- Peers --------------------------------------------------------------------------

  private send(to: string, data: Omit<Signal, "from" | "to">) {
    this.channel?.send({ type: "broadcast", event: "signal", payload: { from: this.sid, to, ...data } });
  }

  private createPeer(sid: string, initiator: boolean): Peer {
    const pc = new RTCPeerConnection({ iceServers: this.ice });
    const peer: Peer = {
      sid,
      pc,
      stream: new MediaStream(),
      audio: null,
      video: null,
      initiator,
      makingOffer: false,
      ignoreOffer: false,
      pendingCandidates: [],
      quality: "connecting",
      cap: qualityFor(this.count).maxBitrate,
      goodRuns: 0,
      lastLost: 0,
      lastSent: 0,
    };
    this.peers.set(sid, peer);

    pc.ontrack = (e) => {
      if (!peer.stream.getTracks().includes(e.track)) peer.stream.addTrack(e.track);
      this.onChange();
    };
    pc.onicecandidate = (e) => this.send(sid, { candidate: e.candidate?.toJSON() ?? null });
    pc.onnegotiationneeded = async () => {
      try {
        peer.makingOffer = true;
        await pc.setLocalDescription();
        if (pc.localDescription) this.send(sid, { description: pc.localDescription.toJSON() });
      } catch {
        // retried on the next negotiation
      } finally {
        peer.makingOffer = false;
      }
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected" && (peer.quality === "connecting" || peer.quality === "failed")) peer.quality = "good";
      if (pc.connectionState === "failed" && peer.initiator) pc.restartIce();
      // "failed": the two networks can't reach each other directly (a TURN relay fixes it).
      if (pc.connectionState === "failed") peer.quality = "failed";
      if (pc.connectionState === "disconnected") peer.quality = "poor";
      this.onChange();
    };

    if (initiator) {
      peer.audio = pc.addTransceiver(this.mic ?? "audio", { direction: "sendrecv", streams: [this.localStream] }).sender;
      peer.video = pc.addTransceiver(this.video ?? "video", { direction: "sendrecv", streams: [this.localStream] }).sender;
      this.applyPeerQuality(peer);
    }
    return peer;
  }

  private closePeer(sid: string) {
    this.peers.get(sid)?.pc.close();
    this.peers.delete(sid);
  }

  private async onSignal(s: Signal) {
    if (s.to !== this.sid || this.closed) return;
    let peer = this.peers.get(s.from);
    if (!peer) {
      if (!s.description || s.description.type !== "offer") return;
      peer = this.createPeer(s.from, false);
    }
    const pc = peer.pc;
    try {
      if (s.description) {
        const polite = !peer.initiator;
        const collision = s.description.type === "offer" && (peer.makingOffer || pc.signalingState !== "stable");
        peer.ignoreOffer = !polite && collision;
        if (peer.ignoreOffer) return;
        await pc.setRemoteDescription(s.description);
        if (s.description.type === "offer") {
          // Answer on the offerer's transceivers, sending our own tracks.
          if (!peer.initiator && (!peer.audio || !peer.video)) {
            for (const t of pc.getTransceivers()) {
              const kind = t.receiver.track.kind;
              if (kind === "audio" && !peer.audio) {
                t.direction = "sendrecv";
                await t.sender.replaceTrack(this.mic);
                t.sender.setStreams?.(this.localStream);
                peer.audio = t.sender;
              } else if (kind === "video" && !peer.video) {
                t.direction = "sendrecv";
                await t.sender.replaceTrack(this.video);
                t.sender.setStreams?.(this.localStream);
                peer.video = t.sender;
              }
            }
            this.applyPeerQuality(peer);
          }
          await pc.setLocalDescription();
          if (pc.localDescription) this.send(s.from, { description: pc.localDescription.toJSON() });
        }
        for (const c of peer.pendingCandidates.splice(0)) await pc.addIceCandidate(c).catch(() => {});
      } else if (s.candidate !== undefined) {
        if (!pc.remoteDescription) {
          if (s.candidate) peer.pendingCandidates.push(s.candidate);
          return;
        }
        await pc.addIceCandidate(s.candidate ?? undefined).catch((e) => {
          if (!peer!.ignoreOffer) throw e;
        });
      }
    } catch {
      // A failed step is recovered by ICE restart / the next offer.
    }
  }

  // ---- Local tracks ---------------------------------------------------------------------

  async setMic(track: MediaStreamTrack | null) {
    if (this.mic && this.mic !== track) {
      this.localStream.removeTrack(this.mic);
      this.mic.stop();
    }
    this.mic = track;
    if (track) this.localStream.addTrack(track);
    await Promise.all([...this.peers.values()].map((p) => p.audio?.replaceTrack(track)));
    this.onChange();
  }

  async setVideo(track: MediaStreamTrack | null, stopOld = true) {
    if (this.video && this.video !== track) {
      this.localStream.removeTrack(this.video);
      if (stopOld) this.video.stop();
    }
    this.video = track;
    if (track) this.localStream.addTrack(track);
    await Promise.all([...this.peers.values()].map((p) => p.video?.replaceTrack(track)));
    this.applyQuality();
    this.onChange();
  }

  // ---- Quality --------------------------------------------------------------------------

  // Resolution and bitrate by meeting size, lowered further for a weak link.
  applyQuality() {
    for (const p of this.peers.values()) this.applyPeerQuality(p);
    const q = qualityFor(this.count);
    if (this.video && !this.state.screen && this.video.readyState === "live") {
      this.video.applyConstraints({ width: { ideal: q.width }, height: { ideal: q.height }, frameRate: { ideal: this.count > 6 ? 15 : 24 } }).catch(() => {});
    }
  }

  private applyPeerQuality(p: Peer) {
    const sender = p.video;
    if (!sender) return;
    const q = qualityFor(this.count);
    const max = this.state.screen ? Math.max(q.maxBitrate, 1_200_000) : q.maxBitrate;
    p.cap = Math.min(p.cap || max, max);
    const params = sender.getParameters();
    if (!params.encodings?.length) params.encodings = [{}];
    params.encodings[0].maxBitrate = Math.round(p.cap);
    const h = this.video?.getSettings().height;
    params.encodings[0].scaleResolutionDownBy = !this.state.screen && h && h > q.height ? h / q.height : 1;
    sender.setParameters(params).catch(() => {});
  }

  private async checkStats() {
    const q = qualityFor(this.count);
    for (const p of this.peers.values()) {
      if (p.pc.connectionState !== "connected") continue;
      let rtt = 0;
      let lost = 0;
      let sent = 0;
      let fraction = 0;
      const stats = await p.pc.getStats().catch(() => null);
      stats?.forEach((r) => {
        if (r.type === "candidate-pair" && r.nominated && r.currentRoundTripTime) rtt = r.currentRoundTripTime;
        if (r.type === "remote-inbound-rtp") {
          lost += r.packetsLost ?? 0;
          if (typeof r.fractionLost === "number") fraction = Math.max(fraction, r.fractionLost);
        }
        if (r.type === "outbound-rtp") sent += r.packetsSent ?? 0;
      });
      const dLost = Math.max(0, lost - p.lastLost);
      const dSent = Math.max(1, sent - p.lastSent);
      p.lastLost = lost;
      p.lastSent = sent;
      const loss = Math.max(fraction, dLost / dSent);
      p.quality = loss > 0.08 || rtt > 0.5 ? "poor" : loss > 0.02 || rtt > 0.25 ? "fair" : "good";
      const max = this.state.screen ? Math.max(q.maxBitrate, 1_200_000) : q.maxBitrate;
      if (p.quality === "poor") {
        p.cap = Math.max(150_000, p.cap * 0.6);
        p.goodRuns = 0;
      } else if (p.quality === "good" && ++p.goodRuns >= 3) {
        p.cap = Math.min(max, p.cap * 1.25);
        p.goodRuns = 0;
      }
      this.applyPeerQuality(p);
    }
    this.onChange();
  }
}
