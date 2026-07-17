"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, ClipboardList, Plus, Settings2 } from "lucide-react";
import { useHris } from "@/lib/store";
import { PageHeader } from "@/components/PageHeader";
import { Badge, type BadgeTone } from "@/components/Badge";
import { Modal } from "@/components/Modal";
import { EmptyState } from "@/components/EmptyState";
import { CURRENT_EVAL_PERIOD } from "@/lib/mock-data";
import { fullName, positionTitle, scopeEmployeesForViewer } from "@/lib/helpers";
import {
  computeCategorySubtotals,
  computeKpiPoints,
  computeOverallScore,
  effectiveJobPerformanceEvaluatorId,
  KPI_TEMPLATE,
  newCriteriaFromTemplate,
  ratingBand,
  type KpiCategory,
  type RatingBand,
} from "@/lib/performance-eval";
import type { Employee, EvaluationCriterion, EvaluationStatus, PerformanceEvaluation } from "@/lib/types";

const STATUS_TONE: Record<EvaluationStatus, BadgeTone> = {
  draft: "muted",
  submitted: "info",
  acknowledged: "good",
};

const BAND_TONE: Record<RatingBand, BadgeTone> = {
  Excellent: "good",
  Good: "info",
  "Needs Improvement": "warning",
  Failed: "critical",
};

const SCORE_LABELS: Record<number, string> = { 0: "Failed", 1: "Needs Improvement", 2: "Good", 3: "Excellent" };
const CATEGORY_ORDER: KpiCategory[] = ["Behavior", "Job Performance"];

function anchorFor(label: string, score: number): string {
  const kpi = KPI_TEMPLATE.find((k) => k.label === label);
  if (!kpi) return "";
  return kpi.anchors[score as 0 | 1 | 2 | 3] ?? "";
}

interface Workspace {
  mode: "new" | "existing";
  evaluationId: string | null;
  employeeId: string;
  criteria: EvaluationCriterion[];
  comments: string;
  status: EvaluationStatus;
  behaviorEvaluatorId: string | null;
  jobPerformanceEvaluatorId: string | null;
}

export default function EvaluationsPage() {
  const {
    evaluations,
    employees,
    currentEmployee,
    currentUser,
    addEvaluation,
    updateEvaluationSection,
    setEvaluationStatus,
    updateEmployee,
  } = useHris();
  const [statusFilter, setStatusFilter] = useState<"all" | EvaluationStatus>("all");
  const [showPicker, setShowPicker] = useState(false);
  const [showManageEvaluators, setShowManageEvaluators] = useState(false);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);

  const isHr = !!currentUser?.roles.includes("hr_admin");
  const byId = new Map(employees.map((e) => [e.id, e]));

  // --- Visibility: HR/upper-mgmt/etc see everything (existing dept scoping);
  // a dept_head/manager additionally sees anyone they're the designated Job
  // Performance evaluator for, even outside their own department. ---------
  const visibleEmployeeIds = useMemo(() => {
    const scoped = scopeEmployeesForViewer(employees, currentUser?.roles ?? [], currentEmployee);
    const ids = new Set(scoped.map((e) => e.id));
    if (currentEmployee) {
      employees.forEach((e) => {
        if (effectiveJobPerformanceEvaluatorId(e) === currentEmployee.id) ids.add(e.id);
      });
    }
    return ids;
  }, [employees, currentUser, currentEmployee]);

  const rows = useMemo(() => {
    return evaluations
      .filter((e) => visibleEmployeeIds.has(e.employeeId))
      .filter((e) => (statusFilter === "all" ? true : e.status === statusFilter))
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }, [evaluations, statusFilter, visibleEmployeeIds]);

  // Employees a "New evaluation" can be started for.
  const evaluableEmployees = useMemo(() => {
    if (isHr) return employees;
    if (!currentEmployee) return [];
    return employees.filter((e) => effectiveJobPerformanceEvaluatorId(e) === currentEmployee.id);
  }, [employees, isHr, currentEmployee]);

  function canEditBehaviorFor(): boolean {
    return isHr;
  }
  function canEditJobPerformanceFor(targetEmployee: Employee | undefined): boolean {
    if (!currentEmployee || !targetEmployee) return false;
    return effectiveJobPerformanceEvaluatorId(targetEmployee) === currentEmployee.id;
  }

  function openExisting(ev: PerformanceEvaluation) {
    setWorkspace({
      mode: "existing",
      evaluationId: ev.id,
      employeeId: ev.employeeId,
      criteria: ev.criteria,
      comments: ev.comments,
      status: ev.status,
      behaviorEvaluatorId: ev.behaviorEvaluatorId,
      jobPerformanceEvaluatorId: ev.jobPerformanceEvaluatorId,
    });
  }

  function startOrOpen(employeeId: string) {
    const existing = evaluations.find((e) => e.employeeId === employeeId && e.period === CURRENT_EVAL_PERIOD);
    if (existing) {
      openExisting(existing);
    } else {
      setWorkspace({
        mode: "new",
        evaluationId: null,
        employeeId,
        criteria: newCriteriaFromTemplate(),
        comments: "",
        status: "draft",
        behaviorEvaluatorId: null,
        jobPerformanceEvaluatorId: null,
      });
    }
    setShowPicker(false);
  }

  function setScore(index: number, score: number) {
    setWorkspace((w) => {
      if (!w) return w;
      const criteria = [...w.criteria];
      criteria[index] = { ...criteria[index], score };
      return { ...w, criteria };
    });
  }
  function setRemarks(index: number, remarks: string) {
    setWorkspace((w) => {
      if (!w) return w;
      const criteria = [...w.criteria];
      criteria[index] = { ...criteria[index], remarks };
      return { ...w, criteria };
    });
  }

  const workspaceEmployee = workspace ? byId.get(workspace.employeeId) : undefined;
  const iCanEditBehavior = canEditBehaviorFor();
  const iCanEditJobPerformance = canEditJobPerformanceFor(workspaceEmployee);
  const myEditableCategories: KpiCategory[] = [
    ...(iCanEditBehavior ? (["Behavior"] as KpiCategory[]) : []),
    ...(iCanEditJobPerformance ? (["Job Performance"] as KpiCategory[]) : []),
  ];

  const missingRemarks = workspace
    ? workspace.criteria.filter((c) => myEditableCategories.includes(c.category as KpiCategory) && c.score <= 1 && !c.remarks.trim())
    : [];
  const canSave = myEditableCategories.length > 0 && missingRemarks.length === 0;

  const liveOverall = workspace ? computeOverallScore(workspace.criteria) : 0;
  const liveSubtotals = workspace ? computeCategorySubtotals(workspace.criteria) : [];
  const behaviorDone = !!workspace?.behaviorEvaluatorId;
  const jobPerfDone = !!workspace?.jobPerformanceEvaluatorId;
  const bothDone = behaviorDone && jobPerfDone;

  function saveMySection() {
    if (!workspace || !currentEmployee || !canSave) return;
    if (workspace.mode === "new") {
      addEvaluation({
        employeeId: workspace.employeeId,
        period: CURRENT_EVAL_PERIOD,
        criteria: workspace.criteria,
        overallScore: computeOverallScore(workspace.criteria),
        comments: workspace.comments || "No additional comments.",
        status: "draft",
        behaviorEvaluatorId: myEditableCategories.includes("Behavior") ? currentEmployee.id : null,
        jobPerformanceEvaluatorId: myEditableCategories.includes("Job Performance") ? currentEmployee.id : null,
      });
    } else if (workspace.evaluationId) {
      myEditableCategories.forEach((category) => {
        const sectionCriteria = workspace.criteria.filter((c) => c.category === category);
        updateEvaluationSection(workspace.evaluationId as string, category, sectionCriteria, currentEmployee.id, workspace.comments);
      });
    }
    setWorkspace(null);
  }

  return (
    <div>
      <PageHeader
        title="Performance Evaluations"
        subtitle={`Current period: ${CURRENT_EVAL_PERIOD} — HR rates Behavior (40%), the designated evaluator rates Job Performance (60%).`}
        actions={
          <div className="flex gap-2">
            {isHr && (
              <button onClick={() => setShowManageEvaluators(true)} className="flex items-center gap-1.5 rounded-lg border border-[var(--border-hairline)] px-3 py-2 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40">
                <Settings2 size={16} /> Manage evaluators
              </button>
            )}
            {(isHr || evaluableEmployees.length > 0) && (
              <button onClick={() => setShowPicker(true)} className="flex items-center gap-1.5 rounded-lg bg-[var(--series-1)] px-3 py-2 text-sm font-medium text-[var(--on-accent)]">
                <Plus size={16} /> New evaluation
              </button>
            )}
          </div>
        }
      />

      <div className="mb-4 flex gap-2">
        {(["all", "draft", "submitted", "acknowledged"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium capitalize ${statusFilter === s ? "bg-[var(--series-1)] text-[var(--on-accent)]" : "border border-[var(--border-hairline)] text-[var(--text-secondary)]"}`}
          >
            {s}
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={ClipboardList} title="No evaluations found" description="Try a different status filter, or start a new evaluation." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-1)]">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-[var(--border-hairline)] text-left text-xs text-[var(--text-muted)]">
                <th className="px-4 py-2 font-medium">Employee</th>
                <th className="px-4 py-2 font-medium">Period</th>
                <th className="px-4 py-2 font-medium">Behavior</th>
                <th className="px-4 py-2 font-medium">Job Performance</th>
                <th className="px-4 py-2 font-medium">Overall score</th>
                <th className="px-4 py-2 font-medium">Rating</th>
                <th className="px-4 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((ev) => {
                const emp = byId.get(ev.employeeId);
                const band = ratingBand(ev.overallScore);
                return (
                  <tr key={ev.id} onClick={() => openExisting(ev)} className="cursor-pointer border-b border-[var(--gridline)] last:border-0 hover:bg-[var(--gridline)]/20">
                    <td className="px-4 py-2.5">
                      <div className="font-medium text-[var(--text-primary)]">{emp ? fullName(emp) : ev.employeeId}</div>
                      <div className="text-xs text-[var(--text-muted)]">{emp ? positionTitle(emp.positionId) : ""}</div>
                    </td>
                    <td className="px-4 py-2.5 text-[var(--text-secondary)]">{ev.period}</td>
                    <td className="px-4 py-2.5">{ev.behaviorEvaluatorId ? <Badge tone="good">Done</Badge> : <Badge tone="muted">Pending</Badge>}</td>
                    <td className="px-4 py-2.5">{ev.jobPerformanceEvaluatorId ? <Badge tone="good">Done</Badge> : <Badge tone="muted">Pending</Badge>}</td>
                    <td className="tabular px-4 py-2.5 font-medium text-[var(--text-primary)]">{ev.overallScore.toFixed(1)}%</td>
                    <td className="px-4 py-2.5"><Badge tone={BAND_TONE[band]}>{band}</Badge></td>
                    <td className="px-4 py-2.5"><Badge tone={STATUS_TONE[ev.status]}>{ev.status}</Badge></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* --- Employee picker for "New evaluation" ---------------------------- */}
      <Modal open={showPicker} onClose={() => setShowPicker(false)} title="Start a new evaluation">
        <div className="space-y-1">
          {evaluableEmployees.length === 0 ? (
            <div className="py-4 text-center text-sm text-[var(--text-muted)]">No employees are assigned to you to evaluate.</div>
          ) : (
            evaluableEmployees.map((e) => (
              <button
                key={e.id}
                onClick={() => startOrOpen(e.id)}
                className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm hover:bg-[var(--gridline)]/40"
              >
                <span className="text-[var(--text-primary)]">{fullName(e)}</span>
                <span className="text-xs text-[var(--text-muted)]">{positionTitle(e.positionId)}</span>
              </button>
            ))
          )}
        </div>
      </Modal>

      {/* --- Evaluation workspace: view/edit, split by category permission --- */}
      <Modal open={!!workspace} onClose={() => setWorkspace(null)} title="Performance evaluation" wide>
        {workspace && workspaceEmployee && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium text-[var(--text-primary)]">{fullName(workspaceEmployee)}</div>
                <div className="text-xs text-[var(--text-muted)]">{CURRENT_EVAL_PERIOD}</div>
              </div>
              <Badge tone={STATUS_TONE[workspace.status]}>{workspace.status}</Badge>
            </div>

            <div className="flex items-center justify-between rounded-lg bg-[var(--gridline)]/30 px-3 py-2 text-sm">
              <span className="text-[var(--text-secondary)]">Live overall score</span>
              <span className="flex items-center gap-2">
                <span className="tabular font-semibold text-[var(--text-primary)]">{liveOverall.toFixed(1)}%</span>
                <Badge tone={BAND_TONE[ratingBand(liveOverall)]}>{ratingBand(liveOverall)}</Badge>
              </span>
            </div>

            {CATEGORY_ORDER.map((category) => {
              const subtotal = liveSubtotals.find((s) => s.category === category);
              const iCanEdit = myEditableCategories.includes(category);
              const sectionDone = category === "Behavior" ? behaviorDone : jobPerfDone;
              const waitingOnName =
                category === "Behavior"
                  ? "HR"
                  : (() => {
                      const evalId = effectiveJobPerformanceEvaluatorId(workspaceEmployee);
                      const p = evalId ? byId.get(evalId) : null;
                      return p ? fullName(p) : "the designated evaluator";
                    })();

              return (
                <div key={category} className="space-y-3">
                  <div className="flex items-center justify-between border-b border-[var(--gridline)] pb-1 text-xs font-semibold uppercase text-[var(--text-muted)]">
                    <span>
                      {category} ({Math.round((subtotal?.weightSum ?? 0) * 100)}%)
                      {!iCanEdit && <span className="ml-2 normal-case text-[var(--text-muted)]">— view only</span>}
                    </span>
                    <span className="tabular">{((subtotal?.pointsSum ?? 0) * 100).toFixed(1)} pts</span>
                  </div>

                  {!iCanEdit && !sectionDone ? (
                    <div className="rounded-lg border border-dashed border-[var(--border-hairline)] p-3 text-center text-xs text-[var(--text-muted)]">
                      Awaiting evaluation from {waitingOnName}.
                    </div>
                  ) : (
                    workspace.criteria.map((c, i) => {
                      if (c.category !== category) return null;
                      if (!iCanEdit) {
                        return (
                          <div key={c.label} className="rounded-lg border border-[var(--border-hairline)] p-3 text-sm">
                            <div className="flex items-center justify-between">
                              <span className="text-[var(--text-secondary)]">{c.label}</span>
                              <span className="tabular font-medium text-[var(--text-primary)]">{c.score} – {SCORE_LABELS[c.score]}</span>
                            </div>
                            <div className="mt-1 text-xs text-[var(--text-muted)]">{anchorFor(c.label, c.score)}</div>
                            {c.remarks && <div className="mt-1 text-xs italic text-[var(--text-muted)]">{c.remarks}</div>}
                          </div>
                        );
                      }
                      const needsRemark = c.score <= 1;
                      const missing = needsRemark && !c.remarks.trim();
                      return (
                        <div key={c.label} className="rounded-lg border border-[var(--border-hairline)] p-3">
                          <div className="mb-2 flex items-center justify-between gap-2 text-sm">
                            <span className="font-medium text-[var(--text-primary)]">{c.label}</span>
                            <span className="shrink-0 text-xs text-[var(--text-muted)]">
                              weight {(c.weight * 100).toFixed(2)}% · {(computeKpiPoints(c.score, c.weight) * 100).toFixed(2)} pts
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {[0, 1, 2, 3].map((s) => (
                              <button
                                key={s}
                                onClick={() => setScore(i, s)}
                                className={`rounded-lg px-2.5 py-1.5 text-xs font-medium ${c.score === s ? "bg-[var(--series-1)] text-[var(--on-accent)]" : "border border-[var(--border-hairline)] text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40"}`}
                              >
                                {s} – {SCORE_LABELS[s]}
                              </button>
                            ))}
                          </div>
                          <div className="mt-2 space-y-1 rounded-lg bg-[var(--gridline)]/20 p-2">
                            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">Rating scale justification</div>
                            {[0, 1, 2, 3].map((s) => (
                              <div
                                key={s}
                                className={`flex gap-2 text-xs ${c.score === s ? "font-medium text-[var(--text-primary)]" : "text-[var(--text-muted)]"}`}
                              >
                                <span className="w-4 shrink-0 tabular">{s}</span>
                                <span>{anchorFor(c.label, s)}</span>
                              </div>
                            ))}
                          </div>
                          {needsRemark && (
                            <div className="mt-2">
                              <textarea
                                value={c.remarks}
                                onChange={(e) => setRemarks(i, e.target.value)}
                                rows={2}
                                placeholder="Required: justify this rating…"
                                className={`w-full rounded-lg border px-3 py-2 text-xs ${missing ? "border-[var(--status-critical)]" : "border-[var(--border-hairline)]"} bg-[var(--surface-1)]`}
                              />
                              {missing && (
                                <div className="mt-1 flex items-center gap-1 text-xs text-[var(--status-critical)]">
                                  <AlertTriangle size={12} /> Justification required for a rating of 0 or 1.
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              );
            })}

            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Overall comments</label>
              <textarea
                value={workspace.comments}
                onChange={(e) => setWorkspace((w) => (w ? { ...w, comments: e.target.value } : w))}
                rows={3}
                readOnly={myEditableCategories.length === 0}
                className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-2 text-sm"
                placeholder="Optional remarks…"
              />
            </div>

            <div className="flex items-center justify-between gap-2 pt-1">
              <div className="text-xs text-[var(--text-muted)]">
                {bothDone ? "Both sections complete." : "Waiting on both Behavior and Job Performance before this can be finalized."}
              </div>
              <div className="flex gap-2">
                {myEditableCategories.length > 0 && (
                  <button onClick={saveMySection} disabled={!canSave} className="rounded-lg bg-[var(--series-1)] px-3 py-1.5 text-sm font-medium text-[var(--on-accent)] disabled:opacity-40">
                    Save my section
                  </button>
                )}
                {workspace.mode === "existing" && workspace.evaluationId && bothDone && workspace.status !== "acknowledged" && myEditableCategories.length > 0 && (
                  <>
                    {workspace.status === "draft" && (
                      <button onClick={() => { setEvaluationStatus(workspace.evaluationId as string, "submitted"); setWorkspace(null); }} className="rounded-lg border border-[var(--border-hairline)] px-3 py-1.5 text-sm">
                        Submit
                      </button>
                    )}
                    <button onClick={() => { setEvaluationStatus(workspace.evaluationId as string, "acknowledged"); setWorkspace(null); }} className="rounded-lg bg-[var(--series-1)] px-3 py-1.5 text-sm font-medium text-[var(--on-accent)]">
                      Mark acknowledged
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* --- HR: assign each employee's Job Performance evaluator ------------ */}
      {isHr && (
        <ManageEvaluatorsModal
          open={showManageEvaluators}
          onClose={() => setShowManageEvaluators(false)}
          employees={employees}
          updateEmployee={updateEmployee}
        />
      )}
    </div>
  );
}

function ManageEvaluatorsModal({
  open,
  onClose,
  employees,
  updateEmployee,
}: {
  open: boolean;
  onClose: () => void;
  employees: Employee[];
  updateEmployee: (id: string, patch: Partial<Omit<Employee, "id" | "employeeNumber">>) => void;
}) {
  const [search, setSearch] = useState("");
  const byId = new Map(employees.map((e) => [e.id, e]));
  const candidateEvaluators = employees
    .filter((e) => e.roles.some((r) => ["dept_head", "hr_admin", "upper_management"].includes(r)))
    .sort((a, b) => fullName(a).localeCompare(fullName(b)));

  const filtered = employees
    .filter((e) => (e.status === "active" || e.status === "on_leave"))
    .filter((e) => fullName(e).toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => fullName(a).localeCompare(fullName(b)));

  return (
    <Modal open={open} onClose={onClose} title="Manage Job Performance evaluators" wide>
      <p className="mb-3 text-xs text-[var(--text-secondary)]">
        Assign who rates each employee&rsquo;s Job Performance KPIs. Leave unassigned to default to that employee&rsquo;s org-chart supervisor.
      </p>
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search employee…"
        className="mb-3 w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-2 text-sm sm:max-w-xs"
      />
      <div className="max-h-[60vh] overflow-y-auto rounded-xl border border-[var(--border-hairline)]">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="sticky top-0 bg-[var(--surface-1)]">
            <tr className="border-b border-[var(--border-hairline)] text-left text-xs text-[var(--text-muted)]">
              <th className="px-3 py-2 font-medium">Employee</th>
              <th className="px-3 py-2 font-medium">Supervisor (default)</th>
              <th className="px-3 py-2 font-medium">Job Performance evaluator</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((e) => {
              const supervisor = e.supervisorId ? byId.get(e.supervisorId) : null;
              return (
                <tr key={e.id} className="border-b border-[var(--gridline)] last:border-0">
                  <td className="px-3 py-2 text-[var(--text-primary)]">{fullName(e)}</td>
                  <td className="px-3 py-2 text-xs text-[var(--text-secondary)]">{supervisor ? fullName(supervisor) : "—"}</td>
                  <td className="px-3 py-2">
                    <select
                      value={e.jobPerformanceEvaluatorId ?? ""}
                      onChange={(ev) => updateEmployee(e.id, { jobPerformanceEvaluatorId: ev.target.value || null })}
                      className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-2 py-1.5 text-xs"
                    >
                      <option value="">Use supervisor (default)</option>
                      {candidateEvaluators.map((c) => (
                        <option key={c.id} value={c.id}>{fullName(c)}</option>
                      ))}
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}
