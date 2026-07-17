import { FormAmountRow, FormFootnote, FormHeader, FormRow, FormSection, FormShell } from "./FormLayout";
import { COMPANY_INFO, type Form1601CData } from "@/lib/bir";

export function Form1601CDocument({ data }: { data: Form1601CData }) {
  return (
    <FormShell>
      <FormHeader
        formNo="1601-C"
        title="Monthly Remittance Return of Income Taxes Withheld on Compensation"
        subtitle={`For the month of ${data.monthLabel}`}
      />

      <FormSection title="Part I — Background Information">
        <FormRow label="Employer / Withholding Agent" value={COMPANY_INFO.name} />
        <FormRow label="Employer TIN" value={COMPANY_INFO.tin} mono />
        <FormRow label="Registered Address" value={COMPANY_INFO.address} />
        <FormRow label="RDO Code" value={COMPANY_INFO.rdoCode} />
      </FormSection>

      <FormSection title="Part II — Payroll Period">
        <FormRow label="Tax period" value={data.monthLabel} />
        <FormRow label="Payroll month / year" value={data.monthLabel} />
        <FormRow label="Employees covered" value={data.employeeCount} mono />
      </FormSection>

      <FormSection title="Part III — Tax Withheld / Remittance">
        <FormAmountRow label="Total Compensation Paid" value={data.totalCompensationPaid} />
        <FormAmountRow label="Total Tax Withheld" value={data.totalTaxWithheld} />
        <FormAmountRow label="Total Amount to be Remitted" value={data.totalAmountToRemit} bold />
      </FormSection>

      <FormFootnote>
        Generated automatically from finalized payroll records in the HRIS — no manual encoding. Figures are computed
        using illustrative/placeholder withholding-tax brackets and employer TIN/RDO; verify against the current BIR
        Revenue Regulation and the company&rsquo;s actual Certificate of Registration before filing via eBIRForms /
        eFPS. This is not an official BIR document.
      </FormFootnote>
    </FormShell>
  );
}
