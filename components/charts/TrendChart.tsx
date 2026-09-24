"use client";

import { useState } from "react";

export interface TrendPoint {
  label: string;
  value: number;
}

export function TrendChart({
  data,
  color = "var(--series-1)",
  valueFormatter = (v: number) => v.toString(),
  height = 140,
}: {
  data: TrendPoint[];
  color?: string;
  valueFormatter?: (v: number) => string;
  height?: number;
}) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const width = 520;
  const padding = 24;
  const max = Math.max(...data.map((d) => d.value));
  const min = Math.min(...data.map((d) => d.value));
  const range = max - min || 1;

  const points = data.map((d, i) => {
    const x = padding + (i / (data.length - 1 || 1)) * (width - padding * 2);
    const y = padding + (1 - (d.value - min) / range) * (height - padding * 2);
    return { x, y, ...d };
  });

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const areaPath = `${linePath} L ${points[points.length - 1].x} ${height - padding} L ${points[0].x} ${height - padding} Z`;

  function handleMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / rect.width) * width;
    let closest = 0;
    let closestDist = Infinity;
    points.forEach((p, i) => {
      const dist = Math.abs(p.x - relX);
      if (dist < closestDist) {
        closestDist = dist;
        closest = i;
      }
    });
    setHoverIdx(closest);
  }

  const gridLines = [0, 0.25, 0.5, 0.75, 1];

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        onMouseMove={handleMove}
        onMouseLeave={() => setHoverIdx(null)}
      >
        {gridLines.map((g) => (
          <line
            key={g}
            x1={padding}
            x2={width - padding}
            y1={padding + g * (height - padding * 2)}
            y2={padding + g * (height - padding * 2)}
            stroke="var(--gridline)"
            strokeWidth={1}
          />
        ))}
        <path d={areaPath} fill={color} opacity={0.1} stroke="none" />
        <path d={linePath} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {hoverIdx !== null && (
          <>
            <line
              x1={points[hoverIdx].x}
              x2={points[hoverIdx].x}
              y1={padding}
              y2={height - padding}
              stroke="var(--baseline)"
              strokeWidth={1}
            />
            <circle cx={points[hoverIdx].x} cy={points[hoverIdx].y} r={4} fill={color} stroke="var(--surface-1)" strokeWidth={2} />
          </>
        )}
        {/* end marker + label */}
        <circle cx={points[points.length - 1].x} cy={points[points.length - 1].y} r={4} fill={color} stroke="var(--surface-1)" strokeWidth={2} />
      </svg>
      {hoverIdx !== null && (
        <div
          className="tabular pointer-events-none absolute -translate-x-1/2 rounded-md bg-[var(--text-primary)] px-2 py-1 text-[11px] font-medium text-[var(--surface-1)] shadow-sm"
          style={{
            left: `${(points[hoverIdx].x / width) * 100}%`,
            top: 0,
          }}
        >
          {points[hoverIdx].label}: {valueFormatter(points[hoverIdx].value)}
        </div>
      )}
    </div>
  );
}
