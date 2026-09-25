"use client";

import { useMemo, useState } from "react";
import { Pencil, Search } from "lucide-react";
import { useHris } from "@/lib/store";
import { Badge } from "@/components/Badge";
import { Modal } from "@/components/Modal";
import { fullName } from "@/lib/helpers";
import { ROLE_LABELS } from "@/lib/types";
import type { Role } from "@/lib/types";

const ALL_ROLES = Object.keys(ROLE_LABELS) as Role[];

type Editable = { id: string; name: string; subtitle: string; roles: Role[] };

// Real accounts: every employee's roles, saved to their employee record.
// Demo login: the sample demo users (changes last for the demo session).
export default function UsersAdminPage() {
  const { demoUsers, updateUserRoles, employees, updateEmployee, isRealAccount, currentUser } = useHris();
  const [editing, setEditing] = useState<Editable | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);

  const rows: Editable[] = useMemo(() => {
    if (!isRealAccount) return demoUsers.map((u) => ({ id: u.id, name: u.name, subtitle: u.title, roles: u.roles }));
    const q = query.trim().toLowerCase();
    return employees
      .filter((e) => e.status !== "resigned" && e.status !== "terminated")
      .filter((e) => !q || fullName(e).toLowerCase().includes(q) || e.employeeNumber.toLowerCase().includes(q))
      .sort((a, b) => fullName(a).localeCompare(fullName(b)))
      .map((e) => ({ id: e.id, name: fullName(e), subtitle: `${e.employeeNumber}${e.hasLogin ? "" : " · no login yet"}`, roles: e.roles }));
  }, [isRealAccount, demoUsers, employees, query]);

  const isSelf = !!editing && isRealAccount && editing.id === currentUser?.employeeId;

  function openEdit(u: Editable) {
    setEditing(u);
    setRoles(u.roles);
  }

  function toggle(r: Role) {
    // Don't let HR remove their own HR access by accident.
    if (isSelf && r === "hr_admin") return;
    setRoles((prev) => (prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]));
  }

  async function save() {
    if (!editing || roles.length === 0) return;
    if (isRealAccount) {
      setSaving(true);
      await updateEmployee(editing.id, { roles });
      setSaving(false);
    } else {
      updateUserRoles(editing.id, roles);
    }
    setEditing(null);
  }

  return (
    <div>
      <div className="mb-4">
        <div className="text-sm font-medium text-[var(--text-primary)]">Users &amp; Role Assignment</div>
        <div className="text-xs text-[var(--text-muted)]">
          Roles are additive — a single person can hold several at once (e.g. Employee + Department Head).{" "}
          {isRealAccount ? "Changes are saved to the employee's record and take effect the next time they open the app." : "Changes apply for this demo session."}
        </div>
      </div>
      {isRealAccount && (
        <label className="mb-3 flex max-w-sm items-center gap-2 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-2.5 py-1.5">
          <Search size={15} className="text-[var(--text-muted)]" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name or EMP number" className="w-full bg-transparent text-sm outline-none" aria-label="Search employees" />
        </label>
      )}
      <div className="overflow-x-auto rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-1)]">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b border-[var(--border-hairline)] text-left text-xs text-[var(--text-muted)]">
              <th className="px-4 py-2 font-medium">{isRealAccount ? "Employee" : "User"}</th>
              <th className="px-4 py-2 font-medium">{isRealAccount ? "EMP no." : "Title"}</th>
              <th className="px-4 py-2 font-medium">Roles</th>
              <th className="px-4 py-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((u) => (
              <tr key={u.id} className="border-b border-[var(--gridline)] last:border-0">
                <td className="px-4 py-2.5 font-medium text-[var(--text-primary)]">{u.name}</td>
                <td className="px-4 py-2.5 text-[var(--text-secondary)]">{u.subtitle}</td>
                <td className="px-4 py-2.5">
                  <div className="flex flex-wrap gap-1">
                    {u.roles.map((r) => (
                      <Badge key={r} tone="info">
                        {ROLE_LABELS[r]}
                      </Badge>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-2.5">
                  <button onClick={() => openEdit(u)} className="rounded-md p-1.5 text-[var(--text-muted)] hover:bg-[var(--gridline)]/50" aria-label={`Edit roles for ${u.name}`}>
                    <Pencil size={14} />
                  </button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-sm text-[var(--text-muted)]">
                  No one found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal open={!!editing} onClose={() => setEditing(null)} title={`Edit roles — ${editing?.name ?? ""}`}>
        <div className="space-y-2">
          {ALL_ROLES.map((r) => (
            <label key={r} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-[var(--gridline)]/30">
              <input type="checkbox" checked={roles.includes(r)} onChange={() => toggle(r)} disabled={isSelf && r === "hr_admin"} />
              {ROLE_LABELS[r]}
              {isSelf && r === "hr_admin" && <span className="text-xs text-[var(--text-muted)]">(you can&rsquo;t remove your own HR access)</span>}
            </label>
          ))}
          {roles.length === 0 && <div className="text-xs text-[var(--status-critical)]">Choose at least one role.</div>}
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={() => setEditing(null)} className="rounded-lg px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40">
              Cancel
            </button>
            <button onClick={save} disabled={saving || roles.length === 0} className="rounded-lg bg-[var(--series-1)] px-3 py-1.5 text-sm font-medium text-[var(--on-accent)] disabled:opacity-40">
              {saving ? "Saving…" : "Save roles"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
