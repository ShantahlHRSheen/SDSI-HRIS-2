export interface ModuleStub {
  title: string;
  description: string;
  specSection: string;
  planned: string[];
}

export const MODULE_STUBS: Record<string, ModuleStub> = {
  attendance: {
    title: "Attendance Management",
    description: "Manual encoding and CSV import of daily time records, with automatic computation of late/undertime minutes, holiday and rest-day work, and per-period summaries.",
    specSection: "§4.2",
    planned: ["Daily attendance encoding form + CSV import", "Attendance by payroll period / employee / branch reports", "Late & undertime automatic computation", "Biometric-ready data model (no hardware integration yet)"],
  },
  leave: {
    title: "Leave Management",
    description: "Leave filing with an Employee → Supervisor → HR approval chain, a shared leave calendar, and per-type credit/balance tracking.",
    specSection: "§4.3",
    planned: ["Leave filing form with medical certificate upload", "Approval / rejection / cancellation workflow", "Leave calendar & ledger", "Per-type balance tracking, configurable in System Administration"],
  },
  overtime: {
    title: "Overtime Management",
    description: "Overtime requests routed to the immediate supervisor, with approved hours feeding directly into payroll computation.",
    specSection: "§4.4",
    planned: ["OT request form", "Supervisor approval workflow", "OT history & summary by employee/branch", "Feed into payroll engine (§5)"],
  },
  corrections: {
    title: "Attendance Correction",
    description: "Employee-initiated correction requests for missing time in/out, incorrect time, wrong shift, or biometric failure.",
    specSection: "§4.5",
    planned: ["Correction request form with supporting document upload", "Employee → Supervisor → HR approval chain", "Correction history per employee"],
  },
  payroll: {
    title: "Payroll Processing",
    description: "The full computation → HR review → manual adjustment → approval → lock → payslip workflow described in the build spec.",
    specSection: "§4.6, §5",
    planned: ["Automatic computation from attendance + approved leave/OT", "Manual line-item overrides (audit-logged)", "Payroll lock workflow", "Configurable, versioned SSS/PhilHealth/Pag-IBIG/withholding-tax tables"],
  },
  payslips: {
    title: "Payslip Management",
    description: "Auto-generated, optionally password-protected PDF payslips with full history per employee and automatic email delivery.",
    specSection: "§4.7",
    planned: ["PDF payslip generation (react-pdf / pdf-lib)", "Password protection option", "Auto-email on release", "Full payslip history per employee"],
  },
  vouchers: {
    title: "Allowance Vouchers",
    description: "Generation, printing, and history/summary of allowance vouchers for project-based and other non-regular personnel.",
    specSection: "§4.9",
    planned: ["Voucher generation per period", "Print-friendly voucher layout", "History and summary per recipient"],
  },
  "gov-reports": {
    title: "Government Reports",
    description: "SSS, PhilHealth, Pag-IBIG contribution reports and BIR reports including Form 2316, in exportable PDF/CSV/Excel formats.",
    specSection: "§4.10",
    planned: ["SSS / PhilHealth / Pag-IBIG contribution reports", "BIR Form 2316 generation", "Exportable PDF / CSV / Excel formats — exact layouts to be verified against current government forms before go-live"],
  },
  "thirteenth-month": {
    title: "13th Month Pay",
    description: "Forecasted and actual 13th month pay computation, with history per employee and year.",
    specSection: "§4.11",
    planned: ["Forecasted computation (mid-year projection)", "Actual computation at year-end", "Per-employee, per-year history"],
  },
  notifications: {
    title: "Notification Center",
    description: "In-app and email notifications for approvals, payroll release, evaluation schedules, and announcements.",
    specSection: "§4.19",
    planned: ["Unified in-app notification feed (preview shown in the top bar bell icon)", "Email delivery via Supabase SMTP / Resend", "Per-user notification preferences"],
  },
  "org-chart": {
    title: "Organization Chart",
    description: "An interactive org chart derived from the supervisor relationships already modeled in the Employee Directory.",
    specSection: "§4.17",
    planned: ["Interactive expandable tree view, company-wide and per-branch", "Auto-derived from `supervisor_id`, with manual override for org chart uploads"],
  },
};
