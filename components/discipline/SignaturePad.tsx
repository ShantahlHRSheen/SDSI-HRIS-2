"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Eraser, Upload } from "lucide-react";
import { loadBitmap, toBlob } from "@/lib/id-images";

export interface SignaturePadHandle {
  // The signature as a trimmed PNG with a transparent background, or null if empty.
  toPng: () => Promise<Blob | null>;
  clear: () => void;
}

// Sign with a finger, stylus or mouse — or upload a picture of a signature
// (a scan or photo on white paper: the paper is made transparent). Ink is
// drawn in near-black on a white pad; the exported PNG keeps only the ink.
export const SignaturePad = forwardRef<SignaturePadHandle, { onChange?: (hasInk: boolean) => void }>(function SignaturePad({ onChange }, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [hasInk, setHasInk] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

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

  // An uploaded signature: light (paper) pixels become transparent, the rest
  // is placed centred in the pad, replacing anything drawn.
  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploadError(null);
    if (!file.type.startsWith("image/")) return setUploadError("Choose a picture of your signature (PNG or JPG).");
    if (file.size > 10 * 1024 * 1024) return setUploadError("That picture is over 10 MB.");
    try {
      const img = await loadBitmap(file);
      const scale = Math.min(1, 1200 / img.width, 600 / img.height);
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const tmp = document.createElement("canvas");
      tmp.width = w;
      tmp.height = h;
      const tctx = tmp.getContext("2d")!;
      tctx.drawImage(img, 0, 0, w, h);
      const px = tctx.getImageData(0, 0, w, h);
      const d = px.data;
      let ink = 0;
      for (let i = 0; i < d.length; i += 4) {
        const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        // Paper → transparent; ink keeps its colour, fading near the threshold.
        const a = lum >= 200 ? 0 : lum <= 140 ? 255 : Math.round(((200 - lum) / 60) * 255);
        d[i + 3] = Math.min(d[i + 3], a);
        if (d[i + 3] > 16) ink++;
      }
      if (ink < 30) return setUploadError("No signature found in that picture — use dark ink on white paper.");
      tctx.putImageData(px, 0, 0);
      const c = canvasRef.current!;
      const cw = c.clientWidth;
      const ch = c.clientHeight;
      const fit = Math.min((cw - 24) / w, (ch - 24) / h);
      const ctx = c.getContext("2d")!;
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.drawImage(tmp, (cw - w * fit) / 2, (ch - h * fit) / 2, w * fit, h * fit);
      setHasInk(true);
      onChange?.(true);
    } catch {
      setUploadError("Couldn't open that picture — try a PNG or JPG.");
    }
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
      <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40"
        >
          <Upload size={13} /> Upload signature
        </button>
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={upload} aria-label="Upload a picture of your signature" />
        <button
          type="button"
          onClick={clear}
          disabled={!hasInk}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-[var(--text-muted)] hover:bg-[var(--gridline)]/40 disabled:opacity-40"
        >
          <Eraser size={13} /> Clear
        </button>
      </div>
      {uploadError && <div className="mt-1 text-xs text-[var(--status-critical)]">{uploadError}</div>}
    </div>
  );
});
