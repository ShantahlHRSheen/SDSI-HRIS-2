"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import { useHris } from "@/lib/store";
import { Badge } from "@/components/Badge";
import { Modal } from "@/components/Modal";
import { ROLE_LABELS } from "@/lib/types";
import type { DemoUser, Role } from "@/lib/types";

const ALL_ROLES = Object.keys(ROLE_LABELS) as Role[];

export default function UsersAdminPage() {
  const { demoUsers, updateUserRoles } = useHris();
  const [editing, setEditing] = useState<DemoUser | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);

  function openEdit(u: DemoUser) {
    setEditing(u);
    setRoles(u.roles);
  }

  function toggle(r: Role) {
    setRoles((prev) => (prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]));
  }

  function save() {
    if (editing) {
      updateUserRoles(editing.id, roles);
      setEditing(null);
    }
  }

  return (
    <div>
      <div className="mb-4">
        <div className="text-sm font-medium text-[var(--text-primary)]">Users &amp; Role Assignment</div>
        <div className="text-xs text-[var(--text-muted)]">
          Roles are additive — a single user can hold multiple roles at once (e.g. Employee + Department Head). Changes apply for this demo session.
        </div>
      </div>
      <div className="overflow-x-auto rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-1)]">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b border-[var(--border-hairline)] text-left text-xs text-[var(--text-muted)]">
              <th className="px-4 py-2 font-medium">User</th>
              <th className="px-4 py-2 font-medium">Title</th>
              <th className="px-4 py-2 font-medium">Roles</th>
              <th className="px-4 py-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {demoUsers.map((u) => (
              <tr key={u.id} className="border-b border-[var(--gridline)] last:border-0">
                <td className="px-4 py-2.5 font-medium text-[var(--text-primary)]">{u.name}</td>
                <td className="px-4 py-2.5 text-[var(--text-secondary)]">{u.title}</td>
                <td className="px-4 py-2.5">
                  <div className="flex flex-wrap gap-1">
                    {u.roles.map((r) => <Badge key={r} tone="info">{ROLE_LABELS[r]}</Badge>)}
                  </div>
                </td>
                <td className="px-4 py-2.5">
                  <button onClick={() => openEdit(u)} className="rounded-md p-1.5 text-[var(--text-muted)] hover:bg-[var(--gridline)]/50" aria-label="Edit roles">
                    <Pencil size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={!!editing} onClose={() => setEditing(null)} title={`Edit roles — ${editing?.name ?? ""}`}>
        <div className="space-y-2">
          {ALL_ROLES.map((r) => (
            <label key={r} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-[var(--gridline)]/30">
              <input type="checkbox" checked={roles.includes(r)} onChange={() => toggle(r)} />
              {ROLE_LABELS[r]}
            </label>
          ))}
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={() => setEditing(null)} className="rounded-lg px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40">Cancel</button>
            <button onClick={save} className="rounded-lg bg-[var(--series-1)] px-3 py-1.5 text-sm font-medium text-[var(--on-accent)]">Save roles</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
