"use client";

import { useMemo, useState } from "react";
import { Paperclip, Plus, ShieldAlert } from "lucide-react";
import { useHris } from "@/lib/store";
import { PageHeader } from "@/components/PageHeader";
import { Badge, type BadgeTone } from "@/components/Badge";
import { Modal } from "@/components/Modal";
import { EmptyState } from "@/components/EmptyState";
import { formatDate, fullName, positionTitle } from "@/lib/helpers";
import { DISCIPLINARY_LABELS } from "@/lib/types";
import type { DisciplinaryType } from "@/lib/types";

const TYPE_TONE: Record<DisciplinaryType, BadgeTone> = {
  incident_report: "info",
  verbal_warning: "muted",
  written_warning: "warning",
  suspension: "serious",
  nte: "warning",
  nod: "critical",
};

export default function DisciplinePage() {
  const { disciplinaryRecords, employees, currentUser, currentEmployee, addDisciplinaryRecord, setDisciplinaryStatus } = useHris();
  const [typeFilter, setTypeFilter] = useState<"all" | DisciplinaryType>("all");
  const [showCreate, setShowCreate] = useState(false);

  const canCreate = currentUser?.roles.some((r) => ["hr_admin", "dept_head"].includes(r));

  const rows = useMemo(() => {
    return disciplinaryRecords
      .filter((r) => (typeFilter === "all" ? true : r.type === typeFilter))
      .sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [disciplinaryRecords, typeFilter]);

  const [form, setForm] = useState({ employeeId: "", type: "incident_report" as DisciplinaryType, description: "", attach: false });

  function submit() {
    if (!form.employeeId || !form.description || !currentEmployee) return;
    addDisciplinaryRecord({
      employeeId: form.employeeId,
      type: form.type,
      description: form.description,
      issuedBy: currentEmployee.id,
      date: "2026-07-13",
      status: "open",
      attachmentName: form.attach ? `${form.type}-attachment.pdf` : null,
    });
    setShowCreate(false);
    setForm({ employeeId: "", type: "incident_report", description: "", attach: false });
  }

  return (
    <div>
      <PageHeader
        title="Employee Discipline"
        subtitle="Incident reports, warnings, suspensions, and Notice to Explain / Notice of Decision records."
        actions={
          canCreate && (
            <button onClick={() => setShowCreate(true)} className="flex items-center gap-1.5 rounded-lg bg-[var(--series-1)] px-3 py-2 text-sm font-medium text-[var(--on-accent)]">
              <Plus size={16} /> New record
            </button>
          )
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <button onClick={() => setTypeFilter("all")} className={`rounded-lg px-3 py-1.5 text-xs font-medium ${typeFilter === "all" ? "bg-[var(--series-1)] text-[var(--on-accent)]" : "border border-[var(--border-hairline)] text-[var(--text-secondary)]"}`}>All</button>
        {(Object.keys(DISCIPLINARY_LABELS) as DisciplinaryType[]).map((t) => (
          <button key={t} onClick={() => setTypeFilter(t)} className={`rounded-lg px-3 py-1.5 text-xs font-medium ${typeFilter === t ? "bg-[var(--series-1)] text-[var(--on-accent)]" : "border border-[var(--border-hairline)] text-[var(--text-secondary)]"}`}>
            {DISCIPLINARY_LABELS[t]}
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={ShieldAlert} title="No disciplinary records" description="Records issued by HR or department heads will appear here." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-1)]">
          <table className="w-full min-w-[700px] text-sm">
            <thead>
              <tr className="border-b border-[var(--border-hairline)] text-left text-xs text-[var(--text-muted)]">
                <th className="px-4 py-2 font-medium">Employee</th>
                <th className="px-4 py-2 font-medium">Type</th>
                <th className="px-4 py-2 font-medium">Description</th>
                <th className="px-4 py-2 font-medium">Date</th>
                <th className="px-4 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const emp = employees.find((e) => e.id === r.employeeId);
                return (
                  <tr key={r.id} className="border-b border-[var(--gridline)] last:border-0">
                    <td className="px-4 py-2.5">
                      <div className="font-medium text-[var(--text-primary)]">{emp ? fullName(emp) : r.employeeId}</div>
                      <div className="text-xs text-[var(--text-muted)]">{emp ? positionTitle(emp.positionId) : ""}</div>
                    </td>
                    <td className="px-4 py-2.5"><Badge tone={TYPE_TONE[r.type]}>{DISCIPLINARY_LABELS[r.type]}</Badge></td>
                    <td className="max-w-xs px-4 py-2.5 text-[var(--text-secondary)]">
                      <div className="line-clamp-2">{r.description}</div>
                      {r.attachmentName && (
                        <div className="mt-1 flex items-center gap-1 text-xs text-[var(--text-muted)]"><Paperclip size={12} /> {r.attachmentName}</div>
                      )}
                    </td>
                    <td className="tabular px-4 py-2.5 text-[var(--text-secondary)]">{formatDate(r.date)}</td>
                    <td className="px-4 py-2.5">
                      {r.status === "resolved" ? (
                        <Badge tone="good">Resolved</Badge>
                      ) : (
                        <button onClick={() => setDisciplinaryStatus(r.id, "resolved")} className="rounded-lg border border-[var(--border-hairline)] px-2.5 py-1 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40">
                          Mark resolved
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="New disciplinary record" wide>
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Employee</label>
            <select value={form.employeeId} onChange={(e) => setForm((f) => ({ ...f, employeeId: e.target.value }))} className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-2 text-sm">
              <option value="">Select employee…</option>
              {employees.filter((e) => e.status === "active").map((e) => (
                <option key={e.id} value={e.id}>{fullName(e)} — {positionTitle(e.positionId)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Type</label>
            <select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as DisciplinaryType }))} className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-2 text-sm">
              {(Object.keys(DISCIPLINARY_LABELS) as DisciplinaryType[]).map((t) => (
                <option key={t} value={t}>{DISCIPLINARY_LABELS[t]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Description</label>
            <textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows={3} className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-2 text-sm" placeholder="Describe the incident or basis for this record…" />
          </div>
          <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
            <input type="checkbox" checked={form.attach} onChange={(e) => setForm((f) => ({ ...f, attach: e.target.checked }))} />
            Attach a supporting document (simulated for this demo)
          </label>
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={() => setShowCreate(false)} className="rounded-lg px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40">Cancel</button>
            <button onClick={submit} disabled={!form.employeeId || !form.description} className="rounded-lg bg-[var(--series-1)] px-3 py-1.5 text-sm font-medium text-[var(--on-accent)] disabled:opacity-40">Issue record</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
