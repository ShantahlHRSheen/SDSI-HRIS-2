-- Phase 51: notices signed HR Manager → Department Manager → employee.
--
--   * A record with sign_flow (the generated Tardiness NTEs) is signed first
--     by the HR Manager, then by its Department Manager (manager_id), and only
--     then reaches the employee, who signs it as received.
--   * Signatures only go through discipline_sign(), which stamps the time;
--     the employee doesn't see the record until both have signed.
--   * notice_data: what the notice was generated from, so it can be printed
--     with the signatures on it.
--
-- Safe to run any time, and safe to re-run.

alter table disciplinary_records
  add column if not exists sign_flow boolean not null default false,
  add column if not exists notice_data jsonb,
  add column if not exists manager_id text references employees (id) on delete set null,
  add column if not exists hr_signer_id text references employees (id) on delete set null,
  add column if not exists hr_signed_at timestamptz,
  add column if not exists hr_signature_path text,
  add column if not exists manager_signed_at timestamptz,
  add column if not exists manager_signature_path text;

-- Read: as before, but the employee only once both have signed; and the
-- Department Manager of a record they sign.
drop policy if exists "discipline read" on disciplinary_records;
create policy "discipline read" on disciplinary_records for select to authenticated
  using (
    (app_can_view_discipline(employee_id)
      and (employee_id is distinct from app_current_employee_id() or not sign_flow or manager_signed_at is not null))
    or (manager_id is not null and manager_id = app_current_employee_id())
  );

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
    new.hr_signer_id := null;
    new.hr_signed_at := null;
    new.hr_signature_path := null;
    new.manager_signed_at := null;
    new.manager_signature_path := null;
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
  if new.hr_signer_id is distinct from old.hr_signer_id
     or new.hr_signed_at is distinct from old.hr_signed_at
     or new.hr_signature_path is distinct from old.hr_signature_path
     or new.manager_signed_at is distinct from old.manager_signed_at
     or new.manager_signature_path is distinct from old.manager_signature_path then
    raise exception 'Signatures can only be added by signing.';
  end if;
  if old.hr_signed_at is not null
     and (new.sign_flow is distinct from old.sign_flow or new.notice_data is distinct from old.notice_data or new.employee_id is distinct from old.employee_id) then
    raise exception 'The notice was already signed, so it can''t be changed.';
  end if;
  if old.manager_signed_at is not null and new.manager_id is distinct from old.manager_id then
    raise exception 'The Department Manager already signed.';
  end if;
  if old.acknowledged_at is not null
     and (new.notice_path is distinct from old.notice_path or new.notice_file_name is distinct from old.notice_file_name) then
    raise exception 'The notice was already acknowledged by the employee, so its file can''t be replaced.';
  end if;
  return new;
end;
$$;

-- HR Manager first, then the Department Manager.
create or replace function discipline_sign(record_id text, signature_path text)
returns disciplinary_records
language plpgsql
security definer
set search_path = public
as $$
declare
  r disciplinary_records;
  me text := app_current_employee_id();
begin
  select * into r from disciplinary_records where id = record_id for update;
  if r.id is null or not r.sign_flow then
    raise exception 'This notice doesn''t need signatures.';
  end if;
  if r.hr_signed_at is null then
    if not app_is_hr_manager() then
      raise exception 'The HR Manager signs this notice first.';
    end if;
    if signature_path is null or signature_path not like record_id || '/hrsign-%'
       or not exists (select 1 from storage.objects o where o.bucket_id = 'discipline-files' and o.name = signature_path) then
      raise exception 'Please sign before saving.';
    end if;
    perform set_config('app.discipline_response', 'on', true);
    update disciplinary_records set hr_signer_id = me, hr_signed_at = now(), hr_signature_path = signature_path where id = record_id returning * into r;
  elsif r.manager_signed_at is null then
    if r.manager_id is null or r.manager_id is distinct from me then
      raise exception 'Only the Department Manager named on this notice can sign it now.';
    end if;
    if signature_path is null or signature_path not like record_id || '/mgrsign-%'
       or not exists (select 1 from storage.objects o where o.bucket_id = 'discipline-files' and o.name = signature_path) then
      raise exception 'Please sign before saving.';
    end if;
    perform set_config('app.discipline_response', 'on', true);
    update disciplinary_records set manager_signed_at = now(), manager_signature_path = signature_path where id = record_id returning * into r;
  else
    raise exception 'This notice has already been signed.';
  end if;
  perform set_config('app.discipline_response', 'off', true);
  return r;
end;
$$;

revoke all on function discipline_sign(text, text) from public, anon;
grant execute on function discipline_sign(text, text) to authenticated;

-- The employee acknowledges only once both have signed.
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
  if r.sign_flow and r.manager_signed_at is null then
    raise exception 'This notice isn''t signed yet.';
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
          or (storage.filename(name) like 'hrsign-%' and d.sign_flow and d.hr_signed_at is null and app_is_hr_manager())
          or (storage.filename(name) like 'mgrsign-%' and d.sign_flow and d.hr_signed_at is not null and d.manager_signed_at is null and d.manager_id = app_current_employee_id())
        )
    )
  );

-- Tardiness NTEs given before the HRIS (paper notices): how many offenses
-- each employee already had, counted with the HRIS's own tardiness NTEs for
-- the next one's offense number. HR only.
create table if not exists tardiness_prior_offenses (
  employee_id text primary key references employees (id) on delete cascade,
  offenses integer not null check (offenses >= 0),
  note text not null default '',
  updated_at timestamptz not null default now()
);

alter table tardiness_prior_offenses enable row level security;

drop policy if exists "tardiness prior offenses hr" on tardiness_prior_offenses;
create policy "tardiness prior offenses hr" on tardiness_prior_offenses for all to authenticated
  using (app_has_any_role(array['hr_admin']::app_role[]))
  with check (app_has_any_role(array['hr_admin']::app_role[]));
