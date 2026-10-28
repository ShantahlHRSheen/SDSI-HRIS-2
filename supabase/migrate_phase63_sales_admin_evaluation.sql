-- =============================================================================
-- Phase 63: Sales Admin Evaluation for Regularization.
--
--   * HR starts an evaluation for a Sales Admin and names the Department
--     Head, the Vice Chairperson and the Chairman.
--   * HR rates Behavior, enters the monthly sales (ads spent, gross sales),
--     gives the overall rating, comment and recommendation, and signs
--     (sae_save_hr). The head rates Job Performance, gives their overall
--     rating, comment and recommendation, and signs (sae_save_head). Either
--     can go first; each part can be saved as a draft until it's signed.
--   * With both parts signed, the Vice Chairperson then the Chairman give
--     their recommendation and sign (sae_recommend).
--   * Signatures: copies of the saved signature in the leave-forms bucket
--     at sae/<evaluation id>/<hr|head|vc|chairman>.png.
--   * Read by HR, Upper Management and the head named on it — not the
--     employee.
--
-- Needs migrate_phase27_leave_forms.sql.
-- Safe to run any time, and safe to re-run.
-- =============================================================================

create table if not exists sales_admin_evaluations (
  id text primary key,
  employee_id text not null references employees (id) on delete cascade,
  employee_name text not null default '',
  period text not null default '' check (char_length(period) <= 100),
  status text not null default 'open' check (status in ('open', 'vc', 'chairman', 'done')),
  created_by text references employees (id) on delete set null,
  created_at timestamptz not null default now(),
  head_id text references employees (id) on delete set null,
  vc_id text references employees (id) on delete set null,
  chairman_id text references employees (id) on delete set null,
  hr_data jsonb,
  hr_id text references employees (id) on delete set null,
  hr_name text,
  hr_signed_at timestamptz,
  head_data jsonb,
  head_name text,
  head_signed_at timestamptz,
  vc_recommendation text,
  vc_name text,
  vc_signed_at timestamptz,
  chairman_recommendation text,
  chairman_name text,
  chairman_signed_at timestamptz
);

create index if not exists sales_admin_evaluations_employee_idx on sales_admin_evaluations (employee_id, created_at);

alter table sales_admin_evaluations enable row level security;

drop policy if exists "sae read" on sales_admin_evaluations;
create policy "sae read" on sales_admin_evaluations for select to authenticated
  using (app_is_hr_manager()
         or app_has_any_role(array['upper_management']::app_role[])
         or (head_id is not null and head_id = app_current_employee_id()));
drop policy if exists "sae delete hr" on sales_admin_evaluations;
create policy "sae delete hr" on sales_admin_evaluations for delete to authenticated
  using (app_is_hr_manager());
-- No insert / update policies: written through the functions below.

-- "Sheena A. Evangelista": first name, middle initial, last name.
create or replace function app_sae_name(p_id text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select btrim(coalesce(btrim(first_name), '')
                          || case when nullif(btrim(coalesce(middle_name, '')), '') is null then '' else ' ' || upper(left(btrim(middle_name), 1)) || '.' end
                          || ' ' || coalesce(btrim(last_name), ''))
                     from employees where id = p_id), '');
$$;

revoke all on function app_sae_name(text) from public, anon;

-- Ratings 0–3, one per item, all given.
create or replace function app_sae_ratings_ok(p jsonb)
returns boolean
language sql
immutable
as $$
  select jsonb_typeof(p) = 'array' and jsonb_array_length(p) > 0
     and not exists (select 1 from jsonb_array_elements(p) x
                     where jsonb_typeof(x) <> 'number' or x::text not in ('0', '1', '2', '3'));
$$;

-- HR starts an evaluation.
create or replace function sae_create(p_id text, p_employee text, p_period text, p_head text, p_vc text, p_chairman text)
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
  if p_employee in (p_head, p_vc, p_chairman) then
    raise exception 'The employee can''t be one of their own evaluators.';
  end if;
  insert into sales_admin_evaluations (id, employee_id, employee_name, period, created_by, head_id, vc_id, chairman_id, head_name, vc_name, chairman_name)
  values (p_id, p_employee, app_sae_name(p_employee), left(btrim(coalesce(p_period, '')), 100), me, p_head, p_vc, p_chairman,
          app_sae_name(p_head), app_sae_name(p_vc), app_sae_name(p_chairman));
end;
$$;

revoke all on function sae_create(text, text, text, text, text, text) from public, anon;
grant execute on function sae_create(text, text, text, text, text, text) to authenticated;

-- With both parts signed, on to the Vice Chairperson.
create or replace function app_sae_advance(p_id text)
returns void
language sql
security definer
set search_path = public
as $$
  update sales_admin_evaluations set status = 'vc'
   where id = p_id and status = 'open' and hr_signed_at is not null and head_signed_at is not null;
$$;

revoke all on function app_sae_advance(text) from public, anon;

-- HR's part: Behavior ratings, sales, overall rating, comment,
-- recommendation. p_sign: sign and send (locks the part).
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
    if jsonb_typeof(p_data -> 'sales') <> 'array' or jsonb_array_length(p_data -> 'sales') = 0 then
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

-- The Department Head's part: Job Performance ratings, overall rating,
-- comment, recommendation.
create or replace function sae_save_head(p_id text, p_data jsonb, p_sign boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me text := app_current_employee_id();
  r sales_admin_evaluations%rowtype;
begin
  select * into r from sales_admin_evaluations where id = p_id for update;
  if not found then
    raise exception 'Evaluation not found.';
  end if;
  if me is null or r.head_id is distinct from me then
    raise exception 'Only the Department Head named on this evaluation can fill in their part.';
  end if;
  if r.status <> 'open' or r.head_signed_at is not null then
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
    if not app_leave_form_file_exists('sae/' || p_id || '/head.png') then
      raise exception 'Attach your signature first.';
    end if;
  end if;
  update sales_admin_evaluations
     set head_data = p_data, head_name = app_sae_name(me),
         head_signed_at = case when p_sign then now() end
   where id = p_id;
  perform app_sae_advance(p_id);
end;
$$;

revoke all on function sae_save_head(text, jsonb, boolean) from public, anon;
grant execute on function sae_save_head(text, jsonb, boolean) to authenticated;

-- The Vice Chairperson's, then the Chairman's recommendation, signed.
create or replace function sae_recommend(p_id text, p_recommendation text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me text := app_current_employee_id();
  r sales_admin_evaluations%rowtype;
  v_rec text := nullif(btrim(coalesce(p_recommendation, '')), '');
begin
  select * into r from sales_admin_evaluations where id = p_id for update;
  if not found then
    raise exception 'Evaluation not found.';
  end if;
  if v_rec is null or char_length(v_rec) > 2000 then
    raise exception 'Write your recommendation (up to 2000 characters).';
  end if;
  if r.status = 'vc' and me is not null and r.vc_id = me then
    if not app_leave_form_file_exists('sae/' || p_id || '/vc.png') then
      raise exception 'Attach your signature first.';
    end if;
    update sales_admin_evaluations
       set vc_recommendation = v_rec, vc_name = app_sae_name(me), vc_signed_at = now(), status = 'chairman'
     where id = p_id;
  elsif r.status = 'chairman' and me is not null and r.chairman_id = me then
    if not app_leave_form_file_exists('sae/' || p_id || '/chairman.png') then
      raise exception 'Attach your signature first.';
    end if;
    update sales_admin_evaluations
       set chairman_recommendation = v_rec, chairman_name = app_sae_name(me), chairman_signed_at = now(), status = 'done'
     where id = p_id;
  else
    raise exception 'This evaluation isn''t waiting for your recommendation.';
  end if;
end;
$$;

revoke all on function sae_recommend(text, text) from public, anon;
grant execute on function sae_recommend(text, text) to authenticated;

-- HR sends a signed part back to be redone (before the Vice Chairperson
-- has given their recommendation).
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
  else
    raise exception 'Unknown part.';
  end if;
end;
$$;

revoke all on function sae_reopen(text, text) from public, anon;
grant execute on function sae_reopen(text, text) to authenticated;

-- Signatures: sae/<evaluation id>/<signer>.png, while that signer's step is open.
create or replace function app_can_sign_sae(path text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select path ~ '^sae/[^/]+/(hr|head|vc|chairman)\.png$'
    and exists (
      select 1 from sales_admin_evaluations r
       where r.id = split_part(path, '/', 2)
         and case split_part(path, '/', 3)
               when 'hr.png' then r.status = 'open' and r.hr_signed_at is null and coalesce(app_is_hr_manager(), false)
               when 'head.png' then r.status = 'open' and r.head_signed_at is null and r.head_id = app_current_employee_id()
               when 'vc.png' then r.status = 'vc' and r.vc_id = app_current_employee_id()
               when 'chairman.png' then r.status = 'chairman' and r.chairman_id = app_current_employee_id()
               else false
             end);
$$;

revoke all on function app_can_sign_sae(text) from public, anon;
grant execute on function app_can_sign_sae(text) to authenticated;

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
                     where r.id = split_part(path, '/', 2) and r.head_id = app_current_employee_id()));
$$;

revoke all on function app_can_read_sae(text) from public, anon;
grant execute on function app_can_read_sae(text) to authenticated;

drop policy if exists "sae signatures read" on storage.objects;
create policy "sae signatures read" on storage.objects for select to authenticated
  using (bucket_id = 'leave-forms' and app_can_read_sae(name));
drop policy if exists "sae sign" on storage.objects;
create policy "sae sign" on storage.objects for insert to authenticated
  with check (bucket_id = 'leave-forms' and app_can_sign_sae(name));
drop policy if exists "sae re-sign" on storage.objects;
create policy "sae re-sign" on storage.objects for update to authenticated
  using (bucket_id = 'leave-forms' and app_can_sign_sae(name))
  with check (bucket_id = 'leave-forms' and app_can_sign_sae(name));
drop policy if exists "sae files delete hr" on storage.objects;
create policy "sae files delete hr" on storage.objects for delete to authenticated
  using (bucket_id = 'leave-forms' and name like 'sae/%' and app_is_hr_manager());
