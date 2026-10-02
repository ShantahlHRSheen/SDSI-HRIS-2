"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";

export interface MultiOption {
  value: string;
  label: string;
}

// A dropdown of checkboxes: nothing ticked = "All …". `exclusive` options
// (e.g. "Full attendance") can't be combined with the others.
export function MultiSelect({
  allLabel,
  noun,
  options,
  value,
  onChange,
  exclusive = [],
  searchable = false,
  className = "",
}: {
  allLabel: string;
  noun: string;
  options: MultiOption[];
  value: string[];
  onChange: (next: string[]) => void;
  exclusive?: string[];
  searchable?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function toggle(v: string) {
    if (value.includes(v)) return onChange(value.filter((x) => x !== v));
    if (exclusive.includes(v)) return onChange([v]);
    onChange([...value.filter((x) => !exclusive.includes(x)), v]);
  }

  const label =
    value.length === 0
      ? allLabel
      : value.length === 1
        ? (options.find((o) => o.value === value[0])?.label ?? value[0])
        : `${value.length} ${noun}`;
  const shown = searchable && query ? options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase())) : options;

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`flex w-full items-center justify-between gap-2 rounded-lg border bg-[var(--surface-1)] px-3 py-2 text-left text-sm ${value.length ? "border-[var(--series-1)]" : "border-[var(--border-hairline)]"}`}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="truncate">{label}</span>
        <ChevronDown size={14} className="shrink-0 text-[var(--text-muted)]" />
      </button>
      {open && (
        <div className="absolute z-40 mt-1 w-max max-w-[min(90vw,22rem)] min-w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] p-1 shadow-xl">
          {searchable && (
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search…"
              className="mb-1 w-full rounded-md border border-[var(--border-hairline)] bg-[var(--surface-1)] px-2 py-1.5 text-sm"
            />
          )}
          <div className="flex items-center justify-between gap-3 px-2 py-1 text-xs">
            <span className="text-[var(--text-muted)]">{value.length ? `${value.length} selected` : "Tick one or more"}</span>
            {value.length > 0 && (
              <button type="button" onClick={() => onChange([])} className="text-[var(--series-1)] hover:underline">
                Clear
              </button>
            )}
          </div>
          <div className="max-h-72 overflow-y-auto" role="listbox" aria-multiselectable="true">
            {shown.map((o) => {
              const on = value.includes(o.value);
              return (
                <button
                  type="button"
                  key={o.value}
                  role="option"
                  aria-selected={on}
                  onClick={() => toggle(o.value)}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-[var(--gridline)]/40"
                >
                  <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${on ? "border-[var(--series-1)] bg-[var(--series-1)] text-[var(--on-accent)]" : "border-[var(--border-hairline)]"}`}>
                    {on && <Check size={12} strokeWidth={3} />}
                  </span>
                  <span className={exclusive.includes(o.value) ? "font-medium" : ""}>{o.label}</span>
                </button>
              );
            })}
            {shown.length === 0 && <div className="px-2 py-2 text-xs text-[var(--text-muted)]">No matches</div>}
          </div>
        </div>
      )}
    </div>
  );
}
