-- =============================================================================
-- Shantahl HRIS — discipline notices with employee acknowledgement
--
--   * HR (or the employee's department head) attaches the NTE / sanction PDF
--     to a disciplinary record, optionally asking for a written explanation
--     by a due date.
--   * The employee opens it in "My Notices", signs to acknowledge receipt,
--     and submits a written explanation (typed and/or an attached file).
--     These two steps only go through discipline_acknowledge() and
--     discipline_submit_explanation(), which stamp the time — nobody,
--     HR included, can fill in or change an employee's response directly.
--   * Who sees what: the employee (own records), HR, Upper Management
--     (read-only), and department heads for their own department. Only HR
--     and the department head create or update records.
--   * Files live in the private "discipline-files" bucket, one folder per
--     record: notice-*, ack-* (signature) and explanation-* files.
--
-- Safe to run any time, and safe to re-run.
-- Run once in the SQL Editor (Database > SQL Editor).
-- =============================================================================

alter table disciplinary_records
  add column if not exists notice_path text,
  add column if not exists notice_file_name text,
  add column if not exists requires_explanation boolean not null default false,
  add column if not exists response_due date,
  add column if not exists acknowledged_at timestamptz,
  add column if not exists ack_signature_path text,
  add column if not exists explanation text,
  add column if not exists explanation_file_path text,
  add column if not exists explanation_file_name text,
  add column if not exists explanation_submitted_at timestamptz,
  add column if not exists created_at timestamptz not null default now();

create or replace function app_can_manage_discipline(emp_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select app_has_any_role(array['hr_admin']::app_role[])
      or (app_is_dept_head() and app_employee_in_department(emp_id, app_current_department_id()));
$$;

create or replace function app_can_view_discipline(emp_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select emp_id = app_current_employee_id()
      or app_has_any_role(array['hr_admin', 'upper_management']::app_role[])
      or app_can_manage_discipline(emp_id);
$$;

revoke all on function app_can_manage_discipline(text) from public, anon;
grant execute on function app_can_manage_discipline(text) to authenticated;
revoke all on function app_can_view_discipline(text) from public, anon;
grant execute on function app_can_view_discipline(text) to authenticated;

drop policy if exists "discipline read" on disciplinary_records;
create policy "discipline read" on disciplinary_records for select to authenticated
  using (app_can_view_discipline(employee_id));

drop policy if exists "discipline write elevated" on disciplinary_records;
drop policy if exists "discipline write" on disciplinary_records;
create policy "discipline write" on disciplinary_records for all to authenticated
  using (app_can_manage_discipline(employee_id))
  with check (app_can_manage_discipline(employee_id));

-- The employee's response columns can only be set by the two functions below.
create or replace function app_guard_discipline_response()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(current_setting('app.discipline_response', true), '') = 'on' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.acknowledged_at := null;
    new.ack_signature_path := null;
    new.explanation := null;
    new.explanation_file_path := null;
    new.explanation_file_name := null;
    new.explanation_submitted_at := null;
    return new;
  end if;
  if new.acknowledged_at is distinct from old.acknowledged_at
     or new.ack_signature_path is distinct from old.ack_signature_path
     or new.explanation is distinct from old.explanation
     or new.explanation_file_path is distinct from old.explanation_file_path
     or new.explanation_file_name is distinct from old.explanation_file_name
     or new.explanation_submitted_at is distinct from old.explanation_submitted_at then
    raise exception 'The employee''s acknowledgement and explanation can''t be changed.';
  end if;
  if old.acknowledged_at is not null
     and (new.notice_path is distinct from old.notice_path or new.notice_file_name is distinct from old.notice_file_name) then
    raise exception 'The notice was already acknowledged by the employee, so its file can''t be replaced.';
  end if;
  return new;
end;
$$;

drop trigger if exists disciplinary_records_guard_response on disciplinary_records;
create trigger disciplinary_records_guard_response
  before insert or update on disciplinary_records
  for each row execute function app_guard_discipline_response();

create or replace function discipline_acknowledge(record_id text, signature_path text)
returns disciplinary_records
language plpgsql
security definer
set search_path = public
as $$
declare
  r disciplinary_records;
begin
  select * into r from disciplinary_records where id = record_id for update;
  if r.id is null or r.employee_id is distinct from app_current_employee_id() then
    raise exception 'This notice isn''t addressed to you.';
  end if;
  if r.acknowledged_at is not null then
    raise exception 'You have already acknowledged this notice.';
  end if;
  if signature_path is null or signature_path not like record_id || '/ack-%'
     or not exists (select 1 from storage.objects o where o.bucket_id = 'discipline-files' and o.name = signature_path) then
    raise exception 'Please sign before acknowledging.';
  end if;
  perform set_config('app.discipline_response', 'on', true);
  update disciplinary_records
     set acknowledged_at = now(), ack_signature_path = signature_path
   where id = record_id
  returning * into r;
  perform set_config('app.discipline_response', 'off', true);
  return r;
end;
$$;

create or replace function discipline_submit_explanation(record_id text, body text, file_path text, file_name text)
returns disciplinary_records
language plpgsql
security definer
set search_path = public
as $$
declare
  r disciplinary_records;
  clean_body text := nullif(btrim(coalesce(body, '')), '');
begin
  select * into r from disciplinary_records where id = record_id for update;
  if r.id is null or r.employee_id is distinct from app_current_employee_id() then
    raise exception 'This notice isn''t addressed to you.';
  end if;
  if r.acknowledged_at is null then
    raise exception 'Please acknowledge receipt of the notice first.';
  end if;
  if r.explanation_submitted_at is not null then
    raise exception 'You have already submitted your explanation.';
  end if;
  if clean_body is null and file_path is null then
    raise exception 'Please write your explanation or attach a file.';
  end if;
  if char_length(coalesce(clean_body, '')) > 20000 then
    raise exception 'The explanation is too long (20,000 characters at most).';
  end if;
  if file_path is not null and (
       file_path not like record_id || '/explanation-%'
       or not exists (select 1 from storage.objects o where o.bucket_id = 'discipline-files' and o.name = file_path)
     ) then
    raise exception 'The attached file could not be found — please attach it again.';
  end if;
  perform set_config('app.discipline_response', 'on', true);
  update disciplinary_records
     set explanation = clean_body,
         explanation_file_path = file_path,
         explanation_file_name = case when file_path is null then null else left(coalesce(nullif(btrim(file_name), ''), 'explanation'), 200) end,
         explanation_submitted_at = now()
   where id = record_id
  returning * into r;
  perform set_config('app.discipline_response', 'off', true);
  return r;
end;
$$;

revoke all on function discipline_acknowledge(text, text) from public, anon;
grant execute on function discipline_acknowledge(text, text) to authenticated;
revoke all on function discipline_submit_explanation(text, text, text, text) from public, anon;
grant execute on function discipline_submit_explanation(text, text, text, text) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('discipline-files', 'discipline-files', false, 10485760, array['application/pdf', 'image/jpeg', 'image/png'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "discipline files read" on storage.objects;
create policy "discipline files read" on storage.objects for select to authenticated
  using (
    bucket_id = 'discipline-files'
    and exists (select 1 from disciplinary_records d where d.id = (storage.foldername(name))[1])
  );

drop policy if exists "discipline files upload" on storage.objects;
create policy "discipline files upload" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'discipline-files'
    and exists (
      select 1 from disciplinary_records d
      where d.id = (storage.foldername(name))[1]
        and (
          (storage.filename(name) like 'notice-%' and d.acknowledged_at is null and app_can_manage_discipline(d.employee_id))
          or (storage.filename(name) like 'ack-%' and d.employee_id = app_current_employee_id() and d.acknowledged_at is null)
          or (storage.filename(name) like 'explanation-%' and d.employee_id = app_current_employee_id() and d.explanation_submitted_at is null)
        )
    )
  );

drop policy if exists "discipline files delete" on storage.objects;
create policy "discipline files delete" on storage.objects for delete to authenticated
  using (
    bucket_id = 'discipline-files'
    and storage.filename(name) like 'notice-%'
    and exists (select 1 from disciplinary_records d where d.id = (storage.foldername(name))[1] and d.acknowledged_at is null and app_can_manage_discipline(d.employee_id))
  );
