import ExcelJS from "exceljs";
import type { Employee } from "./types";

// ---------------------------------------------------------------------------
// Parses the company's per-payroll-period attendance-tracker export (its
// "...Summary" sheet) into rows keyed by employee name, then reconciles
// those rows against the system's employee roster. Column lookup is done by
// header text (not position) since the source template has at least one
// known broken column (its own "Position" column resolves to a schedule
// time via a bad formula) — we simply never read columns we don't need.
// ---------------------------------------------------------------------------

export interface ParsedAttendanceRow {
  fileEmpId: string;
  rawName: string;
  branch: string;
  department: string;
  daysWorked: number;
  holidayDays: number;
  slDays: number;
  vlDays: number;
  lateAdjMinutes: number;
  undertimeMinutes: number;
  notes: string;
}

export interface ParsedAttendanceWorkbook {
  sheetName: string;
  periodStart: string | null;
  periodEnd: string | null;
  rows: ParsedAttendanceRow[];
}

const REQUIRED_COLUMNS = ["emp id", "employee name", "branch", "department", "days worked", "holiday days", "sl days", "vl days", "late adj mins"];

function toDateStr(v: unknown): string | null {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  return null;
}

function toNumber(v: unknown): number {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

// A formula cell's .value is the {formula, result} object itself, not a
// primitive — only .result holds the cached scalar, and it can legitimately
// be undefined (uncached) for formulas the source spreadsheet never
// recalculated, which we treat as blank rather than falling back to the
// formula object (which would otherwise stringify to "[object Object]").
function cellScalar(row: ExcelJS.Row, col: number): string | number | null {
  const cell = row.getCell(col);
  const raw = cell.formula !== undefined || cell.type === 6 ? cell.result : cell.value;
  if (raw === undefined || raw === null) return null;
  if (typeof raw === "string" || typeof raw === "number") return raw;
  if (raw instanceof Date) return raw.toISOString().slice(0, 10);
  return null;
}

function cellText(row: ExcelJS.Row, col: number): string {
  const v = cellScalar(row, col);
  return v === null ? "" : String(v).trim();
}

function cellNumber(row: ExcelJS.Row, col: number): number {
  return toNumber(cellScalar(row, col));
}

export async function parseAttendanceWorkbook(buffer: ArrayBuffer): Promise<ParsedAttendanceWorkbook> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);

  const sheetName = wb.worksheets.map((ws) => ws.name).filter((n) => /summary/i.test(n)).pop();
  if (!sheetName) throw new Error('No sheet with "Summary" in its name was found in this workbook.');
  const ws = wb.getWorksheet(sheetName)!;

  let periodStart: string | null = null;
  let periodEnd: string | null = null;
  let headerRowNum: number | null = null;
  const headerMap: Record<string, number> = {};

  ws.eachRow((row, rowNumber) => {
    const c1 = cellText(row, 1).toLowerCase();
    if (c1 === "period start") {
      periodStart = toDateStr(row.getCell(2).value);
      periodEnd = toDateStr(row.getCell(5).value);
    }
    if (c1 === "emp id" && headerRowNum === null) {
      headerRowNum = rowNumber;
      row.eachCell((cell, colNumber) => {
        const label = String(cell.value ?? "").trim().toLowerCase();
        if (label) headerMap[label] = colNumber;
      });
    }
  });

  if (headerRowNum === null) throw new Error('Could not find the header row (looking for an "Emp ID" column) in the summary sheet.');
  const missing = REQUIRED_COLUMNS.filter((k) => !(k in headerMap));
  if (missing.length) throw new Error(`The summary sheet is missing expected column(s): ${missing.join(", ")}.`);

  const rows: ParsedAttendanceRow[] = [];
  const headerRow = headerRowNum;
  // The template's Emp ID / Employee Name columns are lookup formulas bounded
  // to a fixed range far larger than the real roster (e.g. up to row 505), so
  // rows past the real data are expected to read as blank. Some Google
  // Sheets exports carry stale cached formula results for that unused tail,
  // so we stop at the first genuinely blank row rather than scanning all of
  // it — a blank Employee Name is the template's own "end of roster" signal.
  let reachedEnd = false;
  ws.eachRow((row, rowNumber) => {
    if (rowNumber <= headerRow || reachedEnd) return;
    const fileEmpId = cellText(row, headerMap["emp id"]);
    const rawName = cellText(row, headerMap["employee name"]);
    if (!fileEmpId || !rawName) {
      reachedEnd = true;
      return;
    }
    rows.push({
      fileEmpId,
      rawName,
      branch: cellText(row, headerMap["branch"]),
      department: cellText(row, headerMap["department"]),
      daysWorked: cellNumber(row, headerMap["days worked"]),
      holidayDays: cellNumber(row, headerMap["holiday days"]),
      slDays: cellNumber(row, headerMap["sl days"]),
      vlDays: cellNumber(row, headerMap["vl days"]),
      lateAdjMinutes: cellNumber(row, headerMap["late adj mins"]),
      // "Undertime Raw Mins" is read like "notes" — optional, defaulting to 0
      // rather than failing the whole import — so older tracker exports that
      // predate this column still import cleanly.
      undertimeMinutes: headerMap["undertime raw mins"] ? cellNumber(row, headerMap["undertime raw mins"]) : 0,
      notes: headerMap["notes"] ? cellText(row, headerMap["notes"]) : "",
    });
  });

  return { sheetName, periodStart, periodEnd, rows };
}

// --- Reconciliation against the system roster -------------------------------

export function normalizeName(name: string): string {
  let n = name.trim().toLowerCase().replace(/\s+/g, " ").replace(/\./g, "");
  if (n.includes(",")) {
    const [last, first] = n.split(",").map((s) => s.trim());
    n = `${first} ${last}`;
  }
  return n;
}

export interface AttendanceImportMatch {
  parsed: ParsedAttendanceRow;
  employee: Employee;
  isLateOutlier: boolean;
}

export interface AttendanceImportPreview {
  sheetName: string;
  periodStart: string | null;
  periodEnd: string | null;
  matched: AttendanceImportMatch[];
  unmatched: ParsedAttendanceRow[];
  missingFromFile: Employee[];
}

// Flags a row whose late-minutes total averages implausibly high per day
// worked (the source template has a known bug where a broken formula can
// cap out at its maximum per-day value for many days in a row) — surfaced
// as a warning rather than silently trusted or silently dropped.
const LATE_OUTLIER_AVG_MIN_PER_DAY = 60;

// Deliberately built from firstName/lastName directly rather than the
// display-formatted fullName() helper (which renders "Surname - Name - M.I."
// for the UI) — this matches the "First Last" order used in the company's
// uploaded attendance-tracker export.
function importMatchName(e: Employee): string {
  return `${e.firstName} ${e.lastName}`;
}

export function buildAttendanceImportPreview(parsed: ParsedAttendanceWorkbook, employees: Employee[]): AttendanceImportPreview {
  const byNorm = new Map(employees.map((e) => [normalizeName(importMatchName(e)), e]));
  const matched: AttendanceImportMatch[] = [];
  const unmatched: ParsedAttendanceRow[] = [];

  parsed.rows.forEach((row) => {
    const employee = byNorm.get(normalizeName(row.rawName));
    if (!employee) {
      unmatched.push(row);
      return;
    }
    const isLateOutlier = row.daysWorked > 0 && row.lateAdjMinutes / row.daysWorked > LATE_OUTLIER_AVG_MIN_PER_DAY;
    matched.push({ parsed: row, employee, isLateOutlier });
  });

  const matchedIds = new Set(matched.map((m) => m.employee.id));
  const missingFromFile = employees.filter((e) => (e.status === "active" || e.status === "on_leave") && !matchedIds.has(e.id));

  return { sheetName: parsed.sheetName, periodStart: parsed.periodStart, periodEnd: parsed.periodEnd, matched, unmatched, missingFromFile };
}
