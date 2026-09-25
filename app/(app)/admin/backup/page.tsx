"use client";

import { useMemo, useState } from "react";
import { DatabaseBackup, Download, ShieldAlert } from "lucide-react";
import { useHris } from "@/lib/store";
import { EmptyState } from "@/components/EmptyState";
import { reportSaveError } from "@/lib/save-errors";
import { buildFullBackup, type BackupProgress } from "@/lib/supabase/backup";
import { TODAY, daysBetween } from "@/lib/mock-data";

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString("en-PH", { timeZone: "Asia/Manila", year: "numeric", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export default function BackupPage() {
  const { currentUser, isRealAccount, auditLogs } = useHris();
  const isHr = !!currentUser?.roles.includes("hr_admin");
  const [progress, setProgress] = useState<BackupProgress | null>(null);
  const [running, setRunning] = useState(false);
  const [justNow, setJustNow] = useState<{ at: string; by: string; rows: number } | null>(null);

  const last = useMemo(() => {
    if (justNow) return justNow;
    const log = auditLogs.filter((l) => l.module === "Backup").sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0];
    return log ? { at: log.createdAt, by: log.userName, rows: Number(/\((\d+) rows\)/.exec(log.description)?.[1] ?? 0) } : null;
  }, [auditLogs, justNow]);

  if (!isRealAccount || !isHr) {
    return <EmptyState icon={DatabaseBackup} title="Not available" description={isRealAccount ? "Only HR can download a full backup." : "Backups need a real sign-in (not the demo login)."} />;
  }

  async function download() {
    setRunning(true);
    setProgress(null);
    try {
      const { blob, fileName, rowCount } = await buildFullBackup(currentUser?.name ?? "HR", setProgress);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setJustNow({ at: new Date().toISOString(), by: currentUser?.name ?? "You", rows: rowCount });
    } catch (err) {
      reportSaveError("Couldn't create the backup", err);
    } finally {
      setRunning(false);
      setProgress(null);
    }
  }

  const lastDay = last ? new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(last.at)) : null;
  const daysSince = lastDay ? daysBetween(lastDay, TODAY) : null;

  return (
    <div className="max-w-2xl space-y-4">
      <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-1)] p-4">
        <div className="mb-1 flex items-center gap-2 text-sm font-medium text-[var(--text-primary)]">
          <DatabaseBackup size={16} /> Full backup
        </div>
        <p className="text-sm text-[var(--text-secondary)]">
          Downloads a complete copy of the HRIS data — employees, attendance, leave, overtime, payroll, payslips, vouchers, BIR forms, evaluations, discipline, announcements, chats and the audit log — as one file. Keep it so the data can be restored if something is deleted or overwritten by mistake.
        </p>
        <div className="mt-3 text-sm">
          {last ? (
            <span className={daysSince !== null && daysSince > 7 ? "text-[var(--status-warning)]" : "text-[var(--text-secondary)]"}>
              Last backup: {formatWhen(last.at)} by {last.by}
              {daysSince !== null && daysSince > 0 ? ` (${daysSince} day${daysSince === 1 ? "" : "s"} ago)` : ""}
            </span>
          ) : (
            <span className="text-[var(--status-warning)]">No backup has been downloaded yet.</span>
          )}
        </div>
        <button onClick={download} disabled={running} className="mt-3 flex items-center gap-1.5 rounded-lg bg-[var(--series-1)] px-3 py-2 text-sm font-medium text-[var(--on-accent)] disabled:opacity-60">
          <Download size={16} /> {running ? "Preparing backup…" : "Download full backup"}
        </button>
        {running && progress && (
          <div className="mt-2 text-xs text-[var(--text-muted)]">
            Copying {progress.table.replace(/_/g, " ")} ({progress.index} of {progress.total}) · {progress.rows.toLocaleString()} records so far
          </div>
        )}
        {justNow && !running && <div className="mt-2 text-xs text-[var(--status-good)]">Backup downloaded — {justNow.rows.toLocaleString()} records. Check your Downloads folder.</div>}
      </div>

      <div className="rounded-xl border border-[var(--status-warning)]/40 p-4 text-sm" style={{ background: "color-mix(in srgb, var(--status-warning) 8%, transparent)" }}>
        <div className="mb-1 flex items-center gap-2 font-medium text-[var(--text-primary)]">
          <ShieldAlert size={16} /> Keep backups confidential
        </div>
        <ul className="list-disc space-y-0.5 pl-5 text-[var(--text-secondary)]">
          <li>The file contains salaries, government ID numbers and personal details.</li>
          <li>Save it in a company Google Drive/OneDrive folder that only HR and management can open — not on a personal phone, in chat or by email.</li>
          <li>Suggested: every Friday, after each payroll is finalized, and before big changes. Keep the last 8 weekly copies plus one per month.</li>
          <li>Uploaded files (ID photos and signatures, leave attachments, chat photos, the handbook PDF) aren&rsquo;t in the file.</li>
        </ul>
      </div>
    </div>
  );
}
