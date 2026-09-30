import type { Employee, LeaveRequest, PayrollPeriod } from "./types";
import type { PayrollLine } from "./payroll";

// 13th month pay and leave credits, per employee per year — the company's
// "13TH MONTH PAY AND LEAVE CREDITS" sheet:
// - Per month, the basic pay of the 1st cutoff (period starting on the 1st)
//   and the 2nd cutoff (starting on the 16th), each less its lates /
//   absences / undertime deductions, from the payroll.
// - 13th month = the year's gross basic pay ÷ 12.
// - Monetized VL = unused vacation leave days × daily rate. Vacation leave
//   is credited per half year (Jan–Jun, Jul–Dec) for the halves the employee
//   was on the payroll; days used are the VL days paid in the payroll or the
//   approved/pending VL requests, whichever is more.
// - Plus the last salary (for someone leaving), less any SSS / PhilHealth /
//   Pag-IBIG still to deduct.
// HR can change any of these; only the changes are stored
// (ThirteenthMonthEntry) and a blank field means "as computed".

export interface MonthFigures {
  b1: number; // basic, 1st cutoff
  l1: number; // lates / absences / undertime, 1st cutoff
  b2: number;
  l2: number;
}
export type MonthOverride = Partial<Record<keyof MonthFigures, number | null>>;

export interface ThirteenthMonthEntry {
  year: number;
  employeeId: string;
  designation: string | null;
  months: Record<string, MonthOverride>; // "1".."12"
  vlDays: number | null;
  dailyRate: number | null;
  lastSalary: number;
  sss: number;
  philhealth: number;
  hdmf: number;
  updatedBy?: string;
  updatedAt?: string;
}

export interface ThirteenthMonthRow {
  employee: Employee;
  designation: string;
  months: (MonthFigures & { net: number; edited: boolean })[]; // index 0 = January
  monthsAuto: MonthFigures[]; // the payroll's own figures
  grossBasic: number;
  thirteenthMonth: number;
  vlDays: number;
  vlDaysAuto: number;
  dailyRate: number;
  dailyRateAuto: number;
  monetizedVl: number;
  lastSalary: number;
  sss: number;
  philhealth: number;
  hdmf: number;
  deductions: number;
  total: number;
  edited: boolean;
}

export const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const VL_ID = "lt-vl";
const COUNTED = new Set(["approved", "pending"]);

export const round2 = (n: number) => Math.round(n * 100) / 100;

export function emptyEntry(year: number, employeeId: string): ThirteenthMonthEntry {
  return { year, employeeId, designation: null, months: {}, vlDays: null, dailyRate: null, lastSalary: 0, sss: 0, philhealth: 0, hdmf: 0 };
}

// Weekday VL request days per half of `year` (0 = Jan–Jun, 1 = Jul–Dec).
function vlRequestDays(requests: LeaveRequest[], employeeId: string, year: number): [number, number] {
  const out: [number, number] = [0, 0];
  for (const r of requests) {
    if (r.employeeId !== employeeId || r.leaveTypeId !== VL_ID || !COUNTED.has(r.status)) continue;
    const days: string[] = [];
    const cur = new Date(r.startDate + "T00:00:00Z");
    const end = new Date(r.endDate + "T00:00:00Z");
    while (cur <= end) {
      const dow = cur.getUTCDay();
      if (dow !== 0 && dow !== 6) days.push(cur.toISOString().slice(0, 10));
      cur.setUTCDate(cur.getUTCDate() + 1);
    }
    if (!days.length) continue;
    const per = r.days / days.length;
    for (const d of days) if (Number(d.slice(0, 4)) === year) out[Number(d.slice(5, 7)) <= 6 ? 0 : 1] += per;
  }
  return out;
}

export function computeThirteenthMonth(input: {
  year: number;
  employees: Employee[];
  periods: PayrollPeriod[];
  // Payroll lines of each period (computePayrollForPeriod), by period id.
  linesByPeriod: Map<string, PayrollLine[]>;
  leaveRequests: LeaveRequest[];
  vlCreditsPerYear: number;
  entries: ThirteenthMonthEntry[];
  positionTitle: (positionId: string) => string;
}): ThirteenthMonthRow[] {
  const { year, employees, periods, linesByPeriod, leaveRequests, vlCreditsPerYear, entries, positionTitle } = input;
  const entryBy = new Map(entries.filter((e) => e.year === year).map((e) => [e.employeeId, e]));

  // Payroll figures per employee: [month][cutoff], plus VL days and the latest rate.
  type Acc = { cut: MonthFigures[]; vlPaid: [number, number]; onPayroll: [boolean, boolean]; rate: number; rateFrom: string };
  const acc = new Map<string, Acc>();
  const yearPeriods = periods.filter((p) => Number(p.start.slice(0, 4)) === year);
  for (const p of yearPeriods) {
    const month = Number(p.start.slice(5, 7)) - 1;
    const second = Number(p.start.slice(8, 10)) >= 16;
    const half = month < 6 ? 0 : 1;
    for (const l of linesByPeriod.get(p.id) ?? []) {
      let a = acc.get(l.employeeId);
      if (!a) {
        a = { cut: Array.from({ length: 12 }, () => ({ b1: 0, l1: 0, b2: 0, l2: 0 })), vlPaid: [0, 0], onPayroll: [false, false], rate: 0, rateFrom: "" };
        acc.set(l.employeeId, a);
      }
      const m = a.cut[month];
      const less = l.latesUndertime + l.undertimeDeduction;
      if (second) {
        m.b2 += l.basicPay;
        m.l2 += less;
      } else {
        m.b1 += l.basicPay;
        m.l1 += less;
      }
      a.vlPaid[half] += l.vlDays;
      a.onPayroll[half] = true;
      if (l.ratePerDay > 0 && p.start >= a.rateFrom) {
        a.rate = l.ratePerDay;
        a.rateFrom = p.start;
      }
    }
  }

  const ids = new Set([...acc.keys(), ...entryBy.keys()]);
  const byId = new Map(employees.map((e) => [e.id, e]));
  const rows: ThirteenthMonthRow[] = [];
  for (const id of ids) {
    const employee = byId.get(id);
    if (!employee) continue;
    const a = acc.get(id);
    const entry = entryBy.get(id) ?? emptyEntry(year, id);

    let edited = false;
    const monthsAuto = Array.from({ length: 12 }, (_, i) => {
      const c = a?.cut[i] ?? { b1: 0, l1: 0, b2: 0, l2: 0 };
      return { b1: round2(c.b1), l1: round2(c.l1), b2: round2(c.b2), l2: round2(c.l2) };
    });
    const months = monthsAuto.map((auto, i) => {
      const ov = entry.months[String(i + 1)] ?? {};
      const pick = (k: keyof MonthFigures) => (ov[k] ?? null) !== null ? (ov[k] as number) : auto[k];
      const f = { b1: pick("b1"), l1: pick("l1"), b2: pick("b2"), l2: pick("l2") };
      const monthEdited = (["b1", "l1", "b2", "l2"] as const).some((k) => (ov[k] ?? null) !== null);
      edited ||= monthEdited;
      return { ...f, net: round2(f.b1 - f.l1 + f.b2 - f.l2), edited: monthEdited };
    });
    const grossBasic = round2(months.reduce((s, m) => s + m.net, 0));
    const thirteenthMonth = round2(grossBasic / 12);

    const requested = vlRequestDays(leaveRequests, id, year);
    const perHalf = vlCreditsPerYear / 2;
    const vlDaysAuto = round2(
      [0, 1].reduce((s, h) => (a?.onPayroll[h] ? s + Math.max(perHalf - Math.max(a.vlPaid[h], requested[h]), 0) : s), 0),
    );
    const vlDays = entry.vlDays ?? vlDaysAuto;
    const dailyRateAuto = round2(a?.rate ?? 0);
    const dailyRate = entry.dailyRate ?? dailyRateAuto;
    const monetizedVl = round2(vlDays * dailyRate);
    const deductions = round2(entry.sss + entry.philhealth + entry.hdmf);
    const total = round2(thirteenthMonth + monetizedVl + entry.lastSalary - deductions);
    edited ||= entry.vlDays !== null || entry.dailyRate !== null || entry.designation !== null || entry.lastSalary !== 0 || deductions !== 0;

    rows.push({
      employee,
      designation: entry.designation ?? positionTitle(employee.positionId),
      months,
      monthsAuto,
      grossBasic,
      thirteenthMonth,
      vlDays,
      vlDaysAuto,
      dailyRate,
      dailyRateAuto,
      monetizedVl,
      lastSalary: entry.lastSalary,
      sss: entry.sss,
      philhealth: entry.philhealth,
      hdmf: entry.hdmf,
      deductions,
      total,
      edited,
    });
  }
  return rows.sort((x, y) => x.employee.lastName.localeCompare(y.employee.lastName) || x.employee.firstName.localeCompare(y.employee.firstName));
}
