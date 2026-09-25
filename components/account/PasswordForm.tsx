"use client";

import { useState } from "react";
import { changeOwnPassword } from "@/lib/supabase/account";

const MIN_LENGTH = 8;

// New-password form. `requireCurrent` is false only for the forced change
// after signing in with a temporary password HR issued.
export function PasswordForm({ requireCurrent, onDone, onCancel }: { requireCurrent: boolean; onDone: () => void; onCancel?: () => void }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (next.length < MIN_LENGTH) return setError(`Use at least ${MIN_LENGTH} characters.`);
    if (next !== confirm) return setError("The two new passwords don't match.");
    setSaving(true);
    const err = await changeOwnPassword(next, requireCurrent ? current : undefined);
    setSaving(false);
    if (err) return setError(err);
    onDone();
  }

  const input = "w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-2 text-sm";
  return (
    <form onSubmit={submit} className="space-y-3">
      {requireCurrent && (
        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Current password</label>
          <input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} className={input} required />
        </div>
      )}
      <div>
        <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">New password</label>
        <input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} className={input} required />
        <div className="mt-1 text-xs text-[var(--text-muted)]">At least {MIN_LENGTH} characters. Don&rsquo;t reuse the temporary password HR gave you.</div>
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Confirm new password</label>
        <input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={input} required />
      </div>
      {error && <div className="text-xs text-[var(--status-critical)]">{error}</div>}
      <div className="flex justify-end gap-2 pt-1">
        {onCancel && (
          <button type="button" onClick={onCancel} className="rounded-lg px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40">
            Cancel
          </button>
        )}
        <button type="submit" disabled={saving} className="rounded-lg bg-[var(--series-1)] px-3 py-1.5 text-sm font-medium text-[var(--on-accent)] disabled:opacity-40">
          {saving ? "Saving…" : "Save password"}
        </button>
      </div>
    </form>
  );
}
