// Payroll cut-offs (1st–15th and 16th–end of month), for grouping the
// "All requests" lists on the Leave, Overtime and Attendance Corrections pages.

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export interface Cutoff {
  key: string; // "2026-10-1" (1–15) or "2026-10-2" (16–end); sorts by date
  label: string; // "Oct 1 – 15, 2026"
}

export function cutoffOf(date: string): Cutoff {
  const [y, m, d] = date.slice(0, 10).split("-").map(Number);
  const second = d >= 16;
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return {
    key: `${y}-${String(m).padStart(2, "0")}-${second ? 2 : 1}`,
    label: `${MONTHS[m - 1]} ${second ? 16 : 1} – ${second ? last : 15}, ${y}`,
  };
}

// The cut-offs present in a list, newest first.
export function cutoffsIn(dates: string[]): Cutoff[] {
  const byKey = new Map<string, Cutoff>();
  for (const d of dates) {
    const c = cutoffOf(d);
    byKey.set(c.key, c);
  }
  return [...byKey.values()].sort((a, b) => (a.key < b.key ? 1 : -1));
}

export function CutoffSelect({ value, onChange, cutoffs }: { value: string; onChange: (v: string) => void; cutoffs: Cutoff[] }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-2.5 py-1.5 text-xs" aria-label="Cut-off">
      <option value="all">All cut-offs</option>
      {cutoffs.map((c) => (
        <option key={c.key} value={c.key}>
          {c.label}
        </option>
      ))}
    </select>
  );
}

// Heading row shown above the first request of each cut-off.
export function CutoffHeaderRow({ label, count, colSpan }: { label: string; count: number; colSpan: number }) {
  return (
    <tr className="border-b border-[var(--border-hairline)] bg-[var(--gridline)]/30">
      <td colSpan={colSpan} className="px-3 py-1.5 text-xs font-semibold tracking-wide text-[var(--text-primary)]">
        Cut-off: {label} <span className="font-normal text-[var(--text-muted)]">· {count} request{count === 1 ? "" : "s"}</span>
      </td>
    </tr>
  );
}
