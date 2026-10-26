"use client";

import { useEffect, useMemo, useState } from "react";
import { AlarmClock, FileText, ListChecks, Plus, ShieldAlert } from "lucide-react";
import { useHris } from "@/lib/store";
import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/Badge";
import { Modal } from "@/components/Modal";
import { EmptyState } from "@/components/EmptyState";
import { DisciplineRecordModal, type DisciplineModalMode } from "@/components/discipline/DisciplineRecordModal";
import { departmentName, formatDate, fullName, positionTitle, scopeEmployeesForViewer } from "@/lib/helpers";
import { DISCIPLINARY_LABELS } from "@/lib/types";
import type { DisciplinaryType } from "@/lib/types";
import { DISCIPLINE_TYPE_TONE, NTE_RESPONSE_DAYS, addDays, responseBadge, responseStage } from "@/lib/discipline";
import { todayInManila } from "@/lib/leave-policy";
import { TardinessNteModal } from "@/components/discipline/TardinessNteModal";
import { completeMonths, issuedTardinessNte, monthLabel, tardinessNteCandidates } from "@/lib/nte-tardiness";
import { fetchAssessments, takesAssessment, type DisciplineAssessment } from "@/lib/discipline-assessment";

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
    payrollPeriods,
    attendancePeriodRecords,
  } = useHris();
  const [showTardiness, setShowTardiness] = useState(false);
  const isHr = !!currentUser?.roles.includes("hr_admin");
  // The latest month whose attendance is complete, and who in it still needs
  // a tardiness NTE (fixed-rate employees aside).
  const tardiness = useMemo(() => {
    if (!isHr) return null;
    const month = completeMonths(payrollPeriods, attendancePeriodRecords)[0];
    if (!month) return null;
    const pending = tardinessNteCandidates({ month, employees: allEmployees, records: attendancePeriodRecords, discipline: disciplinaryRecords }).filter(
      (c) => c.employee.payrollType !== "monthly" && !issuedTardinessNte(disciplinaryRecords, c.employee.id, month),
    );
    return { month, pending: pending.length };
  }, [isHr, payrollPeriods, attendancePeriodRecords, allEmployees, disciplinaryRecords]);
  // Department Heads' assessments of explanations (phase 61), refreshed
  // when a record window closes.
  const [assessments, setAssessments] = useState<DisciplineAssessment[]>([]);
  const [assessRev, setAssessRev] = useState(0);
  useEffect(() => {
    fetchAssessments().then(setAssessments, () => setAssessments([]));
  }, [assessRev, disciplinaryRecords]);
  const hrIds = useMemo(() => new Set(allEmployees.filter((e) => e.roles.includes("hr_admin")).map((e) => e.id)), [allEmployees]);
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

  // Any record this person can see (their own actions can be outside the
  // departments they manage).
  const openRecord = disciplinaryRecords.find((r) => r.id === openId) ?? null;

  // By department: the employee's department, and the filter.
  const [deptFilter, setDeptFilter] = useState("");
  const deptOf = (employeeId: string) => allEmployees.find((e) => e.id === employeeId)?.departmentId ?? "";
  const deptLabel = (id: string) => (id ? departmentName(id).replace(/^—$/, "No department") : "No department");
  const deptOptions = useMemo(
    () => [...new Set(rows.map((r) => deptOf(r.employeeId)))].sort((a, b) => deptLabel(a).localeCompare(deptLabel(b))),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deptOf/deptLabel read allEmployees
    [rows, allEmployees],
  );
  const groups = useMemo(() => {
    const shown = rows.filter((r) => !deptFilter || deptOf(r.employeeId) === deptFilter);
    const by = new Map<string, typeof rows>();
    for (const r of shown) {
      const k = deptOf(r.employeeId);
      by.set(k, [...(by.get(k) ?? []), r]);
    }
    return [...by.entries()].sort((a, b) => deptLabel(a[0]).localeCompare(deptLabel(b[0])));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deptOf/deptLabel read allEmployees
  }, [rows, deptFilter, allEmployees]);

  // What the signed-in person has to do, across every record they can see.
  const myActions = useMemo(() => {
    const me = currentEmployee?.id;
    if (!me) return [];
    const out: { r: (typeof disciplinaryRecords)[number]; action: string }[] = [];
    for (const r of disciplinaryRecords) {
      if (r.withdrawnAt || r.status === "resolved" || r.employeeId === me) continue;
      const stage = responseStage(r);
      if (isHr && stage === "hr_to_sign") out.push({ r, action: "Sign as HR Manager" });
      if (stage === "branch_to_sign" && r.branchManagerId === me) out.push({ r, action: "Sign as Branch Manager" });
      if (stage === "manager_to_sign" && r.managerId === me) out.push({ r, action: "Sign as Department Manager" });
      if (r.signFlow && r.explanationSubmittedAt && isHr && !r.explHrReceivedAt) out.push({ r, action: "Receive the written explanation (HR)" });
      if (r.explanationSubmittedAt && r.managerId === me && !r.explMgrReceivedAt) out.push({ r, action: "Receive the written explanation" });
      if (r.explanationSubmittedAt && r.issuedBy === me && takesAssessment(r, hrIds) && !assessments.some((a) => a.recordId === r.id))
        out.push({ r, action: "Assess the explanation and recommend an action to HR" });
      const a = isHr ? assessments.find((x) => x.recordId === r.id) : undefined;
      if (a) out.push({ r, action: `Issue the Notice of Sanction — head recommends ${a.recommendation}` });
      if (isHr && r.noticeData?.kind === "tardiness" && r.explHrReceivedAt && r.explMgrReceivedAt && !disciplinaryRecords.some((x) => x.noticeData?.kind === "sanction" && x.noticeData.nteId === r.id))
        out.push({ r, action: "Issue the Notice of Sanction (tardiness)" });
    }
    return out.sort((x, y) => deptLabel(deptOf(x.r.employeeId)).localeCompare(deptLabel(deptOf(y.r.employeeId))));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deptOf/deptLabel read allEmployees
  }, [disciplinaryRecords, currentEmployee, isHr, assessments, hrIds, allEmployees]);
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
            <>
            {isHr && (
              <button
                onClick={() => setShowTardiness(true)}
                className="flex items-center gap-1.5 rounded-lg border border-[var(--series-1)] px-3 py-2 text-sm font-medium text-[var(--series-1)] hover:bg-[var(--series-1)]/10"
              >
                <AlarmClock size={16} /> Tardiness NTEs
              </button>
            )}
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
            </>
          )
        }
      />

      {tardiness && tardiness.pending > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-[var(--status-warning)]/40 p-3 text-sm" style={{ background: "color-mix(in srgb, var(--status-warning) 8%, transparent)" }}>
          <AlarmClock size={18} className="shrink-0 text-[var(--status-warning)]" />
          <div className="flex-1 text-[var(--text-secondary)]">
            <span className="font-medium text-[var(--text-primary)]">{monthLabel(tardiness.month)} attendance is complete.</span> {tardiness.pending} employee{tardiness.pending === 1 ? " was" : "s were"} late 5 or more days and {tardiness.pending === 1 ? "has" : "have"} no tardiness NTE yet.
          </div>
          <button onClick={() => setShowTardiness(true)} className="rounded-lg bg-[var(--series-1)] px-3 py-1.5 text-sm font-medium text-[var(--on-accent)]">
            Review &amp; issue NTEs
          </button>
        </div>
      )}
      {!isHr && (() => {
        const toAssess = disciplinaryRecords.filter(
          (r) => r.issuedBy === currentEmployee?.id && r.explanationSubmittedAt && r.status !== "resolved" && takesAssessment(r, hrIds) && !assessments.some((a) => a.recordId === r.id),
        ).length;
        return toAssess > 0 ? (
          <div className="mb-4 rounded-xl border border-[var(--status-warning)]/40 p-3 text-sm text-[var(--text-secondary)]" style={{ background: "color-mix(in srgb, var(--status-warning) 8%, transparent)" }}>
            <span className="font-medium text-[var(--text-primary)]">{toAssess} written explanation{toAssess === 1 ? " is" : "s are"} waiting for your assessment.</span> Open the record, comment on the explanation and recommend the disciplinary action to HR.
          </div>
        ) : null;
      })()}
      {isHr && (() => {
        const waiting = disciplinaryRecords.filter((r) => r.signFlow && !r.hrSignedAt && !r.withdrawnAt).length;
        const toReceive = disciplinaryRecords.filter((r) => r.signFlow && r.explanationSubmittedAt && !r.explHrReceivedAt).length;
        const toSanction = disciplinaryRecords.filter(
          (r) => r.noticeData?.kind === "tardiness" && r.explHrReceivedAt && r.explMgrReceivedAt && !disciplinaryRecords.some((x) => x.noticeData?.kind === "sanction" && x.noticeData.nteId === r.id),
        ).length;
        const excuses = disciplinaryRecords.filter((r) => (r.excuseRequests ?? []).some((x) => x.status === "pending")).length;
        const recommended = disciplinaryRecords.filter((r) => r.status !== "resolved" && assessments.some((a) => a.recordId === r.id)).length;
        return waiting > 0 || toReceive > 0 || toSanction > 0 || excuses > 0 || recommended > 0 ? (
          <div className="mb-4 space-y-1 rounded-xl border border-[var(--status-warning)]/40 p-3 text-sm text-[var(--text-secondary)]" style={{ background: "color-mix(in srgb, var(--status-warning) 8%, transparent)" }}>
            {waiting > 0 && (
              <div>
                <span className="font-medium text-[var(--text-primary)]">{waiting} notice{waiting === 1 ? " is" : "s are"} waiting for your signature as HR Manager.</span> Open each one marked &ldquo;Awaiting HR Manager signature&rdquo; to sign; it then goes to the Department Manager, then to the employee.
              </div>
            )}
            {toReceive > 0 && (
              <div>
                <span className="font-medium text-[var(--text-primary)]">{toReceive} written explanation{toReceive === 1 ? " is" : "s are"} waiting for you to receive.</span> Open the record and sign under the explanation.
              </div>
            )}
            {recommended > 0 && (
              <div>
                <span className="font-medium text-[var(--text-primary)]">{recommended} record{recommended === 1 ? " has" : "s have"} the Department Head&rsquo;s recommended action.</span> Open the record to read the head&rsquo;s assessment, then issue the Notice of Sanction (or mark it resolved if no action is needed).
              </div>
            )}
            {excuses > 0 && (
              <div>
                <span className="font-medium text-[var(--text-primary)]">{excuses} NTE{excuses === 1 ? " has" : "s have"} late days a manager asked to excuse.</span> Open the NTE to accept or decline under &ldquo;Late days to excuse&rdquo;.
              </div>
            )}
            {toSanction > 0 && (
              <div>
                <span className="font-medium text-[var(--text-primary)]">{toSanction} tardiness NTE{toSanction === 1 ? " is" : "s are"} ready for a Notice of Sanction</span> — the explanation was received by you and the Department Manager. Open the NTE to fill in the sanction.
              </div>
            )}
          </div>
        ) : null;
      })()}
      {showTardiness && <TardinessNteModal initialMonth={tardiness?.month} onClose={() => setShowTardiness(false)} />}

      {myActions.length > 0 && (
        <div className="mb-4 rounded-xl border border-[var(--series-1)]/40 bg-[var(--surface-1)] p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-medium text-[var(--text-primary)]">
            <ListChecks size={16} /> Needs your action ({myActions.length})
          </div>
          <div className="space-y-1.5">
            {myActions.map(({ r, action }, i) => {
              const emp = allEmployees.find((e) => e.id === r.employeeId);
              return (
                <div key={`${r.id}-${i}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[var(--gridline)]/20 px-3 py-2 text-sm">
                  <div className="min-w-0">
                    <span className="mr-2 rounded bg-[var(--gridline)]/50 px-1.5 py-0.5 text-[11px] text-[var(--text-secondary)]">{deptLabel(deptOf(r.employeeId))}</span>
                    <span className="font-medium text-[var(--text-primary)]">{emp ? fullName(emp) : r.employeeId}</span>
                    <span className="text-[var(--text-secondary)]">
                      {" "}
                      — {DISCIPLINARY_LABELS[r.type]}, {formatDate(r.date)}
                    </span>
                    <div className="text-xs font-medium text-[var(--series-1)]">{action}</div>
                  </div>
                  <button onClick={() => setOpenId(r.id)} className="rounded-lg bg-[var(--series-1)] px-2.5 py-1 text-xs font-medium text-[var(--on-accent)]">
                    Open
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)} className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-1.5 text-xs" aria-label="Department">
          <option value="">All departments</option>
          {deptOptions.map((d) => (
            <option key={d || "none"} value={d}>
              {deptLabel(d)}
            </option>
          ))}
        </select>
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
              {groups.map(([dept, list]) => [
                <tr key={`dept-${dept || "none"}`} className="border-b border-[var(--border-hairline)] bg-[var(--gridline)]/25">
                  <td colSpan={7} className="px-4 py-2 text-xs font-semibold tracking-wide text-[var(--text-secondary)] uppercase">
                    {deptLabel(dept)} <span className="font-normal normal-case">({list.length})</span>
                  </td>
                </tr>,
                ...list.map((r) => {
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
                      {(() => {
                        if (!r.explanationSubmittedAt || !takesAssessment(r, hrIds)) return null;
                        const a = assessments.find((x) => x.recordId === r.id);
                        if (a) return <div className="mt-1 text-xs text-[var(--text-secondary)]">Head recommends: <span className="font-medium text-[var(--text-primary)]">{a.recommendation}</span></div>;
                        return r.status !== "resolved" && (isHr || r.issuedBy === currentEmployee?.id) ? <div className="mt-1 text-xs text-[var(--status-warning)]">Waiting for the head&rsquo;s assessment</div> : null;
                      })()}
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
              }),
              ])}
            </tbody>
          </table>
        </div>
      )}

      <DisciplineRecordModal record={openRecord} employees={allEmployees} mode={mode} onClose={() => (setOpenId(null), setAssessRev((x) => x + 1))} />

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
