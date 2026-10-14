-- =============================================================================
-- Shantahl HRIS — "encoded in payroll" check on requests
--
--   payroll_encoded: HR ticks a leave, overtime or attendance correction
--   request once it has been encoded in payroll (kind = 'leave' | 'ot' |
--   'corr'). Who ticked it and when are kept. HR and payroll can tick and
--   untick; company-wide roles can see the ticks.
--
-- Safe to run any time, and safe to re-run.
-- Run once in the SQL Editor (Database > SQL Editor).
-- =============================================================================

create table if not exists payroll_encoded (
  kind text not null check (kind in ('leave', 'ot', 'corr')),
  request_id text not null,
  encoded_by text references employees (id) on delete set null,
  encoded_by_name text not null default '',
  encoded_at timestamptz not null default now(),
  primary key (kind, request_id)
);

alter table payroll_encoded enable row level security;

drop policy if exists "payroll encoded read" on payroll_encoded;
create policy "payroll encoded read" on payroll_encoded for select to authenticated
  using (app_is_elevated());
drop policy if exists "payroll encoded tick" on payroll_encoded;
create policy "payroll encoded tick" on payroll_encoded for insert to authenticated
  with check (app_has_any_role(array['hr_admin', 'payroll_officer']::app_role[]) and encoded_by = app_current_employee_id());
drop policy if exists "payroll encoded untick" on payroll_encoded;
create policy "payroll encoded untick" on payroll_encoded for delete to authenticated
  using (app_has_any_role(array['hr_admin', 'payroll_officer']::app_role[]));
