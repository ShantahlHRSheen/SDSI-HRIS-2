"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Download, Loader2 } from "lucide-react";

// Makes a real PDF file in the browser and downloads it — unlike "Print",
// which many phones (and the installed app on phones) don't support. Each
// page is drawn off-screen at A4 width, turned into an image and placed on
// an A4 page of the PDF.

const A4_W_PX = 794; // 210 mm at 96 dpi
const A4_H_PX = 1123; // 297 mm
const A4_W_PT = 595.28;
const A4_H_PT = 841.89;

async function buildPdf(pages: HTMLElement[]): Promise<Blob> {
  const [{ toPng }, { PDFDocument }] = await Promise.all([import("html-to-image"), import("pdf-lib")]);
  const pdf = await PDFDocument.create();
  for (const el of pages) {
    const dataUrl = await toPng(el, { pixelRatio: 2, backgroundColor: "#ffffff", cacheBust: true });
    const png = await pdf.embedPng(dataUrl);
    const page = pdf.addPage([A4_W_PT, A4_H_PT]);
    // Full width; a page taller than A4 is shrunk to fit.
    const scale = Math.min(A4_W_PT / png.width, A4_H_PT / png.height);
    const w = png.width * scale;
    const h = png.height * scale;
    page.drawImage(png, { x: (A4_W_PT - w) / 2, y: A4_H_PT - h, width: w, height: h });
  }
  const bytes = await pdf.save();
  return new Blob([bytes as BlobPart], { type: "application/pdf" });
}

function saveBlob(blob: Blob, filename: string): string {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  return url;
}

// Off-screen render of the pages; calls back once the PDF is made.
function PdfRender({ children, onReady }: { children: React.ReactNode; onReady: (pages: HTMLElement[]) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  // Runs once per download, even if the page re-renders meanwhile.
  const ready = useRef(onReady);
  useEffect(() => {
    ready.current = onReady;
  }, [onReady]);
  useEffect(() => {
    let live = true;
    const t = window.setTimeout(async () => {
      const root = ref.current;
      if (!root) return;
      // Wait (up to 4 s) for images such as signatures and logos.
      const imgs = Array.from(root.querySelectorAll("img"));
      await Promise.race([Promise.all(imgs.map((img) => img.decode().catch(() => {}))), new Promise((r) => window.setTimeout(r, 4000))]);
      if (live) ready.current(Array.from(root.querySelectorAll<HTMLElement>(":scope > .pdf-page")));
    }, 50);
    return () => {
      live = false;
      window.clearTimeout(t);
    };
  }, []);
  return createPortal(
    <div ref={ref} className="pdf-render" aria-hidden="true" style={{ position: "fixed", left: -20000, top: 0, width: A4_W_PX, pointerEvents: "none" }}>
      {children}
    </div>,
    document.body,
  );
}

// One A4 page of the PDF. `form`: 18 mm margins (payslips, forms), else 1 inch.
export function PdfPage({ children, form = false }: { children: React.ReactNode; form?: boolean }) {
  return (
    <div className="pdf-page" style={{ width: A4_W_PX, minHeight: A4_H_PX, padding: form ? 68 : 96, background: "#ffffff", color: "#111111", boxSizing: "border-box" }}>
      {children}
    </div>
  );
}

export function DownloadPdfButton({ filename, children, label = "Download PDF", className }: { filename: string; children: React.ReactNode; label?: string; className?: string }) {
  const [state, setState] = useState<"idle" | "working" | "done" | "error">("idle");
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => () => void (url && URL.revokeObjectURL(url)), [url]);

  async function onReady(pages: HTMLElement[]) {
    try {
      const blob = await buildPdf(pages);
      setUrl(saveBlob(blob, filename));
      setState("done");
    } catch (err) {
      console.error("PDF download failed", err);
      setState("error");
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={() => {
          setUrl(null);
          setState("working");
        }}
        disabled={state === "working"}
        className={
          className ??
          "flex items-center gap-1.5 rounded-lg bg-[var(--series-1)] px-3 py-1.5 text-xs font-medium text-[var(--on-accent)] disabled:opacity-60"
        }
      >
        {state === "working" ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
        {state === "working" ? "Preparing PDF…" : label}
      </button>
      {state === "done" && url && (
        <a href={url} target="_blank" rel="noopener noreferrer" download={filename} className="text-[11px] text-[var(--series-1)] underline">
          Download didn&rsquo;t start? Tap here to open the PDF
        </a>
      )}
      {state === "error" && <span className="text-[11px] text-[var(--status-critical)]">Couldn&rsquo;t make the PDF — please try again.</span>}
      {state === "working" && <PdfRender onReady={onReady}>{children}</PdfRender>}
    </div>
  );
}
