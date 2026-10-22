"use client";

import { useState } from "react";
import { Gavel, Loader2 } from "lucide-react";
import { useHris } from "@/lib/store";
import { currentCompany } from "@/lib/companies";
import { todayInManila } from "@/lib/leave-policy";
import { loadHrLetterhead } from "@/lib/discipline-notice";
import { excusedDays, monthLabel, NTE_TARDINESS_MIN_DAYS, SANCTION_CHOICES, suggestedPenalty } from "@/lib/nte-tardiness";
import { formatDate } from "@/lib/helpers";
import { buildTardinessSanctionPdf } from "@/lib/nte-tardiness-pdf";
import type { DisciplinaryRecord, TardinessNteData, TardinessSanctionData } from "@/lib/types";

// HR's Notice of Sanction for a tardiness NTE, once the HR Manager and the
// Department Manager have received the employee's explanation: HR fills in
// the sanction (the policy's suggestion first) and findings; the notice is
// issued to the employee to sign as received.

const field = "w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-2 text-sm";
const shiftDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

export function SanctionForm({ nte, onIssued }: { nte: DisciplinaryRecord; onIssued: (id: string) => void }) {
  const { currentEmployee, addDisciplinaryRecord, attachDisciplinaryNotice, setDisciplinaryStatus } = useHris();
  const d = nte.noticeData as TardinessNteData;
  const today = todayInManila();
  const [offense, setOffense] = useState(d.offense ?? 1);
  // Late days HR accepted to excuse don't count.
  const excused = excusedDays(nte);
  const remaining = d.days.length - new Set(excused.map((x) => x.date)).size;
  const suggested = suggestedPenalty(remaining, offense);
  const [choice, setChoice] = useState(suggested || SANCTION_CHOICES[0]);
  const [other, setOther] = useState("");
  const sanction = choice === "other" ? other.trim() : choice;
  const days = /^(\d+)\s*days?\s*suspension/i.exec(sanction)?.[1];
  const [from, setFrom] = useState(shiftDays(today, 1));
  const [to, setTo] = useState("");
  const suspTo = to || (days ? shiftDays(from, Number(days) - 1) : "");
  const [findings, setFindings] = useState(
    "After evaluating your explanation, the Company finds that it does not sufficiently justify your repeated tardiness, which affects work operations and violates the Company Policy on attendance and punctuality.",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const suspension = /suspension/i.test(sanction);

  async function issue() {
    if (!currentEmployee || !sanction) return;
    if (suspension && (!from || !suspTo || suspTo < from)) {
      setError("Enter the suspension's first and last day.");
      return;
    }
    setBusy(true);
    setError(null);
    const company = currentCompany();
    const data: TardinessSanctionData = {
      kind: "sanction",
      nteId: nte.id,
      month: d.month,
      issueDate: today,
      employeeName: d.employeeName,
      cc: d.cc,
      nteDate: nte.date,
      explanationDate: nte.explanationSubmittedAt ? nte.explanationSubmittedAt.slice(0, 10) : null,
      daysLate: d.days.length,
      offense,
      sanction,
      ...(excused.length ? { excused } : {}),
      suspensionFrom: suspension ? from : null,
      suspensionTo: suspension ? suspTo : null,
      findings: findings.trim(),
    };
    const saved = await addDisciplinaryRecord({
      employeeId: nte.employeeId,
      type: "nod",
      description: `Notice of Sanction - Habitual Tardiness (${monthLabel(d.month)}): ${sanction}${suspension ? ` from ${from} to ${suspTo}` : ""}.`,
      issuedBy: currentEmployee.id,
      date: today,
      status: "open",
      attachmentName: null,
      requiresExplanation: false,
      responseDue: null,
      noticeData: data,
    });
    if (!saved) {
      setBusy(false);
      return;
    }
    try {
      const bytes = await buildTardinessSanctionPdf({
        companyName: company.name,
        companyShort: company.shortName,
        companyAddress: company.info.address,
        companyContact: [company.info.phone, company.info.email].filter(Boolean).join(" · "),
        letterhead: await loadHrLetterhead(),
        ...data,
      });
      const err = await attachDisciplinaryNotice(saved.id, new File([bytes as BlobPart], `Notice of Sanction - ${d.employeeName}.pdf`, { type: "application/pdf" }));
      if (err) setError(`The Notice of Sanction was issued, but its PDF couldn't be attached: ${err}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't make the PDF.");
    }
    setDisciplinaryStatus(nte.id, "resolved");
    setBusy(false);
    onIssued(saved.id);
  }

  return (
    <div className="space-y-3">
      {excused.length > 0 && (
        <div className="rounded-lg bg-[var(--gridline)]/30 p-3 text-xs text-[var(--text-secondary)]">
          <span className="font-medium text-[var(--text-primary)]">
            {excused.length} late day{excused.length === 1 ? "" : "s"} excused — {remaining} of {d.days.length} count.
          </span>{" "}
          {excused.map((x) => `${formatDate(x.date)} (${x.reason})`).join("; ")}
          {remaining < NTE_TARDINESS_MIN_DAYS && (
            <div className="mt-1 text-[var(--status-warning)]">
              That&rsquo;s below {NTE_TARDINESS_MIN_DAYS} days. You may close this NTE with &ldquo;Mark resolved&rdquo; instead of issuing a sanction.
            </div>
          )}
        </div>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Offense</span>
          <select value={offense} onChange={(e) => setOffense(Number(e.target.value))} className={field}>
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {["1st", "2nd", "3rd", "4th", "5th"][n - 1]} offense
              </option>
            ))}
          </select>
        </label>
        <label className="block sm:col-span-2">
          <span className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">
            Sanction {suggested && <span className="font-normal text-[var(--text-muted)]">— policy: {suggested} ({remaining} days late)</span>}
          </span>
          <select value={choice} onChange={(e) => setChoice(e.target.value)} className={field}>
            {SANCTION_CHOICES.map((s) => (
              <option key={s} value={s}>
                {s}
                {s === suggested ? " (policy)" : ""}
              </option>
            ))}
            <option value="other">Other…</option>
          </select>
        </label>
      </div>
      {choice === "other" && <input value={other} onChange={(e) => setOther(e.target.value)} placeholder="The sanction, e.g. 2 days suspension" className={field} aria-label="Other sanction" />}
      {suspension && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Suspension from</span>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={field} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Suspension to (last day)</span>
            <input type="date" value={suspTo} min={from} onChange={(e) => setTo(e.target.value)} className={field} />
          </label>
        </div>
      )}
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Findings (printed in the notice)</span>
        <textarea value={findings} onChange={(e) => setFindings(e.target.value)} rows={4} className={field} />
      </label>
      {error && <div className="text-sm text-[var(--status-critical)]">{error}</div>}
      <button
        onClick={issue}
        disabled={busy || !sanction || !findings.trim()}
        className="flex items-center gap-1.5 rounded-lg bg-[var(--series-1)] px-3 py-2 text-sm font-medium text-[var(--on-accent)] disabled:opacity-40"
      >
        {busy ? <Loader2 size={15} className="animate-spin" /> : <Gavel size={15} />} Issue Notice of Sanction
      </button>
      <div className="text-xs text-[var(--text-muted)]">The employee receives it in My Notices and signs as received. This NTE is then marked resolved.</div>
    </div>
  );
}
