"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, ListChecks } from "lucide-react";
import { useHris } from "@/lib/store";
import { useWorkforceActions, WORKFORCE_PATHS, type WorkforceKind } from "@/components/workforce/WorkforceBadges";
import { fetchSalesAdminEvaluations, saeMyTurn, type SalesAdminEvaluation } from "@/lib/sales-admin-eval";
import { fetchMplRequests, type MplRequest } from "@/lib/mpl";
import { fetchCoeRequests, type CoeRequest } from "@/lib/coe";
import { fetchRegularizations, type Regularization } from "@/lib/regularization";
import { disciplineActions, fetchAssessments, type DisciplineAssessment } from "@/lib/discipline-assessment";

// The dashboard's "Needs your action": everything waiting for the signed-in
// person across the HRIS — approvals, signatures, evaluations — each linking
// to its page. Refreshed every minute, like the menu badges.

const POLL_MS = 60_000;

interface Card {
  key: string;
  title: string;
  summary: string;
  names: string[];
  href: string;
  button: string;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function NeedsYourAction() {
  const { isRealAccount, currentEmployee, currentUser, employees, disciplinaryRecords } = useHris();
  const me = currentEmployee?.id;
  const isHr = !!currentUser?.roles.includes("hr_admin");
  const workforce = useWorkforceActions();
  const [evals, setEvals] = useState<SalesAdminEvaluation[] | null>(null);
  const [mpl, setMpl] = useState<MplRequest[]>([]);
  const [coe, setCoe] = useState<CoeRequest[]>([]);
  const [assessments, setAssessments] = useState<DisciplineAssessment[]>([]);
  const [regs, setRegs] = useState<Regularization[]>([]);

  const load = useCallback(() => {
    if (!isRealAccount || !me) return;
    // Each part on its own: one not set up yet doesn't hide the others.
    fetchSalesAdminEvaluations().then(setEvals, () => setEvals([]));
    fetchMplRequests().then(setMpl, () => setMpl([]));
    if (isHr) fetchCoeRequests().then(setCoe, () => setCoe([]));
    fetchAssessments().then(setAssessments, () => setAssessments([]));
    fetchRegularizations().then(setRegs, () => setRegs([]));
  }, [isRealAccount, me, isHr]);
  useEffect(() => {
    load();
    const t = window.setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, POLL_MS);
    return () => window.clearInterval(t);
  }, [load]);

  const nameOf = useCallback(
    (id: string) => {
      const e = employees.find((x) => x.id === id);
      return e ? `${e.firstName} ${e.lastName}` : "an employee";
    },
    [employees],
  );
  const hrIds = useMemo(() => new Set(employees.filter((e) => e.roles.includes("hr_admin")).map((e) => e.id)), [employees]);

  if (!isRealAccount || !me || !workforce || evals === null) return null;

  const cards: Card[] = [];
  const approvals: [WorkforceKind, string, string][] = [
    ["leave", "Leave Management", "leave"],
    ["ot", "Overtime", "overtime request"],
    ["corr", "Attendance Corrections", "attendance correction"],
    ["travel", "Travel Allowance", "travel allowance"],
  ];
  for (const [kind, title, noun] of approvals) {
    const items = workforce[kind];
    if (items.length)
      cards.push({ key: kind, title, summary: `${plural(items.length, noun)} to approve`, names: items.map((i) => nameOf(i.employeeId)), href: WORKFORCE_PATHS[kind], button: "Review" });
  }

  const turns = evals.map((e) => ({ e, turn: saeMyTurn(e, me, isHr) })).filter((x) => x.turn);
  if (turns.length) {
    const count = (t: string) => turns.filter((x) => x.turn === t).length;
    const parts = [
      count("recommend") && `${plural(count("recommend"), "recommendation")} to sign`,
      count("head") && `${plural(count("head"), "evaluation")} to rate`,
      count("hr") && `${plural(count("hr"), "evaluation")} to fill in`,
    ].filter(Boolean);
    cards.push({
      key: "eval",
      title: "Performance Evaluations",
      summary: parts.join(" · "),
      names: turns.map((x) => x.e.employeeName),
      href: "/sales-admin-evaluation",
      button: count("recommend") ? "Sign" : "Open",
    });
  }

  const mplMine = mpl.filter((r) => (r.status === "signatory" && r.signatoryId === me) || (isHr && r.status === "hr"));
  if (mplMine.length)
    cards.push({
      key: "mpl",
      title: "Pag-IBIG Loan Form",
      summary: `${plural(mplMine.length, "form")} to ${mplMine.some((r) => r.status === "signatory") ? "sign" : "check"}`,
      names: mplMine.map((r) => r.employeeName),
      href: "/pagibig-loan",
      button: "Open",
    });

  const coePending = isHr ? coe.filter((r) => r.status === "pending") : [];
  if (coePending.length)
    cards.push({ key: "coe", title: "Certificate of Employment", summary: `${plural(coePending.length, "COE request")} to sign`, names: coePending.map((r) => r.employeeName), href: "/coe", button: "Sign" });

  const regMine = regs.filter((r) => (r.status === "chairman" && r.signatoryId === me) || (r.status === "employee" && r.employeeId === me) || (isHr && r.status === "hr"));
  if (regMine.length) {
    const sign = regMine.filter((r) => r.status === "chairman").length;
    const receive = regMine.filter((r) => r.status === "employee").length;
    const drafts = regMine.filter((r) => r.status === "hr").length;
    cards.push({
      key: "reg",
      title: "Regularization",
      summary: [sign && `${plural(sign, "contract")} to sign`, receive && "Your regularization to receive", drafts && `${plural(drafts, "draft")} to send`].filter(Boolean).join(" · "),
      names: regMine.map((r) => r.employeeName),
      href: "/regularization",
      button: sign || receive ? "Sign" : "Open",
    });
  }

  const discipline = disciplineActions(disciplinaryRecords, me, isHr, assessments, hrIds);
  if (discipline.length)
    cards.push({
      key: "discipline",
      title: "Discipline",
      summary: `${plural(discipline.length, "notice")} to act on`,
      names: discipline.map((d) => nameOf(d.r.employeeId)),
      href: "/discipline",
      button: "Open",
    });

  const total = cards.reduce((n, c) => n + c.names.length, 0);

  if (!cards.length) {
    return (
      <div className="mt-4 flex items-center gap-2 rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-1)] px-4 py-3 text-sm text-[var(--text-secondary)]">
        <CheckCircle2 size={16} className="text-[var(--status-good)]" /> You&rsquo;re all caught up — nothing is waiting for you.
      </div>
    );
  }

  return (
    <section className="mt-4 rounded-xl border border-[var(--series-1)]/45 bg-[var(--surface-1)] p-4">
      <div className="mb-3 flex items-center gap-2 text-[15px] font-semibold text-[var(--text-primary)]">
        <ListChecks size={18} /> Needs your action
        <span className="rounded-full bg-[var(--status-critical)] px-2 text-xs font-semibold text-white">{total}</span>
      </div>
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map((c) => {
          const unique = [...new Set(c.names)];
          const shown = unique.slice(0, 3).join(" · ") + (unique.length > 3 ? ` +${unique.length - 3} more` : "");
          return (
            <div key={c.key} className="flex items-center justify-between gap-3 rounded-lg bg-[var(--gridline)]/25 px-3 py-2.5">
              <div className="min-w-0">
                <div className="text-xs text-[var(--text-muted)]">{c.title}</div>
                <div className="text-sm font-semibold text-[var(--text-primary)]">{c.summary}</div>
                <div className="truncate text-xs text-[var(--text-secondary)]" title={unique.join(", ")}>
                  {shown}
                </div>
              </div>
              <Link href={c.href} className="flex shrink-0 items-center gap-1 rounded-lg bg-[var(--series-1)] px-3 py-1.5 text-sm font-medium text-[var(--on-accent)]">
                {c.button} <ArrowRight size={14} />
              </Link>
            </div>
          );
        })}
      </div>
    </section>
  );
}
