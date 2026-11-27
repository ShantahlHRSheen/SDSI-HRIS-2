-- Phase 99: a Managerial evaluation form, rated entirely by one evaluator
-- (the Vice Chairperson for SDSI's HR Manager, Operations Manager, Chief
-- Finance Officer and Corporate Treasurer).
--
-- * Form 'managerial': Behavior (40%) and managerial Job Performance (60%),
--   both rated by the evaluator (the "Department Head" on the evaluation) —
--   HR doesn't rate it; HR only starts and releases it. No second head, no
--   Vice Chairperson or Chairman: done when the evaluator signs.
-- * Behavior on the managerial form is two ratings: attendance and
--   punctuality (with the HRIS figures shown) and the evaluator's actual
--   observation, which they write down.
-- * sae_attendance: the employee's attendance for the evaluation's year from
--   the HRIS (lates with minutes and dates, absences with dates, leaves) and
--   their disciplinary records for the year — for HR, Upper Management and
--   the evaluator, shown on the form.
--
-- Needs migrate_phase98_evaluation_release.sql. Safe to run more than once.

alter table sales_admin_evaluations drop constraint if exists sales_admin_evaluations_form_check;
alter table sales_admin_evaluations add constraint sales_admin_evaluations_form_check check (form in ('sales_admin', 'general', 'managerial'));

-- Managerial Behavior: both ratings (attendance, actual observation) given,
-- and the observation written.
create or replace function app_sae_mgr_behavior_ok(p jsonb)
returns boolean
language sql
immutable
as $$
  select coalesce(app_sae_ratings_ok(p -> 'behavior'), false)
     and case when jsonb_typeof(p -> 'behavior') = 'array' then jsonb_array_length(p -> 'behavior') else 0 end = 2
     and nullif(btrim(coalesce(p ->> 'observation', '')), '') is not null;
$$;

create or replace function sae_create(p_id text, p_employee text, p_period text, p_head text, p_vc text, p_chairman text, p_form text, p_purpose text, p_head2 text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me text := app_current_employee_id();
  v_no_mgmt boolean := p_purpose = 'Year-end Evaluation' or p_form = 'managerial';
  v_vc text := case when p_purpose = 'Year-end Evaluation' or p_form = 'managerial' then null else nullif(p_vc, '') end;
  v_chairman text := case when p_purpose = 'Year-end Evaluation' or p_form = 'managerial' then null else nullif(p_chairman, '') end;
  v_head2 text := case when p_form = 'managerial' then null else nullif(p_head2, '') end;
begin
  if me is null or not coalesce(app_is_hr_manager(), false) then
    raise exception 'Only HR can start an evaluation.';
  end if;
  if p_id is null or char_length(p_id) not between 1 and 64 then
    raise exception 'Missing evaluation id.';
  end if;
  if p_form is null or p_form not in ('sales_admin', 'general', 'managerial') then
    raise exception 'Choose the evaluation form.';
  end if;
  if p_purpose is null or p_purpose not in ('Monthly Evaluation', 'Year-end Evaluation', 'Evaluation for Regularization') then
    raise exception 'Choose the purpose of the evaluation.';
  end if;
  if not exists (select 1 from employees where id = p_employee) then
    raise exception 'Choose the employee to evaluate.';
  end if;
  if p_head is null or not exists (select 1 from employees where id = p_head) then
    raise exception 'Choose the evaluator.';
  end if;
  if not v_no_mgmt and (
       (v_vc is not null and not exists (select 1 from employees where id = v_vc))
       or v_chairman is null or not exists (select 1 from employees where id = v_chairman)) then
    raise exception 'Choose the Chairman (and the Vice Chairperson, if any).';
  end if;
  if v_head2 is not null and (v_head2 = p_head or not exists (select 1 from employees where id = v_head2)) then
    raise exception 'Choose a different second Department Head.';
  end if;
  if p_employee = p_head or p_employee = v_chairman or p_employee = v_vc or p_employee = v_head2 then
    raise exception 'The employee can''t be one of their own evaluators.';
  end if;
  insert into sales_admin_evaluations (id, employee_id, employee_name, period, created_by, head_id, vc_id, chairman_id, head_name, vc_name, chairman_name, form, purpose, head2_id, head2_name)
  values (p_id, p_employee, app_sae_name(p_employee), left(btrim(coalesce(p_period, '')), 100), me, p_head, v_vc, v_chairman,
          app_sae_name(p_head),
          case when v_vc is null then null else app_sae_name(v_vc) end,
          case when v_chairman is null then null else app_sae_name(v_chairman) end,
          p_form, p_purpose,
          v_head2, case when v_head2 is null then null else app_sae_name(v_head2) end);
end;
$$;

revoke all on function sae_create(text, text, text, text, text, text, text, text, text) from public, anon;
grant execute on function sae_create(text, text, text, text, text, text, text, text, text) to authenticated;

-- A managerial evaluation doesn't wait for HR's part.
create or replace function app_sae_advance(p_id text)
returns void
language sql
security definer
set search_path = public
as $$
  update sales_admin_evaluations
     set status = case when vc_id is not null then 'vc' when chairman_id is not null then 'chairman' else 'done' end
   where id = p_id and status = 'open' and (hr_signed_at is not null or form = 'managerial') and head_signed_at is not null
     and (head2_id is null or head2_signed_at is not null);
$$;

revoke all on function app_sae_advance(text) from public, anon;

-- HR's part: HR can still save the employee's details on a managerial
-- evaluation, but not rate or sign it.
create or replace function sae_save_hr(p_id text, p_data jsonb, p_sign boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me text := app_current_employee_id();
  r sales_admin_evaluations%rowtype;
begin
  if me is null or not coalesce(app_is_hr_manager(), false) then
    raise exception 'Only HR can fill in HR''s part.';
  end if;
  select * into r from sales_admin_evaluations where id = p_id for update;
  if not found then
    raise exception 'Evaluation not found.';
  end if;
  if r.status <> 'open' or r.hr_signed_at is not null then
    raise exception 'HR''s part is already signed.';
  end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' or octet_length(p_data::text) > 20000 then
    raise exception 'The evaluation''s details are missing.';
  end if;
  if p_sign and r.form = 'managerial' then
    raise exception 'A managerial evaluation is rated and signed by the evaluator only.';
  end if;
  if p_sign then
    if not coalesce(app_sae_ratings_ok(p_data -> 'behavior'), false) then
      raise exception 'Rate every Behavior item (0 to 3).';
    end if;
    if r.form = 'sales_admin' and (jsonb_typeof(p_data -> 'sales') is distinct from 'array' or jsonb_array_length(p_data -> 'sales') = 0) then
      raise exception 'Enter at least one month of sales.';
    end if;
    if nullif(btrim(coalesce(p_data ->> 'overall', '')), '') is null then
      raise exception 'Choose HR''s overall rating.';
    end if;
    if nullif(btrim(coalesce(p_data ->> 'recommendation', '')), '') is null then
      raise exception 'Give HR''s recommendation.';
    end if;
    if not app_leave_form_file_exists('sae/' || p_id || '/hr.png') then
      raise exception 'Attach your signature first.';
    end if;
  end if;
  update sales_admin_evaluations
     set hr_data = p_data, hr_id = me, hr_name = app_sae_name(me),
         hr_signed_at = case when p_sign then now() end
   where id = p_id;
  perform app_sae_advance(p_id);
end;
$$;

revoke all on function sae_save_hr(text, jsonb, boolean) from public, anon;
grant execute on function sae_save_hr(text, jsonb, boolean) to authenticated;

-- The evaluator's part; on a managerial evaluation it also holds the
-- Behavior ratings.
create or replace function sae_save_head(p_id text, p_data jsonb, p_sign boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me text := app_current_employee_id();
  r sales_admin_evaluations%rowtype;
  second boolean;
begin
  select * into r from sales_admin_evaluations where id = p_id for update;
  if not found then
    raise exception 'Evaluation not found.';
  end if;
  if me is null or (r.head_id is distinct from me and r.head2_id is distinct from me) then
    raise exception 'Only a Department Head named on this evaluation can fill in their part.';
  end if;
  second := r.head_id is distinct from me;
  if r.status <> 'open' or (case when second then r.head2_signed_at else r.head_signed_at end) is not null then
    raise exception 'Your part is already signed.';
  end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' or octet_length(p_data::text) > 30000 then
    raise exception 'The evaluation''s details are missing.';
  end if;
  if p_sign then
    if r.form = 'managerial' and not app_sae_mgr_behavior_ok(p_data) then
      raise exception 'Rate attendance and your actual observation, and write your observation.';
    end if;
    if not coalesce(app_sae_ratings_ok(p_data -> 'job'), false) then
      raise exception 'Rate every Job Performance item (0 to 3).';
    end if;
    if nullif(btrim(coalesce(p_data ->> 'overall', '')), '') is null then
      raise exception 'Choose your overall rating.';
    end if;
    if nullif(btrim(coalesce(p_data ->> 'recommendation', '')), '') is null then
      raise exception 'Give your recommendation.';
    end if;
    if not app_leave_form_file_exists('sae/' || p_id || case when second then '/head2.png' else '/head.png' end) then
      raise exception 'Attach your signature first.';
    end if;
  end if;
  if second then
    update sales_admin_evaluations
       set head2_data = p_data, head2_name = app_sae_name(me), head2_signed_at = case when p_sign then now() end
     where id = p_id;
  else
    update sales_admin_evaluations
       set head_data = p_data, head_name = app_sae_name(me), head_signed_at = case when p_sign then now() end
     where id = p_id;
  end if;
  perform app_sae_advance(p_id);
end;
$$;

revoke all on function sae_save_head(text, jsonb, boolean) from public, anon;
grant execute on function sae_save_head(text, jsonb, boolean) to authenticated;

-- Phase 97/98's edit, also checking the Behavior ratings on a managerial form.
create or replace function sae_edit_head(p_id text, p_data jsonb, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me text := app_current_employee_id();
  r sales_admin_evaluations%rowtype;
  second boolean;
  old jsonb;
begin
  select * into r from sales_admin_evaluations where id = p_id for update;
  if not found then
    raise exception 'Evaluation not found.';
  end if;
  if me is null or (r.head_id is distinct from me and r.head2_id is distinct from me) then
    raise exception 'Only a Department Head named on this evaluation can edit their part.';
  end if;
  second := r.head_id is distinct from me;
  if (case when second then r.head2_signed_at else r.head_signed_at end) is null then
    raise exception 'Your part isn''t signed yet — fill it in and sign it instead.';
  end if;
  if not (r.status in ('open', 'vc')
          or (r.status = 'chairman' and r.vc_id is null)
          or (r.status = 'done' and r.vc_id is null and r.chairman_id is null)) then
    raise exception 'The evaluation already has a recommendation from management, so it can''t be edited.';
  end if;
  if r.acknowledged_at is not null then
    raise exception 'The employee already acknowledged this evaluation, so it can''t be edited.';
  end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' or octet_length(p_data::text) > 30000 then
    raise exception 'The evaluation''s details are missing.';
  end if;
  if r.form = 'managerial' and not app_sae_mgr_behavior_ok(p_data) then
    raise exception 'Rate attendance and your actual observation, and write your observation.';
  end if;
  if not coalesce(app_sae_ratings_ok(p_data -> 'job'), false) then
    raise exception 'Rate every Job Performance item (0 to 3).';
  end if;
  if nullif(btrim(coalesce(p_data ->> 'overall', '')), '') is null then
    raise exception 'Choose your overall rating.';
  end if;
  if nullif(btrim(coalesce(p_data ->> 'recommendation', '')), '') is null then
    raise exception 'Give your recommendation.';
  end if;
  if char_length(coalesce(p_reason, '')) > 1000 then
    raise exception 'The reason is too long.';
  end if;
  old := case when second then r.head2_data else r.head_data end;
  if old is not distinct from p_data then
    raise exception 'Nothing was changed.';
  end if;

  insert into sales_admin_evaluation_edits (evaluation_id, part, editor_id, editor_name, before_data, after_data, reason)
  values (p_id, case when second then 'head2' else 'head' end, me, app_sae_name(me), old, p_data, nullif(btrim(coalesce(p_reason, '')), ''));

  if second then
    update sales_admin_evaluations set head2_data = p_data where id = p_id;
  else
    update sales_admin_evaluations set head_data = p_data where id = p_id;
  end if;
end;
$$;

revoke all on function sae_edit_head(text, jsonb, text) from public, anon;
grant execute on function sae_edit_head(text, jsonb, text) to authenticated;

-- The evaluated employee's attendance for the evaluation's year (the year in
-- its period, else this year), from the payroll cut-offs' attendance records.
create or replace function sae_attendance(p_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  me text := app_current_employee_id();
  r sales_admin_evaluations%rowtype;
  v_year int;
  v jsonb;
begin
  select * into r from sales_admin_evaluations where id = p_id;
  if not found or me is null or not coalesce(coalesce(app_is_hr_manager(), false)
                                              or coalesce(app_has_any_role(array['upper_management']::app_role[]), false)
                                              or me = coalesce(r.head_id, '') or me = coalesce(r.head2_id, ''), false) then
    raise exception 'Evaluation not found.';
  end if;
  v_year := coalesce(substring(r.period from '(20[0-9]{2})')::int, extract(year from now() at time zone 'Asia/Manila')::int);

  with p as (
    select a.*, pp.period_start, pp.period_end
      from attendance_period_records a
      join payroll_periods pp on pp.id = a.period_id
     where a.employee_id = r.employee_id and extract(year from pp.period_start) = v_year
  ), d as (
    -- cut-offs with day-by-day detail (lates / absences by date)
    select * from p where late_instances is not null or absence_instances is not null
  ), lates as (
    select x ->> 'date' as dt, coalesce(nullif(x ->> 'lateRawMinutes', '')::numeric, 0) as mins
      from d, jsonb_array_elements(case when jsonb_typeof(d.late_day_details) = 'array' then d.late_day_details else '[]'::jsonb end) x
  ), absent as (
    select x as dt
      from d, jsonb_array_elements_text(case when jsonb_typeof(d.absent_dates) = 'array' then d.absent_dates else '[]'::jsonb end) x
  )
  select jsonb_build_object(
    'year', v_year,
    'cutoffs', (select count(*) from p),
    'detailCutoffs', (select count(*) from d),
    'from', (select min(period_start) from d),
    'to', (select max(period_end) from d),
    'lateCount', (select coalesce(sum(coalesce(late_instances, 0)), 0) from d),
    'lateMinutes', (select coalesce(sum(mins), 0) from lates),
    'lates', (select coalesce(jsonb_agg(jsonb_build_object('date', dt, 'minutes', mins) order by dt), '[]'::jsonb) from lates),
    'absentCount', (select coalesce(sum(coalesce(absence_instances, 0)), 0) from d),
    'absentDates', (select coalesce(jsonb_agg(dt order by dt), '[]'::jsonb) from absent),
    'slDays', (select coalesce(sum(sl_days), 0) from p),
    'vlDays', (select coalesce(sum(vl_days), 0) from p),
    'daysWorked', (select coalesce(sum(days_worked), 0) from p),
    'records', (select coalesce(jsonb_agg(jsonb_build_object('date', dr.date, 'type', dr.type, 'description', left(dr.description, 300), 'status', dr.status) order by dr.date), '[]'::jsonb)
                  from disciplinary_records dr
                 where dr.employee_id = r.employee_id and extract(year from dr.date) = v_year and dr.withdrawn_at is null)
  ) into v;
  return v;
end;
$$;

revoke all on function sae_attendance(text) from public, anon;
grant execute on function sae_attendance(text) to authenticated;
