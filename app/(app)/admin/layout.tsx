"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";

const TABS = [
  { href: "/admin/branches", label: "Branches" },
  { href: "/admin/departments", label: "Departments" },
  { href: "/admin/positions", label: "Positions" },
  { href: "/admin/schedules", label: "Work Schedules" },
  { href: "/admin/holidays", label: "Holidays" },
  { href: "/admin/leave-types", label: "Leave Types" },
  { href: "/admin/payroll-periods", label: "Payroll Periods" },
  { href: "/admin/users", label: "Users & Roles" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div>
      <PageHeader title="System Administration" subtitle="Configure the organization structure, schedules, and reference data used across every module." />
      <div className="mb-5 flex gap-1 overflow-x-auto border-b border-[var(--border-hairline)]">
        {TABS.map((t) => {
          const active = pathname === t.href;
          return (
            <Link
              key={t.href}
              href={t.href}
              className={`shrink-0 border-b-2 px-3 py-2 text-sm whitespace-nowrap ${
                active ? "border-[var(--series-1)] font-medium text-[var(--series-1)]" : "border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </div>
      {children}
    </div>
  );
}
