-- =============================================================================
-- Shantahl HRIS — Phase 4 RLS hardening patch
--
-- Brings an already-applied schema up to date with the latest
-- supabase/schema.sql: scopes dept_head to their own department (instead of
-- seeing everything, company-wide) on the exact tables the app shows them,
-- and closes two pre-existing gaps (audit-log inserts were blocked for
-- non-elevated real accounts; 1601-C company-wide rows were readable by
-- anyone signed in). Nothing here deletes data — it only changes who can
-- read/write which rows.
--
-- Run once in the SQL Editor (Database > SQL Editor), any time after
-- schema.sql + the Phase 1 patch. Order matters: each policy is dropped
-- before being recreated, since Postgres doesn't have "create or replace
-- policy".
-- =============================================================================

-- New/redefined helper functions.
create or replace function app_current_department_id()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select department_id from employees where user_id = auth.uid();
$$;

create or replace function app_is_elevated()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select app_has_any_role(array[
    'hr_admin', 'payroll_officer', 'sr_accounting_assistant',
    'treasurer', 'cfo', 'upper_management', 'sys_admin'
  ]::app_role[]);
$$;

create or replace function app_is_dept_head()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select app_has_any_role(array['dept_head']::app_role[]);
$$;

-- Employees: dept_head additionally reads their own department.
drop policy if exists "employees read self or elevated" on employees;
create policy "employees read self or elevated" on employees for select
  using (
    id = app_current_employee_id()
    or app_is_elevated()
    or (app_is_dept_head() and department_id = app_current_department_id())
  );

-- Performance evaluations: dept_head reads their department; write access is
-- now "elevated, or one of the two assigned evaluators" instead of a blanket
-- "elevated" that used to include dept_head regardless of assignment.
drop policy if exists "evaluations read" on performance_evaluations;
create policy "evaluations read" on performance_evaluations for select
  using (
    employee_id = app_current_employee_id()
    or behavior_evaluator_id = app_current_employee_id()
    or job_performance_evaluator_id = app_current_employee_id()
    or app_is_elevated()
    or (app_is_dept_head() and employee_id in (select id from employees where department_id = app_current_department_id()))
  );

drop policy if exists "evaluations write elevated" on performance_evaluations;
drop policy if exists "evaluations write" on performance_evaluations;
create policy "evaluations write" on performance_evaluations for all
  using (app_is_elevated() or behavior_evaluator_id = app_current_employee_id() or job_performance_evaluator_id = app_current_employee_id())
  with check (app_is_elevated() or behavior_evaluator_id = app_current_employee_id() or job_performance_evaluator_id = app_current_employee_id());

-- Disciplinary records: dept_head reads and writes for their own department.
drop policy if exists "discipline read" on disciplinary_records;
create policy "discipline read" on disciplinary_records for select
  using (
    employee_id = app_current_employee_id()
    or app_is_elevated()
    or (app_is_dept_head() and employee_id in (select id from employees where department_id = app_current_department_id()))
  );

drop policy if exists "discipline write elevated" on disciplinary_records;
drop policy if exists "discipline write" on disciplinary_records;
create policy "discipline write" on disciplinary_records for all
  using (app_is_elevated() or (app_is_dept_head() and employee_id in (select id from employees where department_id = app_current_department_id())))
  with check (app_is_elevated() or (app_is_dept_head() and employee_id in (select id from employees where department_id = app_current_department_id())));

-- Audit log: insert opened up to any signed-in user (previously blocked any
-- non-elevated real account from ever writing an audit entry, since
-- "elevated" was the only allowed inserter). Read stays elevated-only, which
-- now excludes dept_head.
drop policy if exists "audit write elevated" on audit_logs;
drop policy if exists "audit write authenticated" on audit_logs;
create policy "audit write authenticated" on audit_logs for insert with check (auth.role() = 'authenticated');

-- Attendance: dept_head reads their department (for the report pages).
drop policy if exists "attendance read" on attendance_period_records;
create policy "attendance read" on attendance_period_records for select
  using (
    employee_id = app_current_employee_id()
    or app_is_elevated()
    or (app_is_dept_head() and employee_id in (select id from employees where department_id = app_current_department_id()))
  );

-- BIR forms: company-wide 1601-C rows (employee_id is null) used to be
-- readable by any signed-in user via a bare "employee_id is null" clause —
-- tightened to payroll-tier roles only.
drop policy if exists "bir forms read" on generated_bir_forms;
create policy "bir forms read" on generated_bir_forms for select
  using (employee_id = app_current_employee_id() or app_is_elevated());

-- No changes needed for leave_requests / overtime_requests /
-- attendance_correction_requests / payroll_line_overrides /
-- voucher_amount_overrides / generated_payslips / generated_vouchers — their
-- existing policies already reference app_is_elevated(), so redefining that
-- function above automatically narrows dept_head's access on those tables
-- too (down to "their own rows only", matching the app, which never gives
-- dept_head an approval queue or payroll visibility).
