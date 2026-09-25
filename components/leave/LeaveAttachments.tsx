"use client";

import { useRef, useState } from "react";
import { Download, Paperclip, Upload } from "lucide-react";
import { useHris } from "@/lib/store";
import type { LeaveAttachment, LeaveAttachmentKind, LeaveRequest } from "@/lib/types";

export const ATTACHMENT_RETENTION_DAYS = 30;
export const ATTACHMENT_ACCEPT = "image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf";
const MAX_BYTES = 10 * 1024 * 1024;

export const KIND_LABEL: Record<LeaveAttachmentKind, string> = {
  leave_form: "Signed leave form",
  medical_certificate: "Medical certificate",
};

// Leave types that need a signed leave form (VL, SL); SL can also carry a
// medical certificate.
export function requiredKinds(leaveTypeId: string): LeaveAttachmentKind[] {
  if (leaveTypeId === "lt-sl") return ["leave_form", "medical_certificate"];
  if (leaveTypeId === "lt-vl") return ["leave_form"];
  return [];
}

// Phone photos of paper forms are often 3–8 MB; scale them down to a
// still-legible size before upload to save storage. PDFs, HEIC (which
// browsers can't decode) and already-small images go up unchanged.
export async function prepareUpload(file: File): Promise<File> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size < 1.5 * 1024 * 1024) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}

// Some browsers report no type for HEIC photos — infer it from the extension.
export function withFileType(file: File): File {
  if (file.type) return file;
  const ext = file.name.split(".").pop()?.toLowerCase();
  const type = ext === "heic" || ext === "heif" ? `image/${ext}` : ext === "pdf" ? "application/pdf" : ext === "jpg" || ext === "jpeg" ? "image/jpeg" : ext === "png" ? "image/png" : "";
  return type ? new File([file], file.name, { type }) : file;
}

export function validateUpload(file: File): string | null {
  if (!ATTACHMENT_ACCEPT.split(",").includes(file.type)) return "Upload a photo (JPG, PNG, HEIC) or a PDF.";
  if (file.size > MAX_BYTES) return "That file is over 10 MB — take a smaller photo or scan.";
  return null;
}

// The newest attachment of each kind for a request.
export function latestAttachments(attachments: LeaveAttachment[], requestId: string): Partial<Record<LeaveAttachmentKind, LeaveAttachment>> {
  const out: Partial<Record<LeaveAttachmentKind, LeaveAttachment>> = {};
  for (const a of attachments) {
    if (a.leaveRequestId !== requestId) continue;
    const cur = out[a.kind];
    if (!cur || a.uploadedAt > cur.uploadedAt) out[a.kind] = a;
  }
  return out;
}

// Per-request documents: download links for whoever can see the request,
// plus an upload button for the employee's own missing documents.
export function LeaveDocuments({ request, canUpload }: { request: LeaveRequest; canUpload: boolean }) {
  const { leaveAttachments, uploadLeaveAttachment, leaveAttachmentUrl, canAttachLeaveFiles } = useHris();
  const kinds = requiredKinds(request.leaveTypeId);
  const latest = latestAttachments(leaveAttachments, request.id);
  const [busy, setBusy] = useState<LeaveAttachmentKind | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [pendingKind, setPendingKind] = useState<LeaveAttachmentKind | null>(null);

  if (kinds.length === 0 && Object.keys(latest).length === 0) return <span className="text-xs text-[var(--text-muted)]">—</span>;

  async function download(a: LeaveAttachment) {
    setError(null);
    try {
      const url = await leaveAttachmentUrl(a);
      const link = document.createElement("a");
      link.href = url;
      link.rel = "noopener";
      link.click();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not download the file.");
    }
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0];
    e.target.value = "";
    if (!picked || !pendingKind) return;
    const raw = withFileType(picked);
    const invalid = validateUpload(raw);
    if (invalid) {
      setError(invalid);
      return;
    }
    setBusy(pendingKind);
    setError(null);
    const file = await prepareUpload(raw);
    const err = await uploadLeaveAttachment({ leaveRequestId: request.id, employeeId: request.employeeId, kind: pendingKind, file });
    setBusy(null);
    if (err) setError(err);
  }

  const shownKinds = [...new Set<LeaveAttachmentKind>([...kinds, ...(Object.keys(latest) as LeaveAttachmentKind[])])];

  return (
    <div className="space-y-1">
      <input ref={inputRef} type="file" accept={ATTACHMENT_ACCEPT} className="hidden" onChange={onFile} />
      {shownKinds.map((kind) => {
        const a = latest[kind];
        const short = kind === "leave_form" ? "Leave form" : "Med cert";
        if (a && !a.deletedAt) {
          return (
            <button key={kind} onClick={() => download(a)} className="flex items-center gap-1 text-xs text-[var(--series-1)] hover:underline" title={`${a.fileName} — uploaded ${a.uploadedAt.slice(0, 10)}`}>
              <Download size={12} /> {short}
            </button>
          );
        }
        if (a?.deletedAt) {
          return (
            <div key={kind} className="flex items-center gap-1 text-xs text-[var(--text-muted)]" title={`Deleted ${a.deletedAt.slice(0, 10)}, ${ATTACHMENT_RETENTION_DAYS} days after upload`}>
              <Paperclip size={12} /> {short} deleted
            </div>
          );
        }
        if (canUpload && canAttachLeaveFiles && request.status !== "cancelled") {
          return (
            <button
              key={kind}
              disabled={busy !== null}
              onClick={() => {
                setPendingKind(kind);
                inputRef.current?.click();
              }}
              className="flex items-center gap-1 text-xs text-[var(--status-warning)] hover:underline disabled:opacity-50"
            >
              <Upload size={12} /> {busy === kind ? "Uploading…" : `Upload ${short.toLowerCase()}`}
            </button>
          );
        }
        return (
          <div key={kind} className="text-xs text-[var(--text-muted)]">
            No {short.toLowerCase()}
          </div>
        );
      })}
      {error && <div className="text-xs text-[var(--status-critical)]">{error}</div>}
    </div>
  );
}
