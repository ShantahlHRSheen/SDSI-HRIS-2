"use client";

import { useMemo } from "react";
import Link from "next/link";
import { AlarmClockOff, Cake, CalendarX2, Clock3, Info, UserMinus, UserPlus } from "lucide-react";
import { useHris } from "@/lib/store";
import { PageHeader } from "@/components/PageHeader";
import { StatTile } from "@/components/StatTile";
import { Badge } from "@/components/Badge";
import { HBarChart } from "@/components/charts/HBarChart";
import { StackedHBar } from "@/components/charts/StackedHBar";
import { TrendChart } from "@/components/charts/TrendChart";
import {
  activeEmployees,
  employmentStatusCounts,
  newHires,
  recentResignations,
  upcomingBirthdays,
} from "@/lib/dashboard-metrics";
import {
  attendanceTrendByMonth,
  CURRENT_MONTH_KEY,
  filterFacts,
  getMonthlyFacts,
  groupByBranch,
  overtimeTrendByMonth,
  payrollExpenseTrendByMonth,
  summarizeAttendance,
  summarizeOvertime,
  summarizePayroll,
} from "@/lib/monthly-analytics";
import { buildAbsenteeismRows, buildTardinessRows, flaggedAbsenteeism, flaggedTardiness, TARDINESS_THRESHOLD, ABSENTEEISM_THRESHOLD } from "@/lib/tardiness-absenteeism";
import { branchName, formatCurrencyCompact, formatDate, fullName, positionTitle } from "@/lib/helpers";
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
  const { currentUser, currentEmployee, employees, branches, announcements, attendancePeriodRecords } = useHris();
  const roles = currentUser?.roles ?? [];
  const variant = variantFor(roles);

  const scoped = useMemo(() => {
    if (variant === "team" && currentEmployee) {
      return employees.filter((e) => e.branchId === currentEmployee.branchId);
    }
    return employees;
  }, [variant, currentEmployee, employees]);

  const branchFilter = variant === "team" && currentEmployee ? currentEmployee.branchId : undefined;
  const facts = useMemo(() => getMonthlyFacts(employees), [employees]);

  // Real (not synthetic) attendance-derived flags, across every imported
  // period on file — separate from the monthly-analytics widgets above,
  // which run on the fact-table generator rather than actual import data.
  const tardinessRows = useMemo(() => buildTardinessRows(attendancePeriodRecords, scoped), [attendancePeriodRecords, scoped]);
  const absenteeismRows = useMemo(() => buildAbsenteeismRows(attendancePeriodRecords, scoped), [attendancePeriodRecords, scoped]);
  const flaggedTardinessRows = flaggedTardiness(tardinessRows);
  const flaggedAbsenteeismRows = flaggedAbsenteeism(absenteeismRows);

  if (variant === "personal") {
    return <PersonalDashboard employees={employees} announcements={announcements} />;
  }

  const active = activeEmployees(scoped);
  const statusCounts = employmentStatusCounts(scoped);
  const birthdays = upcomingBirthdays(scoped);
  const hires = newHires(scoped);
  const resignations = recentResignations(scoped);

  const attendanceTrend = attendanceTrendByMonth(facts, employees, { branchId: branchFilter });
  const currentAttendance = summarizeAttendance(filterFacts(facts, employees, { branchId: branchFilter, monthKey: CURRENT_MONTH_KEY }));

  const overtimeTrend = overtimeTrendByMonth(facts, employees, { branchId: branchFilter });
  const currentOvertime = summarizeOvertime(filterFacts(facts, employees, { branchId: branchFilter, monthKey: CURRENT_MONTH_KEY }));

  const payrollTrend = payrollExpenseTrendByMonth(facts, employees, { branchId: branchFilter });
  const currentPayroll = summarizePayroll(filterFacts(facts, employees, { branchId: branchFilter, monthKey: CURRENT_MONTH_KEY }));
  const branchExpense = groupByBranch(
    filterFacts(facts, employees, { monthKey: CURRENT_MONTH_KEY, branchId: branchFilter }),
    employees,
    branches,
  )
    .map((row) => ({ label: row.label, value: row.payroll.totalEmployerExpense }))
    .sort((a, b) => b.value - a.value);

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

          <div className="mt-4 rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-1)] p-4">
            <div className="mb-3 text-sm font-medium text-[var(--text-primary)]">Employment status mix</div>
            <StackedHBar
              totalLabel={`${active.length} total`}
              segments={(Object.keys(statusCounts) as (keyof typeof statusCounts)[])
                .filter((k) => statusCounts[k] > 0)
                .map((k) => ({ key: k, label: STATUS_LABELS[k], value: statusCounts[k], color: STATUS_COLORS[k] }))}
            />
          </div>
        </>
      )}

      {/* --- Monthly Attendance --------------------------------------------- */}
      {variant !== "payroll" && (
        <section className="mt-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold text-[var(--text-primary)]">Monthly Attendance</h2>
            <Link href="/reports/attendance" className="text-xs text-[var(--series-1)] hover:underline">Full report →</Link>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <StatTile label="Present (this month)" value={currentAttendance.totalPresent.toLocaleString()} />
            <StatTile label="Late (this month)" value={currentAttendance.totalLate.toLocaleString()} deltaTone={currentAttendance.totalLate > 40 ? "bad" : "neutral"} />
            <StatTile label="Absent (this month)" value={currentAttendance.totalAbsent.toLocaleString()} deltaTone={currentAttendance.totalAbsent > 40 ? "bad" : "neutral"} />
            <StatTile label="On leave (this month)" value={currentAttendance.totalLeave.toLocaleString()} />
            <StatTile label="Attendance rate" value={`${currentAttendance.attendanceRate}%`} />
          </div>
          <div className="mt-3 rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-1)] p-4">
            <div className="mb-3 text-sm font-medium text-[var(--text-primary)]">Attendance rate — last 6 months</div>
            <TrendChart data={attendanceTrend} valueFormatter={(v) => `${v}%`} />
          </div>
        </section>
      )}

      {/* --- Monthly Overtime ------------------------------------------------ */}
      {variant !== "payroll" && (
        <section className="mt-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-1.5 text-base font-semibold text-[var(--text-primary)]"><Clock3 size={16} /> Monthly Overtime</h2>
            <Link href="/reports/overtime" className="text-xs text-[var(--series-1)] hover:underline">Full report →</Link>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile label="OT hours (this month)" value={currentOvertime.totalOtHours.toLocaleString()} />
            <StatTile label="OT pay (this month)" value={formatCurrencyCompact(currentOvertime.totalOtPay)} />
            <StatTile label="Avg hrs / employee" value={active.length ? (currentOvertime.totalOtHours / active.length).toFixed(1) : "0"} />
            <StatTile label="Months tracked" value="6" hint="rolling window" />
          </div>
          <div className="mt-3 rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-1)] p-4">
            <div className="mb-3 text-sm font-medium text-[var(--text-primary)]">OT hours — last 6 months</div>
            <TrendChart data={overtimeTrend} color="var(--series-2)" valueFormatter={(v) => `${v} hrs`} />
          </div>
        </section>
      )}

      {/* --- Tardiness & Absenteeism (real imported attendance, not the fact-table generator) --- */}
      {variant !== "payroll" && (
        <section className="mt-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold text-[var(--text-primary)]">Tardiness &amp; Absenteeism</h2>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile label={`Flagged for tardiness (${TARDINESS_THRESHOLD}+)`} value={flaggedTardinessRows.length.toString()} deltaTone={flaggedTardinessRows.length > 0 ? "bad" : "neutral"} />
            <StatTile label={`Flagged for absenteeism (${ABSENTEEISM_THRESHOLD}+)`} value={flaggedAbsenteeismRows.length.toString()} deltaTone={flaggedAbsenteeismRows.length > 0 ? "bad" : "neutral"} />
          </div>
          <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <ListCard
              title="Tardiness Report"
              icon={<AlarmClockOff size={16} />}
              items={flaggedTardinessRows.slice(0, 6).map((row) => (
                <PersonRow key={row.employee.id} employee={row.employee} right={<Badge tone="critical">{row.lateInstances} lates</Badge>} />
              ))}
              emptyText="No employees currently cross the tardiness threshold."
              href="/reports/tardiness"
            />
            <ListCard
              title="Absenteeism Report"
              icon={<CalendarX2 size={16} />}
              items={flaggedAbsenteeismRows.slice(0, 6).map((row) => (
                <PersonRow key={row.employee.id} employee={row.employee} right={<Badge tone="critical">{row.totalInstances} instances</Badge>} />
              ))}
              emptyText="No employees currently cross the absenteeism threshold."
              href="/reports/absenteeism"
            />
          </div>
        </section>
      )}

      {/* --- Monthly Employer Payroll Expense -------------------------------- */}
      <section className="mt-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-[var(--text-primary)]">Monthly Employer Payroll Expense</h2>
          <Link href="/reports/payroll-expense" className="text-xs text-[var(--series-1)] hover:underline">Full report →</Link>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile label="Total employer expense" value={formatCurrencyCompact(currentPayroll.totalEmployerExpense)} hint="this month" />
          <StatTile label="Basic salary" value={formatCurrencyCompact(currentPayroll.basicSalary)} />
          <StatTile label="Employer SSS + HDMF + PhilHealth" value={formatCurrencyCompact(currentPayroll.employerSSS + currentPayroll.employerHDMF + currentPayroll.employerPhilHealth)} />
          <StatTile label="OT + Holiday + Leave pay" value={formatCurrencyCompact(currentPayroll.overtimePay + currentPayroll.holidayPay + currentPayroll.leavePay)} />
        </div>
        <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-1)] p-4">
            <div className="mb-3 text-sm font-medium text-[var(--text-primary)]">Payroll expense trend — last 6 months</div>
            <TrendChart data={payrollTrend} color="var(--series-1)" valueFormatter={(v) => formatCurrencyCompact(v)} />
          </div>
          <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-1)] p-4">
            <div className="mb-3 text-sm font-medium text-[var(--text-primary)]">
              {variant === "team" ? "Team payroll expense (this month)" : "Payroll expense by branch (this month)"}
            </div>
            <HBarChart data={branchExpense} valueFormatter={(v) => formatCurrencyCompact(v)} />
          </div>
        </div>
        <div className="mt-3 flex items-start gap-1.5 rounded-lg bg-[var(--gridline)]/30 p-2 text-xs text-[var(--text-secondary)]">
          <Info size={14} className="mt-0.5 shrink-0" />
          <span>
            Employer expense = Basic Salary + Allowances + Overtime Pay + Holiday Pay + Leave Pay + Employer SSS + Employer
            HDMF (Pag-IBIG) + Employer PhilHealth. Contribution percentages are illustrative placeholders — configure
            verified, versioned rate tables in System Administration before relying on this for actual payroll.
          </span>
        </div>
      </section>

      {variant !== "payroll" && (
        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <ListCard
            title="Upcoming birthdays"
            icon={<Cake size={16} />}
            items={birthdays.slice(0, 6).map(({ employee, daysUntil }) => (
              <PersonRow key={employee.id} employee={employee} right={<Badge tone="info">{daysUntil === 0 ? "Today" : `in ${daysUntil}d`}</Badge>} />
            ))}
            emptyText="No birthdays in the next 30 days."
            href="/employees"
          />
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
      )}
    </div>
  );
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
              { label: "My BIR 2316", href: "/bir/2316" },
              { label: "My Tardiness Record", href: "/reports/tardiness" },
              { label: "My Absenteeism Record", href: "/reports/absenteeism" },
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
