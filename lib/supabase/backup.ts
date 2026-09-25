import { getSupabaseClient } from "./client";

// Builds the full backup in the browser from app/api/admin/backup, piece by
// piece, and hands it back as a downloadable file.

export interface BackupProgress {
  table: string;
  index: number;
  total: number;
  rows: number;
}

async function call<T>(token: string, body: unknown): Promise<T> {
  const res = await fetch("/api/admin/backup", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok || json.error) throw new Error(json.error ?? `Request failed (${res.status}).`);
  return json;
}

export async function buildFullBackup(createdBy: string, onProgress: (p: BackupProgress) => void): Promise<{ blob: Blob; fileName: string; rowCount: number }> {
  const { data } = await getSupabaseClient().auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Please sign in again.");

  const { tables } = await call<{ tables: { name: string; orderBy: string[] }[] }>(token, {});
  const out: Record<string, unknown[]> = {};
  let rowCount = 0;
  for (const [index, t] of tables.entries()) {
    const rows: unknown[] = [];
    for (let offset = 0; ; ) {
      const page = await call<{ rows: unknown[]; done: boolean }>(token, { table: t.name, orderBy: t.orderBy, offset });
      rows.push(...page.rows);
      offset += page.rows.length;
      onProgress({ table: t.name, index: index + 1, total: tables.length, rows: rowCount + rows.length });
      if (page.done || page.rows.length === 0) break;
    }
    out[t.name] = rows;
    rowCount += rows.length;
  }

  const now = new Date();
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const backup = {
    format: "sdsi-hris-backup",
    version: 1,
    createdAt: now.toISOString(),
    createdBy,
    note: "Full copy of the Shantahl HRIS database (all tables). Uploaded files — ID photos/signatures, leave attachments, chat photos and the handbook PDF — are not included. CONFIDENTIAL: contains salaries, government ID numbers and personal data.",
    rowCount,
    tables: out,
  };
  const blob = new Blob([JSON.stringify(backup)], { type: "application/json" });
  // Recorded in the audit log so the Backup page can show the last one.
  await call(token, { finished: rowCount }).catch(() => {});
  return { blob, fileName: `sdsi-hris-backup-${day}.json`, rowCount };
}
