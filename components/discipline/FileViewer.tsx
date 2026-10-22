"use client";

import { useEffect } from "react";
import { Download, ExternalLink, X } from "lucide-react";

export interface ViewerFile {
  url: string; // signed link or blob: URL
  name: string;
  kind: "pdf" | "image";
}

export const viewerKind = (name: string): ViewerFile["kind"] => (/\.(png|jpe?g|webp|gif)$/i.test(name) ? "image" : "pdf");

// A notice / explanation shown inside the HRIS (over the record window)
// instead of in a new tab, with Download and Close.
export function FileViewer({ file, onClose }: { file: ViewerFile; onClose: () => void }) {
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
          <a href={file.url} target="_blank" rel="noreferrer" className="hidden items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40 sm:flex">
            <ExternalLink size={14} /> New tab
          </a>
          <a href={file.url} download={file.name} className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40">
            <Download size={14} /> Download
          </a>
          <button onClick={onClose} className="flex items-center gap-1 rounded-lg bg-[var(--series-1)] px-2.5 py-1.5 text-xs font-medium text-[var(--on-accent)]" aria-label="Close the file">
            <X size={14} /> Close
          </button>
        </div>
        <div className="min-h-0 flex-1 bg-[var(--gridline)]/30">
          {file.kind === "image" ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={file.url} alt={file.name} className="mx-auto h-full max-h-full object-contain" />
          ) : (
            <iframe src={file.url} title={file.name} className="h-full w-full border-0 bg-white" />
          )}
        </div>
        {file.kind === "pdf" && (
          <div className="border-t border-[var(--border-hairline)] px-3 py-1.5 text-[11px] text-[var(--text-muted)] sm:hidden">If the file doesn&rsquo;t show on your phone, tap Download to open it.</div>
        )}
      </div>
    </div>
  );
}
