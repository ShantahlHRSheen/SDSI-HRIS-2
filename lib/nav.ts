import type { Role } from "./types";

export interface NavItem {
  label: string;
  href: string;
  roles: Role[];
  built: boolean;
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

const ALL_ROLES: Role[] = [
  "hr_admin", "payroll_officer", "sr_accounting_assistant", "treasurer", "cfo",
  "dept_head", "employee", "upper_management", "sys_admin",
];

export const NAV_SECTIONS: NavSection[] = [
  {
    title: "Overview",
    items: [
      { label: "Dashboard", href: "/dashboard", roles: ALL_ROLES, built: true },
      { label: "Bulletin Board", href: "/bulletin", roles: ALL_ROLES, built: true },
      { label: "Employee Directory", href: "/employees", roles: ["hr_admin", "dept_head", "upper_management", "sys_admin", "payroll_officer"], built: true },
      { label: "Org Chart", href: "/modules/org-chart", roles: ALL_ROLES, built: true },
    ],
  },
  {
    title: "Workforce",
    items: [
      { label: "Attendance", href: "/modules/attendance", roles: ALL_ROLES, built: true },
      { label: "Leave Management", href: "/modules/leave", roles: ALL_ROLES, built: true },
      { label: "Overtime", href: "/modules/overtime", roles: ALL_ROLES, built: true },
      { label: "Attendance Corrections", href: "/modules/corrections", roles: ALL_ROLES, built: true },
      { label: "Performance Evaluations", href: "/evaluations", roles: ["hr_admin", "dept_head", "upper_management"], built: true },
      { label: "Discipline", href: "/discipline", roles: ["hr_admin", "dept_head", "upper_management"], built: true },
    ],
  },
  {
    title: "Reports & Analytics",
    items: [
      { label: "Attendance Report", href: "/reports/attendance", roles: ["hr_admin", "dept_head", "upper_management", "sys_admin"], built: true },
      { label: "Overtime Report", href: "/reports/overtime", roles: ["hr_admin", "dept_head", "upper_management", "sys_admin"], built: true },
      { label: "Payroll Expense Report", href: "/reports/payroll-expense", roles: ["hr_admin", "payroll_officer", "upper_management", "sr_accounting_assistant", "treasurer", "cfo", "sys_admin"], built: true },
      { label: "Tardiness Report", href: "/reports/tardiness", roles: ALL_ROLES, built: true },
      { label: "Absenteeism Report", href: "/reports/absenteeism", roles: ALL_ROLES, built: true },
    ],
  },
  {
    title: "Payroll & Compliance",
    items: [
      { label: "Payroll Processing", href: "/modules/payroll", roles: ["hr_admin", "payroll_officer"], built: true },
      { label: "Payroll (Read-only)", href: "/modules/payroll", roles: ["sr_accounting_assistant", "treasurer", "cfo", "upper_management"], built: true },
      { label: "Payslips", href: "/modules/payslips", roles: ["hr_admin", "payroll_officer", "cfo", "upper_management", "employee"], built: true },
      { label: "Allowance Vouchers", href: "/modules/vouchers", roles: ["payroll_officer", "hr_admin"], built: true },
      { label: "Government Reports", href: "/modules/gov-reports", roles: ["hr_admin", "payroll_officer"], built: true },
      { label: "13th Month Pay", href: "/modules/thirteenth-month", roles: ["hr_admin", "payroll_officer"], built: true },
    ],
  },
  {
    title: "BIR",
    items: [
      { label: "BIR Form 1601-C", href: "/bir/1601c", roles: ["hr_admin", "cfo", "payroll_officer", "upper_management"], built: true },
      { label: "BIR Form 2316", href: "/bir/2316", roles: ["hr_admin", "cfo", "payroll_officer", "upper_management", "employee"], built: true },
      { label: "Employee Tax Ledger", href: "/bir/tax-ledger", roles: ["hr_admin", "cfo", "payroll_officer", "upper_management"], built: true },
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
