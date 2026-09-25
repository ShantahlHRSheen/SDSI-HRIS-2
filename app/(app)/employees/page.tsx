"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Plus, Users } from "lucide-react";
import { useHris } from "@/lib/store";
import { PageHeader } from "@/components/PageHeader";
import { StatTile } from "@/components/StatTile";
import { Badge, type BadgeTone } from "@/components/Badge";
import { EmptyState } from "@/components/EmptyState";
import { EmployeeEditModal } from "@/components/employees/EmployeeEditModal";
import { branchName, departmentAllocationsForEmployee, departmentName, fullName, positionTitle, scopeEmployeesForViewer } from "@/lib/helpers";
import type { Employee } from "@/lib/types";

const STATUS_TONE: Record<Employee["status"], BadgeTone> = {
  active: "good",
  on_leave: "warning",
  resigned: "muted",
  terminated: "critical",
};

function isEmployed(e: Employee): boolean {
  return e.status === "active" || e.status === "on_leave";
}

// Freelancers are counted separately from employees.
function isFreelancer(e: Employee): boolean {
  return e.employmentStatus === "freelance";
}

type StatusFilter = "active" | "active_employees" | "active_freelancers" | "separated" | "all";

function matchesStatus(e: Employee, filter: StatusFilter): boolean {
  switch (filter) {
    case "all":
      return true;
    case "active":
      return isEmployed(e);
    case "active_employees":
      return isEmployed(e) && !isFreelancer(e);
    case "active_freelancers":
      return isEmployed(e) && isFreelancer(e);
    case "separated":
      return !isEmployed(e);
  }
}

export default function EmployeeDirectoryPage() {
  const { employees: allEmployees, employeeDepartmentAllocations, currentEmployee, branches, departments, currentUser, addEmployee } = useHris();
  const employees = useMemo(
    () => scopeEmployeesForViewer(allEmployees, currentUser?.roles ?? [], currentEmployee, employeeDepartmentAllocations),
    [allEmployees, currentUser, currentEmployee, employeeDepartmentAllocations],
  );
  const [search, setSearch] = useState("");
  const [branchFilter, setBranchFilter] = useState("all");
  const [deptFilter, setDeptFilter] = useState("all");
  // "active" includes employees on leave — they're still employed.
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");
  const [adding, setAdding] = useState(false);
  const canEdit = currentUser?.roles.includes("hr_admin");

  const rows = useMemo(() => {
    return employees
      .filter((e) => fullName(e).toLowerCase().includes(search.toLowerCase()) || e.employeeNumber.toLowerCase().includes(search.toLowerCase()))
      .filter((e) => matchesStatus(e, statusFilter))
      .filter((e) => (branchFilter === "all" ? true : e.branchId === branchFilter))
      .filter((e) =>
        deptFilter === "all"
          ? true
          : departmentAllocationsForEmployee(e, employeeDepartmentAllocations).some((a) => a.departmentId === deptFilter),
      )
      .sort((a, b) => fullName(a).localeCompare(fullName(b)));
  }, [employees, search, statusFilter, branchFilter, deptFilter, employeeDepartmentAllocations]);

  const activeCount = employees.filter(isEmployed).length;
  const activeEmployees = employees.filter((e) => isEmployed(e) && !isFreelancer(e));
  const activeFreelancerCount = activeCount - activeEmployees.length;
  const onLeaveCount = activeEmployees.filter((e) => e.status === "on_leave").length;
  const separatedCount = employees.length - activeCount;

  return (
    <div>
      <PageHeader
        title="Employee Directory"
        subtitle={`${activeEmployees.length} active employees and ${activeFreelancerCount} active freelancers across ${branches.length} branches.`}
        actions={
          canEdit && (
            <button onClick={() => setAdding(true)} className="flex items-center gap-1.5 rounded-lg bg-[var(--series-1)] px-3 py-2 text-sm font-medium text-[var(--on-accent)]">
              <Plus size={16} /> Add employee
            </button>
          )
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:max-w-3xl sm:grid-cols-4">
        <StatTile label="Active employees" value={activeEmployees.length.toString()} hint={onLeaveCount ? `regular & probationary · incl. ${onLeaveCount} on leave` : "regular & probationary"} compact />
        <StatTile label="Active freelancers" value={activeFreelancerCount.toString()} compact />
        <StatTile label="Resigned / terminated" value={separatedCount.toString()} compact />
        <StatTile label="All records" value={employees.length.toString()} compact />
      </div>

      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name or employee number…"
          className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-2 text-sm sm:max-w-xs"
        />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)} className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-2 text-sm">
          <option value="active">Active (all)</option>
          <option value="active_employees">Active employees</option>
          <option value="active_freelancers">Active freelancers</option>
          <option value="separated">Resigned / terminated</option>
          <option value="all">All statuses</option>
        </select>
        <select value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)} className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-2 text-sm">
          <option value="all">All branches</option>
          {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <select value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)} className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-2 text-sm">
          <option value="all">All departments</option>
          {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <span className="text-xs text-[var(--text-muted)]">{rows.length} shown</span>
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={Users} title="No employees found" description="Adjust your search or filters." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-1)]">
          <table className="w-full min-w-[700px] text-sm">
            <thead>
              <tr className="border-b border-[var(--border-hairline)] text-left text-xs text-[var(--text-muted)]">
                <th className="px-4 py-2 font-medium">Employee</th>
                <th className="px-4 py-2 font-medium">Position</th>
                <th className="px-4 py-2 font-medium">Branch / Dept</th>
                <th className="px-4 py-2 font-medium">Employment</th>
                <th className="px-4 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.id} className="border-b border-[var(--gridline)] last:border-0 hover:bg-[var(--gridline)]/20">
                  <td className="px-4 py-2.5">
                    <Link href={`/employees/${e.id}`} className="font-medium text-[var(--series-1)] hover:underline">{fullName(e)}</Link>
                    <div className="text-xs text-[var(--text-muted)]">{e.employeeNumber}</div>
                  </td>
                  <td className="px-4 py-2.5 text-[var(--text-secondary)]">{positionTitle(e.positionId)}</td>
                  <td className="px-4 py-2.5 text-xs text-[var(--text-secondary)]">
                    {branchName(e.branchId)}
                    <br />
                    {departmentAllocationsForEmployee(e, employeeDepartmentAllocations)
                      .map((a) => (a.percent < 100 ? `${departmentName(a.departmentId)} (${a.percent}%)` : departmentName(a.departmentId)))
                      .join(" · ")}
                  </td>
                  <td className="px-4 py-2.5"><Badge tone="info">{e.employmentStatus.replace("_", " ")}</Badge></td>
                  <td className="px-4 py-2.5"><Badge tone={STATUS_TONE[e.status]}>{e.status.replace("_", " ")}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {adding && (
        <EmployeeEditModal
          employee={null}
          employees={employees}
          onClose={() => setAdding(false)}
          onSave={(data) => {
            addEmployee(data);
            setAdding(false);
          }}
        />
      )}
    </div>
  );
}
