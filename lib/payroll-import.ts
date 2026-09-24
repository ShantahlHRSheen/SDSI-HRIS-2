import ExcelJS from "exceljs";
import { cellScalar, normalizeName, toNumber } from "./attendance-import";
import { computePayrollForPeriod } from "./payroll";
import type { AttendancePeriodRecord, Employee, PayrollLineOverride, PayrollPeriod } from "./types";

// ---------------------------------------------------------------------------
// Imports a finished payroll register (one row per employee, same columns as
// Payroll Processing's own "Export CSV" plus an employee-number column) into
// a payroll period. Every money figure in the file is stored as that
// employee's PayrollLineOverride for the period, so the register shows the
// file's numbers exactly and each one stays editable afterwards. Day counts
// go into the period's AttendancePeriodRecord (payroll only lists employees
// that have one). Columns are looked up by header text, not position.
// ---------------------------------------------------------------------------

type OverrideFields = Omit<PayrollLineOverride, "id" | "periodId" | "employeeId" | "updatedBy" | "updatedAt">;
export type AttendanceFields = Omit<AttendancePeriodRecord, "id" | "periodId" | "source" | "updatedBy" | "updatedAt">;

// Header text (lowercased) -> field. "Employee" holds the employee number;
// the name sits in the unlabeled column right after it.
const COLUMNS = {
  employee: "employee",
  payrollType: "payroll type",
  daysWorking: "days working",
  workedHoliday: "worked holiday",
  vl: "number of vl",
  sl: "number of sl",
  basicPay: "basic pay",
  lateDeduction: "late deduction",
  undertimeDeduction: "undertime deduction",
  holidayPay: "holiday pay",
  vlPay: "vl pay",
  slPay: "sl pay",
  otPay: "ot pay",
  netAllowances: "net allowances",
  grossSalary: "gross salary",
  sss: "sss contribution",
  sssWisp: "sss wisp",
  philHealth: "philhealth contribution",
  hdmf: "pag-ibig contribution",
  withholdingTax: "withholding tax",
  cashAdvance: "cash advance",
  lsmBizLoan: "lsm biz loan",
  lsmCoopLoan: "lsm coop loan",
  shortages: "shortage deduction",
  sssLoan: "sss loan",
  hdmfLoan: "pag-ibig loan",
  hdmfMp2: "pag-ibig mp2 savings",
  totalDeduction: "total deduction",
  netPay: "net pay",
} as const;
type ColumnKey = keyof typeof COLUMNS;
const REQUIRED: ColumnKey[] = ["employee", "basicPay", "grossSalary", "netPay"];

export interface ParsedPayrollRow {
  rowNumber: number;
  employeeNumber: string;
  rawName: string;
  values: Record<Exclude<ColumnKey, "employee" | "payrollType">, number>;
}

export interface ParsedPayrollWorkbook {
  sheetName: string;
  rows: ParsedPayrollRow[];
}

export async function parsePayrollWorkbook(buffer: ArrayBuffer): Promise<ParsedPayrollWorkbook> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);

  for (const ws of wb.worksheets) {
    let headerRow: number | null = null;
    const cols: Partial<Record<ColumnKey, number>> = {};
    ws.eachRow((row, rowNumber) => {
      if (headerRow !== null || rowNumber > 10) return;
      const found: Partial<Record<ColumnKey, number>> = {};
      row.eachCell((cell, col) => {
        const label = String(cell.value ?? "").trim().toLowerCase();
        const key = (Object.keys(COLUMNS) as ColumnKey[]).find((k) => COLUMNS[k] === label);
        if (key && found[key] === undefined) found[key] = col;
      });
      if (REQUIRED.every((k) => found[k] !== undefined)) {
        headerRow = rowNumber;
        Object.assign(cols, found);
      }
    });
    if (headerRow === null) continue;

    const rows: ParsedPayrollRow[] = [];
    for (let r = headerRow + 1; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const employeeNumber = String(cellScalar(row, cols.employee!) ?? "").trim();
      if (!employeeNumber) continue;
      const num = (k: ColumnKey) => (cols[k] === undefined ? 0 : toNumber(cellScalar(row, cols[k]!)));
      const values = {} as ParsedPayrollRow["values"];
      for (const k of Object.keys(COLUMNS) as ColumnKey[]) {
        if (k !== "employee" && k !== "payrollType") values[k] = num(k);
      }
      rows.push({ rowNumber: r, employeeNumber, rawName: String(cellScalar(row, cols.employee! + 1) ?? "").trim(), values });
    }
    return { sheetName: ws.name, rows };
  }
  throw new Error('No payroll sheet found — expected a header row with "Employee", "Basic Pay", "Gross Salary" and "Net Pay" columns.');
}

// --- Reconciliation ----------------------------------------------------------

export interface PayrollImportMatch {
  parsed: ParsedPayrollRow;
  employee: Employee;
  matchedByName: boolean;
  attendance: AttendanceFields;
  override: OverrideFields;
  // What Payroll Processing will show for this employee once imported —
  // compared against the file's own Net Pay to catch anything lost in
  // translation.
  computedNetPay: number;
}

export interface PayrollImportPreview {
  sheetName: string;
  matched: PayrollImportMatch[];
  unmatched: ParsedPayrollRow[];
  duplicates: ParsedPayrollRow[];
  // Rows whose own figures don't add up (earnings ≠ Gross Salary,
  // deductions ≠ Total Deduction, or Gross − Deduction ≠ Net Pay) — usually
  // a formula the spreadsheet never recalculated.
  inconsistent: { parsed: ParsedPayrollRow; reason: string }[];
  // Imported, but the app's recomputed net pay differs from the file's.
  netMismatches: PayrollImportMatch[];
  replacing: number;
  missingFromFile: Employee[];
  totals: { gross: number; deductions: number; net: number };
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const close = (a: number, b: number) => Math.abs(a - b) < 0.05;

function checkRow(v: ParsedPayrollRow["values"]): string | null {
  const earnings = v.basicPay - v.lateDeduction - v.undertimeDeduction + v.holidayPay + v.vlPay + v.slPay + v.otPay + v.netAllowances;
  const deductions =
    v.sss + v.sssWisp + v.philHealth + v.hdmf + v.withholdingTax + v.cashAdvance + v.lsmBizLoan + v.lsmCoopLoan + v.shortages + v.sssLoan + v.hdmfLoan + v.hdmfMp2;
  if (!close(earnings, v.grossSalary)) return `earnings add up to ${round2(earnings)}, but Gross Salary says ${v.grossSalary}`;
  if (v.totalDeduction && !close(deductions, v.totalDeduction)) return `deductions add up to ${round2(deductions)}, but Total Deduction says ${v.totalDeduction}`;
  if (!close(v.grossSalary - deductions, v.netPay)) return `Gross Salary − deductions is ${round2(v.grossSalary - deductions)}, but Net Pay says ${v.netPay}`;
  return null;
}

export function buildPayrollImportPreview(
  parsed: ParsedPayrollWorkbook,
  employees: Employee[],
  period: PayrollPeriod,
  existingAttendance: AttendancePeriodRecord[],
  existingOverrides: PayrollLineOverride[],
): PayrollImportPreview {
  const byNumber = new Map(employees.map((e) => [e.employeeNumber.toUpperCase(), e]));
  // Name fallback for rows with a missing/typo'd employee number. Names
  // shared by more than one record (e.g. rehires) prefer the active one and
  // are otherwise left unmatched rather than guessed.
  const byName = new Map<string, Employee[]>();
  for (const e of employees) {
    const key = normalizeName(`${e.lastName}, ${e.firstName}`);
    byName.set(key, [...(byName.get(key) ?? []), e]);
  }
  function findByName(rawName: string): Employee | undefined {
    const candidates = byName.get(normalizeName(rawName)) ?? [];
    if (candidates.length === 1) return candidates[0];
    const active = candidates.filter((e) => e.status === "active");
    return active.length === 1 ? active[0] : undefined;
  }

  const attendanceByEmp = new Map(existingAttendance.filter((r) => r.periodId === period.id).map((r) => [r.employeeId, r]));
  const overrideEmpIds = new Set(existingOverrides.filter((o) => o.periodId === period.id).map((o) => o.employeeId));

  const matched: PayrollImportMatch[] = [];
  const unmatched: ParsedPayrollRow[] = [];
  const duplicates: ParsedPayrollRow[] = [];
  const inconsistent: PayrollImportPreview["inconsistent"] = [];
  const seen = new Set<string>();

  for (const row of parsed.rows) {
    const byNum = byNumber.get(row.employeeNumber.toUpperCase());
    const employee = byNum ?? findByName(row.rawName);
    if (!employee) {
      unmatched.push(row);
      continue;
    }
    if (seen.has(employee.id)) {
      duplicates.push(row);
      continue;
    }
    seen.add(employee.id);

    const problem = checkRow(row.values);
    if (problem) inconsistent.push({ parsed: row, reason: problem });

    const v = row.values;
    const existing = attendanceByEmp.get(employee.id);
    // Day counts come from the file; minutes and daily late/absence detail
    // (from an attendance-tracker import) are kept for the tardiness reports.
    const kept: Omit<AttendanceFields, "employeeId" | "daysWorked" | "holidayDays" | "vlDays" | "slDays"> = existing
      ? {
          lateMinutes: existing.lateMinutes,
          undertimeMinutes: existing.undertimeMinutes,
          notes: existing.notes,
          lateInstances: existing.lateInstances,
          lateDayDetails: existing.lateDayDetails,
          undertimeInstances: existing.undertimeInstances,
          undertimeDayDetails: existing.undertimeDayDetails,
          halfDayInstances: existing.halfDayInstances,
          halfDayDates: existing.halfDayDates,
          absenceInstances: existing.absenceInstances,
          absentDates: existing.absentDates,
        }
      : { lateMinutes: 0, undertimeMinutes: 0, notes: "" };
    const attendance: AttendanceFields = {
      ...kept,
      employeeId: employee.id,
      daysWorked: v.daysWorking,
      holidayDays: v.workedHoliday,
      vlDays: v.vl,
      slDays: v.sl,
      notes: existing?.notes || `Imported from payroll file (${parsed.sheetName})`,
    };
    const override: OverrideFields = {
      basicPayOverride: v.basicPay,
      latesUndertimeOverride: v.lateDeduction,
      undertimeDeductionOverride: v.undertimeDeduction,
      holidayPayOverride: v.holidayPay,
      vlPayOverride: v.vlPay,
      slPayOverride: v.slPay,
      otHoursOverride: null,
      otPayOverride: v.otPay,
      // The file only carries the allowance total.
      dailyAllowanceOverride: v.netAllowances,
      travelAllowance: 0,
      laundryAllowance: 0,
      medicalCashAllowance: 0,
      supervisorAllowance: 0,
      sssContributionOverride: v.sss,
      sssWispOverride: v.sssWisp,
      philHealthContributionOverride: v.philHealth,
      hdmfContributionOverride: v.hdmf,
      withholdingTaxOverride: v.withholdingTax,
      cashAdvance: v.cashAdvance,
      lsmBizLoan: v.lsmBizLoan,
      lsmCoopLoan: v.lsmCoopLoan,
      shortages: v.shortages,
      sssLoan: v.sssLoan,
      hdmfLoan: v.hdmfLoan,
      hdmfMp2Savings: v.hdmfMp2,
      adjustmentAdd: 0,
      adjustmentDeduct: 0,
    };

    const [line] = computePayrollForPeriod(
      period,
      [employee],
      [{ ...attendance, id: "preview", periodId: period.id, source: "import", updatedBy: "", updatedAt: "" }],
      [],
      [{ ...override, id: "preview", periodId: period.id, employeeId: employee.id, updatedBy: "", updatedAt: "" }],
    );
    matched.push({ parsed: row, employee, matchedByName: !byNum, attendance, override, computedNetPay: line?.netPay ?? 0 });
  }

  const matchedIds = new Set(matched.map((m) => m.employee.id));
  return {
    sheetName: parsed.sheetName,
    matched,
    unmatched,
    duplicates,
    inconsistent,
    netMismatches: matched.filter((m) => !close(m.computedNetPay, m.parsed.values.netPay)),
    replacing: matched.filter((m) => attendanceByEmp.has(m.employee.id) || overrideEmpIds.has(m.employee.id)).length,
    missingFromFile: employees.filter((e) => e.status === "active" && !matchedIds.has(e.id)),
    totals: matched.reduce(
      (t, m) => ({ gross: t.gross + m.parsed.values.grossSalary, deductions: t.deductions + (m.parsed.values.grossSalary - m.parsed.values.netPay), net: t.net + m.parsed.values.netPay }),
      { gross: 0, deductions: 0, net: 0 },
    ),
  };
}

// "April 15" / "Apr 16 Payroll" -> the period starting or ending that day.
export function guessPeriodFromName(name: string, periods: PayrollPeriod[]): PayrollPeriod | undefined {
  name = name.replace(/[_-]+/g, " ");
  const m = /(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})\b/i.exec(name);
  if (!m) return undefined;
  const month = "janfebmaraprmayjunjulaugsepoctnovdec".indexOf(m[1].toLowerCase()) / 3 + 1;
  const mmdd = `-${String(month).padStart(2, "0")}-${String(Number(m[2])).padStart(2, "0")}`;
  const hits = periods.filter((p) => p.end.endsWith(mmdd) || p.start.endsWith(mmdd));
  return hits.sort((a, b) => b.start.localeCompare(a.start))[0];
}
