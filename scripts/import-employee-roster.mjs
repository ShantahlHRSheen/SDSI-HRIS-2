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
// Safe to re-run: rows are matched by Employee Number. New employees are
// inserted with whatever's on file (blanks fall back to "Unassigned" etc.).
// Employees already in the database are merged, never clobbered:
//   - a blank (or unrecognised) cell never clears or replaces a value
//     already on file — only filled-in cells overwrite;
//   - an existing company email (@shantahl.com.ph) is always kept;
//   - roles are the union of the database's and the spreadsheet's;
//   - Status always comes from the spreadsheet (HR's current record).
// An email that already belongs to a different employee (or appears twice
// in the sheet) is left off rather than failing the import.
// Rows missing Employee Number, First/Last Name, Gender, or Status are
// skipped. A summary — including every field that would change on an
// existing employee — is written to roster-import-report.txt (gitignored),
// in --dry-run mode too.

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

// The roster has stray trailing periods ("MAGDADARO.") — drop them,
// except on suffixes like "Jr." / "Sr.".
function nameStr(v) {
  const s = str(v);
  if (!s || /\b(jr|sr)\.$/i.test(s)) return s;
  return s.replace(/\.+$/, "").trim() || null;
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

  // These return null for a blank or unrecognised cell, so an existing
  // employee's value is kept; new employees fall back to "Unassigned".
  function resolveBranch(name) {
    const s = str(name);
    return s ? (branchByName.get(s.toUpperCase()) ?? null) : null;
  }

  function resolveDept(name) {
    const s = str(name);
    return s ? (deptByName.get(s.toUpperCase()) ?? null) : null;
  }

  function resolvePosition(deptId, title) {
    const s = str(title);
    if (!s || !deptId || deptId === UNASSIGNED_DEPT) return null;
    let titlePart = s;
    for (const sep of [" — ", " - "]) {
      if (s.includes(sep)) {
        const [, maybeTitle] = s.split(sep);
        titlePart = maybeTitle.trim();
        break;
      }
    }
    return posByDeptAndTitle.get(`${deptId}::${titlePart.toUpperCase()}`) ?? null;
  }

  const { data: existingRows, error: eErr } = await supabase.from("employees").select("*");
  if (eErr) throw eErr;
  const existingByEmpNum = new Map(existingRows.map((e) => [e.employee_number, e]));
  const COMPANY_EMAIL = /@shantahl\.com\.ph$/i;

  const skipped = [];
  const warnings = [];
  const supervisorRefs = new Map(); // employee_number -> raw supervisor cell
  const evaluatorRefs = new Map(); // employee_number -> raw evaluator cell
  const inserts = [];
  const updates = []; // { existing, patch, changes: [field, old, new][] }
  let unchanged = 0;

  // Email is unique in the database: track who holds which address so a
  // clash drops the email from this row instead of failing its whole chunk.
  const emailOwner = new Map(existingRows.filter((e) => e.email).map((e) => [e.email.toLowerCase(), e.employee_number]));

  for (const row of sheetRows) {
    const cell = (key) => row.getCell(COLS[key]).value;
    const employeeNumber = str(cell("employeeNumber"));
    const firstName = nameStr(cell("firstName"));
    const lastName = nameStr(cell("lastName"));
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

    const existing = existingByEmpNum.get(employeeNumber);
    const civilStatusRaw = str(cell("civilStatus"));
    const employmentStatusRaw = str(cell("employmentStatus"))?.toLowerCase() ?? null;
    const payrollTypeRaw = str(cell("payrollType"))?.toLowerCase() ?? null;
    const branchId = resolveBranch(cell("branch"));
    const departmentId = resolveDept(cell("department"));
    const positionId = resolvePosition(departmentId ?? existing?.department_id, cell("position"));

    const supervisorRaw = str(cell("supervisor"));
    const evaluatorRaw = str(cell("evaluator"));
    if (supervisorRaw) supervisorRefs.set(employeeNumber, supervisorRaw);
    if (evaluatorRaw) evaluatorRefs.set(employeeNumber, evaluatorRaw);

    // HR's roster mostly puts the middle name in the Nickname column and
    // leaves Middle Name blank — read it as the middle name in that case.
    const middleRaw = nameStr(cell("middleName"));
    const nicknameRaw = nameStr(cell("nickname"));

    // null = blank / unrecognised on the sheet.
    const fields = {
      first_name: firstName,
      last_name: lastName,
      middle_name: middleRaw ?? nicknameRaw,
      nickname: middleRaw ? nicknameRaw : null,
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
      employment_status: employmentStatusRaw && EMPLOYMENT_STATUSES.has(employmentStatusRaw) ? employmentStatusRaw : null,
      date_hired: toDateStr(cell("dateHired")),
      date_regularized: toDateStr(cell("dateRegularized")),
      contract_start: toDateStr(cell("contractStart")),
      contract_end: toDateStr(cell("contractEnd")),
      probation_ends_at: toDateStr(cell("probationEndsAt")),
      payroll_type: payrollTypeRaw && PAYROLL_TYPES.has(payrollTypeRaw) ? payrollTypeRaw : null,
      daily_rate: toNumber(cell("dailyRate")),
      monthly_salary: toNumber(cell("monthlySalary")),
      daily_allowance: toNumber(cell("dailyAllowance")),
      monthly_allowance: toNumber(cell("monthlyAllowance")),
      status,
      status_changed_at: toDateStr(cell("statusChangedAt")),
      roles: parseRoles(cell("roles")),
    };

    if (existing && existing.email && COMPANY_EMAIL.test(existing.email)) fields.email = null;
    if (fields.email) {
      const owner = emailOwner.get(fields.email);
      if (owner && owner !== employeeNumber) {
        warnings.push(`${employeeNumber}: email ${fields.email} already belongs to ${owner} — left off`);
        fields.email = null;
      } else {
        emailOwner.set(fields.email, employeeNumber);
      }
    }

    if (!existing) {
      const deptId = fields.department_id ?? UNASSIGNED_DEPT;
      inserts.push({
        ...fields,
        employee_number: employeeNumber,
        nickname: fields.nickname ?? firstName,
        branch_id: fields.branch_id ?? UNASSIGNED_BRANCH,
        department_id: deptId,
        position_id: deptId === UNASSIGNED_DEPT ? UNASSIGNED_POSITION : (fields.position_id ?? UNASSIGNED_POSITION),
        employment_status: fields.employment_status ?? "unassigned",
        payroll_type: fields.payroll_type ?? "unassigned",
      });
      continue;
    }

    // Moving to a department without a recognisable position would leave
    // the old department's position behind — reset it instead.
    if (fields.department_id && fields.department_id !== existing.department_id && !fields.position_id) {
      fields.position_id = UNASSIGNED_POSITION;
    }
    const mergedRoles = [...new Set([...(existing.roles ?? []), ...fields.roles])];
    fields.roles = mergedRoles.length === (existing.roles ?? []).length ? null : mergedRoles;

    const patch = {};
    const changes = [];
    for (const [key, value] of Object.entries(fields)) {
      if (value === null || value === undefined) continue;
      const old = existing[key];
      // The roster is mostly ALL CAPS — don't let that re-case "Marlyn".
      const same = Array.isArray(value)
        ? JSON.stringify(value) === JSON.stringify(old)
        : old !== null && old !== undefined && String(old).toUpperCase() === String(value).toUpperCase();
      if (same) continue;
      patch[key] = value;
      changes.push([key, old, value]);
    }
    if (changes.length) updates.push({ existing, patch, changes });
    else unchanged++;
  }

  const fmt = (v) => (v === null || v === undefined ? "(blank)" : Array.isArray(v) ? `[${v.join(", ")}]` : String(v));
  const changeLines = updates.flatMap((u) => [
    `  ${u.existing.employee_number}  ${u.existing.last_name}, ${u.existing.first_name}`,
    ...u.changes.map(([k, o, n]) => `      ${k}: ${fmt(o)} → ${fmt(n)}`),
  ]);
  const notable = updates.flatMap((u) =>
    u.changes
      .filter(([k]) => k === "status" || k === "roles" || k === "email")
      .map(([k, o, n]) => `  ${u.existing.employee_number}  ${u.existing.last_name}, ${u.existing.first_name}  ${k}: ${fmt(o)} → ${fmt(n)}`),
  );

  console.log(`${inserts.length} new employee(s) to insert.`);
  console.log(`${updates.length + unchanged} already in the database: ${updates.length} with changes, ${unchanged} unchanged.`);
  console.log(`${skipped.length} skipped.\n`);
  if (skipped.length) {
    console.log("Skipped rows (fix these in the spreadsheet and re-run):");
    for (const s of skipped) console.log(`  ${s.employeeNumber}  ${s.name}  — ${s.reason}`);
    console.log("");
  }
  if (notable.length) {
    console.log("Status / role / email changes on existing employees:");
    for (const l of notable) console.log(l);
    console.log("");
  }
  if (warnings.length) {
    console.log("Warnings:");
    for (const w of warnings) console.log(`  ${w}`);
    console.log("");
  }

  function writeReport(extra) {
    const report = [
      `Roster import${DRY_RUN ? " (DRY RUN — nothing written)" : ""} — ${new Date().toISOString()}`,
      `Source: ${filePath}`,
      `New: ${inserts.length}`,
      `Existing with changes: ${updates.length}`,
      `Existing unchanged: ${unchanged}`,
      `Skipped: ${skipped.length}`,
      ...skipped.map((s) => `  SKIPPED  ${s.employeeNumber}  ${s.name}  — ${s.reason}`),
      `Warnings: ${warnings.length}`,
      ...warnings.map((w) => `  ${w}`),
      ...extra,
      `Field changes on existing employees:`,
      ...changeLines,
    ].join("\n");
    writeFileSync("roster-import-report.txt", report);
  }

  if (DRY_RUN) {
    writeReport([]);
    console.log("--dry-run: no changes written. Every field change is listed in roster-import-report.txt.");
    return;
  }

  // Supervisor/evaluator references can point at anyone in the database,
  // not just this sheet's rows.
  const idByEmpNum = new Map(existingRows.map((e) => [normEmpNum(e.employee_number), e.id]));
  const failed = [];

  const CHUNK = 50;
  for (let i = 0; i < inserts.length; i += CHUNK) {
    const chunk = inserts.slice(i, i + CHUNK);
    const { data, error } = await supabase.from("employees").insert(chunk).select("id, employee_number");
    if (!error) {
      for (const row of data) idByEmpNum.set(normEmpNum(row.employee_number), row.id);
      console.log(`Inserted ${data.length} row(s) (chunk ${i / CHUNK + 1}).`);
      continue;
    }
    // Retry one by one so a single bad row doesn't sink the rest.
    for (const one of chunk) {
      const { data: d, error: e } = await supabase.from("employees").insert(one).select("id, employee_number").single();
      if (e) failed.push(`${one.employee_number}: insert failed — ${e.message}`);
      else idByEmpNum.set(normEmpNum(d.employee_number), d.id);
    }
  }

  let updated = 0;
  for (const u of updates) {
    const { error } = await supabase.from("employees").update(u.patch).eq("id", u.existing.id);
    if (error) failed.push(`${u.existing.employee_number}: update failed — ${error.message}`);
    else updated++;
  }
  console.log(`Updated ${updated} existing employee(s).`);

  console.log(`\nResolving supervisor/evaluator references...`);
  const unresolvedRefs = [];
  const links = [];
  for (const [refs, field, label] of [
    [supervisorRefs, "supervisor_id", "supervisor"],
    [evaluatorRefs, "job_performance_evaluator_id", "evaluator"],
  ]) {
    for (const [empNum, ref] of refs) {
      const employeeId = idByEmpNum.get(normEmpNum(empNum));
      const targetId = idByEmpNum.get(normEmpNum(ref));
      if (!employeeId) continue;
      if (!targetId) {
        unresolvedRefs.push(`${empNum}: ${label} ${ref} not found`);
        continue;
      }
      links.push({ employeeId, field, value: targetId });
    }
  }
  for (const l of links) {
    const { error } = await supabase.from("employees").update({ [l.field]: l.value }).eq("id", l.employeeId);
    if (error) failed.push(`failed to set ${l.field} for employee ${l.employeeId}: ${error.message}`);
  }
  console.log(`Set ${links.length} supervisor/evaluator link(s).`);
  if (unresolvedRefs.length) {
    console.log(`\n${unresolvedRefs.length} reference(s) could not be resolved (likely typo'd Employee Number):`);
    for (const r of unresolvedRefs) console.log(`  ${r}`);
  }
  if (failed.length) {
    console.log(`\n${failed.length} failure(s):`);
    for (const f of failed) console.log(`  ${f}`);
  }

  writeReport([
    `Failures: ${failed.length}`,
    ...failed.map((f) => `  ${f}`),
    `Unresolved supervisor/evaluator refs: ${unresolvedRefs.length}`,
    ...unresolvedRefs.map((r) => `  ${r}`),
  ]);
  console.log(`\nDone. Full report written to roster-import-report.txt.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
