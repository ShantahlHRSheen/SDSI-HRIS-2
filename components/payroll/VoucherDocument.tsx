import { FormAmountRow, FormFootnote, FormRow, FormSection, FormShell } from "@/components/bir/FormLayout";
import { COMPANY_INFO } from "@/lib/bir";
import { branchName, departmentName, formatDate, fullName, positionTitle } from "@/lib/helpers";
import type { Employee, PayrollPeriod } from "@/lib/types";

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

export function VoucherDocument({ employee, period, amount }: { employee: Employee; period: PayrollPeriod; amount: number }) {
  return (
    <FormShell>
      <DocHeader title="Allowance Voucher" subtitle={`Pay period: ${formatDate(period.start)} – ${formatDate(period.end)}`} />

      <FormSection title="Recipient Information">
        <FormRow label="Employee ID" value={employee.employeeNumber} mono />
        <FormRow label="Name" value={fullName(employee)} />
        <FormRow label="Position" value={positionTitle(employee.positionId)} />
        <FormRow label="Branch / Department" value={`${branchName(employee.branchId)} / ${departmentName(employee.departmentId)}`} />
        <FormRow label="Engagement type" value={employee.employmentStatus.replace("_", " ")} />
      </FormSection>

      <FormSection title="Voucher Amount">
        <FormAmountRow label="Total Amount" value={amount} bold />
      </FormSection>

      <FormFootnote>
        Generated automatically from finalized payroll records in the HRIS for project-based / freelance personnel.
        This is a demo voucher and not an official disbursement document.
      </FormFootnote>
    </FormShell>
  );
}
