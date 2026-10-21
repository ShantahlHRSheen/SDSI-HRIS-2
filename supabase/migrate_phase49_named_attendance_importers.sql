-- =============================================================================
-- Shantahl HRIS — named attendance importers take over their branch
--
--   When HR names someone for a branch in attendance_importers, only they
--   (plus HR / payroll and the branch approver) can import that branch's
--   biometrics: the "supervisor in the branch" and "only employee" rules
--   apply only to branches with nobody named.
--
-- Safe to run any time, and safe to re-run.
-- Run once in the SQL Editor (Database > SQL Editor).
-- =============================================================================

create or replace function app_can_import_branch(p_branch text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_branch is not null and p_branch <> 'br-unassigned' and (
    app_has_any_role(array['hr_admin', 'payroll_officer']::app_role[])
    or exists (select 1 from branches b where b.id = p_branch and b.approver_id = app_current_employee_id())
    or exists (select 1 from attendance_importers i where i.branch_id = p_branch and i.employee_id = app_current_employee_id())
    or (
      not exists (select 1 from attendance_importers i where i.branch_id = p_branch)
      and exists (
        select 1 from employees me
         where me.id = app_current_employee_id() and me.branch_id = p_branch
           and (
             exists (select 1 from employees e where e.supervisor_id = me.id and e.branch_id = p_branch and e.status in ('active', 'on_leave'))
             or not exists (select 1 from employees o where o.branch_id = p_branch and o.id <> me.id and o.status in ('active', 'on_leave'))
           )
      )
    )
  );
$$;

revoke all on function app_can_import_branch(text) from public, anon;
grant execute on function app_can_import_branch(text) to authenticated;
