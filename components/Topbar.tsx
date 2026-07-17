"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Bell, ChevronDown, LogOut, Menu } from "lucide-react";
import { useHris } from "@/lib/store";
import { ROLE_LABELS } from "@/lib/types";
import { buildNotifications, relativeTime } from "@/lib/notifications";
import { Badge } from "./Badge";

export function Topbar({ onMenuClick }: { onMenuClick: () => void }) {
  const { currentUser, currentEmployee, employees, leaveRequests, overtimeRequests, correctionRequests, announcements, leaveTypes, logout } = useHris();
  const router = useRouter();
  const [userMenu, setUserMenu] = useState(false);
  const [notifMenu, setNotifMenu] = useState(false);

  const notifications = buildNotifications({ currentUser, currentEmployee, employees, leaveRequests, overtimeRequests, correctionRequests, announcements, leaveTypes });

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-[var(--border-hairline)] bg-[var(--surface-1)]/95 px-4 backdrop-blur">
      <div className="flex items-center gap-3">
        <button className="rounded-md p-1.5 text-[var(--text-secondary)] hover:bg-[var(--gridline)]/50 md:hidden" onClick={onMenuClick} aria-label="Open menu">
          <Menu size={20} />
        </button>
      </div>
      <div className="flex items-center gap-2">
        <div className="relative">
          <button
            className="relative rounded-md p-1.5 text-[var(--text-secondary)] hover:bg-[var(--gridline)]/50"
            onClick={() => {
              setNotifMenu((v) => !v);
              setUserMenu(false);
            }}
            aria-label="Notifications"
          >
            <Bell size={19} />
            {notifications.length > 0 && <span className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-[var(--status-critical)]" />}
          </button>
          {notifMenu && (
            <div className="absolute right-0 mt-2 w-80 max-w-[85vw] rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-1)] p-2 shadow-lg">
              <div className="px-2 py-1.5 text-xs font-semibold text-[var(--text-muted)] uppercase">Notifications</div>
              {notifications.length === 0 ? (
                <div className="px-2 py-3 text-center text-xs text-[var(--text-muted)]">You&rsquo;re all caught up.</div>
              ) : (
                notifications.slice(0, 6).map((n) => (
                  <div key={n.id} className="rounded-lg px-2 py-2 text-sm hover:bg-[var(--gridline)]/40">
                    <div className="text-[var(--text-primary)]">{n.text}</div>
                    <div className="mt-0.5 text-xs text-[var(--text-muted)]">{relativeTime(n.date)}</div>
                  </div>
                ))
              )}
              <button
                onClick={() => {
                  setNotifMenu(false);
                  router.push("/modules/notifications");
                }}
                className="mt-1 w-full rounded-lg px-2 py-1.5 text-center text-xs font-medium text-[var(--series-1)] hover:bg-[var(--gridline)]/40"
              >
                View all
              </button>
            </div>
          )}
        </div>
        <div className="relative">
          <button
            className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-[var(--gridline)]/50"
            onClick={() => {
              setUserMenu((v) => !v);
              setNotifMenu(false);
            }}
          >
            <div className="glow-accent flex h-8 w-8 items-center justify-center rounded-full bg-[var(--accent)] text-xs font-semibold text-[var(--on-accent)]">
              {currentUser?.initials}
            </div>
            <div className="hidden text-left leading-tight sm:block">
              <div className="text-sm font-medium text-[var(--text-primary)]">{currentUser?.name}</div>
              <div className="text-xs text-[var(--text-muted)]">{currentUser?.title}</div>
            </div>
            <ChevronDown size={16} className="text-[var(--text-muted)]" />
          </button>
          {userMenu && (
            <div className="absolute right-0 mt-2 w-64 rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-1)] p-2 shadow-lg">
              <div className="px-2 py-1.5">
                <div className="text-sm font-medium text-[var(--text-primary)]">{currentUser?.name}</div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {currentUser?.roles.map((r) => (
                    <Badge key={r} tone="info">{ROLE_LABELS[r]}</Badge>
                  ))}
                </div>
              </div>
              <button
                className="mt-1 flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40"
                onClick={() => {
                  logout();
                  router.push("/");
                }}
              >
                <LogOut size={16} /> Switch demo user
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
