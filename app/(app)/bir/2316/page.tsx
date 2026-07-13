"use client";

import { useMemo, useState } from "react";
import { FileCheck2, Layers, Printer } from "lucide-react";
import { useHris } from "@/lib/store";
import { PageHeader } from "@/components/PageHeader";
import { Modal } from "@/components/Modal";
import { EmptyState } from "@/components/EmptyState";
import { Form2316Document } from "@/components/bir/Form2316";
import { buildForm2316, getAvailableTaxYears, type Form2316Data } from "@/lib/bir";
import { getMonthlyFacts } from "@/lib/monthly-analytics";
import { branchName, departmentName, formatCurrencyCompact, formatDate, fullName } from "@/lib/helpers";
import type { Employee } from "@/lib/types";

export default function Form2316Page() {
  const { currentUser, currentEmployee, employees, branches, departments, generatedBirForms, addGeneratedBirForm } = useHris();
  const years = getAvailableTaxYears();
  const [taxYear, setTaxYear] = useState(years[0]);
  const [preview, setPreview] = useState<Form2316Data | null>(null);

  const facts = useMemo(() => getMonthlyFacts(employees), [employees]);

  const isAdmin = currentUser?.roles.some((r) => ["hr_admin", "cfo", "payroll_officer", "upper_management"].includes(r));

  if (!isAdmin) {
    return <SelfServiceView employee={currentEmployee} facts={facts} employees={employees} taxYear={taxYear} years={years} setTaxYear={setTaxYear} preview={preview} setPreview={setPreview} history={generatedBirForms.filter((f) => f.formType === "2316" && f.employeeId === currentEmployee?.id)} />;
  }

  return (
    <AdminView
      employees={employees}
      branches={branches}
      departments={departments}
      facts={facts}
      taxYear={taxYear}
      years={years}
      setTaxYear={setTaxYear}
      preview={preview}
      setPreview={setPreview}
      history={generatedBirForms.filter((f) => f.formType === "2316")}
      addGeneratedBirForm={addGeneratedBirForm}
    />
  );
}

function PreviewModal({ preview, onClose }: { preview: Form2316Data | null; onClose: () => void }) {
  return (
    <Modal open={!!preview} onClose={onClose} title="BIR Form 2316 preview" wide>
      {preview && (
        <div>
          <div className="mb-3 flex justify-end gap-2 print:hidden">
            <button onClick={() => window.print()} className="flex items-center gap-1.5 rounded-lg border border-[var(--border-hairline)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40">
              <Printer size={14} /> Print / Download PDF
            </button>
          </div>
          <Form2316Document data={preview} />
        </div>
      )}
    </Modal>
  );
}

function SelfServiceView({
  employee,
  facts,
  employees,
  taxYear,
  years,
  setTaxYear,
  preview,
  setPreview,
  history,
}: {
  employee: Employee | null;
  facts: ReturnType<typeof getMonthlyFacts>;
  employees: Employee[];
  taxYear: number;
  years: number[];
  setTaxYear: (y: number) => void;
  preview: Form2316Data | null;
  setPreview: (d: Form2316Data | null) => void;
  history: ReturnType<typeof useHris>["generatedBirForms"];
}) {
  if (!employee) return null;
  const data = buildForm2316(facts, employees, employee.id, taxYear);

  return (
    <div>
      <PageHeader title="My BIR Form 2316" subtitle="Certificate of Compensation Payment / Tax Withheld — generated from your payroll history." />
      <div className="mb-4 flex items-center gap-2">
        <select value={taxYear} onChange={(e) => setTaxYear(Number(e.target.value))} className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-2 text-sm">
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        {data && (
          <button onClick={() => setPreview(data)} className="flex items-center gap-1.5 rounded-lg bg-[var(--series-1)] px-3 py-2 text-sm font-medium text-[var(--on-accent)]">
            <FileCheck2 size={16} /> Preview / Download
          </button>
        )}
      </div>

      {data && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <SummaryTile label="Gross compensation" value={formatCurrencyCompact(data.grossCompensation)} />
          <SummaryTile label="Taxable compensation" value={formatCurrencyCompact(data.taxableCompensation)} />
          <SummaryTile label="Total tax withheld" value={formatCurrencyCompact(data.totalTaxWithheld)} />
          <SummaryTile label="Net tax due" value={formatCurrencyCompact(data.netTaxDue)} />
        </div>
      )}

      <div className="mt-6 rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-1)] p-4">
        <div className="mb-3 text-sm font-medium text-[var(--text-primary)]">My previously generated copies</div>
        {history.length === 0 ? (
          <div className="py-4 text-center text-xs text-[var(--text-muted)]">No copies generated yet.</div>
        ) : (
          <div className="flex flex-col divide-y divide-[var(--gridline)]">
            {history.map((h) => (
              <div key={h.id} className="flex items-center justify-between py-2 text-sm">
                <span className="text-[var(--text-primary)]">Tax year {h.period}</span>
                <span className="text-xs text-[var(--text-muted)]">{formatDate(h.generatedAt)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <PreviewModal preview={preview} onClose={() => setPreview(null)} />
    </div>
  );
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-1)] p-4">
      <div className="text-xs font-medium text-[var(--text-secondary)]">{label}</div>
      <div className="tabular mt-1 text-xl font-semibold text-[var(--text-primary)]">{value}</div>
    </div>
  );
}

function AdminView({
  employees,
  branches,
  departments,
  facts,
  taxYear,
  years,
  setTaxYear,
  preview,
  setPreview,
  history,
  addGeneratedBirForm,
}: {
  employees: Employee[];
  branches: ReturnType<typeof useHris>["branches"];
  departments: ReturnType<typeof useHris>["departments"];
  facts: ReturnType<typeof getMonthlyFacts>;
  taxYear: number;
  years: number[];
  setTaxYear: (y: number) => void;
  preview: Form2316Data | null;
  setPreview: (d: Form2316Data | null) => void;
  history: ReturnType<typeof useHris>["generatedBirForms"];
  addGeneratedBirForm: ReturnType<typeof useHris>["addGeneratedBirForm"];
}) {
  const [branchId, setBranchId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [search, setSearch] = useState("");

  const active = employees.filter((e) => e.status === "active" || e.status === "on_leave");
  const filtered = active
    .filter((e) => (branchId ? e.branchId === branchId : true))
    .filter((e) => (departmentId ? e.departmentId === departmentId : true))
    .filter((e) => (employeeId ? e.id === employeeId : true))
    .filter((e) => fullName(e).toLowerCase().includes(search.toLowerCase()));

  function generateOne(emp: Employee) {
    const data = buildForm2316(facts, employees, emp.id, taxYear);
    if (!data) return;
    addGeneratedBirForm({
      formType: "2316",
      period: String(taxYear),
      employeeId: emp.id,
      summary: {
        grossCompensation: data.grossCompensation,
        taxableCompensation: data.taxableCompensation,
        totalTaxWithheld: data.totalTaxWithheld,
        netTaxDue: data.netTaxDue,
      },
    });
    setPreview(data);
  }

  function generateAll() {
    filtered.forEach((emp) => {
      const data = buildForm2316(facts, employees, emp.id, taxYear);
      if (!data) return;
      addGeneratedBirForm({
        formType: "2316",
        period: String(taxYear),
        employeeId: emp.id,
        summary: {
          grossCompensation: data.grossCompensation,
          taxableCompensation: data.taxableCompensation,
          totalTaxWithheld: data.totalTaxWithheld,
          netTaxDue: data.netTaxDue,
        },
      });
    });
  }

  function preview2316(emp: Employee) {
    const data = buildForm2316(facts, employees, emp.id, taxYear);
    if (data) setPreview(data);
  }

  function viewHistorical(entry: (typeof history)[number]) {
    const emp = employees.find((e) => e.id === entry.employeeId);
    if (!emp) return;
    setPreview({
      employee: emp,
      taxYear: Number(entry.period),
      monthsCovered: `Tax year ${entry.period}`,
      grossCompensation: entry.summary.grossCompensation,
      taxableCompensation: entry.summary.taxableCompensation,
      nonTaxableCompensation: entry.summary.grossCompensation - entry.summary.taxableCompensation,
      basicSalary: 0,
      allowances: 0,
      overtimePay: 0,
      holidayPay: 0,
      leavePay: 0,
      thirteenthMonthPay: 0,
      otherBenefits: 0,
      deMinimisBenefits: 0,
      employeeSSS: 0,
      employeePhilHealth: 0,
      employeeHDMF: 0,
      totalTaxWithheld: entry.summary.totalTaxWithheld,
      netTaxDue: entry.summary.netTaxDue,
    });
  }

  return (
    <div>
      <PageHeader
        title="BIR Form 2316"
        subtitle="Certificate of Compensation Payment / Tax Withheld — generated per employee from finalized payroll records."
        actions={
          <button onClick={generateAll} className="flex items-center gap-1.5 rounded-lg bg-[var(--series-1)] px-3 py-2 text-sm font-medium text-[var(--on-accent)]">
            <Layers size={16} /> Generate for all shown ({filtered.length})
          </button>
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <select value={taxYear} onChange={(e) => setTaxYear(Number(e.target.value))} className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-2 text-sm">
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-2 text-sm">
          <option value="">All branches</option>
          {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-2 text-sm">
          <option value="">All departments</option>
          {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-2 text-sm">
          <option value="">All employees</option>
          {active.map((e) => <option key={e.id} value={e.id}>{fullName(e)}</option>)}
        </select>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…" className="min-w-0 flex-1 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-2 text-sm sm:max-w-xs" />
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={FileCheck2} title="No matching employees" description="Adjust your filters." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-1)]">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-[var(--border-hairline)] text-left text-xs text-[var(--text-muted)]">
                <th className="px-3 py-2 font-medium">Employee</th>
                <th className="px-3 py-2 font-medium">Branch / Dept</th>
                <th className="px-3 py-2 font-medium">Gross comp.</th>
                <th className="px-3 py-2 font-medium">Tax withheld</th>
                <th className="px-3 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((emp) => {
                const data = buildForm2316(facts, employees, emp.id, taxYear);
                return (
                  <tr key={emp.id} className="border-b border-[var(--gridline)] last:border-0">
                    <td className="px-3 py-2 font-medium text-[var(--text-primary)]">{fullName(emp)}</td>
                    <td className="px-3 py-2 text-xs text-[var(--text-secondary)]">{branchName(emp.branchId)}<br />{departmentName(emp.departmentId)}</td>
                    <td className="tabular px-3 py-2 text-[var(--text-secondary)]">{data ? formatCurrencyCompact(data.grossCompensation) : "—"}</td>
                    <td className="tabular px-3 py-2 text-[var(--text-secondary)]">{data ? formatCurrencyCompact(data.totalTaxWithheld) : "—"}</td>
                    <td className="px-3 py-2">
                      <div className="flex gap-1.5">
                        <button onClick={() => preview2316(emp)} className="rounded-lg border border-[var(--border-hairline)] px-2.5 py-1 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40">Preview</button>
                        <button onClick={() => generateOne(emp)} className="rounded-lg bg-[var(--series-1)] px-2.5 py-1 text-xs font-medium text-[var(--on-accent)]">Generate</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-6 rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-1)] p-4">
        <div className="mb-3 text-sm font-medium text-[var(--text-primary)]">Historical records — all employees</div>
        {history.length === 0 ? (
          <EmptyState icon={FileCheck2} title="No forms generated yet" description="Use Generate to create the first Form 2316 and log it here." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] text-sm">
              <thead>
                <tr className="border-b border-[var(--border-hairline)] text-left text-xs text-[var(--text-muted)]">
                  <th className="px-3 py-2 font-medium">Employee</th>
                  <th className="px-3 py-2 font-medium">Tax year</th>
                  <th className="px-3 py-2 font-medium">Tax withheld</th>
                  <th className="px-3 py-2 font-medium">Generated by</th>
                  <th className="px-3 py-2 font-medium">Generated on</th>
                  <th className="px-3 py-2 font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {history.map((entry) => {
                  const emp = employees.find((e) => e.id === entry.employeeId);
                  return (
                    <tr key={entry.id} className="border-b border-[var(--gridline)] last:border-0">
                      <td className="px-3 py-2 text-[var(--text-primary)]">{emp ? fullName(emp) : entry.employeeId}</td>
                      <td className="px-3 py-2 text-[var(--text-secondary)]">{entry.period}</td>
                      <td className="tabular px-3 py-2 text-[var(--text-secondary)]">{formatCurrencyCompact(entry.summary.totalTaxWithheld)}</td>
                      <td className="px-3 py-2 text-[var(--text-secondary)]">{entry.generatedBy}</td>
                      <td className="tabular px-3 py-2 text-[var(--text-secondary)]">{formatDate(entry.generatedAt)}</td>
                      <td className="px-3 py-2">
                        <button onClick={() => viewHistorical(entry)} className="rounded-lg border border-[var(--border-hairline)] px-2.5 py-1 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40">View</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <PreviewModal preview={preview} onClose={() => setPreview(null)} />
    </div>
  );
}
