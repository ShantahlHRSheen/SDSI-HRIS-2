"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Eraser } from "lucide-react";
import { toBlob } from "@/lib/id-images";

export interface SignaturePadHandle {
  // The signature as a trimmed PNG with a transparent background, or null if empty.
  toPng: () => Promise<Blob | null>;
  clear: () => void;
}

// Sign with a finger, stylus or mouse. Ink is drawn in near-black on a white
// pad; the exported PNG keeps only the ink.
export const SignaturePad = forwardRef<SignaturePadHandle, { onChange?: (hasInk: boolean) => void }>(function SignaturePad({ onChange }, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [hasInk, setHasInk] = useState(false);

  // Match the canvas's pixel size to its on-screen size (sharp on phones).
  useEffect(() => {
    const c = canvasRef.current!;
    const ratio = Math.max(1, window.devicePixelRatio || 1);
    c.width = Math.round(c.clientWidth * ratio);
    c.height = Math.round(c.clientHeight * ratio);
    const ctx = c.getContext("2d")!;
    ctx.scale(ratio, ratio);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#111827";
    ctx.lineWidth = 2.2;
  }, []);

  const point = (e: React.PointerEvent) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const mark = (v: boolean) => {
    if (v !== hasInk) {
      setHasInk(v);
      onChange?.(v);
    }
  };

  function down(e: React.PointerEvent) {
    e.preventDefault();
    canvasRef.current!.setPointerCapture(e.pointerId);
    drawing.current = true;
    last.current = point(e);
    const ctx = canvasRef.current!.getContext("2d")!;
    ctx.beginPath();
    ctx.arc(last.current.x, last.current.y, 1.1, 0, Math.PI * 2);
    ctx.fillStyle = "#111827";
    ctx.fill();
    mark(true);
  }
  function move(e: React.PointerEvent) {
    if (!drawing.current || !last.current) return;
    const p = point(e);
    const ctx = canvasRef.current!.getContext("2d")!;
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
  }
  function up() {
    drawing.current = false;
    last.current = null;
  }
  function clear() {
    const c = canvasRef.current!;
    c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
    mark(false);
  }

  useImperativeHandle(ref, () => ({
    clear,
    async toPng() {
      const c = canvasRef.current!;
      const ctx = c.getContext("2d")!;
      const { data, width, height } = ctx.getImageData(0, 0, c.width, c.height);
      let minX = width,
        minY = height,
        maxX = -1,
        maxY = -1;
      for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++)
          if (data[(y * width + x) * 4 + 3] > 16) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
      if (maxX < 0 || maxX - minX < 8 || maxY - minY < 4) return null;
      const pad = 8;
      const sx = Math.max(0, minX - pad),
        sy = Math.max(0, minY - pad);
      const sw = Math.min(width, maxX + pad) - sx,
        sh = Math.min(height, maxY + pad) - sy;
      const scale = Math.min(1, 900 / sw, 300 / sh);
      const out = document.createElement("canvas");
      out.width = Math.max(1, Math.round(sw * scale));
      out.height = Math.max(1, Math.round(sh * scale));
      out.getContext("2d")!.drawImage(c, sx, sy, sw, sh, 0, 0, out.width, out.height);
      return toBlob(out, "image/png");
    },
  }));

  return (
    <div>
      <div className="relative rounded-lg border border-dashed border-[var(--border-hairline)] bg-white">
        <canvas
          ref={canvasRef}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
          aria-label="Signature pad — sign here"
          className="block h-40 w-full cursor-crosshair touch-none"
        />
        {!hasInk && <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-gray-400">Sign here</div>}
        <div className="pointer-events-none absolute right-4 bottom-8 left-4 border-b border-gray-300" />
      </div>
      <div className="mt-1 flex justify-end">
        <button
          type="button"
          onClick={clear}
          disabled={!hasInk}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-[var(--text-muted)] hover:bg-[var(--gridline)]/40 disabled:opacity-40"
        >
          <Eraser size={13} /> Clear
        </button>
      </div>
    </div>
  );
});
