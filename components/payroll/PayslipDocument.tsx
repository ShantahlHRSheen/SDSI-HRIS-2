import { FormAmountRow, FormFootnote, FormRow, FormSection, FormShell } from "@/components/bir/FormLayout";
import { COMPANY_INFO } from "@/lib/bir";
import { branchName, departmentName, formatCurrency, formatDate, fullName, positionTitle } from "@/lib/helpers";
import type { Employee, PayrollPeriod } from "@/lib/types";
import type { PayrollLine } from "@/lib/payroll";
import { componentKind, componentLabel, netEffect, type SalaryAdjustment } from "@/lib/salary-adjustments";

function DocHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-5 border-b-2 border-[#0b0b0b] pb-3">
      <div className="text-sm font-bold uppercase">{COMPANY_INFO.name}</div>
      <div className="text-xs text-[#52514e]">{COMPANY_INFO.address}</div>
      <div className="text-xs text-[#52514e]">{COMPANY_INFO.phone}</div>
      <div className="text-xs text-[#52514e]">{COMPANY_INFO.email}</div>
      <h1 className="mt-3 text-lg font-bold">{title}</h1>
      {subtitle && <div className="text-xs text-[#52514e]">{subtitle}</div>}
    </div>
  );
}

// adjustments: this employee's salary adjustments for the period. They are
// listed only when they add up to the adjustment amount already in this
// payslip, so an older payslip never shows notes for changes it doesn't include.
export function PayslipDocument({ employee, period, line, adjustments = [] }: { employee: Employee; period: PayrollPeriod; line: PayrollLine; adjustments?: SalaryAdjustment[] }) {
  const mine = adjustments.filter((a) => a.employeeId === employee.id && a.periodId === period.id);
  const mineNet = Math.round(mine.reduce((t, a) => t + netEffect(a), 0) * 100) / 100;
  const showItems = mine.length > 0 && Math.abs(mineNet - line.salaryAdjustmentNet) < 0.005;
  return (
    <FormShell>
      <DocHeader title="Employee Payslip" subtitle={`Pay period: ${formatDate(period.start)} – ${formatDate(period.end)}`} />

      <FormSection title="Employee Information">
        <FormRow label="Employee ID" value={employee.employeeNumber} mono />
        <FormRow label="Name" value={fullName(employee)} />
        <FormRow label="Position" value={positionTitle(employee.positionId)} />
        <FormRow label="Branch / Department" value={`${branchName(employee.branchId)} / ${departmentName(employee.departmentId)}`} />
        <FormRow label="Rate per day" value={line.ratePerDay.toFixed(2)} mono />
        <FormRow label="Days working" value={line.daysWorking} mono />
      </FormSection>

      <FormSection title="Earnings">
        <FormAmountRow label="Basic Pay" value={line.basicPay} />
        {line.latesUndertime > 0 && <FormAmountRow label="Late Deduction" value={-line.latesUndertime} />}
        {line.undertimeDeduction > 0 && <FormAmountRow label="Undertime Deduction" value={-line.undertimeDeduction} />}
        <FormAmountRow label="Net Allowances" value={line.netAllowances} />
        <FormAmountRow label="Overtime Pay" value={line.otPay} />
        <FormAmountRow label="Holiday Pay" value={line.holidayPay} />
        <FormAmountRow label="Sick Leave Pay" value={line.slPay} />
        <FormAmountRow label="Vacation Leave Pay" value={line.vlPay} />
        {line.adjustmentAdd > 0 && <FormAmountRow label="Adjustment (Add)" value={line.adjustmentAdd} />}
        <FormAmountRow label="Gross Pay" value={line.grossSalary + line.adjustmentAdd} bold />
      </FormSection>

      <FormSection title="Deductions">
        {line.cashAdvance > 0 && <FormAmountRow label="Cash Advance" value={line.cashAdvance} />}
        {line.lsmBizLoan > 0 && <FormAmountRow label="LSM Biz Loan" value={line.lsmBizLoan} />}
        {line.lsmCoopLoan > 0 && <FormAmountRow label="LSM Coop Loan" value={line.lsmCoopLoan} />}
        {line.shortages > 0 && <FormAmountRow label="Shortage Deduction" value={line.shortages} />}
        <FormAmountRow label="SSS Contribution" value={line.sssContribution} />
        <FormAmountRow label="SSS WISP" value={line.sssWisp} />
        {line.sssLoan > 0 && <FormAmountRow label="SSS Loan" value={line.sssLoan} />}
        <FormAmountRow label="PhilHealth Contribution" value={line.philHealthContribution} />
        <FormAmountRow label="Pag-IBIG (HDMF) Contribution" value={line.hdmfContribution} />
        {line.hdmfLoan > 0 && <FormAmountRow label="Pag-IBIG (HDMF) Loan" value={line.hdmfLoan} />}
        {line.hdmfMp2Savings > 0 && <FormAmountRow label="Pag-IBIG (HDMF) MP2 Savings" value={line.hdmfMp2Savings} />}
        <FormAmountRow label="Withholding Tax" value={line.withholdingTax} />
        {line.adjustmentDeduct > 0 && <FormAmountRow label="Adjustment (Deduct)" value={line.adjustmentDeduct} />}
        <FormAmountRow label="Total Deductions" value={line.totalDeductionsOtherThanMandatories + line.totalMandatories + line.adjustmentDeduct} bold />
      </FormSection>

      {(showItems || line.salaryAdjustmentNet !== 0) && (
        <FormSection title="Salary Adjustments (included above)">
          {showItems ? (
            mine.map((a) => (
              <div key={a.id} className="flex items-start justify-between gap-4 px-2 py-1.5">
                <span className="text-[#52514e]">
                  <span className="font-medium text-[#0b0b0b]">Salary adjustment — {componentLabel(a.component)}</span>
                  {componentKind(a.component) === "deduction" && <span> (deduction)</span>}
                  <span className="block text-xs">{a.description}</span>
                </span>
                <span className="tabular text-right whitespace-nowrap">
                  {a.amount > 0 ? "+" : "−"}
                  {formatCurrency(Math.abs(a.amount))}
                </span>
              </div>
            ))
          ) : (
            <FormRow label="Salary adjustments (total)" value={`${line.salaryAdjustmentNet > 0 ? "+" : "−"}${formatCurrency(Math.abs(line.salaryAdjustmentNet))}`} mono />
          )}
          <FormAmountRow label="Total salary adjustments" value={line.salaryAdjustmentNet} bold />
        </FormSection>
      )}

      <FormSection title="Net Pay">
        <FormAmountRow label="Net Pay" value={line.netPay} bold />
      </FormSection>

      <FormFootnote>
        SSS, SSS WISP, PhilHealth, and Pag-IBIG contributions are exactly half of the employee&apos;s full monthly share, deducted on every cutoff. Generated automatically from
        finalized payroll records in the HRIS, using the official SSS / PhilHealth / Pag-IBIG contribution schedules and the BIR semi-monthly withholding tax table applied to each
        employee&apos;s Basis of Mandatories. This is a demo payslip and not an official payroll document.
      </FormFootnote>
    </FormShell>
  );
}
