-- =============================================================================
-- Shantahl HRIS — biometrics import
--
--   * biometric_links: which employee each person in a branch's biometrics
--     file is (by the machine's ID, or the name when the file has no ID).
--     Saved the first time HR matches them, so later imports match by
--     themselves. HR and payroll only.
--   * attendance_period_records.missing_punches: days with only a time in
--     or only a time out, as [{ "date", "missing": "in"|"out", "punch" }].
--     Shown to HR and to the employee on their own attendance.
--
-- Safe to run any time, and safe to re-run.
-- Run once in the SQL Editor (Database > SQL Editor).
-- =============================================================================

create table if not exists biometric_links (
  branch_id text not null,
  device_key text not null,
  device_name text not null default '',
  employee_id text not null references employees (id) on delete cascade,
  updated_at timestamptz not null default now(),
  primary key (branch_id, device_key)
);

alter table biometric_links enable row level security;

drop policy if exists "biometric links hr" on biometric_links;
create policy "biometric links hr" on biometric_links for all to authenticated
  using (app_has_any_role(array['hr_admin', 'payroll_officer']::app_role[]))
  with check (app_has_any_role(array['hr_admin', 'payroll_officer']::app_role[]));

alter table attendance_period_records add column if not exists missing_punches jsonb;
