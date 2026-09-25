-- =============================================================================
-- Shantahl HRIS — company documents (the Employee Handbook)
--
--   * A private Storage bucket "company-documents" holding PDFs every
--     signed-in employee may read — currently employee-handbook.pdf.
--   * Only HR (hr_admin) can upload or replace files; nobody else can
--     change or delete them. Not public: links are short-lived and only
--     handed to signed-in employees.
--
-- Safe to run any time, and safe to re-run. Needs phase 16 (app_is_hr_manager).
--
-- Run once in the SQL Editor (Database > SQL Editor).
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('company-documents', 'company-documents', false, 26214400, array['application/pdf'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "company documents read" on storage.objects;
create policy "company documents read" on storage.objects for select to authenticated
  using (bucket_id = 'company-documents');

drop policy if exists "company documents upload" on storage.objects;
create policy "company documents upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'company-documents' and app_is_hr_manager());

-- Replacing a file (upload with upsert) is an update.
drop policy if exists "company documents replace" on storage.objects;
create policy "company documents replace" on storage.objects for update to authenticated
  using (bucket_id = 'company-documents' and app_is_hr_manager())
  with check (bucket_id = 'company-documents' and app_is_hr_manager());
