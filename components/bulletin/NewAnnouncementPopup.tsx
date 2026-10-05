"use client";

import { companyStorageKey } from "@/lib/companies";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Megaphone, X } from "lucide-react";
import { useHris } from "@/lib/store";
import { Badge } from "@/components/Badge";
import { formatDate } from "@/lib/helpers";
import { AnnouncementPhotoGrid } from "@/components/bulletin/AnnouncementPhotos";
import { AnnouncementFileList } from "@/components/bulletin/AnnouncementFiles";
import { CATEGORY_LABELS, CATEGORY_TONE } from "@/components/bulletin/categories";

// For a day after it's posted, a new announcement pops up over the (blurred)
// app when someone opens it, until they close it. Closed posts are
// remembered per person in this browser.
const SHOW_FOR_MS = 24 * 60 * 60 * 1000;
const storageKey = (who: string) => companyStorageKey(`hris.seenAnnouncements.${who}`);

function readSeen(who: string): string[] {
  try {
    const raw = window.localStorage.getItem(storageKey(who));
    const ids = raw ? JSON.parse(raw) : [];
    return Array.isArray(ids) ? ids : [];
  } catch {
    return [];
  }
}
function writeSeen(who: string, ids: string[]) {
  try {
    window.localStorage.setItem(storageKey(who), JSON.stringify(ids.slice(-200)));
  } catch {
    // Storage blocked: it just shows again next time.
  }
}

export function NewAnnouncementPopup() {
  const { announcements, currentUser } = useHris();
  const who = currentUser?.employeeId ?? currentUser?.id ?? "";
  // Read once on mount (the browser's saved list); updated as posts are closed.
  const [seen, setSeen] = useState<string[] | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is only available in the browser
    if (who) setSeen(readSeen(who));
  }, [who]);
  const [now] = useState(() => Date.now());

  const queue = useMemo(() => {
    if (!seen || !currentUser) return [];
    return announcements
      .filter((a) => {
        const t = new Date(a.postedAt).getTime();
        return now - t < SHOW_FOR_MS && t <= now + 60_000 && a.postedBy !== currentUser.name && !seen.includes(a.id);
      })
      .sort((a, b) => (a.postedAt < b.postedAt ? 1 : -1));
  }, [announcements, seen, currentUser, now]);
  const post = queue[0];

  function close(all = false) {
    if (!post) return;
    const next = [...(seen ?? []), ...(all ? queue.map((a) => a.id) : [post.id])];
    setSeen(next);
    writeSeen(who, next);
  }

  useEffect(() => {
    if (!post) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!post) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="new-announcement-title">
      <div className="flex max-h-[80vh] w-full flex-col overflow-hidden rounded-2xl border border-[var(--border-hairline)] bg-[var(--surface-1)] shadow-2xl sm:max-h-[60vh] sm:w-1/2 sm:min-w-[420px]">
        <div className="flex items-center gap-2 border-b border-[var(--border-hairline)] px-5 py-3">
          <Megaphone size={16} className="shrink-0 text-[var(--series-1)]" />
          <span className="text-xs font-medium tracking-wide text-[var(--text-muted)] uppercase">
            New on the Bulletin Board{queue.length > 1 ? ` · 1 of ${queue.length}` : ""}
          </span>
          <button onClick={() => close()} className="ml-auto rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-[var(--gridline)]/50 hover:text-[var(--text-primary)]" aria-label="Close announcement">
            <X size={18} />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <h2 id="new-announcement-title" className="text-lg font-semibold text-[var(--text-primary)]">{post.title}</h2>
            <Badge tone={CATEGORY_TONE[post.category]}>{CATEGORY_LABELS[post.category]}</Badge>
          </div>
          <p className="text-sm whitespace-pre-line text-[var(--text-secondary)]">{post.body}</p>
          <AnnouncementPhotoGrid images={post.images ?? []} />
          <AnnouncementFileList files={post.files ?? []} />
          <div className="mt-3 text-xs text-[var(--text-muted)]">Posted by {post.postedBy} · {formatDate(post.postedAt)}</div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[var(--border-hairline)] px-5 py-3">
          <Link href="/bulletin" onClick={() => close(true)} className="mr-auto text-xs text-[var(--series-1)] hover:underline">
            Open Bulletin Board
          </Link>
          {queue.length > 1 && (
            <button onClick={() => close(true)} className="rounded-lg px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40">
              Close all
            </button>
          )}
          <button onClick={() => close()} className="rounded-lg bg-[var(--series-1)] px-4 py-1.5 text-sm font-medium text-[var(--on-accent)]">
            {queue.length > 1 ? "Next" : "Got it"}
          </button>
        </div>
      </div>
    </div>
  );
}
