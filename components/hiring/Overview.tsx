"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import { useHris } from "@/lib/store";
import { Badge } from "@/components/Badge";
import { fullName } from "@/lib/helpers";
import { CLOSED, applicantStage, applicantWaitingOn, approverTitle, fetchApplicants, fetchApproverId, type Applicant, type Stage } from "@/lib/hiring";
import { PRF_STATUS, fetchPrfApproverId, fetchRequisitions, prfApproverTitle, type Requisition } from "@/lib/requisition";

// Hiring & Onboarding at a glance: every step from the personnel requisition
// to contract signing, how many are on each, and whose they are.

type Step = "prf" | Stage;
const STEPS = (): { key: Step; label: string }[] => [
  { key: "prf", label: "Personnel Requisition Form" },
  { key: "applicants", label: "Applicants" },
  { key: "initial", label: "Initial interview (HR)" },
  { key: "head_interview", label: "Branch / Department Head interview" },
  { key: "background", label: "Background investigation" },
  { key: "head_rec", label: "Head's recommendation" },
  { key: "final", label: `${approverTitle()}'s decision` },
  { key: "onboarding", label: "Onboarding" },
  { key: "training", label: "Training" },
  { key: "assessment", label: "For final assessment" },
  { key: "contract", label: "Contract signing" },
];

const days = (iso: string) => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));
const ago = (iso: string) => {
  const d = days(iso);
  return d === 0 ? "today" : d === 1 ? "1 day ago" : `${d} days ago`;
};

export function Overview({ onOpenApplicant, onOpenRequisition }: { onOpenApplicant: (id: string) => void; onOpenRequisition: (id: string) => void }) {
  const { employees, branches, departments } = useHris();
  const [apps, setApps] = useState<Applicant[] | null>(null);
  const [prfs, setPrfs] = useState<Requisition[]>([]);
  const [approver, setApprover] = useState<string | null>(null);
  const [prfApprover, setPrfApprover] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sel, setSel] = useState<Step | null>(null);

  useEffect(() => {
    fetchApplicants().then(setApps, (e) => setError(e instanceof Error ? e.message : "Couldn't load applicants."));
    fetchRequisitions().then(setPrfs, () => {});
    fetchApproverId().then(setApprover, () => {});
    fetchPrfApproverId().then(setPrfApprover, () => {});
  }, []);

  const name = (id: string | null | undefined, fallback = "—") => {
    const e = id ? employees.find((x) => x.id === id) : undefined;
    return e ? fullName(e) : fallback;
  };
  const place = (b: string | null, d: string | null) => [branches.find((x) => x.id === b)?.name, departments.find((x) => x.id === d)?.name].filter(Boolean).join(" · ");

  const openPrfs = prfs.filter((r) => r.status === "draft" || r.status === "hr_review" || r.status === "approval");
  const byStage = useMemo(() => {
    const m = new Map<Stage, Applicant[]>();
    for (const a of apps ?? []) {
      const s = applicantStage(a);
      if (s) m.set(s, [...(m.get(s) ?? []), a]);
    }
    return m;
  }, [apps]);
  const count = (k: Step) => (k === "prf" ? openPrfs.length : (byStage.get(k)?.length ?? 0));
  const hired = (apps ?? []).filter((a) => a.status === "hired" && a.contractSignedAt).length;
  const closed = (apps ?? []).filter((a) => CLOSED.includes(a.status)).length;
  const approvedPrfs = prfs.filter((r) => r.status === "approved");
  const needed = approvedPrfs.reduce((t, r) => t + r.personnelNeeded, 0);

  const waitingName = (a: Applicant) => {
    const w = applicantWaitingOn(a);
    return w === "hr" ? "HR" : w === "head" ? name(a.headId, "the Head") : w === "approver" ? name(approver, approverTitle()) : "—";
  };
  const prfWaiting = (r: Requisition) => (r.status === "draft" ? name(r.createdBy, r.requestedByName || "the Head") : r.status === "hr_review" ? "HR" : name(prfApprover, prfApproverTitle()));

  const steps = STEPS();
  const current = steps.find((s) => s.key === sel);
  const list = sel && sel !== "prf" ? (byStage.get(sel) ?? []) : [];
  // Whose applicants: per Head, on the chosen step.
  const perHead = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of list) {
      const k = a.headId ? name(a.headId) : "No Head assigned yet";
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return [...m.entries()].sort((x, y) => y[1] - x[1]);
    // name() depends on employees only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list, employees]);

  if (error) return <div className="text-sm text-[var(--status-critical)]">{error}</div>;
  if (!apps) return <div className="text-sm text-[var(--text-muted)]">Loading…</div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 text-sm">
        <Summary label="In progress" value={[...byStage.values()].reduce((t, l) => t + l.length, 0)} />
        <Summary label="Hired (contract signed)" value={hired} />
        <Summary label="Not hired / closed" value={closed} />
        <Summary label="Approved requisitions" value={approvedPrfs.length} hint={needed ? `${needed} personnel needed` : undefined} />
      </div>

      <ol className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {steps.map((s, i) => {
          const n = count(s.key);
          const on = sel === s.key;
          const people = s.key === "prf" ? openPrfs.map((r) => r.position) : (byStage.get(s.key as Stage) ?? []).map((a) => a.name);
          return (
            <li key={s.key}>
              <button
                onClick={() => setSel(on ? null : s.key)}
                aria-pressed={on}
                className={`flex h-full w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors ${on ? "border-[var(--series-1)] bg-[var(--series-1)]/10" : "border-[var(--border-hairline)] bg-[var(--surface-1)] hover:bg-[var(--gridline)]/30"}`}
              >
                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${n ? "bg-[var(--series-1)] text-[var(--on-accent)]" : "bg-[var(--gridline)] text-[var(--text-muted)]"}`}>{i + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-[var(--text-primary)]">{s.label}</span>
                  <span className="block truncate text-xs text-[var(--text-muted)]">{people.length ? people.slice(0, 3).join(", ") + (people.length > 3 ? ` +${people.length - 3}` : "") : "None"}</span>
                </span>
                <span className={`text-2xl font-semibold tabular-nums ${n ? "text-[var(--text-primary)]" : "text-[var(--text-muted)]"}`}>{n}</span>
              </button>
            </li>
          );
        })}
      </ol>

      {current && (
        <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-1)]">
          <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border-hairline)] px-3 py-2">
            <div className="text-sm font-semibold text-[var(--text-primary)]">{current.label}</div>
            <Badge tone="info">{count(current.key)}</Badge>
            {perHead.length > 0 && (
              <div className="ml-auto flex flex-wrap gap-1 text-xs text-[var(--text-secondary)]">
                {perHead.map(([h, n]) => (
                  <span key={h} className="rounded-full border border-[var(--border-hairline)] px-2 py-0.5">
                    {h}: {n}
                  </span>
                ))}
              </div>
            )}
          </div>
          {count(current.key) === 0 && <div className="p-4 text-center text-sm text-[var(--text-muted)]">No one on this step.</div>}
          <ul className="divide-y divide-[var(--border-hairline)]">
            {sel === "prf"
              ? openPrfs.map((r) => (
                  <Row
                    key={r.id}
                    onClick={() => onOpenRequisition(r.id)}
                    title={`${r.position}${r.personnelNeeded > 1 ? ` × ${r.personnelNeeded}` : ""}`}
                    sub={[r.prfNo, place(r.branchId, r.departmentId), r.requestedByName && `Requested by ${r.requestedByName}`].filter(Boolean).join(" · ")}
                    status={PRF_STATUS[r.status].label}
                    waiting={prfWaiting(r)}
                    since={ago(r.updatedAt)}
                  />
                ))
              : list.map((a) => (
                  <Row
                    key={a.id}
                    onClick={() => onOpenApplicant(a.id)}
                    title={a.name}
                    sub={[a.position, place(a.branchId, a.departmentId), a.headId && `Head: ${name(a.headId)}`].filter(Boolean).join(" · ")}
                    waiting={waitingName(a)}
                    since={ago(a.updatedAt)}
                  />
                ))}
          </ul>
        </div>
      )}
      {!current && <p className="text-xs text-[var(--text-muted)]">Click a step to see who is on it and whose they are.</p>}
    </div>
  );
}

function Summary({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="min-w-[140px] flex-1 rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-2">
      <div className="text-xs text-[var(--text-muted)]">{label}</div>
      <div className="text-xl font-semibold text-[var(--text-primary)] tabular-nums">{value}</div>
      {hint && <div className="text-[11px] text-[var(--text-muted)]">{hint}</div>}
    </div>
  );
}

function Row({ title, sub, status, waiting, since, onClick }: { title: string; sub: string; status?: string; waiting: string; since: string; onClick: () => void }) {
  return (
    <li>
      <button onClick={onClick} className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2.5 text-left hover:bg-[var(--gridline)]/30">
        <span className="min-w-0 flex-1 basis-56">
          <span className="block truncate text-sm font-medium text-[var(--text-primary)]">{title}</span>
          <span className="block truncate text-xs text-[var(--text-muted)]">{sub || "—"}</span>
        </span>
        {status && <Badge tone="muted">{status}</Badge>}
        <span className="text-xs text-[var(--text-secondary)]">
          Waiting on <b className="text-[var(--text-primary)]">{waiting}</b>
        </span>
        <span className="w-24 text-right text-xs text-[var(--text-muted)]" title="Last updated">{since}</span>
        <ChevronRight size={16} className="text-[var(--text-muted)]" />
      </button>
    </li>
  );
}
