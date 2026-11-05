-- =============================================================================
-- Phase 80: HR's call and meeting log.
--
-- HR (and only HR) can list every call and meeting in a date range: type,
-- title or group name, host, who joined, guests, duration (or missed), and
-- whether it was recorded. No content: not messages, notes, meeting chat or
-- recordings.
--
-- Run after phase 79. Safe to re-run.
-- =============================================================================

create or replace function hr_meeting_log(p_from timestamptz, p_to timestamptz)
returns table (
  id uuid,
  kind text,
  title text,
  chat_kind text,
  chat_name text,
  host_id text,
  started_at timestamptz,
  ended_at timestamptz,
  duration_sec integer,
  joined jsonb,
  invited integer,
  guests jsonb,
  recorded boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select m.id, m.kind, m.title, c.kind, c.name, m.host_id,
         coalesce(m.started_at, m.created_at), m.ended_at,
         case
           when m.ended_at is null then null
           when m.kind = 'meeting' then greatest(0, extract(epoch from m.ended_at - coalesce(m.started_at, m.created_at)))::integer
           else coalesce(greatest(0, extract(epoch from m.ended_at - (select p.joined_at from meeting_participants p
                                                                       where p.meeting_id = m.id and p.joined_at is not null
                                                                       order by p.joined_at offset 1 limit 1)))::integer, 0)
         end,
         coalesce((select jsonb_agg(jsonb_build_object('employeeId', p.employee_id, 'joinedAt', p.joined_at, 'leftAt', p.left_at) order by p.joined_at)
                     from meeting_participants p where p.meeting_id = m.id and p.joined_at is not null), '[]'::jsonb),
         (select count(*)::int from meeting_participants p where p.meeting_id = m.id),
         coalesce((select jsonb_agg(g.name order by g.requested_at) from meeting_guests g
                    where g.meeting_id = m.id and g.status in ('admitted', 'left') and g.decided_at is not null), '[]'::jsonb),
         exists (select 1 from meeting_recordings r where r.meeting_id = m.id)
    from meetings m
    left join conversations c on c.id = m.conversation_id
   where coalesce(app_is_hr_manager(), false)
     and not app_is_guest()
     and coalesce(m.started_at, m.created_at) >= p_from
     and coalesce(m.started_at, m.created_at) < p_to
   order by coalesce(m.started_at, m.created_at) desc
   limit 5000;
$$;

revoke all on function hr_meeting_log(timestamptz, timestamptz) from public, anon;
grant execute on function hr_meeting_log(timestamptz, timestamptz) to authenticated;
