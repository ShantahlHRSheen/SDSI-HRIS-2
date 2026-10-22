-- Phase 52: the HR Manager and the Department Manager sign to receive the
-- employee's written explanation (in either order), through
-- discipline_receive_explanation(), which stamps the time.
--
-- Safe to run any time, and safe to re-run (after phase 51).

alter table disciplinary_records
  add column if not exists expl_hr_receiver_id text references employees (id) on delete set null,
  add column if not exists expl_hr_received_at timestamptz,
  add column if not exists expl_hr_signature_path text,
  add column if not exists expl_mgr_received_at timestamptz,
  add column if not exists expl_mgr_signature_path text;

-- Signature / receipt columns only change through the functions.
create or replace function app_guard_discipline_signatures()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(current_setting('app.discipline_response', true), '') = 'on' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.expl_hr_receiver_id := null;
    new.expl_hr_received_at := null;
    new.expl_hr_signature_path := null;
    new.expl_mgr_received_at := null;
    new.expl_mgr_signature_path := null;
    return new;
  end if;
  if new.expl_hr_receiver_id is distinct from old.expl_hr_receiver_id
     or new.expl_hr_received_at is distinct from old.expl_hr_received_at
     or new.expl_hr_signature_path is distinct from old.expl_hr_signature_path
     or new.expl_mgr_received_at is distinct from old.expl_mgr_received_at
     or new.expl_mgr_signature_path is distinct from old.expl_mgr_signature_path then
    raise exception 'Receipt of the explanation can only be signed.';
  end if;
  return new;
end;
$$;

drop trigger if exists disciplinary_records_guard_signatures on disciplinary_records;
create trigger disciplinary_records_guard_signatures
  before insert or update on disciplinary_records
  for each row execute function app_guard_discipline_signatures();

create or replace function discipline_receive_explanation(record_id text, signature_path text)
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
  if r.id is null or r.explanation_submitted_at is null then
    raise exception 'There is no written explanation to receive yet.';
  end if;
  if app_is_hr_manager() and r.expl_hr_received_at is null then
    if signature_path is null or signature_path not like record_id || '/hrrecv-%'
       or not exists (select 1 from storage.objects o where o.bucket_id = 'discipline-files' and o.name = signature_path) then
      raise exception 'Please sign before saving.';
    end if;
    perform set_config('app.discipline_response', 'on', true);
    update disciplinary_records set expl_hr_receiver_id = me, expl_hr_received_at = now(), expl_hr_signature_path = signature_path where id = record_id returning * into r;
  elsif r.manager_id is not null and r.manager_id = me and r.expl_mgr_received_at is null then
    if signature_path is null or signature_path not like record_id || '/mgrrecv-%'
       or not exists (select 1 from storage.objects o where o.bucket_id = 'discipline-files' and o.name = signature_path) then
      raise exception 'Please sign before saving.';
    end if;
    perform set_config('app.discipline_response', 'on', true);
    update disciplinary_records set expl_mgr_received_at = now(), expl_mgr_signature_path = signature_path where id = record_id returning * into r;
  else
    raise exception 'You have nothing to sign on this explanation.';
  end if;
  perform set_config('app.discipline_response', 'off', true);
  return r;
end;
$$;

revoke all on function discipline_receive_explanation(text, text) from public, anon;
grant execute on function discipline_receive_explanation(text, text) to authenticated;

drop policy if exists "discipline receipt files upload" on storage.objects;
create policy "discipline receipt files upload" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'discipline-files'
    and exists (
      select 1 from disciplinary_records d
      where d.id = (storage.foldername(name))[1]
        and d.explanation_submitted_at is not null
        and (
          (storage.filename(name) like 'hrrecv-%' and d.expl_hr_received_at is null and app_is_hr_manager())
          or (storage.filename(name) like 'mgrrecv-%' and d.expl_mgr_received_at is null and d.manager_id = app_current_employee_id())
        )
    )
  );
