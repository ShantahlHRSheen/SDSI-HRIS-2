"use client";

import { useHris } from "@/lib/store";
import { EntityManager } from "@/components/admin/EntityManager";
import type { Department } from "@/lib/types";
import { DIVISION_LABELS } from "@/lib/types";

const DIVISION_OPTIONS = Object.entries(DIVISION_LABELS).map(([value, label]) => ({ value, label }));

export default function DepartmentsAdminPage() {
  const { departments, addDepartment, updateDepartment, removeDepartment } = useHris();
  return (
    <EntityManager<Department>
      title="Departments"
      subtitle="Company-wide departments, shared across all branches, grouped into Shared Services or Business Units."
      items={departments}
      onAdd={addDepartment}
      onUpdate={updateDepartment}
      onDelete={removeDepartment}
      emptyDefaults={{ name: "", division: "shared_services" }}
      fields={[
        { key: "name", label: "Department name", type: "text" },
        { key: "division", label: "Division", type: "select", options: DIVISION_OPTIONS },
      ]}
      columns={[
        { key: "name", label: "Name", render: (d) => <span className="font-medium text-[var(--text-primary)]">{d.name}</span> },
        { key: "division", label: "Division", render: (d) => <span>{DIVISION_LABELS[d.division]}</span> },
      ]}
    />
  );
}
