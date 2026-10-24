-- =============================================================================
-- Phase 60: Work From Home — a new day starts a new session.
--
-- An employee who never clicked Stop working (tab closed) had that session
-- reopened the next morning, so the new day's work was filed under the old
-- date. Now Start working closes a session left open from an earlier day
-- (at the time the tab was last open, with a note) and starts today's.
--
-- Needs migrate_phase58_work_from_home.sql. Safe to re-run.
-- =============================================================================

create or replace function wfh_start()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  me text := app_current_employee_id();
  s wfh_sessions%rowtype;
  today date := (now() at time zone 'Asia/Manila')::date;
begin
  if me is null or not exists (select 1 from wfh_schedules where employee_id = me and acknowledged_at is not null) then
    raise exception 'You aren''t set up for work from home, or haven''t acknowledged the notice yet.';
  end if;
  -- Left open on an earlier day: closed when the tab was last open.
  update wfh_sessions
     set ended_at = last_seen_at,
         report = coalesce(report, '(Not stopped — closed automatically when the next work-from-home day started.)')
   where employee_id = me and ended_at is null and work_date < today;
  select * into s from wfh_sessions where employee_id = me and ended_at is null order by started_at desc limit 1 for update;
  if found then
    -- The tab was closed for a while today: log the gap.
    if now() - s.last_seen_at > interval '3 minutes' then
      insert into wfh_events (id, session_id, employee_id, kind, started_at, ended_at)
      values (gen_random_uuid()::text, s.id, me, 'offline', s.last_seen_at, now());
    end if;
    update wfh_sessions set last_seen_at = now() where id = s.id;
    return s.id;
  end if;
  insert into wfh_sessions (id, employee_id, work_date) values (gen_random_uuid()::text, me, today) returning * into s;
  return s.id;
end;
$$;
