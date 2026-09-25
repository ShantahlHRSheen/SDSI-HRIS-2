-- =============================================================================
-- Shantahl HRIS — private chat between each employee and HR
--
--   * hr_messages: one conversation per employee (employee_id). The
--     employee and HR (hr_admin role) can read and write in it; nobody else
--     can, including other employees, department heads and system admins.
--   * Who sent a message, their name, "from HR or not", the time, and the
--     read status are all set by the database, so nobody can post under
--     someone else's name or fake a timestamp.
--   * Messages can't be edited or deleted from the app. Read status is set
--     only through mark_hr_thread_read().
--   * Text up to 2,000 characters, plus an optional photo. Photos are
--     shrunk in the browser (~200–400 KB) and kept in the private
--     "hr-chat-images" bucket for 30 days: the daily cleanup job
--     (app/api/cron/purge-leave-attachments) deletes older ones and marks
--     their messages image_removed_at, so the chat shows "Photo removed".
--
-- Safe to run any time, and safe to re-run.
--
-- Run once in the SQL Editor (Database > SQL Editor).
-- =============================================================================

create table if not exists hr_messages (
  id text primary key default gen_random_uuid()::text,
  employee_id text not null references employees (id) on delete cascade,
  sender_employee_id text references employees (id) on delete set null,
  sender_name text not null default '',
  from_hr boolean not null default false,
  body text not null default '',
  image_path text,
  image_removed_at timestamptz,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
-- For databases where an earlier version of this file already ran.
alter table hr_messages add column if not exists image_path text;
alter table hr_messages add column if not exists image_removed_at timestamptz;
alter table hr_messages alter column body set default '';
-- A message needs text or a photo (or a photo that has since expired).
alter table hr_messages drop constraint if exists hr_messages_body_check;
alter table hr_messages add constraint hr_messages_body_check
  check (char_length(body) <= 2000 and (char_length(btrim(body)) >= 1 or image_path is not null or image_removed_at is not null));
create index if not exists hr_messages_thread_idx on hr_messages (employee_id, created_at);
create index if not exists hr_messages_unread_idx on hr_messages (employee_id) where read_at is null;

create or replace function app_is_hr_manager()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select app_has_any_role(array['hr_admin']::app_role[]);
$$;

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
  new.image_removed_at := null;
  new.created_at := now();
  new.read_at := null;
  return new;
end;
$$;

drop trigger if exists hr_messages_fill on hr_messages;
create trigger hr_messages_fill
  before insert on hr_messages
  for each row execute function app_fill_hr_message();

alter table hr_messages enable row level security;

drop policy if exists "hr messages read" on hr_messages;
create policy "hr messages read" on hr_messages for select to authenticated
  using (employee_id = app_current_employee_id() or app_is_hr_manager());
drop policy if exists "hr messages send" on hr_messages;
create policy "hr messages send" on hr_messages for insert to authenticated
  with check (employee_id = app_current_employee_id() or app_is_hr_manager());

-- Marks the other side's messages in a conversation as read.
create or replace function mark_hr_thread_read(thread_employee_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me text := app_current_employee_id();
begin
  if thread_employee_id = me then
    update hr_messages set read_at = now()
     where employee_id = thread_employee_id and from_hr and read_at is null;
  elsif app_is_hr_manager() then
    update hr_messages set read_at = now()
     where employee_id = thread_employee_id and not from_hr and read_at is null;
  else
    raise exception 'Not allowed.';
  end if;
end;
$$;

revoke all on function mark_hr_thread_read(text) from public, anon;
grant execute on function mark_hr_thread_read(text) to authenticated;
revoke all on function app_is_hr_manager() from public, anon;
grant execute on function app_is_hr_manager() to authenticated;

-- Chat photos: private bucket, one folder per conversation (employee id).
-- The employee and HR can view and upload in that conversation's folder.
-- Nobody deletes from the app; the cleanup job removes them after 30 days.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('hr-chat-images', 'hr-chat-images', false, 3145728, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "hr chat images read" on storage.objects;
create policy "hr chat images read" on storage.objects for select to authenticated
  using (bucket_id = 'hr-chat-images' and ((storage.foldername(name))[1] = app_current_employee_id() or app_is_hr_manager()));

drop policy if exists "hr chat images upload" on storage.objects;
create policy "hr chat images upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'hr-chat-images' and ((storage.foldername(name))[1] = app_current_employee_id() or app_is_hr_manager()));

-- For the cleanup job only: chat photo files older than the cut-off,
-- including any uploaded without a message (e.g. a send that failed).
create or replace function hr_chat_expired_images(older_than timestamptz)
returns setof text
language sql
stable
security definer
set search_path = public, storage
as $$
  select name from storage.objects
   where bucket_id = 'hr-chat-images' and created_at < older_than
   order by created_at
   limit 1000;
$$;

revoke all on function hr_chat_expired_images(timestamptz) from public, anon, authenticated;
grant execute on function hr_chat_expired_images(timestamptz) to service_role;
