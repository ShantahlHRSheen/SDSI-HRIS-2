import ExcelJS from "exceljs";
import { cellScalar, normalizeName, toNumber } from "./attendance-import";
import type { ParsedPayrollRow, ParsedPayrollWorkbook } from "./payroll-import";
import type { Employee } from "./types";

// ---------------------------------------------------------------------------
// LSMBiz Credit Corp.'s own payroll workbook (e.g. "LSM MAIN PAYROLL_2 28
// 2026_FINAL.xlsx"): one cut-off split over several sheets ("LSM OP",
// "LSM ADM", "CEO"), each with a header row like
//   Employee | Position | … | No. of days | Basic Salary | Late/ Abs. | …
//   | Gross Salary | CA | LSMbiz COOP Loan | CBU-COOP | … | Net Pay - Cash
// and no employee numbers, only "Last, First" names. Each row is turned into
// the same figures the standard payroll import reads (lib/payroll-import.ts),
// so the rest of the import (preview, saving, every module that reads
// payroll) works unchanged. Columns are found by header text, not position.
// ---------------------------------------------------------------------------

type Field =
  | "name"
  | "days"
  | "basic"
  | "late"
  | "adjAllowance"
  | "holiday"
  | "vlsl"
  | "deMinimis"
  | "allowance"
  | "gross"
  | "cashAdvance"
  | "caBalance"
  | "lsmbizLoan"
  | "cbuCoop"
  | "others"
  | "tax"
  | "uniform"
  | "sss"
  | "sssLoan"
  | "hdmf"
  | "hdmfLoan"
  | "philHealth"
  | "shortages"
  | "negativeBalance"
  | "otherIncome"
  | "netCash"
  | "net";

// Header text (lowercased, spaces collapsed) -> field. A sheet may use either
// spelling where two are listed.
const HEADERS: Record<string, Field> = {
  employee: "name",
  "no. of days": "days",
  "basic salary": "basic",
  "late/ abs.": "late",
  "adj. on allowances": "adjAllowance",
  "ot/adj on allowances": "adjAllowance",
  holiday: "holiday",
  "vl/sl": "vlsl",
  // Rice / uniform / laundry / medical columns are per-day rates; this is
  // their total for the period.
  "de minimis benefits for the period": "deMinimis",
  // LSM ADM: the ALLOWANCES sheet's net allowances, paid with the payslip.
  allowance: "allowance",
  "gross salary": "gross",
  ca: "cashAdvance",
  // Unpaid cash advance carried from the last payroll; part of Total Advances.
  "ca balance per prior pay period": "caBalance",
  "lsmbiz coop loan": "lsmbizLoan",
  "lsmbiz loan (10%)": "lsmbizLoan",
  "cbu-coop": "cbuCoop",
  others: "others",
  bir: "tax",
  uniform: "uniform",
  "sss - ee": "sss",
  "sss - ee + mpf": "sss",
  "sss loan + sss calamity loan": "sssLoan",
  "sss loan": "sssLoan",
  hdmf: "hdmf",
  "hdmf loan": "hdmfLoan",
  "phic - ee": "philHealth",
  shortages: "shortages",
  "negative balance": "negativeBalance",
  "other income": "otherIncome",
  "net pay - cash": "netCash",
  // LSM ADM: Net Pay - Cash plus ALLOWANCE, what the payslip pays.
  net: "net",
};
const REQUIRED: Field[] = ["name", "basic", "gross", "netCash"];

function headerText(cell: ExcelJS.Cell): string {
  const v = cell.value as unknown;
  const text =
    v && typeof v === "object" && "richText" in v
      ? (v as { richText: { text: string }[] }).richText.map((t) => t.text).join("")
      : String(cellScalar(cell.worksheet.getRow(Number(cell.row)), Number(cell.col)) ?? "");
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

// "Payroll, FEBRUARY 16-28, 2026" (row 2) — names the cut-off, so the period
// can be guessed from it.
function sheetCaption(ws: ExcelJS.Worksheet, headerRow: number): string {
  for (let r = 1; r < headerRow; r++) {
    const text = String(cellScalar(ws.getRow(r), 1) ?? "").trim();
    if (/payroll/i.test(text)) return text;
  }
  return "";
}

// Matches the file's "Last, First" (or "Last First", sometimes with Sr./Jr.)
// to an employee, by name only — the file has no employee numbers. A married
// employee may still be on the payroll under her maiden name, which is her
// middle name in the 201 file ("Santiago, Noemi" = Noemi Santiago Berber);
// that is tried only when the surname finds no one.
function nameMatcher(employees: Employee[]) {
  const strip = (s: string) => normalizeName(s).replace(/\b(sr|jr|ii|iii|iv)\b/g, "").replace(/\s+/g, " ").trim();
  const byKey = new Map<string, Employee[]>();
  const byMaidenKey = new Map<string, Employee[]>();
  const add = (map: Map<string, Employee[]>, key: string, e: Employee) => {
    const list = map.get(key) ?? [];
    if (!list.includes(e)) map.set(key, [...list, e]);
  };
  for (const e of employees) {
    for (const first of [e.firstName, e.firstName.split(" ")[0]]) {
      add(byKey, strip(`${e.lastName}, ${first}`), e);
      if (e.middleName) add(byMaidenKey, strip(`${e.middleName}, ${first}`), e);
    }
  }
  const pick = (list: Employee[] | undefined) => {
    if (!list?.length) return undefined;
    if (list.length === 1) return list[0];
    const active = list.filter((e) => e.status === "active");
    return active.length === 1 ? active[0] : undefined;
  };
  const find = (map: Map<string, Employee[]>, raw: string): Employee | undefined => {
    if (raw.includes(",")) return pick(map.get(strip(raw)));
    // No comma: "Gantalao Raymund" is last name first.
    const words = raw.trim().split(/\s+/);
    for (let i = 1; i < words.length; i++) {
      const hit = pick(map.get(strip(`${words.slice(0, i).join(" ")}, ${words.slice(i).join(" ")}`)));
      if (hit) return hit;
    }
    return pick(map.get(strip(raw)));
  };
  return (raw: string) => find(byKey, raw) ?? find(byMaidenKey, raw);
}

interface LsmbizSheet {
  name: string;
  caption: string;
  rows: ParsedPayrollRow[];
}

function readSheet(ws: ExcelJS.Worksheet, findEmployee: (raw: string) => Employee | undefined): LsmbizSheet | null {
  let headerRow: number | null = null;
  const cols: Partial<Record<Field, number>> = {};
  for (let r = 1; r <= Math.min(10, ws.rowCount) && headerRow === null; r++) {
    const found: Partial<Record<Field, number>> = {};
    ws.getRow(r).eachCell((cell, col) => {
      const field = HEADERS[headerText(cell)];
      if (field && found[field] === undefined) found[field] = col;
    });
    if (REQUIRED.every((f) => found[f] !== undefined)) {
      headerRow = r;
      Object.assign(cols, found);
    }
  }
  if (headerRow === null) return null;

  const rows: ParsedPayrollRow[] = [];
  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const rawName = String(cellScalar(row, cols.name!) ?? "").trim();
    // The employee list ends at the totals row (no name, or "TOTALS").
    if (!rawName) {
      if (rows.length) break;
      continue;
    }
    if (/^totals?$/i.test(rawName)) break;
    const n = (f: Field) => (cols[f] === undefined ? 0 : toNumber(cellScalar(row, cols[f]!)));
    // Other Income is a rounding figure the sheet subtracts from net pay
    // (negative = added). Negative Balance covers a shortfall when deductions
    // exceed earnings, so it's added back.
    const otherIncome = n("otherIncome");
    const allowances = n("deMinimis") + n("allowance");
    const grossSalary = n("basic") - n("late") + n("adjAllowance") + n("holiday") + n("vlsl") + allowances;
    const employee = findEmployee(rawName);
    rows.push({
      rowNumber: r,
      employeeNumber: employee?.employeeNumber ?? "",
      rawName,
      values: {
        daysWorking: n("days"),
        workedHoliday: 0,
        vl: 0,
        sl: 0,
        basicPay: n("basic"),
        lateDeduction: n("late"),
        undertimeDeduction: 0,
        holidayPay: n("holiday"),
        vlPay: n("vlsl"),
        slPay: 0,
        otPay: n("adjAllowance"),
        netAllowances: allowances,
        grossSalary,
        sss: n("sss"),
        sssWisp: 0,
        philHealth: n("philHealth"),
        hdmf: n("hdmf"),
        withholdingTax: n("tax"),
        cashAdvance: n("cashAdvance") + n("caBalance"),
        lsmBizLoan: n("lsmbizLoan"),
        lsmCoopLoan: n("cbuCoop"),
        shortages: n("shortages"),
        sssLoan: n("sssLoan"),
        hdmfLoan: n("hdmfLoan"),
        hdmfMp2: 0,
        adjustmentDeduct: n("others") + n("uniform") + Math.max(otherIncome, 0),
        adjustmentAdd: n("negativeBalance") + Math.max(-otherIncome, 0),
        totalDeduction: 0,
        netPay: cols.net !== undefined && n("net") ? n("net") : n("netCash"),
      },
    });
  }
  return { name: ws.name, caption: sheetCaption(ws, headerRow), rows };
}

// The workbook's payroll sheets as import choices: first the whole cut-off
// (every visible payroll sheet except estimates such as "MAX CA"), then each
// sheet on its own.
export async function parseLsmbizPayrollWorkbook(buffer: ArrayBuffer, employees: Employee[]): Promise<ParsedPayrollWorkbook[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const findEmployee = nameMatcher(employees);

  const sheets = wb.worksheets
    .filter((ws) => ws.state === "visible")
    .map((ws) => readSheet(ws, findEmployee))
    .filter((s): s is LsmbizSheet => s !== null && s.rows.length > 0);
  if (!sheets.length) {
    throw new Error('No LSMBiz payroll sheet found — expected a header row with "Employee", "Basic Salary", "Gross Salary" and "Net Pay - Cash" columns.');
  }

  const label = (s: LsmbizSheet) => (s.caption ? `${s.name} · ${s.caption}` : s.name);
  const choices: ParsedPayrollWorkbook[] = sheets.map((s) => ({ sheetName: label(s), rows: s.rows }));
  const main = sheets.filter((s) => !/\best\b|estimate/i.test(s.caption));
  if (main.length > 1) {
    const caption = main.find((s) => s.caption)?.caption ?? "";
    choices.unshift({
      sheetName: `${main.map((s) => s.name).join(" + ")}${caption ? ` · ${caption}` : ""}`,
      rows: main.flatMap((s) => s.rows),
    });
  }
  return choices;
}
