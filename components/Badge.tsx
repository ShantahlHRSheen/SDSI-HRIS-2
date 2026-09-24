export type BadgeTone = "good" | "warning" | "serious" | "critical" | "muted" | "info";

const TONE_STYLES: Record<BadgeTone, string> = {
  good: "bg-[color-mix(in_srgb,var(--status-good)_14%,transparent)] text-[var(--status-good)] ring-1 ring-[color-mix(in_srgb,var(--status-good)_35%,transparent)]",
  warning: "bg-[color-mix(in_srgb,var(--status-warning)_20%,transparent)] text-[#8a5a00] dark:text-[var(--status-warning)] ring-1 ring-[color-mix(in_srgb,var(--status-warning)_45%,transparent)]",
  serious: "bg-[color-mix(in_srgb,var(--status-serious)_18%,transparent)] text-[#9a3f1c] dark:text-[var(--status-serious)] ring-1 ring-[color-mix(in_srgb,var(--status-serious)_40%,transparent)]",
  critical: "bg-[color-mix(in_srgb,var(--status-critical)_14%,transparent)] text-[var(--status-critical)] ring-1 ring-[color-mix(in_srgb,var(--status-critical)_35%,transparent)]",
  muted: "bg-[var(--gridline)]/60 text-[var(--text-secondary)] ring-1 ring-[var(--border-hairline)]",
  info: "bg-[color-mix(in_srgb,var(--series-1)_14%,transparent)] text-[var(--series-1)] ring-1 ring-[color-mix(in_srgb,var(--series-1)_35%,transparent)]",
};

export function Badge({ tone = "muted", children }: { tone?: BadgeTone; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${TONE_STYLES[tone]}`}>
      {children}
    </span>
  );
}
