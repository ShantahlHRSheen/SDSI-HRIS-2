"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, X } from "lucide-react";
import { NAV_SECTIONS } from "@/lib/nav";
import { useHris } from "@/lib/store";
import { Badge } from "./Badge";

export function Sidebar({ onClose }: { onClose: () => void }) {
  const { currentUser } = useHris();
  const pathname = usePathname();
  const roles = currentUser?.roles ?? [];

  const content = (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-4 py-4">
        <Link href="/dashboard" className="flex items-center gap-2" onClick={onClose}>
          <div className="glow-accent flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--series-1)] text-[var(--on-accent)]">
            <Building2 size={18} />
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold text-[var(--text-primary)]">Shantahl HRIS</div>
            <div className="text-[11px] text-[var(--text-muted)]">Demo instance</div>
          </div>
        </Link>
        <button className="rounded-md p-1 text-[var(--text-muted)] md:hidden" onClick={onClose} aria-label="Close menu">
          <X size={20} />
        </button>
      </div>
      <nav className="flex-1 overflow-y-auto px-2 pb-4">
        {NAV_SECTIONS.map((section) => {
          const items = section.items.filter((item) => item.roles.some((r) => roles.includes(r)));
          if (items.length === 0) return null;
          return (
            <div key={section.title} className="mb-4">
              <div className="px-3 pb-1.5 text-[11px] font-semibold tracking-wide text-[var(--text-muted)] uppercase">
                {section.title}
              </div>
              <div className="flex flex-col gap-0.5">
                {items.map((item) => {
                  const active = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));
                  return (
                    <Link
                      key={item.href + item.label}
                      href={item.href}
                      onClick={onClose}
                      className={`flex items-center justify-between rounded-lg border-l-2 px-3 py-2 text-sm transition-colors ${
                        active
                          ? "border-[var(--series-1)] bg-[var(--series-1)]/10 font-medium text-[var(--series-1)]"
                          : "border-transparent text-[var(--text-secondary)] hover:bg-[var(--gridline)]/50"
                      }`}
                    >
                      <span>{item.label}</span>
                      {!item.built && <Badge tone="muted">Preview</Badge>}
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>
    </div>
  );

  return content;
}

export function SidebarShell({ mobileOpen, onClose }: { mobileOpen: boolean; onClose: () => void }) {
  return (
    <>
      <aside className="hidden w-64 shrink-0 border-r border-[var(--border-hairline)] bg-[var(--surface-1)] md:block">
        <Sidebar onClose={onClose} />
      </aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={onClose} />
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[85vw] bg-[var(--surface-1)] shadow-xl">
            <Sidebar onClose={onClose} />
          </aside>
        </div>
      )}
    </>
  );
}
