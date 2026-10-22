"use client";

import { useEffect, useRef, useState } from "react";
import { Download, Loader2, X } from "lucide-react";

// Shows a file inside the HRIS — a PDF drawn page by page (pdf.js), or a
// photo — over the page, with Download and Close. Nothing opens in a new tab
// or another app, on computers and phones alike.

export interface ViewerFile {
  url: string; // signed link or blob: URL
  name: string;
  kind: "pdf" | "image";
}

export const viewerKind = (name: string): ViewerFile["kind"] => (/\.(png|jpe?g|webp|gif)$/i.test(name) ? "image" : "pdf");
// Files the viewer can show; others (Word, Excel…) are downloaded.
export const canView = (name: string, type = "") => /\.(pdf|png|jpe?g|webp|gif)$/i.test(name) || type === "application/pdf" || type.startsWith("image/");

// Saves the file without leaving the page (a cross-site link would navigate).
export async function saveFile(url: string, name: string) {
  const blob = await (await fetch(url)).blob();
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 10_000);
}

export function FileViewer({ file, onClose }: { file: ViewerFile; onClose: () => void }) {
  const [saving, setSaving] = useState(false);
  // The file is fetched once and kept in memory, so Download still works
  // after a short-lived signed link runs out.
  const [local, setLocal] = useState<{ src: string; url: string } | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let href: string | null = null;
    let cancelled = false;
    fetch(file.url)
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.blob();
      })
      .then((b) => {
        if (cancelled) return;
        href = URL.createObjectURL(b);
        setLocal({ src: file.url, url: href });
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
      if (href) URL.revokeObjectURL(href);
    };
  }, [file.url]);
  const url = local?.src === file.url ? local.url : null;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-black/70 p-2 sm:p-6" role="dialog" aria-modal="true" aria-label={file.name}>
      <div className="mx-auto flex h-full w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-1)]">
        <div className="flex items-center gap-2 border-b border-[var(--border-hairline)] px-3 py-2">
          <div className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--text-primary)]">{file.name}</div>
          <button
            onClick={async () => {
              setSaving(true);
              try {
                await saveFile(url ?? file.url, file.name);
              } finally {
                setSaving(false);
              }
            }}
            disabled={saving}
            className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40 disabled:opacity-50"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} Download
          </button>
          <button onClick={onClose} className="flex items-center gap-1 rounded-lg bg-[var(--series-1)] px-2.5 py-1.5 text-xs font-medium text-[var(--on-accent)]" aria-label="Close the file">
            <X size={14} /> Close
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto bg-[var(--gridline)]/30">
          {failed ? (
            <Unavailable />
          ) : !url ? (
            <Opening />
          ) : file.kind === "image" ? (
            // eslint-disable-next-line @next/next/no-img-element -- blob: URL of the fetched file
            <img src={url} alt={file.name} className="mx-auto h-full max-h-full object-contain" />
          ) : (
            <PdfPages url={url} />
          )}
        </div>
      </div>
    </div>
  );
}

function PdfPages({ url }: { url: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
        const data = await (await fetch(url)).arrayBuffer(); // a blob: URL
        const doc = await pdfjs.getDocument({ data, isEvalSupported: false }).promise;
        const el = box.current;
        if (!el || cancelled) return;
        el.innerHTML = "";
        const width = Math.max(240, el.clientWidth - 24);
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        for (let i = 1; i <= doc.numPages; i++) {
          if (cancelled) return;
          const page = await doc.getPage(i);
          const scale = Math.min(2, width / page.getViewport({ scale: 1 }).width);
          const vp = page.getViewport({ scale: scale * dpr });
          const canvas = document.createElement("canvas");
          canvas.width = Math.floor(vp.width);
          canvas.height = Math.floor(vp.height);
          canvas.style.width = `${Math.floor(vp.width / dpr)}px`;
          canvas.style.height = `${Math.floor(vp.height / dpr)}px`;
          canvas.className = "mx-auto mb-3 block bg-white shadow";
          el.appendChild(canvas);
          await page.render({ canvasContext: canvas.getContext("2d")!, viewport: vp }).promise;
          if (i === 1 && !cancelled) setState("ready");
        }
        if (!cancelled) setState("ready");
      } catch {
        if (!cancelled) setState("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [url]);

  return (
    <div className="p-3">
      {state === "loading" && <Opening />}
      {state === "error" && <Unavailable />}
      <div ref={box} />
    </div>
  );
}

const Opening = () => (
  <div className="flex items-center justify-center gap-2 py-16 text-sm text-[var(--text-muted)]">
    <Loader2 size={16} className="animate-spin" /> Opening…
  </div>
);
const Unavailable = () => <div className="py-16 text-center text-sm text-[var(--text-muted)]">This file can&rsquo;t be shown here. Use Download to open it.</div>;
