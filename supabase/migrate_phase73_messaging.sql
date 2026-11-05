-- =============================================================================
-- Phase 73: company Messages and Meetings — database and storage.
--
--   * conversations (direct or group) and conversation_members (with
--     last_read_at). A direct chat is unique per pair (direct_key).
--   * messages: text, system, call and deleted kinds, with attachments.
--   * meetings (code, title, host, optional conversation, started / ended),
--     meeting_participants, meeting_notes (note / action / decision / chat,
--     done), meeting_recordings.
--   * chat_profiles: the photo each employee chooses for chats (not their
--     ID photo).
--   * chat_directory(): the people picker — name, position, department,
--     chat photo of the company's active employees, nothing else.
--   * Row Level Security on every table: an employee sees only the
--     conversations they're in and the meetings they take part in. Writes
--     that change membership go through the functions below.
--   * Realtime: messages are broadcast from the database to private
--     channels; realtime.messages policies authorize the channels —
--     chat:<conversation id>, meeting:<meeting id>, user:<employee id>,
--     company:presence.
--   * Storage: chat-files (attachments, 100 MB) and meeting-recordings
--     (2 GB), both private; chat-avatars (chat photos, 2 MB, any employee
--     of the company can view).
--   * chat_settings.recording_retention_days (60): recordings older than
--     this are deleted by the purge-recordings Edge Function (phase 74
--     schedules it).
--
-- SDSI only. Safe to run any time, and safe to re-run.
-- =============================================================================

-- ---- Helpers ------------------------------------------------------------------------

-- The signed-in employee is an active employee of this company.
create or replace function app_is_company_member()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from employees where user_id = auth.uid() and status in ('active', 'on_leave'));
$$;

revoke all on function app_is_company_member() from public, anon;
grant execute on function app_is_company_member() to authenticated;

-- ---- Chat photos ----------------------------------------------------------------------

create table if not exists chat_profiles (
  employee_id text primary key references employees (id) on delete cascade,
  avatar_path text,
  updated_at timestamptz not null default now()
);

alter table chat_profiles enable row level security;

drop policy if exists "chat profiles read" on chat_profiles;
create policy "chat profiles read" on chat_profiles for select to authenticated
  using (app_is_company_member());
drop policy if exists "chat profiles own" on chat_profiles;
create policy "chat profiles own" on chat_profiles for all to authenticated
  using (employee_id = app_current_employee_id())
  with check (employee_id = app_current_employee_id()
              and (avatar_path is null or avatar_path like employee_id || '/%'));

-- The people picker: the company's active employees, with only what a
-- chat needs.
create or replace function chat_directory()
returns table (id text, first_name text, last_name text, nickname text, position_title text, department text, avatar_path text)
language sql
stable
security definer
set search_path = public
as $$
  select e.id, e.first_name, e.last_name, e.nickname,
         coalesce(p.title, ''), coalesce(d.name, ''), cp.avatar_path
    from employees e
    left join positions p on p.id = e.position_id
    left join departments d on d.id = e.department_id
    left join chat_profiles cp on cp.employee_id = e.id
   where app_is_company_member()
     and e.status in ('active', 'on_leave')
     and e.user_id is not null
   order by e.last_name, e.first_name;
$$;

revoke all on function chat_directory() from public, anon;
grant execute on function chat_directory() to authenticated;

-- ---- Conversations --------------------------------------------------------------------

create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('direct', 'group')),
  name text check (name is null or char_length(btrim(name)) between 1 and 80),
  -- Direct chats: "<smaller employee id>|<larger employee id>" — one per pair.
  direct_key text unique,
  created_by text references employees (id) on delete set null,
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  check ((kind = 'direct') = (direct_key is not null))
);

create table if not exists conversation_members (
  conversation_id uuid not null references conversations (id) on delete cascade,
  employee_id text not null references employees (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  last_read_at timestamptz not null default now(),
  primary key (conversation_id, employee_id)
);

create index if not exists conversation_members_employee_idx on conversation_members (employee_id);

create or replace function app_is_conversation_member(p_conversation uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from conversation_members m
                  where m.conversation_id = p_conversation and m.employee_id = app_current_employee_id());
$$;

revoke all on function app_is_conversation_member(uuid) from public, anon;
grant execute on function app_is_conversation_member(uuid) to authenticated;

alter table conversations enable row level security;
alter table conversation_members enable row level security;

drop policy if exists "conversations read members" on conversations;
create policy "conversations read members" on conversations for select to authenticated
  using (app_is_conversation_member(id));
drop policy if exists "conversation members read" on conversation_members;
create policy "conversation members read" on conversation_members for select to authenticated
  using (app_is_conversation_member(conversation_id));
-- No insert / update / delete policies: written through the functions below.

-- ---- Messages ---------------------------------------------------------------------------

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations (id) on delete cascade,
  sender_id text references employees (id) on delete set null,
  kind text not null default 'text' check (kind in ('text', 'system', 'call', 'deleted')),
  body text not null default '' check (char_length(body) <= 8000),
  -- [{path, name, size, type, width?, height?}] in the chat-files bucket.
  attachments jsonb not null default '[]'::jsonb check (jsonb_typeof(attachments) = 'array' and jsonb_array_length(attachments) <= 10),
  -- Calls: {media: 'audio'|'video', durationSec, meetingId}.
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists messages_conversation_idx on messages (conversation_id, created_at desc);

alter table messages enable row level security;

drop policy if exists "messages read members" on messages;
create policy "messages read members" on messages for select to authenticated
  using (app_is_conversation_member(conversation_id));
-- Members send text and call messages as themselves; their attachments
-- must be in the conversation's folder.
drop policy if exists "messages send" on messages;
create policy "messages send" on messages for insert to authenticated
  with check (
    app_is_conversation_member(conversation_id)
    and sender_id = app_current_employee_id()
    and kind in ('text', 'call')
    and deleted_at is null
    and not exists (select 1 from jsonb_array_elements(attachments) a
                     where coalesce(a ->> 'path', '') not like conversation_id::text || '/%')
  );
-- No update / delete policies: deleting goes through chat_delete_message().

-- New messages keep the conversation's last activity current, and are
-- broadcast to the conversation's channel and each member's own channel
-- (for chat lists and unread badges in other tabs).
create or replace function app_after_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  m record;
  payload jsonb;
begin
  if tg_op = 'INSERT' then
    update conversations set last_message_at = new.created_at where id = new.conversation_id;
  end if;
  payload := jsonb_build_object('op', tg_op, 'message', to_jsonb(new));
  perform realtime.send(payload, 'message', 'chat:' || new.conversation_id, true);
  for m in select employee_id from conversation_members where conversation_id = new.conversation_id loop
    perform realtime.send(jsonb_build_object('op', tg_op, 'conversationId', new.conversation_id, 'messageId', new.id, 'senderId', new.sender_id, 'createdAt', new.created_at),
                          'chat-activity', 'user:' || m.employee_id, true);
  end loop;
  return new;
end;
$$;

drop trigger if exists messages_after on messages;
create trigger messages_after
  after insert or update on messages
  for each row execute function app_after_message();

-- ---- Conversation functions ----------------------------------------------------------

create or replace function app_chat_system_message(p_conversation uuid, p_body text)
returns void
language sql
security definer
set search_path = public
as $$
  insert into messages (conversation_id, sender_id, kind, body) values (p_conversation, app_current_employee_id(), 'system', p_body);
$$;

revoke all on function app_chat_system_message(uuid, text) from public, anon;

create or replace function app_chat_assert_coworker(p_employee text)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from employees where id = p_employee and status in ('active', 'on_leave') and user_id is not null) then
    raise exception 'That employee can''t be messaged.';
  end if;
end;
$$;

revoke all on function app_chat_assert_coworker(text) from public, anon;

-- The direct chat with another employee — created the first time.
create or replace function chat_open_direct(p_other text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me text := app_current_employee_id();
  k text;
  cid uuid;
begin
  if me is null or not app_is_company_member() then
    raise exception 'Sign in with your employee account.';
  end if;
  if p_other is null or p_other = me then
    raise exception 'Choose someone else to message.';
  end if;
  perform app_chat_assert_coworker(p_other);
  k := least(me, p_other) || '|' || greatest(me, p_other);
  select id into cid from conversations where direct_key = k;
  if cid is null then
    insert into conversations (kind, direct_key, created_by) values ('direct', k, me)
    on conflict (direct_key) do nothing
    returning id into cid;
    if cid is null then
      select id into cid from conversations where direct_key = k;
    end if;
    insert into conversation_members (conversation_id, employee_id, role)
    values (cid, me, 'member'), (cid, p_other, 'member')
    on conflict do nothing;
  end if;
  return cid;
end;
$$;

revoke all on function chat_open_direct(text) from public, anon;
grant execute on function chat_open_direct(text) to authenticated;

-- A group chat with a name and its first members (the creator is the owner).
create or replace function chat_create_group(p_name text, p_members text[])
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me text := app_current_employee_id();
  v_name text := nullif(btrim(coalesce(p_name, '')), '');
  cid uuid;
  e text;
begin
  if me is null or not app_is_company_member() then
    raise exception 'Sign in with your employee account.';
  end if;
  if v_name is null or char_length(v_name) > 80 then
    raise exception 'Name the group (up to 80 characters).';
  end if;
  if coalesce(array_length(p_members, 1), 0) = 0 or array_length(p_members, 1) > 200 then
    raise exception 'Add at least one member (up to 200).';
  end if;
  insert into conversations (kind, name, created_by) values ('group', v_name, me) returning id into cid;
  insert into conversation_members (conversation_id, employee_id, role) values (cid, me, 'owner');
  foreach e in array p_members loop
    if e is distinct from me then
      perform app_chat_assert_coworker(e);
      insert into conversation_members (conversation_id, employee_id) values (cid, e) on conflict do nothing;
    end if;
  end loop;
  perform app_chat_system_message(cid, 'created the group "' || v_name || '"');
  return cid;
end;
$$;

revoke all on function chat_create_group(text, text[]) from public, anon;
grant execute on function chat_create_group(text, text[]) to authenticated;

create or replace function app_chat_assert_group_member(p_conversation uuid)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from conversations where id = p_conversation and kind = 'group') then
    raise exception 'Group not found.';
  end if;
  if not app_is_conversation_member(p_conversation) then
    raise exception 'You''re not in this group.';
  end if;
end;
$$;

revoke all on function app_chat_assert_group_member(uuid) from public, anon;

create or replace function chat_rename_group(p_conversation uuid, p_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := nullif(btrim(coalesce(p_name, '')), '');
begin
  perform app_chat_assert_group_member(p_conversation);
  if v_name is null or char_length(v_name) > 80 then
    raise exception 'Name the group (up to 80 characters).';
  end if;
  update conversations set name = v_name where id = p_conversation;
  perform app_chat_system_message(p_conversation, 'renamed the group to "' || v_name || '"');
end;
$$;

revoke all on function chat_rename_group(uuid, text) from public, anon;
grant execute on function chat_rename_group(uuid, text) to authenticated;

-- Any member can add people to a group.
create or replace function chat_add_members(p_conversation uuid, p_members text[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  e text;
  added text[] := '{}';
begin
  perform app_chat_assert_group_member(p_conversation);
  foreach e in array coalesce(p_members, '{}') loop
    perform app_chat_assert_coworker(e);
    insert into conversation_members (conversation_id, employee_id) values (p_conversation, e) on conflict do nothing;
    if found then
      added := added || (select first_name || ' ' || last_name from employees where id = e);
    end if;
  end loop;
  if array_length(added, 1) > 0 then
    perform app_chat_system_message(p_conversation, 'added ' || array_to_string(added, ', '));
  end if;
end;
$$;

revoke all on function chat_add_members(uuid, text[]) from public, anon;
grant execute on function chat_add_members(uuid, text[]) to authenticated;

-- The group's owner removes someone.
create or replace function chat_remove_member(p_conversation uuid, p_employee text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform app_chat_assert_group_member(p_conversation);
  if not exists (select 1 from conversation_members where conversation_id = p_conversation and employee_id = app_current_employee_id() and role = 'owner') then
    raise exception 'Only the group''s owner can remove members.';
  end if;
  if p_employee = app_current_employee_id() then
    raise exception 'Use Leave group to leave.';
  end if;
  delete from conversation_members where conversation_id = p_conversation and employee_id = p_employee;
  if found then
    perform app_chat_system_message(p_conversation, 'removed ' || coalesce((select first_name || ' ' || last_name from employees where id = p_employee), 'a member'));
  end if;
end;
$$;

revoke all on function chat_remove_member(uuid, text) from public, anon;
grant execute on function chat_remove_member(uuid, text) to authenticated;

-- Leave a group; an owner who leaves hands ownership to the longest-standing member.
create or replace function chat_leave_group(p_conversation uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me text := app_current_employee_id();
  was_owner boolean;
begin
  perform app_chat_assert_group_member(p_conversation);
  perform app_chat_system_message(p_conversation, 'left the group');
  select role = 'owner' into was_owner from conversation_members where conversation_id = p_conversation and employee_id = me;
  delete from conversation_members where conversation_id = p_conversation and employee_id = me;
  if was_owner then
    update conversation_members set role = 'owner'
     where conversation_id = p_conversation
       and employee_id = (select employee_id from conversation_members where conversation_id = p_conversation order by joined_at limit 1);
  end if;
end;
$$;

revoke all on function chat_leave_group(uuid) from public, anon;
grant execute on function chat_leave_group(uuid) to authenticated;

create or replace function chat_mark_read(p_conversation uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update conversation_members set last_read_at = now()
   where conversation_id = p_conversation and employee_id = app_current_employee_id();
$$;

revoke all on function chat_mark_read(uuid) from public, anon;
grant execute on function chat_mark_read(uuid) to authenticated;

-- Delete your own message: its text and attachments are cleared (the files
-- are removed by the app), and it shows as deleted.
create or replace function chat_delete_message(p_message uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r messages%rowtype;
begin
  select * into r from messages where id = p_message for update;
  if not found or r.sender_id is distinct from app_current_employee_id() or r.kind not in ('text', 'call') then
    raise exception 'You can only delete your own messages.';
  end if;
  update messages set kind = 'deleted', body = '', attachments = '[]'::jsonb, deleted_at = now() where id = p_message;
  return r.attachments;
end;
$$;

revoke all on function chat_delete_message(uuid) from public, anon;
grant execute on function chat_delete_message(uuid) to authenticated;

-- My conversations with their unread counts and last message, newest first.
create or replace function chat_my_conversations()
returns table (id uuid, kind text, name text, last_message_at timestamptz, unread integer, last_message jsonb, members jsonb)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.kind, c.name, c.last_message_at,
         (select count(*)::int from messages x
           where x.conversation_id = c.id and x.created_at > me.last_read_at
             and x.sender_id is distinct from me.employee_id and x.kind <> 'deleted'),
         (select to_jsonb(l) from (select x.id, x.sender_id, x.kind, x.body, x.attachments, x.created_at
                                     from messages x where x.conversation_id = c.id order by x.created_at desc limit 1) l),
         (select jsonb_agg(jsonb_build_object('employeeId', m.employee_id, 'role', m.role, 'lastReadAt', m.last_read_at) order by m.joined_at)
            from conversation_members m where m.conversation_id = c.id)
    from conversation_members me
    join conversations c on c.id = me.conversation_id
   where me.employee_id = app_current_employee_id()
   order by c.last_message_at desc;
$$;

revoke all on function chat_my_conversations() from public, anon;
grant execute on function chat_my_conversations() to authenticated;

-- ---- Meetings ---------------------------------------------------------------------------

create table if not exists meetings (
  id uuid primary key default gen_random_uuid(),
  -- Shareable code, e.g. "kqx-wmtp-zra".
  code text not null unique default (
    substr(md5(random()::text), 1, 3) || '-' || substr(md5(random()::text), 1, 4) || '-' || substr(md5(random()::text), 1, 3)
  ),
  title text not null default 'Meeting' check (char_length(btrim(title)) between 1 and 120),
  host_id text references employees (id) on delete set null,
  conversation_id uuid references conversations (id) on delete set null,
  -- 'audio' / 'video' calls started from a chat; 'meeting' otherwise.
  kind text not null default 'meeting' check (kind in ('meeting', 'audio', 'video')),
  created_at timestamptz not null default now(),
  started_at timestamptz,
  ended_at timestamptz
);

create index if not exists meetings_conversation_idx on meetings (conversation_id);

create table if not exists meeting_participants (
  meeting_id uuid not null references meetings (id) on delete cascade,
  employee_id text not null references employees (id) on delete cascade,
  role text not null default 'participant' check (role in ('host', 'participant')),
  invited_at timestamptz not null default now(),
  joined_at timestamptz,
  left_at timestamptz,
  primary key (meeting_id, employee_id)
);

create index if not exists meeting_participants_employee_idx on meeting_participants (employee_id);

create table if not exists meeting_notes (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references meetings (id) on delete cascade,
  author_id text references employees (id) on delete set null,
  kind text not null check (kind in ('note', 'action', 'decision', 'chat')),
  body text not null check (char_length(btrim(body)) between 1 and 4000),
  done boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create index if not exists meeting_notes_meeting_idx on meeting_notes (meeting_id, created_at);

create table if not exists meeting_recordings (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references meetings (id) on delete cascade,
  path text not null unique,
  size_bytes bigint not null default 0,
  duration_sec integer not null default 0,
  recorded_by text references employees (id) on delete set null,
  created_at timestamptz not null default now(),
  check (path like meeting_id::text || '/%')
);

create index if not exists meeting_recordings_created_idx on meeting_recordings (created_at);

create or replace function app_is_meeting_participant(p_meeting uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from meeting_participants p
                  where p.meeting_id = p_meeting and p.employee_id = app_current_employee_id());
$$;

revoke all on function app_is_meeting_participant(uuid) from public, anon;
grant execute on function app_is_meeting_participant(uuid) to authenticated;

alter table meetings enable row level security;
alter table meeting_participants enable row level security;
alter table meeting_notes enable row level security;
alter table meeting_recordings enable row level security;

drop policy if exists "meetings read participants" on meetings;
create policy "meetings read participants" on meetings for select to authenticated
  using (app_is_meeting_participant(id));
drop policy if exists "meeting participants read" on meeting_participants;
create policy "meeting participants read" on meeting_participants for select to authenticated
  using (app_is_meeting_participant(meeting_id));

drop policy if exists "meeting notes read" on meeting_notes;
create policy "meeting notes read" on meeting_notes for select to authenticated
  using (app_is_meeting_participant(meeting_id));
drop policy if exists "meeting notes add" on meeting_notes;
create policy "meeting notes add" on meeting_notes for insert to authenticated
  with check (app_is_meeting_participant(meeting_id) and author_id = app_current_employee_id());
-- Anyone in the meeting can tick an action item or edit a note.
drop policy if exists "meeting notes edit" on meeting_notes;
create policy "meeting notes edit" on meeting_notes for update to authenticated
  using (app_is_meeting_participant(meeting_id))
  with check (app_is_meeting_participant(meeting_id));
drop policy if exists "meeting notes delete" on meeting_notes;
create policy "meeting notes delete" on meeting_notes for delete to authenticated
  using (author_id = app_current_employee_id()
         or exists (select 1 from meetings m where m.id = meeting_id and m.host_id = app_current_employee_id()));

drop policy if exists "meeting recordings read" on meeting_recordings;
create policy "meeting recordings read" on meeting_recordings for select to authenticated
  using (app_is_meeting_participant(meeting_id));
drop policy if exists "meeting recordings add" on meeting_recordings;
create policy "meeting recordings add" on meeting_recordings for insert to authenticated
  with check (app_is_meeting_participant(meeting_id) and recorded_by = app_current_employee_id());

-- Notes are broadcast to the meeting's channel as they change.
create or replace function app_after_meeting_note()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform realtime.send(jsonb_build_object('op', tg_op, 'note', to_jsonb(coalesce(new, old))), 'note', 'meeting:' || coalesce(new.meeting_id, old.meeting_id), true);
  return coalesce(new, old);
end;
$$;

drop trigger if exists meeting_notes_after on meeting_notes;
create trigger meeting_notes_after
  after insert or update or delete on meeting_notes
  for each row execute function app_after_meeting_note();

-- Start a meeting: a stand-alone one, or a call in a chat (its members are
-- invited). Returns {id, code}.
create or replace function meeting_create(p_title text, p_conversation uuid, p_kind text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  me text := app_current_employee_id();
  mid uuid;
  v_code text;
begin
  if me is null or not app_is_company_member() then
    raise exception 'Sign in with your employee account.';
  end if;
  if coalesce(p_kind, 'meeting') not in ('meeting', 'audio', 'video') then
    raise exception 'Unknown meeting kind.';
  end if;
  if p_conversation is not null and not app_is_conversation_member(p_conversation) then
    raise exception 'You''re not in this chat.';
  end if;
  insert into meetings (title, host_id, conversation_id, kind, started_at)
  values (coalesce(nullif(btrim(coalesce(p_title, '')), ''), case when p_kind = 'meeting' then 'Meeting' else 'Call' end), me, p_conversation, coalesce(p_kind, 'meeting'), now())
  returning id, code into mid, v_code;
  insert into meeting_participants (meeting_id, employee_id, role, joined_at) values (mid, me, 'host', now());
  if p_conversation is not null then
    insert into meeting_participants (meeting_id, employee_id)
    select mid, employee_id from conversation_members where conversation_id = p_conversation and employee_id <> me
    on conflict do nothing;
  end if;
  return jsonb_build_object('id', mid, 'code', v_code);
end;
$$;

revoke all on function meeting_create(text, uuid, text) from public, anon;
grant execute on function meeting_create(text, uuid, text) to authenticated;

-- Join with a code (any employee of the company who has it). Returns the meeting id.
create or replace function meeting_join(p_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me text := app_current_employee_id();
  m meetings%rowtype;
begin
  if me is null or not app_is_company_member() then
    raise exception 'Sign in with your employee account.';
  end if;
  select * into m from meetings where code = lower(btrim(coalesce(p_code, '')));
  if not found then
    raise exception 'No meeting has that code.';
  end if;
  if m.ended_at is not null then
    raise exception 'That meeting has ended.';
  end if;
  insert into meeting_participants (meeting_id, employee_id, joined_at) values (m.id, me, now())
  on conflict (meeting_id, employee_id) do update set joined_at = coalesce(meeting_participants.joined_at, now()), left_at = null;
  return m.id;
end;
$$;

revoke all on function meeting_join(text) from public, anon;
grant execute on function meeting_join(text) to authenticated;

create or replace function meeting_leave(p_meeting uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update meeting_participants set left_at = now()
   where meeting_id = p_meeting and employee_id = app_current_employee_id();
$$;

revoke all on function meeting_leave(uuid) from public, anon;
grant execute on function meeting_leave(uuid) to authenticated;

-- The host ends the meeting for everyone.
create or replace function meeting_end(p_meeting uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from meetings where id = p_meeting and host_id = app_current_employee_id()) then
    raise exception 'Only the host can end the meeting for everyone.';
  end if;
  update meetings set ended_at = coalesce(ended_at, now()) where id = p_meeting;
  update meeting_participants set left_at = coalesce(left_at, now()) where meeting_id = p_meeting;
  perform realtime.send(jsonb_build_object('meetingId', p_meeting), 'ended', 'meeting:' || p_meeting, true);
end;
$$;

revoke all on function meeting_end(uuid) from public, anon;
grant execute on function meeting_end(uuid) to authenticated;

-- ---- Realtime: private channels -------------------------------------------------------
--   chat:<conversation id>  members (messages, typing)
--   meeting:<meeting id>    participants (signaling, presence, notes, reactions)
--   user:<employee id>      that employee reads; co-members of a chat may send
--                           (incoming calls, chat activity)
--   company:presence        any employee (who's online)

create or replace function app_realtime_can(p_topic text, p_write boolean)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  me text := app_current_employee_id();
  part text := split_part(p_topic, ':', 2);
begin
  if me is null or not app_is_company_member() then
    return false;
  end if;
  if p_topic = 'company:presence' then
    return true;
  elsif p_topic like 'chat:%' then
    return part ~ '^[0-9a-f-]{36}$' and app_is_conversation_member(part::uuid);
  elsif p_topic like 'meeting:%' then
    return part ~ '^[0-9a-f-]{36}$' and app_is_meeting_participant(part::uuid);
  elsif p_topic like 'user:%' then
    if part = me then
      return true;
    end if;
    -- Others may only send (e.g. ring), and only someone they share a chat or meeting with.
    return p_write and (
      exists (select 1 from conversation_members a join conversation_members b on a.conversation_id = b.conversation_id
               where a.employee_id = me and b.employee_id = part)
      or exists (select 1 from meeting_participants a join meeting_participants b on a.meeting_id = b.meeting_id
               where a.employee_id = me and b.employee_id = part));
  end if;
  return false;
end;
$$;

revoke all on function app_realtime_can(text, boolean) from public, anon;
grant execute on function app_realtime_can(text, boolean) to authenticated;

drop policy if exists "hris realtime receive" on realtime.messages;
create policy "hris realtime receive" on realtime.messages for select to authenticated
  using (realtime.messages.extension in ('broadcast', 'presence') and app_realtime_can(realtime.topic(), false));
drop policy if exists "hris realtime send" on realtime.messages;
create policy "hris realtime send" on realtime.messages for insert to authenticated
  with check (realtime.messages.extension in ('broadcast', 'presence') and app_realtime_can(realtime.topic(), true));

-- ---- Settings ---------------------------------------------------------------------------

create table if not exists chat_settings (
  id boolean primary key default true check (id),
  -- Recordings older than this many days are deleted (purge-recordings).
  -- Change with: update chat_settings set recording_retention_days = 90;
  recording_retention_days integer not null default 60 check (recording_retention_days between 1 and 3650)
);
insert into chat_settings (id) values (true) on conflict do nothing;

alter table chat_settings enable row level security;
drop policy if exists "chat settings read" on chat_settings;
create policy "chat settings read" on chat_settings for select to authenticated
  using (app_is_company_member());

-- ---- Storage --------------------------------------------------------------------------
--   chat-files          <conversation id>/<file>       100 MB
--   meeting-recordings  <meeting id>/<file>            2 GB
--   chat-avatars        <employee id>/<file>           2 MB, images

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chat-files', 'chat-files', false, 104857600, null)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('meeting-recordings', 'meeting-recordings', false, 2147483648, array['video/webm', 'video/mp4', 'audio/webm'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chat-avatars', 'chat-avatars', false, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- First folder of a path as a uuid, or null.
create or replace function app_storage_uuid(p_name text)
returns uuid
language sql
immutable
as $$
  select case when split_part(p_name, '/', 1) ~ '^[0-9a-f-]{36}$' then split_part(p_name, '/', 1)::uuid end;
$$;

drop policy if exists "chat files read" on storage.objects;
create policy "chat files read" on storage.objects for select to authenticated
  using (bucket_id = 'chat-files' and app_is_conversation_member(app_storage_uuid(name)));
drop policy if exists "chat files upload" on storage.objects;
create policy "chat files upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'chat-files' and app_is_conversation_member(app_storage_uuid(name)));
drop policy if exists "chat files delete own" on storage.objects;
create policy "chat files delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'chat-files' and owner_id = auth.uid()::text);

drop policy if exists "meeting recordings read" on storage.objects;
create policy "meeting recordings read" on storage.objects for select to authenticated
  using (bucket_id = 'meeting-recordings' and app_is_meeting_participant(app_storage_uuid(name)));
drop policy if exists "meeting recordings upload" on storage.objects;
create policy "meeting recordings upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'meeting-recordings' and app_is_meeting_participant(app_storage_uuid(name)));
-- Resumable (TUS) uploads update the object as they go.
drop policy if exists "meeting recordings upload resume" on storage.objects;
create policy "meeting recordings upload resume" on storage.objects for update to authenticated
  using (bucket_id = 'meeting-recordings' and owner_id = auth.uid()::text)
  with check (bucket_id = 'meeting-recordings' and app_is_meeting_participant(app_storage_uuid(name)));

drop policy if exists "chat avatars read" on storage.objects;
create policy "chat avatars read" on storage.objects for select to authenticated
  using (bucket_id = 'chat-avatars' and app_is_company_member());
drop policy if exists "chat avatars write own" on storage.objects;
create policy "chat avatars write own" on storage.objects for insert to authenticated
  with check (bucket_id = 'chat-avatars' and split_part(name, '/', 1) = app_current_employee_id());
drop policy if exists "chat avatars update own" on storage.objects;
create policy "chat avatars update own" on storage.objects for update to authenticated
  using (bucket_id = 'chat-avatars' and split_part(name, '/', 1) = app_current_employee_id())
  with check (bucket_id = 'chat-avatars' and split_part(name, '/', 1) = app_current_employee_id());
drop policy if exists "chat avatars delete own" on storage.objects;
create policy "chat avatars delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'chat-avatars' and split_part(name, '/', 1) = app_current_employee_id());
