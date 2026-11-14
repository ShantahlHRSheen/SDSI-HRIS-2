-- =============================================================================
-- Phase 90: Extension of Probationary Employment — a notice the employee signs.
--
--   * HR prepares it (pe_create / pe_save) and signs it as the sender
--     (pe_send). It then goes, in order, to:
--   * the Department Head, who signs "Noted by" (pe_note), and
--   * the Chairman, who signs "Approved by" (pe_approve).
--     Either one can return it to HR with a note (pe_return).
--   * The employee then reads it and signs the CONFORME (pe_receive).
--   * Signatures: copies of each one's saved signature in the leave-forms
--     bucket at pe/<id>/<hr|noted|approved|employee>.png.
--   * Seen by HR, the two signers named on it, and the employee once the
--     Chairman has approved it.
--
-- Needs migrate_phase27_leave_forms.sql and migrate_phase69_regularization.sql.
-- Safe to run any time, and safe to re-run.
-- =============================================================================

create table if not exists probation_extensions (
  id text primary key,
  employee_id text not null references employees (id) on delete cascade,
  employee_name text not null default '',
  status text not null default 'hr' check (status in ('hr', 'noted', 'approved', 'employee', 'done')),
  data jsonb not null default '{}'::jsonb,
  created_by text references employees (id) on delete set null,
  created_at timestamptz not null default now(),
  hr_id text references employees (id) on delete set null,
  hr_name text,
  hr_signed_at timestamptz,
  noted_id text references employees (id) on delete set null,
  noted_name text,
  noted_at timestamptz,
  approver_id text references employees (id) on delete set null,
  approver_name text,
  approved_at timestamptz,
  returned_note text,
  returned_by text,
  returned_at timestamptz,
  received_at timestamptz
);

create index if not exists probation_extensions_employee_idx on probation_extensions (employee_id, created_at);

alter table probation_extensions enable row level security;

drop policy if exists "pe read" on probation_extensions;
create policy "pe read" on probation_extensions for select to authenticated
  using (coalesce(app_is_hr_manager(), false)
         or (noted_id is not null and noted_id = app_current_employee_id() and status <> 'hr')
         or (approver_id is not null and approver_id = app_current_employee_id() and status <> 'hr')
         or (employee_id = app_current_employee_id() and status in ('employee', 'done')));
drop policy if exists "pe delete hr" on probation_extensions;
create policy "pe delete hr" on probation_extensions for delete to authenticated
  using (coalesce(app_is_hr_manager(), false) and status <> 'done');
-- No insert / update policies: written through the functions below.

create or replace function app_pe_check(p_employee text, p_noted text, p_approver text, p_data jsonb)
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
  if p_noted is null or not exists (select 1 from employees where id = p_noted) or p_noted = p_employee then
    raise exception 'Choose the Department Head (Noted by).';
  end if;
  if p_approver is null or not exists (select 1 from employees where id = p_approver) or p_approver = p_employee then
    raise exception 'Choose who approves (Approved by).';
  end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' or octet_length(p_data::text) > 30000 then
    raise exception 'The details are missing.';
  end if;
end;
$$;

revoke all on function app_pe_check(text, text, text, jsonb) from public, anon;

-- HR starts one (a draft, status 'hr').
create or replace function pe_create(p_id text, p_employee text, p_noted text, p_approver text, p_data jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me text := app_current_employee_id();
begin
  if me is null or not coalesce(app_is_hr_manager(), false) then
    raise exception 'Only HR can prepare an extension notice.';
  end if;
  if p_id is null or char_length(p_id) not between 1 and 64 then
    raise exception 'Missing id.';
  end if;
  perform app_pe_check(p_employee, p_noted, p_approver, p_data);
  insert into probation_extensions (id, employee_id, employee_name, data, created_by, noted_id, noted_name, approver_id, approver_name)
  values (p_id, p_employee, app_reg_name(p_employee), p_data, me, p_noted, app_reg_name(p_noted), p_approver, app_reg_name(p_approver));
end;
$$;

revoke all on function pe_create(text, text, text, text, jsonb) from public, anon;
grant execute on function pe_create(text, text, text, text, jsonb) to authenticated;

-- HR edits it (while it's with HR).
create or replace function pe_save(p_id text, p_noted text, p_approver text, p_data jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r probation_extensions%rowtype;
begin
  if not coalesce(app_is_hr_manager(), false) then
    raise exception 'Only HR can edit an extension notice.';
  end if;
  select * into r from probation_extensions where id = p_id for update;
  if not found then
    raise exception 'Not found.';
  end if;
  if r.status <> 'hr' then
    raise exception 'It was already sent.';
  end if;
  perform app_pe_check(r.employee_id, p_noted, p_approver, p_data);
  update probation_extensions
     set data = p_data, noted_id = p_noted, noted_name = app_reg_name(p_noted), approver_id = p_approver, approver_name = app_reg_name(p_approver)
   where id = p_id;
end;
$$;

revoke all on function pe_save(text, text, text, jsonb) from public, anon;
grant execute on function pe_save(text, text, text, jsonb) to authenticated;

-- HR signs it and sends it to the Department Head.
create or replace function pe_send(p_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me text := app_current_employee_id();
  r probation_extensions%rowtype;
begin
  if me is null or not coalesce(app_is_hr_manager(), false) then
    raise exception 'Only HR can send an extension notice.';
  end if;
  select * into r from probation_extensions where id = p_id for update;
  if not found then
    raise exception 'Not found.';
  end if;
  if r.status <> 'hr' then
    raise exception 'It was already sent.';
  end if;
  if not app_leave_form_file_exists('pe/' || p_id || '/hr.png') then
    raise exception 'Attach your signature first.';
  end if;
  update probation_extensions
     set status = 'noted', hr_id = me, hr_name = app_reg_name(me), hr_signed_at = now(),
         returned_note = null, returned_by = null, returned_at = null
   where id = p_id;
end;
$$;

revoke all on function pe_send(text) from public, anon;
grant execute on function pe_send(text) to authenticated;

-- The Department Head signs "Noted by".
create or replace function pe_note(p_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me text := app_current_employee_id();
  r probation_extensions%rowtype;
begin
  select * into r from probation_extensions where id = p_id for update;
  if not found then
    raise exception 'Not found.';
  end if;
  if me is null or r.noted_id is distinct from me or r.status <> 'noted' then
    raise exception 'This notice isn''t waiting for your signature.';
  end if;
  if not app_leave_form_file_exists('pe/' || p_id || '/noted.png') then
    raise exception 'Attach your signature first.';
  end if;
  update probation_extensions set status = 'approved', noted_at = now() where id = p_id;
end;
$$;

revoke all on function pe_note(text) from public, anon;
grant execute on function pe_note(text) to authenticated;

-- The Chairman signs "Approved by"; the employee then sees it.
create or replace function pe_approve(p_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me text := app_current_employee_id();
  r probation_extensions%rowtype;
begin
  select * into r from probation_extensions where id = p_id for update;
  if not found then
    raise exception 'Not found.';
  end if;
  if me is null or r.approver_id is distinct from me or r.status <> 'approved' then
    raise exception 'This notice isn''t waiting for your approval.';
  end if;
  if not app_leave_form_file_exists('pe/' || p_id || '/approved.png') then
    raise exception 'Attach your signature first.';
  end if;
  update probation_extensions set status = 'employee', approved_at = now() where id = p_id;
end;
$$;

revoke all on function pe_approve(text) from public, anon;
grant execute on function pe_approve(text) to authenticated;

-- The Department Head or the Chairman sends it back to HR with a note.
create or replace function pe_return(p_id text, p_note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me text := app_current_employee_id();
  r probation_extensions%rowtype;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  select * into r from probation_extensions where id = p_id for update;
  if not found then
    raise exception 'Not found.';
  end if;
  if me is null or not ((r.status = 'noted' and r.noted_id = me) or (r.status = 'approved' and r.approver_id = me)) then
    raise exception 'This notice isn''t waiting for you.';
  end if;
  if v_note is null or char_length(v_note) > 1000 then
    raise exception 'Say what needs changing (up to 1000 characters).';
  end if;
  update probation_extensions
     set status = 'hr', returned_note = v_note, returned_by = app_reg_name(me), returned_at = now(),
         hr_signed_at = null, noted_at = null
   where id = p_id;
end;
$$;

revoke all on function pe_return(text, text) from public, anon;
grant execute on function pe_return(text, text) to authenticated;

-- The employee signs the CONFORME.
create or replace function pe_receive(p_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me text := app_current_employee_id();
  r probation_extensions%rowtype;
begin
  select * into r from probation_extensions where id = p_id for update;
  if not found then
    raise exception 'Not found.';
  end if;
  if me is null or r.employee_id is distinct from me or r.status <> 'employee' then
    raise exception 'This notice isn''t waiting for your signature.';
  end if;
  if not app_leave_form_file_exists('pe/' || p_id || '/employee.png') then
    raise exception 'Attach your signature first.';
  end if;
  update probation_extensions set status = 'done', received_at = now() where id = p_id;
end;
$$;

revoke all on function pe_receive(text) from public, anon;
grant execute on function pe_receive(text) to authenticated;

-- Signatures: pe/<id>/<signer>.png, while that signer's step is open.
create or replace function app_can_sign_pe(path text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select path ~ '^pe/[^/]+/(hr|noted|approved|employee)\.png$'
    and exists (
      select 1 from probation_extensions r
       where r.id = split_part(path, '/', 2)
         and case split_part(path, '/', 3)
               when 'hr.png' then r.status = 'hr' and coalesce(app_is_hr_manager(), false)
               when 'noted.png' then r.status = 'noted' and r.noted_id = app_current_employee_id()
               when 'approved.png' then r.status = 'approved' and r.approver_id = app_current_employee_id()
               when 'employee.png' then r.status = 'employee' and r.employee_id = app_current_employee_id()
               else false
             end);
$$;

revoke all on function app_can_sign_pe(text) from public, anon;
grant execute on function app_can_sign_pe(text) to authenticated;

create or replace function app_can_read_pe(path text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select path like 'pe/%'
    and exists (select 1 from probation_extensions r
                 where r.id = split_part(path, '/', 2)
                   and (coalesce(app_is_hr_manager(), false)
                        or (r.status <> 'hr' and (r.noted_id = app_current_employee_id() or r.approver_id = app_current_employee_id()))
                        or (r.employee_id = app_current_employee_id() and r.status in ('employee', 'done'))));
$$;

revoke all on function app_can_read_pe(text) from public, anon;
grant execute on function app_can_read_pe(text) to authenticated;

drop policy if exists "pe signatures read" on storage.objects;
create policy "pe signatures read" on storage.objects for select to authenticated
  using (bucket_id = 'leave-forms' and app_can_read_pe(name));
drop policy if exists "pe sign" on storage.objects;
create policy "pe sign" on storage.objects for insert to authenticated
  with check (bucket_id = 'leave-forms' and app_can_sign_pe(name));
drop policy if exists "pe re-sign" on storage.objects;
create policy "pe re-sign" on storage.objects for update to authenticated
  using (bucket_id = 'leave-forms' and app_can_sign_pe(name))
  with check (bucket_id = 'leave-forms' and app_can_sign_pe(name));
drop policy if exists "pe files delete hr" on storage.objects;
create policy "pe files delete hr" on storage.objects for delete to authenticated
  using (bucket_id = 'leave-forms' and name like 'pe/%' and app_is_hr_manager());
