"use client";

import { useCallback, useEffect, useState } from "react";
import { ExternalLink, ImagePlus, Plus, Save, Send, Trash2, Undo2, X } from "lucide-react";
import { Badge } from "@/components/Badge";
import { Modal } from "@/components/Modal";
import { reportSaveError } from "@/lib/save-errors";
import { currentCompanyId } from "@/lib/companies";
import { siteUrl } from "@/lib/careers";
import { COVER_ACCEPT, coverUrl, createNewsPost, deleteNewsPost, fetchNewsPosts, removeCover, updateNewsPost, uploadCover, type NewsPatch, type NewsPost } from "@/lib/news";

/* eslint-disable @next/next/no-img-element -- cover photos from the company-media bucket */

// HR: news and press releases for the public Newsroom (/news).

const input = "w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-2 text-sm";
const lbl = "mb-1 block text-xs font-medium text-[var(--text-secondary)]";
const primary = "flex items-center gap-1.5 rounded-lg bg-[var(--series-1)] px-3 py-2 text-sm font-medium text-[var(--on-accent)] disabled:opacity-40";
const secondary = "flex items-center gap-1.5 rounded-lg border border-[var(--border-hairline)] px-3 py-2 text-sm text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40 disabled:opacity-40";
const danger = "flex items-center gap-1.5 rounded-lg border border-[var(--status-critical)]/50 px-3 py-2 text-sm text-[var(--status-critical)] hover:bg-[var(--status-critical)]/10 disabled:opacity-40";
const day = (d: string | null) => (d ? new Date(`${d}T00:00:00+08:00`).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" }) : "");

export function NewsAdmin() {
  const [list, setList] = useState<NewsPost[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<NewsPost | "new" | null>(null);
  const load = useCallback(() => {
    fetchNewsPosts().then(
      (l) => {
        setList(l);
        setError(null);
      },
      (e) => setError(e instanceof Error ? e.message : "Couldn't load the news."),
    );
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => setEditing("new")} className={primary}>
          <Plus size={16} /> New article
        </button>
        <a href={siteUrl(currentCompanyId(), "news")} target="_blank" rel="noopener noreferrer" className={secondary}>
          <ExternalLink size={16} /> View the Newsroom
        </a>
      </div>
      {error && <div className="text-sm text-[var(--status-critical)]">{error}</div>}
      {list === null && !error && <div className="text-sm text-[var(--text-muted)]">Loading…</div>}
      {list && list.length === 0 && <div className="rounded-xl border border-dashed border-[var(--border-hairline)] p-6 text-center text-sm text-[var(--text-muted)]">No articles yet.</div>}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {list?.map((n) => (
          <button key={n.id} onClick={() => setEditing(n)} className="flex flex-col overflow-hidden rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-1)] text-left hover:bg-[var(--gridline)]/30">
            <div className="aspect-[16/9] bg-[var(--gridline)]">{n.coverPath && <img src={coverUrl(n.coverPath) ?? ""} alt="" className="h-full w-full object-cover" />}</div>
            <div className="flex flex-1 flex-col gap-1.5 p-3">
              <div className="flex items-center gap-2">
                <Badge tone={n.status === "published" ? "good" : "info"}>{n.status === "published" ? "Published" : "Draft"}</Badge>
                {n.publishedOn && <span className="text-xs text-[var(--text-muted)]">{day(n.publishedOn)}</span>}
              </div>
              <div className="line-clamp-2 text-sm font-semibold text-[var(--text-primary)]">{n.title}</div>
              {n.summary && <div className="line-clamp-2 text-xs text-[var(--text-muted)]">{n.summary}</div>}
            </div>
          </button>
        ))}
      </div>
      {editing && (
        <NewsModal
          post={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function NewsModal({ post, onClose, onSaved }: { post: NewsPost | null; onClose: () => void; onSaved: () => void }) {
  const [v, setV] = useState<NewsPatch>(post ?? {});
  const [busy, setBusy] = useState(false);
  const set = (p: NewsPatch) => setV((c) => ({ ...c, ...p }));
  const status = post?.status ?? "draft";
  // Photos uploaded in this edit that aren't kept get removed again.
  const [uploaded, setUploaded] = useState<string[]>([]);

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setBusy(true);
    try {
      const path = await uploadCover(f);
      setUploaded((u) => [...u, path]);
      set({ coverPath: path });
    } catch (err) {
      reportSaveError("Couldn't upload the photo", err);
    } finally {
      setBusy(false);
    }
  }

  async function close() {
    await Promise.all(uploaded.map(removeCover));
    onClose();
  }

  async function save(next?: NewsPost["status"]) {
    if (!v.title?.trim() || v.title.trim().length < 2) return reportSaveError("Type the title.");
    if (next === "published" && !v.body?.trim()) return reportSaveError("Write the article before publishing.");
    setBusy(true);
    try {
      const patch: NewsPatch = { ...v, title: v.title.trim(), ...(next ? { status: next } : {}) };
      if (post) await updateNewsPost(post.id, patch);
      else await createNewsPost(patch);
      // Photos replaced or removed in this edit.
      const keep = patch.coverPath ?? null;
      await Promise.all([...uploaded, ...(post?.coverPath ? [post.coverPath] : [])].filter((p) => p !== keep).map(removeCover));
      onSaved();
    } catch (e) {
      reportSaveError("Couldn't save the article", e);
      setBusy(false);
    }
  }

  const cover = coverUrl(v.coverPath ?? null);
  return (
    <Modal open onClose={close} title={post ? "Article" : "New article"} wide>
      <div className="space-y-3">
        <label className="block">
          <span className={lbl}>Title *</span>
          <input className={input} value={v.title ?? ""} onChange={(e) => set({ title: e.target.value })} placeholder="e.g. LSMBiz opens a new branch in Tarlac" />
        </label>
        <label className="block">
          <span className={lbl}>Short summary (shown on the card)</span>
          <textarea rows={2} className={input} maxLength={400} value={v.summary ?? ""} onChange={(e) => set({ summary: e.target.value })} />
        </label>
        <div>
          <span className={lbl}>Cover photo (JPG, PNG or WebP, up to 5 MB — anyone with the link can see it)</span>
          {cover ? (
            <div className="relative">
              <img src={cover} alt="" className="aspect-[16/9] w-full rounded-lg object-cover" />
              <button onClick={() => set({ coverPath: null })} className="absolute top-2 right-2 rounded-full bg-black/60 p-1.5 text-white" aria-label="Remove the photo">
                <X size={15} />
              </button>
            </div>
          ) : (
            <label className={`${secondary} w-fit cursor-pointer`}>
              <ImagePlus size={16} /> {busy ? "Uploading…" : "Add a photo"}
              <input type="file" accept={COVER_ACCEPT} className="hidden" onChange={pick} disabled={busy} />
            </label>
          )}
        </div>
        <label className="block">
          <span className={lbl}>Article</span>
          <textarea rows={10} className={input} value={v.body ?? ""} onChange={(e) => set({ body: e.target.value })} placeholder="Write the full story. Leave a blank line between paragraphs." />
        </label>
        <label className="block w-fit">
          <span className={lbl}>Date shown (set when published)</span>
          <input type="date" className={input} value={v.publishedOn ?? ""} onChange={(e) => set({ publishedOn: e.target.value || null })} />
        </label>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Badge tone={status === "published" ? "good" : "info"}>{status === "published" ? "Published — on the website" : "Draft — only HR sees it"}</Badge>
        <div className="ml-auto flex flex-wrap gap-2">
          {post && (
            <button disabled={busy} onClick={() => window.confirm("Delete this article?") && deleteNewsPost(post).then(onSaved, (e) => reportSaveError("Couldn't delete", e))} className={danger}>
              <Trash2 size={15} /> Delete
            </button>
          )}
          <button disabled={busy} onClick={() => save()} className={secondary}>
            <Save size={15} /> Save{status === "draft" ? " draft" : ""}
          </button>
          {status === "published" ? (
            <button disabled={busy} onClick={() => save("draft")} className={secondary}>
              <Undo2 size={15} /> Unpublish
            </button>
          ) : (
            <button disabled={busy} onClick={() => save("published")} className={primary}>
              <Send size={15} /> Publish
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
