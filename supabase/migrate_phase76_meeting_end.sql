-- =============================================================================
-- Phase 76: calls and meetings end cleanly.
--
--   * meeting_leave() ends the meeting when the last person in it leaves
--     (returns true then), so a call nobody hangs up for everyone still ends.
--   * When a meeting started from a chat ends, the chat gets:
--       - a call message: "Call ended · 12 min", or "Missed call" when no one
--         else joined;
--       - a summary of the meeting's notes, action items and decisions, if any.
--
-- Run after phase 73. Safe to re-run.
-- =============================================================================

drop function if exists meeting_leave(uuid);
create function meeting_leave(p_meeting uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update meeting_participants set left_at = now()
   where meeting_id = p_meeting and employee_id = app_current_employee_id() and left_at is null;
  if not found then
    return false;
  end if;
  if not exists (select 1 from meeting_participants
                  where meeting_id = p_meeting and joined_at is not null and left_at is null) then
    update meetings set ended_at = now() where id = p_meeting and ended_at is null;
    if found then
      perform realtime.send(jsonb_build_object('meetingId', p_meeting), 'ended', 'meeting:' || p_meeting, true);
      return true;
    end if;
  end if;
  return false;
end;
$$;

revoke all on function meeting_leave(uuid) from public, anon;
grant execute on function meeting_leave(uuid) to authenticated;

-- The chat's call message and notes summary when a meeting ends.
create or replace function app_after_meeting_end()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  second_join timestamptz;
  secs integer := 0;
  summary text := '';
  decisions text;
  actions text;
  notes text;
begin
  if new.conversation_id is null or old.ended_at is not null or new.ended_at is null then
    return new;
  end if;
  -- The call lasted from when a second person joined.
  select joined_at into second_join from meeting_participants
   where meeting_id = new.id and joined_at is not null
   order by joined_at offset 1 limit 1;
  if second_join is not null then
    secs := greatest(0, extract(epoch from new.ended_at - second_join))::integer;
  end if;
  insert into messages (conversation_id, sender_id, kind, body, meta)
  values (new.conversation_id, new.host_id, 'call', '',
          jsonb_build_object('media', case when new.kind = 'audio' then 'audio' else 'video' end,
                             'durationSec', secs, 'meetingId', new.id, 'missed', second_join is null));

  select coalesce(E'\nDecisions:' || string_agg(E'\n• ' || body, '' order by created_at), '')
    into decisions from meeting_notes where meeting_id = new.id and kind = 'decision';
  select coalesce(E'\nAction items:' || string_agg(E'\n' || case when done then '☑ ' else '☐ ' end || body, '' order by created_at), '')
    into actions from meeting_notes where meeting_id = new.id and kind = 'action';
  select coalesce(E'\nNotes:' || string_agg(E'\n• ' || body, '' order by created_at), '')
    into notes from meeting_notes where meeting_id = new.id and kind = 'note';
  summary := decisions || actions || notes;
  if summary <> '' then
    insert into messages (conversation_id, sender_id, kind, body)
    values (new.conversation_id, new.host_id, 'text', left('📝 Meeting notes — ' || new.title || summary, 8000));
  end if;
  return new;
end;
$$;

drop trigger if exists meetings_after_end on meetings;
create trigger meetings_after_end
  after update of ended_at on meetings
  for each row execute function app_after_meeting_end();
