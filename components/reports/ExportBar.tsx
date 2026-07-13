"use client";

import { Download, Printer } from "lucide-react";

export function ExportBar({ onExportCsv, label = "Export CSV" }: { onExportCsv: () => void; label?: string }) {
  return (
    <div className="flex gap-2 print:hidden">
      <button
        onClick={onExportCsv}
        className="flex items-center gap-1.5 rounded-lg border border-[var(--border-hairline)] px-3 py-2 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40"
      >
        <Download size={14} /> {label}
      </button>
      <button
        onClick={() => window.print()}
        className="flex items-center gap-1.5 rounded-lg border border-[var(--border-hairline)] px-3 py-2 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40"
      >
        <Printer size={14} /> Print / Save PDF
      </button>
    </div>
  );
}
