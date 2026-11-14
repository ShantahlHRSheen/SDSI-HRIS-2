"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Eye, Loader2, Plus, RefreshCw, Save, Send, Signature, Trash2, Undo2 } from "lucide-react";
import { useHris } from "@/lib/store";
import { Modal } from "@/components/Modal";
import { Badge } from "@/components/Badge";
import { FileViewer, type ViewerFile } from "@/components/FileViewer";
import { MySignature } from "@/components/leave/LeaveApplication";
import { currentCompany } from "@/lib/companies";
import { fullName, positionTitle } from "@/lib/helpers";
import { mySignatureUrl } from "@/lib/supabase/leave-forms";
import { sssMonthlySalaryCredit } from "@/lib/statutory";
import { buildMaternityPdf } from "@/lib/maternity-pdf";
import {
  computeMb,
  contingencyWindow,
  contributionLines,
  createMaternityBenefit,
  fetchMaternityBenefits,
  latestLoans,
  longDate,
  MB_KINDS,
  mbSignatures,
  mbSignedAt,
  mbStatusLabel,
  monthLabel,
  pesosInWords,
  returnMaternityBenefit,
  saveMaternityBenefit,
  sendMaternityBenefit,
  signMaternityBenefit,
  type MaternityBenefit,
  type MbData,
  type MbLine,
  type MbSignerIds,
  type MbStep,
} from "@/lib/maternity";

export const input = "w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-2 text-sm";
const lbl = "mb-1 block text-xs font-medium text-[var(--text-secondary)]";
export const primary = "flex items-center gap-1.5 rounded-lg bg-[var(--series-1)] px-3 py-2 text-sm font-medium text-[var(--on-accent)] disabled:opacity-40";
export const secondary = "flex items-center gap-1.5 rounded-lg border border-[var(--border-hairline)] px-3 py-2 text-sm text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40 disabled:opacity-40";
export const peso = (n: number) => `₱${(Number(n) || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const STEP_LABEL: Record<Exclude<MbStep, "hr">, string> = {
  check: "Checked by",
  approve1: "Approved by",
  approve2: "Approved by",
  release: "Released by",
  receive: "Received by",
};

export function useMaternityBenefits() {
  const { isRealAccount } = useHris();
  const [items, setItems] = useState<MaternityBenefit[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(() => {
    if (!isRealAccount) return;
    fetchMaternityBenefits().then(
      (t) => (setItems(t), setError(null)),
      (e: Error) => setError(e.message),
    );
  }, [isRealAccount]);
  useEffect(() => reload(), [reload]);
  return { items, error, reload };
}

export function MbStatusBadge({ item }: { item: MaternityBenefit }) {
  const s = mbStatusLabel(item);
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

const withInitial = (e: { firstName: string; middleName?: string; lastName: string }) => `${e.firstName}${e.middleName?.trim() ? ` ${e.middleName.trim().charAt(0)}.` : ""} ${e.lastName}`;
const fileName = (d: MbData) => `SSS Maternity Benefit Voucher - ${d.employeeName}.pdf`;
async function pdfUrl(data: MbData, signatures: Partial<Record<MbStep, Uint8Array>>, signedAt: Partial<Record<MbStep, string | null>>) {
  const bytes = await buildMaternityPdf({ data, signatures, signedAt, companyName: currentCompany().name });
  return URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
}

// ---- The computation, on screen --------------------------------------------------------

function CRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between gap-3 px-3 py-1 text-sm ${strong ? "bg-[var(--gridline)]/30 font-semibold text-[var(--text-primary)]" : "text-[var(--text-secondary)]"}`}>
      <span>{label}</span>
      <span className="shrink-0 tabular-nums">{value}</span>
    </div>
  );
}
function CHead({ t }: { t: string }) {
  return <div className="bg-[#38761d] px-3 py-1 text-center text-xs font-semibold tracking-wide text-white uppercase">{t}</div>;
}

export function ComputationView({ data }: { data: MbData }) {
  const c = computeMb(data);
  const win = contingencyWindow(data.deliveryDate);
  return (
    <div className="overflow-hidden rounded-lg border border-[var(--border-hairline)]">
      <CHead t={`Total benefit / full pay (${c.days} days)`} />
      {data.payBasis === "daily" && <CRow label={`Daily rate × ${data.workingDays} working days`} value={peso(c.monthlyBasic)} />}
      <CRow label={`Monthly basic × ${Math.round(c.monthsOfLeave * 100) / 100} months`} value={peso(c.fullPay)} strong />
      <CHead t="SSS maternity benefit" />
      {win && <CRow label="Semester of contingency" value={`${monthLabel(win.semester[0])} – ${monthLabel(win.semester[1])}`} />}
      <CRow label="6 highest monthly salary credits" value={peso(c.totalMsc)} />
      <CRow label="Average daily salary credit (÷ 180)" value={peso(c.adsc)} />
      <CRow label={`SSS benefit (× ${c.days} days)`} value={peso(c.sssBenefit)} strong />
      <CHead t="Differential" />
      <CRow label="Full pay − SSS benefit" value={peso(c.differentialRaw)} />
      <CRow label={c.differentialRaw > 0 ? "Salary differential (employer)" : "Salary differential (none — SSS benefit is higher)"} value={peso(c.differential)} strong />
      <CHead t="Total to be received by the employee" />
      <CRow label="Total benefit" value={peso(c.totalBenefit)} />
      <CRow label="Less contributions and loans" value={`(${peso(c.totalDeductions)})`} />
      <div className="flex justify-between bg-[var(--status-good)]/20 px-3 py-2 text-base font-bold text-[var(--text-primary)]">
        <span>Net amount</span>
        <span className="tabular-nums">{peso(c.net)}</span>
      </div>
      <div className="px-3 py-1.5 text-[11px] font-semibold tracking-wide text-[var(--text-secondary)] uppercase">{pesosInWords(c.net)}</div>
      {!c.eligible && (
        <div className="flex items-center gap-1.5 border-t border-[var(--border-hairline)] px-3 py-2 text-xs text-[var(--status-critical)]">
          <AlertTriangle size={14} /> Fewer than 3 monthly contributions in the 12-month period — check her eligibility with SSS.
        </div>
      )}
    </div>
  );
}

// ---- HR: prepare / edit, sign and send ----------------------------------------------

type Ids = MbSignerIds;

export function PrepareMbModal({ item, onClose, onChanged }: { item: MaternityBenefit | null; onClose: () => void; onChanged: () => void }) {
  const { employees, currentEmployee } = useHris();
  const cfg = currentCompany().maternitySigners;
  const people = useMemo(() => employees.filter((e) => e.status === "active" || e.status === "on_leave").sort((a, b) => fullName(a).localeCompare(fullName(b))), [employees]);
  const women = people.filter((e) => e.gender === "Female");
  const [employeeId, setEmployeeId] = useState(item?.employeeId ?? "");
  const [ids, setIds] = useState<Ids>({
    check: item?.checkId ?? cfg?.check.id ?? "",
    approve1: item?.approve1Id ?? cfg?.approve1.id ?? "",
    approve2: item?.approve2Id ?? cfg?.approve2.id ?? "",
    release: item?.releaseId ?? cfg?.release.id ?? "",
  });
  const [data, setData] = useState<MbData | null>(item?.data ?? null);
  const [hasSignature, setHasSignature] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [viewer, setViewer] = useState<ViewerFile | null>(null);
  const nameOf = (id: string) => {
    const e = employees.find((x) => x.id === id);
    return e ? withInitial(e) : "";
  };
  const emp = employees.find((e) => e.id === employeeId);
  // The basis of mandatories, as payroll computes it.
  const basis = (d: MbData) => (d.payBasis === "monthly" ? d.monthlySalary : (d.dailyRate * 313) / 12);
  const set = <K extends keyof MbData>(k: K, v: MbData[K]) => setData((d) => (d ? { ...d, [k]: v } : d));

  // The 12 months for a delivery date, keeping any MSC already entered.
  function monthsFor(d: MbData, deliveryDate: string): MbData["months"] {
    const win = contingencyWindow(deliveryDate);
    if (!win) return d.months;
    const msc = sssMonthlySalaryCredit(basis(d));
    // Months before she joined start at 0 (no contribution through us).
    const hired = emp?.dateHired?.slice(0, 7) ?? "";
    return win.months.map((m) => ({ month: m, msc: d.months.find((x) => x.month === m)?.msc ?? (hired && m < hired ? 0 : msc) }));
  }

  async function pickEmployee(id: string) {
    setEmployeeId(id);
    const e = employees.find((x) => x.id === id);
    if (!e) return setData(null);
    const signer = (k: keyof Ids) => ({ name: nameOf(ids[k]), title: cfg?.[k].title ?? "" });
    const base: MbData = {
      employeeName: [e.firstName, e.lastName].join(" "),
      position: positionTitle(e.positionId).replace(/^—$/, ""),
      description: "Maternity Benefit",
      kind: "live_birth",
      deliveryDate: "",
      payBasis: e.payrollType === "monthly" ? "monthly" : "daily",
      dailyRate: e.dailyRate ?? 0,
      workingDays: 26,
      monthlySalary: e.monthlySalary ?? 0,
      months: [],
      deductions: [],
      netAmount: 0,
      signers: {
        hr: { name: currentEmployee ? withInitial(currentEmployee) : "", title: "HR Manager" },
        check: signer("check"),
        approve1: signer("approve1"),
        approve2: signer("approve2"),
        release: signer("release"),
        receive: { name: "", title: "" },
      },
    };
    const loans = await latestLoans(id);
    const n = 3.5;
    const lines: MbLine[] = [...contributionLines(basis(base), n)];
    lines.splice(1, 0, { label: `SSS Loan Payment for ${n} months`, amount: Math.round(loans.sssLoan * n * 100) / 100 });
    lines.push({ label: `HDMF Loan Payment for ${n} months`, amount: Math.round(loans.hdmfLoan * n * 100) / 100 });
    setData({ ...base, deductions: lines });
  }

  // Recompute the contributions for the leave's length and the current rate.
  function refreshContributions() {
    if (!data) return;
    const c = computeMb(data);
    const fresh = contributionLines(basis(data), c.monthsOfLeave);
    const isContribution = (l: MbLine) => /^(SSS|PhilHealth|HDMF) Contribution/.test(l.label);
    const others = data.deductions.filter((l) => !isContribution(l)).map((l) => ({ ...l, label: l.label.replace(/for [\d.]+ months?/, `for ${c.monthsOfLeave} months`) }));
    set("deductions", [fresh[0], ...others.filter((l) => /^SSS/.test(l.label)), fresh[1], fresh[2], ...others.filter((l) => !/^SSS/.test(l.label))]);
  }

  const pickSigner = (k: keyof Ids, id: string) => {
    setIds((cur) => ({ ...cur, [k]: id }));
    setData((d) => (d ? { ...d, signers: { ...d.signers, [k]: { ...d.signers[k], name: nameOf(id) } } } : d));
  };
  const c = data ? computeMb(data) : null;
  const ready = !!data && !!employeeId && Object.values(ids).every(Boolean) && !!data.deliveryDate && data.months.length === 12 && (c?.monthlyBasic ?? 0) > 0;

  async function save(send: boolean) {
    if (!data || !currentEmployee) return;
    setBusy(send ? "send" : "save");
    setError(null);
    try {
      let id = item?.id;
      if (id) await saveMaternityBenefit(id, ids, data);
      else id = await createMaternityBenefit(employeeId, ids, data);
      if (send) await sendMaternityBenefit(id, currentEmployee.id);
      onChanged();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save.");
    } finally {
      setBusy(null);
    }
  }

  async function preview() {
    if (!data || !currentEmployee) return;
    setBusy("preview");
    try {
      const url = await mySignatureUrl(currentEmployee.id);
      const sig = url ? new Uint8Array(await (await fetch(url)).arrayBuffer()) : null;
      setViewer({ url: await pdfUrl(data, sig ? { hr: sig } : {}, {}), name: fileName(data), kind: "pdf" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't make the preview.");
    } finally {
      setBusy(null);
    }
  }

  const signerRow = (k: keyof Ids, label: string) =>
    data && (
      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <label className={lbl}>{label}</label>
          <select value={ids[k]} onChange={(e) => pickSigner(k, e.target.value)} className={input}>
            <option value="">Choose…</option>
            {people
              .filter((e) => e.id !== employeeId)
              .map((e) => (
                <option key={e.id} value={e.id}>
                  {fullName(e)} — {positionTitle(e.positionId)}
                </option>
              ))}
          </select>
        </div>
        <Field label="Title on the voucher" value={data.signers[k].title} onChange={(v) => set("signers", { ...data.signers, [k]: { ...data.signers[k], title: v } })} />
      </div>
    );

  return (
    <Modal open wide onClose={() => !busy && onClose()} title={item ? `Maternity benefit — ${item.employeeName}` : "New maternity benefit voucher"}>
      <div className="space-y-4 text-sm">
        {item?.returnedNote && (
          <div className="rounded-lg border border-[var(--status-critical)]/40 px-3 py-2 text-xs text-[var(--text-secondary)]">
            <b className="text-[var(--text-primary)]">Returned by {item.returnedBy}:</b> {item.returnedNote}
          </div>
        )}
        {!item && (
          <div>
            <label className={lbl}>Employee</label>
            <select value={employeeId} onChange={(e) => pickEmployee(e.target.value)} className={input}>
              <option value="">Choose…</option>
              {(women.length ? women : people).map((e) => (
                <option key={e.id} value={e.id}>
                  {fullName(e)} — {positionTitle(e.positionId)}
                </option>
              ))}
            </select>
          </div>
        )}
        {data && c && (
          <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Name" value={data.employeeName} onChange={(v) => set("employeeName", v)} />
                <Field label="Position" value={data.position} onChange={(v) => set("position", v)} />
                <div>
                  <label className={lbl}>Type</label>
                  <select value={data.kind} onChange={(e) => set("kind", e.target.value as MbData["kind"])} className={input}>
                    {MB_KINDS.map((k) => (
                      <option key={k.value} value={k.value}>
                        {k.label}
                      </option>
                    ))}
                  </select>
                </div>
                <Field
                  label={data.kind === "miscarriage" ? "Date of miscarriage / termination" : "Date of delivery (or expected)"}
                  type="date"
                  value={data.deliveryDate}
                  onChange={(v) => setData((d) => (d ? { ...d, deliveryDate: v, months: monthsFor(d, v) } : d))}
                />
              </div>

              <div>
                <div className="mb-1 text-xs font-semibold tracking-wide text-[var(--text-muted)] uppercase">Full pay (basic pay only)</div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <label className={lbl}>Paid</label>
                    <select value={data.payBasis} onChange={(e) => set("payBasis", e.target.value as MbData["payBasis"])} className={input}>
                      <option value="daily">Daily</option>
                      <option value="monthly">Monthly</option>
                    </select>
                  </div>
                  {data.payBasis === "daily" ? (
                    <>
                      <Field label="Daily rate (₱)" type="number" value={String(data.dailyRate || "")} onChange={(v) => set("dailyRate", Number(v) || 0)} />
                      <Field label="Working days a month" type="number" value={String(data.workingDays || "")} onChange={(v) => set("workingDays", Number(v) || 0)} />
                    </>
                  ) : (
                    <Field label="Monthly salary (₱)" type="number" value={String(data.monthlySalary || "")} onChange={(v) => set("monthlySalary", Number(v) || 0)} />
                  )}
                </div>
              </div>

              <div>
                <div className="mb-1 text-xs font-semibold tracking-wide text-[var(--text-muted)] uppercase">SSS monthly salary credits — 12 months before the semester</div>
                {data.months.length ? (
                  <>
                    <p className="mb-2 text-xs text-[var(--text-muted)]">
                      Filled in from her current rate (0 before she joined). Check each month against her SSS contribution record (My.SSS): contributions from a previous employer or voluntary payments count too. Put 0 for a month with no contribution. The 6 highest are counted.
                    </p>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {data.months.map((m, i) => (
                        <label key={m.month} className="text-xs text-[var(--text-secondary)]">
                          {monthLabel(m.month)}
                          <input
                            type="number"
                            value={m.msc === 0 ? "0" : m.msc || ""}
                            onChange={(e) => set("months", data.months.map((x, j) => (j === i ? { ...x, msc: Number(e.target.value) || 0 } : x)))}
                            className={`${input} mt-0.5 text-right`}
                          />
                        </label>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="text-xs text-[var(--text-muted)]">Enter the date of delivery to list the months.</p>
                )}
              </div>

              <div>
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold tracking-wide text-[var(--text-muted)] uppercase">Less: contributions and loans</span>
                  <button onClick={refreshContributions} className={`${secondary} px-2 py-1 text-xs`} title="Recompute SSS, PhilHealth and HDMF for the leave's length at payroll rates">
                    <RefreshCw size={12} /> Recompute contributions
                  </button>
                </div>
                <div className="space-y-1.5">
                  {data.deductions.map((l, i) => (
                    <div key={i} className="flex gap-2">
                      <input value={l.label} onChange={(e) => set("deductions", data.deductions.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} className={input} />
                      <input
                        type="number"
                        step="0.01"
                        value={l.amount || ""}
                        onChange={(e) => set("deductions", data.deductions.map((x, j) => (j === i ? { ...x, amount: Number(e.target.value) || 0 } : x)))}
                        className={`${input} w-32 text-right`}
                      />
                      <button onClick={() => set("deductions", data.deductions.filter((_, j) => j !== i))} className="rounded p-2 text-[var(--text-muted)] hover:text-[var(--status-critical)]" aria-label="Remove">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
                <button onClick={() => set("deductions", [...data.deductions, { label: "", amount: 0 }])} disabled={data.deductions.length >= 12} className={`${secondary} mt-2 text-xs`}>
                  <Plus size={13} /> Add a deduction
                </button>
              </div>

              <div className="space-y-3">
                <div className="text-xs font-semibold tracking-wide text-[var(--text-muted)] uppercase">Signatories</div>
                {signerRow("check", "Checked by")}
                {signerRow("approve1", "Approved by")}
                {signerRow("approve2", "Approved by")}
                {signerRow("release", "Released by")}
                <div className="grid gap-2 sm:grid-cols-2">
                  <Field label="Prepared by (you)" value={data.signers.hr.name} onChange={(v) => set("signers", { ...data.signers, hr: { ...data.signers.hr, name: v } })} />
                  <Field label="Your title" value={data.signers.hr.title} onChange={(v) => set("signers", { ...data.signers, hr: { ...data.signers.hr, title: v } })} />
                </div>
              </div>
            </div>
            <div className="space-y-3 lg:sticky lg:top-0 lg:self-start">
              <ComputationView data={data} />
              <MySignature onChange={setHasSignature} />
              <p className="text-xs text-[var(--text-muted)]">
                Sending signs it as Prepared by. It then goes to {nameOf(ids.check) || "Checked by"}, {nameOf(ids.approve1) || "Approved by"}, {nameOf(ids.approve2) || "Approved by"}, {nameOf(ids.release) || "Released by"}, then {data.employeeName} receives it.
              </p>
            </div>
          </div>
        )}
        {error && <div className="text-xs text-[var(--status-critical)]">{error}</div>}
        <div className="flex flex-wrap justify-end gap-2">
          <button onClick={preview} disabled={!!busy || !data} className={`${secondary} mr-auto`}>
            {busy === "preview" ? <Loader2 size={15} className="animate-spin" /> : <Eye size={15} />} Preview
          </button>
          <button onClick={() => save(false)} disabled={!!busy || !ready} className={secondary}>
            {busy === "save" ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Save draft
          </button>
          <button onClick={() => save(true)} disabled={!!busy || !ready || !hasSignature} className={primary}>
            {busy === "send" ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} Sign &amp; send
          </button>
        </div>
      </div>
      {viewer && <FileViewer file={viewer} onClose={() => (URL.revokeObjectURL(viewer.url), setViewer(null))} />}
    </Modal>
  );
}

function Field({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <div>
      <label className={lbl}>{label}</label>
      <input type={type} step={type === "number" ? "0.01" : undefined} value={value} onChange={(e) => onChange(e.target.value)} className={input} />
    </div>
  );
}

// ---- Checked / Approved / Released / Received -----------------------------------------

export function SignMbModal({ item, step, onClose, onChanged }: { item: MaternityBenefit; step: Exclude<MbStep, "hr">; onClose: () => void; onChanged: () => void }) {
  const { currentEmployee } = useHris();
  const [hasSignature, setHasSignature] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [returning, setReturning] = useState(false);
  const [note, setNote] = useState("");
  const me = currentEmployee?.id ?? "";
  const employee = step === "receive";

  async function run(kind: string, fn: () => Promise<void>) {
    setBusy(kind);
    setError(null);
    try {
      await fn();
      onChanged();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't submit.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Modal open wide onClose={() => !busy && onClose()} title={employee ? "Your SSS maternity benefit" : `${STEP_LABEL[step]} — maternity benefit of ${item.employeeName}`}>
      <div className="space-y-4 text-sm">
        <p className="text-[var(--text-secondary)]">
          {employee
            ? "Your maternity benefit has been released. Please check the computation and sign Received by."
            : `HR (${item.hrName ?? "—"}) prepared this voucher. Check the computation and sign as ${STEP_LABEL[step]}${step !== "release" ? ", or return it to HR with what needs changing" : ""}.`}
        </p>
        <ComputationView data={item.data} />
        <div className="flex justify-end">
          <ViewMbButton item={item} />
        </div>
        <MySignature onChange={setHasSignature} />
        {error && <div className="text-xs text-[var(--status-critical)]">{error}</div>}
        {returning ? (
          <div className="space-y-2">
            <label className={lbl}>What needs changing?</label>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={1000} className={input} />
            <div className="flex justify-end gap-2">
              <button onClick={() => setReturning(false)} disabled={!!busy} className={secondary}>
                Back
              </button>
              <button onClick={() => run("return", () => returnMaternityBenefit(item.id, note))} disabled={!!busy || !note.trim()} className={primary}>
                {busy === "return" ? <Loader2 size={15} className="animate-spin" /> : <Undo2 size={15} />} Return to HR
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap justify-end gap-2">
            {!employee && (
              <button onClick={() => setReturning(true)} disabled={!!busy} className={secondary}>
                <Undo2 size={15} /> Return to HR
              </button>
            )}
            <button onClick={() => run("sign", () => signMaternityBenefit(item.id, me, step))} disabled={!!busy || !hasSignature} className={primary}>
              {busy === "sign" ? <Loader2 size={15} className="animate-spin" /> : <Signature size={15} />} Sign as {STEP_LABEL[step]}
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}

// ---- Viewing / printing ---------------------------------------------------------------

export function ViewMbButton({ item }: { item: MaternityBenefit }) {
  const [viewer, setViewer] = useState<ViewerFile | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function open() {
    setBusy(true);
    setError(null);
    try {
      setViewer({ url: await pdfUrl(item.data, await mbSignatures(item), mbSignedAt(item)), name: fileName(item.data), kind: "pdf" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't open it.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <button onClick={open} disabled={busy} className="flex items-center gap-1 rounded-lg border border-[var(--border-hairline)] px-2 py-1 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40 disabled:opacity-50">
        {busy ? <Loader2 size={12} className="animate-spin" /> : <Eye size={12} />} View / print
      </button>
      {error && <div className="text-[11px] text-[var(--status-critical)]">{error}</div>}
      {viewer && <FileViewer file={viewer} onClose={() => (URL.revokeObjectURL(viewer.url), setViewer(null))} />}
    </>
  );
}

export { longDate };
