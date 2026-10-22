"use client";

import { useState } from "react";
import { Check, Loader2, ShieldCheck, X } from "lucide-react";
import { useHris } from "@/lib/store";
import { Badge } from "@/components/Badge";
import { formatDate, fullName } from "@/lib/helpers";
import { manilaDateTime } from "@/lib/discipline-pdf";
import { NTE_TARDINESS_MIN_DAYS } from "@/lib/nte-tardiness";
import type { DisciplinaryRecord, Employee, TardinessNteData } from "@/lib/types";

// Late days the Department / Branch Manager asks HR not to count as
// tardiness (an approved excuse, official business…), each with its
// reason; HR accepts or declines each request. Accepted days come off the
// days late in the Notice of Sanction.

const section = "rounded-lg border border-[var(--border-hairline)] p-4";

export function ExcuseSection({
  record: r,
  employees,
  canRequest,
  canDecide,
  onError,
}: {
  record: DisciplinaryRecord;
  employees: Employee[];
  canRequest: boolean;
  canDecide: boolean;
  onError: (err: string | null) => void;
}) {
  const { requestDisciplinaryExcuse, decideDisciplinaryExcuse } = useHris();
  const d = r.noticeData as TardinessNteData;
  const requests = r.excuseRequests ?? [];
  // Days already asked for (pending or accepted) can't be asked again.
  const taken = new Set(requests.filter((x) => x.status !== "declined").flatMap((x) => x.items.map((i) => i.date)));
  const open = d.days.filter((x) => !taken.has(x.date));
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const chosen = open.filter((x) => picked[x.date]);
  // Late days left once accepted requests (and, for a pending one, it too) are excused.
  const accepted = new Set(requests.filter((x) => x.status === "accepted").flatMap((x) => x.items.map((i) => i.date)));
  const leftIf = (extra: string[]) => d.days.length - new Set([...accepted, ...extra]).size;
  const ready = chosen.length > 0 && chosen.every((x) => (reasons[x.date] ?? "").trim());
  const name = (id: string | null | undefined) => {
    const e = employees.find((x) => x.id === id);
    return e ? fullName(e) : "—";
  };

  async function send() {
    setBusy("send");
    const err = await requestDisciplinaryExcuse(
      r.id,
      chosen.map((x) => ({ date: x.date, minutes: x.minutes, reason: (reasons[x.date] ?? "").trim() })),
    );
    onError(err);
    if (!err) {
      setPicked({});
      setReasons({});
    }
    setBusy(null);
  }

  async function decide(id: string, accept: boolean) {
    setBusy(id);
    onError(await decideDisciplinaryExcuse(r.id, id, accept));
    setBusy(null);
  }

  if (!requests.length && !canRequest) return null;
  if (r.withdrawnAt)
    return (
      <div className={section}>
        <div className="mb-1 flex items-center gap-2 font-medium text-[var(--text-primary)]">
          <ShieldCheck size={16} /> NTE withdrawn
        </div>
        <p className="text-sm text-[var(--text-secondary)]">
          After the excused days, only {leftIf([])} late day{leftIf([]) === 1 ? "" : "s"} remain — below {NTE_TARDINESS_MIN_DAYS}. The NTE was withdrawn on {manilaDateTime(r.withdrawnAt)}; the employee never received it.
        </p>
        <ul className="mt-2 space-y-1 text-sm">
          {requests
            .filter((x) => x.status === "accepted")
            .flatMap((x) => x.items)
            .map((i) => (
              <li key={i.date} className="text-[var(--text-primary)]">
                <span className="font-medium">{formatDate(i.date)}</span> — {i.reason}
              </li>
            ))}
        </ul>
      </div>
    );

  return (
    <div className={section}>
      <div className="mb-2 flex items-center gap-2 font-medium text-[var(--text-primary)]">
        <ShieldCheck size={16} /> Late days to excuse
      </div>
      <p className="mb-3 text-xs text-[var(--text-muted)]">
        The Department or Branch Manager can ask HR not to count late days with a valid reason (an approved excuse, official business…). The employee doesn&rsquo;t receive the NTE while a request waits for HR. If the accepted days leave fewer than {NTE_TARDINESS_MIN_DAYS} late days, the NTE is withdrawn; otherwise they&rsquo;re taken off the days late in the Notice of Sanction.
      </p>

      {requests.length > 0 && (
        <div className="mb-3 space-y-2">
          {requests.map((x) => (
            <div key={x.id} className="rounded-md bg-[var(--gridline)]/25 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="text-[var(--text-secondary)]">
                  {x.role === "branch" ? "Branch Manager" : "Department Manager"} {name(x.by)} · {manilaDateTime(x.at)}
                </span>
                <Badge tone={x.status === "accepted" ? "good" : x.status === "declined" ? "critical" : "warning"}>
                  {x.status === "accepted" ? `Accepted by ${name(x.decidedBy)}` : x.status === "declined" ? `Declined by ${name(x.decidedBy)}` : "Waiting for HR"}
                </Badge>
              </div>
              <ul className="mt-2 space-y-1 text-sm">
                {x.items.map((i) => (
                  <li key={i.date} className="text-[var(--text-primary)]">
                    <span className="font-medium">{formatDate(i.date)}</span> <span className="text-xs text-[var(--text-muted)]">({i.minutes} min late)</span> — {i.reason}
                  </li>
                ))}
              </ul>
              {canDecide && x.status === "pending" && (
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={() => decide(x.id, true)}
                    disabled={!!busy}
                    className="flex items-center gap-1 rounded-lg bg-[var(--series-1)] px-2.5 py-1 text-xs font-medium text-[var(--on-accent)] disabled:opacity-40"
                  >
                    {busy === x.id ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}{" "}
                    {leftIf(x.items.map((i) => i.date)) < NTE_TARDINESS_MIN_DAYS
                      ? `Accept — ${leftIf(x.items.map((i) => i.date))} days left, the NTE will be withdrawn`
                      : `Accept — don't count ${x.items.length === 1 ? "this day" : `these ${x.items.length} days`}`}
                  </button>
                  <button
                    onClick={() => decide(x.id, false)}
                    disabled={!!busy}
                    className="flex items-center gap-1 rounded-lg border border-[var(--border-hairline)] px-2.5 py-1 text-xs text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40 disabled:opacity-40"
                  >
                    <X size={13} /> Decline
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {canRequest &&
        (open.length === 0 ? (
          <div className="text-xs text-[var(--text-muted)]">Every late day on this notice has a request already.</div>
        ) : (
          <div className="space-y-2">
            <div className="text-xs font-medium text-[var(--text-secondary)]">Choose the days to excuse and give the reason for each:</div>
            {open.map((x) => (
              <div key={x.date} className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[180px_1fr]">
                <label className="flex items-center gap-2 text-sm text-[var(--text-primary)]">
                  <input type="checkbox" checked={!!picked[x.date]} onChange={(e) => setPicked((p) => ({ ...p, [x.date]: e.target.checked }))} className="accent-[var(--series-1)]" />
                  {formatDate(x.date)} <span className="text-xs text-[var(--text-muted)]">{x.minutes}m</span>
                </label>
                {picked[x.date] && (
                  <input
                    value={reasons[x.date] ?? ""}
                    onChange={(e) => setReasons((p) => ({ ...p, [x.date]: e.target.value }))}
                    maxLength={500}
                    placeholder="Reason, e.g. approved official business at the bank"
                    className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-2.5 py-1.5 text-sm"
                    aria-label={`Reason for ${formatDate(x.date)}`}
                  />
                )}
              </div>
            ))}
            <button
              onClick={send}
              disabled={!ready || !!busy}
              className="flex items-center gap-1.5 rounded-lg bg-[var(--series-1)] px-3 py-1.5 text-sm font-medium text-[var(--on-accent)] disabled:opacity-40"
            >
              {busy === "send" ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />} Send to HR ({chosen.length} day{chosen.length === 1 ? "" : "s"})
            </button>
          </div>
        ))}
    </div>
  );
}
