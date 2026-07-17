"use client";

import { useHris } from "@/lib/store";
import { EntityManager } from "@/components/admin/EntityManager";
import { departmentName } from "@/lib/helpers";
import type { Position } from "@/lib/types";

export default function PositionsAdminPage() {
  const { positions, departments, addPosition, updatePosition, removePosition } = useHris();
  return (
    <EntityManager<Position>
      title="Positions"
      subtitle="Job positions mapped to a department."
      items={positions}
      onAdd={addPosition}
      onUpdate={updatePosition}
      onDelete={removePosition}
      emptyDefaults={{ title: "", departmentId: departments[0]?.id ?? "" }}
      fields={[
        { key: "title", label: "Position title", type: "text" },
        { key: "departmentId", label: "Department", type: "select", options: departments.map((d) => ({ value: d.id, label: d.name })) },
      ]}
      columns={[
        { key: "title", label: "Title", render: (p) => <span className="font-medium text-[var(--text-primary)]">{p.title}</span> },
        { key: "department", label: "Department", render: (p) => departmentName(p.departmentId) },
      ]}
    />
  );
}
