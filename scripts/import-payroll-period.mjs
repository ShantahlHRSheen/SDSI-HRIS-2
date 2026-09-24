#!/usr/bin/env node
// Imports a finalized historical payroll register (the export format used by
// Payroll Processing's "Export CSV", or the fuller HR Excel variant with
// Worked Holiday / Number of VL / Number of SL / TOTAL DEDUCTION columns
// added) as GeneratedPayslip records for a closed period — for backfilling
// months processed before this system existed, not for regular ongoing use
// (ongoing payroll should flow through Attendance import -> Payroll
// Processing as normal, which recomputes live from attendance).
//
// Matches columns by HEADER TEXT (row 1), not position, so either export
// format works without edits. Any of the underlying figures (Basic Pay,
// SSS Contribution, Net Pay, etc.) can be missing/blank — anything not
// found just renders as 0 on the payslip, same as the live formula does
// for a figure that doesn't apply to that employee.
//
// Run this LOCALLY on your own machine, never in a shared session — it
// needs your project's service-role key, which bypasses Row Level Security
// entirely and must never be committed or shared.
//
// Usage:
//   npm install @supabase/supabase-js exceljs
//   SUPABASE_URL=https://xxxx.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=eyJ... \
//   node scripts/import-payroll-period.mjs path/to/payroll.xlsx \
//     --period-start 2026-04-01 --period-end 2026-04-15 \
//     [--sheet "April 15"] [--generated-by "HR"] [--dry-run]
//
// Safe to re-run for the same period: existing payslips for that period are
// updated in place rather than duplicated.

import { createClient } from "@supabase/supabase-js";
import ExcelJS from "exceljs";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function parseArgs(argv) {
  const [filePath, ...rest] = argv;
  const opts = { filePath, dryRun: false, generatedBy: "Historical Import" };
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === "--dry-run") opts.dryRun = true;
    else if (a === "--period-start") opts.periodStart = rest[++i];
    else if (a === "--period-end") opts.periodEnd = rest[++i];
    else if (a === "--sheet") opts.sheet = rest[++i];
    else if (a === "--generated-by") opts.generatedBy = rest[++i];
  }
  return opts;
}

const opts = parseArgs(process.argv.slice(2));

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables first.");
  process.exit(1);
}
if (!opts.filePath || !opts.periodStart || !opts.periodEnd) {
  console.error(
    "Usage: node scripts/import-payroll-period.mjs path/to/payroll.xlsx --period-start YYYY-MM-DD --period-end YYYY-MM-DD [--sheet NAME] [--generated-by NAME] [--dry-run]",
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Excel header text (lowercased) -> PayrollLine summary field name.
// "Employee"/"Branch"/"Payroll Type" are read separately, not part of this map.
const FIELD_MAP = {
  "rate/day": "ratePerDay",
  "days working": "daysWorking",
  "worked holiday": "holidayDays",
  "number of vl": "vlDays",
  "number of sl": "slDays",
  "basic pay": "basicPay",
  "late deduction": "latesUndertime",
  "undertime deduction": "undertimeDeduction",
  "holiday pay": "holidayPay",
  "vl pay": "vlPay",
  "sl pay": "slPay",
  "ot pay": "otPay",
  "net allowances": "netAllowances",
  "gross salary": "grossSalary",
  "sss contribution": "sssContribution",
  "sss wisp": "sssWisp",
  "philhealth contribution": "philHealthContribution",
  "pag-ibig contribution": "hdmfContribution",
  "withholding tax": "withholdingTax",
  "cash advance": "cashAdvance",
  "lsm biz loan": "lsmBizLoan",
  "lsm coop loan": "lsmCoopLoan",
  "shortage deduction": "shortages",
  "sss loan": "sssLoan",
  "pag-ibig loan": "hdmfLoan",
  "pag-ibig mp2 savings": "hdmfMp2Savings",
  "net pay": "netPay",
};

function toNumber(v) {
  if (v === null || v === undefined || v === "") return 0;
  // ExcelJS returns formula cells as { formula, result, ... } rather than a
  // plain value — this workbook computes several columns (Holiday Pay, VL
  // Pay, TOTAL DEDUCTION, Net Pay) as formulas, not literal numbers.
  if (typeof v === "object" && "result" in v) return toNumber(v.result);
  const n = typeof v === "number" ? v : Number(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

async function main() {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(opts.filePath);
  const ws = opts.sheet ? workbook.getWorksheet(opts.sheet) : workbook.worksheets[0];
  if (!ws) throw new Error(opts.sheet ? `No sheet named "${opts.sheet}" found.` : "Workbook has no sheets.");

  const headerRow = ws.getRow(1);
  const colIndex = {}; // lowercased header text -> column number
  headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const text = String(cell.value ?? "").trim().toLowerCase();
    if (text) colIndex[text] = colNumber;
  });
  const employeeCol = colIndex["employee"];
  if (!employeeCol) throw new Error('No "Employee" column found in the header row.');

  const { data: employees, error: empErr } = await supabase.from("employees").select("id, employee_number");
  if (empErr) throw empErr;
  const employeeIdByNumber = new Map(employees.map((e) => [String(e.employee_number).trim().toUpperCase(), e.id]));

  const rows = [];
  const skipped = [];
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const empNumRaw = row.getCell(employeeCol).value;
    const empNum = empNumRaw ? String(empNumRaw).trim() : "";
    if (!empNum) continue; // blank separator row

    const employeeId = employeeIdByNumber.get(empNum.toUpperCase());
    if (!employeeId) {
      skipped.push(`row ${r}: Employee Number ${empNum} not found in employees table`);
      continue;
    }

    const summary = {};
    for (const [header, field] of Object.entries(FIELD_MAP)) {
      const col = colIndex[header];
      if (col) summary[field] = toNumber(row.getCell(col).value);
    }
    summary.totalMandatories = (summary.sssContribution ?? 0) + (summary.sssWisp ?? 0) + (summary.philHealthContribution ?? 0) + (summary.hdmfContribution ?? 0);
    summary.totalDeductionsOtherThanMandatories =
      (summary.cashAdvance ?? 0) + (summary.lsmBizLoan ?? 0) + (summary.lsmCoopLoan ?? 0) + (summary.shortages ?? 0) +
      (summary.sssLoan ?? 0) + (summary.hdmfLoan ?? 0) + (summary.hdmfMp2Savings ?? 0) + (summary.withholdingTax ?? 0);

    rows.push({ employeeId, employeeNumber: empNum, summary });
  }

  console.log(`Read ${rows.length} employee row(s) for period ${opts.periodStart} – ${opts.periodEnd}, ${skipped.length} skipped.\n`);
  if (skipped.length) {
    console.log("Skipped rows (Employee Number not found — import the employee roster first if these are new hires):");
    for (const s of skipped) console.log(`  ${s}`);
    console.log("");
  }

  if (opts.dryRun) {
    console.log("--dry-run: no changes written. Sample of the first row's parsed summary:");
    console.log(rows[0]);
    console.log("\nRe-run without --dry-run to import.");
    return;
  }

  let { data: period, error: periodErr } = await supabase
    .from("payroll_periods")
    .select("id")
    .eq("period_start", opts.periodStart)
    .eq("period_end", opts.periodEnd)
    .maybeSingle();
  if (periodErr) throw periodErr;

  if (!period) {
    const { data: newPeriod, error: insertErr } = await supabase
      .from("payroll_periods")
      .insert({ period_start: opts.periodStart, period_end: opts.periodEnd, status: "closed" })
      .select("id")
      .single();
    if (insertErr) throw insertErr;
    period = newPeriod;
    console.log(`Created payroll period ${period.id} (${opts.periodStart} – ${opts.periodEnd}).`);
  } else {
    console.log(`Using existing payroll period ${period.id}.`);
  }

  const { data: existing, error: existingErr } = await supabase
    .from("generated_payslips")
    .select("id, employee_id")
    .eq("period_id", period.id);
  if (existingErr) throw existingErr;
  const existingByEmployeeId = new Map(existing.map((e) => [e.employee_id, e.id]));

  let inserted = 0;
  let updated = 0;
  for (const row of rows) {
    const existingId = existingByEmployeeId.get(row.employeeId);
    if (existingId) {
      const { error } = await supabase.from("generated_payslips").update({ summary: row.summary, generated_by: opts.generatedBy }).eq("id", existingId);
      if (error) console.error(`FAILED to update payslip for ${row.employeeNumber}: ${error.message}`);
      else updated++;
    } else {
      const { error } = await supabase
        .from("generated_payslips")
        .insert({ period_id: period.id, employee_id: row.employeeId, summary: row.summary, generated_by: opts.generatedBy });
      if (error) console.error(`FAILED to insert payslip for ${row.employeeNumber}: ${error.message}`);
      else inserted++;
    }
  }

  console.log(`\nDone. Inserted ${inserted}, updated ${updated} payslip(s) for period ${opts.periodStart} – ${opts.periodEnd}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
