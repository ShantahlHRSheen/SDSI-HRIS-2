"use client";

import { useState } from "react";
import { Copy, KeyRound } from "lucide-react";
import { useHris } from "@/lib/store";
import { Modal } from "@/components/Modal";
import { fullName } from "@/lib/helpers";
import { issueEmployeeLogin, type IssuedLogin } from "@/lib/supabase/account";
import type { Employee } from "@/lib/types";

// HR-only: issue a temporary password (creating the login if the employee
// doesn't have one). The employee must choose their own password the next
// time they sign in.
export function EmployeeLoginButton({ employee }: { employee: Employee }) {
  const { recordLoginIssued } = useHris();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [issued, setIssued] = useState<IssuedLogin | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const action = employee.hasLogin ? "Reset password" : "Create login";

  function close() {
    setOpen(false);
    setIssued(null);
    setError(null);
    setCopied(false);
  }

  async function issue() {
    setBusy(true);
    setError(null);
    const res = await issueEmployeeLogin(employee.id);
    setBusy(false);
    if ("error" in res) return setError(res.error);
    setIssued(res);
    recordLoginIssued(employee.id, res.created);
  }

  async function copy() {
    if (!issued) return;
    try {
      await navigator.clipboard.writeText(`Email: ${issued.email}\nTemporary password: ${issued.password}`);
      setCopied(true);
    } catch {
      // Clipboard blocked — the password is still shown to copy by hand.
    }
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="flex items-center gap-1.5 rounded-lg border border-[var(--border-hairline)] px-3 py-1.5 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40">
        <KeyRound size={14} /> {action}
      </button>
      <Modal open={open} onClose={close} title={`${action} — ${fullName(employee)}`}>
        {issued ? (
          <div className="space-y-3">
            <div className="text-sm text-[var(--text-secondary)]">
              {issued.created ? "Login created." : "Password reset."} Give these to {employee.firstName} privately — the password is shown only once.
            </div>
            <div className="space-y-1 rounded-lg bg-[var(--gridline)]/30 p-3 text-sm">
              <div><span className="text-[var(--text-muted)]">Email:</span> <span className="text-[var(--text-primary)]">{issued.email}</span></div>
              <div><span className="text-[var(--text-muted)]">Temporary password:</span> <span className="font-mono text-base text-[var(--text-primary)]">{issued.password}</span></div>
            </div>
            <div className="text-xs text-[var(--text-muted)]">They&rsquo;ll be asked to choose their own password as soon as they sign in.</div>
            <div className="flex justify-end gap-2">
              <button onClick={copy} className="flex items-center gap-1.5 rounded-lg border border-[var(--border-hairline)] px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40">
                <Copy size={14} /> {copied ? "Copied" : "Copy"}
              </button>
              <button onClick={close} className="rounded-lg bg-[var(--series-1)] px-3 py-1.5 text-sm font-medium text-[var(--on-accent)]">Done</button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="text-sm text-[var(--text-secondary)]">
              {employee.hasLogin
                ? `This replaces ${employee.firstName}'s current password with a temporary one. Their old password stops working immediately.`
                : employee.email
                  ? `This creates a login for ${employee.email} with a temporary password.`
                  : `${employee.firstName} has no email on file — add one with Edit first.`}
            </div>
            {error && <div className="text-xs text-[var(--status-critical)]">{error}</div>}
            <div className="flex justify-end gap-2">
              <button onClick={close} className="rounded-lg px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40">Cancel</button>
              <button
                onClick={issue}
                disabled={busy || (!employee.hasLogin && !employee.email)}
                className="rounded-lg bg-[var(--series-1)] px-3 py-1.5 text-sm font-medium text-[var(--on-accent)] disabled:opacity-40"
              >
                {busy ? "Working…" : action}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
