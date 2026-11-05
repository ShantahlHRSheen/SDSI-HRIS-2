-- =============================================================================
-- Phase 78: inviting people into a meeting.
--
-- Anyone in a meeting that hasn't ended can invite co-workers: they're added
-- to the meeting (not joined yet), so they see it under Meetings → Happening
-- now, can join, and can be rung on their own channel. Returns how many were
-- newly invited.
--
-- Run after phase 73. Safe to re-run.
-- =============================================================================

create or replace function meeting_invite(p_meeting uuid, p_members text[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  e text;
  added integer := 0;
begin
  if not app_is_meeting_participant(p_meeting) then
    raise exception 'You''re not in this meeting.';
  end if;
  if exists (select 1 from meetings where id = p_meeting and ended_at is not null) then
    raise exception 'That meeting has ended.';
  end if;
  if coalesce(array_length(p_members, 1), 0) > 100 then
    raise exception 'Invite up to 100 people at a time.';
  end if;
  foreach e in array coalesce(p_members, '{}') loop
    perform app_chat_assert_coworker(e);
    insert into meeting_participants (meeting_id, employee_id) values (p_meeting, e) on conflict do nothing;
    if found then
      added := added + 1;
    end if;
  end loop;
  return added;
end;
$$;

revoke all on function meeting_invite(uuid, text[]) from public, anon;
grant execute on function meeting_invite(uuid, text[]) to authenticated;
