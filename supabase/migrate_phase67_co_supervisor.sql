-- =============================================================================
-- LSM Group HRIS — a second supervisor
--
--   employees.co_supervisor_id: an employee can have a second supervisor
--   (e.g. Daro's Head Office, where two Credit Supervisors both approve).
--   Either supervisor sees the employee's leave, overtime, attendance
--   correction and travel allowance requests and can approve or disapprove
--   them — whoever acts first; the form shows who signed.
--
-- Safe to run any time, and safe to re-run. Needs the leave / overtime /
-- correction / travel forms (migrate_phase27, 28, 36, 41).
-- Run once in the SQL Editor (Database > SQL Editor) of each company that
-- uses it (Daro).
-- =============================================================================

alter table employees add column if not exists co_supervisor_id text references employees (id) on delete set null;
create index if not exists employees_co_supervisor_id_idx on employees (co_supervisor_id);

-- Is the signed-in user one of this employee's supervisors?
create or replace function app_is_supervisor_of(emp_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from employees e
     where e.id = emp_id
       and (e.supervisor_id = app_current_employee_id() or e.co_supervisor_id = app_current_employee_id())
  );
$$;

create or replace function app_is_supervising_dept_head(emp_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select app_is_dept_head() and app_is_supervisor_of(emp_id);
$$;

create or replace function app_leave_form_head_can(req_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from leave_requests r join employees e on e.id = r.employee_id
    where r.id = req_id
      and r.employee_id <> coalesce(app_current_employee_id(), '')
      and (e.supervisor_id = app_current_employee_id() or e.co_supervisor_id = app_current_employee_id() or (e.supervisor_id is null and app_is_hr_manager()))
  );
$$;

create or replace function app_overtime_form_head_can(req_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from overtime_requests r join employees e on e.id = r.employee_id
    where r.id = req_id
      and r.employee_id <> coalesce(app_current_employee_id(), '')
      and (e.supervisor_id = app_current_employee_id() or e.co_supervisor_id = app_current_employee_id() or (e.supervisor_id is null and app_is_hr_manager()))
  );
$$;

create or replace function app_correction_form_head_can(req_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from attendance_correction_requests r join employees e on e.id = r.employee_id
    where r.id = req_id
      and r.employee_id <> coalesce(app_current_employee_id(), '')
      and (e.supervisor_id = app_current_employee_id() or e.co_supervisor_id = app_current_employee_id() or (e.supervisor_id is null and app_is_hr_manager()))
  );
$$;

create or replace function app_travel_head_can(req_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from travel_allowance_requests t join employees e on e.id = t.employee_id
    where t.id = req_id
      and t.employee_id <> coalesce(app_current_employee_id(), '')
      and (e.supervisor_id = app_current_employee_id() or e.co_supervisor_id = app_current_employee_id() or (e.supervisor_id is null and app_is_hr_manager()))
  );
$$;
