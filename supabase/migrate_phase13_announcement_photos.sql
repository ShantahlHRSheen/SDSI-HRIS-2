-- =============================================================================
-- Shantahl HRIS — photos on Bulletin Board announcements
--
--   1. announcements.images: the photos attached to a post, as a JSON list
--      of { "path": "<storage path>", "name": "<original file name>" }.
--   2. A private Storage bucket "announcement-images". Every signed-in
--      employee can view the photos; the people who can post announcements
--      can upload and remove them. Photos stay as long as the post does.
--   3. Upper Management can post announcements too — the app has always
--      offered them the "Post announcement" button, but the database only
--      let HR/system admins save.
--
-- Safe to run any time, and safe to re-run.
--
-- Run once in the SQL Editor (Database > SQL Editor).
-- =============================================================================

alter table announcements add column if not exists images jsonb not null default '[]'::jsonb;

create or replace function app_can_post_announcements()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select app_has_any_role(array['hr_admin', 'sys_admin', 'upper_management']::app_role[]);
$$;

drop policy if exists "reference write" on announcements;
create policy "reference write" on announcements for all
  using (app_can_post_announcements()) with check (app_can_post_announcements());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'announcement-images', 'announcement-images', false, 10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'image/gif']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "announcement images read" on storage.objects;
create policy "announcement images read" on storage.objects for select to authenticated
  using (bucket_id = 'announcement-images');

drop policy if exists "announcement images upload" on storage.objects;
create policy "announcement images upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'announcement-images' and app_can_post_announcements());

drop policy if exists "announcement images delete" on storage.objects;
create policy "announcement images delete" on storage.objects for delete to authenticated
  using (bucket_id = 'announcement-images' and app_can_post_announcements());
