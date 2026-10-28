"use client";

import { useMemo, useState } from "react";
import { ClipboardList, Loader2, Plus, RotateCcw, Trash2 } from "lucide-react";
import { useHris } from "@/lib/store";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { Modal } from "@/components/Modal";
import { Badge } from "@/components/Badge";
import { departmentName, formatDate, fullName, positionTitle } from "@/lib/helpers";
import { createSalesAdminEvaluation, deleteSalesAdminEvaluation, reopenSaePart, saeStatusLabel, SAE_WEIGHTS, type SalesAdminEvaluation } from "@/lib/sales-admin-eval";
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

// Sales Admin Evaluation for Regularization: HR starts it and rates
// Behavior and the sales; the Department Head rates Job Performance; the
// Vice Chairperson and the Chairman recommend. Seen by HR, Upper
// Management and the head named on it.
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
    if ((e.status === "vc" && e.vcId === me) || (e.status === "chairman" && e.chairmanId === me)) return "recommend";
    return null;
  };
  const list = items ?? [];
  const mine = list.filter((e) => myTurn(e));

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
        <PageHeader title="Sales Admin Evaluation" subtitle="Evaluation for regularization." />
        <EmptyState icon={ClipboardList} title="Not available in the demo" description="Sign in with your employee account." />
      </div>
    );
  }

  const actionLabel = { hr: "Fill in HR's part", head: "Rate job performance", recommend: "Give recommendation" };

  return (
    <div>
      <PageHeader
        title="Sales Admin Evaluation"
        subtitle={`Evaluation for regularization: Behavior (${SAE_WEIGHTS.behavior}%) by HR, Job Performance (${SAE_WEIGHTS.job}%) by the Department Head, Sales (${SAE_WEIGHTS.sales}%). Passing score ${cfg.passMark}.`}
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
                    <span className="text-[var(--text-secondary)]"> — {e.period || "Evaluation"}</span>
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
                    {[e.period, e.hr?.employee?.position, `started ${formatDate(e.createdAt)}`].filter(Boolean).join(" · ")}
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
  const [allPositions, setAllPositions] = useState(false);
  const shown = active.filter((e) => allPositions || !cfg.positionPrefix || e.positionId.startsWith(cfg.positionPrefix));
  const [employeeId, setEmployeeId] = useState("");
  const [period, setPeriod] = useState(`Evaluation for Regularization ${new Date().getFullYear()}`);
  const [headId, setHeadId] = useState(cfg.headId);
  const [vcId, setVcId] = useState(cfg.vcId);
  const [chairmanId, setChairmanId] = useState(cfg.chairmanId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    const emp = active.find((e) => e.id === employeeId);
    if (!emp) return;
    setBusy(true);
    setError(null);
    try {
      const mi = emp.middleName?.trim() ? ` ${emp.middleName.trim().charAt(0)}.` : "";
      const id = await createSalesAdminEvaluation({
        employeeId,
        period,
        headId,
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

  return (
    <Modal open onClose={() => !busy && onClose()} title="New Sales Admin evaluation">
      <div className="space-y-3 text-sm">
        <div>
          <label className={lbl}>Employee</label>
          {pick(employeeId, setEmployeeId, shown)}
          <label className="mt-1 flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
            <input type="checkbox" checked={allPositions} onChange={(e) => setAllPositions(e.target.checked)} /> Show all positions
          </label>
        </div>
        <div>
          <label className={lbl}>Title / period</label>
          <input value={period} onChange={(e) => setPeriod(e.target.value)} maxLength={100} className={input} />
        </div>
        <div>
          <label className={lbl}>Department Head (rates Job Performance)</label>
          {pick(headId, setHeadId)}
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
          <button onClick={create} disabled={busy || !employeeId || !headId || !vcId || !chairmanId} className={primary}>
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />} Start
          </button>
        </div>
      </div>
    </Modal>
  );
}
