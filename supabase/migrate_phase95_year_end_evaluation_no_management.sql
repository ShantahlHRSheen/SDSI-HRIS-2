-- =============================================================================
-- Phase 95: Year-end Evaluations don't go to the Vice Chairperson or the
-- Chairman.
--
--   * sae_create: for a Year-end Evaluation, no Vice Chairperson and no
--     Chairman (both are stored empty). Other purposes are unchanged.
--   * With HR and every Department Head signed, an evaluation with no
--     Chairman is completed ('done') right away.
--   * HR can still return a part of a completed Year-end Evaluation.
--   * Upper Management (the Vice Chairperson and the Chairman) still see
--     every evaluation and its results ("sae read", phase 64).
--   * Any Year-end Evaluation not yet signed by management drops them too.
--
-- Needs migrate_phase65_evaluation_optional_vc.sql.
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
  v_year_end boolean := p_purpose = 'Year-end Evaluation';
  v_vc text := case when p_purpose = 'Year-end Evaluation' then null else nullif(p_vc, '') end;
  v_chairman text := case when p_purpose = 'Year-end Evaluation' then null else nullif(p_chairman, '') end;
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
  if not v_year_end and (
       (v_vc is not null and not exists (select 1 from employees where id = v_vc))
       or v_chairman is null or not exists (select 1 from employees where id = v_chairman)) then
    raise exception 'Choose the Chairman (and the Vice Chairperson, if any).';
  end if;
  if nullif(p_head2, '') is not null and (p_head2 = p_head or not exists (select 1 from employees where id = p_head2)) then
    raise exception 'Choose a different second Department Head.';
  end if;
  if p_employee = p_head or p_employee = v_chairman or p_employee = v_vc or p_employee = nullif(p_head2, '') then
    raise exception 'The employee can''t be one of their own evaluators.';
  end if;
  insert into sales_admin_evaluations (id, employee_id, employee_name, period, created_by, head_id, vc_id, chairman_id, head_name, vc_name, chairman_name, form, purpose, head2_id, head2_name)
  values (p_id, p_employee, app_sae_name(p_employee), left(btrim(coalesce(p_period, '')), 100), me, p_head, v_vc, v_chairman,
          app_sae_name(p_head),
          case when v_vc is null then null else app_sae_name(v_vc) end,
          case when v_chairman is null then null else app_sae_name(v_chairman) end,
          p_form, p_purpose,
          nullif(p_head2, ''), case when nullif(p_head2, '') is null then null else app_sae_name(p_head2) end);
end;
$$;

revoke all on function sae_create(text, text, text, text, text, text, text, text, text) from public, anon;
grant execute on function sae_create(text, text, text, text, text, text, text, text, text) to authenticated;

-- With HR and every head signed: to the Vice Chairperson, else the Chairman,
-- else (Year-end) completed.
create or replace function app_sae_advance(p_id text)
returns void
language sql
security definer
set search_path = public
as $$
  update sales_admin_evaluations
     set status = case when vc_id is not null then 'vc' when chairman_id is not null then 'chairman' else 'done' end
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
  if not (r.status in ('open', 'vc')
          or (r.status = 'chairman' and r.vc_id is null)
          or (r.status = 'done' and r.vc_id is null and r.chairman_id is null)) then
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

-- Year-end Evaluations not yet signed by management: without them.
update sales_admin_evaluations
   set vc_id = null, vc_name = null, chairman_id = null, chairman_name = null,
       status = case when status in ('vc', 'chairman') then 'done' else status end
 where purpose = 'Year-end Evaluation' and vc_signed_at is null and chairman_signed_at is null
   and (vc_id is not null or chairman_id is not null);
