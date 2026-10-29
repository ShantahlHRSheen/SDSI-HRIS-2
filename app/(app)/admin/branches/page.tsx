"use client";

import { useHris } from "@/lib/store";
import { EntityManager } from "@/components/admin/EntityManager";
import type { Branch } from "@/lib/types";
import { fullName } from "@/lib/helpers";

export default function BranchesAdminPage() {
  const { branches, employees: listed, adminAccounts, addBranch, updateBranch, removeBranch } = useHris();
  // Admin-only accounts can be branch approvers too (e.g. an LSM Area Manager).
  const employees = [...listed, ...adminAccounts];
  const active = employees.filter((e) => e.status !== "resigned" && e.status !== "terminated").sort((a, b) => fullName(a).localeCompare(fullName(b)));
  const nameOf = (id: string | null | undefined) => {
    const e = id ? employees.find((x) => x.id === id) : undefined;
    return e ? `${e.firstName} ${e.lastName}` : "—";
  };
  return (
    <EntityManager<Branch>
      title="Branches"
      subtitle={`${branches.length} branches currently configured across the Philippines.`}
      items={branches}
      onAdd={addBranch}
      onUpdate={updateBranch}
      onDelete={removeBranch}
      emptyDefaults={{ name: "", code: "", address: "" }}
      fields={[
        { key: "name", label: "Branch name", type: "text" },
        { key: "code", label: "Code", type: "text", placeholder: "e.g. MNL" },
        { key: "address", label: "Address", type: "text" },
        {
          key: "approverId",
          label: "Branch approver (approves leave, OT and correction forms before the department head)",
          type: "select",
          options: [{ value: "", label: "None" }, ...active.map((e) => ({ value: e.id, label: fullName(e) }))],
        },
      ]}
      columns={[
        { key: "name", label: "Name", render: (b) => <span className="font-medium text-[var(--text-primary)]">{b.name}</span> },
        { key: "code", label: "Code", render: (b) => b.code },
        { key: "address", label: "Address", render: (b) => b.address },
        { key: "approver", label: "Branch approver", render: (b) => nameOf(b.approverId) },
      ]}
    />
  );
}
