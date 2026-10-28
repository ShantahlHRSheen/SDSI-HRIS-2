-- =============================================================================
-- Phase 65: the Vice Chairperson's recommendation is optional on an
-- evaluation (none on the Sales Admin form).
--
--   * sae_create: no Vice Chairperson when p_vc is null or ''.
--   * With HR and every head signed, an evaluation without one goes
--     straight to the Chairman.
--   * HR can still return a part while it waits for the Chairman, if no
--     Vice Chairperson is on it.
--   * The open Sales Admin evaluations drop the Vice Chairperson.
--
-- Needs migrate_phase64_evaluation_forms.sql.
-- Safe to run any time, and safe to re-run.
-- =============================================================================

create or replace function sae_create(p_id text, p_employee text, p_period text, p_head text, p_vc text, p_chairman text, p_form text, p_purpose text, p_head2 text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me text := app_current_employee_id();
  v_vc text := nullif(p_vc, '');
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
  if (v_vc is not null and not exists (select 1 from employees where id = v_vc))
     or p_chairman is null or not exists (select 1 from employees where id = p_chairman) then
    raise exception 'Choose the Chairman (and the Vice Chairperson, if any).';
  end if;
  if nullif(p_head2, '') is not null and (p_head2 = p_head or not exists (select 1 from employees where id = p_head2)) then
    raise exception 'Choose a different second Department Head.';
  end if;
  if p_employee in (p_head, p_chairman) or p_employee = v_vc or p_employee = nullif(p_head2, '') then
    raise exception 'The employee can''t be one of their own evaluators.';
  end if;
  insert into sales_admin_evaluations (id, employee_id, employee_name, period, created_by, head_id, vc_id, chairman_id, head_name, vc_name, chairman_name, form, purpose, head2_id, head2_name)
  values (p_id, p_employee, app_sae_name(p_employee), left(btrim(coalesce(p_period, '')), 100), me, p_head, v_vc, p_chairman,
          app_sae_name(p_head), case when v_vc is null then null else app_sae_name(v_vc) end, app_sae_name(p_chairman), p_form, p_purpose,
          nullif(p_head2, ''), case when nullif(p_head2, '') is null then null else app_sae_name(p_head2) end);
end;
$$;

revoke all on function sae_create(text, text, text, text, text, text, text, text, text) from public, anon;
grant execute on function sae_create(text, text, text, text, text, text, text, text, text) to authenticated;

create or replace function app_sae_advance(p_id text)
returns void
language sql
security definer
set search_path = public
as $$
  update sales_admin_evaluations set status = case when vc_id is null then 'chairman' else 'vc' end
   where id = p_id and status = 'open' and hr_signed_at is not null and head_signed_at is not null
     and (head2_id is null or head2_signed_at is not null);
$$;

revoke all on function app_sae_advance(text) from public, anon;

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
  if not (r.status in ('open', 'vc') or (r.status = 'chairman' and r.vc_id is null)) then
    raise exception 'The evaluation already has a recommendation from management.';
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

-- The Sales Admin evaluations not yet recommended by the Vice Chairperson.
update sales_admin_evaluations
   set vc_id = null, vc_name = null,
       status = case when status = 'vc' then 'chairman' else status end
 where form = 'sales_admin' and vc_signed_at is null and vc_id is not null;
