"use client";

import { useState } from "react";

export interface StackSegment {
  key: string;
  label: string;
  value: number;
  color: string;
}

export function StackedHBar({ segments, totalLabel }: { segments: StackSegment[]; totalLabel?: string }) {
  const [hover, setHover] = useState<string | null>(null);
  const total = segments.reduce((s, d) => s + d.value, 0) || 1;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex h-6 w-full overflow-hidden rounded-md">
        {segments.map((s, i) => {
          const pct = (s.value / total) * 100;
          if (pct <= 0) return null;
          return (
            <div
              key={s.key}
              className="relative h-6 first:rounded-l-[4px] last:rounded-r-[4px]"
              style={{
                width: `${pct}%`,
                backgroundColor: s.color,
                marginLeft: i === 0 ? 0 : 2,
              }}
              onMouseEnter={() => setHover(s.key)}
              onMouseLeave={() => setHover((h) => (h === s.key ? null : h))}
              title={`${s.label}: ${s.value} (${pct.toFixed(1)}%)`}
            >
              {hover === s.key && (
                <div className="tabular pointer-events-none absolute -top-8 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-md bg-[var(--text-primary)] px-2 py-1 text-[11px] font-medium text-[var(--surface-1)] shadow-sm">
                  {s.label}: {s.value} ({pct.toFixed(1)}%)
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
        {segments.map((s) => (
          <div key={s.key} className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.color }} />
            {s.label} <span className="tabular text-[var(--text-muted)]">({s.value})</span>
          </div>
        ))}
        {totalLabel && <div className="tabular ml-auto text-xs font-medium text-[var(--text-primary)]">{totalLabel}</div>}
      </div>
    </div>
  );
}
