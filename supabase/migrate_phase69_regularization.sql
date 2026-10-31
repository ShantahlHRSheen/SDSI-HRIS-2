-- =============================================================================
-- Phase 69: Regularization — Regular Contract of Employment and Notice of
-- Regularization and Salary Adjustment.
--
--   * HR prepares it for an employee (reg_create / reg_save: the contract's
--     and the notice's details) and signs the notice, sending it to the
--     Chairman (reg_send).
--   * The Chairman signs the contract for the employer (reg_sign) — or
--     returns it to HR with a note (reg_return).
--   * The employee then receives it: signs the contract and the notice's
--     conforme (reg_receive).
--   * Signatures: copies of each one's saved signature in the leave-forms
--     bucket at reg/<id>/<hr|chairman|employee>.png.
--   * Seen by HR, the Chairman named on it, and the employee once the
--     Chairman has signed.
--
-- Needs migrate_phase27_leave_forms.sql.
-- Safe to run any time, and safe to re-run.
-- =============================================================================

create table if not exists regularizations (
  id text primary key,
  employee_id text not null references employees (id) on delete cascade,
  employee_name text not null default '',
  status text not null default 'hr' check (status in ('hr', 'chairman', 'employee', 'done')),
  data jsonb not null default '{}'::jsonb,
  created_by text references employees (id) on delete set null,
  created_at timestamptz not null default now(),
  hr_id text references employees (id) on delete set null,
  hr_name text,
  hr_signed_at timestamptz,
  signatory_id text references employees (id) on delete set null,
  signatory_name text,
  signed_at timestamptz,
  returned_note text,
  returned_at timestamptz,
  received_at timestamptz
);

create index if not exists regularizations_employee_idx on regularizations (employee_id, created_at);

alter table regularizations enable row level security;

drop policy if exists "reg read" on regularizations;
create policy "reg read" on regularizations for select to authenticated
  using (coalesce(app_is_hr_manager(), false)
         or (signatory_id is not null and signatory_id = app_current_employee_id())
         or (employee_id = app_current_employee_id() and status in ('employee', 'done')));
drop policy if exists "reg delete hr" on regularizations;
create policy "reg delete hr" on regularizations for delete to authenticated
  using (coalesce(app_is_hr_manager(), false) and status <> 'done');
-- No insert / update policies: written through the functions below.

create or replace function app_reg_name(p_id text)
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

revoke all on function app_reg_name(text) from public, anon;

-- HR starts one (a draft, status 'hr').
create or replace function reg_create(p_id text, p_employee text, p_signatory text, p_data jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me text := app_current_employee_id();
begin
  if me is null or not coalesce(app_is_hr_manager(), false) then
    raise exception 'Only HR can prepare a regularization.';
  end if;
  if p_id is null or char_length(p_id) not between 1 and 64 then
    raise exception 'Missing id.';
  end if;
  if not exists (select 1 from employees where id = p_employee) then
    raise exception 'Choose the employee.';
  end if;
  if p_signatory is null or not exists (select 1 from employees where id = p_signatory) or p_signatory = p_employee then
    raise exception 'Choose who signs for the employer.';
  end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' or octet_length(p_data::text) > 20000 then
    raise exception 'The details are missing.';
  end if;
  insert into regularizations (id, employee_id, employee_name, data, created_by, signatory_id, signatory_name)
  values (p_id, p_employee, app_reg_name(p_employee), p_data, me, p_signatory, app_reg_name(p_signatory));
end;
$$;

revoke all on function reg_create(text, text, text, jsonb) from public, anon;
grant execute on function reg_create(text, text, text, jsonb) to authenticated;

-- HR edits the details (while it's with HR).
create or replace function reg_save(p_id text, p_data jsonb, p_signatory text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r regularizations%rowtype;
begin
  if not coalesce(app_is_hr_manager(), false) then
    raise exception 'Only HR can edit a regularization.';
  end if;
  select * into r from regularizations where id = p_id for update;
  if not found then
    raise exception 'Not found.';
  end if;
  if r.status <> 'hr' then
    raise exception 'It was already sent to the Chairman.';
  end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' or octet_length(p_data::text) > 20000 then
    raise exception 'The details are missing.';
  end if;
  if p_signatory is null or not exists (select 1 from employees where id = p_signatory) or p_signatory = r.employee_id then
    raise exception 'Choose who signs for the employer.';
  end if;
  update regularizations set data = p_data, signatory_id = p_signatory, signatory_name = app_reg_name(p_signatory) where id = p_id;
end;
$$;

revoke all on function reg_save(text, jsonb, text) from public, anon;
grant execute on function reg_save(text, jsonb, text) to authenticated;

-- HR signs the notice and sends it to the Chairman.
create or replace function reg_send(p_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me text := app_current_employee_id();
  r regularizations%rowtype;
begin
  if me is null or not coalesce(app_is_hr_manager(), false) then
    raise exception 'Only HR can send a regularization.';
  end if;
  select * into r from regularizations where id = p_id for update;
  if not found then
    raise exception 'Not found.';
  end if;
  if r.status <> 'hr' then
    raise exception 'It was already sent.';
  end if;
  if not app_leave_form_file_exists('reg/' || p_id || '/hr.png') then
    raise exception 'Attach your signature first.';
  end if;
  update regularizations
     set status = 'chairman', hr_id = me, hr_name = app_reg_name(me), hr_signed_at = now(), returned_note = null, returned_at = null
   where id = p_id;
end;
$$;

revoke all on function reg_send(text) from public, anon;
grant execute on function reg_send(text) to authenticated;

-- The Chairman signs the contract for the employer.
create or replace function reg_sign(p_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me text := app_current_employee_id();
  r regularizations%rowtype;
begin
  select * into r from regularizations where id = p_id for update;
  if not found then
    raise exception 'Not found.';
  end if;
  if me is null or r.signatory_id is distinct from me or r.status <> 'chairman' then
    raise exception 'This contract isn''t waiting for your signature.';
  end if;
  if not app_leave_form_file_exists('reg/' || p_id || '/chairman.png') then
    raise exception 'Attach your signature first.';
  end if;
  update regularizations set status = 'employee', signed_at = now() where id = p_id;
end;
$$;

revoke all on function reg_sign(text) from public, anon;
grant execute on function reg_sign(text) to authenticated;

-- The Chairman sends it back to HR with a note.
create or replace function reg_return(p_id text, p_note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me text := app_current_employee_id();
  r regularizations%rowtype;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  select * into r from regularizations where id = p_id for update;
  if not found then
    raise exception 'Not found.';
  end if;
  if me is null or r.signatory_id is distinct from me or r.status <> 'chairman' then
    raise exception 'This contract isn''t waiting for you.';
  end if;
  if v_note is null or char_length(v_note) > 1000 then
    raise exception 'Say what needs changing (up to 1000 characters).';
  end if;
  update regularizations set status = 'hr', returned_note = v_note, returned_at = now(), hr_signed_at = null where id = p_id;
end;
$$;

revoke all on function reg_return(text, text) from public, anon;
grant execute on function reg_return(text, text) to authenticated;

-- The employee receives it: signs the contract and the notice's conforme.
create or replace function reg_receive(p_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me text := app_current_employee_id();
  r regularizations%rowtype;
begin
  select * into r from regularizations where id = p_id for update;
  if not found then
    raise exception 'Not found.';
  end if;
  if me is null or r.employee_id is distinct from me or r.status <> 'employee' then
    raise exception 'This isn''t waiting for you to receive.';
  end if;
  if not app_leave_form_file_exists('reg/' || p_id || '/employee.png') then
    raise exception 'Attach your signature first.';
  end if;
  update regularizations set status = 'done', received_at = now() where id = p_id;
end;
$$;

revoke all on function reg_receive(text) from public, anon;
grant execute on function reg_receive(text) to authenticated;

-- Signatures: reg/<id>/<signer>.png, while that signer's step is open.
create or replace function app_can_sign_reg(path text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select path ~ '^reg/[^/]+/(hr|chairman|employee)\.png$'
    and exists (
      select 1 from regularizations r
       where r.id = split_part(path, '/', 2)
         and case split_part(path, '/', 3)
               when 'hr.png' then r.status = 'hr' and coalesce(app_is_hr_manager(), false)
               when 'chairman.png' then r.status = 'chairman' and r.signatory_id = app_current_employee_id()
               when 'employee.png' then r.status = 'employee' and r.employee_id = app_current_employee_id()
               else false
             end);
$$;

revoke all on function app_can_sign_reg(text) from public, anon;
grant execute on function app_can_sign_reg(text) to authenticated;

create or replace function app_can_read_reg(path text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select path like 'reg/%'
    and exists (select 1 from regularizations r
                 where r.id = split_part(path, '/', 2)
                   and (coalesce(app_is_hr_manager(), false)
                        or r.signatory_id = app_current_employee_id()
                        or (r.employee_id = app_current_employee_id() and r.status in ('employee', 'done'))));
$$;

revoke all on function app_can_read_reg(text) from public, anon;
grant execute on function app_can_read_reg(text) to authenticated;

drop policy if exists "reg signatures read" on storage.objects;
create policy "reg signatures read" on storage.objects for select to authenticated
  using (bucket_id = 'leave-forms' and app_can_read_reg(name));
drop policy if exists "reg sign" on storage.objects;
create policy "reg sign" on storage.objects for insert to authenticated
  with check (bucket_id = 'leave-forms' and app_can_sign_reg(name));
drop policy if exists "reg re-sign" on storage.objects;
create policy "reg re-sign" on storage.objects for update to authenticated
  using (bucket_id = 'leave-forms' and app_can_sign_reg(name))
  with check (bucket_id = 'leave-forms' and app_can_sign_reg(name));
drop policy if exists "reg files delete hr" on storage.objects;
create policy "reg files delete hr" on storage.objects for delete to authenticated
  using (bucket_id = 'leave-forms' and name like 'reg/%' and app_is_hr_manager());
