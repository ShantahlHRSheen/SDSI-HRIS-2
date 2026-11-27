"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, ClipboardList, Loader2, Pencil, Plus, RotateCcw, Send, Settings2, Table2, Trash2, Undo2 } from "lucide-react";
import { ManageEvaluatorsModal } from "@/components/sales-admin-eval/ManageEvaluators";
import { EvaluationSummary } from "@/components/sales-admin-eval/EvaluationSummary";
import { HrSheetModal } from "@/components/sales-admin-eval/HrSheet";
import { HeadSheetModal } from "@/components/sales-admin-eval/HeadSheet";
import { BulkStartModal } from "@/components/sales-admin-eval/BulkStart";
import { useHris } from "@/lib/store";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { Modal } from "@/components/Modal";
import { Badge } from "@/components/Badge";
import { departmentName, formatDate, fullName, positionTitle } from "@/lib/helpers";
import { effectiveJobPerformanceEvaluatorId } from "@/lib/performance-eval";
import type { Employee } from "@/lib/types";
import { createSalesAdminEvaluation, deleteSalesAdminEvaluation, fetchSaeEdits, releaseSae, reopenSaePart, saeEditableSlot, saeMyTurn, type SaeEdit, saeStatusLabel, SAE_FORMS, SAE_PURPOSES, SAE_WEIGHTS, SAE_WEIGHTS_GENERAL, type SaeForm, type SalesAdminEvaluation } from "@/lib/sales-admin-eval";
import {
  AcknowledgeModal,
  EditHistory,
  HeadPartModal,
  HrPartModal,
  input,
  primary,
  Recommendations,
  RecommendModal,
  saeConfig,
  ScoreSummary,
  secondary,
  useSalesAdminEvaluations,
  ViewSaeButton,
} from "@/components/sales-admin-eval/SalesAdminEval";

// Employee evaluation (Monthly, Year-end, for Regularization): HR starts it
// and rates Behavior (and the sales, on the Sales Admin form); the
// Department Head rates Job Performance; the Vice Chairperson and the
// Chairman recommend. Seen by HR, Upper Management, the heads named on it, and
// the employee's supervisors and Department Head (phase 96, read only).
export default function SalesAdminEvaluationPage() {
  const { currentUser, currentEmployee, employees, isRealAccount, updateEmployee } = useHris();
  const { items, error, reload } = useSalesAdminEvaluations();
  const isHr = !!currentUser?.roles.includes("hr_admin");
  const me = currentEmployee?.id;
  const cfg = saeConfig();
  const [creating, setCreating] = useState(false);
  const [managing, setManaging] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [headSheet, setHeadSheet] = useState(false);
  const [bulk, setBulk] = useState(false);
  const [open, setOpen] = useState<{ id: string; as: "hr" | "head" | "recommend" | "edit" | "ack" } | null>(null);
  const [releasingAll, setReleasingAll] = useState(false);
  // Heads' edits to their signed parts (phase 97), reloaded with the evaluations.
  const [edits, setEdits] = useState<SaeEdit[]>([]);
  useEffect(() => {
    if (items) fetchSaeEdits().then(setEdits);
  }, [items]);
  const [deleting, setDeleting] = useState<SalesAdminEvaluation | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const opened = items?.find((x) => x.id === open?.id) ?? null;

  const myTurn = (e: SalesAdminEvaluation) => saeMyTurn(e, me, isHr);
  const [search, setSearch] = useState("");
  const [purposeFilter, setPurposeFilter] = useState("");
  const list = (items ?? []).filter(
    (e) => (!purposeFilter || e.purpose === purposeFilter) && (!search.trim() || e.employeeName.toLowerCase().includes(search.trim().toLowerCase())),
  );
  const mine = (items ?? []).filter((e) => myTurn(e));
  // The person's own released evaluations still to acknowledge (phase 98).
  const toAck = (items ?? []).filter((e) => e.employeeId === me && e.status === "done" && e.releasedAt && !e.acknowledgedAt);
  // Completed evaluations HR hasn't released to the employee yet.
  const unreleased = isHr ? (items ?? []).filter((e) => e.status === "done" && !e.releasedAt) : [];
  // The scores summary and awards: not one's own evaluation (unless HR).
  const others = (items ?? []).filter((e) => isHr || e.employeeId !== me);
  // Evaluations waiting for the signed-in person's Job Performance rating.
  const toRate = mine.filter((e) => myTurn(e) === "head" && e.form !== "managerial").length;

  async function act(fn: () => Promise<void>) {
    setBusy(true);
    setActionError(null);
    try {
      await fn();
      await reload();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  if (!isRealAccount) {
    return (
      <div>
        <PageHeader title="Performance Evaluations" subtitle="Monthly, year-end and regularization evaluations." />
        <EmptyState icon={ClipboardList} title="Not available in the demo" description="Sign in with your employee account." />
      </div>
    );
  }

  const actionLabel = { hr: "Fill in HR's part", head: "Rate job performance", recommend: "Give recommendation" };

  return (
    <div>
      <PageHeader
        title="Performance Evaluations"
        subtitle={`Monthly, year-end and regularization evaluations. HR rates Behavior, the Department Head rates Job Performance, then the Vice Chairperson (not on the Sales Admin form) and the Chairman recommend. Sales Admins: Behavior ${SAE_WEIGHTS.behavior}% + Job Performance ${SAE_WEIGHTS.job}% + Sales ${SAE_WEIGHTS.sales}%; other employees: Behavior ${SAE_WEIGHTS_GENERAL.behavior}% + Job Performance ${SAE_WEIGHTS_GENERAL.job}%. Passing score: Sales Admins ${cfg.passMark} (80 on a Year-end Evaluation), other employees 80.`}
        actions={
          isHr && (
            <div className="flex flex-wrap gap-2">
              {unreleased.length > 0 && (
                <button onClick={() => setReleasingAll(true)} className={secondary} title="Let the employees see their completed evaluations and acknowledge them">
                  <Send size={16} /> Release completed ({unreleased.length})
                </button>
              )}
              <button onClick={() => setSheet(true)} className={secondary}>
                <Table2 size={16} /> HR Rating Sheet
              </button>
              <button onClick={() => setManaging(true)} className={secondary}>
                <Settings2 size={16} /> Manage evaluators
              </button>
              <button onClick={() => setCreating(true)} className={primary}>
                <Plus size={16} /> New evaluation
              </button>
            </div>
          )
        }
      />
      {(error || actionError) && <div className="mb-4 rounded-lg border border-[var(--status-critical)]/40 px-3 py-2 text-sm text-[var(--status-critical)]">{error || actionError}</div>}

      {toAck.length > 0 && (
        <div className="mb-4 rounded-xl border border-[var(--series-1)]/50 bg-[var(--series-1)]/5 p-4">
          <div className="mb-2 text-sm font-medium text-[var(--text-primary)]">Your evaluation is ready — please read and acknowledge it</div>
          <div className="space-y-2">
            {toAck.map((e) => (
              <div key={e.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[var(--gridline)]/20 px-3 py-2 text-sm">
                <span className="font-medium text-[var(--text-primary)]">{[e.purpose, e.period].filter(Boolean).join(" ")}</span>
                <button onClick={() => setOpen({ id: e.id, as: "ack" })} className={primary}>
                  View &amp; acknowledge
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {mine.length > 0 && (
        <div className="mb-4 rounded-xl border border-[var(--series-1)]/40 bg-[var(--surface-1)] p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-medium text-[var(--text-primary)]">Needs your action ({mine.length})</div>
            {toRate > 1 && (
              <button onClick={() => setHeadSheet(true)} className={primary}>
                <Table2 size={15} /> Rate all {toRate} on one sheet
              </button>
            )}
          </div>
          <div className="space-y-2">
            {mine.map((e) => {
              const as = myTurn(e)!;
              return (
                <div key={e.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[var(--gridline)]/20 px-3 py-2 text-sm">
                  <div>
                    <span className="font-medium text-[var(--text-primary)]">{e.employeeName}</span>
                    <span className="text-[var(--text-secondary)]"> — {[e.purpose, e.period].filter(Boolean).join(" ")}</span>
                  </div>
                  <button onClick={() => setOpen({ id: e.id, as })} className={primary}>
                    {as === "head" && e.form === "managerial" ? "Rate evaluation" : actionLabel[as]}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {items === null && !error && (
        <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
          <Loader2 size={14} className="animate-spin" /> Loading…
        </div>
      )}
      {others.length > 0 && <EvaluationSummary items={others} />}
      {!!items?.length && (
        <div className="mb-3 flex flex-wrap gap-2">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search employee…" className={`${input} max-w-xs`} />
          <select value={purposeFilter} onChange={(e) => setPurposeFilter(e.target.value)} className={`${input} max-w-xs`}>
            <option value="">All purposes</option>
            {SAE_PURPOSES.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </div>
      )}
      {items && !list.length && (
        <EmptyState icon={ClipboardList} title="No evaluations yet" description={isHr ? "Start one with New evaluation." : "Evaluations you take part in, those of the employees under you, and your own once HR releases it show here."} />
      )}

      <div className="space-y-3">
        {list.map((e) => {
          const st = saeStatusLabel(e);
          return (
            <div key={e.id} className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-1)] p-4">
              <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="font-medium text-[var(--text-primary)]">{e.employeeName}</div>
                  <div className="text-xs text-[var(--text-muted)]">
                    {[[e.purpose, e.period].filter(Boolean).join(" "), e.hr?.employee?.position, e.form === "sales_admin" ? "Sales Admin form" : null, `started ${formatDate(e.createdAt)}`].filter(Boolean).join(" · ")}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={st.tone}>{st.label}</Badge>
                  <ViewSaeButton e={e} />
                  {e.employeeId === me && e.releasedAt && (
                    <button onClick={() => setOpen({ id: e.id, as: "ack" })} className={e.acknowledgedAt ? secondary : primary}>
                      {e.acknowledgedAt ? <CheckCircle2 size={13} /> : null} {e.acknowledgedAt ? "Acknowledged" : "Acknowledge"}
                    </button>
                  )}
                  {isHr && e.status === "done" && !e.releasedAt && (
                    <button onClick={() => act(() => releaseSae(e.id, true))} disabled={busy} className={primary} title="Let the employee see this evaluation and acknowledge it">
                      <Send size={13} /> Release to employee
                    </button>
                  )}
                  {(isHr || e.employeeId !== me) && e.releasedAt && (
                    <Badge tone={e.acknowledgedAt ? "good" : "info"}>
                      {e.acknowledgedAt ? `Acknowledged ${formatDate(e.acknowledgedAt)}` : `Released ${formatDate(e.releasedAt)} · not yet acknowledged`}
                    </Badge>
                  )}
                  {isHr && e.releasedAt && !e.acknowledgedAt && (
                    <button onClick={() => act(() => releaseSae(e.id, false))} disabled={busy} className={secondary} title="Hide it from the employee again">
                      <Undo2 size={13} /> Take back
                    </button>
                  )}
                  {saeEditableSlot(e, me) && (
                    <button onClick={() => setOpen({ id: e.id, as: "edit" })} className={secondary} title="Change your signed Job Performance part — saved to the edit history">
                      <Pencil size={13} /> Edit my part
                    </button>
                  )}
                  {isHr && (e.status === "open" || e.status === "vc" || (e.status === "done" && !e.vcId && !e.chairmanId)) && e.hrSignedAt && (
                    <button onClick={() => act(() => reopenSaePart(e.id, "hr"))} disabled={busy} className={secondary} title="Unlock HR's part to edit it">
                      <RotateCcw size={13} /> Edit HR&rsquo;s part
                    </button>
                  )}
                  {isHr && (e.status === "open" || e.status === "vc" || (e.status === "done" && !e.vcId && !e.chairmanId)) && e.head2SignedAt && (
                    <button onClick={() => act(() => reopenSaePart(e.id, "head2"))} disabled={busy} className={secondary} title={`Send ${e.head2Name ?? "the second head"}'s part back to be redone`}>
                      <RotateCcw size={13} /> Return {e.head2Name?.split(" ")[0] ?? "2nd head"}&rsquo;s part
                    </button>
                  )}
                  {isHr && (e.status === "open" || e.status === "vc" || (e.status === "done" && !e.vcId && !e.chairmanId)) && e.headSignedAt && (
                    <button onClick={() => act(() => reopenSaePart(e.id, "head"))} disabled={busy} className={secondary} title="Send the head's part back to be redone">
                      <RotateCcw size={13} /> Return head&rsquo;s part
                    </button>
                  )}
                  {isHr && (
                    <button onClick={() => (setActionError(null), setDeleting(e))} className="rounded-lg p-1.5 text-[var(--text-muted)] hover:text-[var(--status-critical)]" aria-label="Delete">
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
              </div>
              <ScoreSummary e={e} />
              <div className="mt-3">
                <Recommendations e={e} />
                {(isHr || e.employeeId !== me) && <EditHistory e={e} edits={edits.filter((x) => x.evaluationId === e.id)} />}
              </div>
            </div>
          );
        })}
      </div>

      {headSheet && items && <HeadSheetModal items={items} onClose={() => setHeadSheet(false)} onChanged={reload} />}
      {isHr && sheet && !bulk && items && <HrSheetModal items={items} onClose={() => setSheet(false)} onChanged={reload} onStartAll={() => setBulk(true)} />}
      {isHr && bulk && items && <BulkStartModal items={items} onClose={() => setBulk(false)} onChanged={reload} />}
      {isHr && <ManageEvaluatorsModal open={managing} onClose={() => setManaging(false)} employees={employees} updateEmployee={updateEmployee} />}
      {creating && <NewEvaluationModal employees={employees} onClose={() => setCreating(false)} onCreated={async (id) => (await reload(), setCreating(false), setOpen({ id, as: "hr" }))} />}
      {opened && open?.as === "hr" && <HrPartModal e={opened} onClose={() => setOpen(null)} onChanged={reload} />}
      {opened && open?.as === "head" && <HeadPartModal e={opened} onClose={() => setOpen(null)} onChanged={reload} />}
      {opened && open?.as === "ack" && <AcknowledgeModal e={opened} onClose={() => setOpen(null)} onChanged={reload} />}
      {isHr && releasingAll && (
        <Modal open onClose={() => !busy && setReleasingAll(false)} title={`Release ${unreleased.length} completed evaluation${unreleased.length === 1 ? "" : "s"}?`}>
          <p className="mb-2 text-sm text-[var(--text-secondary)]">
            Each employee will see their own evaluation (scores, ratings, comments and recommendations — not the edit history) and be asked to sign an acknowledgement. You can take one back until the employee acknowledges it.
          </p>
          <ul className="mb-4 max-h-60 list-disc overflow-auto pl-5 text-xs text-[var(--text-secondary)]">
            {unreleased.map((e) => (
              <li key={e.id}>
                {e.employeeName} — {[e.purpose, e.period].filter(Boolean).join(" ")}
              </li>
            ))}
          </ul>
          <div className="flex justify-end gap-2">
            <button onClick={() => setReleasingAll(false)} disabled={busy} className={secondary}>
              Cancel
            </button>
            <button
              onClick={() =>
                act(async () => {
                  for (const e of unreleased) await releaseSae(e.id, true);
                  setReleasingAll(false);
                })
              }
              disabled={busy}
              className={primary}
            >
              {busy ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} Release {unreleased.length}
            </button>
          </div>
        </Modal>
      )}
      {opened && open?.as === "edit" && <HeadPartModal edit e={opened} onClose={() => setOpen(null)} onChanged={reload} />}
      {opened && open?.as === "recommend" && <RecommendModal e={opened} onClose={() => setOpen(null)} onChanged={reload} />}
      {deleting && (
        <Modal open onClose={() => !busy && setDeleting(null)} title="Delete evaluation?">
          <p className="mb-4 text-sm text-[var(--text-secondary)]">
            The evaluation of {deleting.employeeName} and its signatures will be deleted. This can&rsquo;t be undone.
          </p>
          <div className="flex justify-end gap-2">
            <button onClick={() => setDeleting(null)} disabled={busy} className={secondary}>
              Cancel
            </button>
            <button
              onClick={() => act(async () => (await deleteSalesAdminEvaluation(deleting), setDeleting(null)))}
              disabled={busy}
              className="flex items-center gap-1.5 rounded-lg bg-[var(--status-critical)] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
            >
              {busy ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />} Delete
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function NewEvaluationModal({ employees, onClose, onCreated }: { employees: ReturnType<typeof useHris>["employees"]; onClose: () => void; onCreated: (id: string) => void }) {
  const cfg = saeConfig();
  const active = useMemo(() => employees.filter((e) => e.status === "active" || e.status === "on_leave").sort((a, b) => fullName(a).localeCompare(fullName(b))), [employees]);
  const isSalesAdmin = (e: Employee) => !!cfg.positionPrefix && e.positionId.startsWith(cfg.positionPrefix);
  const [form, setForm] = useState<SaeForm>("general");
  const [search, setSearch] = useState("");
  const q = search.trim().toLowerCase();
  const shown = active
    .filter((e) => form === "managerial" || (form === "sales_admin" ? isSalesAdmin(e) : !isSalesAdmin(e)))
    .filter((e) => !q || [e.firstName, e.middleName, e.lastName, e.nickname, e.employeeNumber, positionTitle(e.positionId)].some((x) => x?.toLowerCase().includes(q)));
  const [employeeId, setEmployeeId] = useState("");
  const [purpose, setPurpose] = useState("Evaluation for Regularization");
  const [period, setPeriod] = useState(String(new Date().getFullYear()));
  const [headId, setHeadId] = useState("");
  const [head2Id, setHead2Id] = useState("");
  const vcFor = (f: SaeForm) => (cfg.noVcForms?.includes(f) ? "" : cfg.vcId);
  const [vcId, setVcId] = useState(vcFor("general"));
  const [chairmanId, setChairmanId] = useState(cfg.chairmanId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Year-end Evaluations don't go to the Vice Chairperson or the Chairman (phase 95).
  const yearEnd = purpose === "Year-end Evaluation";
  // Managerial form (phase 99): one evaluator rates everything.
  const mgr = form === "managerial";

  // The head defaults to the Sales Admins' head, or the employee's Job
  // Performance evaluator / supervisor.
  function choose(id: string) {
    setEmployeeId(id);
    const emp = active.find((e) => e.id === id);
    setHeadId(form === "sales_admin" ? cfg.headId : form === "managerial" ? (emp?.supervisorId && emp.supervisorId !== emp.id ? emp.supervisorId : "") : (emp && effectiveJobPerformanceEvaluatorId(emp)) || "");
    // Cebu: Mary Jane Pedrano also rates (not herself).
    const second = emp && form !== "managerial" ? cfg.secondHeads?.[emp.branchId] : undefined;
    setHead2Id(second && second !== emp?.id ? second : "");
  }
  function chooseForm(f: SaeForm) {
    setForm(f);
    setVcId(vcFor(f));
    setEmployeeId("");
    setHeadId("");
    setHead2Id("");
  }
  function choosePurpose(p: string) {
    setPurpose(p);
    const now = new Date();
    setPeriod(p === "Monthly Evaluation" ? now.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "Asia/Manila" }) : String(now.getFullYear()));
  }

  async function create() {
    const emp = active.find((e) => e.id === employeeId);
    if (!emp) return;
    setBusy(true);
    setError(null);
    try {
      const mi = emp.middleName?.trim() ? ` ${emp.middleName.trim().charAt(0)}.` : "";
      const id = await createSalesAdminEvaluation({
        employeeId,
        form,
        purpose,
        period,
        headId,
        head2Id: mgr ? null : head2Id || null,
        vcId: yearEnd || mgr ? null : vcId || null,
        chairmanId: yearEnd || mgr ? null : chairmanId,
        employee: {
          name: `${emp.firstName}${mi} ${emp.lastName}`,
          position: positionTitle(emp.positionId),
          department: departmentName(emp.departmentId),
          dateHired: emp.dateHired,
          employmentStatus: emp.employmentStatus,
          contractEnd: emp.contractEnd,
        },
      });
      onCreated(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't start the evaluation.");
      setBusy(false);
    }
  }

  const pick = (value: string, onChange: (v: string) => void, list = active, empty = "Choose…") => (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={input}>
      <option value="">{empty}</option>
      {list.map((e) => (
        <option key={e.id} value={e.id}>
          {fullName(e)} — {positionTitle(e.positionId)}
        </option>
      ))}
    </select>
  );
  const lbl = "mb-1 block text-xs font-medium text-[var(--text-secondary)]";
  const w = form === "sales_admin" ? SAE_WEIGHTS : SAE_WEIGHTS_GENERAL;

  return (
    <Modal open onClose={() => !busy && onClose()} title="New evaluation">
      <div className="space-y-3 text-sm">
        <div>
          <label className={lbl}>Form</label>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(SAE_FORMS) as SaeForm[])
              .slice()
              .reverse()
              .map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => chooseForm(f)}
                  className={`rounded-lg border px-3 py-1.5 text-sm ${form === f ? "border-[var(--series-1)] bg-[var(--series-1)]/10 font-medium text-[var(--series-1)]" : "border-[var(--border-hairline)] text-[var(--text-secondary)]"}`}
                >
                  {SAE_FORMS[f].label}
                </button>
              ))}
          </div>
          <div className="mt-1 text-xs text-[var(--text-muted)]">
            Behavior {w.behavior}% + Job Performance {w.job}%{w.sales ? ` + Sales ${w.sales}%` : ""}
          </div>
        </div>
        <div>
          <label className={lbl}>Employee</label>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, employee no. or position…" className={`${input} mb-1.5`} />
          {pick(employeeId, choose, shown)}
          {q && !shown.length && <div className="mt-1 text-xs text-[var(--text-muted)]">No active employee matches “{search}”.</div>}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={lbl}>Purpose of evaluation</label>
            <select value={purpose} onChange={(e) => choosePurpose(e.target.value)} className={input}>
              {SAE_PURPOSES.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={lbl}>Period</label>
            <input value={period} onChange={(e) => setPeriod(e.target.value)} maxLength={100} placeholder="e.g. October 2026 or 2026" className={input} />
          </div>
        </div>
        <div>
          <label className={lbl}>{mgr ? "Evaluator (rates Behavior and Job Performance)" : "Department Head (rates Job Performance)"}</label>
          {pick(headId, setHeadId)}
        </div>
        {!mgr && (
        <div>
          <label className={lbl}>Second Department Head (optional — also rates Job Performance; the two are averaged)</label>
          {pick(head2Id, setHead2Id)}
        </div>
        )}
        {mgr ? (
          <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--gridline)]/20 px-3 py-2 text-xs text-[var(--text-secondary)]">
            Managerial evaluation: the evaluator alone rates Behavior (with the employee&rsquo;s lates and absences from the HRIS shown) and Job Performance, and signs. HR doesn&rsquo;t rate it. It&rsquo;s completed once the evaluator signs.
          </div>
        ) : yearEnd ? (
          <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--gridline)]/20 px-3 py-2 text-xs text-[var(--text-secondary)]">
            Year-end Evaluation: completed once HR and the Department Head{head2Id ? "s" : ""} sign. The {cfg.vcTitle} and the {cfg.chairmanTitle} don&rsquo;t sign it, but they can see the results.
          </div>
        ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={lbl}>{cfg.vcTitle} (optional)</label>
            {pick(vcId, setVcId, active, "None — straight to the Chairman")}
          </div>
          <div>
            <label className={lbl}>{cfg.chairmanTitle}</label>
            {pick(chairmanId, setChairmanId)}
          </div>
        </div>
        )}
        {error && <div className="text-xs text-[var(--status-critical)]">{error}</div>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} disabled={busy} className={secondary}>
            Cancel
          </button>
          <button onClick={create} disabled={busy || !employeeId || !headId || (!yearEnd && !mgr && !chairmanId) || (!mgr && head2Id === headId)} className={primary}>
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />} Start
          </button>
        </div>
      </div>
    </Modal>
  );
}
