"use client";

import { useMemo, useState } from "react";
import { FileCheck2, Lock, LockOpen, Wallet } from "lucide-react";
import { useHris } from "@/lib/store";
import { PageHeader } from "@/components/PageHeader";
import { StatTile } from "@/components/StatTile";
import { Badge, type BadgeTone } from "@/components/Badge";
import { EmptyState } from "@/components/EmptyState";
import Link from "next/link";
import { branchName, formatCurrencyCompact, formatDate, fullName } from "@/lib/helpers";
import { computePayrollForPeriod, summarizePayrollLines } from "@/lib/payroll";
import { toCsv, downloadCsv } from "@/lib/monthly-analytics";
import type { PayrollPeriodStatus } from "@/lib/types";

const STATUS_TONE: Record<PayrollPeriodStatus, BadgeTone> = {
  open: "good",
  locked: "warning",
  closed: "muted",
};

export default function PayrollProcessingPage() {
  const { employees, payrollPeriods, attendancePeriodRecords, leaveRequests, overtimeRequests, setPayrollPeriodStatus, generatedPayslips, addGeneratedPayslip, currentUser } = useHris();
  const canManage = currentUser?.roles.some((r) => ["hr_admin", "payroll_officer"].includes(r));

  const [periodId, setPeriodId] = useState(payrollPeriods[payrollPeriods.length - 1]?.id ?? "");
  const period = payrollPeriods.find((p) => p.id === periodId) ?? payrollPeriods[payrollPeriods.length - 1];

  const lines = useMemo(
    () => (period ? computePayrollForPeriod(period, employees, attendancePeriodRecords, leaveRequests, overtimeRequests) : []),
    [period, employees, attendancePeriodRecords, leaveRequests, overtimeRequests],
  );
  const summary = summarizePayrollLines(lines);
  const byId = new Map(employees.map((e) => [e.id, e]));

  const alreadyGenerated = period ? new Set(generatedPayslips.filter((p) => p.periodId === period.id).map((p) => p.employeeId)) : new Set();

  function generatePayslips() {
    if (!period) return;
    lines.forEach((line) => {
      if (alreadyGenerated.has(line.employeeId)) return;
      addGeneratedPayslip({
        periodId: period.id,
        employeeId: line.employeeId,
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
    });
  }

  function exportCsv() {
    if (!period) return;
    const csv = toCsv(
      ["Employee", "Branch", "Basic Pay", "Allowances", "OT Pay", "Holiday Pay", "Leave Pay", "Late Deduction", "Gross Pay", "Total Deductions", "Net Pay"],
      lines.map((l) => {
        const emp = byId.get(l.employeeId);
        return [emp ? fullName(emp) : l.employeeId, emp ? branchName(emp.branchId) : "", l.basicPay, l.allowances, l.overtimePay, l.holidayPay, l.leavePay, l.lateDeduction, l.grossPay, l.totalDeductions, l.netPay];
      }),
    );
    downloadCsv(`payroll-${period.id}.csv`, csv);
  }

  return (
    <div>
      <PageHeader
        title="Payroll Processing"
        subtitle="Computed automatically from attendance, leave, and overtime records for the selected payroll period — no manual encoding."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={exportCsv} className="rounded-lg border border-[var(--border-hairline)] px-3 py-2 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40">Export CSV</button>
            {canManage && period && (
              <>
                {period.status === "open" && (
                  <button onClick={() => setPayrollPeriodStatus(period.id, "locked")} className="flex items-center gap-1.5 rounded-lg border border-[var(--border-hairline)] px-3 py-2 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40">
                    <Lock size={16} /> Lock period
                  </button>
                )}
                {period.status === "locked" && (
                  <button onClick={() => setPayrollPeriodStatus(period.id, "open")} className="flex items-center gap-1.5 rounded-lg border border-[var(--border-hairline)] px-3 py-2 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40">
                    <LockOpen size={16} /> Unlock
                  </button>
                )}
                {period.status !== "open" && (
                  <button onClick={generatePayslips} className="flex items-center gap-1.5 rounded-lg bg-[var(--series-1)] px-3 py-2 text-sm font-medium text-[var(--on-accent)]">
                    <FileCheck2 size={16} /> Generate payslips
                  </button>
                )}
              </>
            )}
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select value={periodId || period?.id} onChange={(e) => setPeriodId(e.target.value)} className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-2 text-sm">
          {payrollPeriods.map((p) => (
            <option key={p.id} value={p.id}>{formatDate(p.start)} – {formatDate(p.end)}</option>
          ))}
        </select>
        {period && <Badge tone={STATUS_TONE[period.status]}>{period.status}</Badge>}
      </div>

      {!period ? (
        <EmptyState icon={Wallet} title="No payroll periods configured" description="Add a payroll period in System Administration to begin processing." />
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile label="Employees covered" value={lines.length.toString()} />
            <StatTile label="Gross pay" value={formatCurrencyCompact(summary.grossPay)} />
            <StatTile label="Total deductions" value={formatCurrencyCompact(summary.totalDeductions)} />
            <StatTile label="Net pay" value={formatCurrencyCompact(summary.netPay)} />
          </div>

          <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-1)] p-4">
            <div className="mb-3 text-sm font-medium text-[var(--text-primary)]">Payroll register — {formatDate(period.start)} – {formatDate(period.end)}</div>
            {lines.length === 0 ? (
              <EmptyState
                icon={Wallet}
                title="No attendance data for this period yet"
                description="Import or manually enter this period's attendance in the Attendance module — payroll is computed directly from it."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px] text-sm">
                  <thead>
                    <tr className="border-b border-[var(--border-hairline)] text-left text-xs text-[var(--text-muted)]">
                      <th className="px-3 py-2 font-medium">Employee</th>
                      <th className="px-3 py-2 font-medium">Branch</th>
                      <th className="px-3 py-2 font-medium">Basic</th>
                      <th className="px-3 py-2 font-medium">Allowances</th>
                      <th className="px-3 py-2 font-medium">OT</th>
                      <th className="px-3 py-2 font-medium">Holiday</th>
                      <th className="px-3 py-2 font-medium">Leave</th>
                      <th className="px-3 py-2 font-medium">Late Ded.</th>
                      <th className="px-3 py-2 font-medium">Gross</th>
                      <th className="px-3 py-2 font-medium">Deductions</th>
                      <th className="px-3 py-2 font-medium">Net pay</th>
                      <th className="px-3 py-2 font-medium">Payslip</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((l) => {
                      const emp = byId.get(l.employeeId);
                      return (
                        <tr key={l.employeeId} className="border-b border-[var(--gridline)] last:border-0">
                          <td className="px-3 py-2 text-[var(--text-primary)]">{emp ? fullName(emp) : l.employeeId}</td>
                          <td className="px-3 py-2 text-[var(--text-secondary)]">{emp ? branchName(emp.branchId) : "—"}</td>
                          <td className="tabular px-3 py-2 text-[var(--text-secondary)]">{formatCurrencyCompact(l.basicPay)}</td>
                          <td className="tabular px-3 py-2 text-[var(--text-secondary)]">{formatCurrencyCompact(l.allowances)}</td>
                          <td className="tabular px-3 py-2 text-[var(--text-secondary)]">{formatCurrencyCompact(l.overtimePay)}</td>
                          <td className="tabular px-3 py-2 text-[var(--text-secondary)]">{formatCurrencyCompact(l.holidayPay)}</td>
                          <td className="tabular px-3 py-2 text-[var(--text-secondary)]">{formatCurrencyCompact(l.leavePay)}</td>
                          <td className="tabular px-3 py-2 text-[var(--status-critical)]">{l.lateDeduction ? `-${formatCurrencyCompact(l.lateDeduction)}` : "—"}</td>
                          <td className="tabular px-3 py-2 font-medium text-[var(--text-primary)]">{formatCurrencyCompact(l.grossPay)}</td>
                          <td className="tabular px-3 py-2 text-[var(--text-secondary)]">{formatCurrencyCompact(l.totalDeductions)}</td>
                          <td className="tabular px-3 py-2 font-medium text-[var(--text-primary)]">{formatCurrencyCompact(l.netPay)}</td>
                          <td className="px-3 py-2">{alreadyGenerated.has(l.employeeId) ? <Badge tone="good">Released</Badge> : <Badge tone="muted">Not released</Badge>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <div className="mt-3 text-right text-xs">
              <Link href="/modules/attendance" className="text-[var(--series-1)] hover:underline">Manage attendance for this period →</Link>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
