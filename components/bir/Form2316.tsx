import { FormAmountRow, FormFootnote, FormHeader, FormRow, FormSection, FormShell } from "./FormLayout";
import { COMPANY_INFO, employeeGovIds, type Form2316Data } from "@/lib/bir";
import { branchName, departmentName, fullName, positionTitle } from "@/lib/helpers";

export function Form2316Document({ data }: { data: Form2316Data }) {
  const ids = employeeGovIds(data.employee);
  return (
    <FormShell>
      <FormHeader
        formNo="2316"
        title="Certificate of Compensation Payment / Tax Withheld"
        subtitle={`For the year ${data.taxYear} (covering ${data.monthsCovered} of available payroll history)`}
      />

      <FormSection title="Part I — Employer Information">
        <FormRow label="Employer Name" value={COMPANY_INFO.name} />
        <FormRow label="Employer TIN" value={COMPANY_INFO.tin} mono />
        <FormRow label="Registered Address" value={COMPANY_INFO.address} />
        <FormRow label="RDO Code" value={COMPANY_INFO.rdoCode} />
      </FormSection>

      <FormSection title="Part II — Employee Information">
        <FormRow label="Employee ID" value={data.employee.employeeNumber} mono />
        <FormRow label="Employee Name" value={fullName(data.employee)} />
        <FormRow label="Employee TIN" value={ids.tin} mono />
        <FormRow label="Address" value={data.employee.address} />
        <FormRow label="Employment Status" value={data.employee.employmentStatus.replace("_", " ")} />
        <FormRow label="Position" value={`${positionTitle(data.employee.positionId)} · ${departmentName(data.employee.departmentId)} · ${branchName(data.employee.branchId)}`} />
      </FormSection>

      <FormSection title="Part III — Compensation Information">
        <FormAmountRow label="Basic Salary" value={data.basicSalary} />
        <FormAmountRow label="Allowances" value={data.allowances} />
        <FormAmountRow label="Overtime Pay" value={data.overtimePay} />
        <FormAmountRow label="Holiday Pay" value={data.holidayPay} />
        <FormAmountRow label="Leave Pay" value={data.leavePay} />
        <FormAmountRow label="13th Month Pay" value={data.thirteenthMonthPay} />
        <FormAmountRow label="Other Benefits" value={data.otherBenefits} />
        <FormAmountRow label="De Minimis Benefits" value={data.deMinimisBenefits} />
        <FormAmountRow label="Gross Compensation" value={data.grossCompensation} bold />
        <FormAmountRow label="Non-Taxable Compensation" value={data.nonTaxableCompensation} />
        <FormAmountRow label="Taxable Compensation" value={data.taxableCompensation} bold />
      </FormSection>

      <FormSection title="Part IV — Government Contributions (Employee Share)">
        <FormAmountRow label="Employee SSS Contribution" value={data.employeeSSS} />
        <FormAmountRow label="Employee PhilHealth Contribution" value={data.employeePhilHealth} />
        <FormAmountRow label="Employee HDMF (Pag-IBIG) Contribution" value={data.employeeHDMF} />
      </FormSection>

      <FormSection title="Part V — Tax Information">
        <FormAmountRow label="Total Tax Withheld" value={data.totalTaxWithheld} />
        <FormAmountRow label="Net Tax Due" value={data.netTaxDue} bold />
      </FormSection>

      <FormFootnote>
        Generated automatically from finalized payroll records in the HRIS — no manual encoding. SSS / PhilHealth /
        HDMF rates and withholding-tax brackets are illustrative placeholders; TIN and RDO code shown are masked
        demo values. Net Tax Due assumes no year-end annualization adjustment. Verify against actual BIR-registered
        values before issuing to the employee or filing. This is not an official BIR document.
      </FormFootnote>
    </FormShell>
  );
}
