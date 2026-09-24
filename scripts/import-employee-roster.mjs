#!/usr/bin/env node
// Imports the company's employee roster spreadsheet (the "Employees" sheet
// of the template built for HR — see /tmp .../roster-template/build.py in
// past sessions, or ask Claude to regenerate it) into the live employees
// table. Run this LOCALLY on your own machine, never in a shared session —
// it needs your project's service-role key, which bypasses Row Level
// Security entirely and must never be committed or shared.
//
// Usage:
//   npm install @supabase/supabase-js exceljs   (if not already installed)
//   SUPABASE_URL=https://xxxx.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=eyJ... \
//   node scripts/import-employee-roster.mjs path/to/roster.xlsx [--dry-run]
//
// (Find both env values in the Supabase dashboard: Project Settings > API —
// service_role is the "secret" key, not the anon/publishable one.)
//
// Run migrate_phase11_optional_employee_fields.sql against your database
// BEFORE running this script — it adds the nullable columns and the
// "Unassigned" branch/department/position this script falls back to for
// rows missing that information.
//
// Safe to re-run: rows are upserted by Employee Number, so filling in more
// fields in the spreadsheet and re-running just updates the existing rows.
// Rows missing Employee Number, First/Last Name, Gender, or Status are
// skipped (the database can't accept those — everything else is imported
// with whatever's on file, blanks and all, exactly like the roster
// spreadsheet). A summary of what happened is written to
// roster-import-report.txt (gitignored) alongside a console log.

import { createClient } from "@supabase/supabase-js";
import ExcelJS from "exceljs";
import { writeFileSync } from "node:fs";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const [, , filePath, ...flags] = process.argv;
const DRY_RUN = flags.includes("--dry-run");

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables first.");
  process.exit(1);
}
if (!filePath) {
  console.error("Usage: node scripts/import-employee-roster.mjs path/to/roster.xlsx [--dry-run]");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Column layout of the "Employees" sheet — 1-indexed, data starts row 4.
const COLS = {
  employeeNumber: 1, lastName: 2, firstName: 3, middleName: 4, nickname: 5,
  gender: 6, birthdate: 7, civilStatus: 8, nationality: 9, address: 10,
  contactNumber: 11, email: 12, emergencyContactName: 13, emergencyContactPhone: 14,
  sssNumber: 15, philHealthNumber: 16, hdmfNumber: 17, tin: 18,
  branch: 19, department: 20, position: 21, supervisor: 22, evaluator: 23,
  employmentStatus: 24, dateHired: 25, dateRegularized: 26, contractStart: 27,
  contractEnd: 28, probationEndsAt: 29, payrollType: 30, dailyRate: 31,
  monthlySalary: 32, dailyAllowance: 33, monthlyAllowance: 34, status: 35,
  statusChangedAt: 36, roles: 37,
};

const GENDERS = { MALE: "Male", FEMALE: "Female" };
const CIVIL_STATUSES = { SINGLE: "Single", MARRIED: "Married", WIDOWED: "Widowed", SEPARATED: "Separated" };
const EMPLOYMENT_STATUSES = new Set(["regular", "probationary", "project_based", "freelance", "consultant", "intern"]);
const LIFECYCLE_STATUSES = new Set(["active", "on_leave", "resigned", "terminated"]);
const PAYROLL_TYPES = new Set(["daily", "monthly"]);
const ROLES = new Set(["employee", "dept_head", "hr_admin", "payroll_officer", "sr_accounting_assistant", "treasurer", "cfo", "upper_management", "sys_admin"]);

function str(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

function toDateStr(v) {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = str(v);
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function toNumber(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// Excel silently converts a text phone/ID number like "09171234567" into
// the float 9171234567 — this restores the string form and the leading
// zero a 10-digit result implies.
function toIdString(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") {
    let s = String(Math.round(v));
    if (s.length === 10) s = "0" + s;
    return s;
  }
  return str(v);
}

function normEmpNum(v) {
  const s = str(v);
  if (!s) return null;
  const m = /^\s*EMP-?0*(\d+)(?:-(\d+))?\s*$/i.exec(s);
  if (!m) return s.toUpperCase();
  return `${Number(m[1])}${m[2] ? `-${Number(m[2])}` : ""}`;
}

function parseRoles(v) {
  const s = str(v);
  if (!s) return [];
  return s
    .split(",")
    .map((p) => p.replace(/\s*\(.*\)\s*$/, "").trim())
    .filter((p) => ROLES.has(p));
}

function main_worksheetRows(ws) {
  const rows = [];
  for (let r = 4; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    if (!row.getCell(COLS.employeeNumber).value) continue;
    rows.push(row);
  }
  return rows;
}

async function main() {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const ws = workbook.getWorksheet("Employees");
  if (!ws) throw new Error(`No "Employees" sheet found in ${filePath}`);
  const sheetRows = main_worksheetRows(ws);
  console.log(`Read ${sheetRows.length} row(s) from "${filePath}".\n`);

  const [{ data: branches, error: bErr }, { data: departments, error: dErr }, { data: positions, error: pErr }] = await Promise.all([
    supabase.from("branches").select("id, name"),
    supabase.from("departments").select("id, name"),
    supabase.from("positions").select("id, title, department_id"),
  ]);
  if (bErr) throw bErr;
  if (dErr) throw dErr;
  if (pErr) throw pErr;

  const branchByName = new Map(branches.map((b) => [b.name.toUpperCase(), b.id]));
  const deptByName = new Map(departments.map((d) => [d.name.toUpperCase(), d.id]));
  const posByDeptAndTitle = new Map(positions.map((p) => [`${p.department_id}::${p.title.toUpperCase()}`, p.id]));
  const UNASSIGNED_BRANCH = branchByName.get("UNASSIGNED");
  const UNASSIGNED_DEPT = deptByName.get("UNASSIGNED");
  const UNASSIGNED_POSITION = posByDeptAndTitle.get(`${UNASSIGNED_DEPT}::UNASSIGNED`);
  if (!UNASSIGNED_BRANCH || !UNASSIGNED_DEPT || !UNASSIGNED_POSITION) {
    throw new Error(
      'Could not find the "Unassigned" branch/department/position — run migrate_phase11_optional_employee_fields.sql against this database first.',
    );
  }

  function resolveBranch(name) {
    const s = str(name);
    if (!s) return UNASSIGNED_BRANCH;
    return branchByName.get(s.toUpperCase()) ?? UNASSIGNED_BRANCH;
  }

  function resolveDept(name) {
    const s = str(name);
    if (!s) return UNASSIGNED_DEPT;
    return deptByName.get(s.toUpperCase()) ?? UNASSIGNED_DEPT;
  }

  function resolvePosition(deptId, title) {
    const s = str(title);
    if (!s || deptId === UNASSIGNED_DEPT) return UNASSIGNED_POSITION;
    let titlePart = s;
    for (const sep of [" — ", " - "]) {
      if (s.includes(sep)) {
        const [, maybeTitle] = s.split(sep);
        titlePart = maybeTitle.trim();
        break;
      }
    }
    return posByDeptAndTitle.get(`${deptId}::${titlePart.toUpperCase()}`) ?? UNASSIGNED_POSITION;
  }

  const skipped = [];
  const supervisorRefs = new Map(); // employee_number -> raw supervisor cell
  const evaluatorRefs = new Map(); // employee_number -> raw evaluator cell
  const rowsToUpsert = [];

  for (const row of sheetRows) {
    const cell = (key) => row.getCell(COLS[key]).value;
    const employeeNumber = str(cell("employeeNumber"));
    const firstName = str(cell("firstName"));
    const lastName = str(cell("lastName"));
    const genderRaw = str(cell("gender"));
    const gender = genderRaw ? GENDERS[genderRaw.toUpperCase()] : null;
    const statusRaw = str(cell("status"));
    const status = statusRaw ? statusRaw.toLowerCase() : null;

    if (!employeeNumber || !firstName || !lastName || !gender || !status || !LIFECYCLE_STATUSES.has(status)) {
      skipped.push({
        employeeNumber: employeeNumber ?? "(none)",
        name: `${lastName ?? "?"}, ${firstName ?? "?"}`,
        reason: !employeeNumber
          ? "missing Employee Number"
          : !firstName || !lastName
            ? "missing First/Last Name"
            : !gender
              ? `invalid/missing gender: ${genderRaw ?? "(blank)"}`
              : `invalid/missing status: ${statusRaw ?? "(blank)"}`,
      });
      continue;
    }

    const civilStatusRaw = str(cell("civilStatus"));
    const employmentStatusRaw = str(cell("employmentStatus"))?.toLowerCase() ?? null;
    const payrollTypeRaw = str(cell("payrollType"))?.toLowerCase() ?? null;
    const branchId = resolveBranch(cell("branch"));
    const departmentId = resolveDept(cell("department"));
    const positionId = resolvePosition(departmentId, cell("position"));

    const supervisorRaw = str(cell("supervisor"));
    const evaluatorRaw = str(cell("evaluator"));
    if (supervisorRaw) supervisorRefs.set(employeeNumber, supervisorRaw);
    if (evaluatorRaw) evaluatorRefs.set(employeeNumber, evaluatorRaw);

    rowsToUpsert.push({
      employee_number: employeeNumber,
      first_name: firstName,
      last_name: lastName,
      middle_name: str(cell("middleName")),
      nickname: str(cell("nickname")) ?? firstName,
      gender,
      birthdate: toDateStr(cell("birthdate")),
      civil_status: civilStatusRaw ? (CIVIL_STATUSES[civilStatusRaw.toUpperCase()] ?? null) : null,
      nationality: str(cell("nationality")),
      address: str(cell("address")),
      contact_number: toIdString(cell("contactNumber")),
      email: str(cell("email"))?.toLowerCase() ?? null,
      emergency_contact_name: str(cell("emergencyContactName")),
      emergency_contact_phone: toIdString(cell("emergencyContactPhone")),
      sss_number: toIdString(cell("sssNumber")),
      philhealth_number: toIdString(cell("philHealthNumber")),
      hdmf_number: toIdString(cell("hdmfNumber")),
      tin: toIdString(cell("tin")),
      branch_id: branchId,
      department_id: departmentId,
      position_id: positionId,
      employment_status: employmentStatusRaw && EMPLOYMENT_STATUSES.has(employmentStatusRaw) ? employmentStatusRaw : "unassigned",
      date_hired: toDateStr(cell("dateHired")),
      date_regularized: toDateStr(cell("dateRegularized")),
      contract_start: toDateStr(cell("contractStart")),
      contract_end: toDateStr(cell("contractEnd")),
      probation_ends_at: toDateStr(cell("probationEndsAt")),
      payroll_type: payrollTypeRaw && PAYROLL_TYPES.has(payrollTypeRaw) ? payrollTypeRaw : "unassigned",
      daily_rate: toNumber(cell("dailyRate")),
      monthly_salary: toNumber(cell("monthlySalary")),
      daily_allowance: toNumber(cell("dailyAllowance")),
      monthly_allowance: toNumber(cell("monthlyAllowance")),
      status,
      status_changed_at: toDateStr(cell("statusChangedAt")),
      roles: parseRoles(cell("roles")),
    });
  }

  console.log(`${rowsToUpsert.length} row(s) ready to import, ${skipped.length} skipped.\n`);
  if (skipped.length) {
    console.log("Skipped rows (fix these in the spreadsheet and re-run):");
    for (const s of skipped) console.log(`  ${s.employeeNumber}  ${s.name}  — ${s.reason}`);
    console.log("");
  }

  if (DRY_RUN) {
    console.log("--dry-run: no changes written. Re-run without --dry-run to import.");
    return;
  }

  const upsertedByEmpNum = new Map();
  const CHUNK = 50;
  for (let i = 0; i < rowsToUpsert.length; i += CHUNK) {
    const chunk = rowsToUpsert.slice(i, i + CHUNK);
    const { data, error } = await supabase
      .from("employees")
      .upsert(chunk, { onConflict: "employee_number" })
      .select("id, employee_number");
    if (error) {
      console.error(`FAILED chunk ${i / CHUNK + 1}: ${error.message}`);
      continue;
    }
    for (const row of data) upsertedByEmpNum.set(normEmpNum(row.employee_number), row.id);
    console.log(`Upserted ${data.length} row(s) (chunk ${i / CHUNK + 1}).`);
  }

  console.log(`\nResolving supervisor/evaluator references...`);
  const unresolvedRefs = [];
  const updates = [];
  for (const [empNum, supervisorRef] of supervisorRefs) {
    const employeeId = upsertedByEmpNum.get(normEmpNum(empNum));
    const supervisorId = upsertedByEmpNum.get(normEmpNum(supervisorRef));
    if (!employeeId) continue;
    if (!supervisorId) {
      unresolvedRefs.push(`${empNum}: supervisor ${supervisorRef} not found`);
      continue;
    }
    updates.push({ employeeId, field: "supervisor_id", value: supervisorId });
  }
  for (const [empNum, evaluatorRef] of evaluatorRefs) {
    const employeeId = upsertedByEmpNum.get(normEmpNum(empNum));
    const evaluatorId = upsertedByEmpNum.get(normEmpNum(evaluatorRef));
    if (!employeeId) continue;
    if (!evaluatorId) {
      unresolvedRefs.push(`${empNum}: evaluator ${evaluatorRef} not found`);
      continue;
    }
    updates.push({ employeeId, field: "job_performance_evaluator_id", value: evaluatorId });
  }

  for (const u of updates) {
    const { error } = await supabase.from("employees").update({ [u.field]: u.value }).eq("id", u.employeeId);
    if (error) console.error(`FAILED to set ${u.field} for employee ${u.employeeId}: ${error.message}`);
  }
  console.log(`Set ${updates.length} supervisor/evaluator link(s).`);
  if (unresolvedRefs.length) {
    console.log(`\n${unresolvedRefs.length} reference(s) could not be resolved (likely typo'd Employee Number):`);
    for (const r of unresolvedRefs) console.log(`  ${r}`);
  }

  const report = [
    `Roster import — ${new Date().toISOString()}`,
    `Source: ${filePath}`,
    `Imported: ${upsertedByEmpNum.size} / ${rowsToUpsert.length}`,
    `Skipped: ${skipped.length}`,
    ...skipped.map((s) => `  SKIPPED  ${s.employeeNumber}  ${s.name}  — ${s.reason}`),
    `Unresolved supervisor/evaluator refs: ${unresolvedRefs.length}`,
    ...unresolvedRefs.map((r) => `  ${r}`),
  ].join("\n");
  writeFileSync("roster-import-report.txt", report);
  console.log(`\nDone. Full report written to roster-import-report.txt.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
