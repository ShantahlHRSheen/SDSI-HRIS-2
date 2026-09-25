"use client";

import { useCallback, useEffect, useState } from "react";
import { MessageCircle, Trash2 } from "lucide-react";
import { reportSaveError } from "@/lib/save-errors";
import {
  deleteComment,
  fetchBulletinInteractions,
  insertComment,
  setReaction,
  type AnnouncementComment,
  type AnnouncementReaction,
  type ReactionKind,
} from "@/lib/supabase/bulletin";

export const REACTIONS: { kind: ReactionKind; emoji: string; label: string }[] = [
  { kind: "like", emoji: "👍", label: "Like" },
  { kind: "heart", emoji: "❤️", label: "Heart" },
  { kind: "celebrate", emoji: "🎉", label: "Celebrate" },
];

function timeAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
}

export interface BulletinInteractions {
  available: boolean;
  comments: AnnouncementComment[];
  reactions: AnnouncementReaction[];
  addComment: (announcementId: string, body: string) => Promise<boolean>;
  removeComment: (comment: AnnouncementComment) => void;
  react: (announcementId: string, kind: ReactionKind) => void;
}

// Loads every post's comments and reactions once for the Bulletin Board and
// applies changes optimistically, rolling back (with a "not saved" message)
// if the database refuses.
export function useBulletinInteractions(myEmployeeId: string | null, enabled: boolean): BulletinInteractions {
  const [available, setAvailable] = useState(false);
  const [comments, setComments] = useState<AnnouncementComment[]>([]);
  const [reactions, setReactions] = useState<AnnouncementReaction[]>([]);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    fetchBulletinInteractions()
      .then((d) => {
        if (!active) return;
        setComments(d.comments);
        setReactions(d.reactions);
        setAvailable(true);
      })
      .catch((err) => console.warn("Comments/reactions unavailable — has migrate_phase14 been run?", err));
    return () => {
      active = false;
    };
  }, [enabled]);

  const addComment = useCallback(
    async (announcementId: string, body: string) => {
      if (!myEmployeeId) return false;
      try {
        const c = await insertComment(announcementId, myEmployeeId, body);
        setComments((prev) => [...prev, c]);
        return true;
      } catch (err) {
        reportSaveError("Couldn't post your comment", err);
        return false;
      }
    },
    [myEmployeeId],
  );

  const removeComment = useCallback((comment: AnnouncementComment) => {
    setComments((prev) => prev.filter((c) => c.id !== comment.id));
    deleteComment(comment.id).catch((err) => {
      setComments((prev) => [...prev, comment].sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
      reportSaveError("Couldn't delete the comment", err);
    });
  }, []);

  const react = useCallback(
    (announcementId: string, kind: ReactionKind) => {
      if (!myEmployeeId) return;
      const isMine = (r: AnnouncementReaction) => r.announcementId === announcementId && r.employeeId === myEmployeeId;
      const previous = reactions.find(isMine);
      const next: ReactionKind | null = previous?.reaction === kind ? null : kind; // clicking your reaction again removes it
      setReactions((prev) => [...prev.filter((r) => !isMine(r)), ...(next ? [{ announcementId, employeeId: myEmployeeId, reaction: next }] : [])]);
      setReaction(announcementId, myEmployeeId, next).catch((err) => {
        setReactions((prev) => [...prev.filter((r) => !isMine(r)), ...(previous ? [previous] : [])]);
        reportSaveError("Couldn't save your reaction", err);
      });
    },
    [myEmployeeId, reactions],
  );

  return { available, comments, reactions, addComment, removeComment, react };
}

export function PostInteractions({
  announcementId,
  interactions,
  myEmployeeId,
  canModerate,
}: {
  announcementId: string;
  interactions: BulletinInteractions;
  myEmployeeId: string | null;
  canModerate: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);
  if (!interactions.available) return null;

  const postComments = interactions.comments.filter((c) => c.announcementId === announcementId);
  const postReactions = interactions.reactions.filter((r) => r.announcementId === announcementId);
  const mine = postReactions.find((r) => r.employeeId === myEmployeeId)?.reaction;

  async function submit() {
    const body = draft.trim();
    if (!body) return;
    setPosting(true);
    const ok = await interactions.addComment(announcementId, body);
    setPosting(false);
    if (ok) setDraft("");
  }

  return (
    <div className="mt-3 border-t border-[var(--gridline)] pt-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {REACTIONS.map((r) => {
          const count = postReactions.filter((x) => x.reaction === r.kind).length;
          const selected = mine === r.kind;
          return (
            <button
              key={r.kind}
              onClick={() => interactions.react(announcementId, r.kind)}
              disabled={!myEmployeeId}
              aria-pressed={selected}
              title={selected ? `Remove your ${r.label}` : r.label}
              className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-colors ${
                selected
                  ? "border-[var(--series-1)] bg-[color-mix(in_srgb,var(--series-1)_15%,transparent)] text-[var(--text-primary)]"
                  : "border-[var(--border-hairline)] text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40"
              }`}
            >
              <span aria-hidden>{r.emoji}</span>
              <span>{r.label}</span>
              {count > 0 && <span className="tabular font-medium">{count}</span>}
            </button>
          );
        })}
        <button
          onClick={() => setOpen((v) => !v)}
          className="ml-auto flex items-center gap-1 rounded-full px-2.5 py-1 text-xs text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40"
          aria-expanded={open}
        >
          <MessageCircle size={14} /> {postComments.length === 0 ? "Comment" : `${postComments.length} comment${postComments.length > 1 ? "s" : ""}`}
        </button>
      </div>

      {open && (
        <div className="mt-2 space-y-2">
          {postComments.map((c) => (
            <div key={c.id} className="group rounded-lg bg-[var(--gridline)]/20 px-3 py-2">
              <div className="flex items-center gap-2 text-xs">
                <span className="font-medium text-[var(--text-primary)]">{c.authorName || "Employee"}</span>
                <span className="text-[var(--text-muted)]">{timeAgo(c.createdAt)}</span>
                {(c.employeeId === myEmployeeId || canModerate) && (
                  <button
                    onClick={() => {
                      if (window.confirm("Delete this comment?")) interactions.removeComment(c);
                    }}
                    className="ml-auto rounded p-0.5 text-[var(--text-muted)] hover:text-[var(--status-critical)]"
                    aria-label="Delete comment"
                    title="Delete comment"
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
              <p className="mt-0.5 text-sm whitespace-pre-line text-[var(--text-secondary)]">{c.body}</p>
            </div>
          ))}
          {myEmployeeId && (
            <div className="flex items-end gap-2">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void submit();
                  }
                }}
                rows={1}
                maxLength={2000}
                placeholder="Write a comment…"
                aria-label="Write a comment"
                className="min-h-[36px] flex-1 resize-y rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-2 text-sm"
              />
              <button
                onClick={() => void submit()}
                disabled={posting || !draft.trim()}
                className="rounded-lg bg-[var(--series-1)] px-3 py-2 text-sm font-medium text-[var(--on-accent)] disabled:opacity-40"
              >
                {posting ? "Posting…" : "Post"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
