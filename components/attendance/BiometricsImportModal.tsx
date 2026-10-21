"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { useHris } from "@/lib/store";
import { Modal } from "@/components/Modal";
import { formatDate, fullName } from "@/lib/helpers";
import { reportSaveError } from "@/lib/save-errors";
import type { BioFile } from "@/lib/biometrics/parse";
import { computeAttendance, fileCoverage, type BranchSchedule } from "@/lib/biometrics/compute";
import { BRANCH_SCHEDULES, guessBranch, matchEmployeeByName } from "@/lib/biometrics/branches";
import { fetchBiometricLinks, saveBiometricLinks, type BiometricLink } from "@/lib/supabase/biometric-links";

// Review screen for a branch's biometrics file: pick the branch and cut-off,
// check the schedule, match each person in the file to an employee (saved
// for next time), see what the HRIS worked out, then import.

const shortDate = (d: string) => formatDate(d).replace(/, \d{4}$/, "");

export function BiometricsImportModal({ file, fileName, onClose, onImported }: { file: BioFile; fileName: string; onClose: () => void; onImported: (periodId: string) => void }) {
  const { employees, branches, payrollPeriods, holidays, leaveRequests, attendancePeriodRecords, importAttendancePeriodRecords, isRealAccount } = useHris();
  const [branchId, setBranchId] = useState(() => guessBranch(fileName, branches)?.id ?? "");
  // The cut-off holding most of the file's punch days.
  const [periodId, setPeriodId] = useState(() => {
    const dates = file.people.flatMap((x) => [...x.days.keys()]);
    let best = { id: payrollPeriods[payrollPeriods.length - 1]?.id ?? "", n: 0 };
    for (const p of payrollPeriods) {
      const n = dates.filter((d) => d >= p.start && d <= p.end).length;
      if (n > best.n) best = { id: p.id, n };
    }
    return best.id;
  });
  const [schedule, setSchedule] = useState<BranchSchedule>(() => BRANCH_SCHEDULES[guessBranch(fileName, branches)?.id ?? ""] ?? file.shift ?? { timeIn: "08:00", timeOut: "17:00" });
  const [links, setLinks] = useState<BiometricLink[] | null>(isRealAccount ? null : []);
  const [assigned, setAssigned] = useState<Record<string, string>>({});
  const [skipped, setSkipped] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isRealAccount) return;
    fetchBiometricLinks().then(setLinks, (err) => {
      reportSaveError("Couldn't load the saved biometrics matches", err);
      setLinks([]);
    });
  }, [isRealAccount]);

  // Branch changed: use its schedule.
  function chooseBranch(id: string) {
    setBranchId(id);
    setSchedule(BRANCH_SCHEDULES[id] ?? file.shift ?? schedule);
  }

  const period = payrollPeriods.find((p) => p.id === periodId);
  const byId = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);
  const pickable = useMemo(
    () => employees.filter((e) => e.status !== "resigned" && e.status !== "terminated").sort((a, b) => fullName(a).localeCompare(fullName(b))),
    [employees],
  );
  const coverage = useMemo(() => fileCoverage(file.people, schedule), [file, schedule]);

  const rows = useMemo(() => {
    if (!period) return [];
    return file.people.map((p) => {
      const saved = links?.find((l) => l.branchId === branchId && l.deviceKey === p.key)?.employeeId;
      const auto = saved ?? (p.name ? matchEmployeeByName(p.name, employees)?.id : undefined);
      const employeeId = assigned[p.key] ?? auto ?? "";
      const emp = employeeId ? byId.get(employeeId) : undefined;
      const inPeriod = [...p.days.keys()].filter((d) => d >= period.start && d <= period.end).length;
      const computed = computeAttendance({
        days: p.days,
        schedule,
        periodStart: period.start,
        periodEnd: period.end,
        holidays,
        approvedLeaves: emp ? leaveRequests.filter((l) => l.status === "approved" && l.employeeId === emp.id) : [],
        dateHired: emp?.dateHired,
        fileLastDate: coverage.lastDate,
        lastDateInProgress: coverage.lastDateInProgress,
      });
      const noPunches = inPeriod === 0;
      const include = !!emp && !noPunches && !skipped[p.key];
      return { person: p, employeeId, emp, saved: !!saved, computed, noPunches, include };
    });
  }, [file, links, branchId, assigned, skipped, byId, employees, period, schedule, holidays, leaveRequests, coverage]);

  const included = rows.filter((r) => r.include);
  const dupes = new Set(included.map((r) => r.employeeId).filter((id, i, a) => a.indexOf(id) !== i));
  const existing = new Set(attendancePeriodRecords.filter((r) => r.periodId === periodId).map((r) => r.employeeId));
  const replacing = included.filter((r) => existing.has(r.employeeId)).length;
  const branch = branches.find((b) => b.id === branchId);
  const scheduleOk = /^\d{2}:\d{2}$/.test(schedule.timeIn) && /^\d{2}:\d{2}$/.test(schedule.timeOut) && schedule.timeIn < schedule.timeOut;
  // Locked / closed cut-offs are already paid: their attendance stays as is.
  const periodLocked = !!period && period.status !== "open";
  const canImport = !!branch && !!period && !periodLocked && scheduleOk && included.length > 0 && dupes.size === 0 && links !== null && !busy;

  async function confirm() {
    if (!canImport || !period || !branch) return;
    setBusy(true);
    try {
      const newLinks = included
        .filter((r) => links?.find((l) => l.branchId === branchId && l.deviceKey === r.person.key)?.employeeId !== r.employeeId)
        .map((r) => ({ branchId, deviceKey: r.person.key, deviceName: r.person.name || r.person.deviceId, employeeId: r.employeeId }));
      if (isRealAccount) await saveBiometricLinks(newLinks);
      await importAttendancePeriodRecords(
        period.id,
        included.map((r) => ({
          employeeId: r.employeeId,
          daysWorked: r.computed.daysWorked,
          holidayDays: r.computed.holidayDays,
          slDays: r.computed.slDays,
          vlDays: r.computed.vlDays,
          lateMinutes: r.computed.lateMinutes,
          undertimeMinutes: r.computed.undertimeMinutes,
          notes: `Biometrics — ${branch.name} (${schedule.timeIn}–${schedule.timeOut})`,
          lateInstances: r.computed.lateInstances,
          lateDayDetails: r.computed.lateDayDetails,
          undertimeInstances: r.computed.undertimeInstances,
          undertimeDayDetails: r.computed.undertimeDayDetails,
          absenceInstances: r.computed.absenceInstances,
          absentDates: r.computed.absentDates,
          missingPunches: r.computed.missingPunches,
        })),
      );
      onImported(period.id);
    } catch (err) {
      reportSaveError("Couldn't import the biometrics", err);
    } finally {
      setBusy(false);
    }
  }

  const input = "rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-2.5 py-1.5 text-sm";
  const missingCount = included.reduce((t, r) => t + r.computed.missingPunches.length, 0);

  return (
    <Modal open onClose={() => !busy && onClose()} title="Import biometrics" wide>
      <div className="space-y-4 text-sm">
        <div className="rounded-lg bg-[var(--gridline)]/20 p-3 text-xs text-[var(--text-secondary)]">
          <span className="font-medium text-[var(--text-primary)]">{fileName}</span> · {file.formatLabel} · {file.people.length} people
          {coverage.lastDate && <> · punches up to {formatDate(coverage.lastDate)}</>}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Branch</span>
            <select value={branchId} onChange={(e) => chooseBranch(e.target.value)} className={`${input} w-full`}>
              <option value="">Choose the branch…</option>
              {branches
                .filter((b) => b.id !== "br-unassigned")
                .map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Cut-off</span>
            <select value={periodId} onChange={(e) => setPeriodId(e.target.value)} className={`${input} w-full`}>
              {payrollPeriods.map((p) => (
                <option key={p.id} value={p.id}>
                  {formatDate(p.start)} – {formatDate(p.end)}
                </option>
              ))}
            </select>
          </label>
          <div>
            <span className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Schedule (Mon–Sat, no grace period)</span>
            <div className="flex items-center gap-1.5">
              <input type="time" value={schedule.timeIn} onChange={(e) => setSchedule((s) => ({ ...s, timeIn: e.target.value }))} className={`${input} w-full`} aria-label="Time in" />
              <span className="text-[var(--text-muted)]">–</span>
              <input type="time" value={schedule.timeOut} onChange={(e) => setSchedule((s) => ({ ...s, timeOut: e.target.value }))} className={`${input} w-full`} aria-label="Time out" />
            </div>
          </div>
        </div>

        {periodLocked && period && (
          <div className="rounded-lg border border-[var(--status-critical)]/40 p-3 text-xs text-[var(--status-critical)]">
            {formatDate(period.start)} – {formatDate(period.end)} is {period.status} in Payroll Processing, so its attendance can&rsquo;t be replaced. You can still review the figures here; to import them, reopen the cut-off first.
          </div>
        )}

        {period && rows.length > 0 && rows.every((r) => r.noPunches) && (
          <div className="rounded-lg border border-[var(--status-critical)]/40 p-3 text-xs text-[var(--status-critical)]">
            None of the file&rsquo;s punches fall in {formatDate(period.start)} – {formatDate(period.end)}. Choose the cut-off the file is for{coverage.lastDate ? ` (its punches go up to ${formatDate(coverage.lastDate)})` : ""}.
          </div>
        )}

        {(file.unidentified > 0 || (coverage.lastDate && period && coverage.lastDate < period.end) || replacing > 0 || dupes.size > 0) && (
          <div className="space-y-1 rounded-lg border border-[var(--status-warning)]/40 p-3 text-xs text-[var(--text-secondary)]" style={{ background: "color-mix(in srgb, var(--status-warning) 8%, transparent)" }}>
            {coverage.lastDate && period && coverage.lastDate < period.end && (
              <div>
                The file only has punches up to <b>{formatDate(coverage.lastDate)}</b>: the days after it aren&rsquo;t counted (not as absences either). Import the complete file after the cut-off to finish it.
              </div>
            )}
            {file.unidentified > 0 && (
              <div>
                {file.unidentified} block{file.unidentified === 1 ? " has" : "s have"} no name and no ID in the file, so {file.unidentified === 1 ? "it" : "they"} can&rsquo;t be imported — enter {file.unidentified === 1 ? "that person" : "those people"} by hand.
              </div>
            )}
            {replacing > 0 && <div>{replacing} employee{replacing === 1 ? " already has" : "s already have"} attendance for this cut-off — importing replaces it with the biometrics figures.</div>}
            {dupes.size > 0 && <div className="text-[var(--status-critical)]">The same employee is matched to more than one person in the file: {[...dupes].map((id) => (byId.get(id) ? fullName(byId.get(id)!) : id)).join(", ")}.</div>}
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="border-b border-[var(--border-hairline)] text-left text-xs text-[var(--text-muted)]">
                <th className="px-2 py-2 font-medium">In the file</th>
                <th className="px-2 py-2 font-medium">Employee</th>
                <th className="px-2 py-2 font-medium">Days</th>
                <th className="px-2 py-2 font-medium">Late</th>
                <th className="px-2 py-2 font-medium">Undertime</th>
                <th className="px-2 py-2 font-medium">Absent</th>
                <th className="px-2 py-2 font-medium">VL / SL</th>
                <th className="px-2 py-2 font-medium">Missing punches</th>
                <th className="px-2 py-2 font-medium">Import</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.person.key} className={`border-b border-[var(--gridline)] last:border-0 ${r.include ? "" : "opacity-60"}`}>
                  <td className="px-2 py-2 text-[var(--text-primary)]">
                    {r.person.name || <span className="text-[var(--text-muted)] italic">no name</span>}
                    {r.person.deviceId && <span className="ml-1 text-xs text-[var(--text-muted)]">ID {r.person.deviceId}</span>}
                  </td>
                  <td className="px-2 py-2">
                    <select
                      value={r.employeeId}
                      onChange={(e) => setAssigned((a) => ({ ...a, [r.person.key]: e.target.value }))}
                      className={`max-w-[220px] rounded-md border bg-[var(--surface-1)] px-2 py-1 text-xs ${r.employeeId ? "border-[var(--border-hairline)]" : "border-[var(--status-warning)]"}`}
                      aria-label={`Employee for ${r.person.name || r.person.deviceId}`}
                    >
                      <option value="">Choose employee…</option>
                      {pickable.map((e) => (
                        <option key={e.id} value={e.id}>
                          {fullName(e)}
                        </option>
                      ))}
                    </select>
                    {r.saved && !assigned[r.person.key] && <div className="text-[10px] text-[var(--text-muted)]">matched before</div>}
                  </td>
                  {r.noPunches ? (
                    <td colSpan={6} className="px-2 py-2 text-xs text-[var(--text-muted)]">
                      No punches in this cut-off — not imported
                    </td>
                  ) : (
                    <>
                      <td className="tabular px-2 py-2 text-[var(--text-secondary)]">{r.computed.daysWorked}</td>
                      <td className="tabular px-2 py-2 text-[var(--text-secondary)]">{r.computed.lateMinutes ? `${r.computed.lateMinutes}m (${r.computed.lateInstances}×)` : "—"}</td>
                      <td className="tabular px-2 py-2 text-[var(--text-secondary)]">{r.computed.undertimeMinutes ? `${r.computed.undertimeMinutes}m (${r.computed.undertimeInstances}×)` : "—"}</td>
                      <td className="px-2 py-2 text-xs text-[var(--text-secondary)]" title={r.computed.absentDates.map(shortDate).join(", ")}>
                        {r.computed.absenceInstances || "—"}
                      </td>
                      <td className="tabular px-2 py-2 text-xs text-[var(--text-secondary)]">{r.computed.vlDays || r.computed.slDays ? `${r.computed.vlDays} / ${r.computed.slDays}` : "—"}</td>
                      <td className="px-2 py-2 text-xs">
                        {r.computed.missingPunches.length ? (
                          <span className="text-[var(--status-warning)]">
                            {r.computed.missingPunches.map((m) => `${shortDate(m.date)} (no time ${m.missing})`).join(", ")}
                          </span>
                        ) : (
                          <span className="text-[var(--text-muted)]">—</span>
                        )}
                      </td>
                    </>
                  )}
                  <td className="px-2 py-2">
                    <input
                      type="checkbox"
                      checked={r.include}
                      disabled={!r.emp || r.noPunches}
                      onChange={(e) => setSkipped((s) => ({ ...s, [r.person.key]: !e.target.checked }))}
                      aria-label={`Import ${r.person.name || r.person.deviceId}`}
                      className="accent-[var(--series-1)]"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="text-xs text-[var(--text-muted)]">
          First punch = time in, last punch = time out. Late and undertime are counted from the schedule above with no grace period. Missing punches are flagged for you and shown to the employee on their attendance, so they can file an attendance correction. Matches you choose are remembered for this branch.
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          {!scheduleOk && <span className="mr-auto flex items-center gap-1 text-xs text-[var(--status-critical)]"><AlertTriangle size={13} /> Check the schedule.</span>}
          <button onClick={onClose} disabled={busy} className="rounded-lg px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40">
            Cancel
          </button>
          <button onClick={confirm} disabled={!canImport} className="rounded-lg bg-[var(--series-1)] px-3 py-1.5 text-sm font-medium text-[var(--on-accent)] disabled:opacity-40">
            {busy ? "Importing…" : `Import ${included.length} employee${included.length === 1 ? "" : "s"}${missingCount ? ` · ${missingCount} missing punch${missingCount === 1 ? "" : "es"} flagged` : ""}`}
          </button>
        </div>
      </div>
    </Modal>
  );
}
