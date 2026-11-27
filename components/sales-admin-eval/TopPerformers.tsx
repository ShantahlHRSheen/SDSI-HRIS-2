"use client";

import { Award, Crown, Medal, Trophy } from "lucide-react";
import { jobItems, saeHeads, type SaeScores, type SalesAdminEvaluation } from "@/lib/sales-admin-eval";

// The top employee for each KPI (Job Performance item), for Sales, for
// Behavior, for Job Performance and overall — among the completed
// evaluations shown — with the award suggested for each.

export const KPI_AWARDS: Record<string, string> = {
  "Communication with superiors": "Excellent Communicator Award",
  "Time management": "On-Time Achiever Award",
  Productivity: "Productivity Champion Award",
  "Accuracy of works": "Precision & Accuracy Award",
  "Extra Effort": "Above and Beyond Award",
  "Quality of work done": "Quota Crusher Award",
  Accomplishment: "Goal Achiever Award",
  "Learning and growth strategies": "Growth Mindset Award",
  // Managers (phase 99).
  Leadership: "Leadership Excellence Award",
  "Decision making": "Sound Judgment Award",
  "Planning and organizing": "Master Planner Award",
  "Developing people": "People Developer Award",
  "Communication and coordination": "Bridge Builder Award",
  "Accountability for results": "Results Champion Award",
};
export const CATEGORY_AWARDS = {
  sales: "Top Seller Award",
  behavior: "Model Employee Award",
  job: "Outstanding Performer Award",
  overall: { "Year-end Evaluation": "Employee of the Year", "Monthly Evaluation": "Employee of the Month", default: "Top Performer Award" } as Record<string, string>,
};

export interface TopRow {
  e: SalesAdminEvaluation;
  s: SaeScores;
  w: { behavior: number; job: number; sales: number };
  department: string;
}

interface Pick {
  key: string;
  award: string;
  what: string;
  winners: TopRow[];
  score: string;
  big?: boolean;
}

const fmt = (n: number) => (Math.round(n * 100) / 100).toFixed(2);

// Everyone with the highest `value`: when two or more tie, they all get the
// award (co-winners), listed by overall score.
function best(rows: TopRow[], value: (r: TopRow) => number | null): { winners: TopRow[]; v: number } | null {
  const scored = rows.map((r) => ({ r, v: value(r) })).filter((x): x is { r: TopRow; v: number } => x.v !== null);
  if (!scored.length) return null;
  const top = Math.max(...scored.map((x) => x.v));
  const winners = scored
    .filter((x) => Math.abs(x.v - top) < 1e-9)
    .map((x) => x.r)
    .sort((a, b) => b.s.total - a.s.total || a.e.employeeName.localeCompare(b.e.employeeName))
    .filter((r, i, all) => all.findIndex((x) => x.e.employeeId === r.e.employeeId) === i);
  return { winners, v: top };
}

// A head-rated Job Performance item, averaged across the heads (0–3).
function kpiRating(r: TopRow, kra: string): number | null {
  const i = jobItems(r.e.form).findIndex((x) => x.kra === kra);
  if (i < 0) return null;
  const xs = saeHeads(r.e)
    .map((h) => h?.job?.[i])
    .filter((x): x is number => typeof x === "number");
  return xs.length ? xs.reduce((t, x) => t + x, 0) / xs.length : null;
}

export function TopPerformers({ rows, purpose }: { rows: TopRow[]; purpose: string }) {
  const done = rows.filter((r) => r.e.status === "done");
  if (!done.length) return null;
  const picks: Pick[] = [];
  // The overall award's name follows the evaluations shown (all Year-end: Employee of the Year).
  const purposes = new Set(done.map((r) => r.e.purpose));
  const overallName = CATEGORY_AWARDS.overall[purpose || (purposes.size === 1 ? [...purposes][0] : "")] ?? CATEGORY_AWARDS.overall.default;
  const add = (key: string, award: string, what: string, b: ReturnType<typeof best>, score: (v: number, r: TopRow) => string, big = false) => {
    if (b) picks.push({ key, award, what, winners: b.winners, score: score(b.v, b.winners[0]), big });
  };
  // Category winners (as % of each form's weight, so both forms compare).
  add("overall", overallName, "Highest overall score", best(done, (r) => r.s.total), (v) => `${fmt(v)} / 100`, true);
  add("behavior", CATEGORY_AWARDS.behavior, "Highest in Behavior", best(done, (r) => (r.w.behavior ? (r.s.behavior / r.w.behavior) * 100 : null)), (_, r) => `${fmt(r.s.behavior)} / ${r.w.behavior}`, true);
  add("job", CATEGORY_AWARDS.job, "Highest in Job Performance", best(done, (r) => (r.w.job ? (r.s.job / r.w.job) * 100 : null)), (_, r) => `${fmt(r.s.job)} / ${r.w.job}`, true);
  if (done.some((r) => r.w.sales > 0)) add("sales", CATEGORY_AWARDS.sales, "Highest in Sales", best(done, (r) => (r.w.sales ? r.s.sales : null)), (v) => `${fmt(v)} / 80`);
  // Each KPI the shown evaluations use.
  for (const kra of Object.keys(KPI_AWARDS)) {
    const b = best(done, (r) => kpiRating(r, kra));
    add(`kpi-${kra}`, KPI_AWARDS[kra], kra, b, (v) => `${(Math.round(v * 100) / 100).toString()} / 3`);
  }

  // Top 1, 2 and 3 by overall score (each employee once, by their best);
  // tied employees share a place.
  const bestOf = new Map<string, TopRow>();
  for (const r of done) {
    const cur = bestOf.get(r.e.employeeId);
    if (!cur || r.s.total > cur.s.total) bestOf.set(r.e.employeeId, r);
  }
  const levels = [...new Set([...bestOf.values()].map((r) => Math.round(r.s.total * 100) / 100))].sort((a, b) => b - a).slice(0, 3);
  const podium = levels.map((lv) => [...bestOf.values()].filter((r) => Math.round(r.s.total * 100) / 100 === lv).sort((a, b) => a.e.employeeName.localeCompare(b.e.employeeName)));
  const medal = ["text-amber-400", "text-slate-300", "text-orange-400"];

  const card = (p: Pick) => {
    const co = p.winners.length > 1;
    return (
      <div key={p.key} className={`rounded-xl border p-3 ${p.big ? "border-[var(--series-1)]/50 bg-[var(--series-1)]/5" : "border-[var(--border-hairline)] bg-[var(--surface-1)]"}`}>
        <div className="flex items-start gap-2">
          {p.key === "overall" ? <Crown size={18} className="mt-0.5 shrink-0 text-amber-400" /> : p.big ? <Trophy size={17} className="mt-0.5 shrink-0 text-amber-400" /> : <Award size={16} className="mt-0.5 shrink-0 text-[var(--series-1)]" />}
          <div className="min-w-0">
            <div className="text-sm font-semibold text-[var(--text-primary)]">{p.award}</div>
            <div className="text-[11px] text-[var(--text-muted)]">
              {p.what}
              {co && <span className="ml-1 rounded-full bg-amber-400/15 px-1.5 py-px font-medium text-amber-500">Tie · {p.winners.length} co-winners</span>}
            </div>
          </div>
        </div>
        <div className="mt-2 flex items-end justify-between gap-2">
          <div className="min-w-0 space-y-1">
            {p.winners.map((w) => (
              <div key={w.e.id} className="min-w-0">
                <div className="truncate font-medium text-[var(--text-primary)]">{w.e.employeeName}</div>
                <div className="truncate text-[11px] text-[var(--text-muted)]">{w.department}</div>
              </div>
            ))}
          </div>
          <div className="shrink-0 text-sm font-bold text-[var(--text-primary)] tabular-nums">{p.score}</div>
        </div>
      </div>
    );
  };

  return (
    <div className="mb-3 rounded-xl border border-[var(--border-hairline)] bg-[var(--gridline)]/10 p-3">
      <div className="mb-2 flex items-center gap-2 text-sm font-medium text-[var(--text-primary)]">
        <Trophy size={16} className="text-amber-400" /> Top performers &amp; suggested awards
        <span className="text-xs font-normal text-[var(--text-muted)]">— among the {done.length} completed evaluation{done.length === 1 ? "" : "s"} shown</span>
      </div>
      <div className="mb-2 grid gap-2 sm:grid-cols-3">
        {podium.map((ws, i) => (
          <div key={i} className={`rounded-xl border p-3 ${i === 0 ? "border-amber-400/60 bg-amber-400/10" : "border-[var(--border-hairline)] bg-[var(--surface-1)]"}`}>
            <div className="flex items-center gap-2">
              <Medal size={18} className={`shrink-0 ${medal[i]}`} />
              <div className="text-sm font-semibold text-[var(--text-primary)]">Top {i + 1}</div>
              {ws.length > 1 && <span className="rounded-full bg-amber-400/15 px-1.5 py-px text-[11px] font-medium text-amber-500">Tie · {ws.length}</span>}
              <div className="ml-auto text-sm font-bold text-[var(--text-primary)] tabular-nums">{fmt(ws[0].s.total)}</div>
            </div>
            <div className="mt-2 space-y-1">
              {ws.map((w) => (
                <div key={w.e.employeeId} className="min-w-0">
                  <div className="truncate font-medium text-[var(--text-primary)]">{w.e.employeeName}</div>
                  <div className="truncate text-[11px] text-[var(--text-muted)]">{w.department}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="mb-2 grid gap-2 sm:grid-cols-3">{picks.filter((p) => p.big).map(card)}</div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{picks.filter((p) => !p.big).map(card)}</div>
    </div>
  );
}
