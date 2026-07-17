"use client";

import { useHris } from "@/lib/store";
import { EntityManager } from "@/components/admin/EntityManager";
import type { WorkSchedule } from "@/lib/types";

export default function SchedulesAdminPage() {
  const { workSchedules, addWorkSchedule, updateWorkSchedule, removeWorkSchedule } = useHris();
  return (
    <EntityManager<WorkSchedule>
      title="Work Schedules"
      subtitle="Shift templates available for assignment on the employee 201 file."
      items={workSchedules}
      onAdd={addWorkSchedule}
      onUpdate={updateWorkSchedule}
      onDelete={removeWorkSchedule}
      emptyDefaults={{ name: "", timeIn: "08:00", timeOut: "17:00", days: "Mon–Fri", graceMinutes: 10 }}
      fields={[
        { key: "name", label: "Schedule name", type: "text" },
        { key: "timeIn", label: "Time in", type: "text", placeholder: "08:00" },
        { key: "timeOut", label: "Time out", type: "text", placeholder: "17:00" },
        { key: "days", label: "Days", type: "text", placeholder: "Mon–Fri" },
        { key: "graceMinutes", label: "Grace period (minutes)", type: "number" },
      ]}
      columns={[
        { key: "name", label: "Name", render: (s) => <span className="font-medium text-[var(--text-primary)]">{s.name}</span> },
        { key: "hours", label: "Hours", render: (s) => `${s.timeIn} – ${s.timeOut}` },
        { key: "days", label: "Days", render: (s) => s.days },
        { key: "grace", label: "Grace", render: (s) => `${s.graceMinutes} min` },
      ]}
    />
  );
}
