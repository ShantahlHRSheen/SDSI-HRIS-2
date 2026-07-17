"use client";

import { useHris } from "@/lib/store";
import { EntityManager } from "@/components/admin/EntityManager";
import { Badge } from "@/components/Badge";
import { formatDate } from "@/lib/helpers";
import type { Holiday } from "@/lib/types";
import { Info } from "lucide-react";

export default function HolidaysAdminPage() {
  const { holidays, addHoliday, updateHoliday, removeHoliday } = useHris();
  return (
    <div>
      <div className="mb-4 flex items-start gap-2 rounded-lg bg-[var(--gridline)]/30 p-3 text-xs text-[var(--text-secondary)]">
        <Info size={14} className="mt-0.5 shrink-0" />
        <span>
          Movable holidays (e.g. Maundy Thursday, National Heroes Day) and special non-working days are set by annual
          Malacañang proclamation. Entries marked <Badge tone="warning">Unverified</Badge> should be reconfirmed against
          the official proclamation for the applicable year before finalizing payroll cut-offs.
        </span>
      </div>
      <EntityManager<Holiday>
        title="Holidays"
        subtitle="Regular and special non-working holidays used for holiday pay computation."
        items={holidays}
        onAdd={addHoliday}
        onUpdate={updateHoliday}
        onDelete={removeHoliday}
        emptyDefaults={{ name: "", date: "2026-01-01", type: "regular", verified: false }}
        fields={[
          { key: "name", label: "Holiday name", type: "text" },
          { key: "date", label: "Date", type: "date" },
          { key: "type", label: "Type", type: "select", options: [{ value: "regular", label: "Regular Holiday" }, { value: "special_non_working", label: "Special Non-Working Day" }] },
          { key: "verified", label: "Confirmed by official proclamation", type: "checkbox" },
        ]}
        columns={[
          { key: "name", label: "Name", render: (h) => <span className="font-medium text-[var(--text-primary)]">{h.name}</span> },
          { key: "date", label: "Date", render: (h) => formatDate(h.date) },
          { key: "type", label: "Type", render: (h) => <Badge tone="info">{h.type === "regular" ? "Regular" : "Special non-working"}</Badge> },
          { key: "verified", label: "Status", render: (h) => (h.verified ? <Badge tone="good">Confirmed</Badge> : <Badge tone="warning">Unverified</Badge>) },
        ]}
      />
    </div>
  );
}
