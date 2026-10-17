"use client";

import { useState } from "react";
import { Copy, Download, KeyRound } from "lucide-react";
import { useHris } from "@/lib/store";
import { Modal } from "@/components/Modal";
import { fullName } from "@/lib/helpers";
import { issueEmployeeLogin } from "@/lib/supabase/account";
import { currentCompany } from "@/lib/companies";
import { loginSheetBlob } from "@/lib/login-sheet";
import type { Employee } from "@/lib/types";

// HR-only: create logins for every active employee who doesn't have one yet,
// one after another through the same route as the per-employee button
// (EmployeeLoginButton). The temporary passwords are listed once, to copy or
// download and hand over; each employee must choose their own password the
// first time they sign in.

interface Result {
  employee: Employee;
  email?: string;
  password?: string;
  error?: string;
}

export function BulkLoginButton({ employees }: { employees: Employee[] }) {
  const { recordLoginIssued } = useHris();
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<Result[] | null>(null);
  const [copied, setCopied] = useState(false);

  const pending = employees
    .filter((e) => (e.status === "active" || e.status === "on_leave") && !e.hasLogin)
    .sort((a, b) => a.employeeNumber.localeCompare(b.employeeNumber));
  const withEmail = pending.filter((e) => e.email?.trim());
  const noEmail = pending.filter((e) => !e.email?.trim());

  function close() {
    if (running) return;
    setOpen(false);
    setResults(null);
    setCopied(false);
  }

  async function run() {
    setRunning(true);
    const out: Result[] = [];
    for (const employee of withEmail) {
      const res = await issueEmployeeLogin(employee.id);
      if ("error" in res) out.push({ employee, error: res.error });
      else {
        out.push({ employee, email: res.email, password: res.password });
        recordLoginIssued(employee.id, res.created);
      }
      setResults([...out]);
    }
    setRunning(false);
  }

  const created = (results ?? []).filter((r) => r.password);

  function asText() {
    const lines = [["Employee No.", "Name", "Email", "Temporary password"].join("\t")];
    for (const r of created) lines.push([r.employee.employeeNumber, fullName(r.employee), r.email ?? "", r.password ?? ""].join("\t"));
    return lines.join("\n");
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(asText());
      setCopied(true);
    } catch {
      // Clipboard blocked — the list is still on screen and downloadable.
    }
  }

  async function download() {
    const company = currentCompany();
    const blob = await loginSheetBlob(
      created.map((r) => ({ employee: r.employee, email: r.email ?? "", password: r.password ?? "" })),
      company.name,
      window.location.origin,
      company.idCardColor ?? "#0a3326",
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${company.shortName} employee logins.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="flex items-center gap-1.5 rounded-lg border border-[var(--border-hairline)] px-3 py-2 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40">
        <KeyRound size={16} /> Create logins
      </button>
      <Modal open={open} onClose={close} title="Create logins for employees" wide>
        {results ? (
          <div className="space-y-3">
            <div className="text-sm text-[var(--text-secondary)]">
              {running
                ? `Creating logins… ${results.length} of ${withEmail.length}`
                : `${created.length} login${created.length === 1 ? "" : "s"} created. Copy or download this list now — the passwords are shown only once. Each employee chooses their own password the first time they sign in.`}
            </div>
            <div className="max-h-[50vh] overflow-auto rounded-lg border border-[var(--border-hairline)]">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-[var(--surface-1)] text-left text-xs text-[var(--text-muted)]">
                  <tr>
                    <th className="px-3 py-2 font-medium">Employee</th>
                    <th className="px-3 py-2 font-medium">Email</th>
                    <th className="px-3 py-2 font-medium">Temporary password</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r) => (
                    <tr key={r.employee.id} className="border-t border-[var(--border-hairline)]">
                      <td className="px-3 py-1.5">
                        <div className="text-[var(--text-primary)]">{fullName(r.employee)}</div>
                        <div className="text-xs text-[var(--text-muted)]">{r.employee.employeeNumber}</div>
                      </td>
                      <td className="px-3 py-1.5 text-[var(--text-secondary)]">{r.email ?? r.employee.email}</td>
                      <td className="px-3 py-1.5">
                        {r.password ? <span className="font-mono text-[var(--text-primary)]">{r.password}</span> : <span className="text-xs text-[var(--status-critical)]">{r.error}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!running && (
              <div className="flex justify-end gap-2">
                <button onClick={copy} disabled={!created.length} className="flex items-center gap-1.5 rounded-lg border border-[var(--border-hairline)] px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40 disabled:opacity-40">
                  <Copy size={14} /> {copied ? "Copied" : "Copy list"}
                </button>
                <button onClick={download} disabled={!created.length} className="flex items-center gap-1.5 rounded-lg border border-[var(--border-hairline)] px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40 disabled:opacity-40">
                  <Download size={14} /> Download Excel
                </button>
                <button onClick={close} className="rounded-lg bg-[var(--series-1)] px-3 py-1.5 text-sm font-medium text-[var(--on-accent)]">Done</button>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3 text-sm text-[var(--text-secondary)]">
            {withEmail.length ? (
              <div>
                {`This creates a login with a temporary password for ${withEmail.length} active employee${withEmail.length === 1 ? "" : "s"} who don’t have one yet, using the email on file. Employees who already have a login aren’t changed.`}
              </div>
            ) : (
              <div>Every active employee with an email on file already has a login.</div>
            )}
            {noEmail.length > 0 && (
              <div className="rounded-lg bg-[var(--gridline)]/30 p-3 text-xs">
                Skipped — no email on file (add one with Edit first): {noEmail.map((e) => fullName(e)).join(", ")}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button onClick={close} className="rounded-lg px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40">Cancel</button>
              <button onClick={run} disabled={!withEmail.length} className="rounded-lg bg-[var(--series-1)] px-3 py-1.5 text-sm font-medium text-[var(--on-accent)] disabled:opacity-40">
                Create {withEmail.length} login{withEmail.length === 1 ? "" : "s"}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
