-- =============================================================================
-- Shantahl HRIS — 13th month pay slips released to employees
--
--   * thirteenth_month_slips: the copy of an employee's 13th month slip that
--     HR released to them (shown under My Payslips), kept as released.
--   * Employees read their own slip and their own Checked by / Released by
--     sign-offs (so the signatures print on their copy); HR and the payroll
--     officer release; the payroll roles and management can view.
--
-- Needs migrate_phase25_thirteenth_month.sql.
-- Safe to run any time, and safe to re-run.
-- Run once in the SQL Editor (Database > SQL Editor).
-- =============================================================================

create table if not exists thirteenth_month_slips (
  year int not null check (year between 2000 and 2100),
  employee_id text not null references employees (id) on delete cascade,
  slip jsonb not null,
  total numeric(14, 2) not null,
  released_by text not null default '',
  released_at timestamptz not null default now(),
  primary key (year, employee_id)
);

alter table thirteenth_month_slips enable row level security;

drop policy if exists "thirteenth month slips read" on thirteenth_month_slips;
create policy "thirteenth month slips read" on thirteenth_month_slips for select to authenticated
  using (employee_id = app_current_employee_id() or app_is_elevated());

drop policy if exists "thirteenth month slips release" on thirteenth_month_slips;
create policy "thirteenth month slips release" on thirteenth_month_slips for all to authenticated
  using (app_has_any_role(array['hr_admin', 'payroll_officer']::app_role[]))
  with check (app_has_any_role(array['hr_admin', 'payroll_officer']::app_role[]));

drop policy if exists "thirteenth month signoffs own" on thirteenth_month_signoffs;
create policy "thirteenth month signoffs own" on thirteenth_month_signoffs for select to authenticated
  using (employee_id = app_current_employee_id());
