"use client";

import { useMemo, useState } from "react";
import { Award, ChevronDown, ChevronRight, Download, Table2 } from "lucide-react";
import { useHris } from "@/lib/store";
import { departmentName } from "@/lib/helpers";
import { awardLine, saeHeads, saeScores, saeStatusLabel, saeWeights, SAE_FORMS, SAE_PURPOSES, type SalesAdminEvaluation } from "@/lib/sales-admin-eval";
import { saeConfig } from "./SalesAdminEval";

// The scores of every evaluation the signed-in person can see, as one table:
// HR and Upper Management see all; Department Heads and supervisors see the
// employees under them (supabase/migrate_phase96_evaluations_for_supervisors.sql).

const fmt = (n: number) => (Math.round(n * 100) / 100).toFixed(2);

export function EvaluationSummary({ items }: { items: SalesAdminEvaluation[] }) {
  const { employees } = useHris();
  const cfg = saeConfig();
  const [open, setOpen] = useState(true);
  const [purpose, setPurpose] = useState("");
  const [period, setPeriod] = useState("");
  const [dept, setDept] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<"score" | "name">("score");

  const rows = useMemo(
    () =>
      items.map((e) => {
        const emp = employees.find((x) => x.id === e.employeeId);
        const s = saeScores(e.form, e.hr, saeHeads(e), cfg.passMark);
        const heads = saeHeads(e);
        const award = [e.hr, ...heads].map((p, i) => (p?.award?.trim() ? `${i === 0 ? "HR" : "Head"}: ${p.award.trim()}` : "")).filter(Boolean);
        return {
          e,
          departmentId: emp?.departmentId ?? "",
          department: emp ? departmentName(emp.departmentId) : "",
          position: e.hr?.employee?.position ?? "",
          s,
          w: saeWeights(e.form),
          done: e.status === "done",
          headOverall: heads.map((h) => h?.overall).filter(Boolean).join(" / "),
          award,
          awardText: [e.hr, ...heads].map(awardLine).filter(Boolean).join(" | "),
        };
      }),
    [items, employees, cfg.passMark],
  );
  const periods = [...new Set(items.map((e) => e.period).filter(Boolean))].sort().reverse();
  const departments = [...new Map(rows.filter((r) => r.departmentId).map((r) => [r.departmentId, r.department])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const q = search.trim().toLowerCase();
  const shown = rows
    .filter((r) => (!purpose || r.e.purpose === purpose) && (!period || r.e.period === period) && (!dept || r.departmentId === dept) && (!q || r.e.employeeName.toLowerCase().includes(q)))
    .sort((a, b) => (sort === "score" ? b.s.total - a.s.total : 0) || a.e.employeeName.localeCompare(b.e.employeeName));
  const anySales = shown.some((r) => r.w.sales > 0);
  const completed = shown.filter((r) => r.done);
  const passed = completed.filter((r) => r.s.passed).length;
  const average = completed.length ? completed.reduce((t, r) => t + r.s.total, 0) / completed.length : 0;

  function exportCsv() {
    const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    const head = ["Employee", "Department", "Position", "Purpose", "Period", "Form", "Behavior", "Job Performance", ...(anySales ? ["Sales"] : []), "Actual score", "Result", "HR's rating", "Head's rating", "Suggested special award", "Status"];
    const lines = shown.map((r) => [
      r.e.employeeName,
      r.department,
      r.position,
      r.e.purpose,
      r.e.period,
      SAE_FORMS[r.e.form].label,
      fmt(r.s.behavior),
      fmt(r.s.job),
      ...(anySales ? [r.w.sales ? fmt(r.s.sales) : ""] : []),
      fmt(r.s.total),
      r.done ? (r.s.passed ? "PASSED" : "FAILED") : "In progress",
      r.e.hr?.overall ?? "",
      r.headOverall,
      r.awardText,
      saeStatusLabel(r.e).label,
    ]);
    const csv = [head, ...lines].map((l) => l.map((v) => esc(String(v ?? ""))).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `Evaluation scores${period ? ` ${period}` : ""}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const sel = "rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-2.5 py-1.5 text-xs";
  return (
    <div className="mb-4 rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-1)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button type="button" onClick={() => setOpen((v) => !v)} className="flex items-center gap-2 text-sm font-medium text-[var(--text-primary)]" aria-expanded={open}>
          {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          <Table2 size={16} className="text-[var(--series-1)]" /> Scores summary ({items.length})
        </button>
        {open && (
          <div className="flex flex-wrap items-center gap-2">
            <select value={purpose} onChange={(e) => setPurpose(e.target.value)} className={sel} aria-label="Purpose">
              <option value="">All purposes</option>
              {SAE_PURPOSES.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
            <select value={period} onChange={(e) => setPeriod(e.target.value)} className={sel} aria-label="Period">
              <option value="">All periods</option>
              {periods.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
            {departments.length > 1 && (
              <select value={dept} onChange={(e) => setDept(e.target.value)} className={sel} aria-label="Department">
                <option value="">All departments</option>
                {departments.map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
            )}
            <select value={sort} onChange={(e) => setSort(e.target.value as "score" | "name")} className={sel} aria-label="Sort">
              <option value="score">Highest score first</option>
              <option value="name">By name</option>
            </select>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search employee…" className="w-44 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-1.5 text-xs" />
            <button onClick={exportCsv} className="flex items-center gap-1.5 rounded-lg border border-[var(--border-hairline)] px-2.5 py-1.5 text-xs text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40">
              <Download size={13} /> Excel (CSV)
            </button>
          </div>
        )}
      </div>
      {open && (
        <>
          <div className="mt-3 mb-3 flex flex-wrap gap-2 text-xs">
            {[
              ["Shown", String(shown.length)],
              ["Completed", String(completed.length)],
              ["Passed", `${passed} of ${completed.length}`],
              ["Average score (completed)", completed.length ? fmt(average) : "—"],
            ].map(([k, v]) => (
              <div key={k} className="rounded-lg bg-[var(--gridline)]/25 px-3 py-1.5">
                <span className="text-[var(--text-muted)]">{k}</span> <b className="text-[var(--text-primary)] tabular-nums">{v}</b>
              </div>
            ))}
          </div>
          <div className="max-h-[560px] overflow-auto rounded-lg border border-[var(--border-hairline)]">
            <table className="w-full min-w-[980px] text-sm">
              <thead className="sticky top-0 z-10 bg-[var(--surface-1)]">
                <tr className="border-b border-[var(--border-hairline)] text-left text-xs text-[var(--text-muted)]">
                  <th className="px-3 py-2 font-medium">#</th>
                  <th className="px-3 py-2 font-medium">Employee</th>
                  <th className="px-3 py-2 font-medium">Purpose</th>
                  <th className="px-3 py-2 text-right font-medium">Behavior</th>
                  <th className="px-3 py-2 text-right font-medium">Job Perf.</th>
                  {anySales && <th className="px-3 py-2 text-right font-medium">Sales</th>}
                  <th className="px-3 py-2 text-right font-medium">Score</th>
                  <th className="px-3 py-2 font-medium">Result</th>
                  <th className="px-3 py-2 font-medium">Ratings (HR / Head)</th>
                  <th className="px-3 py-2 font-medium">Special award</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r, i) => (
                  <tr key={r.e.id} className="border-b border-[var(--gridline)] align-top last:border-0">
                    <td className="px-3 py-2 text-xs text-[var(--text-muted)] tabular-nums">{i + 1}</td>
                    <td className="px-3 py-2">
                      <div className="font-medium text-[var(--text-primary)]">{r.e.employeeName}</div>
                      <div className="text-[11px] text-[var(--text-muted)]">{[r.department, r.position].filter(Boolean).join(" · ")}</div>
                    </td>
                    <td className="px-3 py-2 text-xs text-[var(--text-secondary)]">
                      {r.e.purpose.replace(" Evaluation", "").replace("Evaluation for ", "")} {r.e.period}
                      <div className="text-[11px] text-[var(--text-muted)]">{SAE_FORMS[r.e.form].label}</div>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {fmt(r.s.behavior)}
                      <span className="text-[11px] text-[var(--text-muted)]">/{r.w.behavior}</span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {fmt(r.s.job)}
                      <span className="text-[11px] text-[var(--text-muted)]">/{r.w.job}</span>
                    </td>
                    {anySales && (
                      <td className="px-3 py-2 text-right tabular-nums">
                        {r.w.sales ? (
                          <>
                            {fmt(r.s.sales)}
                            <span className="text-[11px] text-[var(--text-muted)]">/{r.w.sales}</span>
                          </>
                        ) : (
                          <span className="text-[var(--text-muted)]">—</span>
                        )}
                      </td>
                    )}
                    <td className="px-3 py-2 text-right text-base font-bold tabular-nums text-[var(--text-primary)]">{fmt(r.s.total)}</td>
                    <td className="px-3 py-2">
                      {r.done ? (
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${r.s.passed ? "bg-[var(--status-good)]/15 text-[var(--status-good)]" : "bg-[var(--status-critical)]/15 text-[var(--status-critical)]"}`}>{r.s.passed ? "PASSED" : "FAILED"}</span>
                      ) : (
                        <span className="text-xs text-[var(--text-muted)]" title={saeStatusLabel(r.e).label}>
                          In progress
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs text-[var(--text-secondary)]">
                      {[r.e.hr?.overall, r.headOverall].map((x) => x || "—").join(" / ")}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {r.award.length ? (
                        <span className="flex items-start gap-1 text-[var(--text-primary)]" title={r.awardText}>
                          <Award size={13} className="mt-0.5 shrink-0 text-[var(--series-1)]" />
                          {r.award.join("; ")}
                        </span>
                      ) : (
                        <span className="text-[var(--text-muted)]">—</span>
                      )}
                    </td>
                  </tr>
                ))}
                {!shown.length && (
                  <tr>
                    <td colSpan={anySales ? 10 : 9} className="px-3 py-6 text-center text-sm text-[var(--text-muted)]">
                      No matching evaluations.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[11px] text-[var(--text-muted)]">
            Passing score {cfg.passMark}. &ldquo;In progress&rdquo; scores count only the parts signed or saved so far. Hover a special award to see the justification.
          </p>
        </>
      )}
    </div>
  );
}
