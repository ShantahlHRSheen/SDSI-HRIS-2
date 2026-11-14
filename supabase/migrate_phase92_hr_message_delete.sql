-- =============================================================================
-- Phase 92: Messages to/from HR — delete your own sent message.
--
--   * hr_delete_message(id): only the person who sent it. Its text, photo and
--     file are cleared and it shows as "deleted" to both sides (like team
--     chat), and it no longer counts as unread. Returns the photo / file paths so the app removes the files.
--   * The sender may remove their own uploaded photo / file from the two
--     chat buckets (storage owner = them).
--
-- Needs migrate_phase16_hr_messages.sql and migrate_phase45_hr_chat_files.sql.
-- Safe to run any time, and safe to re-run.
-- =============================================================================

alter table hr_messages add column if not exists deleted_at timestamptz;

alter table hr_messages drop constraint if exists hr_messages_body_check;
alter table hr_messages add constraint hr_messages_body_check
  check (char_length(body) <= 2000 and (char_length(btrim(body)) >= 1 or image_path is not null or image_removed_at is not null
    or file_path is not null or file_removed_at is not null or deleted_at is not null));

create or replace function hr_delete_message(p_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me text := app_current_employee_id();
  r hr_messages%rowtype;
begin
  select * into r from hr_messages where id = p_id for update;
  if not found or me is null or r.sender_employee_id is distinct from me or r.deleted_at is not null then
    raise exception 'You can only delete your own messages.';
  end if;
  update hr_messages
     set body = '', image_path = null, file_path = null, file_name = null, deleted_at = now(),
         read_at = coalesce(read_at, now())
   where id = p_id;
  if to_regclass('public.hr_message_reactions') is not null then
    execute 'delete from hr_message_reactions where message_id = $1' using p_id;
  end if;
  return jsonb_build_object('image', r.image_path, 'file', r.file_path);
end;
$$;

revoke all on function hr_delete_message(text) from public, anon;
grant execute on function hr_delete_message(text) to authenticated;

drop policy if exists "hr chat images delete own" on storage.objects;
create policy "hr chat images delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'hr-chat-images' and owner_id = (select auth.uid())::text);
drop policy if exists "hr chat files delete own" on storage.objects;
create policy "hr chat files delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'hr-chat-files' and owner_id = (select auth.uid())::text);
