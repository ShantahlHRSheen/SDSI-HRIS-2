"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, X } from "lucide-react";

export interface MultiOption {
  value: string;
  label: string;
}

export type FilterMode = "include" | "exclude";

// A dropdown of checkboxes: nothing ticked = "All …". `exclusive` options
// (e.g. "Full attendance") can't be combined with the others. With
// `onModeChange`, a switch picks "Show only" the ticked ones or "Remove"
// them (everyone else). `footer` goes under the list (e.g. an extra toggle).
export function MultiSelect({
  allLabel,
  noun,
  options,
  value,
  onChange,
  exclusive = [],
  searchable = false,
  className = "",
  mode = "include",
  onModeChange,
  footer,
}: {
  allLabel: string;
  noun: string;
  options: MultiOption[];
  value: string[];
  onChange: (next: string[]) => void;
  exclusive?: string[];
  searchable?: boolean;
  className?: string;
  mode?: FilterMode;
  onModeChange?: (mode: FilterMode) => void;
  footer?: React.ReactNode;
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

  const one = value.length === 1 ? (options.find((o) => o.value === value[0])?.label ?? value[0]) : "";
  const removing = mode === "exclude";
  const label =
    value.length === 0 ? allLabel : removing ? `Without ${value.length === 1 ? one : `${value.length} ${noun}`}` : value.length === 1 ? one : `${value.length} ${noun}`;
  const shown = searchable && query ? options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase())) : options;

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`flex w-full items-center justify-between gap-2 rounded-lg border bg-[var(--surface-1)] px-3 py-2 text-left text-sm ${value.length ? (removing ? "border-[var(--status-critical)]" : "border-[var(--series-1)]") : "border-[var(--border-hairline)]"}`}
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
          {onModeChange && (
            <div className="mb-1 grid grid-cols-2 gap-1 rounded-md bg-[var(--gridline)]/30 p-0.5 text-xs" role="radiogroup" aria-label="Filter mode">
              {(["include", "exclude"] as const).map((m) => (
                <button
                  type="button"
                  key={m}
                  role="radio"
                  aria-checked={mode === m}
                  onClick={() => onModeChange(m)}
                  className={`rounded px-2 py-1 font-medium ${mode === m ? (m === "exclude" ? "bg-[var(--status-critical)] text-white" : "bg-[var(--series-1)] text-[var(--on-accent)]") : "text-[var(--text-secondary)]"}`}
                >
                  {m === "include" ? "Show only selected" : "Remove selected"}
                </button>
              ))}
            </div>
          )}
          <div className="flex items-center justify-between gap-3 px-2 py-1 text-xs">
            <span className="text-[var(--text-muted)]">{value.length ? `${value.length} ${removing ? "removed" : "selected"}` : removing ? "Tick the ones to remove" : "Tick one or more"}</span>
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
                  <span
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${on ? (removing ? "border-[var(--status-critical)] bg-[var(--status-critical)] text-white" : "border-[var(--series-1)] bg-[var(--series-1)] text-[var(--on-accent)]") : "border-[var(--border-hairline)]"}`}
                  >
                    {on && (removing ? <X size={12} strokeWidth={3} /> : <Check size={12} strokeWidth={3} />)}
                  </span>
                  <span className={exclusive.includes(o.value) ? "font-medium" : ""}>{o.label}</span>
                </button>
              );
            })}
            {shown.length === 0 && <div className="px-2 py-2 text-xs text-[var(--text-muted)]">No matches</div>}
          </div>
          {footer && <div className="mt-1 border-t border-[var(--border-hairline)] px-2 pt-1.5 pb-1 text-xs">{footer}</div>}
        </div>
      )}
    </div>
  );
}
