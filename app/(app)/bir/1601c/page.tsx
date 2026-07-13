"use client";

import { useMemo, useState } from "react";
import { FileCheck2, Printer } from "lucide-react";
import { useHris } from "@/lib/store";
import { PageHeader } from "@/components/PageHeader";
import { StatTile } from "@/components/StatTile";
import { Modal } from "@/components/Modal";
import { EmptyState } from "@/components/EmptyState";
import { Form1601CDocument } from "@/components/bir/Form1601C";
import { buildForm1601C, COMPANY_INFO, type Form1601CData } from "@/lib/bir";
import { getMonthlyFacts, getMonthsList, CURRENT_MONTH_KEY } from "@/lib/monthly-analytics";
import { formatCurrencyCompact, formatDate } from "@/lib/helpers";

export default function Form1601CPage() {
  const { employees, generatedBirForms, addGeneratedBirForm, currentUser } = useHris();
  const months = getMonthsList();
  const facts = useMemo(() => getMonthlyFacts(employees), [employees]);

  const [monthKey, setMonthKey] = useState(CURRENT_MONTH_KEY);
  const [preview, setPreview] = useState<Form1601CData | null>(null);

  const canManage = currentUser?.roles.some((r) => ["hr_admin", "payroll_officer", "cfo", "upper_management"].includes(r));

  const current = buildForm1601C(facts, employees, monthKey);
  const history = generatedBirForms.filter((f) => f.formType === "1601c");

  function view() {
    setPreview(current);
  }

  function generate() {
    addGeneratedBirForm({
      formType: "1601c",
      period: monthKey,
      employeeId: null,
      summary: {
        employeeCount: current.employeeCount,
        totalCompensationPaid: current.totalCompensationPaid,
        totalTaxWithheld: current.totalTaxWithheld,
        totalAmountToRemit: current.totalAmountToRemit,
      },
    });
    setPreview(current);
  }

  function viewHistorical(entry: (typeof history)[number]) {
    const month = months.find((m) => m.key === entry.period);
    setPreview({
      monthKey: entry.period,
      monthLabel: month?.label ?? entry.period,
      employeeCount: entry.summary.employeeCount,
      totalCompensationPaid: entry.summary.totalCompensationPaid,
      totalTaxWithheld: entry.summary.totalTaxWithheld,
      totalAmountToRemit: entry.summary.totalAmountToRemit,
    });
  }

  return (
    <div>
      <PageHeader
        title="BIR Form 1601-C"
        subtitle="Monthly Remittance Return of Income Taxes Withheld on Compensation — auto-populated from finalized payroll records."
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select value={monthKey} onChange={(e) => setMonthKey(e.target.value)} className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-2 text-sm">
          {months.map((m) => (
            <option key={m.key} value={m.key}>{m.label}</option>
          ))}
        </select>
        <button onClick={view} className="rounded-lg border border-[var(--border-hairline)] px-3 py-2 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40">
          View Form
        </button>
        {canManage && (
          <button onClick={generate} className="flex items-center gap-1.5 rounded-lg bg-[var(--series-1)] px-3 py-2 text-sm font-medium text-[var(--on-accent)]">
            <FileCheck2 size={16} /> Generate Form
          </button>
        )}
      </div>

      <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-1)] p-4">
        <div className="mb-3 text-sm font-medium text-[var(--text-primary)]">Employer information</div>
        <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
          <Row label="Company name" value={COMPANY_INFO.name} />
          <Row label="Company TIN" value={COMPANY_INFO.tin} />
          <Row label="Registered address" value={COMPANY_INFO.address} />
          <Row label="RDO code" value={COMPANY_INFO.rdoCode} />
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Tax period" value={current.monthLabel} />
        <StatTile label="Employees covered" value={current.employeeCount.toString()} />
        <StatTile label="Total compensation paid" value={formatCurrencyCompact(current.totalCompensationPaid)} />
        <StatTile label="Total tax withheld" value={formatCurrencyCompact(current.totalTaxWithheld)} />
      </div>
      <div className="mt-3 rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-1)] p-4">
        <StatTile label="Total amount to be remitted" value={formatCurrencyCompact(current.totalAmountToRemit)} />
      </div>

      <div className="mt-6 rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-1)] p-4">
        <div className="mb-3 text-sm font-medium text-[var(--text-primary)]">Previously generated</div>
        {history.length === 0 ? (
          <EmptyState icon={FileCheck2} title="No forms generated yet" description="Use Generate Form to create the first monthly remittance return and log it here." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-[var(--border-hairline)] text-left text-xs text-[var(--text-muted)]">
                  <th className="px-3 py-2 font-medium">Period</th>
                  <th className="px-3 py-2 font-medium">Total remitted</th>
                  <th className="px-3 py-2 font-medium">Generated by</th>
                  <th className="px-3 py-2 font-medium">Generated on</th>
                  <th className="px-3 py-2 font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {history.map((entry) => (
                  <tr key={entry.id} className="border-b border-[var(--gridline)] last:border-0">
                    <td className="px-3 py-2 text-[var(--text-primary)]">{months.find((m) => m.key === entry.period)?.label ?? entry.period}</td>
                    <td className="tabular px-3 py-2 text-[var(--text-secondary)]">{formatCurrencyCompact(entry.summary.totalAmountToRemit)}</td>
                    <td className="px-3 py-2 text-[var(--text-secondary)]">{entry.generatedBy}</td>
                    <td className="tabular px-3 py-2 text-[var(--text-secondary)]">{formatDate(entry.generatedAt)}</td>
                    <td className="px-3 py-2">
                      <button onClick={() => viewHistorical(entry)} className="rounded-lg border border-[var(--border-hairline)] px-2.5 py-1 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40">
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal open={!!preview} onClose={() => setPreview(null)} title="BIR Form 1601-C preview" wide>
        {preview && (
          <div>
            <div className="mb-3 flex justify-end gap-2 print:hidden">
              <button onClick={() => window.print()} className="flex items-center gap-1.5 rounded-lg border border-[var(--border-hairline)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40">
                <Printer size={14} /> Print / Download PDF
              </button>
            </div>
            <Form1601CDocument data={preview} />
          </div>
        )}
      </Modal>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg bg-[var(--gridline)]/20 px-3 py-2">
      <span className="text-[var(--text-muted)]">{label}</span>
      <span className="text-right text-[var(--text-secondary)]">{value}</span>
    </div>
  );
}
