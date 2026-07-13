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
  "dept_head", "employee", "upper_management", "freelancer", "sys_admin",
];

export const NAV_SECTIONS: NavSection[] = [
  {
    title: "Overview",
    items: [
      { label: "Dashboard", href: "/dashboard", roles: ALL_ROLES, built: true },
      { label: "Bulletin Board", href: "/bulletin", roles: ALL_ROLES, built: true },
      { label: "Employee Directory", href: "/employees", roles: ["hr_admin", "dept_head", "upper_management", "sys_admin", "payroll_officer"], built: true },
      { label: "Org Chart", href: "/modules/org-chart", roles: ALL_ROLES, built: false },
    ],
  },
  {
    title: "Workforce",
    items: [
      { label: "Attendance", href: "/modules/attendance", roles: ["hr_admin", "dept_head", "employee", "sys_admin"], built: false },
      { label: "Leave Management", href: "/modules/leave", roles: ["hr_admin", "dept_head", "employee"], built: false },
      { label: "Overtime", href: "/modules/overtime", roles: ["hr_admin", "dept_head", "employee"], built: false },
      { label: "Attendance Corrections", href: "/modules/corrections", roles: ["hr_admin", "dept_head", "employee"], built: false },
      { label: "Contract Monitoring", href: "/contracts", roles: ["hr_admin", "upper_management", "sys_admin"], built: true },
      { label: "Performance Evaluations", href: "/evaluations", roles: ["hr_admin", "dept_head", "upper_management"], built: true },
      { label: "Discipline", href: "/discipline", roles: ["hr_admin", "dept_head", "upper_management"], built: true },
    ],
  },
  {
    title: "Payroll & Compliance",
    items: [
      { label: "Payroll Processing", href: "/modules/payroll", roles: ["hr_admin", "payroll_officer"], built: false },
      { label: "Payroll (Read-only)", href: "/modules/payroll", roles: ["sr_accounting_assistant", "treasurer", "cfo"], built: false },
      { label: "Payslips", href: "/modules/payslips", roles: ["hr_admin", "payroll_officer", "employee"], built: false },
      { label: "Allowance Vouchers", href: "/modules/vouchers", roles: ["payroll_officer", "freelancer", "hr_admin"], built: false },
      { label: "Government Reports", href: "/modules/gov-reports", roles: ["hr_admin", "payroll_officer"], built: false },
      { label: "13th Month Pay", href: "/modules/thirteenth-month", roles: ["hr_admin", "payroll_officer"], built: false },
      { label: "Payroll Reports", href: "/modules/reports", roles: ["hr_admin", "payroll_officer", "upper_management", "sr_accounting_assistant", "treasurer", "cfo"], built: false },
    ],
  },
  {
    title: "System",
    items: [
      { label: "Audit Trail", href: "/audit", roles: ["hr_admin", "sys_admin"], built: true },
      { label: "Notifications", href: "/modules/notifications", roles: ALL_ROLES, built: false },
      { label: "System Administration", href: "/admin/branches", roles: ["sys_admin", "hr_admin"], built: true },
    ],
  },
];
