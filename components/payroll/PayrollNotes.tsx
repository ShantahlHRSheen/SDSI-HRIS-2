"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, NotebookPen, Plus, Trash2 } from "lucide-react";
import { formatDate, fullName } from "@/lib/helpers";
import { todayInManila } from "@/lib/leave-policy";
import { NOTES_MISSING, addPayrollNote, deletePayrollNote, fetchPayrollNotes, setPayrollNoteDone, upcomingCutoffs, type PayrollNote } from "@/lib/payroll-notes";
import type { Employee, PayrollPeriod } from "@/lib/types";

const input = "rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-2 text-sm";

export function usePayrollNotes() {
  const [notes, setNotes] = useState<PayrollNote[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(() => {
    fetchPayrollNotes().then(
      (n) => (setNotes(n), setError(null)),
      (e: Error) => (e.message === NOTES_MISSING ? setNotes(null) : setError(e.message)),
    );
  }, []);
  useEffect(() => reload(), [reload]);
  return { notes, error, reload };
}

// The notes for the selected cut-off, and adding one (for this or a later
// cut-off).
export function PayrollNotesPanel({
  period,
  periods,
  employees,
  notes,
  canManage,
  onChanged,
}: {
  period: PayrollPeriod;
  periods: PayrollPeriod[];
  employees: Employee[];
  notes: PayrollNote[];
  canManage: boolean;
  onChanged: () => void;
}) {
  const today = useMemo(() => todayInManila(), []);
  const mine = notes.filter((n) => n.cutoffEnd === period.end);
  const open = mine.filter((n) => !n.doneAt);
  const later = notes.filter((n) => n.cutoffEnd > period.end && !n.doneAt);
  const [adding, setAdding] = useState(false);
  const [cutoff, setCutoff] = useState(period.end);
  const [employeeId, setEmployeeId] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);

  // This cut-off, the ones set up, and the next semi-monthly ones.
  const cutoffs = useMemo(() => {
    const set = new Set([period.end, ...periods.filter((p) => p.end >= today).map((p) => p.end), ...upcomingCutoffs(today)]);
    return [...set].sort();
  }, [period.end, periods, today]);
  const people = useMemo(() => employees.filter((e) => e.status === "active" || e.status === "on_leave").sort((a, b) => fullName(a).localeCompare(fullName(b))), [employees]);
  const nameOf = (id: string | null) => {
    if (!id) return "Whole payroll";
    const e = employees.find((x) => x.id === id);
    return e ? fullName(e) : id;
  };

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save.");
    } finally {
      setBusy(false);
    }
  }

  const row = (n: PayrollNote, showCutoff = false) => (
    <li key={n.id} className="flex items-start gap-2 rounded-lg bg-[var(--gridline)]/20 px-3 py-2">
      {canManage && <input type="checkbox" checked={!!n.doneAt} disabled={busy} onChange={(e) => run(() => setPayrollNoteDone(n.id, e.target.checked))} className="mt-1" aria-label="Done" />}
      <div className={`min-w-0 flex-1 ${n.doneAt ? "opacity-60" : ""}`}>
        <div className={`text-sm whitespace-pre-wrap text-[var(--text-primary)] ${n.doneAt ? "line-through" : ""}`}>
          <span className="font-medium">{nameOf(n.employeeId)}</span> — {n.note}
        </div>
        <div className="text-[11px] text-[var(--text-muted)]">
          {showCutoff && <>For the {formatDate(n.cutoffEnd)} cut-off · </>}
          {n.createdByName || "—"} · {formatDate(n.createdAt)}
          {n.doneAt && ` · done by ${n.doneByName ?? "—"} ${formatDate(n.doneAt)}`}
        </div>
      </div>
      {canManage && (
        <button onClick={() => run(() => deletePayrollNote(n.id))} disabled={busy} className="rounded p-1 text-[var(--text-muted)] hover:text-[var(--status-critical)]" aria-label="Delete note">
          <Trash2 size={14} />
        </button>
      )}
    </li>
  );

  return (
    <div className="mb-4 rounded-xl border border-[var(--status-warning)]/40 bg-[var(--surface-1)] p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-medium text-[var(--text-primary)]">
          <NotebookPen size={16} className="text-[var(--status-warning)]" /> Notes for this cut-off ({open.length} open)
        </div>
        <div className="flex items-center gap-3 text-xs">
          {mine.length > open.length && (
            <button onClick={() => setShowDone((v) => !v)} className="text-[var(--text-secondary)] hover:underline">
              {showDone ? "Hide done" : `Show done (${mine.length - open.length})`}
            </button>
          )}
          {canManage && !adding && (
            <button onClick={() => (setCutoff(period.end), setAdding(true))} className="flex items-center gap-1 font-medium text-[var(--series-1)] hover:underline">
              <Plus size={13} /> Add a note
            </button>
          )}
        </div>
      </div>
      {mine.length === 0 && !adding && <div className="text-xs text-[var(--text-muted)]">No notes for this cut-off.</div>}
      <ul className="space-y-1.5">{(showDone ? mine : open).map((n) => row(n))}</ul>

      {adding && (
        <div className="mt-3 space-y-2 rounded-lg border border-[var(--border-hairline)] p-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <select value={cutoff} onChange={(e) => setCutoff(e.target.value)} className={input} aria-label="Cut-off">
              {cutoffs.map((c) => (
                <option key={c} value={c}>
                  {formatDate(c)} cut-off{c === period.end ? " (this one)" : ""}
                </option>
              ))}
            </select>
            <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className={input} aria-label="Employee">
              <option value="">Whole payroll (no specific employee)</option>
              {people.map((e) => (
                <option key={e.id} value={e.id}>
                  {fullName(e)}
                </option>
              ))}
            </select>
          </div>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} maxLength={1000} placeholder="e.g. Reimburse the SSS loan deducted on Oct 31" className={`${input} w-full`} />
          <div className="flex justify-end gap-2">
            <button onClick={() => setAdding(false)} disabled={busy} className="rounded-lg px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40">
              Cancel
            </button>
            <button
              onClick={() =>
                run(async () => {
                  await addPayrollNote(cutoff, employeeId || null, text);
                  setText("");
                  setEmployeeId("");
                  setAdding(false);
                })
              }
              disabled={busy || !text.trim()}
              className="flex items-center gap-1.5 rounded-lg bg-[var(--series-1)] px-3 py-1.5 text-sm font-medium text-[var(--on-accent)] disabled:opacity-40"
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Add note
            </button>
          </div>
        </div>
      )}
      {later.length > 0 && (
        <details className="mt-3 text-xs text-[var(--text-secondary)]">
          <summary className="cursor-pointer">Notes for later cut-offs ({later.length})</summary>
          <ul className="mt-1.5 space-y-1.5">{later.map((n) => row(n, true))}</ul>
        </details>
      )}
      {error && <div className="mt-2 text-xs text-[var(--status-critical)]">{error}</div>}
    </div>
  );
}
