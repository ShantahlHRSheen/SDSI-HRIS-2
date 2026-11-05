-- =============================================================================
-- Phase 79: guests in meetings (one link for everyone).
--
-- Someone without an HRIS account opens the meeting link, chooses "Join as
-- guest" and types their name. The HRIS server (app/api/meetings/guest)
-- makes a temporary guest login — app_metadata.guest = true — and puts them
-- in the meeting's waiting room. Anyone in the meeting can Admit or Deny.
-- Admitted guests can only use that meeting's live channel (video, audio,
-- screen, hand, reactions). Guest logins are deleted after the meeting.
--
-- "no guests": a restrictive policy on every table in the public schema and
-- on storage, so a guest login can't read or change anything in the HRIS.
-- Tables added later need it too (re-run this file after adding tables).
--
-- Run after phases 73–78. Safe to re-run.
-- =============================================================================

create or replace function app_is_guest()
returns boolean
language sql
stable
as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'guest')::boolean, false);
$$;

grant execute on function app_is_guest() to authenticated, anon;

-- ---- Waiting room -------------------------------------------------------------------

create table if not exists meeting_guests (
  user_id uuid not null, -- the temporary guest login (auth.users)
  meeting_id uuid not null references meetings (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  status text not null default 'waiting' check (status in ('waiting', 'admitted', 'denied', 'left')),
  requested_at timestamptz not null default now(),
  decided_by text references employees (id) on delete set null,
  decided_at timestamptz,
  primary key (user_id, meeting_id)
);

create index if not exists meeting_guests_meeting_idx on meeting_guests (meeting_id);

alter table meeting_guests enable row level security;

-- The guest sees their own request; people in the meeting see its guests.
drop policy if exists "meeting guests read" on meeting_guests;
create policy "meeting guests read" on meeting_guests for select to authenticated
  using (user_id = auth.uid() or (not app_is_guest() and app_is_meeting_participant(meeting_id)));
-- Written by the HRIS server (requests) and the functions below.

create or replace function app_after_meeting_guest()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform realtime.send(jsonb_build_object('op', tg_op, 'guest', jsonb_build_object('userId', new.user_id, 'name', new.name, 'status', new.status)),
                        'guest', 'meeting:' || new.meeting_id, true);
  return new;
end;
$$;

drop trigger if exists meeting_guests_after on meeting_guests;
create trigger meeting_guests_after
  after insert or update on meeting_guests
  for each row execute function app_after_meeting_guest();

-- The guest's own status: waiting / admitted / denied / left, or ended.
create or replace function meeting_guest_status(p_meeting uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case when m.ended_at is not null then 'ended' else g.status end
    from meeting_guests g join meetings m on m.id = g.meeting_id
   where g.meeting_id = p_meeting and g.user_id = auth.uid();
$$;

revoke all on function meeting_guest_status(uuid) from public, anon;
grant execute on function meeting_guest_status(uuid) to authenticated;

-- Admit or deny a guest (anyone in the meeting, not guests).
create or replace function meeting_guest_decide(p_meeting uuid, p_guest uuid, p_admit boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if app_is_guest() or not app_is_meeting_participant(p_meeting) then
    raise exception 'Only people in the meeting can admit guests.';
  end if;
  update meeting_guests
     set status = case when p_admit then 'admitted' else 'denied' end,
         decided_by = app_current_employee_id(),
         decided_at = now()
   where meeting_id = p_meeting and user_id = p_guest and status in ('waiting', 'admitted');
end;
$$;

revoke all on function meeting_guest_decide(uuid, uuid, boolean) from public, anon;
grant execute on function meeting_guest_decide(uuid, uuid, boolean) to authenticated;

-- For the turn-credentials function: an admitted guest of a live meeting.
create or replace function app_is_admitted_guest()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select app_is_guest() and exists (
    select 1 from meeting_guests g join meetings m on m.id = g.meeting_id
     where g.user_id = auth.uid() and g.status = 'admitted' and m.ended_at is null);
$$;

revoke all on function app_is_admitted_guest() from public, anon;
grant execute on function app_is_admitted_guest() to authenticated;

-- ---- Realtime: guests reach only their meeting's channel ----------------------------

create or replace function app_realtime_can(p_topic text, p_write boolean)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  me text;
  part text := split_part(p_topic, ':', 2);
begin
  if app_is_guest() then
    return p_topic like 'meeting:%' and part ~ '^[0-9a-f-]{36}$'
       and exists (select 1 from meeting_guests g join meetings m on m.id = g.meeting_id
                    where g.user_id = auth.uid() and g.meeting_id = part::uuid
                      and g.status = 'admitted' and m.ended_at is null);
  end if;
  me := app_current_employee_id();
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
    return p_write and (
      exists (select 1 from conversation_members a join conversation_members b on a.conversation_id = b.conversation_id
               where a.employee_id = me and b.employee_id = part)
      or exists (select 1 from meeting_participants a join meeting_participants b on a.meeting_id = b.meeting_id
               where a.employee_id = me and b.employee_id = part));
  end if;
  return false;
end;
$$;

-- ---- "no guests": everything else in the HRIS is closed to guest logins ------------

do $$
declare
  t record;
begin
  for t in select tablename, rowsecurity from pg_tables where schemaname = 'public' and tablename <> 'meeting_guests' loop
    if not t.rowsecurity then
      raise notice 'Table % has no Row Level Security; guests are kept out of it by its grants only.', t.tablename;
      continue;
    end if;
    execute format('drop policy if exists "no guests" on public.%I', t.tablename);
    execute format('create policy "no guests" on public.%I as restrictive for all to authenticated using (not app_is_guest()) with check (not app_is_guest())', t.tablename);
  end loop;
end $$;

drop policy if exists "no guests" on storage.objects;
create policy "no guests" on storage.objects as restrictive for all to authenticated
  using (not app_is_guest()) with check (not app_is_guest());
