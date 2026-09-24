"use client";

import { useHris } from "@/lib/store";
import { EntityManager } from "@/components/admin/EntityManager";
import { Badge } from "@/components/Badge";
import type { LeaveType } from "@/lib/types";

export default function LeaveTypesAdminPage() {
  const { leaveTypes, addLeaveType, updateLeaveType, removeLeaveType } = useHris();
  return (
    <EntityManager<LeaveType>
      title="Leave Types"
      subtitle="Default annual credits per leave type; individual balances are tracked per employee, per year."
      items={leaveTypes}
      onAdd={addLeaveType}
      onUpdate={updateLeaveType}
      onDelete={removeLeaveType}
      emptyDefaults={{ name: "", defaultCredits: 0, requiresCert: false }}
      fields={[
        { key: "name", label: "Leave type name", type: "text" },
        { key: "defaultCredits", label: "Default annual credits", type: "number" },
        { key: "requiresCert", label: "Requires supporting document (e.g. medical certificate)", type: "checkbox" },
      ]}
      columns={[
        { key: "name", label: "Name", render: (l) => <span className="font-medium text-[var(--text-primary)]">{l.name}</span> },
        { key: "credits", label: "Default credits", render: (l) => `${l.defaultCredits} days/yr` },
        { key: "cert", label: "Requires document", render: (l) => (l.requiresCert ? <Badge tone="info">Yes</Badge> : <Badge tone="muted">No</Badge>) },
      ]}
    />
  );
}
