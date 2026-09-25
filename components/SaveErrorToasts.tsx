"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import { onSaveError, type SaveError } from "@/lib/save-errors";

// Bottom-right stack of "not saved" errors. They stay until dismissed so a
// failure isn't missed while someone looks elsewhere.
export function SaveErrorToasts() {
  const [errors, setErrors] = useState<SaveError[]>([]);

  useEffect(() => onSaveError((e) => setErrors((prev) => [...prev.slice(-3), e])), []);

  if (errors.length === 0) return null;
  return (
    <div className="fixed right-4 bottom-4 z-50 flex w-[22rem] max-w-[calc(100vw-2rem)] flex-col gap-2" role="alert" aria-live="assertive">
      {errors.map((e) => (
        <div
          key={e.id}
          className="flex gap-2 rounded-xl border border-[var(--status-critical)]/50 bg-[var(--surface-1)] p-3 text-sm shadow-lg"
          style={{ background: "color-mix(in srgb, var(--status-critical) 12%, var(--surface-1))" }}
        >
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-[var(--status-critical)]" />
          <div className="min-w-0 flex-1">
            <div className="font-medium text-[var(--text-primary)]">{e.message}</div>
            <div className="mt-0.5 text-xs text-[var(--text-secondary)]">Your change wasn&rsquo;t saved. Check your connection and try again.</div>
            {e.detail && <div className="mt-1 truncate text-xs text-[var(--text-muted)]" title={e.detail}>{e.detail}</div>}
          </div>
          <button onClick={() => setErrors((prev) => prev.filter((x) => x.id !== e.id))} className="h-fit rounded p-0.5 text-[var(--text-muted)] hover:bg-[var(--gridline)]/40" aria-label="Dismiss">
            <X size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}
