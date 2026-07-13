"use client";

import { useState } from "react";

export interface HBarDatum {
  label: string;
  value: number;
}

export function HBarChart({
  data,
  valueFormatter = (v: number) => v.toLocaleString(),
  color = "var(--series-1)",
}: {
  data: HBarDatum[];
  valueFormatter?: (v: number) => string;
  color?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(...data.map((d) => d.value), 1);

  return (
    <div className="flex flex-col gap-2">
      {data.map((d, i) => {
        const pct = Math.max((d.value / max) * 100, 2);
        return (
          <div key={d.label} className="group flex items-center gap-3">
            <div className="w-28 shrink-0 truncate text-xs text-[var(--text-secondary)]" title={d.label}>
              {d.label}
            </div>
            <div
              className="relative h-4 flex-1 rounded-sm bg-[var(--baseline)]/45"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover((h) => (h === i ? null : h))}
            >
              <div
                className="h-4 rounded-[4px] transition-[width]"
                style={{ width: `${pct}%`, backgroundColor: color, maxHeight: 16 }}
              />
              {hover === i && (
                <div className="tabular pointer-events-none absolute -top-7 left-0 z-10 rounded-md bg-[var(--text-primary)] px-2 py-1 text-[11px] font-medium text-[var(--surface-1)] shadow-sm" style={{ left: `${pct}%`, transform: "translateX(-50%)" }}>
                  {valueFormatter(d.value)}
                </div>
              )}
            </div>
            <div className="tabular w-20 shrink-0 text-right text-xs text-[var(--text-secondary)]">
              {valueFormatter(d.value)}
            </div>
          </div>
        );
      })}
    </div>
  );
}
