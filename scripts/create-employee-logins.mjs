#!/usr/bin/env node
// Bulk-creates Supabase Auth accounts for every employee row that doesn't
// have a login yet (employees.user_id is null), using their existing email
// on file. Run this LOCALLY on your own machine, never in a shared session —
// it needs your project's service-role key, which bypasses Row Level
// Security entirely and must never be committed or shared.
//
// Usage:
//   npm install @supabase/supabase-js   (if not already installed)
//   SUPABASE_URL=https://xxxx.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=eyJ... \
//   node scripts/create-employee-logins.mjs
//
// (Find both values in the Supabase dashboard: Project Settings > API —
// service_role is the "secret" key, not the anon/publishable one.)
//
// Each new account is auto-confirmed (no email verification step, same as
// checking "Auto Confirm User" in the dashboard) and links to its employees
// row automatically via the on_auth_user_created trigger — see
// supabase/migrate_phase5_auto_link_trigger.sql. Run that migration first if
// you haven't already.
//
// Generated passwords are written to created-logins.csv (gitignored) so you
// can securely share each one with that employee, then delete the file.
// Supabase has no built-in "must change password on first login" flag, so
// ask each employee to change theirs after signing in for the first time.

import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "node:fs";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables first.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function generatePassword(length = 12) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%";
  let out = "";
  for (let i = 0; i < length; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

async function main() {
  const { data: employees, error } = await supabase
    .from("employees")
    .select("id, first_name, last_name, email, user_id")
    .is("user_id", null)
    .order("last_name");
  if (error) throw error;

  if (employees.length === 0) {
    console.log("Every employee already has a login. Nothing to do.");
    return;
  }

  console.log(`Creating logins for ${employees.length} employee(s) without one yet...\n`);

  const results = [];
  for (const emp of employees) {
    const password = generatePassword();
    const { error: createError } = await supabase.auth.admin.createUser({
      email: emp.email,
      password,
      email_confirm: true,
    });
    if (createError) {
      console.error(`FAILED  ${emp.email} (${emp.first_name} ${emp.last_name}): ${createError.message}`);
      results.push({ email: emp.email, name: `${emp.first_name} ${emp.last_name}`, password: "", status: `error: ${createError.message}` });
      continue;
    }
    console.log(`OK      ${emp.email} (${emp.first_name} ${emp.last_name})`);
    results.push({ email: emp.email, name: `${emp.first_name} ${emp.last_name}`, password, status: "created" });
  }

  const csv = ["email,name,password,status", ...results.map((r) => `${r.email},"${r.name}",${r.password},${r.status}`)].join("\n");
  writeFileSync("created-logins.csv", csv);
  console.log(`\nDone. Passwords written to created-logins.csv — share each row with that employee over a secure channel, then delete the file.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
