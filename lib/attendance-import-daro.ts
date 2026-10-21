import ExcelJS from "exceljs";
import type { AttendanceImportPreview, ParsedAttendanceRow } from "./attendance-import";
import { employeeNameMatcher } from "./payroll-import-lsmbiz";
import type { Employee, PayrollPeriod } from "./types";

// ---------------------------------------------------------------------------
// Daro Lending Corp.'s monthly DTR workbook (e.g. "OCTOBER-DTR-DARO_2026"):
// one sheet per branch (CABANATUAN, BULACAN, TARLAC-HO). Row 2 has each
// employee's name over four columns — IN | OUT | IN | OUT — and below a
// "DATE" header row comes one row per calendar day (the sheet repeats the
// layout further down for the next months). A day's cells hold times, or a
// code: Abs (absent), VL, SL, HD (half day), SP (suspended); a place name
// ("tarlac", "manila") means working elsewhere that day.
//
// Daro's rule: the first IN must be on or before 8:00 AM, and the minutes
// after 8:00 are late. Going out to the field (before 9 AM) and coming back
// (before 5 PM) are the schedule, and leaving early isn't undertime.
//
// The file covers a month; the HRIS keeps attendance per payroll period, so
// the days are read first and then totalled for whichever period is chosen.
// ---------------------------------------------------------------------------

export type DtrDayStatus = "present" | "absent" | "vl" | "sl" | "halfday" | "suspended";

export interface DtrDay {
  date: string;
  status: DtrDayStatus;
  lateMinutes: number;
}

export interface DtrPerson {
  rawName: string;
  branch: string;
  days: DtrDay[];
}

const SHIFT_START_MINUTES = 8 * 60;
const CODES: Record<string, DtrDayStatus> = { abs: "absent", vl: "vl", sl: "sl", hd: "halfday", sp: "suspended" };

function cellValue(cell: ExcelJS.Cell): unknown {
  const v = cell.value as unknown;
  if (v && typeof v === "object" && !(v instanceof Date)) {
    if ("richText" in v) return (v as { richText: { text: string }[] }).richText.map((t) => t.text).join("");
    if ("result" in v) return (v as { result: unknown }).result;
    if ("text" in v) return (v as { text: unknown }).text;
    return null;
  }
  return v;
}

function cellString(cell: ExcelJS.Cell): string {
  const v = cellValue(cell);
  return v === null || v === undefined ? "" : String(v).replace(/\s+/g, " ").trim();
}

// Minutes after midnight for a time cell (Excel stores times as dates on
// 1899-12-30, read here in UTC) or a typed time like "7:45 AM" / "15:16 PM".
function timeMinutes(v: unknown): number | null {
  if (v instanceof Date) return v.getUTCHours() * 60 + v.getUTCMinutes();
  if (typeof v === "number" && v >= 0 && v < 1) return Math.round(v * 24 * 60);
  if (typeof v === "string") {
    const m = /^(\d{1,2}):(\d{2})\s*(am|pm)?$/i.exec(v.trim());
    if (!m) return null;
    let h = Number(m[1]);
    if (m[3]?.toLowerCase() === "pm" && h < 12) h += 12;
    if (m[3]?.toLowerCase() === "am" && h === 12) h = 0;
    return h * 60 + Number(m[2]);
  }
  return null;
}

function dateKey(v: unknown): string | null {
  return v instanceof Date && v.getUTCFullYear() > 1900 ? v.toISOString().slice(0, 10) : null;
}

function readDay(cells: unknown[], date: string): DtrDay | null {
  const filled = cells.filter((c) => c !== null && c !== undefined && String(c).trim() !== "");
  if (!filled.length) return null; // rest day, or nothing recorded
  for (const c of filled) {
    const code = typeof c === "string" ? CODES[c.trim().toLowerCase()] : undefined;
    if (code) return { date, status: code, lateMinutes: 0 };
  }
  const firstIn = timeMinutes(cells[0]);
  return { date, status: "present", lateMinutes: firstIn !== null && firstIn > SHIFT_START_MINUTES ? firstIn - SHIFT_START_MINUTES : 0 };
}

function readSheet(ws: ExcelJS.Worksheet): DtrPerson[] {
  let headerRow = 0;
  for (let r = 1; r <= Math.min(10, ws.rowCount); r++) {
    if (cellString(ws.getRow(r).getCell(1)).toUpperCase() === "DATE") {
      headerRow = r;
      break;
    }
  }
  if (!headerRow) return [];
  // The names sit two rows above "DATE", one per four-column block.
  const nameRow = ws.getRow(Math.max(1, headerRow - 2));
  const people: { person: DtrPerson; col: number }[] = [];
  for (let col = 2; col <= ws.columnCount; col += 4) {
    const rawName = cellString(nameRow.getCell(col));
    if (rawName) people.push({ person: { rawName, branch: ws.name.trim(), days: [] }, col });
  }
  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const date = dateKey(cellValue(row.getCell(1)));
    if (!date) continue; // totals rows between the months
    for (const { person, col } of people) {
      const day = readDay([0, 1, 2, 3].map((i) => cellValue(row.getCell(col + i))), date);
      if (day) person.days.push(day);
    }
  }
  return people.map((p) => p.person);
}

export async function parseDaroDtrWorkbook(buffer: ArrayBuffer): Promise<DtrPerson[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const people = wb.worksheets.filter((ws) => ws.state === "visible").flatMap(readSheet);
  if (!people.length) throw new Error('No DTR sheet found — expected a "DATE" column with each employee\'s IN / OUT / IN / OUT columns beside it.');
  return people;
}

// The period to import by default: the latest one the file fully covers
// (a DTR is often filled in a few days into the next cut-off), else the one
// holding its latest entry.
export function latestDtrPeriod(people: DtrPerson[], periods: PayrollPeriod[]): PayrollPeriod | undefined {
  const latest = people.flatMap((p) => p.days.filter((d) => d.status === "present").map((d) => d.date)).sort().pop();
  if (!latest) return undefined;
  const covered = periods.filter((p) => p.end <= latest && people.some((x) => x.days.some((d) => p.start <= d.date && d.date <= p.end)));
  return covered.sort((a, b) => b.end.localeCompare(a.end))[0] ?? periods.find((p) => p.start <= latest && latest <= p.end);
}

function summarize(person: DtrPerson, period: PayrollPeriod): ParsedAttendanceRow {
  const days = person.days.filter((d) => period.start <= d.date && d.date <= period.end);
  const of = (s: DtrDayStatus) => days.filter((d) => d.status === s);
  const late = of("present").filter((d) => d.lateMinutes > 0);
  const suspended = of("suspended").map((d) => d.date);
  return {
    fileEmpId: "",
    rawName: person.rawName,
    branch: person.branch,
    department: "",
    daysWorked: of("present").length + of("halfday").length / 2,
    holidayDays: 0,
    slDays: of("sl").length,
    vlDays: of("vl").length,
    lateMinutes: late.reduce((sum, d) => sum + d.lateMinutes, 0),
    undertimeMinutes: 0,
    notes: suspended.length ? `Suspended: ${suspended.join(", ")}` : "",
    lateInstances: late.length,
    lateDayDetails: late.map((d) => ({ date: d.date, lateRawMinutes: d.lateMinutes })),
    undertimeInstances: 0,
    undertimeDayDetails: [],
    halfDayInstances: of("halfday").length,
    halfDayDates: of("halfday").map((d) => d.date),
    absenceInstances: of("absent").length + suspended.length,
    absentDates: [...of("absent").map((d) => d.date), ...suspended].sort(),
  };
}

// The same preview the attendance-tracker import gives, for one payroll
// period. Names are matched like in the payroll import (either order,
// Jr./II, a slightly different spelling — flagged). A name listed twice is
// read once (the copy with entries); blocks with nothing in the period are
// left out.
export function buildDaroDtrPreview(people: DtrPerson[], employees: Employee[], period: PayrollPeriod): AttendanceImportPreview {
  const find = employeeNameMatcher(employees);
  const matched: AttendanceImportPreview["matched"] = [];
  const unmatched: ParsedAttendanceRow[] = [];
  const seen = new Set<string>();
  for (const person of people) {
    const row = summarize(person, period);
    const hasEntries = row.daysWorked + row.slDays + row.vlDays + row.absenceInstances > 0;
    if (!hasEntries) continue;
    const { employee, similar } = find(person.rawName);
    if (!employee) {
      unmatched.push(row);
      continue;
    }
    if (seen.has(employee.id)) continue;
    seen.add(employee.id);
    matched.push({ parsed: row, employee, isLateOutlier: false, similarName: similar || undefined });
  }
  const matchedIds = new Set(matched.map((m) => m.employee.id));
  return {
    sheetName: [...new Set(people.map((p) => p.branch))].join(" + "),
    periodStart: period.start,
    periodEnd: period.end,
    matched,
    unmatched,
    missingFromFile: employees.filter((e) => (e.status === "active" || e.status === "on_leave") && !matchedIds.has(e.id)),
  };
}
