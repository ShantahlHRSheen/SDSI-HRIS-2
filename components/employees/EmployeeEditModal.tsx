"use client";

import { useState } from "react";
import { Modal } from "@/components/Modal";
import { useHris } from "@/lib/store";
import { fullName } from "@/lib/helpers";
import type { Employee, EmployeeLifecycleStatus, EmploymentStatus } from "@/lib/types";

type EmployeeFormData = Omit<Employee, "id" | "employeeNumber">;

const EMPLOYMENT_STATUSES: EmploymentStatus[] = ["regular", "probationary", "project_based", "freelance", "consultant", "intern"];
const LIFECYCLE_STATUSES: EmployeeLifecycleStatus[] = ["active", "on_leave", "resigned", "terminated"];

function defaultForm(employee: Employee | null, branchId: string, departmentId: string, positionId: string): EmployeeFormData {
  if (employee) {
    const rest: Partial<Employee> = { ...employee };
    delete rest.id;
    delete rest.employeeNumber;
    return rest as EmployeeFormData;
  }
  return {
    firstName: "",
    lastName: "",
    middleName: "",
    nickname: "",
    gender: "Male",
    birthdate: "2000-01-01",
    civilStatus: "Single",
    nationality: "Filipino",
    address: "",
    contactNumber: "",
    email: "",
    emergencyContactName: "",
    emergencyContactPhone: "",
    branchId,
    departmentId,
    positionId,
    supervisorId: null,
    employmentStatus: "regular",
    dateHired: new Date().toISOString().slice(0, 10),
    dateRegularized: null,
    contractStart: null,
    contractEnd: null,
    probationEndsAt: null,
    payrollType: "daily",
    dailyRate: null,
    monthlySalary: null,
    dailyAllowance: null,
    monthlyAllowance: null,
    status: "active",
    statusChangedAt: null,
    roles: ["employee"],
  };
}

export function EmployeeEditModal({
  employee,
  employees,
  onClose,
  onSave,
}: {
  employee: Employee | null;
  employees: Employee[];
  onClose: () => void;
  onSave: (data: EmployeeFormData) => void;
}) {
  const { branches, departments, positions } = useHris();
  const [form, setForm] = useState<EmployeeFormData>(() => defaultForm(employee, branches[0]?.id ?? "", departments[0]?.id ?? "", positions[0]?.id ?? ""));

  const positionsForDept = positions.filter((p) => p.departmentId === form.departmentId);
  const otherEmployees = employees.filter((e) => e.id !== employee?.id);

  function set<K extends keyof EmployeeFormData>(key: K, value: EmployeeFormData[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function submit() {
    if (!form.firstName || !form.lastName) return;
    onSave(form);
  }

  return (
    <Modal open onClose={onClose} title={employee ? `Edit ${fullName(employee)}` : "Add employee"} wide>
      <div className="max-h-[70vh] space-y-5 overflow-y-auto pr-1">
        <FieldSection title="Personal Information">
          <div className="grid grid-cols-2 gap-3">
            <TextField label="First name" value={form.firstName} onChange={(v) => set("firstName", v)} />
            <TextField label="Last name" value={form.lastName} onChange={(v) => set("lastName", v)} />
            <TextField label="Middle name" value={form.middleName ?? ""} onChange={(v) => set("middleName", v)} />
            <TextField label="Nickname" value={form.nickname} onChange={(v) => set("nickname", v)} />
            <SelectField label="Gender" value={form.gender} onChange={(v) => set("gender", v as Employee["gender"])} options={["Male", "Female"]} />
            <DateField label="Birthdate" value={form.birthdate} onChange={(v) => set("birthdate", v)} />
            <SelectField label="Civil status" value={form.civilStatus} onChange={(v) => set("civilStatus", v as Employee["civilStatus"])} options={["Single", "Married", "Widowed", "Separated"]} />
            <TextField label="Nationality" value={form.nationality} onChange={(v) => set("nationality", v)} />
            <TextField label="Contact number" value={form.contactNumber} onChange={(v) => set("contactNumber", v)} />
            <TextField label="Email" value={form.email} onChange={(v) => set("email", v)} className="col-span-2" />
            <TextField label="Address" value={form.address} onChange={(v) => set("address", v)} className="col-span-2" />
            <TextField label="Emergency contact name" value={form.emergencyContactName} onChange={(v) => set("emergencyContactName", v)} />
            <TextField label="Emergency contact phone" value={form.emergencyContactPhone} onChange={(v) => set("emergencyContactPhone", v)} />
          </div>
        </FieldSection>

        <FieldSection title="Employment Details">
          <div className="grid grid-cols-2 gap-3">
            <SelectField label="Branch" value={form.branchId} onChange={(v) => set("branchId", v)} options={branches.map((b) => ({ value: b.id, label: b.name }))} />
            <SelectField
              label="Department"
              value={form.departmentId}
              onChange={(v) => {
                set("departmentId", v);
                const firstPos = positions.find((p) => p.departmentId === v);
                if (firstPos) set("positionId", firstPos.id);
              }}
              options={departments.map((d) => ({ value: d.id, label: d.name }))}
            />
            <SelectField label="Position" value={form.positionId} onChange={(v) => set("positionId", v)} options={positionsForDept.map((p) => ({ value: p.id, label: p.title }))} />
            <SelectField
              label="Supervisor"
              value={form.supervisorId ?? ""}
              onChange={(v) => set("supervisorId", v || null)}
              options={[{ value: "", label: "None" }, ...otherEmployees.map((e) => ({ value: e.id, label: fullName(e) }))]}
            />
            <SelectField label="Employment status" value={form.employmentStatus} onChange={(v) => set("employmentStatus", v as EmploymentStatus)} options={EMPLOYMENT_STATUSES} />
            <SelectField label="Lifecycle status" value={form.status} onChange={(v) => set("status", v as EmployeeLifecycleStatus)} options={LIFECYCLE_STATUSES} />
            <DateField label="Date hired" value={form.dateHired} onChange={(v) => set("dateHired", v)} />
            <DateField label="Date regularized" value={form.dateRegularized ?? ""} onChange={(v) => set("dateRegularized", v || null)} />
            <DateField label="Contract start" value={form.contractStart ?? ""} onChange={(v) => set("contractStart", v || null)} />
            <DateField label="Contract end" value={form.contractEnd ?? ""} onChange={(v) => set("contractEnd", v || null)} />
            <DateField label="Probation ends" value={form.probationEndsAt ?? ""} onChange={(v) => set("probationEndsAt", v || null)} />
          </div>
        </FieldSection>

        <FieldSection title="Payroll">
          <div className="grid grid-cols-2 gap-3">
            <SelectField
              label="Payroll type"
              value={form.payrollType}
              onChange={(v) => set("payrollType", v as Employee["payrollType"])}
              options={[
                { value: "daily", label: "Daily-rate" },
                { value: "monthly", label: "Fixed-rate" },
              ]}
            />
            {form.payrollType === "daily" ? (
              <NumberField label="Daily rate" value={form.dailyRate} onChange={(v) => set("dailyRate", v)} />
            ) : (
              <NumberField label="Monthly salary" value={form.monthlySalary} onChange={(v) => set("monthlySalary", v)} />
            )}
            <NumberField label="Daily allowance" value={form.dailyAllowance} onChange={(v) => set("dailyAllowance", v)} />
            <NumberField label="Monthly allowance" value={form.monthlyAllowance} onChange={(v) => set("monthlyAllowance", v)} />
          </div>
        </FieldSection>

        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="rounded-lg px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40">Cancel</button>
          <button onClick={submit} disabled={!form.firstName || !form.lastName} className="rounded-lg bg-[var(--series-1)] px-3 py-1.5 text-sm font-medium text-[var(--on-accent)] disabled:opacity-40">
            {employee ? "Save changes" : "Add employee"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function FieldSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 text-xs font-semibold text-[var(--text-muted)] uppercase">{title}</div>
      {children}
    </div>
  );
}

function TextField({ label, value, onChange, className = "" }: { label: string; value: string; onChange: (v: string) => void; className?: string }) {
  return (
    <div className={className}>
      <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">{label}</label>
      <input value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-2 text-sm" />
    </div>
  );
}

function DateField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">{label}</label>
      <input type="date" value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-2 text-sm" />
    </div>
  );
}

function NumberField({ label, value, onChange }: { label: string; value: number | null; onChange: (v: number | null) => void }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">{label}</label>
      <input
        type="number"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
        className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-2 text-sm"
      />
    </div>
  );
}

function SelectField<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: T) => void;
  options: (T | { value: string; label: string })[];
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value as T)} className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-2 text-sm">
        {options.map((opt) => {
          const optValue = typeof opt === "string" ? opt : opt.value;
          const optLabel = typeof opt === "string" ? opt : opt.label;
          return (
            <option key={optValue} value={optValue}>{optLabel}</option>
          );
        })}
      </select>
    </div>
  );
}
