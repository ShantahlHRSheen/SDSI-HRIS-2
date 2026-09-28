"use client";

import { useMemo, useState } from "react";
import { FileText, MailCheck } from "lucide-react";
import { useHris } from "@/lib/store";
import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/Badge";
import { EmptyState } from "@/components/EmptyState";
import { DisciplineRecordModal } from "@/components/discipline/DisciplineRecordModal";
import { formatDate, fullName } from "@/lib/helpers";
import { DISCIPLINARY_LABELS } from "@/lib/types";
import { DISCIPLINE_TYPE_TONE, responseBadge, responseStage } from "@/lib/discipline";
import { todayInManila } from "@/lib/leave-policy";

// Notices (NTE, warnings, sanctions…) addressed to the signed-in employee,
// whatever their role: open the PDF, sign to acknowledge receipt, and submit
// the written explanation.
export default function MyNoticesPage() {
  const { disciplinaryRecords, currentEmployee, employees } = useHris();
  const [openId, setOpenId] = useState<string | null>(null);
  const today = todayInManila();

  const mine = useMemo(
    () =>
      disciplinaryRecords
        .filter((r) => r.employeeId === currentEmployee?.id)
        .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (b.createdAt ?? "").localeCompare(a.createdAt ?? ""))),
    [disciplinaryRecords, currentEmployee],
  );
  const needAction = mine.filter((r) => ["to_acknowledge", "to_explain"].includes(responseStage(r))).length;
  const open = mine.find((r) => r.id === openId) ?? null;

  return (
    <div>
      <PageHeader
        title="My Notices"
        subtitle="Notices issued to you by HR or your department head. Open each notice, sign to acknowledge that you received it, and submit your written explanation when one is requested."
      />

      {needAction > 0 && (
        <div className="mb-4 rounded-xl border border-[var(--status-warning)]/40 bg-[var(--status-warning)]/10 p-3 text-sm text-[var(--text-primary)]">
          You have {needAction} notice{needAction === 1 ? "" : "s"} that need{needAction === 1 ? "s" : ""} your action.
        </div>
      )}

      {mine.length === 0 ? (
        <EmptyState icon={MailCheck} title="No notices" description="You have no notices from HR or your department head." />
      ) : (
        <div className="space-y-2">
          {mine.map((r) => {
            const badge = responseBadge(r, today, true);
            const issuer = employees.find((e) => e.id === r.issuedBy);
            const act = ["to_acknowledge", "to_explain"].includes(responseStage(r));
            return (
              <button
                key={r.id}
                onClick={() => setOpenId(r.id)}
                className={`flex w-full flex-wrap items-center justify-between gap-3 rounded-xl border p-4 text-left ${act ? "border-[var(--status-warning)]/50 bg-[var(--status-warning)]/5" : "border-[var(--border-hairline)] bg-[var(--surface-1)]"} hover:bg-[var(--gridline)]/30`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={DISCIPLINE_TYPE_TONE[r.type]}>{DISCIPLINARY_LABELS[r.type]}</Badge>
                    <span className="text-xs text-[var(--text-muted)]">
                      {formatDate(r.date)}
                      {issuer ? ` · from ${fullName(issuer)}` : ""}
                    </span>
                    {r.noticePath && (
                      <span className="flex items-center gap-1 text-xs text-[var(--text-muted)]">
                        <FileText size={12} /> PDF
                      </span>
                    )}
                  </div>
                  <div className="mt-1 line-clamp-2 text-sm text-[var(--text-secondary)]">{r.description}</div>
                  {r.requiresExplanation && !r.explanationSubmittedAt && r.responseDue && (
                    <div className="mt-1 text-xs text-[var(--text-muted)]">Explanation due {formatDate(r.responseDue)}</div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={badge.tone}>{badge.label}</Badge>
                  <span className="rounded-lg bg-[var(--series-1)] px-3 py-1.5 text-xs font-medium text-[var(--on-accent)]">{act ? "Open & respond" : "View"}</span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      <DisciplineRecordModal record={open} employees={employees} mode="employee" onClose={() => setOpenId(null)} />
    </div>
  );
}
