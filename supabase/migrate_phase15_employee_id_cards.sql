-- =============================================================================
-- Shantahl HRIS — employee ID cards
--
-- The ID card itself is drawn by the app from the employee record (nothing
-- stored per card). This adds only what the record doesn't have yet:
--
--   1. employees.id_photo_path / id_signature_path — the employee's photo and
--      signature, stored in a private "employee-id-media" bucket at
--      "<employee id>/photo-<timestamp>.jpg" / "<employee id>/signature-….png".
--      Both are compressed in the browser first (~50 KB photo, ~15 KB
--      signature); a replacement deletes the previous file.
--   2. Employees can set their OWN photo, signature and emergency contact
--      (name + number) through two narrow functions — they still can't edit
--      anything else on their record. HR can do the same for anyone.
--   3. Only the employee and HR/system admins can see an employee's photo and
--      signature files.
--
-- Safe to run any time, and safe to re-run.
--
-- Run once in the SQL Editor (Database > SQL Editor).
-- =============================================================================

alter table employees add column if not exists id_photo_path text;
alter table employees add column if not exists id_signature_path text;

-- Set (or clear, with null) an employee's ID photo or signature.
create or replace function set_employee_id_media(emp_id text, kind text, path text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if emp_id is distinct from app_current_employee_id() and not app_is_hr_or_admin() then
    raise exception 'You can only change your own ID photo and signature.';
  end if;
  if path is not null and split_part(path, '/', 1) <> emp_id then
    raise exception 'File does not belong to this employee.';
  end if;
  if kind = 'photo' then
    update employees set id_photo_path = path where id = emp_id;
  elsif kind = 'signature' then
    update employees set id_signature_path = path where id = emp_id;
  else
    raise exception 'Unknown kind: %', kind;
  end if;
end;
$$;

-- Update an employee's emergency contact (name + number).
create or replace function set_employee_emergency_contact(emp_id text, contact_name text, contact_phone text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if emp_id is distinct from app_current_employee_id() and not app_is_hr_or_admin() then
    raise exception 'You can only change your own emergency contact.';
  end if;
  update employees
     set emergency_contact_name = nullif(btrim(contact_name), ''),
         emergency_contact_phone = nullif(btrim(contact_phone), '')
   where id = emp_id;
end;
$$;

revoke all on function set_employee_id_media(text, text, text) from public, anon;
revoke all on function set_employee_emergency_contact(text, text, text) from public, anon;
grant execute on function set_employee_id_media(text, text, text) to authenticated;
grant execute on function set_employee_emergency_contact(text, text, text) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('employee-id-media', 'employee-id-media', false, 1048576, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "id media read" on storage.objects;
create policy "id media read" on storage.objects for select to authenticated
  using (bucket_id = 'employee-id-media' and ((storage.foldername(name))[1] = app_current_employee_id() or app_is_hr_or_admin()));

drop policy if exists "id media upload" on storage.objects;
create policy "id media upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'employee-id-media' and ((storage.foldername(name))[1] = app_current_employee_id() or app_is_hr_or_admin()));

drop policy if exists "id media delete" on storage.objects;
create policy "id media delete" on storage.objects for delete to authenticated
  using (bucket_id = 'employee-id-media' and ((storage.foldername(name))[1] = app_current_employee_id() or app_is_hr_or_admin()));
