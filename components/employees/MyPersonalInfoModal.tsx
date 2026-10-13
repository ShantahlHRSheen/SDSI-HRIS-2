"use client";

import { useState } from "react";
import { Modal } from "@/components/Modal";
import { useHris } from "@/lib/store";
import { saveMyPersonalInfo, type MyPersonalInfo } from "@/lib/supabase/id-card";
import type { Employee } from "@/lib/types";

const input = "w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-2 text-sm";
const lbl = "mb-1 block text-xs font-medium text-[var(--text-secondary)]";

// The signed-in employee edits the Personal Information part of their own
// 201 file (set_my_personal_info allows nothing else, and logs each change).
export function MyPersonalInfoModal({ employee, onClose }: { employee: Employee; onClose: () => void }) {
  const { isRealAccount, patchEmployeeLocal, updateEmployee } = useHris();
  const [f, setF] = useState<MyPersonalInfo>({
    firstName: employee.firstName,
    lastName: employee.lastName,
    middleName: employee.middleName ?? "",
    nickname: employee.nickname ?? "",
    gender: employee.gender,
    birthdate: employee.birthdate ?? "",
    civilStatus: employee.civilStatus ?? "",
    nationality: employee.nationality ?? "",
    address: employee.address ?? "",
    contactNumber: employee.contactNumber ?? "",
    email: employee.email ?? "",
    emergencyContactName: employee.emergencyContactName ?? "",
    emergencyContactPhone: employee.emergencyContactPhone ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof MyPersonalInfo>(k: K, v: MyPersonalInfo[K]) => setF((x) => ({ ...x, [k]: v }));
  const missing = !f.firstName.trim() || !f.lastName.trim() ? "Enter your first and last name." : null;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (missing) return;
    setSaving(true);
    setError(null);
    const patch: Partial<Employee> = {
      firstName: f.firstName.trim(),
      lastName: f.lastName.trim(),
      middleName: f.middleName.trim() || undefined,
      nickname: f.nickname.trim(),
      gender: f.gender,
      birthdate: f.birthdate || null,
      civilStatus: (f.civilStatus || null) as Employee["civilStatus"],
      nationality: f.nationality.trim() || null,
      address: f.address.trim() || null,
      contactNumber: f.contactNumber.trim() || null,
      email: f.email.trim() || null,
      emergencyContactName: f.emergencyContactName.trim() || null,
      emergencyContactPhone: f.emergencyContactPhone.trim() || null,
    };
    try {
      if (isRealAccount) {
        await saveMyPersonalInfo(f);
        patchEmployeeLocal(employee.id, patch);
      } else updateEmployee(employee.id, patch);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save your personal information.");
    } finally {
      setSaving(false);
    }
  }

  const text = (k: keyof MyPersonalInfo, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}, wide = false) => (
    <div className={wide ? "sm:col-span-2" : ""}>
      <label className={lbl} htmlFor={`pi-${k}`}>
        {label}
      </label>
      <input id={`pi-${k}`} value={f[k]} onChange={(e) => set(k, e.target.value as never)} className={input} {...props} />
    </div>
  );

  return (
    <Modal open onClose={onClose} title="Edit my personal information" wide>
      <form onSubmit={save} className="space-y-4">
        <div className="text-xs text-[var(--text-muted)]">Keep your 201 file up to date. HR can see each change in the audit trail. For employment, pay or government ID changes, message HR.</div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {text("firstName", "First name", { maxLength: 80, required: true })}
          {text("lastName", "Last name", { maxLength: 80, required: true })}
          {text("middleName", "Middle name", { maxLength: 80 })}
          {text("nickname", "Nickname", { maxLength: 80 })}
          <div>
            <label className={lbl} htmlFor="pi-gender">
              Gender
            </label>
            <select id="pi-gender" value={f.gender} onChange={(e) => set("gender", e.target.value as MyPersonalInfo["gender"])} className={input}>
              <option>Male</option>
              <option>Female</option>
            </select>
          </div>
          {text("birthdate", "Birthdate", { type: "date" })}
          <div>
            <label className={lbl} htmlFor="pi-civil">
              Civil status
            </label>
            <select id="pi-civil" value={f.civilStatus} onChange={(e) => set("civilStatus", e.target.value)} className={input}>
              <option value="">Not on file</option>
              <option>Single</option>
              <option>Married</option>
              <option>Widowed</option>
              <option>Separated</option>
            </select>
          </div>
          {text("nationality", "Nationality", { maxLength: 60 })}
          {text("address", "Address", { maxLength: 300 }, true)}
          {text("contactNumber", "Contact number", { maxLength: 40, inputMode: "tel" })}
          {text("email", "Email", { maxLength: 120, type: "email" })}
          {text("emergencyContactName", "Emergency contact person", { maxLength: 120, placeholder: "e.g. Maria Santos (mother)" })}
          {text("emergencyContactPhone", "Emergency contact number", { maxLength: 40, inputMode: "tel" })}
        </div>
        {(error || missing) && <div className={`text-xs ${error ? "text-[var(--status-critical)]" : "text-[var(--text-muted)]"}`}>{error ?? missing}</div>}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="rounded-lg px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40">
            Cancel
          </button>
          <button type="submit" disabled={saving || !!missing} className="rounded-lg bg-[var(--series-1)] px-3 py-1.5 text-sm font-medium text-[var(--on-accent)] disabled:opacity-40">
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
