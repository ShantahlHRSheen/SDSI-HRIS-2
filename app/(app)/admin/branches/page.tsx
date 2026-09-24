"use client";

import { useHris } from "@/lib/store";
import { EntityManager } from "@/components/admin/EntityManager";
import type { Branch } from "@/lib/types";

export default function BranchesAdminPage() {
  const { branches, addBranch, updateBranch, removeBranch } = useHris();
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
      ]}
      columns={[
        { key: "name", label: "Name", render: (b) => <span className="font-medium text-[var(--text-primary)]">{b.name}</span> },
        { key: "code", label: "Code", render: (b) => b.code },
        { key: "address", label: "Address", render: (b) => b.address },
      ]}
    />
  );
}
