"use client";

import { useEffect, useRef, useState } from "react";
import { Eraser, Loader2, Save } from "lucide-react";
import { Modal } from "@/components/Modal";

// Draw a signature with the mouse, a finger or a stylus. Returns a PNG of
// dark ink on white (the caller clears the background like an uploaded photo).
export function SignaturePadModal({ onClose, onSave }: { onClose: () => void; onSave: (png: Blob) => Promise<void> }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [drawn, setDrawn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function clear() {
    const c = canvas.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, c.width, c.height);
    setDrawn(false);
  }
  useEffect(clear, []);

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = canvas.current!;
    const r = c.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * c.width, y: ((e.clientY - r.top) / r.height) * c.height };
  };
  function down(e: React.PointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    last.current = point(e);
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    // A dot for a tap.
    ctx.fillStyle = "#111111";
    ctx.beginPath();
    ctx.arc(last.current.x, last.current.y, 2.4, 0, Math.PI * 2);
    ctx.fill();
    setDrawn(true);
  }
  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!last.current) return;
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    const p = point(e);
    ctx.strokeStyle = "#111111";
    ctx.lineWidth = 4.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
  }
  const up = () => (last.current = null);

  async function save() {
    const c = canvas.current;
    if (!c) return;
    setBusy(true);
    setError(null);
    try {
      const png = await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("Couldn't read the drawing."))), "image/png"));
      await onSave(png);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save the signature.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={() => !busy && onClose()} title="Draw your signature">
      <div className="space-y-3 text-sm">
        <p className="text-xs text-[var(--text-secondary)]">Sign inside the box with your mouse, finger or stylus.</p>
        <canvas
          ref={canvas}
          width={900}
          height={300}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
          onPointerLeave={up}
          className="block aspect-[3/1] w-full cursor-crosshair touch-none rounded-lg border border-[var(--border-hairline)] bg-white"
          aria-label="Signature drawing area"
        />
        {error && <div className="text-xs text-[var(--status-critical)]">{error}</div>}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={clear}
            disabled={busy || !drawn}
            className="flex items-center gap-1.5 rounded-lg border border-[var(--border-hairline)] px-3 py-1.5 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40 disabled:opacity-40"
          >
            <Eraser size={15} /> Clear
          </button>
          <button
            type="button"
            onClick={save}
            disabled={busy || !drawn}
            className="flex items-center gap-1.5 rounded-lg bg-[var(--series-1)] px-3 py-1.5 text-sm font-medium text-[var(--on-accent)] disabled:opacity-40"
          >
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Use this signature
          </button>
        </div>
      </div>
    </Modal>
  );
}
