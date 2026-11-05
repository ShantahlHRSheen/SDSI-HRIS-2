"use client";

import { Users } from "lucide-react";
import { initialsOf } from "@/lib/helpers";

/* eslint-disable @next/next/no-img-element -- signed Supabase URLs */

// A chat photo (or initials), with a green dot when the person is online.
export function ChatAvatar({ name, url, online, size = 40, group = false }: { name: string; url?: string | null; online?: boolean; size?: number; group?: boolean }) {
  const dot = Math.max(9, Math.round(size / 4));
  return (
    <span className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
      {url ? (
        <img src={url} alt="" className="h-full w-full rounded-full border border-[var(--border-hairline)] object-cover" />
      ) : (
        <span
          className="flex h-full w-full items-center justify-center rounded-full bg-[var(--series-1)]/15 font-semibold text-[var(--series-1)]"
          style={{ fontSize: Math.round(size * 0.36) }}
          aria-hidden
        >
          {group ? <Users size={Math.round(size * 0.45)} /> : initialsOf(name)}
        </span>
      )}
      {online && (
        <span
          className="absolute right-0 bottom-0 rounded-full border-2 border-[var(--surface-1)] bg-[var(--status-good)]"
          style={{ width: dot, height: dot }}
          aria-label="Online"
          title="Online"
        />
      )}
    </span>
  );
}
