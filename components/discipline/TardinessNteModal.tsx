"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchTardinessPriorOffenses } from "@/lib/supabase/repo";
import { Download } from "lucide-react";
import { useHris } from "@/lib/store";
import { Modal } from "@/components/Modal";
import { formatDate, fullName, positionTitle } from "@/lib/helpers";
import { loadHrLetterhead } from "@/lib/discipline-notice";
import { currentCompany } from "@/lib/companies";
import { todayInManila } from "@/lib/leave-policy";
import { NTE_RESPONSE_DAYS, addDays } from "@/lib/discipline";
import { completeMonths, issuedTardinessNte, monthLabel, tardinessNteCandidates, tardinessNteDescription, type TardinessNteCandidate } from "@/lib/nte-tardiness";
import { buildTardinessNtePdf, type TardinessNteInput } from "@/lib/nte-tardiness-pdf";
import type { Employee } from "@/lib/types";

// Review and issue the month's Notices To Explain for habitual tardiness:
// everyone late 5 or more days (5+ minutes each) once the month's attendance
// is complete. Each NTE is saved as a disciplinary record with its PDF and is
// signed by the HR Manager, then the employee's Department Manager (in the
// CC), before the employee receives it in My Notices to sign as received and
// explain.

const ordinal = (n: number) => `${n}${["th", "st", "nd", "rd"][n % 100 >= 11 && n % 100 <= 13 ? 0 : Math.min(n % 10, 4) % 4] ?? "th"}`;
const letterName = (e: Employee) => `${e.lastName}, ${e.firstName}`;

// The employee's Department Manager: the head of their department, else
// their supervisor.
function defaultManager(e: Employee, employees: Employee[]): string {
  const head = employees.find((x) => x.id !== e.id && x.status === "active" && x.departmentId === e.departmentId && x.roles.includes("dept_head"));
  return head?.id ?? e.supervisorId ?? "";
}

function download(bytes: Uint8Array, name: string) {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function TardinessNteModal({ initialMonth, onClose }: { initialMonth?: string; onClose: () => void }) {
  const { employees, payrollPeriods, attendancePeriodRecords, disciplinaryRecords, currentEmployee, addDisciplinaryRecord, attachDisciplinaryNotice, isRealAccount } = useHris();
  // Offenses from tardiness NTEs given before the HRIS.
  const [prior, setPrior] = useState<Record<string, number>>({});
  useEffect(() => {
    if (isRealAccount) fetchTardinessPriorOffenses().then(setPrior, () => {});
  }, [isRealAccount]);
  const months = useMemo(() => completeMonths(payrollPeriods, attendancePeriodRecords), [payrollPeriods, attendancePeriodRecords]);
  const [month, setMonth] = useState(initialMonth ?? months[0] ?? "");
  const today = todayInManila();
  const company = currentCompany();

  const candidates = useMemo(
    () => (month ? tardinessNteCandidates({ month, employees, records: attendancePeriodRecords, discipline: disciplinaryRecords, prior }) : []),
    [month, employees, attendancePeriodRecords, disciplinaryRecords, prior],
  );
  // Fixed-rate employees aren't held to late deductions: not selected by default.
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const isPicked = (c: TardinessNteCandidate) => picked[`${month}|${c.employee.id}`] ?? (c.employee.payrollType !== "monthly" && !issuedTardinessNte(disciplinaryRecords, c.employee.id, month));
  const [managers, setManagers] = useState<Record<string, string>>({});
  const managerOf = (e: Employee) => managers[e.id] ?? defaultManager(e, employees);
  const toIssue = candidates.filter((c) => isPicked(c) && !issuedTardinessNte(disciplinaryRecords, c.employee.id, month) && managerOf(c.employee));
  const managerChoices = useMemo(() => employees.filter((e) => e.status === "active").sort((a, b) => fullName(a).localeCompare(fullName(b))), [employees]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function pdfInput(c: TardinessNteCandidate): Promise<TardinessNteInput> {
    const sup = employees.find((e) => e.id === managerOf(c.employee));
    return {
      companyName: company.name,
      companyShort: company.shortName,
      companyAddress: company.info.address,
      companyContact: [company.info.phone, company.info.email].filter(Boolean).join(" · "),
      letterhead: await loadHrLetterhead(),
      employeeName: letterName(c.employee),
      issueDate: today,
      month,
      days: c.days,
      cc: sup ? { name: letterName(sup), title: positionTitle(sup.positionId).replace(/^—$/, "") } : null,
    };
  }

  async function preview(list: TardinessNteCandidate[], name: string) {
    setError(null);
    setBusy("Preparing the PDF…");
    try {
      download(await buildTardinessNtePdf(await Promise.all(list.map(pdfInput))), name);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't make the PDF.");
    } finally {
      setBusy(null);
    }
  }

  async function issue() {
    if (!currentEmployee || !toIssue.length) return;
    setError(null);
    const failed: string[] = [];
    for (const [i, c] of toIssue.entries()) {
      setBusy(`Issuing ${i + 1} of ${toIssue.length}…`);
      const input = await pdfInput(c);
      const saved = await addDisciplinaryRecord({
        employeeId: c.employee.id,
        type: "nte",
        description: tardinessNteDescription(month, c.days),
        issuedBy: currentEmployee.id,
        date: today,
        status: "open",
        attachmentName: null,
        requiresExplanation: true,
        responseDue: addDays(today, NTE_RESPONSE_DAYS),
        signFlow: true,
        managerId: managerOf(c.employee),
        noticeData: { kind: "tardiness", month, issueDate: today, employeeName: input.employeeName, days: c.days, cc: input.cc },
      });
      if (!saved) {
        failed.push(letterName(c.employee));
        continue;
      }
      const bytes = await buildTardinessNtePdf([input]);
      const file = new File([bytes as BlobPart], `NTE - Habitual Tardiness - ${monthLabel(month)} - ${letterName(c.employee)}.pdf`, { type: "application/pdf" });
      const err = await attachDisciplinaryNotice(saved.id, file);
      if (err) failed.push(`${letterName(c.employee)} (PDF: ${err})`);
    }
    setBusy(null);
    if (failed.length) setError(`Not completed for: ${failed.join(", ")}. Open the record to attach the notice again, or try again.`);
  }

  return (
    <Modal open onClose={() => !busy && onClose()} title="Tardiness NTEs" wide>
      <div className="space-y-4 text-sm">
        <div className="flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Month (attendance complete)</span>
            <select value={month} onChange={(e) => setMonth(e.target.value)} className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-2 text-sm">
              {months.map((m) => (
                <option key={m} value={m}>
                  {monthLabel(m)}
                </option>
              ))}
            </select>
          </label>
          <div className="pb-2 text-xs text-[var(--text-muted)]">Late 5 or more days in the month, counting days 5 minutes late or more. Explanation due in {NTE_RESPONSE_DAYS} days.</div>
        </div>

        {!months.length ? (
          <div className="text-[var(--text-muted)]">No month has complete attendance yet: both cut-offs of a month need attendance and be locked in Payroll Processing.</div>
        ) : candidates.length === 0 ? (
          <div className="text-[var(--text-muted)]">No one was late 5 or more days in {monthLabel(month)}.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-[var(--border-hairline)] text-left text-xs text-[var(--text-muted)]">
                  <th className="px-2 py-2" />
                  <th className="px-2 py-2 font-medium">Employee</th>
                  <th className="px-2 py-2 font-medium">Days late</th>
                  <th className="px-2 py-2 font-medium">Offense · policy penalty</th>
                  <th className="px-2 py-2 font-medium">Department Manager (signs, CC)</th>
                  <th className="px-2 py-2 font-medium">NTE</th>
                </tr>
              </thead>
              <tbody>
                {candidates.map((c) => {
                  const issued = issuedTardinessNte(disciplinaryRecords, c.employee.id, month);
                  return (
                    <tr key={c.employee.id} className="border-b border-[var(--gridline)] last:border-0">
                      <td className="px-2 py-2">
                        <input
                          type="checkbox"
                          checked={!issued && isPicked(c)}
                          disabled={!!issued || !!busy}
                          onChange={(e) => setPicked((p) => ({ ...p, [`${month}|${c.employee.id}`]: e.target.checked }))}
                          aria-label={`Issue an NTE to ${letterName(c.employee)}`}
                          className="accent-[var(--series-1)]"
                        />
                      </td>
                      <td className="px-2 py-2 text-[var(--text-primary)]">
                        {letterName(c.employee)}
                        {c.employee.payrollType === "monthly" && <div className="text-[10px] text-[var(--text-muted)]">Fixed-rate — not selected by default</div>}
                      </td>
                      <td className="tabular px-2 py-2 text-[var(--text-secondary)]" title={c.days.map((d) => `${formatDate(d.date)}: ${d.minutes}m`).join("\n")}>
                        {c.days.length} <span className="text-xs text-[var(--text-muted)]">({c.days.reduce((t, d) => t + d.minutes, 0)}m)</span>
                      </td>
                      <td className="px-2 py-2 text-xs text-[var(--text-secondary)]">
                        {ordinal(c.offense)} · {c.suggestedPenalty || "—"}
                        {prior[c.employee.id] ? <div className="text-[10px] text-[var(--text-muted)]">incl. {prior[c.employee.id]} earlier NTE{prior[c.employee.id] === 1 ? "" : "s"} before the HRIS</div> : null}
                      </td>
                      <td className="px-2 py-2 text-xs">
                        {issued ? (
                          <span className="text-[var(--text-secondary)]">{(() => {
                            const m = employees.find((e) => e.id === issued.managerId);
                            return m ? letterName(m) : "—";
                          })()}</span>
                        ) : (
                          <select
                            value={managerOf(c.employee)}
                            onChange={(e) => setManagers((m) => ({ ...m, [c.employee.id]: e.target.value }))}
                            disabled={!!busy}
                            className={`max-w-[200px] rounded-md border bg-[var(--surface-1)] px-2 py-1 text-xs ${managerOf(c.employee) ? "border-[var(--border-hairline)]" : "border-[var(--status-warning)]"}`}
                            aria-label={`Department Manager for ${letterName(c.employee)}`}
                          >
                            <option value="">Choose…</option>
                            {managerChoices
                              .filter((e) => e.id !== c.employee.id)
                              .map((e) => (
                                <option key={e.id} value={e.id}>
                                  {fullName(e)}
                                </option>
                              ))}
                          </select>
                        )}
                      </td>
                      <td className="px-2 py-2 text-xs">
                        {issued ? (
                          <span className="text-[var(--status-good)]">Issued {formatDate(issued.date)}</span>
                        ) : (
                          <button onClick={() => preview([c], `NTE - ${letterName(c.employee)}.pdf`)} disabled={!!busy} className="text-[var(--series-1)] hover:underline disabled:opacity-40">
                            Preview
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

        <div className="text-xs text-[var(--text-muted)]">
          Each NTE is signed by the HR Manager, then the Department Manager (their department head, else their supervisor — you can change it), and only then reaches the employee to sign as received. The offense number counts this employee&rsquo;s earlier tardiness NTEs in the HRIS; the penalty is the policy&rsquo;s, for your decision after their explanation.
        </div>
        {error && <div className="text-sm text-[var(--status-critical)]">{error}</div>}

        <div className="flex flex-wrap items-center justify-end gap-2">
          {busy && <span className="mr-auto text-xs text-[var(--text-muted)]">{busy}</span>}
          <button onClick={onClose} disabled={!!busy} className="rounded-lg px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40">
            Close
          </button>
          <button
            onClick={() => preview(toIssue, `NTE - Habitual Tardiness - ${monthLabel(month)}.pdf`)}
            disabled={!!busy || !toIssue.length}
            className="flex items-center gap-1.5 rounded-lg border border-[var(--border-hairline)] px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40 disabled:opacity-40"
          >
            <Download size={14} /> Download selected (one PDF)
          </button>
          <button onClick={issue} disabled={!!busy || !toIssue.length} className="rounded-lg bg-[var(--series-1)] px-3 py-1.5 text-sm font-medium text-[var(--on-accent)] disabled:opacity-40">
            Issue {toIssue.length} NTE{toIssue.length === 1 ? "" : "s"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
