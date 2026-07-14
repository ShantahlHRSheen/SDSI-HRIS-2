"use client";

import { useMemo, useState } from "react";
import { FileCheck2, Lock, LockOpen, Pencil, Wallet } from "lucide-react";
import { useHris } from "@/lib/store";
import { PageHeader } from "@/components/PageHeader";
import { StatTile } from "@/components/StatTile";
import { Badge, type BadgeTone } from "@/components/Badge";
import { EmptyState } from "@/components/EmptyState";
import { Modal } from "@/components/Modal";
import Link from "next/link";
import { branchName, formatCurrencyCompact, formatDate, fullName } from "@/lib/helpers";
import { computePayrollForPeriod, payrollLineToSummary, summarizePayrollLines, type PayrollLine } from "@/lib/payroll";
import { toCsv, downloadCsv } from "@/lib/monthly-analytics";
import type { Employee, PayrollLineOverride, PayrollPeriodStatus } from "@/lib/types";

const STATUS_TONE: Record<PayrollPeriodStatus, BadgeTone> = {
  open: "good",
  locked: "warning",
  closed: "muted",
};

export default function PayrollProcessingPage() {
  const {
    employees,
    payrollPeriods,
    attendancePeriodRecords,
    overtimeRequests,
    payrollLineOverrides,
    upsertPayrollLineOverride,
    setPayrollPeriodStatus,
    generatedPayslips,
    addGeneratedPayslip,
    currentUser,
  } = useHris();
  const canManage = currentUser?.roles.some((r) => ["hr_admin", "payroll_officer"].includes(r));

  const [periodId, setPeriodId] = useState(payrollPeriods[payrollPeriods.length - 1]?.id ?? "");
  const period = payrollPeriods.find((p) => p.id === periodId) ?? payrollPeriods[payrollPeriods.length - 1];
  const [editing, setEditing] = useState<Employee | null>(null);

  const lines = useMemo(
    () => (period ? computePayrollForPeriod(period, employees, attendancePeriodRecords, overtimeRequests, payrollLineOverrides) : []),
    [period, employees, attendancePeriodRecords, overtimeRequests, payrollLineOverrides],
  );
  const summary = summarizePayrollLines(lines);
  const byId = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);
  const lineByEmployee = new Map(lines.map((l) => [l.employeeId, l]));

  // Payroll Processing is always presented sorted alphabetically by surname.
  const sortedLines = useMemo(
    () => [...lines].sort((a, b) => (byId.get(a.employeeId)?.lastName ?? "").localeCompare(byId.get(b.employeeId)?.lastName ?? "")),
    [lines, byId],
  );

  const alreadyGenerated = period ? new Set(generatedPayslips.filter((p) => p.periodId === period.id).map((p) => p.employeeId)) : new Set();

  function generatePayslips() {
    if (!period) return;
    lines.forEach((line) => {
      if (alreadyGenerated.has(line.employeeId)) return;
      addGeneratedPayslip({
        periodId: period.id,
        employeeId: line.employeeId,
        summary: payrollLineToSummary(line),
      });
    });
  }

  function exportCsv() {
    if (!period) return;
    const csv = toCsv(
      [
        "Employee",
        "Branch",
        "Payroll Type",
        "Rate/Day",
        "Days Working",
        "Basic Pay",
        "Lates/Undertime",
        "Holiday Pay",
        "VL Pay",
        "SL Pay",
        "OT Pay",
        "Net Allowances",
        "Gross Salary",
        "SSS Contribution",
        "SSS WISP",
        "PhilHealth Contribution",
        "Pag-IBIG Contribution",
        "Withholding Tax",
        "Total Mandatories",
        "Other Deductions",
        "Net Pay",
      ],
      sortedLines.map((l) => {
        const emp = byId.get(l.employeeId);
        return [
          emp ? fullName(emp) : l.employeeId,
          emp ? branchName(emp.branchId) : "",
          l.payrollType === "daily" ? "Daily-rate" : "Fixed-rate",
          l.ratePerDay,
          l.daysWorking,
          l.basicPay,
          l.latesUndertime,
          l.holidayPay,
          l.vlPay,
          l.slPay,
          l.otPay,
          l.netAllowances,
          l.grossSalary,
          l.sssContribution,
          l.sssWisp,
          l.philHealthContribution,
          l.hdmfContribution,
          l.withholdingTax,
          l.totalMandatories,
          l.totalDeductionsOtherThanMandatories,
          l.netPay,
        ];
      }),
    );
    downloadCsv(`payroll-${period.id}.csv`, csv);
  }

  return (
    <div>
      <PageHeader
        title="Payroll Processing"
        subtitle="Computed automatically from attendance and approved overtime records for the selected payroll period — every figure remains editable per employee, including attendance, rate, and statutory contributions."
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
            <div className="mb-3 text-sm font-medium text-[var(--text-primary)]">Payroll register — {formatDate(period.start)} – {formatDate(period.end)} (sorted A–Z by surname)</div>
            {sortedLines.length === 0 ? (
              <EmptyState
                icon={Wallet}
                title="No attendance data for this period yet"
                description="Import or manually enter this period's attendance in the Attendance module — payroll is computed directly from it."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1500px] text-sm">
                  <thead>
                    <tr className="border-b border-[var(--border-hairline)] text-left text-xs text-[var(--text-muted)]">
                      <th className="px-3 py-2 font-medium">Employee</th>
                      <th className="px-3 py-2 font-medium">Type</th>
                      <th className="px-3 py-2 font-medium">Rate/Day</th>
                      <th className="px-3 py-2 font-medium">Basic</th>
                      <th className="px-3 py-2 font-medium">Late</th>
                      <th className="px-3 py-2 font-medium">Holiday</th>
                      <th className="px-3 py-2 font-medium">VL</th>
                      <th className="px-3 py-2 font-medium">SL</th>
                      <th className="px-3 py-2 font-medium">OT</th>
                      <th className="px-3 py-2 font-medium">Allowances</th>
                      <th className="px-3 py-2 font-medium">Gross</th>
                      <th className="px-3 py-2 font-medium">SSS</th>
                      <th className="px-3 py-2 font-medium">WISP</th>
                      <th className="px-3 py-2 font-medium">PhilHealth</th>
                      <th className="px-3 py-2 font-medium">HDMF</th>
                      <th className="px-3 py-2 font-medium">WHT</th>
                      <th className="px-3 py-2 font-medium">Other Ded.</th>
                      <th className="px-3 py-2 font-medium">Net pay</th>
                      <th className="px-3 py-2 font-medium">Payslip</th>
                      <th className="px-3 py-2 font-medium"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedLines.map((l) => {
                      const emp = byId.get(l.employeeId);
                      return (
                        <tr key={l.employeeId} className="border-b border-[var(--gridline)] last:border-0">
                          <td className="px-3 py-2 text-[var(--text-primary)]">{emp ? fullName(emp) : l.employeeId}</td>
                          <td className="px-3 py-2 text-xs text-[var(--text-secondary)]">{l.payrollType === "daily" ? "Daily-rate" : "Fixed-rate"}</td>
                          <td className="tabular px-3 py-2 text-[var(--text-secondary)]">{formatCurrencyCompact(l.ratePerDay)}</td>
                          <td className="tabular px-3 py-2 text-[var(--text-secondary)]">{formatCurrencyCompact(l.basicPay)}</td>
                          <td className="tabular px-3 py-2 text-[var(--status-critical)]">{l.latesUndertime ? `-${formatCurrencyCompact(l.latesUndertime)}` : "—"}</td>
                          <td className="tabular px-3 py-2 text-[var(--text-secondary)]">{formatCurrencyCompact(l.holidayPay)}</td>
                          <td className="tabular px-3 py-2 text-[var(--text-secondary)]">{formatCurrencyCompact(l.vlPay)}</td>
                          <td className="tabular px-3 py-2 text-[var(--text-secondary)]">{formatCurrencyCompact(l.slPay)}</td>
                          <td className="tabular px-3 py-2 text-[var(--text-secondary)]">{formatCurrencyCompact(l.otPay)}</td>
                          <td className="tabular px-3 py-2 text-[var(--text-secondary)]">{formatCurrencyCompact(l.netAllowances)}</td>
                          <td className="tabular px-3 py-2 font-medium text-[var(--text-primary)]">{formatCurrencyCompact(l.grossSalary)}</td>
                          <td className="tabular px-3 py-2 text-[var(--text-secondary)]">{formatCurrencyCompact(l.sssContribution)}</td>
                          <td className="tabular px-3 py-2 text-[var(--text-secondary)]">{formatCurrencyCompact(l.sssWisp)}</td>
                          <td className="tabular px-3 py-2 text-[var(--text-secondary)]">{formatCurrencyCompact(l.philHealthContribution)}</td>
                          <td className="tabular px-3 py-2 text-[var(--text-secondary)]">{formatCurrencyCompact(l.hdmfContribution)}</td>
                          <td className="tabular px-3 py-2 text-[var(--text-secondary)]">{formatCurrencyCompact(l.withholdingTax)}</td>
                          <td className="tabular px-3 py-2 text-[var(--text-secondary)]">{formatCurrencyCompact(l.totalDeductionsOtherThanMandatories)}</td>
                          <td className="tabular px-3 py-2 font-medium text-[var(--text-primary)]">{formatCurrencyCompact(l.netPay)}</td>
                          <td className="px-3 py-2">{alreadyGenerated.has(l.employeeId) ? <Badge tone="good">Released</Badge> : <Badge tone="muted">Not released</Badge>}</td>
                          <td className="px-3 py-2">
                            {canManage && emp && (
                              <button onClick={() => setEditing(emp)} className="flex items-center gap-1 rounded-lg border border-[var(--border-hairline)] px-2 py-1 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40">
                                <Pencil size={12} /> Edit
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
            <div className="mt-3 text-right text-xs">
              <Link href="/modules/attendance" className="text-[var(--series-1)] hover:underline">Manage attendance for this period →</Link>
            </div>
          </div>
        </>
      )}

      {editing && period && (
        <PayrollLineEditModal
          employee={editing}
          period={period}
          line={lineByEmployee.get(editing.id) ?? null}
          overrides={payrollLineOverrides}
          onClose={() => setEditing(null)}
          onSaveOverride={(input) => {
            upsertPayrollLineOverride(input);
          }}
        />
      )}
    </div>
  );
}

type OverrideFormData = Omit<PayrollLineOverride, "id" | "updatedBy" | "updatedAt">;

function defaultOverrideForm(periodId: string, employeeId: string, overrides: PayrollLineOverride[]): OverrideFormData {
  const existing = overrides.find((o) => o.periodId === periodId && o.employeeId === employeeId);
  if (existing) {
    const rest: Partial<PayrollLineOverride> = { ...existing };
    delete rest.id;
    delete rest.updatedBy;
    delete rest.updatedAt;
    return rest as OverrideFormData;
  }
  return {
    periodId,
    employeeId,
    travelAllowance: 0,
    laundryAllowance: 0,
    medicalCashAllowance: 0,
    supervisorAllowance: 0,
    cashAdvance: 0,
    lsmBizLoan: 0,
    lsmCoopLoan: 0,
    shortages: 0,
    sssLoan: 0,
    hdmfLoan: 0,
    adjustmentAdd: 0,
    adjustmentDeduct: 0,
    sssContributionOverride: null,
    sssWispOverride: null,
    philHealthContributionOverride: null,
    hdmfContributionOverride: null,
    withholdingTaxOverride: null,
    dailyAllowanceOverride: null,
    basicPayOverride: null,
    latesUndertimeOverride: null,
    holidayPayOverride: null,
    vlPayOverride: null,
    slPayOverride: null,
    otHoursOverride: null,
    otPayOverride: null,
  };
}

interface AttendanceFormData {
  daysWorked: number;
  holidayDays: number;
  vlDays: number;
  slDays: number;
  lateAdjMinutes: number;
}

interface RateFormData {
  payrollType: Employee["payrollType"];
  dailyRate: number | null;
  monthlySalary: number | null;
}

function PayrollLineEditModal({
  employee,
  period,
  line,
  overrides,
  onClose,
  onSaveOverride,
}: {
  employee: Employee;
  period: { id: string };
  line: PayrollLine | null;
  overrides: PayrollLineOverride[];
  onClose: () => void;
  onSaveOverride: (input: OverrideFormData) => void;
}) {
  const { attendancePeriodRecords, upsertAttendancePeriodRecord, updateEmployee } = useHris();
  const attendanceRecord = attendancePeriodRecords.find((r) => r.periodId === period.id && r.employeeId === employee.id);

  const [form, setForm] = useState<OverrideFormData>(() => defaultOverrideForm(period.id, employee.id, overrides));
  const [attendance, setAttendance] = useState<AttendanceFormData>(() => ({
    daysWorked: attendanceRecord?.daysWorked ?? 0,
    holidayDays: attendanceRecord?.holidayDays ?? 0,
    vlDays: attendanceRecord?.vlDays ?? 0,
    slDays: attendanceRecord?.slDays ?? 0,
    lateAdjMinutes: attendanceRecord?.lateAdjMinutes ?? 0,
  }));
  const [rate, setRate] = useState<RateFormData>(() => ({
    payrollType: employee.payrollType,
    dailyRate: employee.dailyRate,
    monthlySalary: employee.monthlySalary,
  }));

  function setNum<K extends keyof OverrideFormData>(key: K, value: number) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function setOverride<K extends
    | "sssContributionOverride"
    | "sssWispOverride"
    | "philHealthContributionOverride"
    | "hdmfContributionOverride"
    | "withholdingTaxOverride"
    | "dailyAllowanceOverride"
    | "basicPayOverride"
    | "latesUndertimeOverride"
    | "holidayPayOverride"
    | "vlPayOverride"
    | "slPayOverride"
    | "otHoursOverride"
    | "otPayOverride">(key: K, value: number | null) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function setAttendanceField<K extends keyof AttendanceFormData>(key: K, value: number) {
    setAttendance((a) => ({ ...a, [key]: value }));
  }

  function save() {
    upsertAttendancePeriodRecord({
      periodId: period.id,
      employeeId: employee.id,
      daysWorked: attendance.daysWorked,
      holidayDays: attendance.holidayDays,
      vlDays: attendance.vlDays,
      slDays: attendance.slDays,
      lateAdjMinutes: attendance.lateAdjMinutes,
      notes: attendanceRecord?.notes ?? "",
    });
    updateEmployee(employee.id, {
      payrollType: rate.payrollType,
      dailyRate: rate.dailyRate,
      monthlySalary: rate.monthlySalary,
    });
    onSaveOverride(form);
    onClose();
  }

  return (
    <Modal open onClose={onClose} title={`Adjust payroll — ${fullName(employee)}`} wide>
      <div className="max-h-[70vh] space-y-5 overflow-y-auto pr-1">
        <FieldSection title="Payroll type & rate">
          <div className="grid grid-cols-2 gap-3">
            <SelectField
              label="Payroll type"
              value={rate.payrollType}
              onChange={(v) => setRate((r) => ({ ...r, payrollType: v as Employee["payrollType"] }))}
              options={[
                { value: "daily", label: "Daily-rate" },
                { value: "monthly", label: "Fixed-rate" },
              ]}
            />
            {rate.payrollType === "daily" ? (
              <NumberField label="Rate per day" value={rate.dailyRate ?? 0} onChange={(v) => setRate((r) => ({ ...r, dailyRate: v }))} />
            ) : (
              <NumberField label="Fixed monthly salary" value={rate.monthlySalary ?? 0} onChange={(v) => setRate((r) => ({ ...r, monthlySalary: v }))} />
            )}
          </div>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            {rate.payrollType === "daily"
              ? "Basic pay = rate per day × days worked."
              : "Basic pay is fixed at half the monthly salary, regardless of days worked."}
          </p>
        </FieldSection>

        <FieldSection title="Attendance for this period">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <NumberField label="Days working" value={attendance.daysWorked} onChange={(v) => setAttendanceField("daysWorked", v)} />
            <NumberField label="Holiday days" value={attendance.holidayDays} onChange={(v) => setAttendanceField("holidayDays", v)} />
            <NumberField label="VL days" value={attendance.vlDays} onChange={(v) => setAttendanceField("vlDays", v)} />
            <NumberField label="SL days" value={attendance.slDays} onChange={(v) => setAttendanceField("slDays", v)} />
            <NumberField label="Late/undertime (mins)" value={attendance.lateAdjMinutes} onChange={(v) => setAttendanceField("lateAdjMinutes", v)} />
            <OverrideField
              label="OT hours"
              auto={line?.otHoursAuto ?? 0}
              value={form.otHoursOverride}
              onChange={(v) => setOverride("otHoursOverride", v)}
            />
          </div>
          <p className="mt-1 text-xs text-[var(--text-muted)]">Saving here updates this employee&apos;s attendance record for the period directly. OT hours default to approved Overtime requests unless overridden.</p>
        </FieldSection>

        <FieldSection title="Earnings (auto-computed from the above — override if needed)">
          <div className="grid grid-cols-2 gap-3">
            <OverrideField label="Basic pay" auto={line?.basicPayAuto ?? 0} value={form.basicPayOverride} onChange={(v) => setOverride("basicPayOverride", v)} />
            <OverrideField label="Lates/undertime" auto={line?.latesUndertimeAuto ?? 0} value={form.latesUndertimeOverride} onChange={(v) => setOverride("latesUndertimeOverride", v)} />
            <OverrideField label="Holiday pay" auto={line?.holidayPayAuto ?? 0} value={form.holidayPayOverride} onChange={(v) => setOverride("holidayPayOverride", v)} />
            <OverrideField label="VL pay" auto={line?.vlPayAuto ?? 0} value={form.vlPayOverride} onChange={(v) => setOverride("vlPayOverride", v)} />
            <OverrideField label="SL pay" auto={line?.slPayAuto ?? 0} value={form.slPayOverride} onChange={(v) => setOverride("slPayOverride", v)} />
            <OverrideField label="OT pay" auto={line?.otPayAuto ?? 0} value={form.otPayOverride} onChange={(v) => setOverride("otPayOverride", v)} />
            <OverrideField label="Daily allowance" auto={line?.dailyAllowanceAuto ?? 0} value={form.dailyAllowanceOverride} onChange={(v) => setOverride("dailyAllowanceOverride", v)} />
          </div>
        </FieldSection>

        <FieldSection title="Other allowances">
          <div className="grid grid-cols-2 gap-3">
            <NumberField label="Travel allowance" value={form.travelAllowance} onChange={(v) => setNum("travelAllowance", v)} />
            <NumberField label="Laundry allowance" value={form.laundryAllowance} onChange={(v) => setNum("laundryAllowance", v)} />
            <NumberField label="Medical cash allowance" value={form.medicalCashAllowance} onChange={(v) => setNum("medicalCashAllowance", v)} />
            <NumberField label="Supervisor allowance" value={form.supervisorAllowance} onChange={(v) => setNum("supervisorAllowance", v)} />
          </div>
        </FieldSection>

        <FieldSection title="Loans / cash advance / shortages">
          <div className="grid grid-cols-2 gap-3">
            <NumberField label="Cash advance" value={form.cashAdvance} onChange={(v) => setNum("cashAdvance", v)} />
            <NumberField label="LSM Biz Loan" value={form.lsmBizLoan} onChange={(v) => setNum("lsmBizLoan", v)} />
            <NumberField label="LSM Coop Loan" value={form.lsmCoopLoan} onChange={(v) => setNum("lsmCoopLoan", v)} />
            <NumberField label="Shortage deduction" value={form.shortages} onChange={(v) => setNum("shortages", v)} />
            <NumberField label="SSS loan" value={form.sssLoan} onChange={(v) => setNum("sssLoan", v)} />
            <NumberField label="Pag-IBIG (HDMF) loan" value={form.hdmfLoan} onChange={(v) => setNum("hdmfLoan", v)} />
          </div>
        </FieldSection>

        <FieldSection title="Statutory contributions (half of the monthly amount, every cutoff — override if needed)">
          <div className="grid grid-cols-2 gap-3">
            <OverrideField
              label="SSS contribution"
              auto={line?.sssContributionAuto ?? 0}
              value={form.sssContributionOverride}
              onChange={(v) => setOverride("sssContributionOverride", v)}
            />
            <OverrideField
              label="SSS WISP"
              auto={line?.sssWispAuto ?? 0}
              value={form.sssWispOverride}
              onChange={(v) => setOverride("sssWispOverride", v)}
            />
            <OverrideField
              label="PhilHealth contribution"
              auto={line?.philHealthContributionAuto ?? 0}
              value={form.philHealthContributionOverride}
              onChange={(v) => setOverride("philHealthContributionOverride", v)}
            />
            <OverrideField
              label="Pag-IBIG (HDMF) contribution"
              auto={line?.hdmfContributionAuto ?? 0}
              value={form.hdmfContributionOverride}
              onChange={(v) => setOverride("hdmfContributionOverride", v)}
            />
            <OverrideField
              label="Withholding tax"
              auto={line?.withholdingTax != null && form.withholdingTaxOverride == null ? line.withholdingTax : 0}
              value={form.withholdingTaxOverride}
              onChange={(v) => setOverride("withholdingTaxOverride", v)}
            />
          </div>
        </FieldSection>

        <FieldSection title="Adjustments">
          <div className="grid grid-cols-2 gap-3">
            <NumberField label="Adjustment (add)" value={form.adjustmentAdd} onChange={(v) => setNum("adjustmentAdd", v)} />
            <NumberField label="Adjustment (deduct)" value={form.adjustmentDeduct} onChange={(v) => setNum("adjustmentDeduct", v)} />
          </div>
        </FieldSection>

        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="rounded-lg px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40">Cancel</button>
          <button onClick={save} className="rounded-lg bg-[var(--series-1)] px-3 py-1.5 text-sm font-medium text-[var(--on-accent)]">Save changes</button>
        </div>
      </div>
    </Modal>
  );
}

function FieldSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 text-xs font-semibold text-[var(--text-muted)] uppercase">{title}</div>
      {children}
    </div>
  );
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">{label}</label>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value === "" ? 0 : Number(e.target.value))}
        className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-2 text-sm"
      />
    </div>
  );
}

function SelectField({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-2 text-sm">
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
  );
}

function OverrideField({ label, auto, value, onChange }: { label: string; auto: number; value: number | null; onChange: (v: number | null) => void }) {
  const isOverridden = value !== null;
  return (
    <div>
      <label className="mb-1 flex items-center justify-between text-xs font-medium text-[var(--text-secondary)]">
        <span>{label}</span>
        <button
          type="button"
          onClick={() => onChange(isOverridden ? null : auto)}
          className="text-[10px] font-semibold text-[var(--series-1)] hover:underline"
        >
          {isOverridden ? "Use auto" : "Override"}
        </button>
      </label>
      {isOverridden ? (
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(e.target.value === "" ? 0 : Number(e.target.value))}
          className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-2 text-sm"
        />
      ) : (
        <div className="w-full rounded-lg border border-dashed border-[var(--border-hairline)] bg-[var(--gridline)]/20 px-3 py-2 text-sm text-[var(--text-muted)]">
          {formatCurrencyCompact(auto)} (auto)
        </div>
      )}
    </div>
  );
}
