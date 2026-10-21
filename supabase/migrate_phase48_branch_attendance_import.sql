-- =============================================================================
-- Shantahl HRIS — branches import their own biometrics attendance
--
--   Besides HR / payroll (any branch), a branch's attendance can be imported
--   by:
--     * the branch approver (branches.approver_id);
--     * a supervisor in the branch (someone the branch's employees report to);
--     * the branch's only employee, when there's just one;
--     * anyone HR lists in attendance_importers for that branch.
--   app_can_import_branch(branch) says who; import_branch_attendance saves a
--   branch import (open cut-offs only, the caller's branch only), and the
--   biometrics matches (biometric_links) follow the same rule.
--
-- Safe to run any time, and safe to re-run.
-- Run once in the SQL Editor (Database > SQL Editor).
-- =============================================================================

create table if not exists attendance_importers (
  employee_id text not null references employees (id) on delete cascade,
  branch_id text not null references branches (id) on delete cascade,
  primary key (employee_id, branch_id)
);

alter table attendance_importers enable row level security;

drop policy if exists "attendance importers read" on attendance_importers;
create policy "attendance importers read" on attendance_importers for select to authenticated
  using (employee_id = app_current_employee_id() or app_has_any_role(array['hr_admin', 'payroll_officer']::app_role[]));
drop policy if exists "attendance importers hr" on attendance_importers;
create policy "attendance importers hr" on attendance_importers for all to authenticated
  using (app_has_any_role(array['hr_admin']::app_role[]))
  with check (app_has_any_role(array['hr_admin']::app_role[]));

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
    or exists (
      select 1 from employees me
       where me.id = app_current_employee_id() and me.branch_id = p_branch
         and (
           exists (select 1 from employees e where e.supervisor_id = me.id and e.branch_id = p_branch and e.status in ('active', 'on_leave'))
           or not exists (select 1 from employees o where o.branch_id = p_branch and o.id <> me.id and o.status in ('active', 'on_leave'))
         )
    )
  );
$$;

revoke all on function app_can_import_branch(text) from public, anon;
grant execute on function app_can_import_branch(text) to authenticated;

drop policy if exists "biometric links hr" on biometric_links;
drop policy if exists "biometric links branch" on biometric_links;
create policy "biometric links branch" on biometric_links for all to authenticated
  using (app_can_import_branch(branch_id))
  with check (app_can_import_branch(branch_id));

create or replace function import_branch_attendance(p_period text, p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r jsonb;
  emp_branch text;
  me text := app_current_employee_id();
  my_name text;
  n integer := 0;
begin
  if me is null then
    raise exception 'Not signed in as an employee.';
  end if;
  if not exists (select 1 from payroll_periods where id = p_period and status = 'open') then
    raise exception 'This cut-off is locked or closed — its attendance can''t be changed.';
  end if;
  select trim(both ' ' from coalesce(first_name, '') || ' ' || coalesce(last_name, '')) into my_name from employees where id = me;
  for r in select * from jsonb_array_elements(p_rows) loop
    select branch_id into emp_branch from employees where id = r->>'employee_id';
    if emp_branch is null or not app_can_import_branch(emp_branch) then
      raise exception 'You can only import attendance for your own branch.';
    end if;
    insert into attendance_period_records (
      period_id, employee_id, days_worked, holiday_days, sl_days, vl_days, late_minutes, undertime_minutes, notes, source, updated_by, updated_at,
      late_instances, late_day_details, undertime_instances, undertime_day_details, half_day_instances, half_day_dates, absence_instances, absent_dates,
      missing_punches, biometric_detail
    ) values (
      p_period, r->>'employee_id',
      coalesce((r->>'days_worked')::numeric, 0), coalesce((r->>'holiday_days')::numeric, 0), coalesce((r->>'sl_days')::numeric, 0), coalesce((r->>'vl_days')::numeric, 0),
      coalesce((r->>'late_minutes')::numeric, 0), coalesce((r->>'undertime_minutes')::numeric, 0), left(coalesce(r->>'notes', ''), 500), 'import', coalesce(my_name, ''), now(),
      (r->>'late_instances')::integer, r->'late_day_details', (r->>'undertime_instances')::integer, r->'undertime_day_details',
      (r->>'half_day_instances')::integer, r->'half_day_dates', (r->>'absence_instances')::integer, r->'absent_dates',
      r->'missing_punches', r->'biometric_detail'
    )
    on conflict (period_id, employee_id) do update set
      days_worked = excluded.days_worked, holiday_days = excluded.holiday_days, sl_days = excluded.sl_days, vl_days = excluded.vl_days,
      late_minutes = excluded.late_minutes, undertime_minutes = excluded.undertime_minutes, notes = excluded.notes, source = excluded.source,
      updated_by = excluded.updated_by, updated_at = excluded.updated_at,
      late_instances = excluded.late_instances, late_day_details = excluded.late_day_details,
      undertime_instances = excluded.undertime_instances, undertime_day_details = excluded.undertime_day_details,
      half_day_instances = excluded.half_day_instances, half_day_dates = excluded.half_day_dates,
      absence_instances = excluded.absence_instances, absent_dates = excluded.absent_dates,
      missing_punches = excluded.missing_punches, biometric_detail = excluded.biometric_detail;
    n := n + 1;
  end loop;
  return n;
end;
$$;

revoke all on function import_branch_attendance(text, jsonb) from public, anon;
grant execute on function import_branch_attendance(text, jsonb) to authenticated;

-- Gretchen De Sosa imports Cavite's attendance.
insert into attendance_importers (employee_id, branch_id)
select id, 'br-cav' from employees where id = 'emp-062' and exists (select 1 from branches where id = 'br-cav')
on conflict do nothing;
