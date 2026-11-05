"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Search } from "lucide-react";
import { personName } from "@/lib/chat";
import { downloadText, fetchHrLog, isLive, type LogRow } from "@/lib/meetings";
import { useChat } from "@/components/chat/ChatProvider";

// HR only: every call and meeting in a date range — who, when, how long.
// No content (messages, notes, meeting chat, recordings) is shown.

const manilaDate = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
const when = (iso: string) => new Date(iso).toLocaleString("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
function dur(r: LogRow): string {
  if (!r.endedAt) return isLive({ endedAt: null, startedAt: r.startedAt, createdAt: r.startedAt }) ? "Live now" : "—";
  if (r.kind !== "meeting" && !r.durationSec) return "Missed";
  const m = Math.max(1, Math.round((r.durationSec ?? 0) / 60));
  return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`;
}
const TYPE = { audio: "Voice call", video: "Video call", meeting: "Meeting" } as const;

export function HrMeetingLog() {
  const { people } = useChat()!;
  const name = useCallback((id: string | null) => (id && people.get(id) ? personName(people.get(id)) : "Former employee"), [people]);
  const today = manilaDate(new Date());
  const [from, setFrom] = useState(`${today.slice(0, 8)}01`);
  const [to, setTo] = useState(today);
  const [rows, setRows] = useState<LogRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    let live = true;
    const end = new Date(`${to}T00:00:00+08:00`);
    end.setDate(end.getDate() + 1);
    fetchHrLog(new Date(`${from}T00:00:00+08:00`).toISOString(), end.toISOString()).then(
      (r) => {
        if (!live) return;
        setRows(r);
        setError(null);
      },
      (e) => live && setError(e instanceof Error ? e.message : "Couldn't load the log."),
    );
    return () => {
      live = false;
    };
  }, [from, to]);

  const view = useMemo(() => {
    const list = (rows ?? []).map((r) => {
      const joined = r.joined.map((j) => name(j.employeeId));
      const where = r.chatKind === "group" ? `Group: ${r.chatName ?? ""}` : r.chatKind === "direct" ? "Direct call" : r.title;
      return { r, joined, where, host: name(r.hostId) };
    });
    const t = q.trim().toLowerCase();
    return t ? list.filter((x) => `${x.where} ${x.r.title} ${x.host} ${x.joined.join(" ")} ${x.r.guests.join(" ")}`.toLowerCase().includes(t)) : list;
  }, [rows, q, name]);

  function exportCsv() {
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const lines = [
      ["Date and time", "Type", "Title / chat", "Started by", "Joined", "Guests", "Duration", "Recorded"].map(esc).join(","),
      ...view.map((x) => [when(x.r.startedAt), TYPE[x.r.kind], x.where, x.host, x.joined.join("; "), x.r.guests.join("; "), dur(x.r), x.r.recorded ? "Yes" : "No"].map(esc).join(",")),
    ];
    downloadText(`Call and meeting log ${from} to ${to}.csv`, "﻿" + lines.join("\r\n"), "text/csv");
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-[var(--text-muted)]">Seen only by HR. Shows who called or met, when and for how long — never the messages, notes, meeting chat or recordings.</p>
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs text-[var(--text-secondary)]">
          From
          <input type="date" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} className="mt-1 block rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-2 py-1.5 text-sm" />
        </label>
        <label className="text-xs text-[var(--text-secondary)]">
          To
          <input type="date" value={to} min={from} onChange={(e) => e.target.value && setTo(e.target.value)} className="mt-1 block rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-2 py-1.5 text-sm" />
        </label>
        <label className="flex min-w-[200px] flex-1 items-center gap-2 rounded-lg border border-[var(--border-hairline)] px-2.5 py-1.5">
          <Search size={15} className="text-[var(--text-muted)]" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a name or group" className="w-full bg-transparent text-sm outline-none" aria-label="Search the log" />
        </label>
        <button onClick={exportCsv} disabled={!view.length} className="flex items-center gap-1.5 rounded-lg border border-[var(--border-hairline)] px-3 py-1.5 text-sm text-[var(--text-primary)] hover:bg-[var(--gridline)]/40 disabled:opacity-40">
          <Download size={15} /> Export CSV
        </button>
      </div>
      {error && <div className="text-sm text-[var(--status-critical)]">{error}</div>}
      {rows === null && !error && <div className="text-sm text-[var(--text-muted)]">Loading…</div>}
      {rows && (
        <div className="overflow-x-auto rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-1)]">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-[var(--border-hairline)] text-left text-xs text-[var(--text-muted)]">
                <th className="px-3 py-2 font-medium">Date and time</th>
                <th className="px-3 py-2 font-medium">Type</th>
                <th className="px-3 py-2 font-medium">Title / chat</th>
                <th className="px-3 py-2 font-medium">Started by</th>
                <th className="px-3 py-2 font-medium">Joined</th>
                <th className="px-3 py-2 font-medium">Duration</th>
                <th className="px-3 py-2 font-medium">Recorded</th>
              </tr>
            </thead>
            <tbody>
              {view.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-[var(--text-muted)]">
                    No calls or meetings in these dates.
                  </td>
                </tr>
              )}
              {view.map(({ r, joined, where, host }) => (
                <tr key={r.id} className="border-b border-[var(--gridline)] align-top last:border-b-0">
                  <td className="px-3 py-2 whitespace-nowrap text-[var(--text-secondary)]">{when(r.startedAt)}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{TYPE[r.kind]}</td>
                  <td className="px-3 py-2">{where}</td>
                  <td className="px-3 py-2">{host}</td>
                  <td className="px-3 py-2 text-[var(--text-secondary)]">
                    {joined.join(", ") || "—"}
                    {r.guests.length > 0 && <div className="text-xs text-[var(--text-muted)]">Guests: {r.guests.join(", ")}</div>}
                  </td>
                  <td className={`px-3 py-2 whitespace-nowrap ${dur(r) === "Missed" ? "text-[var(--status-warning)]" : ""}`}>{dur(r)}</td>
                  <td className="px-3 py-2">{r.recorded ? "Yes" : "No"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {rows && <div className="text-xs text-[var(--text-muted)]">{view.length} {view.length === 1 ? "entry" : "entries"}</div>}
    </div>
  );
}
