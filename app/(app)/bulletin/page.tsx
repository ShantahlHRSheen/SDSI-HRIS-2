"use client";

import { useMemo, useState } from "react";
import { Cake, Megaphone, Plus } from "lucide-react";
import { useHris } from "@/lib/store";
import { PageHeader } from "@/components/PageHeader";
import { Badge, type BadgeTone } from "@/components/Badge";
import { Modal } from "@/components/Modal";
import { EmptyState } from "@/components/EmptyState";
import { formatDate, fullName } from "@/lib/helpers";
import { upcomingBirthdays } from "@/lib/dashboard-metrics";
import type { AnnouncementCategory } from "@/lib/types";

const CATEGORY_TONE: Record<AnnouncementCategory, BadgeTone> = {
  announcement: "info",
  holiday: "good",
  event: "warning",
  memo: "muted",
  policy: "serious",
};
const CATEGORY_LABELS: Record<AnnouncementCategory, string> = {
  announcement: "Announcement",
  holiday: "Holiday",
  event: "Event",
  memo: "Memo",
  policy: "Policy",
};

export default function BulletinBoardPage() {
  const { announcements, employees, currentUser, addAnnouncement } = useHris();
  const [categoryFilter, setCategoryFilter] = useState<"all" | AnnouncementCategory>("all");
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ title: "", body: "", category: "announcement" as AnnouncementCategory });

  const canPost = currentUser?.roles.some((r) => ["hr_admin", "upper_management"].includes(r));
  const birthdays = useMemo(() => upcomingBirthdays(employees, 14), [employees]);

  const rows = useMemo(
    () => announcements.filter((a) => (categoryFilter === "all" ? true : a.category === categoryFilter)).sort((a, b) => (a.postedAt < b.postedAt ? 1 : -1)),
    [announcements, categoryFilter],
  );

  function submit() {
    if (!form.title || !form.body || !currentUser) return;
    addAnnouncement({ title: form.title, body: form.body, category: form.category, postedBy: currentUser.name, expiresAt: null });
    setShowCreate(false);
    setForm({ title: "", body: "", category: "announcement" });
  }

  return (
    <div>
      <PageHeader
        title="Company Bulletin Board"
        subtitle="Announcements, holidays, events, memos, and policy updates — the first thing employees see on login."
        actions={
          canPost && (
            <button onClick={() => setShowCreate(true)} className="flex items-center gap-1.5 rounded-lg bg-[var(--series-1)] px-3 py-2 text-sm font-medium text-[var(--on-accent)]">
              <Plus size={16} /> Post announcement
            </button>
          )
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="mb-4 flex flex-wrap gap-2">
            <button onClick={() => setCategoryFilter("all")} className={`rounded-lg px-3 py-1.5 text-xs font-medium ${categoryFilter === "all" ? "bg-[var(--series-1)] text-[var(--on-accent)]" : "border border-[var(--border-hairline)] text-[var(--text-secondary)]"}`}>All</button>
            {(Object.keys(CATEGORY_LABELS) as AnnouncementCategory[]).map((c) => (
              <button key={c} onClick={() => setCategoryFilter(c)} className={`rounded-lg px-3 py-1.5 text-xs font-medium ${categoryFilter === c ? "bg-[var(--series-1)] text-[var(--on-accent)]" : "border border-[var(--border-hairline)] text-[var(--text-secondary)]"}`}>
                {CATEGORY_LABELS[c]}
              </button>
            ))}
          </div>

          {rows.length === 0 ? (
            <EmptyState icon={Megaphone} title="No announcements" description="Try a different category filter." />
          ) : (
            <div className="flex flex-col gap-3">
              {rows.map((a) => (
                <div key={a.id} className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-1)] p-4">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <h3 className="font-medium text-[var(--text-primary)]">{a.title}</h3>
                    <Badge tone={CATEGORY_TONE[a.category]}>{CATEGORY_LABELS[a.category]}</Badge>
                  </div>
                  <p className="text-sm text-[var(--text-secondary)]">{a.body}</p>
                  <div className="mt-2 text-xs text-[var(--text-muted)]">Posted by {a.postedBy} · {formatDate(a.postedAt)}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-1)] p-4">
          <div className="mb-3 flex items-center gap-1.5 text-sm font-medium text-[var(--text-primary)]"><Cake size={16} /> Birthday celebrants (14 days)</div>
          {birthdays.length === 0 ? (
            <div className="text-xs text-[var(--text-muted)]">No birthdays in the next two weeks.</div>
          ) : (
            <div className="flex flex-col divide-y divide-[var(--gridline)]">
              {birthdays.map(({ employee, daysUntil }) => (
                <div key={employee.id} className="flex items-center justify-between py-2 text-sm">
                  <span className="text-[var(--text-primary)]">{fullName(employee)}</span>
                  <Badge tone="info">{daysUntil === 0 ? "Today" : `in ${daysUntil}d`}</Badge>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Post announcement" wide>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Title</label>
            <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Category</label>
            <select value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as AnnouncementCategory }))} className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-2 text-sm">
              {(Object.keys(CATEGORY_LABELS) as AnnouncementCategory[]).map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Body</label>
            <textarea value={form.body} onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))} rows={4} className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-2 text-sm" />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={() => setShowCreate(false)} className="rounded-lg px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40">Cancel</button>
            <button onClick={submit} disabled={!form.title || !form.body} className="rounded-lg bg-[var(--series-1)] px-3 py-1.5 text-sm font-medium text-[var(--on-accent)] disabled:opacity-40">Post</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
