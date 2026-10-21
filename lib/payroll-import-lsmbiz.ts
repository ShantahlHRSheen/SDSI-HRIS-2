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
//
// Daro Lending Corp. uses the same workbook, one sheet per branch
// ("BULACAN", "CABANATUAN", "HO-TARLAC"), with a few columns of its own:
// "CBU- COOP" and "LSM COOP Loan" as two deductions, and an "Allowance" paid
// on top of Gross Salary (Net Pay = Net Pay - Cash + Allowance).
// ---------------------------------------------------------------------------

export type PayrollWorkbookFormat = "lsmbiz" | "daro";

type Field =
  | "name"
  | "days"
  | "basic"
  | "late"
  | "adjAllowance"
  | "holiday"
  | "vlsl"
  | "deMinimis"
  | "uniformRate"
  | "laundryRate"
  | "medicalRate"
  | "allowance"
  | "gross"
  | "cashAdvance"
  | "caBalance"
  | "lsmbizLoan"
  | "cbuCoop"
  | "lsmCoopLoan"
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
  lates: "late",
  "adj. on allowances": "adjAllowance",
  "ot/adj on allowances": "adjAllowance",
  "addtl.": "adjAllowance",
  holiday: "holiday",
  "holiday pay": "holiday",
  "vl/sl": "vlsl",
  // Rice / uniform / laundry / medical columns are per-day rates; this is
  // their total for the period.
  "de minimis benefits for the period": "deMinimis",
  "uniform allowance": "uniformRate",
  "laundry allowance": "laundryRate",
  "medical cash allowance": "medicalRate",
  // LSM ADM: the ALLOWANCES sheet's net allowances, paid with the payslip.
  allowance: "allowance",
  "gross salary": "gross",
  ca: "cashAdvance",
  // Unpaid cash advance carried from the last payroll; part of Total Advances.
  "ca balance per prior pay period": "caBalance",
  "lsmbiz coop loan": "lsmbizLoan",
  "lsmbiz loan (10%)": "lsmbizLoan",
  "cbu-coop": "cbuCoop",
  "cbu- coop": "cbuCoop",
  "lsm coop loan": "lsmCoopLoan",
  others: "others",
  bir: "tax",
  uniform: "uniform",
  "uniform/ id lace": "uniform",
  "uniform/ lace": "uniform",
  "sss - ee": "sss",
  "sss - ee + mpf": "sss",
  "sss loan + sss calamity loan": "sssLoan",
  "sss loan": "sssLoan",
  "sss loan + calamity loan": "sssLoan",
  hdmf: "hdmf",
  "hdmf loan": "hdmfLoan",
  "phic - ee": "philHealth",
  shortages: "shortages",
  "negative balance": "negativeBalance",
  "other income": "otherIncome",
  "net pay - cash": "netCash",
  // LSM ADM: Net Pay - Cash plus ALLOWANCE, what the payslip pays.
  net: "net",
  "net pay": "net",
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
// Also used by the Daro DTR import (lib/attendance-import-daro.ts).
export function employeeNameMatcher(employees: Employee[]) {
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
  const sortedWords = (s: string) => s.split(" ").sort().join(" ");
  // Last resort, for a typo in the file ("Gayla, Reymart" for Raymart,
  // "Tejadillano" for Tejadillo): same first name and a surname at most two
  // letters off, or the other way round, or the same names with the first
  // names in another order — only when exactly one employee fits. These
  // are flagged in the import preview for HR to check.
  const similar = (raw: string): Employee | undefined => {
    // "Last, First", or without a comma either order ("Joan Lee Jose").
    const words = raw.replace(/,/g, " , ").trim().split(/\s+/).filter((w) => w !== ",");
    const pairs: [string, string][] = raw.includes(",")
      ? [raw.split(",").map((s) => strip(s)) as [string, string]]
      : words.slice(1).flatMap((_, i) => [
          [strip(words.slice(0, i + 1).join(" ")), strip(words.slice(i + 1).join(" "))] as [string, string],
          [strip(words.slice(i + 1).join(" ")), strip(words.slice(0, i + 1).join(" "))] as [string, string],
        ]);
    const hits = new Set<Employee>();
    for (const [last, first] of pairs) if (last && first) similarTo(last, first).forEach((e) => hits.add(e));
    return pick([...hits]);
  };
  const similarTo = (last: string, first: string): Employee[] =>
    employees.filter((e) => {
      const eLast = strip(e.lastName);
      const eFirsts = [strip(e.firstName), strip(e.firstName.split(" ")[0])];
      const firstSame = eFirsts.includes(first);
      const firstClose = eFirsts.some((f) => editDistance(f, first) <= 2);
      // First names in another order: "Tan, Vincent Carl" = Carl Vincent Tan.
      const firstReordered = sortedWords(strip(e.firstName)) === sortedWords(first);
      return (firstSame && editDistance(eLast, last) <= 2) || (eLast === last && (firstClose || firstReordered));
    });
  return (raw: string): { employee?: Employee; similar: boolean } => {
    const exact = find(byKey, raw) ?? find(byMaidenKey, raw);
    if (exact) return { employee: exact, similar: false };
    const close = similar(raw);
    return { employee: close, similar: !!close };
  };
}

function editDistance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 3;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}

interface LsmbizSheet {
  name: string;
  caption: string;
  rows: ParsedPayrollRow[];
}

function readSheet(ws: ExcelJS.Worksheet, findEmployee: ReturnType<typeof employeeNameMatcher>, format: PayrollWorkbookFormat): LsmbizSheet | null {
  let headerRow: number | null = null;
  const cols: Partial<Record<Field, number>> = {};
  for (let r = 1; r <= Math.min(10, ws.rowCount) && headerRow === null; r++) {
    const found: Partial<Record<Field, number>> = {};
    ws.getRow(r).eachCell((cell, col) => {
      const text = headerText(cell);
      // The uniform deduction's name varies by month ("Uniform/ ID Lace",
      // "Uniform/ Lace", …).
      const field = HEADERS[text] ?? (/^uniform ?\//.test(text) ? "uniform" : undefined);
      if (field && found[field] === undefined) found[field] = col;
    });
    if (REQUIRED.every((f) => found[f] !== undefined)) {
      headerRow = r;
      Object.assign(cols, found);
    }
  }
  if (headerRow === null) return null;

  const rows: ParsedPayrollRow[] = [];
  const hasFigures = (row: ExcelJS.Row) =>
    (Object.keys(cols) as Field[]).some((f) => f !== "name" && toNumber(cellScalar(row, cols[f]!)) !== 0);
  // Whether the next named row below `r` is another employee not yet read
  // (has a Basic Salary and isn't a repeat, such as an estimate table).
  const employeeFollows = (r: number) => {
    for (let k = r + 1; k <= ws.rowCount; k++) {
      const next = ws.getRow(k);
      const name = String(cellScalar(next, cols.name!) ?? "").trim();
      if (!name) continue;
      return toNumber(cellScalar(next, cols.basic!)) !== 0 && !rows.some((x) => x.rawName === name);
    }
    return false;
  };
  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const rawName = String(cellScalar(row, cols.name!) ?? "").trim();
    const n = (f: Field) => (cols[f] === undefined ? 0 : toNumber(cellScalar(row, cols[f]!)));
    // The list ends at the totals row: "TOTALS", or a row with no name but
    // figures — unless more employees follow it (a subtotal between
    // branches). Rows with no name and no figures (gaps between branches)
    // are skipped, as are named rows with no figures.
    if (/^totals?$/i.test(rawName)) break;
    if (!rawName) {
      if (rows.length && hasFigures(row) && !employeeFollows(r)) break;
      continue;
    }
    if (!hasFigures(row)) continue;
    // Other Income is a rounding figure the sheet subtracts from net pay
    // (negative = added). Negative Balance covers a shortfall when deductions
    // exceed earnings, so it's added back.
    const otherIncome = n("otherIncome");
    // Daro pays its "Allowance" on top of Gross Salary, so it's kept out of
    // gross (which then matches the sheet) and added like an adjustment.
    const paidOnTop = format === "daro" ? n("allowance") : 0;
    const allowances = n("deMinimis") + n("allowance") - paidOnTop;
    const grossSalary = n("basic") - n("late") + n("adjAllowance") + n("holiday") + n("vlsl") + allowances;
    // LSMBiz: De Minimis split into uniform, laundry and medical cash (each
    // per-day rate × days) and rice (the rest, which stays the daily
    // allowance); ALLOWANCE is its Additional Allowance. LSMBiz has no
    // travel or supervisor allowance, so those slots hold Additional and
    // Uniform (named so in lib/payroll-layout.ts).
    const round2 = (x: number) => Math.round(x * 100) / 100;
    const uniform = round2(n("uniformRate") * n("days"));
    const laundry = round2(n("laundryRate") * n("days"));
    const medicalCash = round2(n("medicalRate") * n("days"));
    const splitDeMinimis = uniform + laundry + medicalCash <= n("deMinimis") + 0.005;
    const { employee, similar } = findEmployee(rawName);
    rows.push({
      rowNumber: r,
      employeeNumber: employee?.employeeNumber ?? "",
      rawName,
      similarName: similar || undefined,
      allowances:
        format === "lsmbiz"
          ? splitDeMinimis
            ? { travel: n("allowance"), laundry, medicalCash, supervisor: uniform }
            : { travel: n("allowance"), laundry: 0, medicalCash: 0, supervisor: 0 }
          : undefined,
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
        // Daro: CBU-COOP in the LSM Biz slot, LSM COOP Loan in the LSM Coop
        // slot (lib/payroll-labels.ts names them for Daro).
        lsmBizLoan: format === "daro" ? n("cbuCoop") : n("lsmbizLoan"),
        lsmCoopLoan: format === "daro" ? n("lsmCoopLoan") : n("cbuCoop") + n("lsmCoopLoan"),
        shortages: n("shortages"),
        sssLoan: n("sssLoan"),
        hdmfLoan: n("hdmfLoan"),
        hdmfMp2: 0,
        adjustmentDeduct: n("others") + n("uniform") + Math.max(otherIncome, 0),
        adjustmentAdd: n("negativeBalance") + Math.max(-otherIncome, 0) + paidOnTop,
        totalDeduction: 0,
        netPay: cols.net !== undefined && n("net") ? n("net") : n("netCash"),
      },
    });
  }
  return { name: ws.name, caption: sheetCaption(ws, headerRow), rows };
}

// The cut-off a sheet's caption names ("Payroll, JANUARY 16-31, 2026" ->
// "january 16"), so sheets of different cut-offs aren't merged; "" if none.
function captionCutOff(caption: string): string {
  const m = /(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})\b/i.exec(caption.replace(/[_-]+/g, " "));
  return m ? `${m[1].toLowerCase()} ${Number(m[2])}` : "";
}

// The workbook's payroll sheets as import choices: first the whole cut-off
// (every visible payroll sheet except estimates such as "MAX CA"), then each
// sheet on its own. A workbook holding several cut-offs (LSMBiz's January
// file: one sheet per cut-off) gets a combined choice only for sheets that
// share a cut-off.
export async function parseLsmbizPayrollWorkbook(buffer: ArrayBuffer, employees: Employee[], format: PayrollWorkbookFormat = "lsmbiz"): Promise<ParsedPayrollWorkbook[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const findEmployee = employeeNameMatcher(employees);

  const sheets = wb.worksheets
    .filter((ws) => ws.state === "visible")
    .map((ws) => readSheet(ws, findEmployee, format))
    .filter((s): s is LsmbizSheet => s !== null && s.rows.length > 0);
  if (!sheets.length) {
    throw new Error('No payroll sheet found — expected a header row with "Employee", "Basic Salary", "Gross Salary" and "Net Pay - Cash" columns.');
  }

  const label = (s: LsmbizSheet) => (s.caption ? `${s.name} · ${s.caption}` : s.name);
  const choices: ParsedPayrollWorkbook[] = sheets.map((s) => ({ sheetName: label(s), rows: s.rows }));
  const main = sheets.filter((s) => !/\best\b|estimate/i.test(s.caption));
  // A sheet without a caption is placed by its own name ("FEBRUARY 16 - 28").
  const cutOff = (s: LsmbizSheet) => captionCutOff(s.caption) || captionCutOff(s.name);
  const cutOffs = [...new Set(main.map(cutOff).filter(Boolean))];
  const groups = cutOffs.length > 1 ? cutOffs.map((c) => main.filter((s) => cutOff(s) === c)) : [main];
  for (const group of groups.reverse()) {
    if (group.length < 2) continue;
    const caption = group.find((s) => s.caption)?.caption ?? "";
    choices.unshift({
      sheetName: `${group.map((s) => s.name).join(" + ")}${caption ? ` · ${caption}` : ""}`,
      rows: group.flatMap((s) => s.rows),
    });
  }
  return choices;
}
