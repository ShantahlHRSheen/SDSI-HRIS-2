-- =============================================================================
-- Phase 64: one evaluation form for all employees (from phase 63).
--
--   * form: 'sales_admin' — Behavior 10 + Job Performance 10 + Sales 80, as
--     before; 'general' — everyone else: Behavior 40 + Job Performance 60,
--     no sales.
--   * purpose: Monthly Evaluation, Year-end Evaluation or Evaluation for
--     Regularization.
--   * A second Department Head (e.g. Cebu: Mary Jane Pedrano with Marlyn
--     Leonardo) also rates Job Performance, gives their comment and
--     recommendation and signs (head2_*); the two ratings are averaged.
--     The Vice Chairperson's turn comes when HR and every head have signed.
--   * sae_create takes the form, purpose and second head; HR's part needs
--     the sales only on the Sales Admin form.
--
-- Needs migrate_phase63_sales_admin_evaluation.sql.
-- Safe to run any time, and safe to re-run.
-- =============================================================================

alter table sales_admin_evaluations add column if not exists form text not null default 'sales_admin';
alter table sales_admin_evaluations add column if not exists purpose text not null default 'Evaluation for Regularization';

alter table sales_admin_evaluations add column if not exists head2_id text references employees (id) on delete set null;
alter table sales_admin_evaluations add column if not exists head2_data jsonb;
alter table sales_admin_evaluations add column if not exists head2_name text;
alter table sales_admin_evaluations add column if not exists head2_signed_at timestamptz;

alter table sales_admin_evaluations drop constraint if exists sales_admin_evaluations_form_check;
alter table sales_admin_evaluations add constraint sales_admin_evaluations_form_check check (form in ('sales_admin', 'general'));
alter table sales_admin_evaluations drop constraint if exists sales_admin_evaluations_purpose_check;
alter table sales_admin_evaluations add constraint sales_admin_evaluations_purpose_check
  check (purpose in ('Monthly Evaluation', 'Year-end Evaluation', 'Evaluation for Regularization'));

-- The purpose is its own field now: "Evaluation for Regularization 2026" → "2026".
update sales_admin_evaluations
   set period = btrim(substr(period, char_length('Evaluation for Regularization') + 1))
 where period like 'Evaluation for Regularization%';

drop policy if exists "sae read" on sales_admin_evaluations;
create policy "sae read" on sales_admin_evaluations for select to authenticated
  using (app_is_hr_manager()
         or app_has_any_role(array['upper_management']::app_role[])
         or (head_id is not null and head_id = app_current_employee_id())
         or (head2_id is not null and head2_id = app_current_employee_id()));

drop function if exists sae_create(text, text, text, text, text, text);

create or replace function sae_create(p_id text, p_employee text, p_period text, p_head text, p_vc text, p_chairman text, p_form text, p_purpose text, p_head2 text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me text := app_current_employee_id();
begin
  if me is null or not coalesce(app_is_hr_manager(), false) then
    raise exception 'Only HR can start an evaluation.';
  end if;
  if p_id is null or char_length(p_id) not between 1 and 64 then
    raise exception 'Missing evaluation id.';
  end if;
  if p_form is null or p_form not in ('sales_admin', 'general') then
    raise exception 'Choose the evaluation form.';
  end if;
  if p_purpose is null or p_purpose not in ('Monthly Evaluation', 'Year-end Evaluation', 'Evaluation for Regularization') then
    raise exception 'Choose the purpose of the evaluation.';
  end if;
  if not exists (select 1 from employees where id = p_employee) then
    raise exception 'Choose the employee to evaluate.';
  end if;
  if p_head is null or not exists (select 1 from employees where id = p_head) then
    raise exception 'Choose the Department Head.';
  end if;
  if p_vc is null or not exists (select 1 from employees where id = p_vc)
     or p_chairman is null or not exists (select 1 from employees where id = p_chairman) then
    raise exception 'Choose the Vice Chairperson and the Chairman.';
  end if;
  if nullif(p_head2, '') is not null and (p_head2 = p_head or not exists (select 1 from employees where id = p_head2)) then
    raise exception 'Choose a different second Department Head.';
  end if;
  if p_employee in (p_head, p_vc, p_chairman) or p_employee = nullif(p_head2, '') then
    raise exception 'The employee can''t be one of their own evaluators.';
  end if;
  insert into sales_admin_evaluations (id, employee_id, employee_name, period, created_by, head_id, vc_id, chairman_id, head_name, vc_name, chairman_name, form, purpose, head2_id, head2_name)
  values (p_id, p_employee, app_sae_name(p_employee), left(btrim(coalesce(p_period, '')), 100), me, p_head, p_vc, p_chairman,
          app_sae_name(p_head), app_sae_name(p_vc), app_sae_name(p_chairman), p_form, p_purpose,
          nullif(p_head2, ''), case when nullif(p_head2, '') is null then null else app_sae_name(p_head2) end);
end;
$$;

revoke all on function sae_create(text, text, text, text, text, text, text, text, text) from public, anon;
grant execute on function sae_create(text, text, text, text, text, text, text, text, text) to authenticated;

-- With HR and every head signed, on to the Vice Chairperson.
create or replace function app_sae_advance(p_id text)
returns void
language sql
security definer
set search_path = public
as $$
  update sales_admin_evaluations set status = 'vc'
   where id = p_id and status = 'open' and hr_signed_at is not null and head_signed_at is not null
     and (head2_id is null or head2_signed_at is not null);
$$;

revoke all on function app_sae_advance(text) from public, anon;

-- A Department Head's part (the first or the second head, whichever is the
-- caller): Job Performance ratings, overall rating, comment, recommendation.
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
  if p_data is null or jsonb_typeof(p_data) <> 'object' or octet_length(p_data::text) > 20000 then
    raise exception 'The evaluation''s details are missing.';
  end if;
  if p_sign then
    if not app_sae_ratings_ok(p_data -> 'job') then
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

create or replace function sae_reopen(p_id text, p_part text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r sales_admin_evaluations%rowtype;
begin
  if not coalesce(app_is_hr_manager(), false) then
    raise exception 'Only HR can reopen a part.';
  end if;
  select * into r from sales_admin_evaluations where id = p_id for update;
  if not found then
    raise exception 'Evaluation not found.';
  end if;
  if r.status not in ('open', 'vc') then
    raise exception 'The Vice Chairperson has already given their recommendation.';
  end if;
  if p_part = 'hr' then
    update sales_admin_evaluations set hr_signed_at = null, status = 'open' where id = p_id;
  elsif p_part = 'head' then
    update sales_admin_evaluations set head_signed_at = null, status = 'open' where id = p_id;
  elsif p_part = 'head2' and r.head2_id is not null then
    update sales_admin_evaluations set head2_signed_at = null, status = 'open' where id = p_id;
  else
    raise exception 'Unknown part.';
  end if;
end;
$$;

revoke all on function sae_reopen(text, text) from public, anon;
grant execute on function sae_reopen(text, text) to authenticated;

create or replace function app_can_sign_sae(path text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select path ~ '^sae/[^/]+/(hr|head|head2|vc|chairman)\.png$'
    and exists (
      select 1 from sales_admin_evaluations r
       where r.id = split_part(path, '/', 2)
         and case split_part(path, '/', 3)
               when 'hr.png' then r.status = 'open' and r.hr_signed_at is null and coalesce(app_is_hr_manager(), false)
               when 'head.png' then r.status = 'open' and r.head_signed_at is null and r.head_id = app_current_employee_id()
               when 'head2.png' then r.status = 'open' and r.head2_signed_at is null and r.head2_id = app_current_employee_id()
               when 'vc.png' then r.status = 'vc' and r.vc_id = app_current_employee_id()
               when 'chairman.png' then r.status = 'chairman' and r.chairman_id = app_current_employee_id()
               else false
             end);
$$;

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
                       and app_current_employee_id() in (r.head_id, r.head2_id)));
$$;

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
  if p_sign then
    if not app_sae_ratings_ok(p_data -> 'behavior') then
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
