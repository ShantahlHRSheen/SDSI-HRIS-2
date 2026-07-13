import type { LucideIcon } from "lucide-react";

export function EmptyState({ icon: Icon, title, description }: { icon: LucideIcon; title: string; description: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[var(--border-hairline)] px-6 py-14 text-center">
      <Icon size={28} className="mb-3 text-[var(--text-muted)]" />
      <div className="text-sm font-medium text-[var(--text-primary)]">{title}</div>
      <div className="mt-1 max-w-sm text-sm text-[var(--text-secondary)]">{description}</div>
    </div>
  );
}
