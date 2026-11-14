-- =============================================================================
-- Phase 93: SSS Maternity Benefit Payment Voucher.
--
--   * HR prepares it (mb_create / mb_save: the computation) and signs it as
--     "Prepared by", sending it on (mb_send).
--   * Then, in order, each named person signs their part (mb_sign):
--       check     — Checked by (Sr. Accounting Assistant)
--       approve1  — Approved by (Vice Chairperson)
--       approve2  — Approved by (CEO)
--       release   — Released by (Corporate Treasurer)
--       receive   — Received by (the employee)
--     Anyone before the release can return it to HR with a note (mb_return).
--   * Signatures: copies of each one's saved signature in the leave-forms
--     bucket at mb/<id>/<hr|check|approve1|approve2|release|receive>.png.
--   * Seen by HR, the signers named on it once it's sent, and the employee
--     once it's released to them. Amounts are confidential to these people.
--
-- Needs migrate_phase27_leave_forms.sql and migrate_phase69_regularization.sql.
-- Safe to run any time, and safe to re-run.
-- =============================================================================

create table if not exists maternity_benefits (
  id text primary key,
  employee_id text not null references employees (id) on delete cascade,
  employee_name text not null default '',
  status text not null default 'hr' check (status in ('hr', 'check', 'approve1', 'approve2', 'release', 'receive', 'done')),
  data jsonb not null default '{}'::jsonb,
  net_amount numeric(12, 2) not null default 0,
  created_by text references employees (id) on delete set null,
  created_at timestamptz not null default now(),
  hr_id text references employees (id) on delete set null,
  hr_name text,
  hr_at timestamptz,
  check_id text references employees (id) on delete set null,
  check_name text,
  check_at timestamptz,
  approve1_id text references employees (id) on delete set null,
  approve1_name text,
  approve1_at timestamptz,
  approve2_id text references employees (id) on delete set null,
  approve2_name text,
  approve2_at timestamptz,
  release_id text references employees (id) on delete set null,
  release_name text,
  release_at timestamptz,
  receive_at timestamptz,
  returned_note text,
  returned_by text,
  returned_at timestamptz
);

create index if not exists maternity_benefits_employee_idx on maternity_benefits (employee_id, created_at);

alter table maternity_benefits enable row level security;

create or replace function app_mb_signer(r maternity_benefits)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select app_current_employee_id() in (r.check_id, r.approve1_id, r.approve2_id, r.release_id);
$$;

revoke all on function app_mb_signer(maternity_benefits) from public, anon;
grant execute on function app_mb_signer(maternity_benefits) to authenticated;

drop policy if exists "mb read" on maternity_benefits;
create policy "mb read" on maternity_benefits for select to authenticated
  using (coalesce(app_is_hr_manager(), false)
         or (status <> 'hr' and app_mb_signer(maternity_benefits))
         or (employee_id = app_current_employee_id() and status in ('receive', 'done')));
drop policy if exists "mb delete hr" on maternity_benefits;
create policy "mb delete hr" on maternity_benefits for delete to authenticated
  using (coalesce(app_is_hr_manager(), false) and status <> 'done');
-- No insert / update policies: written through the functions below.

create or replace function app_mb_check(p_employee text, p_check text, p_approve1 text, p_approve2 text, p_release text, p_data jsonb)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from employees where id = p_employee) then
    raise exception 'Choose the employee.';
  end if;
  if p_check is null or p_approve1 is null or p_approve2 is null or p_release is null
     or exists (select 1 from unnest(array[p_check, p_approve1, p_approve2, p_release]) x where not exists (select 1 from employees e where e.id = x))
     or p_employee in (p_check, p_approve1, p_approve2, p_release) then
    raise exception 'Choose who checks, approves and releases it (not the employee).';
  end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' or octet_length(p_data::text) > 30000 then
    raise exception 'The details are missing.';
  end if;
end;
$$;

revoke all on function app_mb_check(text, text, text, text, text, jsonb) from public, anon;

create or replace function app_mb_net(p_data jsonb)
returns numeric
language sql
immutable
as $$
  select round(coalesce((p_data ->> 'netAmount')::numeric, 0), 2);
$$;

-- HR starts one (a draft).
create or replace function mb_create(p_id text, p_employee text, p_check text, p_approve1 text, p_approve2 text, p_release text, p_data jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me text := app_current_employee_id();
begin
  if me is null or not coalesce(app_is_hr_manager(), false) then
    raise exception 'Only HR can prepare a maternity benefit voucher.';
  end if;
  if p_id is null or char_length(p_id) not between 1 and 64 then
    raise exception 'Missing id.';
  end if;
  perform app_mb_check(p_employee, p_check, p_approve1, p_approve2, p_release, p_data);
  insert into maternity_benefits (id, employee_id, employee_name, data, net_amount, created_by,
                                  check_id, check_name, approve1_id, approve1_name, approve2_id, approve2_name, release_id, release_name)
  values (p_id, p_employee, app_reg_name(p_employee), p_data, app_mb_net(p_data), me,
          p_check, app_reg_name(p_check), p_approve1, app_reg_name(p_approve1), p_approve2, app_reg_name(p_approve2), p_release, app_reg_name(p_release));
end;
$$;

revoke all on function mb_create(text, text, text, text, text, text, jsonb) from public, anon;
grant execute on function mb_create(text, text, text, text, text, text, jsonb) to authenticated;

-- HR edits it (while it's with HR).
create or replace function mb_save(p_id text, p_check text, p_approve1 text, p_approve2 text, p_release text, p_data jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r maternity_benefits%rowtype;
begin
  if not coalesce(app_is_hr_manager(), false) then
    raise exception 'Only HR can edit a maternity benefit voucher.';
  end if;
  select * into r from maternity_benefits where id = p_id for update;
  if not found then
    raise exception 'Not found.';
  end if;
  if r.status <> 'hr' then
    raise exception 'It was already sent.';
  end if;
  perform app_mb_check(r.employee_id, p_check, p_approve1, p_approve2, p_release, p_data);
  update maternity_benefits
     set data = p_data, net_amount = app_mb_net(p_data),
         check_id = p_check, check_name = app_reg_name(p_check),
         approve1_id = p_approve1, approve1_name = app_reg_name(p_approve1),
         approve2_id = p_approve2, approve2_name = app_reg_name(p_approve2),
         release_id = p_release, release_name = app_reg_name(p_release)
   where id = p_id;
end;
$$;

revoke all on function mb_save(text, text, text, text, text, jsonb) from public, anon;
grant execute on function mb_save(text, text, text, text, text, jsonb) to authenticated;

-- HR signs "Prepared by" and sends it to be checked.
create or replace function mb_send(p_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me text := app_current_employee_id();
  r maternity_benefits%rowtype;
begin
  if me is null or not coalesce(app_is_hr_manager(), false) then
    raise exception 'Only HR can send a maternity benefit voucher.';
  end if;
  select * into r from maternity_benefits where id = p_id for update;
  if not found then
    raise exception 'Not found.';
  end if;
  if r.status <> 'hr' then
    raise exception 'It was already sent.';
  end if;
  if not app_leave_form_file_exists('mb/' || p_id || '/hr.png') then
    raise exception 'Attach your signature first.';
  end if;
  update maternity_benefits
     set status = 'check', hr_id = me, hr_name = app_reg_name(me), hr_at = now(),
         returned_note = null, returned_by = null, returned_at = null
   where id = p_id;
end;
$$;

revoke all on function mb_send(text) from public, anon;
grant execute on function mb_send(text) to authenticated;

-- Whoever's turn it is signs their part; it moves to the next one.
create or replace function mb_sign(p_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me text := app_current_employee_id();
  r maternity_benefits%rowtype;
  who text;
begin
  select * into r from maternity_benefits where id = p_id for update;
  if not found then
    raise exception 'Not found.';
  end if;
  who := case r.status
           when 'check' then r.check_id
           when 'approve1' then r.approve1_id
           when 'approve2' then r.approve2_id
           when 'release' then r.release_id
           when 'receive' then r.employee_id
         end;
  if me is null or who is null or who is distinct from me then
    raise exception 'This voucher isn''t waiting for your signature.';
  end if;
  if not app_leave_form_file_exists('mb/' || p_id || '/' || r.status || '.png') then
    raise exception 'Attach your signature first.';
  end if;
  update maternity_benefits
     set status = case r.status when 'check' then 'approve1' when 'approve1' then 'approve2' when 'approve2' then 'release' when 'release' then 'receive' else 'done' end,
         check_at = case when r.status = 'check' then now() else check_at end,
         approve1_at = case when r.status = 'approve1' then now() else approve1_at end,
         approve2_at = case when r.status = 'approve2' then now() else approve2_at end,
         release_at = case when r.status = 'release' then now() else release_at end,
         receive_at = case when r.status = 'receive' then now() else receive_at end
   where id = p_id;
end;
$$;

revoke all on function mb_sign(text) from public, anon;
grant execute on function mb_sign(text) to authenticated;

-- The one whose turn it is (before the release) sends it back to HR.
create or replace function mb_return(p_id text, p_note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me text := app_current_employee_id();
  r maternity_benefits%rowtype;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  who text;
begin
  select * into r from maternity_benefits where id = p_id for update;
  if not found then
    raise exception 'Not found.';
  end if;
  who := case r.status when 'check' then r.check_id when 'approve1' then r.approve1_id when 'approve2' then r.approve2_id when 'release' then r.release_id end;
  if me is null or who is null or who is distinct from me then
    raise exception 'This voucher isn''t waiting for you.';
  end if;
  if v_note is null or char_length(v_note) > 1000 then
    raise exception 'Say what needs changing (up to 1000 characters).';
  end if;
  update maternity_benefits
     set status = 'hr', returned_note = v_note, returned_by = app_reg_name(me), returned_at = now(),
         hr_at = null, check_at = null, approve1_at = null, approve2_at = null, release_at = null
   where id = p_id;
end;
$$;

revoke all on function mb_return(text, text) from public, anon;
grant execute on function mb_return(text, text) to authenticated;

-- Signatures: mb/<id>/<step>.png, only by the person whose turn it is.
create or replace function app_can_sign_mb(path text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select path ~ '^mb/[^/]+/(hr|check|approve1|approve2|release|receive)\.png$'
    and exists (
      select 1 from maternity_benefits r
       where r.id = split_part(path, '/', 2)
         and split_part(path, '/', 3) = r.status || '.png'
         and case r.status
               when 'hr' then coalesce(app_is_hr_manager(), false)
               when 'check' then r.check_id = app_current_employee_id()
               when 'approve1' then r.approve1_id = app_current_employee_id()
               when 'approve2' then r.approve2_id = app_current_employee_id()
               when 'release' then r.release_id = app_current_employee_id()
               when 'receive' then r.employee_id = app_current_employee_id()
               else false
             end);
$$;

revoke all on function app_can_sign_mb(text) from public, anon;
grant execute on function app_can_sign_mb(text) to authenticated;

create or replace function app_can_read_mb(path text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select path like 'mb/%'
    and exists (select 1 from maternity_benefits r
                 where r.id = split_part(path, '/', 2)
                   and (coalesce(app_is_hr_manager(), false)
                        or (r.status <> 'hr' and app_current_employee_id() in (r.check_id, r.approve1_id, r.approve2_id, r.release_id))
                        or (r.employee_id = app_current_employee_id() and r.status in ('receive', 'done'))));
$$;

revoke all on function app_can_read_mb(text) from public, anon;
grant execute on function app_can_read_mb(text) to authenticated;

drop policy if exists "mb signatures read" on storage.objects;
create policy "mb signatures read" on storage.objects for select to authenticated
  using (bucket_id = 'leave-forms' and app_can_read_mb(name));
drop policy if exists "mb sign" on storage.objects;
create policy "mb sign" on storage.objects for insert to authenticated
  with check (bucket_id = 'leave-forms' and app_can_sign_mb(name));
drop policy if exists "mb re-sign" on storage.objects;
create policy "mb re-sign" on storage.objects for update to authenticated
  using (bucket_id = 'leave-forms' and app_can_sign_mb(name))
  with check (bucket_id = 'leave-forms' and app_can_sign_mb(name));
drop policy if exists "mb files delete hr" on storage.objects;
create policy "mb files delete hr" on storage.objects for delete to authenticated
  using (bucket_id = 'leave-forms' and name like 'mb/%' and app_is_hr_manager());
