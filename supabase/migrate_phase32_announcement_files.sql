-- =============================================================================
-- Shantahl HRIS — file attachments on Bulletin Board announcements
--
--   1. announcements.files: the files attached to a post (PDF, Word, Excel,
--      PowerPoint, text, CSV, ZIP), as a JSON list of
--      { "path", "name", "size", "type" }.
--   2. A private Storage bucket "announcement-files" (up to 25 MB a file).
--      Every signed-in employee can download them; the people who can post
--      announcements can upload and remove them.
--
-- Safe to run any time, and safe to re-run.
-- Run once in the SQL Editor (Database > SQL Editor).
-- =============================================================================

alter table announcements add column if not exists files jsonb not null default '[]'::jsonb;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'announcement-files', 'announcement-files', false, 26214400,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain', 'text/csv', 'application/zip', 'application/x-zip-compressed'
  ]
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "announcement files read" on storage.objects;
create policy "announcement files read" on storage.objects for select to authenticated
  using (bucket_id = 'announcement-files');

drop policy if exists "announcement files upload" on storage.objects;
create policy "announcement files upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'announcement-files' and app_can_post_announcements());

drop policy if exists "announcement files delete" on storage.objects;
create policy "announcement files delete" on storage.objects for delete to authenticated
  using (bucket_id = 'announcement-files' and app_can_post_announcements());
