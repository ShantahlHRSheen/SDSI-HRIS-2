"use client";

import { useRef, useState } from "react";
import { AlertTriangle, CalendarClock, Pencil, Upload } from "lucide-react";
import { useHris } from "@/lib/store";
import { PageHeader } from "@/components/PageHeader";
import { StatTile } from "@/components/StatTile";
import { Badge } from "@/components/Badge";
import { Modal } from "@/components/Modal";
import { EmptyState } from "@/components/EmptyState";
import { branchName, departmentName, formatDate, fullName } from "@/lib/helpers";
import { buildAttendanceImportPreview, parseAttendanceWorkbook, type AttendanceImportPreview } from "@/lib/attendance-import";
import type { AttendancePeriodRecord, Employee } from "@/lib/types";

const LATE_OUTLIER_AVG_MIN_PER_DAY = 60;

function isLateOutlier(rec: { daysWorked: number; lateAdjMinutes: number }): boolean {
  return rec.daysWorked > 0 && rec.lateAdjMinutes / rec.daysWorked > LATE_OUTLIER_AVG_MIN_PER_DAY;
}

export default function AttendancePage() {
  const {
    employees,
    payrollPeriods,
    attendancePeriodRecords,
    currentUser,
    currentEmployee,
    upsertAttendancePeriodRecord,
    importAttendancePeriodRecords,
  } = useHris();

  const canManage = currentUser?.roles.some((r) => ["hr_admin", "payroll_officer"].includes(r));
  const [periodId, setPeriodId] = useState(payrollPeriods[payrollPeriods.length - 1]?.id ?? "");
  const period = payrollPeriods.find((p) => p.id === periodId) ?? payrollPeriods[payrollPeriods.length - 1];

  const recordsForPeriod = period ? attendancePeriodRecords.filter((r) => r.periodId === period.id) : [];
  const byId = new Map(employees.map((e) => [e.id, e]));

  const [editTarget, setEditTarget] = useState<{ employee: Employee; record: AttendancePeriodRecord | null } | null>(null);
  const [importPreview, setImportPreview] = useState<AttendanceImportPreview | null>(null);
  const [importTargetPeriodId, setImportTargetPeriodId] = useState("");
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setImportError(null);
    try {
      const buffer = await file.arrayBuffer();
      const parsed = await parseAttendanceWorkbook(buffer);
      const preview = buildAttendanceImportPreview(parsed, employees);
      setImportPreview(preview);
      const matchingPeriod = payrollPeriods.find((p) => p.start === preview.periodStart && p.end === preview.periodEnd);
      setImportTargetPeriodId(matchingPeriod?.id ?? period?.id ?? "");
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Could not read this file.");
    }
  }

  function confirmImport() {
    if (!importPreview || !importTargetPeriodId) return;
    importAttendancePeriodRecords(
      importTargetPeriodId,
      importPreview.matched.map((m) => ({
        employeeId: m.employee.id,
        daysWorked: m.parsed.daysWorked,
        holidayDays: m.parsed.holidayDays,
        slDays: m.parsed.slDays,
        vlDays: m.parsed.vlDays,
        lateAdjMinutes: m.parsed.lateAdjMinutes,
        undertimeMinutes: m.parsed.undertimeMinutes,
        notes: m.parsed.notes,
        lateInstances: m.parsed.lateInstances,
        lateDayDetails: m.parsed.lateDayDetails,
        undertimeInstances: m.parsed.undertimeInstances,
        undertimeDayDetails: m.parsed.undertimeDayDetails,
        halfDayInstances: m.parsed.halfDayInstances,
        halfDayDates: m.parsed.halfDayDates,
        absenceInstances: m.parsed.absenceInstances,
        absentDates: m.parsed.absentDates,
      })),
    );
    setImportPreview(null);
    setPeriodId(importTargetPeriodId);
  }

  if (!canManage) {
    const myRecord = period ? attendancePeriodRecords.find((r) => r.periodId === period.id && r.employeeId === currentEmployee?.id) : undefined;
    return (
      <div>
        <PageHeader title="My Attendance" subtitle="Your attendance summary per payroll period, as recorded by HR/Payroll." />
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <select value={period?.id ?? ""} onChange={(e) => setPeriodId(e.target.value)} className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-2 text-sm">
            {payrollPeriods.map((p) => (
              <option key={p.id} value={p.id}>{formatDate(p.start)} – {formatDate(p.end)}</option>
            ))}
          </select>
        </div>
        {!myRecord ? (
          <EmptyState icon={CalendarClock} title="No attendance recorded yet" description="HR/Payroll hasn't entered attendance for this period yet." />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-6">
            <StatTile label="Days worked" value={myRecord.daysWorked.toString()} />
            <StatTile label="Holiday days" value={myRecord.holidayDays.toString()} />
            <StatTile label="SL days" value={myRecord.slDays.toString()} />
            <StatTile label="VL days" value={myRecord.vlDays.toString()} />
            <StatTile label="Late (min)" value={myRecord.lateAdjMinutes.toString()} />
            <StatTile label="Undertime (min)" value={myRecord.undertimeMinutes.toString()} />
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Attendance"
        subtitle="Days Worked, Holiday, SL, VL, and Late/Undertime minutes per payroll period — imported from the attendance tracker or entered manually. Overtime pay and leave pay are sourced from approved Overtime/Leave requests, not from here."
        actions={
          <>
            <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFileSelected} />
            <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-1.5 rounded-lg bg-[var(--series-1)] px-3 py-2 text-sm font-medium text-[var(--on-accent)]">
              <Upload size={16} /> Import Excel
            </button>
          </>
        }
      />

      {importError && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-[var(--status-critical)]/40 bg-[color-mix(in_srgb,var(--status-critical)_10%,transparent)] px-3 py-2 text-sm text-[var(--status-critical)]">
          <AlertTriangle size={16} className="shrink-0" /> {importError}
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select value={period?.id ?? ""} onChange={(e) => setPeriodId(e.target.value)} className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-2 text-sm">
          {payrollPeriods.map((p) => (
            <option key={p.id} value={p.id}>{formatDate(p.start)} – {formatDate(p.end)}</option>
          ))}
        </select>
      </div>

      <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-1)] p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="text-sm font-medium text-[var(--text-primary)]">
            Attendance — {period ? `${formatDate(period.start)} – ${formatDate(period.end)}` : "—"}
          </div>
          {period && (
            <button
              onClick={() => setEditTarget({ employee: employees.filter((e) => e.status === "active" || e.status === "on_leave")[0], record: null })}
              className="flex items-center gap-1.5 rounded-lg border border-[var(--border-hairline)] px-2.5 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40"
            >
              <Pencil size={13} /> Add / edit entry
            </button>
          )}
        </div>
        {recordsForPeriod.length === 0 ? (
          <EmptyState icon={CalendarClock} title="No attendance data for this period" description="Import the payroll period's attendance-tracker export, or add entries manually." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="border-b border-[var(--border-hairline)] text-left text-xs text-[var(--text-muted)]">
                  <th className="px-3 py-2 font-medium">Employee</th>
                  <th className="px-3 py-2 font-medium">Branch / Dept</th>
                  <th className="px-3 py-2 font-medium">Days worked</th>
                  <th className="px-3 py-2 font-medium">Holiday</th>
                  <th className="px-3 py-2 font-medium">SL</th>
                  <th className="px-3 py-2 font-medium">VL</th>
                  <th className="px-3 py-2 font-medium">Late (min)</th>
                  <th className="px-3 py-2 font-medium">Undertime (min)</th>
                  <th className="px-3 py-2 font-medium">Source</th>
                  <th className="px-3 py-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {recordsForPeriod
                  .slice()
                  .sort((a, b) => {
                    const ea = byId.get(a.employeeId);
                    const eb = byId.get(b.employeeId);
                    return ea && eb ? fullName(ea).localeCompare(fullName(eb)) : 0;
                  })
                  .map((rec) => {
                    const emp = byId.get(rec.employeeId);
                    const outlier = isLateOutlier(rec);
                    return (
                      <tr key={rec.id} className="border-b border-[var(--gridline)] last:border-0">
                        <td className="px-3 py-2 text-[var(--text-primary)]">{emp ? fullName(emp) : rec.employeeId}</td>
                        <td className="px-3 py-2 text-xs text-[var(--text-secondary)]">{emp ? `${branchName(emp.branchId)} / ${departmentName(emp.departmentId)}` : "—"}</td>
                        <td className="tabular px-3 py-2 text-[var(--text-secondary)]">{rec.daysWorked}</td>
                        <td className="tabular px-3 py-2 text-[var(--text-secondary)]">{rec.holidayDays}</td>
                        <td className="tabular px-3 py-2 text-[var(--text-secondary)]">{rec.slDays}</td>
                        <td className="tabular px-3 py-2 text-[var(--text-secondary)]">{rec.vlDays}</td>
                        <td className="tabular px-3 py-2 text-[var(--text-secondary)]">
                          <span className={outlier ? "text-[var(--status-warning)]" : ""}>{rec.lateAdjMinutes}</span>
                          {outlier && <AlertTriangle size={12} className="ml-1 inline text-[var(--status-warning)]" />}
                        </td>
                        <td className="tabular px-3 py-2 text-[var(--text-secondary)]">{rec.undertimeMinutes}</td>
                        <td className="px-3 py-2"><Badge tone={rec.source === "import" ? "info" : "muted"}>{rec.source}</Badge></td>
                        <td className="px-3 py-2">
                          {emp && (
                            <button onClick={() => setEditTarget({ employee: emp, record: rec })} className="rounded-lg border border-[var(--border-hairline)] px-2.5 py-1 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40">
                              Edit
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
      </div>

      {editTarget && (
        <EditAttendanceModal
          employees={employees}
          period={period}
          target={editTarget}
          onClose={() => setEditTarget(null)}
          onSave={(input) => {
            upsertAttendancePeriodRecord(input);
            setEditTarget(null);
          }}
        />
      )}

      {importPreview && (
        <ImportPreviewModal
          preview={importPreview}
          payrollPeriods={payrollPeriods}
          targetPeriodId={importTargetPeriodId}
          onTargetPeriodChange={setImportTargetPeriodId}
          onCancel={() => setImportPreview(null)}
          onConfirm={confirmImport}
        />
      )}
    </div>
  );
}

function EditAttendanceModal({
  employees,
  period,
  target,
  onClose,
  onSave,
}: {
  employees: Employee[];
  period: { id: string } | undefined;
  target: { employee: Employee; record: AttendancePeriodRecord | null };
  onClose: () => void;
  onSave: (input: Omit<AttendancePeriodRecord, "id" | "source" | "updatedBy" | "updatedAt">) => void;
}) {
  // Every employee is selectable here, not just active/on_leave ones — HR
  // needs to be able to record historical attendance (e.g. backfilling a
  // past payroll period) for employees who have since resigned or been
  // terminated. Active/on_leave employees are listed first for convenience.
  const active = employees.filter((e) => e.status === "active" || e.status === "on_leave");
  const inactive = employees.filter((e) => e.status !== "active" && e.status !== "on_leave");
  const selectable = [...active, ...inactive];
  const [employeeId, setEmployeeId] = useState(target.employee?.id ?? active[0]?.id ?? "");
  const [form, setForm] = useState({
    daysWorked: target.record?.daysWorked ?? 0,
    holidayDays: target.record?.holidayDays ?? 0,
    slDays: target.record?.slDays ?? 0,
    vlDays: target.record?.vlDays ?? 0,
    lateAdjMinutes: target.record?.lateAdjMinutes ?? 0,
    undertimeMinutes: target.record?.undertimeMinutes ?? 0,
    notes: target.record?.notes ?? "",
  });

  if (!period) return null;

  function submit() {
    if (!employeeId || !period) return;
    onSave({ periodId: period.id, employeeId, ...form });
  }

  return (
    <Modal open onClose={onClose} title={target.record ? "Edit attendance entry" : "Add attendance entry"}>
      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Employee</label>
          <select
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value)}
            disabled={!!target.record}
            className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-2 text-sm disabled:opacity-60"
          >
            {selectable.map((e) => (
              <option key={e.id} value={e.id}>{fullName(e)}{e.status !== "active" && e.status !== "on_leave" ? ` (${e.status.replace("_", " ")})` : ""}</option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <NumberField label="Days worked" value={form.daysWorked} onChange={(v) => setForm((f) => ({ ...f, daysWorked: v }))} />
          <NumberField label="Holiday days" value={form.holidayDays} onChange={(v) => setForm((f) => ({ ...f, holidayDays: v }))} />
          <NumberField label="SL days" value={form.slDays} onChange={(v) => setForm((f) => ({ ...f, slDays: v }))} />
          <NumberField label="VL days" value={form.vlDays} onChange={(v) => setForm((f) => ({ ...f, vlDays: v }))} />
          <NumberField label="Late (min)" value={form.lateAdjMinutes} onChange={(v) => setForm((f) => ({ ...f, lateAdjMinutes: v }))} />
          <NumberField label="Undertime raw (min)" value={form.undertimeMinutes} onChange={(v) => setForm((f) => ({ ...f, undertimeMinutes: v }))} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Notes</label>
          <textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={2} className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-2 text-sm" />
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="rounded-lg px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40">Cancel</button>
          <button onClick={submit} disabled={!employeeId} className="rounded-lg bg-[var(--series-1)] px-3 py-1.5 text-sm font-medium text-[var(--on-accent)] disabled:opacity-40">Save</button>
        </div>
      </div>
    </Modal>
  );
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">{label}</label>
      <input type="number" step={0.1} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-2 text-sm" />
    </div>
  );
}

function ImportPreviewModal({
  preview,
  payrollPeriods,
  targetPeriodId,
  onTargetPeriodChange,
  onCancel,
  onConfirm,
}: {
  preview: AttendanceImportPreview;
  payrollPeriods: { id: string; start: string; end: string }[];
  targetPeriodId: string;
  onTargetPeriodChange: (id: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const outliers = preview.matched.filter((m) => m.isLateOutlier);

  return (
    <Modal open onClose={onCancel} title="Review attendance import" wide>
      <div className="space-y-4">
        <div className="rounded-lg bg-[var(--gridline)]/20 p-3 text-xs text-[var(--text-secondary)]">
          Read sheet <span className="font-medium text-[var(--text-primary)]">&ldquo;{preview.sheetName}&rdquo;</span>
          {preview.periodStart && preview.periodEnd && (
            <> covering <span className="font-medium text-[var(--text-primary)]">{preview.periodStart}</span> to <span className="font-medium text-[var(--text-primary)]">{preview.periodEnd}</span></>
          )}
          .
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Apply to payroll period</label>
          <select value={targetPeriodId} onChange={(e) => onTargetPeriodChange(e.target.value)} className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-2 text-sm">
            {payrollPeriods.map((p) => (
              <option key={p.id} value={p.id}>{formatDate(p.start)} – {formatDate(p.end)}</option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <StatTile label="Matched" value={preview.matched.length.toString()} />
          <StatTile label="Unmatched rows" value={preview.unmatched.length.toString()} />
          <StatTile label="Missing from file" value={preview.missingFromFile.length.toString()} />
        </div>

        {outliers.length > 0 && (
          <div className="rounded-lg border border-[var(--status-warning)]/40 bg-[color-mix(in_srgb,var(--status-warning)_10%,transparent)] p-3">
            <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-[var(--status-warning)]"><AlertTriangle size={14} /> Suspiciously high late/undertime minutes ({outliers.length})</div>
            <ul className="space-y-0.5 text-xs text-[var(--text-secondary)]">
              {outliers.map((o) => (
                <li key={o.employee.id}>{fullName(o.employee)} — {o.parsed.lateAdjMinutes} min over {o.parsed.daysWorked} day(s) worked</li>
              ))}
            </ul>
            <div className="mt-1.5 text-xs text-[var(--text-muted)]">These will still be imported as-is — double check the source file before relying on this period&rsquo;s payroll.</div>
          </div>
        )}

        {preview.unmatched.length > 0 && (
          <div className="rounded-lg border border-[var(--border-hairline)] p-3">
            <div className="mb-1.5 text-xs font-medium text-[var(--text-primary)]">Not imported — no matching employee found ({preview.unmatched.length})</div>
            <ul className="space-y-0.5 text-xs text-[var(--text-secondary)]">
              {preview.unmatched.map((u, i) => (
                <li key={i}>{u.rawName} — {u.branch} / {u.department}</li>
              ))}
            </ul>
          </div>
        )}

        {preview.missingFromFile.length > 0 && (
          <div className="rounded-lg border border-[var(--border-hairline)] p-3">
            <div className="mb-1.5 text-xs font-medium text-[var(--text-primary)]">In the system but not in this file ({preview.missingFromFile.length})</div>
            <div className="text-xs text-[var(--text-secondary)]">{preview.missingFromFile.map((e) => fullName(e)).join(", ")}</div>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onCancel} className="rounded-lg px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40">Cancel</button>
          <button onClick={onConfirm} disabled={!targetPeriodId || preview.matched.length === 0} className="rounded-lg bg-[var(--series-1)] px-3 py-1.5 text-sm font-medium text-[var(--on-accent)] disabled:opacity-40">
            Import {preview.matched.length} record(s)
          </button>
        </div>
      </div>
    </Modal>
  );
}
