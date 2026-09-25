"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ImagePlus, X } from "lucide-react";
import { useHris } from "@/lib/store";
import { prepareUpload, withFileType } from "@/components/leave/LeaveAttachments";
import type { AnnouncementImage } from "@/lib/types";

export const MAX_PHOTOS = 5;
const MAX_BYTES = 10 * 1024 * 1024;
const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "image/gif"];

// Photo grid on a posted announcement. Links are fetched on demand (they
// expire after an hour); clicking a photo opens it full size.
export function AnnouncementPhotoGrid({ images }: { images: AnnouncementImage[] }) {
  const { announcementImageUrls } = useHris();
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [failed, setFailed] = useState(false);
  const key = images.map((i) => i.path).join("|");

  useEffect(() => {
    if (!images.length) return;
    let active = true;
    announcementImageUrls(images)
      .then((u) => active && setUrls(u))
      .catch(() => active && setFailed(true));
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-fetch only when the set of photos changes
  }, [key, announcementImageUrls]);

  if (!images.length) return null;
  if (failed) return <div className="mt-2 text-xs text-[var(--text-muted)]">Photos couldn&rsquo;t be loaded — refresh to try again.</div>;
  return (
    <div className={`mt-3 grid gap-2 ${images.length === 1 ? "grid-cols-1" : "grid-cols-2 sm:grid-cols-3"}`}>
      {images.map((img) =>
        urls[img.path] ? (
          <a key={img.path} href={urls[img.path]} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-lg border border-[var(--border-hairline)]">
            {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URLs from Supabase Storage */}
            <img src={urls[img.path]} alt={img.name} className={`w-full object-cover ${images.length === 1 ? "max-h-96" : "h-40"}`} loading="lazy" />
          </a>
        ) : (
          <div key={img.path} className={`animate-pulse rounded-lg bg-[var(--gridline)]/40 ${images.length === 1 ? "h-60" : "h-40"}`} />
        ),
      )}
    </div>
  );
}

// Photo picker for the "Post announcement" form, with previews.
export function PhotoPicker({ files, onChange }: { files: File[]; onChange: (files: File[]) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const previews = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews]);

  async function add(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []).map(withFileType);
    e.target.value = "";
    setError(null);
    const bad = picked.find((f) => !PHOTO_TYPES.includes(f.type));
    if (bad) return setError(`"${bad.name}" isn't a photo — use JPG, PNG, WebP, GIF or HEIC.`);
    const room = MAX_PHOTOS - files.length;
    if (picked.length > room) setError(`Up to ${MAX_PHOTOS} photos per announcement — only the first ${Math.max(room, 0)} were added.`);
    const prepared = await Promise.all(picked.slice(0, Math.max(room, 0)).map(prepareUpload));
    const tooBig = prepared.find((f) => f.size > MAX_BYTES);
    if (tooBig) return setError(`"${tooBig.name}" is over 10 MB.`);
    onChange([...files, ...prepared]);
  }

  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Photos (optional, up to {MAX_PHOTOS})</label>
      <input ref={inputRef} type="file" accept={PHOTO_TYPES.join(",")} multiple className="hidden" onChange={add} />
      <div className="flex flex-wrap gap-2">
        {previews.map((src, i) => (
          <div key={src} className="relative h-20 w-20 overflow-hidden rounded-lg border border-[var(--border-hairline)]">
            {/* eslint-disable-next-line @next/next/no-img-element -- local preview (blob URL) */}
            <img src={src} alt={files[i]?.name ?? ""} className="h-full w-full object-cover" />
            <button
              type="button"
              onClick={() => onChange(files.filter((_, j) => j !== i))}
              className="absolute top-1 right-1 rounded-full bg-black/60 p-0.5 text-white"
              aria-label={`Remove ${files[i]?.name ?? "photo"}`}
            >
              <X size={12} />
            </button>
          </div>
        ))}
        {files.length < MAX_PHOTOS && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-[var(--border-hairline)] text-xs text-[var(--text-muted)] hover:bg-[var(--gridline)]/30"
          >
            <ImagePlus size={18} /> Add
          </button>
        )}
      </div>
      {error && <div className="mt-1 text-xs text-[var(--status-critical)]">{error}</div>}
    </div>
  );
}
