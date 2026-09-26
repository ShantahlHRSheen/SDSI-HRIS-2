import type { PayrollPeriod } from "./types";

// Semi-monthly cut-offs (1st–15th, 16th–end of month) missing between the
// last payroll period and the end of the month of `throughDate`
// (YYYY-MM-DD). Continues from the day after the last period ends.
export function missingSemiMonthlyPeriods(periods: PayrollPeriod[], throughDate: string): { start: string; end: string }[] {
  const pad = (n: number) => String(n).padStart(2, "0");
  const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
  const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
  const [ty, tm] = throughDate.split("-").map(Number);
  const limit = iso(ty, tm, lastDay(ty, tm));

  const latestEnd = periods.map((p) => p.end).sort().at(-1);
  let [y, m, d] = latestEnd ? latestEnd.split("-").map(Number) : [ty, tm, 0];
  // Day after the last period (or the 1st of this month if there are none).
  d += 1;
  if (d > lastDay(y, m)) {
    d = 1;
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  const out: { start: string; end: string }[] = [];
  while (iso(y, m, d) <= limit && out.length < 48) {
    const endDay = d <= 15 ? 15 : lastDay(y, m);
    out.push({ start: iso(y, m, d), end: iso(y, m, endDay) });
    if (endDay === 15) d = 16;
    else {
      d = 1;
      m += 1;
      if (m > 12) {
        m = 1;
        y += 1;
      }
    }
  }
  return out;
}
