import type { Role } from "./types";

export interface NavItem {
  label: string;
  href: string;
  roles: Role[];
  built: boolean;
}

export interface NavSection {
  title: string;
  // Pinned sections are always shown (Dashboard, Bulletin Board); the others
  // are groups that open when clicked (components/Sidebar.tsx).
  pinned?: boolean;
  items: NavItem[];
}

const ALL_ROLES: Role[] = [
  "hr_admin", "payroll_officer", "sr_accounting_assistant", "treasurer", "cfo",
  "dept_head", "employee", "upper_management", "sys_admin",
];

export const NAV_SECTIONS: NavSection[] = [
  {
    title: "Overview",
    pinned: true,
    items: [
      { label: "Dashboard", href: "/dashboard", roles: ALL_ROLES, built: true },
      { label: "Bulletin Board", href: "/bulletin", roles: ALL_ROLES, built: true },
    ],
  },
  {
    title: "Communication",
    items: [
      // Only for companies with Messages on (lib/companies.ts chat; components/Sidebar.tsx).
      { label: "Messages", href: "/chat", roles: ALL_ROLES, built: true },
      { label: "Meetings", href: "/meetings", roles: ALL_ROLES, built: true },
      { label: "Chat with HR", href: "/messages", roles: ALL_ROLES, built: true },
    ],
  },
  {
    title: "My Records",
    items: [
      { label: "My ID Card", href: "/id-card", roles: ALL_ROLES, built: true },
      { label: "My Payslips", href: "/my-payslips", roles: ALL_ROLES, built: true },
      { label: "My Notices", href: "/my-notices", roles: ALL_ROLES, built: true },
      { label: "BIR Form 2316", href: "/bir/2316", roles: ["hr_admin", "cfo", "payroll_officer", "upper_management", "employee"], built: true },
      { label: "Certificate of Employment", href: "/coe", roles: ALL_ROLES, built: true },
      { label: "Pag-IBIG Loan Form", href: "/pagibig-loan", roles: ALL_ROLES, built: true },
      { label: "Employee Handbook", href: "/handbook", roles: ALL_ROLES, built: true },
    ],
  },
  {
    title: "Time & Attendance",
    items: [
      { label: "Attendance", href: "/modules/attendance", roles: ALL_ROLES, built: true },
      { label: "Work From Home", href: "/wfh", roles: ALL_ROLES, built: true },
      { label: "Leave Management", href: "/modules/leave", roles: ALL_ROLES, built: true },
      { label: "Overtime", href: "/modules/overtime", roles: ALL_ROLES, built: true },
      { label: "Attendance Corrections", href: "/modules/corrections", roles: ALL_ROLES, built: true },
      { label: "Travel Allowance", href: "/modules/travel", roles: ALL_ROLES, built: true },
    ],
  },
  {
    title: "Employee Relations",
    items: [
      { label: "Employee Directory", href: "/employees", roles: ["hr_admin", "dept_head", "upper_management", "sys_admin", "payroll_officer"], built: true },
      { label: "Org Chart", href: "/modules/org-chart", roles: ALL_ROLES, built: true },
      // Also shown to anyone named as a head on an evaluation (components/Sidebar.tsx).
      { label: "Performance Evaluations", href: "/sales-admin-evaluation", roles: ["hr_admin", "upper_management", "dept_head"], built: true },
      { label: "Regularization", href: "/regularization", roles: ALL_ROLES, built: true },
      { label: "Probation Extension", href: "/probation-extension", roles: ALL_ROLES, built: true },
      { label: "Discipline", href: "/discipline", roles: ["hr_admin", "dept_head", "upper_management"], built: true },
      // Also shown to the company's confidential viewers (components/Sidebar.tsx).
      { label: "Confidential Cases", href: "/confidential-cases", roles: ["hr_admin"], built: true },
    ],
  },
  {
    title: "Hiring & Website",
    items: [
      // Heads start personnel requisitions here; also shown to anyone a hiring record
      // is assigned to (components/Sidebar.tsx).
      { label: "Hiring & Onboarding", href: "/hiring", roles: ["hr_admin", "dept_head", "upper_management"], built: true },
      // The public website (/): news, job posts, company profile.
      { label: "Company Website", href: "/website", roles: ["hr_admin"], built: true },
    ],
  },
  {
    title: "Payroll & Benefits",
    items: [
      { label: "Payroll Processing", href: "/modules/payroll", roles: ["hr_admin", "payroll_officer"], built: true },
      { label: "Payroll (Read-only)", href: "/modules/payroll", roles: ["sr_accounting_assistant", "treasurer", "cfo", "upper_management"], built: true },
      { label: "All Payslips", href: "/modules/payslips", roles: ["hr_admin", "payroll_officer", "cfo", "upper_management"], built: true },
      { label: "Vouchers", href: "/modules/vouchers", roles: ["hr_admin", "payroll_officer", "sr_accounting_assistant", "treasurer", "cfo", "upper_management", "sys_admin"], built: true },
      // Seen by HR, the voucher's signers and the employee (the list is filtered by the database).
      { label: "Maternity Benefit", href: "/maternity-benefit", roles: ALL_ROLES, built: true },
      { label: "13th Month Pay", href: "/modules/thirteenth-month", roles: ["hr_admin", "payroll_officer", "sr_accounting_assistant", "treasurer", "cfo", "upper_management"], built: true },
      { label: "Government Reports", href: "/modules/gov-reports", roles: ["hr_admin", "payroll_officer"], built: true },
    ],
  },
  {
    title: "BIR / Tax",
    items: [
      { label: "BIR Form 1601-C", href: "/bir/1601c", roles: ["hr_admin", "cfo", "payroll_officer", "upper_management"], built: true },
      { label: "Employee Tax Ledger", href: "/bir/tax-ledger", roles: ["hr_admin", "cfo", "payroll_officer", "upper_management"], built: true },
    ],
  },
  {
    title: "Reports",
    items: [
      { label: "Attendance Report", href: "/reports/attendance", roles: ["hr_admin", "dept_head", "upper_management", "sys_admin"], built: true },
      { label: "Overtime Report", href: "/reports/overtime", roles: ["hr_admin", "dept_head", "upper_management", "sys_admin"], built: true },
      { label: "Payroll Expense Report", href: "/reports/payroll-expense", roles: ["hr_admin", "payroll_officer", "upper_management", "sr_accounting_assistant", "treasurer", "cfo", "sys_admin"], built: true },
      { label: "Tardiness Report", href: "/reports/tardiness", roles: ALL_ROLES, built: true },
      { label: "Absenteeism Report", href: "/reports/absenteeism", roles: ALL_ROLES, built: true },
    ],
  },
  {
    title: "System",
    items: [
      { label: "Audit Trail", href: "/audit", roles: ["hr_admin", "sys_admin"], built: true },
      { label: "Notifications", href: "/modules/notifications", roles: ALL_ROLES, built: true },
      { label: "System Administration", href: "/admin/branches", roles: ["sys_admin", "hr_admin"], built: true },
    ],
  },
];
