"use client";

import { useState } from "react";
import { Modal } from "@/components/Modal";
import { useHris } from "@/lib/store";
import { reportSaveError } from "@/lib/save-errors";
import { saveEmergencyContact } from "@/lib/supabase/id-card";
import { fullName } from "@/lib/helpers";
import type { Employee } from "@/lib/types";

const input = "w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-2 text-sm";

// Edit an employee's emergency contact — the employee themself or HR
// (set_employee_emergency_contact checks this on the server).
export function EmergencyContactModal({ employee, open, onClose }: { employee: Employee; open: boolean; onClose: () => void }) {
  const { isRealAccount, patchEmployeeLocal, updateEmployee } = useHris();
  const [name, setName] = useState(employee.emergencyContactName ?? "");
  const [phone, setPhone] = useState(employee.emergencyContactPhone ?? "");
  const [saving, setSaving] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const patch = { emergencyContactName: name.trim() || null, emergencyContactPhone: phone.trim() || null };
    try {
      if (isRealAccount) {
        await saveEmergencyContact(employee.id, name, phone);
        patchEmployeeLocal(employee.id, patch);
      } else updateEmployee(employee.id, patch);
      onClose();
    } catch (err) {
      reportSaveError("Couldn't save the emergency contact", err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Emergency contact">
      <form onSubmit={save} className="space-y-3">
        <div className="text-xs text-[var(--text-muted)]">Person to contact in case of emergency for {fullName(employee)}. This also appears on the back of the ID card.</div>
        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Contact person&rsquo;s name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} placeholder="e.g. Maria Santos (mother)" className={input} aria-label="Emergency contact name" autoFocus />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Contact number</label>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={40} inputMode="tel" placeholder="e.g. 0917 123 4567" className={input} aria-label="Emergency contact number" />
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="rounded-lg px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40">
            Cancel
          </button>
          <button type="submit" disabled={saving} className="rounded-lg bg-[var(--series-1)] px-3 py-1.5 text-sm font-medium text-[var(--on-accent)] disabled:opacity-40">
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
