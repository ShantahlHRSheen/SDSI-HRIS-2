-- =============================================================================
-- Shantahl HRIS — employee department allocations (multi-department split)
--
-- Lets an employee belong to more than one department at once, with a
-- percentage split (e.g. Cecil Catapang, shared 50/50 between MLM and
-- Darofy — her ₱30,000 monthly salary and headcount are attributed
-- ₱15,000 / 0.5 to each). Most employees never get a row here — they stay
-- fully attributed to their plain employees.department_id, unchanged. This
-- also extends the dept_head RLS scoping so a dept_head sees every employee
-- allocated to their department, not just the one whose department_id
-- happens to point there.
--
-- Safe to run any time, and safe to re-run — every step is a no-op once
-- already applied.
--
-- Run once in the SQL Editor (Database > SQL Editor), any time after
-- migrate_phase4_dept_head_rls.sql.
-- =============================================================================

create table if not exists employee_department_allocations (
  employee_id text not null references employees (id) on delete cascade,
  department_id text not null references departments (id),
  percent numeric not null check (percent > 0 and percent <= 100),
  primary key (employee_id, department_id)
);

alter table employee_department_allocations enable row level security;

drop policy if exists "reference read" on employee_department_allocations;
create policy "reference read" on employee_department_allocations for select using (auth.role() = 'authenticated');
drop policy if exists "reference write" on employee_department_allocations;
create policy "reference write" on employee_department_allocations for all
  using (app_is_hr_or_admin()) with check (app_is_hr_or_admin());

-- True if an employee counts as belonging to a department — either it's
-- their plain department_id, or they have an explicit row above for it.
create or replace function app_employee_in_department(emp_id text, dept_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from employees e where e.id = emp_id and e.department_id = dept_id)
      or exists (select 1 from employee_department_allocations a where a.employee_id = emp_id and a.department_id = dept_id);
$$;

-- Re-patch the dept_head-scoped policies from migrate_phase4_dept_head_rls.sql
-- to use app_employee_in_department() instead of a bare department_id
-- equality check, so a split employee is visible to every dept_head they're
-- allocated to.

drop policy if exists "employees read self or elevated" on employees;
create policy "employees read self or elevated" on employees for select
  using (
    id = app_current_employee_id()
    or app_is_elevated()
    or (app_is_dept_head() and app_employee_in_department(id, app_current_department_id()))
  );

drop policy if exists "evaluations read" on performance_evaluations;
create policy "evaluations read" on performance_evaluations for select
  using (
    employee_id = app_current_employee_id()
    or behavior_evaluator_id = app_current_employee_id()
    or job_performance_evaluator_id = app_current_employee_id()
    or app_is_elevated()
    or (app_is_dept_head() and app_employee_in_department(employee_id, app_current_department_id()))
  );

drop policy if exists "discipline read" on disciplinary_records;
create policy "discipline read" on disciplinary_records for select
  using (
    employee_id = app_current_employee_id()
    or app_is_elevated()
    or (app_is_dept_head() and app_employee_in_department(employee_id, app_current_department_id()))
  );

drop policy if exists "discipline write" on disciplinary_records;
create policy "discipline write" on disciplinary_records for all
  using (app_is_elevated() or (app_is_dept_head() and app_employee_in_department(employee_id, app_current_department_id())))
  with check (app_is_elevated() or (app_is_dept_head() and app_employee_in_department(employee_id, app_current_department_id())));

drop policy if exists "attendance read" on attendance_period_records;
create policy "attendance read" on attendance_period_records for select
  using (
    employee_id = app_current_employee_id()
    or app_is_elevated()
    or (app_is_dept_head() and app_employee_in_department(employee_id, app_current_department_id()))
  );

-- Cecil Catapang (emp-040) is genuinely shared 50/50 between MLM and Darofy
-- — her monthly_salary (30000) is already the combined total of the two
-- 15000 halves. Only inserted if she exists and isn't already split.
insert into employee_department_allocations (employee_id, department_id, percent)
  select 'emp-040', 'dp-mlm', 50
  where exists (select 1 from employees where id = 'emp-040')
  on conflict (employee_id, department_id) do nothing;
insert into employee_department_allocations (employee_id, department_id, percent)
  select 'emp-040', 'dp-darofy', 50
  where exists (select 1 from employees where id = 'emp-040')
  on conflict (employee_id, department_id) do nothing;
