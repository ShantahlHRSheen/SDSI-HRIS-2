"use client";

import { useHris } from "@/lib/store";
import { EntityManager } from "@/components/admin/EntityManager";
import type { Department } from "@/lib/types";

export default function DepartmentsAdminPage() {
  const { departments, addDepartment, updateDepartment, removeDepartment } = useHris();
  return (
    <EntityManager<Department>
      title="Departments"
      subtitle="Company-wide departments, shared across all branches."
      items={departments}
      onAdd={addDepartment}
      onUpdate={updateDepartment}
      onDelete={removeDepartment}
      emptyDefaults={{ name: "" }}
      fields={[{ key: "name", label: "Department name", type: "text" }]}
      columns={[{ key: "name", label: "Name", render: (d) => <span className="font-medium text-[var(--text-primary)]">{d.name}</span> }]}
    />
  );
}
