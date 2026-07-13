"use client";

import { Bell, CheckCircle2, Info, XCircle } from "lucide-react";
import { useHris } from "@/lib/store";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { buildNotifications, relativeTime, type NotificationItem } from "@/lib/notifications";

const TONE_ICON: Record<NotificationItem["tone"], typeof Bell> = {
  info: Info,
  good: CheckCircle2,
  warning: Bell,
  critical: XCircle,
};

const TONE_COLOR: Record<NotificationItem["tone"], string> = {
  info: "text-[var(--series-1)]",
  good: "text-[var(--status-good)]",
  warning: "text-[var(--status-warning)]",
  critical: "text-[var(--status-critical)]",
};

export default function NotificationsPage() {
  const { currentUser, currentEmployee, employees, leaveRequests, overtimeRequests, correctionRequests, announcements, leaveTypes } = useHris();
  const notifications = buildNotifications({ currentUser, currentEmployee, employees, leaveRequests, overtimeRequests, correctionRequests, announcements, leaveTypes });

  return (
    <div>
      <PageHeader title="Notifications" subtitle="Pending approvals assigned to you, updates on your own requests, and recent announcements." />
      {notifications.length === 0 ? (
        <EmptyState icon={Bell} title="You're all caught up" description="New pending approvals, request updates, and announcements will appear here." />
      ) : (
        <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-1)] p-2">
          {notifications.map((n) => {
            const Icon = TONE_ICON[n.tone];
            return (
              <div key={n.id} className="flex items-start gap-3 rounded-lg px-3 py-3 hover:bg-[var(--gridline)]/30">
                <Icon size={18} className={`mt-0.5 shrink-0 ${TONE_COLOR[n.tone]}`} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-[var(--text-primary)]">{n.text}</div>
                  <div className="mt-0.5 text-xs text-[var(--text-muted)]">{relativeTime(n.date)}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
