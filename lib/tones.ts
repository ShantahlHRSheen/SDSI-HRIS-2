// Ringtone (incoming call) and ring-back (calling someone), made with Web
// Audio so there's no sound file to load. Each returns a function that stops it.

function pattern(freqs: number[], onMs: number, offMs: number, volume: number): () => void {
  let ctx: AudioContext | null = null;
  try {
    ctx = new AudioContext();
  } catch {
    return () => {};
  }
  const c = ctx;
  let stopped = false;
  let timer: number | null = null;
  const beep = () => {
    if (stopped) return;
    const t = c.currentTime;
    const gain = c.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(volume, t + 0.02);
    gain.gain.setValueAtTime(volume, t + onMs / 1000 - 0.05);
    gain.gain.linearRampToValueAtTime(0, t + onMs / 1000);
    gain.connect(c.destination);
    for (const f of freqs) {
      const o = c.createOscillator();
      o.type = "sine";
      o.frequency.value = f;
      o.connect(gain);
      o.start(t);
      o.stop(t + onMs / 1000);
    }
    timer = window.setTimeout(beep, onMs + offMs);
  };
  c.resume().then(beep, beep);
  return () => {
    stopped = true;
    if (timer) window.clearTimeout(timer);
    c.close().catch(() => {});
  };
}

export const startRingtone = () => pattern([880, 1100], 400, 250, 0.12);
export const startRingback = () => pattern([440, 480], 1500, 3000, 0.06);
