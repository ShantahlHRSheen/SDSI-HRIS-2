"use client";

import { isSupabaseConfigured } from "@/lib/supabase/auth";
import { currentCompany } from "@/lib/companies";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { BarChart3, ChevronDown, ChevronRight, Clock, MessagesSquare, Receipt, Settings, User, UserPlus, Users, Wallet, X, type LucideIcon } from "lucide-react";
import { isEvaluationHead } from "@/lib/sales-admin-eval";
import { canSeeConfidential } from "@/lib/confidential-cases";
import { NAV_SECTIONS } from "@/lib/nav";
import { NAV_ICONS } from "./navIcons";
import { useHris } from "@/lib/store";
import { Badge } from "./Badge";
import { useHrMessagesHidden, useHrUnreadCount } from "./messages/HrChat";
import { useWorkforceBadges } from "./workforce/WorkforceBadges";
import { useChat } from "./chat/ChatProvider";
import { chatEnabled } from "@/lib/chat";
import { hasHiringRecords } from "@/lib/hiring";

// Icons for the menu's groups (lib/nav.ts).
const GROUP_ICONS: Record<string, LucideIcon> = {
  Communication: MessagesSquare,
  "My Records": User,
  "Time & Attendance": Clock,
  "Employee Relations": Users,
  "Hiring & Website": UserPlus,
  "Payroll & Benefits": Wallet,
  "BIR / Tax": Receipt,
  Reports: BarChart3,
  System: Settings,
};

// Which groups the person opened or closed, remembered in this browser.
const OPEN_KEY = "hris.navGroups";
function readOpen(): Record<string, boolean> {
  try {
    const v = JSON.parse(window.localStorage.getItem(OPEN_KEY) ?? "{}");
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}

export function Sidebar({ onClose }: { onClose: () => void }) {
  const { currentUser, currentEmployee } = useHris();
  const pathname = usePathname();
  const roles = currentUser?.roles ?? [];
  const isHr = roles.includes("hr_admin");
  const unread = useHrUnreadCount();
  const messagesHidden = useHrMessagesHidden();
  // New requests to act on / updates on one's own, per Workforce page.
  const workforce = useWorkforceBadges();
  const chatUnread = useChat()?.unreadTotal ?? 0;
  const company = currentCompany();
  // Heads named on an evaluation see Performance Evaluations without the roles.
  const [isHead, setIsHead] = useState(false);
  const meId = currentEmployee?.id;
  const needsCheck = !!meId && !roles.some((r) => r === "hr_admin" || r === "upper_management" || r === "dept_head");
  useEffect(() => {
    if (needsCheck && meId && isSupabaseConfigured()) isEvaluationHead(meId).then(setIsHead, () => setIsHead(false));
  }, [needsCheck, meId]);
  const evaluationHead = !!meId && (meId === company.salesAdminEval?.headId || isHead);
  // Heads and the final approver see Hiring & Onboarding once a record is theirs.
  const [hiring, setHiring] = useState(false);
  useEffect(() => {
    if (meId && !isHr && isSupabaseConfigured()) hasHiringRecords().then(setHiring, () => setHiring(false));
  }, [meId, isHr]);

  const isActive = (href: string) => pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
  // Red counts: unread HR messages and chat, and Workforce requests.
  const countFor = (href: string) => (href === "/messages" ? unread : href === "/chat" ? chatUnread : (workforce[href] ?? 0));
  // Groups the person opened stay open (remembered in this browser). The group
  // of the current page is always open, unless they close it while there.
  const [open, setOpen] = useState<Record<string, boolean>>(() => (typeof window === "undefined" ? {} : readOpen()));
  const [closedHere, setClosedHere] = useState<string | null>(null);
  const toggle = (title: string, value: boolean, hasActive: boolean) => {
    if (hasActive) setClosedHere(value ? null : `${title}|${pathname}`);
    setOpen((cur) => {
      const next = { ...cur };
      if (value) next[title] = true;
      else delete next[title];
      try {
        window.localStorage.setItem(OPEN_KEY, JSON.stringify(next));
      } catch {
        // Storage blocked: it's just not remembered.
      }
      return next;
    });
  };

  const content = (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-4 py-4">
        <Link href="/dashboard" className="flex items-center gap-2" onClick={onClose}>
          {/* eslint-disable-next-line @next/next/no-img-element -- tiny static brand icon */}
          <img src={company.logo} alt="" className="h-8 w-8 rounded-full object-contain" />
          <div className="leading-tight">
            <div className="text-sm font-semibold text-[var(--text-primary)]">{isSupabaseConfigured() ? company.name : "Demo instance"}</div>
            <div className="text-[11px] text-[var(--text-muted)]">LSM Group HRIS</div>
          </div>
        </Link>
        <button className="rounded-md p-1 text-[var(--text-muted)] md:hidden" onClick={onClose} aria-label="Close menu">
          <X size={20} />
        </button>
      </div>
      <nav className="flex-1 overflow-y-auto px-2 pb-4">
        {NAV_SECTIONS.map((section) => {
          const items = section.items.filter(
            (item) =>
              (item.roles.some((r) => roles.includes(r)) || (item.href === "/sales-admin-evaluation" && evaluationHead) || (item.href === "/confidential-cases" && canSeeConfidential(roles, meId)) || (item.href === "/hiring" && hiring)) &&
              !(item.href === "/messages" && messagesHidden) &&
              !((item.href === "/chat" || item.href === "/meetings") && !chatEnabled()),
          );
          if (items.length === 0) return null;
          const links = (
            <div className="flex flex-col gap-0.5">
              {items.map((item) => {
                const active = isActive(item.href);
                const n = countFor(item.href);
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
                    <span className="flex min-w-0 items-center gap-2.5">
                      {(() => {
                        const Icon = NAV_ICONS[item.href];
                        return Icon ? <Icon size={16} className="shrink-0 opacity-80" aria-hidden /> : null;
                      })()}
                      <span className="truncate">{item.href === "/messages" && isHr ? "HR Messages" : item.label}</span>
                    </span>
                    {!item.built && <Badge tone="muted">Preview</Badge>}
                    {n > 0 && (
                      <span className="rounded-full bg-[var(--status-critical)] px-1.5 text-[11px] font-semibold text-white" aria-label={`${n} new`}>
                        {n}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          );
          if (section.pinned)
            return (
              <div key={section.title} className="mb-2 border-b border-[var(--border-hairline)] pb-2">
                {links}
              </div>
            );
          const hasActive = items.some((i) => isActive(i.href));
          const isOpen = hasActive ? closedHere !== `${section.title}|${pathname}` : !!open[section.title];
          const total = items.reduce((t, i) => t + countFor(i.href), 0);
          const GroupIcon = GROUP_ICONS[section.title];
          const Chevron = isOpen ? ChevronDown : ChevronRight;
          return (
            <div key={section.title}>
              <button
                type="button"
                onClick={() => toggle(section.title, !isOpen, hasActive)}
                aria-expanded={isOpen}
                className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm font-semibold transition-colors hover:bg-[var(--gridline)]/50 ${
                  isOpen ? "bg-[var(--gridline)]/30 text-[var(--text-primary)]" : hasActive ? "text-[var(--text-primary)]" : "text-[var(--text-secondary)]"
                }`}
              >
                <span className="flex min-w-0 items-center gap-2.5">
                  {GroupIcon && <GroupIcon size={17} className={`shrink-0 ${hasActive ? "text-[var(--series-1)]" : "opacity-80"}`} aria-hidden />}
                  <span className="truncate">{section.title}</span>
                </span>
                <span className="flex shrink-0 items-center gap-1.5">
                  {!isOpen && total > 0 && (
                    <span className="rounded-full bg-[var(--status-critical)] px-1.5 text-[11px] font-semibold text-white" aria-label={`${total} new`}>
                      {total}
                    </span>
                  )}
                  <Chevron size={15} className="opacity-70" aria-hidden />
                </span>
              </button>
              {isOpen && <div className="mt-0.5 mb-1 ml-5 border-l border-[var(--border-hairline)] pl-1">{links}</div>}
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
