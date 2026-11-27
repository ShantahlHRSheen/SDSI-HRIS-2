"use client";

import { useEffect, useState } from "react";
import { AlarmClock, CalendarCheck, Loader2, Sunrise } from "lucide-react";
import { useHris } from "@/lib/store";
import { departmentName, fullName } from "@/lib/helpers";
import { fetchAttendanceAwards, type SaeAttendanceAwardRow } from "@/lib/sales-admin-eval";

// Attendance awards from the HRIS (phase 100), for HR and Upper Management:
// Best in Attendance (highest attendance rate), Most Punctual (fewest lates,
// then fewest late minutes) and Early Bird (earliest average time in — only
// when biometrics imports kept the punches). Ties: every tied employee wins.
//
// Eligible: active employees with day-by-day attendance in at least 80% of
// the year's cut-offs, and days worked recorded — so missing or incomplete
// records don't win (or lose) an award.

type Data = NonNullable<Awaited<ReturnType<typeof fetchAttendanceAwards>>>;

const same = (a: number, b: number) => Math.abs(a - b) < 1e-9;
const clock = (m: number) => {
  const h = Math.floor(m / 60), mm = Math.round(m % 60);
  return `${((h + 11) % 12) + 1}:${String(mm).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
};

export function AttendanceAwards({ year, initial }: { year: number; initial?: Data }) {
  const { employees } = useHris();
  const [data, setData] = useState<Data | null | undefined>(initial);
  useEffect(() => {
    if (initial) return;
    let live = true;
    fetchAttendanceAwards(year).then((d) => live && setData(d));
    return () => {
      live = false;
    };
  }, [year, initial]);

  const box = "mb-3 rounded-xl border border-[var(--border-hairline)] bg-[var(--gridline)]/10 p-3";
  const head = (
    <div className="mb-2 flex flex-wrap items-center gap-2 text-sm font-medium text-[var(--text-primary)]">
      <CalendarCheck size={16} className="text-[var(--series-1)]" /> Attendance awards {year}
      <span className="text-xs font-normal text-[var(--text-muted)]">— from the HRIS attendance records</span>
    </div>
  );
  if (data === undefined)
    return (
      <div className={box}>
        {head}
        <div className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
          <Loader2 size={12} className="animate-spin" /> Loading…
        </div>
      </div>
    );
  if (data === null) return null;

  const min = Math.ceil(data.maxDetailCutoffs * 0.8);
  const eligible = data.employees.filter((r) => data.maxDetailCutoffs > 0 && r.detailCutoffs >= min && r.daysWorked > 0);
  const name = (id: string) => {
    const e = employees.find((x) => x.id === id);
    return { name: e ? fullName(e) : id, dept: e ? departmentName(e.departmentId) : "" };
  };
  const rate = (r: SaeAttendanceAwardRow) => r.daysWorked / (r.daysWorked + r.absences);

  const bestRate = eligible.length ? Math.max(...eligible.map(rate)) : 0;
  const attendance = eligible.filter((r) => same(rate(r), bestRate));
  const fewest = eligible.length ? Math.min(...eligible.map((r) => r.lates)) : 0;
  const fewestMin = Math.min(...eligible.filter((r) => r.lates === fewest).map((r) => r.lateMinutes));
  const punctual = eligible.filter((r) => r.lates === fewest && same(r.lateMinutes, fewestMin));
  const withPunches = eligible.filter((r) => r.punchDays >= 20 && r.avgFirstIn !== null);
  const earliest = withPunches.length ? Math.min(...withPunches.map((r) => r.avgFirstIn as number)) : null;
  const early = earliest === null ? [] : withPunches.filter((r) => Math.round(r.avgFirstIn as number) === Math.round(earliest));

  const card = (icon: React.ReactNode, award: string, what: string, winners: SaeAttendanceAwardRow[], score: (r: SaeAttendanceAwardRow) => string, empty: string) => (
    <div className="rounded-xl border border-[var(--series-1)]/40 bg-[var(--series-1)]/5 p-3">
      <div className="flex items-start gap-2">
        {icon}
        <div className="min-w-0">
          <div className="text-sm font-semibold text-[var(--text-primary)]">{award}</div>
          <div className="text-[11px] text-[var(--text-muted)]">
            {what}
            {winners.length > 1 && <span className="ml-1 rounded-full bg-amber-400/15 px-1.5 py-px font-medium text-amber-500">Tie · {winners.length} co-winners</span>}
          </div>
        </div>
      </div>
      {winners.length ? (
        <div className="mt-2 space-y-1">
          {winners.map((w) => {
            const n = name(w.employeeId);
            return (
              <div key={w.employeeId} className="flex items-end justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate font-medium text-[var(--text-primary)]">{n.name}</div>
                  <div className="truncate text-[11px] text-[var(--text-muted)]">{n.dept}</div>
                </div>
                <div className="shrink-0 text-right text-xs font-semibold text-[var(--text-primary)] tabular-nums">{score(w)}</div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="mt-2 text-xs text-[var(--text-muted)]">{empty}</div>
      )}
    </div>
  );

  return (
    <div className={box}>
      {head}
      <div className="grid gap-2 sm:grid-cols-3">
        {card(<CalendarCheck size={17} className="mt-0.5 shrink-0 text-amber-400" />, "Best in Attendance Award", "Highest attendance rate (days worked ÷ days worked + absences)", attendance, (r) => `${(rate(r) * 100).toFixed(1)}% · ${r.absences} absence${r.absences === 1 ? "" : "s"}`, "No complete attendance records for this year.")}
        {card(<AlarmClock size={17} className="mt-0.5 shrink-0 text-amber-400" />, "Most Punctual Award", "Fewest lates (then fewest late minutes)", punctual, (r) => `${r.lates} late${r.lates === 1 ? "" : "s"} · ${Math.round(r.lateMinutes)} min`, "No complete attendance records for this year.")}
        {card(<Sunrise size={17} className="mt-0.5 shrink-0 text-amber-400" />, "Early Bird Award", "Earliest average time in", early, (r) => `avg. ${clock(r.avgFirstIn as number)}`, "Not available yet — the HRIS has no daily time-in punches for this year (the attendance was imported as totals). It's picked automatically once biometrics files with time-in are imported.")}
      </div>
      <div className="mt-2 text-[11px] text-[var(--text-muted)]">
        {`Among ${eligible.length} active employee${eligible.length === 1 ? "" : "s"} with day-by-day attendance in at least ${min} of the year’s ${data.maxDetailCutoffs} cut-offs (others aren’t counted, so missing records don’t decide an award). Absences are as recorded in the HRIS attendance.`}
      </div>
    </div>
  );
}
