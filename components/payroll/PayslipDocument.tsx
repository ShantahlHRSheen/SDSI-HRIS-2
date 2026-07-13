import { FormAmountRow, FormFootnote, FormRow, FormSection, FormShell } from "@/components/bir/FormLayout";
import { COMPANY_INFO } from "@/lib/bir";
import { branchName, departmentName, formatDate, fullName, positionTitle } from "@/lib/helpers";
import type { Employee, PayrollPeriod } from "@/lib/types";
import type { PayrollLine } from "@/lib/payroll";

function DocHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-5 border-b-2 border-[#0b0b0b] pb-3">
      <div className="text-sm font-bold uppercase">{COMPANY_INFO.name}</div>
      <div className="text-xs text-[#52514e]">{COMPANY_INFO.address}</div>
      <h1 className="mt-3 text-lg font-bold">{title}</h1>
      {subtitle && <div className="text-xs text-[#52514e]">{subtitle}</div>}
    </div>
  );
}

export function PayslipDocument({ employee, period, line }: { employee: Employee; period: PayrollPeriod; line: PayrollLine }) {
  return (
    <FormShell>
      <DocHeader title="Employee Payslip" subtitle={`Pay period: ${formatDate(period.start)} – ${formatDate(period.end)}`} />

      <FormSection title="Employee Information">
        <FormRow label="Employee ID" value={employee.employeeNumber} mono />
        <FormRow label="Name" value={fullName(employee)} />
        <FormRow label="Position" value={positionTitle(employee.positionId)} />
        <FormRow label="Branch / Department" value={`${branchName(employee.branchId)} / ${departmentName(employee.departmentId)}`} />
      </FormSection>

      <FormSection title="Earnings">
        <FormAmountRow label="Basic Pay" value={line.basicPay} />
        <FormAmountRow label="Allowances" value={line.allowances} />
        <FormAmountRow label="Overtime Pay" value={line.overtimePay} />
        <FormAmountRow label="Holiday Pay" value={line.holidayPay} />
        <FormAmountRow label="Leave Pay" value={line.leavePay} />
        <FormAmountRow label="Gross Pay" value={line.grossPay} bold />
      </FormSection>

      <FormSection title="Deductions">
        <FormAmountRow label="SSS Contribution" value={line.employeeSSS} />
        <FormAmountRow label="PhilHealth Contribution" value={line.employeePhilHealth} />
        <FormAmountRow label="Pag-IBIG (HDMF) Contribution" value={line.employeeHDMF} />
        <FormAmountRow label="Withholding Tax" value={line.withholdingTax} />
        <FormAmountRow label="Total Deductions" value={line.totalDeductions} bold />
      </FormSection>

      <FormSection title="Net Pay">
        <FormAmountRow label="Net Pay" value={line.netPay} bold />
      </FormSection>

      <FormFootnote>
        Generated automatically from finalized payroll records in the HRIS. SSS / PhilHealth / Pag-IBIG rates and
        withholding-tax brackets are illustrative placeholders. This is a demo payslip and not an official payroll
        document.
      </FormFootnote>
    </FormShell>
  );
}
