"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Lock, Pencil, Plus, Save, Search, ShieldAlert, Trash2 } from "lucide-react";
import { useHris } from "@/lib/store";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { Modal } from "@/components/Modal";
import { formatDate } from "@/lib/helpers";
import { todayInManila } from "@/lib/leave-policy";
import { CaseEditor, CaseExplanations, CaseFiles, CaseStatusBadge, CaseView, DownloadCaseButton } from "@/components/confidential/CaseReport";
import {
  CASE_STATUS,
  blankCase,
  canSeeConfidential,
  createConfidentialCase,
  deleteConfidentialCase,
  fetchConfidentialCases,
  updateConfidentialCase,
  type CaseInput,
  type CaseStatus,
  type ConfidentialCase,
} from "@/lib/confidential-cases";

const primary = "flex items-center gap-1.5 rounded-lg bg-[var(--series-1)] px-3 py-2 text-sm font-medium text-[var(--on-accent)] disabled:opacity-40";
const secondary = "flex items-center gap-1.5 rounded-lg border border-[var(--border-hairline)] px-3 py-2 text-sm text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40 disabled:opacity-40";

// Confidential Cases: HR's reports on sensitive cases, for the Chairman, the
// Vice Chairperson and HR only.
export default function ConfidentialCasesPage() {
  const { currentUser, currentEmployee, isRealAccount } = useHris();
  const roles = currentUser?.roles ?? [];
  const isHr = roles.includes("hr_admin");
  const allowed = canSeeConfidential(roles, currentEmployee?.id);
  const [items, setItems] = useState<ConfidentialCase[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ id: string | null; value: CaseInput } | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<CaseStatus | "">("");

  const load = useCallback(() => {
    if (!allowed || !isRealAccount) return;
    fetchConfidentialCases().then(
      (c) => (setItems(c), setError(null)),
      (e: Error) => setError(e.message),
    );
  }, [allowed, isRealAccount]);
  useEffect(() => load(), [load]);

  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (items ?? []).filter(
      (c) => (!statusFilter || c.status === statusFilter) && (!q || [c.title, c.summary, ...c.details.map((d) => d.value)].some((x) => x.toLowerCase().includes(q))),
    );
  }, [items, search, statusFilter]);
  const selected = (items ?? []).find((c) => c.id === selectedId) ?? list[0] ?? null;

  async function save() {
    if (!draft) return;
    setBusy(true);
    setError(null);
    try {
      if (draft.id) await updateConfidentialCase(draft.id, draft.value);
      else setSelectedId(await createConfidentialCase(draft.value));
      setDraft(null);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save.");
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!selected) return;
    setBusy(true);
    try {
      await deleteConfidentialCase(selected.id);
      setDeleting(false);
      setSelectedId(null);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't delete.");
    } finally {
      setBusy(false);
    }
  }

  if (!isRealAccount || !allowed) {
    return (
      <div>
        <PageHeader title="Confidential Cases" subtitle="For the Chairman, the Vice Chairperson and HR only." />
        <EmptyState icon={Lock} title="Not available" description="Only the Chairman, the Vice Chairperson and HR can open Confidential Cases." />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Confidential Cases"
        subtitle="Reports on sensitive cases — seen only by the Chairman, the Vice Chairperson and HR."
        actions={
          isHr &&
          !draft && (
            <button onClick={() => setDraft({ id: null, value: blankCase(todayInManila()) })} className={primary}>
              <Plus size={16} /> New case report
            </button>
          )
        }
      />
      <div className="mb-4 flex items-center gap-2 rounded-lg border border-[var(--status-critical)]/40 px-3 py-2 text-xs text-[var(--text-secondary)]">
        <ShieldAlert size={15} className="shrink-0 text-[var(--status-critical)]" /> Confidential. Share only on a need-to-know basis — don&rsquo;t forward screenshots or printouts.
      </div>
      {error && <div className="mb-4 rounded-lg border border-[var(--status-critical)]/40 px-3 py-2 text-sm text-[var(--status-critical)]">{error}</div>}

      {draft ? (
        <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-1)] p-4">
          <div className="mb-4 text-base font-semibold text-[var(--text-primary)]">{draft.id ? "Edit case report" : "New case report"}</div>
          <CaseEditor value={draft.value} onChange={(value) => setDraft({ ...draft, value })} />
          {draft.id && (
            <div className="mt-5">
              <CaseFiles caseId={draft.id} canManage />
            </div>
          )}
          {!draft.id && <div className="mt-4 text-xs text-[var(--text-muted)]">Save first, then attach files (written explanations, statements, photos).</div>}
          <div className="mt-5 flex justify-end gap-2">
            <button onClick={() => setDraft(null)} disabled={busy} className={secondary}>
              Cancel
            </button>
            <button onClick={save} disabled={busy || !draft.value.title.trim() || !draft.value.caseDate} className={primary}>
              {busy ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Save
            </button>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
          <div className="space-y-2">
            <div className="relative">
              <Search size={14} className="absolute top-2.5 left-2.5 text-[var(--text-muted)]" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search cases…" className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] py-2 pr-3 pl-8 text-sm" />
            </div>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as CaseStatus | "")} className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-2 text-sm">
              <option value="">All statuses</option>
              {(Object.keys(CASE_STATUS) as CaseStatus[]).map((s) => (
                <option key={s} value={s}>
                  {CASE_STATUS[s].label}
                </option>
              ))}
            </select>
            {items === null && !error && (
              <div className="flex items-center gap-2 py-4 text-sm text-[var(--text-muted)]">
                <Loader2 size={14} className="animate-spin" /> Loading…
              </div>
            )}
            {items && !list.length && <div className="py-4 text-sm text-[var(--text-muted)]">{items.length ? "No case matches." : "No cases yet."}</div>}
            {list.map((c) => (
              <button
                key={c.id}
                onClick={() => setSelectedId(c.id)}
                className={`w-full rounded-lg border px-3 py-2 text-left ${selected?.id === c.id ? "border-[var(--series-1)] bg-[var(--series-1)]/10" : "border-[var(--border-hairline)] bg-[var(--surface-1)] hover:bg-[var(--gridline)]/30"}`}
              >
                <div className="text-sm font-medium text-[var(--text-primary)]">{c.title}</div>
                <div className="mt-0.5 flex items-center gap-2 text-xs text-[var(--text-muted)]">
                  {formatDate(c.caseDate)} <CaseStatusBadge status={c.status} />
                </div>
              </button>
            ))}
          </div>

          <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-1)] p-4">
            {!selected ? (
              <EmptyState icon={Lock} title="No case selected" description={isHr ? "Start one with New case report." : "Case reports HR writes show here."} />
            ) : (
              <>
                <div className="mb-3 flex flex-wrap justify-end gap-2">
                  <DownloadCaseButton c={selected} />
                  {isHr && (
                    <>
                      <button
                        onClick={() =>
                          setDraft({
                            id: selected.id,
                            value: { title: selected.title, caseDate: selected.caseDate, status: selected.status, summary: selected.summary, details: selected.details, sections: selected.sections, actions: selected.actions, signoff: selected.signoff, explanations: selected.explanations },
                          })
                        }
                        className="flex items-center gap-1 rounded-lg border border-[var(--border-hairline)] px-2 py-1 text-xs text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40"
                      >
                        <Pencil size={12} /> Edit
                      </button>
                      <button onClick={() => setDeleting(true)} className="rounded-lg p-1.5 text-[var(--text-muted)] hover:text-[var(--status-critical)]" aria-label="Delete case">
                        <Trash2 size={14} />
                      </button>
                    </>
                  )}
                </div>
                <CaseView c={selected} />
                <div className="mt-5">
                  <CaseExplanations key={`x-${selected.id}`} c={selected} canManage={isHr} onChanged={load} />
                </div>
                <div className="mt-5">
                  <CaseFiles key={selected.id} caseId={selected.id} canManage={isHr} />
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {deleting && selected && (
        <Modal open onClose={() => !busy && setDeleting(false)} title="Delete this case report?">
          <p className="mb-4 text-sm text-[var(--text-secondary)]">&ldquo;{selected.title}&rdquo; and its attachments will be deleted. This can&rsquo;t be undone.</p>
          <div className="flex justify-end gap-2">
            <button onClick={() => setDeleting(false)} disabled={busy} className={secondary}>
              Cancel
            </button>
            <button onClick={remove} disabled={busy} className="rounded-lg bg-[var(--status-critical)] px-3 py-2 text-sm font-medium text-white disabled:opacity-40">
              Delete
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
