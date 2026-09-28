"use client";

import { useMemo, useState } from "react";
import { FileText, Plus, ShieldAlert } from "lucide-react";
import { useHris } from "@/lib/store";
import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/Badge";
import { Modal } from "@/components/Modal";
import { EmptyState } from "@/components/EmptyState";
import { DisciplineRecordModal, type DisciplineModalMode } from "@/components/discipline/DisciplineRecordModal";
import { formatDate, fullName, positionTitle, scopeEmployeesForViewer } from "@/lib/helpers";
import { DISCIPLINARY_LABELS } from "@/lib/types";
import type { DisciplinaryType } from "@/lib/types";
import { DISCIPLINE_TYPE_TONE, NTE_RESPONSE_DAYS, addDays, responseBadge } from "@/lib/discipline";
import { todayInManila } from "@/lib/leave-policy";

const field = "w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-2 text-sm";

export default function DisciplinePage() {
  const {
    disciplinaryRecords,
    employees: allEmployees,
    employeeDepartmentAllocations,
    currentUser,
    currentEmployee,
    addDisciplinaryRecord,
    attachDisciplinaryNotice,
    setDisciplinaryStatus,
  } = useHris();
  const [typeFilter, setTypeFilter] = useState<"all" | DisciplinaryType>("all");
  const [showCreate, setShowCreate] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const today = todayInManila();

  // HR and department heads issue records; Upper Management views them.
  const canManage = !!currentUser?.roles.some((r) => ["hr_admin", "dept_head"].includes(r));

  const employees = useMemo(
    () => scopeEmployeesForViewer(allEmployees, currentUser?.roles ?? [], currentEmployee, employeeDepartmentAllocations),
    [allEmployees, currentUser, currentEmployee, employeeDepartmentAllocations],
  );
  const visibleEmployeeIds = useMemo(() => new Set(employees.map((e) => e.id)), [employees]);

  const rows = useMemo(() => {
    return disciplinaryRecords
      .filter((r) => visibleEmployeeIds.has(r.employeeId) && r.employeeId !== currentEmployee?.id)
      .filter((r) => (typeFilter === "all" ? true : r.type === typeFilter))
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (b.createdAt ?? "").localeCompare(a.createdAt ?? "")));
  }, [disciplinaryRecords, typeFilter, visibleEmployeeIds, currentEmployee]);

  const openRecord = rows.find((r) => r.id === openId) ?? null;
  const mode: DisciplineModalMode = canManage ? "manage" : "view";

  const emptyForm = { employeeId: "", type: "nte" as DisciplinaryType, description: "", date: today, requiresExplanation: true, responseDue: addDays(today, NTE_RESPONSE_DAYS) };
  const [form, setForm] = useState(emptyForm);
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  function setType(type: DisciplinaryType) {
    // A Notice to Explain asks for an explanation by default.
    setForm((f) => ({ ...f, type, requiresExplanation: type === "nte" ? true : f.requiresExplanation }));
  }

  async function submit() {
    if (!form.employeeId || !form.description.trim() || !currentEmployee) return;
    if (file && file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setFormError("The notice must be a PDF file.");
      return;
    }
    setSaving(true);
    setFormError(null);
    const saved = await addDisciplinaryRecord({
      employeeId: form.employeeId,
      type: form.type,
      description: form.description.trim(),
      issuedBy: currentEmployee.id,
      date: form.date || today,
      status: "open",
      attachmentName: null,
      requiresExplanation: form.requiresExplanation,
      responseDue: form.requiresExplanation ? form.responseDue || null : null,
    });
    if (!saved) {
      setSaving(false);
      return;
    }
    if (file) {
      const err = await attachDisciplinaryNotice(saved.id, file);
      if (err) {
        // The record is saved; the PDF can be attached again from the record.
        setSaving(false);
        setShowCreate(false);
        setOpenId(saved.id);
        alert(`The record was saved, but the PDF couldn't be uploaded: ${err}\nUse "Attach the notice" in the record to try again.`);
        return;
      }
    }
    setSaving(false);
    setShowCreate(false);
    setForm(emptyForm);
    setFile(null);
  }

  return (
    <div>
      <PageHeader
        title="Employee Discipline"
        subtitle="Incident reports, warnings, suspensions, and Notice to Explain / Notice of Decision records. Employees receive them in My Notices, sign to acknowledge, and submit their written explanation."
        actions={
          canManage && (
            <button
              onClick={() => {
                setForm({ ...emptyForm, date: today, responseDue: addDays(today, NTE_RESPONSE_DAYS) });
                setFile(null);
                setFormError(null);
                setShowCreate(true);
              }}
              className="flex items-center gap-1.5 rounded-lg bg-[var(--series-1)] px-3 py-2 text-sm font-medium text-[var(--on-accent)]"
            >
              <Plus size={16} /> New record
            </button>
          )
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <button
          onClick={() => setTypeFilter("all")}
          className={`rounded-lg px-3 py-1.5 text-xs font-medium ${typeFilter === "all" ? "bg-[var(--series-1)] text-[var(--on-accent)]" : "border border-[var(--border-hairline)] text-[var(--text-secondary)]"}`}
        >
          All
        </button>
        {(Object.keys(DISCIPLINARY_LABELS) as DisciplinaryType[]).map((t) => (
          <button
            key={t}
            onClick={() => setTypeFilter(t)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium ${typeFilter === t ? "bg-[var(--series-1)] text-[var(--on-accent)]" : "border border-[var(--border-hairline)] text-[var(--text-secondary)]"}`}
          >
            {DISCIPLINARY_LABELS[t]}
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={ShieldAlert} title="No disciplinary records" description="Records issued by HR or department heads will appear here." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-1)]">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="border-b border-[var(--border-hairline)] text-left text-xs text-[var(--text-muted)]">
                <th className="px-4 py-2 font-medium">Employee</th>
                <th className="px-4 py-2 font-medium">Type</th>
                <th className="px-4 py-2 font-medium">Description</th>
                <th className="px-4 py-2 font-medium">Date</th>
                <th className="px-4 py-2 font-medium">Employee response</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const emp = allEmployees.find((e) => e.id === r.employeeId);
                const resp = responseBadge(r, today);
                return (
                  <tr key={r.id} className="border-b border-[var(--gridline)] last:border-0">
                    <td className="px-4 py-2.5">
                      <div className="font-medium text-[var(--text-primary)]">{emp ? fullName(emp) : r.employeeId}</div>
                      <div className="text-xs text-[var(--text-muted)]">{emp ? positionTitle(emp.positionId) : ""}</div>
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge tone={DISCIPLINE_TYPE_TONE[r.type]}>{DISCIPLINARY_LABELS[r.type]}</Badge>
                    </td>
                    <td className="max-w-xs px-4 py-2.5 text-[var(--text-secondary)]">
                      <div className="line-clamp-2">{r.description}</div>
                      {r.noticePath && (
                        <div className="mt-1 flex items-center gap-1 text-xs text-[var(--text-muted)]">
                          <FileText size={12} /> {r.noticeFileName ?? "Notice PDF"}
                        </div>
                      )}
                    </td>
                    <td className="tabular px-4 py-2.5 text-[var(--text-secondary)]">{formatDate(r.date)}</td>
                    <td className="px-4 py-2.5">
                      <Badge tone={resp.tone}>{resp.label}</Badge>
                    </td>
                    <td className="px-4 py-2.5">
                      {r.status === "resolved" ? (
                        <Badge tone="good">Resolved</Badge>
                      ) : canManage ? (
                        <button
                          onClick={() => setDisciplinaryStatus(r.id, "resolved")}
                          className="rounded-lg border border-[var(--border-hairline)] px-2.5 py-1 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40"
                        >
                          Mark resolved
                        </button>
                      ) : (
                        <Badge tone="muted">Open</Badge>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <button onClick={() => setOpenId(r.id)} className="rounded-lg bg-[var(--series-1)] px-2.5 py-1 text-xs font-medium text-[var(--on-accent)]">
                        View
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <DisciplineRecordModal record={openRecord} employees={allEmployees} mode={mode} onClose={() => setOpenId(null)} />

      <Modal open={showCreate} onClose={() => !saving && setShowCreate(false)} title="New disciplinary record" wide>
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Employee</label>
            <select value={form.employeeId} onChange={(e) => setForm((f) => ({ ...f, employeeId: e.target.value }))} className={field}>
              <option value="">Select employee…</option>
              {employees
                .filter((e) => e.status === "active" && e.id !== currentEmployee?.id)
                .sort((a, b) => fullName(a).localeCompare(fullName(b)))
                .map((e) => (
                  <option key={e.id} value={e.id}>
                    {fullName(e)} — {positionTitle(e.positionId)}
                  </option>
                ))}
            </select>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Type</label>
              <select value={form.type} onChange={(e) => setType(e.target.value as DisciplinaryType)} className={field}>
                {(Object.keys(DISCIPLINARY_LABELS) as DisciplinaryType[]).map((t) => (
                  <option key={t} value={t}>
                    {DISCIPLINARY_LABELS[t]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Date issued</label>
              <input type="date" value={form.date} max={today} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} className={field} />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              rows={3}
              className={field}
              placeholder="Describe the incident or basis for this record…"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Notice / sanction (PDF)</label>
            <input
              type="file"
              accept="application/pdf,.pdf"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-[var(--text-secondary)] file:mr-3 file:rounded-lg file:border file:border-[var(--border-hairline)] file:bg-[var(--surface-1)] file:px-3 file:py-1.5 file:text-sm file:text-[var(--text-secondary)]"
              aria-label="Notice PDF"
            />
            <div className="mt-1 text-[11px] text-[var(--text-muted)]">The employee will see and download this in My Notices. Up to 10 MB. You can also attach it later.</div>
          </div>
          <div className="rounded-lg border border-[var(--border-hairline)] p-3">
            <label className="flex items-center gap-2 text-sm text-[var(--text-primary)]">
              <input type="checkbox" checked={form.requiresExplanation} onChange={(e) => setForm((f) => ({ ...f, requiresExplanation: e.target.checked }))} />
              Ask the employee for a written explanation
            </label>
            {form.requiresExplanation && (
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[var(--text-secondary)]">
                Explanation due
                <input
                  type="date"
                  value={form.responseDue}
                  min={form.date}
                  onChange={(e) => setForm((f) => ({ ...f, responseDue: e.target.value }))}
                  className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-2 py-1 text-sm"
                  aria-label="Explanation due date"
                />
                <span className="text-[var(--text-muted)]">(at least {NTE_RESPONSE_DAYS} days is standard for a Notice to Explain)</span>
              </div>
            )}
          </div>
          {formError && <div className="text-sm text-[var(--status-critical)]">{formError}</div>}
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={() => setShowCreate(false)} disabled={saving} className="rounded-lg px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40">
              Cancel
            </button>
            <button
              onClick={submit}
              disabled={saving || !form.employeeId || !form.description.trim()}
              className="rounded-lg bg-[var(--series-1)] px-3 py-1.5 text-sm font-medium text-[var(--on-accent)] disabled:opacity-40"
            >
              {saving ? "Issuing…" : "Issue record"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
