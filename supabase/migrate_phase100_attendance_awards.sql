-- Phase 100: attendance awards from the HRIS (Performance Evaluations page).
--
-- sae_attendance_awards(year): for every active employee, their attendance
-- for the year from the payroll cut-offs' attendance records — days worked,
-- absences, lates (count and minutes) over the cut-offs with day-by-day
-- detail, and the average time of their first punch when a biometrics import
-- kept the punches. The page picks:
--   * Best in Attendance Award — highest attendance rate
--   * Most Punctual Award — fewest lates (then fewest late minutes)
--   * Early Bird Award — earliest average time in (needs biometric punches)
-- HR and Upper Management only.
--
-- Safe to run more than once.

create or replace function sae_attendance_awards(p_year int)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v jsonb;
begin
  if not (coalesce(app_is_hr_manager(), false) or coalesce(app_has_any_role(array['upper_management']::app_role[]), false)) then
    raise exception 'Only HR and Upper Management can see the attendance awards.';
  end if;

  with p as (
    select a.*
      from attendance_period_records a
      join payroll_periods pp on pp.id = a.period_id
      join employees e on e.id = a.employee_id and e.status = 'active'
     where extract(year from pp.period_start) = p_year
  ), d as (
    select * from p where late_instances is not null or absence_instances is not null
  ), lm as (
    select d.employee_id, sum(coalesce(nullif(x ->> 'lateRawMinutes', '')::numeric, 0)) as mins
      from d, jsonb_array_elements(case when jsonb_typeof(d.late_day_details) = 'array' then d.late_day_details else '[]'::jsonb end) x
     group by d.employee_id
  ), punch as (
    -- the first punch of each day kept by a biometrics import, in minutes
    select p.employee_id, k.day,
           min(split_part(t, ':', 1)::int * 60 + split_part(t, ':', 2)::int) as first_in
      from p,
           jsonb_each(case when jsonb_typeof(p.biometric_detail -> 'days') = 'object' then p.biometric_detail -> 'days' else '{}'::jsonb end) as k(day, punches),
           jsonb_array_elements_text(case when jsonb_typeof(k.punches) = 'array' then k.punches else '[]'::jsonb end) t
     where t ~ '^[0-9]{1,2}:[0-9]{2}'
     group by p.employee_id, k.day
  ), agg as (
    select e.id,
           (select count(*) from d where d.employee_id = e.id) as detail_cutoffs,
           (select coalesce(sum(d.days_worked), 0) from d where d.employee_id = e.id) as days_worked,
           (select coalesce(sum(coalesce(d.absence_instances, 0)), 0) from d where d.employee_id = e.id) as absences,
           (select coalesce(sum(coalesce(d.late_instances, 0)), 0) from d where d.employee_id = e.id) as lates,
           coalesce((select lm.mins from lm where lm.employee_id = e.id), 0) as late_minutes,
           (select count(*) from punch where punch.employee_id = e.id) as punch_days,
           (select avg(first_in) from punch where punch.employee_id = e.id) as avg_first_in
      from employees e
     where e.status = 'active' and exists (select 1 from p where p.employee_id = e.id)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'employeeId', agg.id,
           'detailCutoffs', agg.detail_cutoffs,
           'daysWorked', agg.days_worked,
           'absences', agg.absences,
           'lates', agg.lates,
           'lateMinutes', agg.late_minutes,
           'punchDays', agg.punch_days,
           'avgFirstIn', agg.avg_first_in)), '[]'::jsonb)
    into v
    from agg;
  return jsonb_build_object('year', p_year, 'maxDetailCutoffs', (select coalesce(max((x ->> 'detailCutoffs')::int), 0) from jsonb_array_elements(v) x), 'employees', v);
end;
$$;

revoke all on function sae_attendance_awards(int) from public, anon;
grant execute on function sae_attendance_awards(int) to authenticated;
