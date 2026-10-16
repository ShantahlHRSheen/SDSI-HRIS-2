-- =============================================================================
-- Shantahl HRIS — files in Chat with HR
--
--   hr_messages.file_path / file_name: a document sent in the chat (Excel,
--   Word, PDF, PowerPoint, text/CSV or ZIP, up to 10 MB), stored in the
--   private "hr-chat-files" bucket in the conversation's folder, like
--   photos. The daily cleanup job removes files after 30 days and sets
--   file_removed_at, so the chat shows "File removed".
--
-- Safe to run any time, and safe to re-run.
-- Run once in the SQL Editor (Database > SQL Editor).
-- =============================================================================

alter table hr_messages add column if not exists file_path text;
alter table hr_messages add column if not exists file_name text;
alter table hr_messages add column if not exists file_removed_at timestamptz;

alter table hr_messages drop constraint if exists hr_messages_body_check;
alter table hr_messages add constraint hr_messages_body_check
  check (char_length(body) <= 2000 and (char_length(btrim(body)) >= 1 or image_path is not null or image_removed_at is not null
    or file_path is not null or file_removed_at is not null));

create or replace function app_fill_hr_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.sender_employee_id := app_current_employee_id();
  new.from_hr := app_is_hr_manager() and new.employee_id is distinct from new.sender_employee_id;
  select trim(both ' ' from coalesce(e.first_name, '') || ' ' || coalesce(e.last_name, ''))
    into new.sender_name
    from employees e where e.id = new.sender_employee_id;
  new.sender_name := coalesce(new.sender_name, '');
  if new.image_path is not null and split_part(new.image_path, '/', 1) is distinct from new.employee_id then
    raise exception 'Photo does not belong to this conversation.';
  end if;
  if new.file_path is not null and split_part(new.file_path, '/', 1) is distinct from new.employee_id then
    raise exception 'File does not belong to this conversation.';
  end if;
  new.file_name := case when new.file_path is null then null else left(coalesce(nullif(btrim(new.file_name), ''), 'file'), 200) end;
  new.image_removed_at := null;
  new.file_removed_at := null;
  new.created_at := now();
  new.read_at := null;
  return new;
end;
$$;

-- Chat files: private bucket, one folder per conversation (employee id).
-- The employee and HR can view and upload in that conversation's folder.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('hr-chat-files', 'hr-chat-files', false, 10485760, null)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "hr chat files read" on storage.objects;
create policy "hr chat files read" on storage.objects for select to authenticated
  using (bucket_id = 'hr-chat-files' and ((storage.foldername(name))[1] = app_current_employee_id() or app_is_hr_manager()));

drop policy if exists "hr chat files upload" on storage.objects;
create policy "hr chat files upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'hr-chat-files' and ((storage.foldername(name))[1] = app_current_employee_id() or app_is_hr_manager()));

-- For the cleanup job only: chat files older than the cut-off.
create or replace function hr_chat_expired_files(older_than timestamptz)
returns setof text
language sql
stable
security definer
set search_path = public, storage
as $$
  select name from storage.objects
   where bucket_id = 'hr-chat-files' and created_at < older_than
   order by created_at
   limit 1000;
$$;

revoke all on function hr_chat_expired_files(timestamptz) from public, anon, authenticated;
grant execute on function hr_chat_expired_files(timestamptz) to service_role;
