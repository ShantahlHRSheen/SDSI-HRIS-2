-- Phase 98: HR releases a completed evaluation to the employee, who can then
-- see it (read only) and sign an acknowledgement.
--
-- * The employee sees only their own evaluations that are completed AND
--   released by HR — not the edit history (phase 97).
-- * HR can take a release back until the employee has acknowledged.
-- * Once the employee acknowledges, the heads can no longer edit their part.
--
-- Needs migrate_phase96 and migrate_phase97. Safe to run more than once.

alter table sales_admin_evaluations add column if not exists released_at timestamptz;
alter table sales_admin_evaluations add column if not exists released_by text;
alter table sales_admin_evaluations add column if not exists acknowledged_at timestamptz;

-- Who can read an evaluation: as phase 96, plus the employee once released.
drop policy if exists "sae read" on sales_admin_evaluations;
create policy "sae read" on sales_admin_evaluations for select to authenticated
  using (app_is_hr_manager()
         or app_has_any_role(array['upper_management']::app_role[])
         or (head_id is not null and head_id = app_current_employee_id())
         or (head2_id is not null and head2_id = app_current_employee_id())
         or app_sae_oversees(employee_id)
         or (employee_id = app_current_employee_id() and status = 'done' and released_at is not null));

-- The edit history stays with HR, management and the heads / supervisors:
-- not the evaluated employee.
drop policy if exists "sae edits read" on sales_admin_evaluation_edits;
create policy "sae edits read" on sales_admin_evaluation_edits for select to authenticated
  using (exists (select 1 from sales_admin_evaluations e
                  where e.id = evaluation_id
                    and (coalesce(app_is_hr_manager(), false) or e.employee_id is distinct from app_current_employee_id())));

-- Signatures: the employee can read them on their released evaluation, and
-- place their own acknowledgement (employee.png) until they acknowledge.
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
                       and (app_current_employee_id() in (r.head_id, r.head2_id)
                            or app_sae_oversees(r.employee_id)
                            or (r.employee_id = app_current_employee_id() and r.status = 'done' and r.released_at is not null))));
$$;

revoke all on function app_can_read_sae(text) from public, anon;
grant execute on function app_can_read_sae(text) to authenticated;

create or replace function app_can_sign_sae(path text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select path ~ '^sae/[^/]+/(hr|head|head2|vc|chairman|employee)\.png$'
    and exists (
      select 1 from sales_admin_evaluations r
       where r.id = split_part(path, '/', 2)
         and case split_part(path, '/', 3)
               when 'hr.png' then r.status = 'open' and r.hr_signed_at is null and coalesce(app_is_hr_manager(), false)
               when 'head.png' then r.status = 'open' and r.head_signed_at is null and r.head_id = app_current_employee_id()
               when 'head2.png' then r.status = 'open' and r.head2_signed_at is null and r.head2_id = app_current_employee_id()
               when 'vc.png' then r.status = 'vc' and r.vc_id = app_current_employee_id()
               when 'chairman.png' then r.status = 'chairman' and r.chairman_id = app_current_employee_id()
               when 'employee.png' then r.status = 'done' and r.released_at is not null and r.acknowledged_at is null
                                        and r.employee_id = app_current_employee_id()
               else false
             end);
$$;

revoke all on function app_can_sign_sae(text) from public, anon;
grant execute on function app_can_sign_sae(text) to authenticated;

-- HR releases a completed evaluation (p_release true), or takes the release
-- back (false) while the employee hasn't acknowledged it yet.
create or replace function sae_release(p_id text, p_release boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r sales_admin_evaluations%rowtype;
begin
  if not coalesce(app_is_hr_manager(), false) then
    raise exception 'Only HR can release an evaluation.';
  end if;
  select * into r from sales_admin_evaluations where id = p_id for update;
  if not found then
    raise exception 'Evaluation not found.';
  end if;
  if p_release then
    if r.status <> 'done' then
      raise exception 'Only a completed evaluation can be released.';
    end if;
    update sales_admin_evaluations
       set released_at = coalesce(released_at, now()), released_by = coalesce(released_by, app_sae_name(app_current_employee_id()))
     where id = p_id;
  else
    if r.acknowledged_at is not null then
      raise exception 'The employee already acknowledged it.';
    end if;
    update sales_admin_evaluations set released_at = null, released_by = null where id = p_id;
  end if;
end;
$$;

revoke all on function sae_release(text, boolean) from public, anon;
grant execute on function sae_release(text, boolean) to authenticated;

-- The employee acknowledges their released evaluation (signature first).
create or replace function sae_acknowledge(p_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r sales_admin_evaluations%rowtype;
begin
  select * into r from sales_admin_evaluations where id = p_id for update;
  if not found or r.employee_id is distinct from app_current_employee_id() or r.status <> 'done' or r.released_at is null then
    raise exception 'Evaluation not found.';
  end if;
  if r.acknowledged_at is not null then
    raise exception 'You already acknowledged it.';
  end if;
  if not app_leave_form_file_exists('sae/' || p_id || '/employee.png') then
    raise exception 'Attach your signature first.';
  end if;
  update sales_admin_evaluations set acknowledged_at = now() where id = p_id;
end;
$$;

revoke all on function sae_acknowledge(text) from public, anon;
grant execute on function sae_acknowledge(text) to authenticated;

-- Phase 97's edit, now locked once the employee has acknowledged.
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
  if p_data is null or jsonb_typeof(p_data) <> 'object' or octet_length(p_data::text) > 20000 then
    raise exception 'The evaluation''s details are missing.';
  end if;
  if not app_sae_ratings_ok(p_data -> 'job') then
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
