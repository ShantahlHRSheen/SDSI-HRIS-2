"use client";

import { useRef, useState } from "react";
import { Download, FileText, Paperclip, X } from "lucide-react";
import { useHris } from "@/lib/store";
import type { AnnouncementFile } from "@/lib/types";

export const MAX_FILES = 5;
const MAX_BYTES = 25 * 1024 * 1024;

// File types the "announcement-files" bucket accepts, by extension (some
// browsers report no type for Office files, so it's filled in from here).
const TYPES: Record<string, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  txt: "text/plain",
  csv: "text/csv",
  zip: "application/zip",
};
const ACCEPT = Object.keys(TYPES).map((e) => `.${e}`).join(",");

function withDocType(file: File): File | null {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const type = TYPES[ext];
  if (!type) return null;
  return file.type === type ? file : new File([file], file.name, { type });
}

export function fileSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

// Attached files on a posted announcement: open (PDFs, text) or download.
export function AnnouncementFileList({ files }: { files: AnnouncementFile[] }) {
  const { announcementFileUrl } = useHris();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!files.length) return null;

  async function open(file: AnnouncementFile, download: boolean) {
    setBusy(file.path);
    setError(null);
    // Open the tab first (popup blockers allow it only on the click itself).
    const tab = download ? null : window.open("", "_blank");
    try {
      const url = await announcementFileUrl(file, download);
      if (tab) tab.location.href = url;
      else {
        // The link is served as an attachment, so the page stays put.
        const link = document.createElement("a");
        link.href = url;
        link.download = file.name;
        document.body.appendChild(link);
        link.click();
        link.remove();
      }
    } catch {
      tab?.close();
      setError("Couldn't open the file — refresh and try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mt-3 space-y-1.5">
      {files.map((f) => {
        const viewable = f.type === "application/pdf" || f.type.startsWith("text/");
        return (
          <div key={f.path} className="flex items-center gap-2 rounded-lg border border-[var(--border-hairline)] bg-[var(--gridline)]/20 px-3 py-2 text-sm">
            <FileText size={16} className="shrink-0 text-[var(--text-muted)]" />
            <button
              onClick={() => open(f, !viewable)}
              disabled={busy === f.path}
              className="min-w-0 flex-1 truncate text-left text-[var(--text-primary)] hover:underline disabled:opacity-50"
              title={viewable ? "Open" : "Download"}
            >
              {f.name}
            </button>
            <span className="shrink-0 text-xs text-[var(--text-muted)]">{fileSize(f.size)}</span>
            <button
              onClick={() => open(f, true)}
              disabled={busy === f.path}
              className="flex shrink-0 items-center gap-1 rounded-md border border-[var(--border-hairline)] px-2 py-1 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40 disabled:opacity-50"
              aria-label={`Download ${f.name}`}
            >
              <Download size={12} /> Download
            </button>
          </div>
        );
      })}
      {error && <div className="text-xs text-[var(--status-critical)]">{error}</div>}
    </div>
  );
}

// File picker for the "Post announcement" form.
export function FilePicker({ files, onChange }: { files: File[]; onChange: (files: File[]) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  function add(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = "";
    setError(null);
    const typed: File[] = [];
    for (const f of picked) {
      const t = withDocType(f);
      if (!t) return setError(`"${f.name}" can't be attached — use PDF, Word, Excel, PowerPoint, TXT, CSV or ZIP (photos go under Photos).`);
      if (t.size > MAX_BYTES) return setError(`"${f.name}" is over 25 MB.`);
      typed.push(t);
    }
    const room = MAX_FILES - files.length;
    if (typed.length > room) setError(`Up to ${MAX_FILES} files per announcement — only the first ${Math.max(room, 0)} were added.`);
    onChange([...files, ...typed.slice(0, Math.max(room, 0))]);
  }

  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Files (optional, up to {MAX_FILES}) — PDF, Word, Excel, PowerPoint, TXT, CSV, ZIP · max 25 MB each</label>
      <input ref={inputRef} type="file" accept={ACCEPT} multiple className="hidden" onChange={add} />
      <div className="space-y-1.5">
        {files.map((f, i) => (
          <div key={`${f.name}-${i}`} className="flex items-center gap-2 rounded-lg border border-[var(--border-hairline)] px-3 py-1.5 text-sm">
            <FileText size={14} className="shrink-0 text-[var(--text-muted)]" />
            <span className="min-w-0 flex-1 truncate text-[var(--text-primary)]">{f.name}</span>
            <span className="shrink-0 text-xs text-[var(--text-muted)]">{fileSize(f.size)}</span>
            <button type="button" onClick={() => onChange(files.filter((_, j) => j !== i))} className="rounded p-0.5 text-[var(--text-muted)] hover:text-[var(--status-critical)]" aria-label={`Remove ${f.name}`}>
              <X size={14} />
            </button>
          </div>
        ))}
        {files.length < MAX_FILES && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex items-center gap-1.5 rounded-lg border border-dashed border-[var(--border-hairline)] px-3 py-2 text-xs text-[var(--text-muted)] hover:bg-[var(--gridline)]/30"
          >
            <Paperclip size={14} /> Attach files
          </button>
        )}
      </div>
      {error && <div className="mt-1 text-xs text-[var(--status-critical)]">{error}</div>}
    </div>
  );
}
