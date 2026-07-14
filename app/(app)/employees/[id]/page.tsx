"use client";

import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, Pencil } from "lucide-react";
import { useHris } from "@/lib/store";
import { Badge, type BadgeTone } from "@/components/Badge";
import {
  branchName,
  departmentName,
  employeeHdmfNumber,
  employeePhilHealthNumber,
  employeeSssNumber,
  employeeTIN,
  formatCurrency,
  formatDate,
  fullName,
  positionTitle,
} from "@/lib/helpers";
import { DISCIPLINARY_LABELS } from "@/lib/types";
import { EmployeeEditModal } from "@/components/employees/EmployeeEditModal";

export default function EmployeeProfilePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { employees, evaluations, disciplinaryRecords, currentUser, updateEmployee } = useHris();
  const employee = employees.find((e) => e.id === params.id);
  const [editing, setEditing] = useState(false);
  const canEdit = currentUser?.roles.includes("hr_admin");

  if (!employee) {
    return (
      <div>
        <button onClick={() => router.back()} className="mb-4 flex items-center gap-1.5 text-sm text-[var(--series-1)]"><ArrowLeft size={16} /> Back</button>
        <div className="text-sm text-[var(--text-secondary)]">Employee not found.</div>
      </div>
    );
  }

  const supervisor = employees.find((e) => e.id === employee.supervisorId);
  const directReports = employees.filter((e) => e.supervisorId === employee.id);
  const empEvals = evaluations.filter((e) => e.employeeId === employee.id);
  const empDiscipline = disciplinaryRecords.filter((d) => d.employeeId === employee.id);

  const STATUS_TONE: Record<string, BadgeTone> = { active: "good", on_leave: "warning", resigned: "muted", terminated: "critical" };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <button onClick={() => router.back()} className="flex items-center gap-1.5 text-sm text-[var(--series-1)]"><ArrowLeft size={16} /> Back to directory</button>
        {canEdit && (
          <button onClick={() => setEditing(true)} className="flex items-center gap-1.5 rounded-lg bg-[var(--series-1)] px-3 py-1.5 text-sm font-medium text-[var(--on-accent)]">
            <Pencil size={14} /> Edit
          </button>
        )}
      </div>

      <div className="mb-5 flex flex-col items-start gap-4 sm:flex-row sm:items-center">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-xl font-semibold text-[var(--on-accent)]">
          {employee.firstName[0]}{employee.lastName[0]}
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold text-[var(--text-primary)]">{fullName(employee)} <span className="text-sm font-normal text-[var(--text-muted)]">&ldquo;{employee.nickname}&rdquo;</span></h1>
          <div className="mt-0.5 text-sm text-[var(--text-secondary)]">{positionTitle(employee.positionId)} · {departmentName(employee.departmentId)} · {branchName(employee.branchId)}</div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Badge tone={STATUS_TONE[employee.status]}>{employee.status.replace("_", " ")}</Badge>
            <Badge tone="info">{employee.employmentStatus.replace("_", " ")}</Badge>
            <Badge tone="muted">{employee.employeeNumber}</Badge>
          </div>
        </div>
      </div>

      {editing && (
        <EmployeeEditModal
          employee={employee}
          employees={employees}
          onClose={() => setEditing(false)}
          onSave={(patch) => {
            updateEmployee(employee.id, patch);
            setEditing(false);
          }}
        />
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Section title="Personal Information">
          <Row label="Gender" value={employee.gender} />
          <Row label="Birthdate" value={formatDate(employee.birthdate)} />
          <Row label="Civil status" value={employee.civilStatus} />
          <Row label="Nationality" value={employee.nationality} />
          <Row label="Address" value={employee.address} />
          <Row label="Contact number" value={employee.contactNumber} />
          <Row label="Email" value={employee.email} />
          <Row label="Emergency contact" value={`${employee.emergencyContactName} · ${employee.emergencyContactPhone}`} />
        </Section>

        <Section title="Employment Details">
          <Row label="Supervisor" value={supervisor ? fullName(supervisor) : "—"} />
          <Row label="Direct reports" value={directReports.length ? `${directReports.length} employee(s)` : "None"} />
          <Row label="Date hired" value={formatDate(employee.dateHired)} />
          <Row label="Date regularized" value={formatDate(employee.dateRegularized)} />
          <Row label="Contract period" value={employee.contractStart ? `${formatDate(employee.contractStart)} – ${formatDate(employee.contractEnd)}` : "—"} />
          <Row label="Probation ends" value={formatDate(employee.probationEndsAt)} />
          <Row label="Payroll type" value={employee.payrollType === "monthly" ? "Fixed-rate" : "Daily-rate"} />
          <Row label="Rate" value={employee.payrollType === "monthly" ? formatCurrency(employee.monthlySalary) + " / month" : formatCurrency(employee.dailyRate) + " / day"} />
          <Row
            label="Allowance"
            value={
              employee.monthlyAllowance
                ? formatCurrency(employee.monthlyAllowance) + " / month"
                : employee.dailyAllowance
                  ? formatCurrency(employee.dailyAllowance) + " / day"
                  : "—"
            }
          />
        </Section>

        <Section title="Government IDs" note="Masked placeholder values for demo purposes only.">
          <Row label="SSS" value={employeeSssNumber(employee.employeeNumber)} />
          <Row label="PhilHealth" value={employeePhilHealthNumber(employee.employeeNumber)} />
          <Row label="Pag-IBIG" value={employeeHdmfNumber(employee.employeeNumber)} />
          <Row label="TIN" value={employeeTIN(employee.employeeNumber)} />
        </Section>

        <Section title="Bank Details" note="Masked placeholder values for demo purposes only.">
          <Row label="Bank" value="BDO Unibank" />
          <Row label="Account name" value={fullName(employee)} />
          <Row label="Account number" value={"•••• •••• " + employee.employeeNumber.slice(-4)} />
        </Section>

        <Section title="Documents (201 File)" note="No real files stored in this demo — Supabase Storage integration is part of the full build.">
          {["Resume / Biodata", "Employment Contract", "Government IDs", "NBI Clearance", "Medical Certificate"].map((doc) => (
            <div key={doc} className="flex items-center justify-between py-1.5 text-sm">
              <span className="text-[var(--text-secondary)]">{doc}</span>
              <Badge tone="muted">On file</Badge>
            </div>
          ))}
        </Section>

        <Section title="Performance & Discipline History">
          <div className="mb-2 text-xs font-semibold text-[var(--text-muted)] uppercase">Evaluations</div>
          {empEvals.length === 0 ? (
            <div className="mb-3 text-sm text-[var(--text-muted)]">No evaluations on record.</div>
          ) : (
            empEvals.map((ev) => (
              <div key={ev.id} className="mb-2 flex items-center justify-between text-sm">
                <span className="text-[var(--text-secondary)]">{ev.period}</span>
                <span className="tabular font-medium text-[var(--text-primary)]">{ev.overallScore.toFixed(1)} / 5</span>
              </div>
            ))
          )}
          <div className="mt-3 mb-2 text-xs font-semibold text-[var(--text-muted)] uppercase">Discipline</div>
          {empDiscipline.length === 0 ? (
            <div className="text-sm text-[var(--text-muted)]">No disciplinary records.</div>
          ) : (
            empDiscipline.map((d) => (
              <div key={d.id} className="mb-2 flex items-center justify-between text-sm">
                <span className="text-[var(--text-secondary)]">{DISCIPLINARY_LABELS[d.type]} · {formatDate(d.date)}</span>
                <Badge tone={d.status === "resolved" ? "good" : "warning"}>{d.status}</Badge>
              </div>
            ))
          )}
        </Section>
      </div>
    </div>
  );
}

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-1)] p-4">
      <div className="mb-3 text-sm font-medium text-[var(--text-primary)]">{title}</div>
      {note && <div className="mb-2 text-xs text-[var(--text-muted)]">{note}</div>}
      <div className="divide-y divide-[var(--gridline)]">{children}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 text-sm">
      <span className="shrink-0 text-[var(--text-muted)]">{label}</span>
      <span className="truncate text-right text-[var(--text-secondary)]">{value}</span>
    </div>
  );
}
