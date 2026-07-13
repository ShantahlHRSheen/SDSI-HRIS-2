"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Cake, Info, TrendingDown, TrendingUp, UserMinus, UserPlus } from "lucide-react";
import { useHris } from "@/lib/store";
import { PageHeader } from "@/components/PageHeader";
import { StatTile } from "@/components/StatTile";
import { Badge } from "@/components/Badge";
import { HBarChart } from "@/components/charts/HBarChart";
import { StackedHBar } from "@/components/charts/StackedHBar";
import { TrendChart } from "@/components/charts/TrendChart";
import {
  activeEmployees,
  attendanceSnapshot,
  attendanceTrend,
  dueForRegularization,
  employmentStatusCounts,
  estimatedEmployerContributions,
  expiringContracts,
  newHires,
  payrollExpenseByBranch,
  recentResignations,
  totalMonthlyPayrollExpense,
  upcomingBirthdays,
} from "@/lib/dashboard-metrics";
import { branchName, departmentName, formatCurrencyCompact, formatDate, fullName, positionTitle } from "@/lib/helpers";
import type { Employee } from "@/lib/types";

const STATUS_COLORS: Record<string, string> = {
  regular: "var(--series-1)",
  probationary: "var(--series-3)",
  project_based: "var(--series-2)",
  freelance: "var(--series-7)",
  consultant: "var(--series-5)",
  intern: "var(--series-8)",
};
const STATUS_LABELS: Record<string, string> = {
  regular: "Regular",
  probationary: "Probationary",
  project_based: "Project-based",
  freelance: "Freelance",
  consultant: "Consultant",
  intern: "Intern",
};

function variantFor(roles: string[]): "full" | "payroll" | "team" | "personal" {
  if (roles.includes("hr_admin") || roles.includes("upper_management") || roles.includes("sys_admin")) return "full";
  if (roles.includes("payroll_officer") || roles.includes("sr_accounting_assistant") || roles.includes("treasurer") || roles.includes("cfo")) return "payroll";
  if (roles.includes("dept_head")) return "team";
  return "personal";
}

export default function DashboardPage() {
  const { currentUser, currentEmployee, employees, announcements } = useHris();
  const roles = currentUser?.roles ?? [];
  const variant = variantFor(roles);

  const scoped = useMemo(() => {
    if (variant === "team" && currentEmployee) {
      return employees.filter((e) => e.branchId === currentEmployee.branchId);
    }
    return employees;
  }, [variant, currentEmployee, employees]);

  if (variant === "personal") {
    return <PersonalDashboard employees={employees} announcements={announcements} />;
  }

  const active = activeEmployees(scoped);
  const statusCounts = employmentStatusCounts(scoped);
  const attendance = attendanceSnapshot(scoped);
  const trend = attendanceTrend();
  const regularizations = dueForRegularization(scoped);
  const contracts = expiringContracts(scoped);
  const birthdays = upcomingBirthdays(scoped);
  const hires = newHires(scoped);
  const resignations = recentResignations(scoped);
  const branchExpense = payrollExpenseByBranch(scoped);
  const totalExpense = totalMonthlyPayrollExpense(scoped);
  const contributions = estimatedEmployerContributions(scoped);

  return (
    <div>
      <PageHeader
        title={variant === "team" ? `Team Dashboard — ${currentEmployee ? branchName(currentEmployee.branchId) : ""}` : "Executive Dashboard"}
        subtitle={`As of ${formatDate("2026-07-13")} · Company-wide unless noted`}
      />

      {variant !== "payroll" && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <StatTile label="Active employees" value={active.length.toLocaleString()} hint="Regular + on-leave" />
            <StatTile label="Regular" value={statusCounts.regular.toString()} />
            <StatTile label="Probationary" value={statusCounts.probationary.toString()} />
            <StatTile label="Freelance / project-based" value={(statusCounts.freelance + statusCounts.project_based + statusCounts.consultant).toString()} />
            <StatTile label="On leave today" value={scoped.filter((e) => e.status === "on_leave").length.toString()} />
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-1)] p-4">
              <div className="mb-3 text-sm font-medium text-[var(--text-primary)]">Employment status mix</div>
              <StackedHBar
                totalLabel={`${active.length} total`}
                segments={(Object.keys(statusCounts) as (keyof typeof statusCounts)[])
                  .filter((k) => statusCounts[k] > 0)
                  .map((k) => ({ key: k, label: STATUS_LABELS[k], value: statusCounts[k], color: STATUS_COLORS[k] }))}
              />
            </div>
            <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-1)] p-4">
              <div className="mb-3 flex flex-col gap-1.5 text-sm font-medium text-[var(--text-primary)] sm:flex-row sm:items-center sm:justify-between">
                <span>Attendance rate — last 8 checkpoints</span>
                <span><Badge tone="muted">Sample data · preview</Badge></span>
              </div>
              <TrendChart data={trend} valueFormatter={(v) => `${v}%`} />
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile label="Present today" value={attendance.present.toString()} hint={`of ${attendance.total}`} />
            <StatTile label="Late today" value={attendance.late.toString()} deltaTone={attendance.late > 5 ? "bad" : "neutral"} />
            <StatTile label="Absent today" value={attendance.absent.toString()} deltaTone={attendance.absent > 5 ? "bad" : "neutral"} />
            <StatTile label="OT hours (period)" value={attendance.otHours.toString()} hint="hrs logged" />
          </div>
        </>
      )}

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-1)] p-4">
          <div className="mb-3 text-sm font-medium text-[var(--text-primary)]">
            {variant === "team" ? "Team payroll cost equivalent" : "Monthly payroll expense by branch"}
          </div>
          <HBarChart data={branchExpense.length ? branchExpense : [{ label: currentEmployee ? branchName(currentEmployee.branchId) : "—", value: totalExpense }]} valueFormatter={(v) => formatCurrencyCompact(v)} />
        </div>
        <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-1)] p-4">
          <div className="mb-3 flex items-center gap-1.5 text-sm font-medium text-[var(--text-primary)]">
            Estimated employer contributions
          </div>
          <div className="grid grid-cols-3 gap-2">
            <StatTile compact label="SSS" value={formatCurrencyCompact(contributions.sss)} />
            <StatTile compact label="PhilHealth" value={formatCurrencyCompact(contributions.philhealth)} />
            <StatTile compact label="Pag-IBIG" value={formatCurrencyCompact(contributions.pagibig)} />
          </div>
          <div className="mt-3 flex items-start gap-1.5 rounded-lg bg-[var(--gridline)]/30 p-2 text-xs text-[var(--text-secondary)]">
            <Info size={14} className="mt-0.5 shrink-0" />
            <span>
              Illustrative estimate only. Real SSS / PhilHealth / Pag-IBIG contribution brackets change periodically —
              configure verified, versioned rate tables in System Administration before relying on this for actual payroll.
            </span>
          </div>
        </div>
      </div>

      {variant !== "payroll" && (
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <ListCard
            title="Due for regularization"
            icon={<TrendingUp size={16} />}
            items={regularizations.map(({ employee, daysUntil }) => (
              <PersonRow key={employee.id} employee={employee} right={<DueBadge days={daysUntil} />} />
            ))}
            emptyText="No probationary employees approaching their evaluation date."
            href="/contracts"
          />
          <ListCard
            title="Expiring contracts"
            icon={<TrendingDown size={16} />}
            items={contracts.map(({ employee, daysUntil }) => (
              <PersonRow key={employee.id} employee={employee} right={<DueBadge days={daysUntil} />} />
            ))}
            emptyText="No freelance / project-based contracts expiring soon."
            href="/contracts"
          />
          <ListCard
            title="Upcoming birthdays"
            icon={<Cake size={16} />}
            items={birthdays.slice(0, 6).map(({ employee, daysUntil }) => (
              <PersonRow key={employee.id} employee={employee} right={<Badge tone="info">{daysUntil === 0 ? "Today" : `in ${daysUntil}d`}</Badge>} />
            ))}
            emptyText="No birthdays in the next 30 days."
            href="/employees"
          />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:col-span-1">
            <ListCard
              title="New hires (60d)"
              icon={<UserPlus size={16} />}
              items={hires.map((e) => (
                <PersonRow key={e.id} employee={e} right={<Badge tone="good">{formatDate(e.dateHired)}</Badge>} />
              ))}
              emptyText="No new hires in the last 60 days."
              href="/employees"
            />
            <ListCard
              title="Recent resignations (30d)"
              icon={<UserMinus size={16} />}
              items={resignations.map((e) => (
                <PersonRow key={e.id} employee={e} right={<Badge tone="critical">{e.statusChangedAt ? formatDate(e.statusChangedAt) : ""}</Badge>} />
              ))}
              emptyText="No resignations in the last 30 days."
              href="/employees"
            />
          </div>
        </div>
      )}
    </div>
  );
}

function DueBadge({ days }: { days: number }) {
  if (days < 0) return <Badge tone="critical">Overdue {Math.abs(days)}d</Badge>;
  if (days <= 15) return <Badge tone="warning">Due in {days}d</Badge>;
  return <Badge tone="good">Due in {days}d</Badge>;
}

function PersonRow({ employee, right }: { employee: Employee; right: React.ReactNode }) {
  return (
    <Link href="/employees" className="flex items-center justify-between gap-2 rounded-lg px-2 py-2 hover:bg-[var(--gridline)]/30">
      <div className="min-w-0">
        <div className="truncate text-sm text-[var(--text-primary)]">{fullName(employee)}</div>
        <div className="truncate text-xs text-[var(--text-muted)]">
          {positionTitle(employee.positionId)} · {branchName(employee.branchId)}
        </div>
      </div>
      <div className="shrink-0">{right}</div>
    </Link>
  );
}

function ListCard({
  title,
  icon,
  items,
  emptyText,
  href,
}: {
  title: string;
  icon: React.ReactNode;
  items: React.ReactNode[];
  emptyText: string;
  href: string;
}) {
  return (
    <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-1)] p-4">
      <div className="mb-1 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-sm font-medium text-[var(--text-primary)]">
          {icon} {title}
        </div>
        <Link href={href} className="text-xs text-[var(--series-1)] hover:underline">View all</Link>
      </div>
      {items.length === 0 ? (
        <div className="py-4 text-center text-xs text-[var(--text-muted)]">{emptyText}</div>
      ) : (
        <div className="flex flex-col divide-y divide-[var(--gridline)]">{items}</div>
      )}
    </div>
  );
}

function PersonalDashboard({ employees, announcements }: { employees: Employee[]; announcements: { id: string; title: string; postedAt: string }[] }) {
  const { currentEmployee, currentUser } = useHris();
  const emp = employees.find((e) => e.id === currentEmployee?.id);
  return (
    <div>
      <PageHeader title={`Welcome, ${currentUser?.name?.split(" ")[0]}`} subtitle="Your personal HRIS snapshot" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-1)] p-4 lg:col-span-1">
          <div className="mb-3 text-sm font-medium text-[var(--text-primary)]">My profile</div>
          {emp && (
            <div className="space-y-1.5 text-sm text-[var(--text-secondary)]">
              <div><span className="text-[var(--text-muted)]">Position:</span> {positionTitle(emp.positionId)}</div>
              <div><span className="text-[var(--text-muted)]">Branch:</span> {branchName(emp.branchId)}</div>
              <div><span className="text-[var(--text-muted)]">Department:</span> {departmentName(emp.departmentId)}</div>
              <div><span className="text-[var(--text-muted)]">Date hired:</span> {formatDate(emp.dateHired)}</div>
              <div><span className="text-[var(--text-muted)]">Status:</span> <Badge tone="info">{emp.employmentStatus}</Badge></div>
            </div>
          )}
          <Link href="/employees" className="mt-3 inline-block text-xs text-[var(--series-1)] hover:underline">View full 201 file →</Link>
        </div>
        <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-1)] p-4 lg:col-span-2">
          <div className="mb-3 text-sm font-medium text-[var(--text-primary)]">Quick actions</div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {[
              { label: "File Leave", href: "/modules/leave" },
              { label: "File Overtime", href: "/modules/overtime" },
              { label: "Attendance Correction", href: "/modules/corrections" },
              { label: "View Payslips", href: "/modules/payslips" },
              { label: "Org Chart", href: "/modules/org-chart" },
              { label: "Bulletin Board", href: "/bulletin" },
            ].map((a) => (
              <Link key={a.href} href={a.href} className="rounded-lg border border-[var(--border-hairline)] px-3 py-2.5 text-center text-sm text-[var(--text-secondary)] hover:bg-[var(--gridline)]/30">
                {a.label}
              </Link>
            ))}
          </div>
        </div>
        <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-1)] p-4 lg:col-span-3">
          <div className="mb-3 text-sm font-medium text-[var(--text-primary)]">Latest announcements</div>
          <div className="flex flex-col divide-y divide-[var(--gridline)]">
            {announcements.slice(0, 4).map((a) => (
              <div key={a.id} className="flex items-center justify-between py-2 text-sm">
                <span className="text-[var(--text-primary)]">{a.title}</span>
                <span className="text-xs text-[var(--text-muted)]">{formatDate(a.postedAt)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
