import { FormAmountRow, FormFootnote, FormRow, FormSection, FormShell } from "@/components/bir/FormLayout";
import { COMPANY_INFO } from "@/lib/bir";
import { withShownNames } from "@/lib/demo-mode";
import { currentCompany } from "@/lib/companies";
import { ALLOWANCE_PARTS, payrollLabel } from "@/lib/payroll-layout";
import { branchName, departmentName, formatCurrency, formatDate, fullName, positionTitle } from "@/lib/helpers";
import type { Employee, PayrollPeriod } from "@/lib/types";
import type { PayrollLine } from "@/lib/payroll";
import { componentKind, componentLabel, netEffect, type SalaryAdjustment } from "@/lib/salary-adjustments";

// Signature block at the foot of every payslip.
export const PAYSLIP_SIGNATORIES = withShownNames(currentCompany().payslipSignatories);

function DocHeader({ title, subtitle, half = false }: { title: string; subtitle?: string; half?: boolean }) {
  if (half)
    return (
      <div className="mb-5 flex items-end justify-between gap-4 border-b-2 border-[#0b0b0b] pb-2">
        <div>
          <div className="font-bold uppercase">{COMPANY_INFO.name}</div>
          <div className="text-[#52514e]">{COMPANY_INFO.address}</div>
          <div className="text-[#52514e]">
            {COMPANY_INFO.phone} · {COMPANY_INFO.email}
          </div>
        </div>
        <div className="text-right">
          <h1 className="text-base font-bold">{title}</h1>
          {subtitle && <div className="text-[#52514e]">{subtitle}</div>}
        </div>
      </div>
    );
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

// An earnings or deductions line, left off the payslip when its amount is
// zero. Negative amounts (lates, undertime) are still shown.
function PayslipAmount({ label, value }: { label: string; value: number }) {
  if (Math.abs(value || 0) < 0.005) return null;
  return <FormAmountRow label={label} value={value} />;
}

// adjustments: this employee's salary adjustments for the period. They are
// listed only when they add up to the adjustment amount already in this
// payslip, so an older payslip never shows notes for changes it doesn't include.
// half: laid out to fill half an A4 sheet (two payslips per page), with
// earnings and deductions side by side.
export function PayslipDocument({
  employee,
  period,
  line,
  adjustments = [],
  half = false,
}: {
  employee: Employee;
  period: PayrollPeriod;
  line: PayrollLine;
  adjustments?: SalaryAdjustment[];
  half?: boolean;
}) {
  const mine = adjustments.filter((a) => a.employeeId === employee.id && a.periodId === period.id);
  const mineNet = Math.round(mine.reduce((t, a) => t + netEffect(a), 0) * 100) / 100;
  const showItems = mine.length > 0 && Math.abs(mineNet - line.salaryAdjustmentNet) < 0.005;
  return (
    <FormShell>
      <div className={half ? "payslip-compact payslip-half" : "payslip-compact"}>
        <DocHeader title="Employee Payslip" subtitle={`Pay period: ${formatDate(period.start)} – ${formatDate(period.end)}`} half={half} />

        <FormSection title="Employee Information">
          <FormRow label="Employee ID" value={employee.employeeNumber} mono />
          <FormRow label="Name" value={fullName(employee)} />
          <FormRow label="Position" value={positionTitle(employee.positionId)} />
          <FormRow label="Branch / Department" value={`${branchName(employee.branchId)} / ${departmentName(employee.departmentId)}`} />
          <FormRow label="Rate per day" value={line.ratePerDay.toFixed(2)} mono />
          <FormRow label="Days working" value={line.daysWorking} mono />
        </FormSection>

        <div className={half ? "grid grid-cols-2 items-start gap-x-4" : undefined}>
        <FormSection title="Earnings">
          <PayslipAmount label="Basic Pay" value={line.basicPay} />
          <PayslipAmount label={payrollLabel("latesUndertime", "Late Deduction")} value={-line.latesUndertime || 0} />
          <PayslipAmount label="Undertime Deduction" value={-line.undertimeDeduction || 0} />
          {currentCompany().allowanceBreakdown ? (
            <>
              <PayslipAmount label="De Minimis" value={ALLOWANCE_PARTS.filter((p) => p.deMinimis).reduce((t, p) => t + line[p.key], 0)} />
              {ALLOWANCE_PARTS.filter((p) => !p.deMinimis).map((p) => (
                <PayslipAmount key={p.key} label={p.label} value={line[p.key]} />
              ))}
            </>
          ) : (
            <PayslipAmount label={payrollLabel("netAllowances", "Net Allowances")} value={line.netAllowances} />
          )}
          <PayslipAmount label={payrollLabel("otPay", "Overtime Pay")} value={line.otPay} />
          <PayslipAmount label="Holiday Pay" value={line.holidayPay} />
          <PayslipAmount label="Sick Leave Pay" value={line.slPay} />
          <PayslipAmount label={payrollLabel("vlPay", "Vacation Leave Pay")} value={line.vlPay} />
          <PayslipAmount label={payrollLabel("adjustmentAdd", "Adjustment (Add)")} value={line.adjustmentAdd} />
          <FormAmountRow label="Gross Pay" value={line.grossSalary + line.adjustmentAdd} bold />
        </FormSection>

        <FormSection title="Deductions">
          <PayslipAmount label="Cash Advance" value={line.cashAdvance} />
          <PayslipAmount label={payrollLabel("lsmBizLoan", "LSM Biz Loan")} value={line.lsmBizLoan} />
          <PayslipAmount label={payrollLabel("lsmCoopLoan", "LSM Coop Loan")} value={line.lsmCoopLoan} />
          <PayslipAmount label="Shortage Deduction" value={line.shortages} />
          <PayslipAmount label="SSS Contribution" value={line.sssContribution} />
          <PayslipAmount label="SSS WISP" value={line.sssWisp} />
          <PayslipAmount label="SSS Loan" value={line.sssLoan} />
          <PayslipAmount label="PhilHealth Contribution" value={line.philHealthContribution} />
          <PayslipAmount label="Pag-IBIG (HDMF) Contribution" value={line.hdmfContribution} />
          <PayslipAmount label="Pag-IBIG (HDMF) Loan" value={line.hdmfLoan} />
          <PayslipAmount label="Pag-IBIG (HDMF) MP2 Savings" value={line.hdmfMp2Savings} />
          <PayslipAmount label="Withholding Tax" value={line.withholdingTax} />
          <PayslipAmount label={payrollLabel("adjustmentDeduct", "Adjustment (Deduct)")} value={line.adjustmentDeduct} />
          <FormAmountRow label="Total Deductions" value={line.totalDeductionsOtherThanMandatories + line.totalMandatories + line.adjustmentDeduct} bold />
        </FormSection>
        </div>

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

        <div className="mt-8 grid grid-cols-3 gap-4 text-center text-xs break-inside-avoid">
          {PAYSLIP_SIGNATORIES.map((p) => (
            <div key={p.role}>
              <div className="text-left text-[11px] text-[#52514e]">{p.role}:</div>
              <div className="mt-1 font-semibold">{p.name}</div>
              <div className="text-[11px] text-[#52514e]">{p.title}</div>
            </div>
          ))}
        </div>

        <FormFootnote>
          For verification: contact {currentCompany().shortName} HR Department thru {COMPANY_INFO.email} or {COMPANY_INFO.phone}.
        </FormFootnote>
      </div>
    </FormShell>
  );
}
