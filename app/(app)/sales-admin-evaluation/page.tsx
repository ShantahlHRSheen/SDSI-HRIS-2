"use client";

import { useMemo, useState } from "react";
import { ClipboardList, Loader2, Plus, RotateCcw, Trash2 } from "lucide-react";
import { useHris } from "@/lib/store";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { Modal } from "@/components/Modal";
import { Badge } from "@/components/Badge";
import { departmentName, formatDate, fullName, positionTitle } from "@/lib/helpers";
import { effectiveJobPerformanceEvaluatorId } from "@/lib/performance-eval";
import type { Employee } from "@/lib/types";
import { createSalesAdminEvaluation, deleteSalesAdminEvaluation, reopenSaePart, saeStatusLabel, SAE_FORMS, SAE_PURPOSES, SAE_WEIGHTS, SAE_WEIGHTS_GENERAL, type SaeForm, type SalesAdminEvaluation } from "@/lib/sales-admin-eval";
import {
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
// Chairman recommend. Seen by HR, Upper Management and the head named on it.
export default function SalesAdminEvaluationPage() {
  const { currentUser, currentEmployee, employees, isRealAccount } = useHris();
  const { items, error, reload } = useSalesAdminEvaluations();
  const isHr = !!currentUser?.roles.includes("hr_admin");
  const me = currentEmployee?.id;
  const cfg = saeConfig();
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState<{ id: string; as: "hr" | "head" | "recommend" } | null>(null);
  const [deleting, setDeleting] = useState<SalesAdminEvaluation | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const opened = items?.find((x) => x.id === open?.id) ?? null;

  const myTurn = (e: SalesAdminEvaluation): "hr" | "head" | "recommend" | null => {
    if (e.status === "open" && isHr && !e.hrSignedAt) return "hr";
    if (e.status === "open" && e.headId === me && !e.headSignedAt) return "head";
    if (e.status === "open" && e.head2Id === me && !e.head2SignedAt) return "head";
    if ((e.status === "vc" && e.vcId === me) || (e.status === "chairman" && e.chairmanId === me)) return "recommend";
    return null;
  };
  const [search, setSearch] = useState("");
  const [purposeFilter, setPurposeFilter] = useState("");
  const list = (items ?? []).filter(
    (e) => (!purposeFilter || e.purpose === purposeFilter) && (!search.trim() || e.employeeName.toLowerCase().includes(search.trim().toLowerCase())),
  );
  const mine = (items ?? []).filter((e) => myTurn(e));

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
        <PageHeader title="Employee Evaluation" subtitle="Monthly, year-end and regularization evaluations." />
        <EmptyState icon={ClipboardList} title="Not available in the demo" description="Sign in with your employee account." />
      </div>
    );
  }

  const actionLabel = { hr: "Fill in HR's part", head: "Rate job performance", recommend: "Give recommendation" };

  return (
    <div>
      <PageHeader
        title="Employee Evaluation"
        subtitle={`Monthly, year-end and regularization evaluations. HR rates Behavior, the Department Head rates Job Performance, then the Vice Chairperson and the Chairman recommend. Sales Admins: Behavior ${SAE_WEIGHTS.behavior}% + Job Performance ${SAE_WEIGHTS.job}% + Sales ${SAE_WEIGHTS.sales}%; other employees: Behavior ${SAE_WEIGHTS_GENERAL.behavior}% + Job Performance ${SAE_WEIGHTS_GENERAL.job}%. Passing score ${cfg.passMark}.`}
        actions={
          isHr && (
            <button onClick={() => setCreating(true)} className={primary}>
              <Plus size={16} /> New evaluation
            </button>
          )
        }
      />
      {(error || actionError) && <div className="mb-4 rounded-lg border border-[var(--status-critical)]/40 px-3 py-2 text-sm text-[var(--status-critical)]">{error || actionError}</div>}

      {mine.length > 0 && (
        <div className="mb-4 rounded-xl border border-[var(--series-1)]/40 bg-[var(--surface-1)] p-4">
          <div className="mb-3 text-sm font-medium text-[var(--text-primary)]">Needs your action ({mine.length})</div>
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
                    {actionLabel[as]}
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
        <EmptyState icon={ClipboardList} title="No evaluations yet" description={isHr ? "Start one with New evaluation." : "Evaluations you take part in show here."} />
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
                  {isHr && (e.status === "open" || e.status === "vc") && e.hrSignedAt && (
                    <button onClick={() => act(() => reopenSaePart(e.id, "hr"))} disabled={busy} className={secondary} title="Unlock HR's part to edit it">
                      <RotateCcw size={13} /> Edit HR&rsquo;s part
                    </button>
                  )}
                  {isHr && (e.status === "open" || e.status === "vc") && e.head2SignedAt && (
                    <button onClick={() => act(() => reopenSaePart(e.id, "head2"))} disabled={busy} className={secondary} title={`Send ${e.head2Name ?? "the second head"}'s part back to be redone`}>
                      <RotateCcw size={13} /> Return {e.head2Name?.split(" ")[0] ?? "2nd head"}&rsquo;s part
                    </button>
                  )}
                  {isHr && (e.status === "open" || e.status === "vc") && e.headSignedAt && (
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
              </div>
            </div>
          );
        })}
      </div>

      {creating && <NewEvaluationModal employees={employees} onClose={() => setCreating(false)} onCreated={async (id) => (await reload(), setCreating(false), setOpen({ id, as: "hr" }))} />}
      {opened && open?.as === "hr" && <HrPartModal e={opened} onClose={() => setOpen(null)} onChanged={reload} />}
      {opened && open?.as === "head" && <HeadPartModal e={opened} onClose={() => setOpen(null)} onChanged={reload} />}
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
    .filter((e) => (form === "sales_admin" ? isSalesAdmin(e) : !isSalesAdmin(e)))
    .filter((e) => !q || [e.firstName, e.middleName, e.lastName, e.nickname, e.employeeNumber, positionTitle(e.positionId)].some((x) => x?.toLowerCase().includes(q)));
  const [employeeId, setEmployeeId] = useState("");
  const [purpose, setPurpose] = useState("Evaluation for Regularization");
  const [period, setPeriod] = useState(String(new Date().getFullYear()));
  const [headId, setHeadId] = useState("");
  const [head2Id, setHead2Id] = useState("");
  const [vcId, setVcId] = useState(cfg.vcId);
  const [chairmanId, setChairmanId] = useState(cfg.chairmanId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The head defaults to the Sales Admins' head, or the employee's Job
  // Performance evaluator / supervisor.
  function choose(id: string) {
    setEmployeeId(id);
    const emp = active.find((e) => e.id === id);
    setHeadId(form === "sales_admin" ? cfg.headId : (emp && effectiveJobPerformanceEvaluatorId(emp)) || "");
    // Cebu: Mary Jane Pedrano also rates (not herself).
    const second = emp ? cfg.secondHeads?.[emp.branchId] : undefined;
    setHead2Id(second && second !== emp?.id ? second : "");
  }
  function chooseForm(f: SaeForm) {
    setForm(f);
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
        head2Id: head2Id || null,
        vcId,
        chairmanId,
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

  const pick = (value: string, onChange: (v: string) => void, list = active) => (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={input}>
      <option value="">Choose…</option>
      {list.map((e) => (
        <option key={e.id} value={e.id}>
          {fullName(e)} — {positionTitle(e.positionId)}
        </option>
      ))}
    </select>
  );
  const lbl = "mb-1 block text-xs font-medium text-[var(--text-secondary)]";
  const w = form === "general" ? SAE_WEIGHTS_GENERAL : SAE_WEIGHTS;

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
          <label className={lbl}>Department Head (rates Job Performance)</label>
          {pick(headId, setHeadId)}
        </div>
        <div>
          <label className={lbl}>Second Department Head (optional — also rates Job Performance; the two are averaged)</label>
          {pick(head2Id, setHead2Id)}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={lbl}>{cfg.vcTitle}</label>
            {pick(vcId, setVcId)}
          </div>
          <div>
            <label className={lbl}>{cfg.chairmanTitle}</label>
            {pick(chairmanId, setChairmanId)}
          </div>
        </div>
        {error && <div className="text-xs text-[var(--status-critical)]">{error}</div>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} disabled={busy} className={secondary}>
            Cancel
          </button>
          <button onClick={create} disabled={busy || !employeeId || !headId || !vcId || !chairmanId || head2Id === headId} className={primary}>
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />} Start
          </button>
        </div>
      </div>
    </Modal>
  );
}
