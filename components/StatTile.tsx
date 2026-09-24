export function StatTile({
  label,
  value,
  delta,
  deltaTone = "neutral",
  hint,
  compact = false,
}: {
  label: string;
  value: string;
  delta?: string;
  deltaTone?: "good" | "bad" | "neutral";
  hint?: string;
  compact?: boolean;
}) {
  const deltaColor =
    deltaTone === "good" ? "text-[var(--status-good)]" : deltaTone === "bad" ? "text-[var(--status-critical)]" : "text-[var(--text-muted)]";
  return (
    <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-1)] p-4">
      <div className="truncate text-xs font-medium text-[var(--text-secondary)]" title={label}>{label}</div>
      <div className={`tabular mt-1 truncate font-semibold text-[var(--text-primary)] ${compact ? "text-lg" : "text-2xl"}`} title={value}>{value}</div>
      <div className="mt-1 flex items-center gap-2 text-xs">
        {delta && <span className={deltaColor}>{delta}</span>}
        {hint && <span className="text-[var(--text-muted)]">{hint}</span>}
      </div>
    </div>
  );
}
