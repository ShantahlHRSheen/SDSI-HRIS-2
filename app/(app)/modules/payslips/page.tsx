"use client";

import { useMemo, useState } from "react";
import { FileCheck2, Layers, Printer, Wallet } from "lucide-react";
import { useHris } from "@/lib/store";
import { PageHeader } from "@/components/PageHeader";
import { Modal } from "@/components/Modal";
import { EmptyState } from "@/components/EmptyState";
import { PayslipDocument } from "@/components/payroll/PayslipDocument";
import { computePayrollForPeriod, type PayrollLine } from "@/lib/payroll";
import { branchName, departmentName, formatCurrencyCompact, formatDate, fullName } from "@/lib/helpers";
import type { Employee, GeneratedPayslip, PayrollPeriod } from "@/lib/types";

export default function PayslipsPage() {
  const { currentUser, currentEmployee, employees, branches, departments, payrollPeriods, attendancePeriodRecords, leaveRequests, overtimeRequests, generatedPayslips, addGeneratedPayslip } = useHris();
  const [periodId, setPeriodId] = useState(payrollPeriods[payrollPeriods.length - 1]?.id ?? "");
  const period = payrollPeriods.find((p) => p.id === periodId) ?? payrollPeriods[payrollPeriods.length - 1];
  const [preview, setPreview] = useState<{ employee: Employee; period: PayrollPeriod; line: PayrollLine } | null>(null);

  const lines = useMemo(
    () => (period ? computePayrollForPeriod(period, employees, attendancePeriodRecords, leaveRequests, overtimeRequests) : []),
    [period, employees, attendancePeriodRecords, leaveRequests, overtimeRequests],
  );
  const lineByEmployee = new Map(lines.map((l) => [l.employeeId, l]));

  const isAdmin = currentUser?.roles.some((r) => ["hr_admin", "payroll_officer", "cfo", "upper_management"].includes(r));

  if (!isAdmin) {
    return (
      <SelfServiceView
        employee={currentEmployee}
        payrollPeriods={payrollPeriods}
        generatedPayslips={generatedPayslips}
        preview={preview}
        setPreview={setPreview}
      />
    );
  }

  return (
    <AdminView
      employees={employees}
      branches={branches}
      departments={departments}
      payrollPeriods={payrollPeriods}
      period={period}
      periodId={periodId}
      setPeriodId={setPeriodId}
      lines={lines}
      lineByEmployee={lineByEmployee}
      generatedPayslips={generatedPayslips}
      addGeneratedPayslip={addGeneratedPayslip}
      preview={preview}
      setPreview={setPreview}
    />
  );
}

function PreviewModal({ preview, onClose }: { preview: { employee: Employee; period: PayrollPeriod; line: PayrollLine } | null; onClose: () => void }) {
  return (
    <Modal open={!!preview} onClose={onClose} title="Payslip preview" wide>
      {preview && (
        <div>
          <div className="mb-3 flex justify-end gap-2 print:hidden">
            <button onClick={() => window.print()} className="flex items-center gap-1.5 rounded-lg border border-[var(--border-hairline)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40">
              <Printer size={14} /> Print / Download PDF
            </button>
          </div>
          <PayslipDocument employee={preview.employee} period={preview.period} line={preview.line} />
        </div>
      )}
    </Modal>
  );
}

function summaryToLine(summary: Record<string, number>): PayrollLine {
  return {
    employeeId: "",
    basicPay: summary.basicPay ?? 0,
    allowances: summary.allowances ?? 0,
    overtimePay: summary.overtimePay ?? 0,
    holidayPay: summary.holidayPay ?? 0,
    leavePay: summary.leavePay ?? 0,
    lateDeduction: summary.lateDeduction ?? 0,
    grossPay: summary.grossPay ?? 0,
    employeeSSS: summary.employeeSSS ?? 0,
    employeeHDMF: summary.employeeHDMF ?? 0,
    employeePhilHealth: summary.employeePhilHealth ?? 0,
    withholdingTax: summary.withholdingTax ?? 0,
    totalDeductions: summary.totalDeductions ?? 0,
    netPay: summary.netPay ?? 0,
    employerSSS: 0,
    employerHDMF: 0,
    employerPhilHealth: 0,
    employerExpense: 0,
  };
}

function SelfServiceView({
  employee,
  payrollPeriods,
  generatedPayslips,
  preview,
  setPreview,
}: {
  employee: Employee | null;
  payrollPeriods: PayrollPeriod[];
  generatedPayslips: GeneratedPayslip[];
  preview: { employee: Employee; period: PayrollPeriod; line: PayrollLine } | null;
  setPreview: (v: { employee: Employee; period: PayrollPeriod; line: PayrollLine } | null) => void;
}) {
  if (!employee) return null;
  const emp = employee;
  const myPayslips = generatedPayslips
    .filter((p) => p.employeeId === emp.id)
    .sort((a, b) => (a.generatedAt < b.generatedAt ? 1 : -1));

  function view(entry: GeneratedPayslip) {
    const period = payrollPeriods.find((p) => p.id === entry.periodId);
    if (!period) return;
    setPreview({ employee: emp, period, line: summaryToLine(entry.summary) });
  }

  return (
    <div>
      <PageHeader title="My Payslips" subtitle="Payslips released by HR/Payroll for each finalized payroll period." />
      {myPayslips.length === 0 ? (
        <EmptyState icon={Wallet} title="No payslips released yet" description="Your payslip will appear here once HR/Payroll finalizes and releases a payroll period." />
      ) : (
        <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-1)] p-4">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="border-b border-[var(--border-hairline)] text-left text-xs text-[var(--text-muted)]">
                  <th className="px-3 py-2 font-medium">Period</th>
                  <th className="px-3 py-2 font-medium">Net pay</th>
                  <th className="px-3 py-2 font-medium">Released</th>
                  <th className="px-3 py-2 font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {myPayslips.map((p) => {
                  const period = payrollPeriods.find((pp) => pp.id === p.periodId);
                  return (
                    <tr key={p.id} className="border-b border-[var(--gridline)] last:border-0">
                      <td className="px-3 py-2 text-[var(--text-primary)]">{period ? `${formatDate(period.start)} – ${formatDate(period.end)}` : p.periodId}</td>
                      <td className="tabular px-3 py-2 font-medium text-[var(--text-primary)]">{formatCurrencyCompact(p.summary.netPay)}</td>
                      <td className="tabular px-3 py-2 text-[var(--text-secondary)]">{formatDate(p.generatedAt)}</td>
                      <td className="px-3 py-2">
                        <button onClick={() => view(p)} className="rounded-lg border border-[var(--border-hairline)] px-2.5 py-1 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40">Preview / Download</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <PreviewModal preview={preview} onClose={() => setPreview(null)} />
    </div>
  );
}

function AdminView({
  employees,
  branches,
  departments,
  payrollPeriods,
  period,
  periodId,
  setPeriodId,
  lines,
  lineByEmployee,
  generatedPayslips,
  addGeneratedPayslip,
  preview,
  setPreview,
}: {
  employees: Employee[];
  branches: ReturnType<typeof useHris>["branches"];
  departments: ReturnType<typeof useHris>["departments"];
  payrollPeriods: PayrollPeriod[];
  period: PayrollPeriod | undefined;
  periodId: string;
  setPeriodId: (id: string) => void;
  lines: PayrollLine[];
  lineByEmployee: Map<string, PayrollLine>;
  generatedPayslips: GeneratedPayslip[];
  addGeneratedPayslip: ReturnType<typeof useHris>["addGeneratedPayslip"];
  preview: { employee: Employee; period: PayrollPeriod; line: PayrollLine } | null;
  setPreview: (v: { employee: Employee; period: PayrollPeriod; line: PayrollLine } | null) => void;
}) {
  const [branchId, setBranchId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [search, setSearch] = useState("");

  const filtered = lines
    .map((l) => employees.find((e) => e.id === l.employeeId))
    .filter((e): e is Employee => !!e)
    .filter((e) => (branchId ? e.branchId === branchId : true))
    .filter((e) => (departmentId ? e.departmentId === departmentId : true))
    .filter((e) => fullName(e).toLowerCase().includes(search.toLowerCase()));

  const generatedForPeriod = new Set(generatedPayslips.filter((p) => p.periodId === period?.id).map((p) => p.employeeId));
  const history = generatedPayslips.slice().sort((a, b) => (a.generatedAt < b.generatedAt ? 1 : -1));

  function generateOne(emp: Employee) {
    if (!period) return;
    const line = lineByEmployee.get(emp.id);
    if (!line) return;
    addGeneratedPayslip({
      periodId: period.id,
      employeeId: emp.id,
      summary: {
        basicPay: line.basicPay,
        allowances: line.allowances,
        overtimePay: line.overtimePay,
        holidayPay: line.holidayPay,
        leavePay: line.leavePay,
        lateDeduction: line.lateDeduction,
        grossPay: line.grossPay,
        employeeSSS: line.employeeSSS,
        employeeHDMF: line.employeeHDMF,
        employeePhilHealth: line.employeePhilHealth,
        withholdingTax: line.withholdingTax,
        totalDeductions: line.totalDeductions,
        netPay: line.netPay,
      },
    });
    setPreview({ employee: emp, period, line });
  }

  function generateAll() {
    filtered.forEach((emp) => {
      if (generatedForPeriod.has(emp.id)) return;
      generateOne(emp);
    });
  }

  function previewOne(emp: Employee) {
    if (!period) return;
    const line = lineByEmployee.get(emp.id);
    if (line) setPreview({ employee: emp, period, line });
  }

  function viewHistorical(entry: GeneratedPayslip) {
    const emp = employees.find((e) => e.id === entry.employeeId);
    const p = payrollPeriods.find((pp) => pp.id === entry.periodId);
    if (!emp || !p) return;
    setPreview({ employee: emp, period: p, line: { ...summaryToLine(entry.summary), employeeId: emp.id } });
  }

  return (
    <div>
      <PageHeader
        title="Payslips"
        subtitle="Generate and release payslips per payroll period from finalized payroll records."
        actions={
          <button onClick={generateAll} className="flex items-center gap-1.5 rounded-lg bg-[var(--series-1)] px-3 py-2 text-sm font-medium text-[var(--on-accent)]">
            <Layers size={16} /> Generate for all shown ({filtered.length})
          </button>
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <select value={periodId} onChange={(e) => setPeriodId(e.target.value)} className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-2 text-sm">
          {payrollPeriods.map((p) => <option key={p.id} value={p.id}>{formatDate(p.start)} – {formatDate(p.end)}</option>)}
        </select>
        <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-2 text-sm">
          <option value="">All branches</option>
          {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-2 text-sm">
          <option value="">All departments</option>
          {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search employee…" className="min-w-0 flex-1 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-2 text-sm sm:max-w-xs" />
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
                <th className="px-3 py-2 font-medium">Net pay</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((emp) => {
                const line = lineByEmployee.get(emp.id);
                return (
                  <tr key={emp.id} className="border-b border-[var(--gridline)] last:border-0">
                    <td className="px-3 py-2 font-medium text-[var(--text-primary)]">{fullName(emp)}</td>
                    <td className="px-3 py-2 text-xs text-[var(--text-secondary)]">{branchName(emp.branchId)}<br />{departmentName(emp.departmentId)}</td>
                    <td className="tabular px-3 py-2 text-[var(--text-secondary)]">{line ? formatCurrencyCompact(line.netPay) : "—"}</td>
                    <td className="px-3 py-2">{generatedForPeriod.has(emp.id) ? <span className="text-xs text-[var(--status-good)]">Released</span> : <span className="text-xs text-[var(--text-muted)]">Not released</span>}</td>
                    <td className="px-3 py-2">
                      <div className="flex gap-1.5">
                        <button onClick={() => previewOne(emp)} className="rounded-lg border border-[var(--border-hairline)] px-2.5 py-1 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40">Preview</button>
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
          <EmptyState icon={FileCheck2} title="No payslips generated yet" description="Use Generate to release the first payslip and log it here." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] text-sm">
              <thead>
                <tr className="border-b border-[var(--border-hairline)] text-left text-xs text-[var(--text-muted)]">
                  <th className="px-3 py-2 font-medium">Employee</th>
                  <th className="px-3 py-2 font-medium">Period</th>
                  <th className="px-3 py-2 font-medium">Net pay</th>
                  <th className="px-3 py-2 font-medium">Generated by</th>
                  <th className="px-3 py-2 font-medium">Generated on</th>
                  <th className="px-3 py-2 font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {history.map((entry) => {
                  const emp = employees.find((e) => e.id === entry.employeeId);
                  const p = payrollPeriods.find((pp) => pp.id === entry.periodId);
                  return (
                    <tr key={entry.id} className="border-b border-[var(--gridline)] last:border-0">
                      <td className="px-3 py-2 text-[var(--text-primary)]">{emp ? fullName(emp) : entry.employeeId}</td>
                      <td className="px-3 py-2 text-[var(--text-secondary)]">{p ? `${formatDate(p.start)} – ${formatDate(p.end)}` : entry.periodId}</td>
                      <td className="tabular px-3 py-2 text-[var(--text-secondary)]">{formatCurrencyCompact(entry.summary.netPay)}</td>
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
