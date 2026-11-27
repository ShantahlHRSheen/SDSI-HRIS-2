-- =============================================================================
-- Phase 96: Department Heads and supervisors see the evaluations of the
-- employees under them (read only), for the Performance Evaluations summary.
--
--   * Read access to an evaluation now also goes to:
--       - the employee's supervisor or co-supervisor (app_is_supervisor_of), and
--       - a Department Head (dept_head role) for employees in their department
--         (app_employee_in_department, including split allocations),
--     but never to the employee being evaluated.
--   * The same people can view its signatures (for the printed form).
--   * HR and Upper Management still see all; the heads named on an
--     evaluation still see it. Nothing else changes: only the named people
--     fill in or sign their parts.
--
-- Needs migrate_phase64_evaluation_forms.sql and migrate_phase67_co_supervisor.sql.
-- Safe to run any time, and safe to re-run.
-- =============================================================================

create or replace function app_sae_oversees(emp_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select emp_id is distinct from app_current_employee_id()
     and (coalesce(app_is_supervisor_of(emp_id), false)
          or (coalesce(app_is_dept_head(), false) and app_employee_in_department(emp_id, app_current_department_id())));
$$;

revoke all on function app_sae_oversees(text) from public, anon;
grant execute on function app_sae_oversees(text) to authenticated;

drop policy if exists "sae read" on sales_admin_evaluations;
create policy "sae read" on sales_admin_evaluations for select to authenticated
  using (app_is_hr_manager()
         or app_has_any_role(array['upper_management']::app_role[])
         or (head_id is not null and head_id = app_current_employee_id())
         or (head2_id is not null and head2_id = app_current_employee_id())
         or app_sae_oversees(employee_id));

create or replace function app_can_read_sae(path text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select path like 'sae/%'
    and (coalesce(app_is_hr_manager(), false)
         or app_has_any_role(array['upper_management']::app_role[])
         or exists (select 1 from sales_admin_evaluations r
                     where r.id = split_part(path, '/', 2)
                       and (app_current_employee_id() in (r.head_id, r.head2_id) or app_sae_oversees(r.employee_id))));
$$;

revoke all on function app_can_read_sae(text) from public, anon;
grant execute on function app_can_read_sae(text) to authenticated;
