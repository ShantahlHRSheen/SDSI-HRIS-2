-- Phase 54: the Branch Manager signs (notes) before the Department Manager.
--
--   * Order: HR Manager → Branch Manager (if any, "Noted by") → Department
--     Manager → employee. Notices already waiting for the Department Manager
--     go to the Branch Manager first.
--
-- Safe to run any time, and safe to re-run (after phase 53).

create or replace function discipline_sign(record_id text, signature_path text)
returns disciplinary_records
language plpgsql
security definer
set search_path = public
as $$
declare
  r disciplinary_records;
  me text := app_current_employee_id();
  prefix text;
begin
  select * into r from disciplinary_records where id = record_id for update;
  if r.id is null or not r.sign_flow then
    raise exception 'This notice doesn''t need signatures.';
  end if;
  if r.withdrawn_at is not null then
    raise exception 'This notice was withdrawn.';
  end if;
  prefix := case
    when r.hr_signed_at is null then '/hrsign-'
    when r.branch_manager_id is not null and r.branch_manager_signed_at is null then '/bmsign-'
    when r.manager_signed_at is null then '/mgrsign-'
  end;
  if prefix is null then
    raise exception 'This notice has already been signed.';
  end if;
  if prefix = '/hrsign-' and not app_is_hr_manager() then
    raise exception 'The HR Manager signs this notice first.';
  end if;
  if prefix = '/bmsign-' and r.branch_manager_id is distinct from me then
    raise exception 'Only the Branch Manager named on this notice can sign it now.';
  end if;
  if prefix = '/mgrsign-' and (r.manager_id is null or r.manager_id is distinct from me) then
    raise exception 'Only the Department Manager named on this notice can sign it now.';
  end if;
  if signature_path is null or signature_path not like record_id || prefix || '%'
     or not exists (select 1 from storage.objects o where o.bucket_id = 'discipline-files' and o.name = signature_path) then
    raise exception 'Please sign before saving.';
  end if;
  perform set_config('app.discipline_response', 'on', true);
  if prefix = '/hrsign-' then
    update disciplinary_records set hr_signer_id = me, hr_signed_at = now(), hr_signature_path = signature_path where id = record_id returning * into r;
  elsif prefix = '/mgrsign-' then
    update disciplinary_records set manager_signed_at = now(), manager_signature_path = signature_path where id = record_id returning * into r;
  else
    update disciplinary_records set branch_manager_signed_at = now(), branch_manager_signature_path = signature_path where id = record_id returning * into r;
  end if;
  perform set_config('app.discipline_response', 'off', true);
  return r;
end;
$$;

-- The Branch Manager's signature can be uploaded once HR has signed.
drop policy if exists "discipline branch manager files upload" on storage.objects;
create policy "discipline branch manager files upload" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'discipline-files'
    and storage.filename(name) like 'bmsign-%'
    and exists (
      select 1 from disciplinary_records d
      where d.id = (storage.foldername(name))[1]
        and d.sign_flow and d.hr_signed_at is not null and d.branch_manager_signed_at is null
        and d.branch_manager_id = app_current_employee_id()
    )
  );
