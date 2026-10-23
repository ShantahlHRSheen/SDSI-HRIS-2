-- =============================================================================
-- Phase 58: Work From Home activity log
--
--   * wfh_schedules: who works from home and when (per weekday: hours, or
--     expected minutes), set by HR; the employee acknowledges the
--     monitoring notice once.
--   * wfh_sessions: "Start working" → "Stop working" with the day's
--     accomplishment report; last_seen_at is refreshed every minute while
--     the HRIS tab is open.
--   * wfh_events: idle stretches (no keyboard / mouse anywhere on the
--     computer, or screen locked), times the tab was closed (offline), and
--     the random "Are you there?" checks (answered / missed). The employee
--     can add a reason to an idle or offline stretch.
--   * Seen by the employee, their supervisor and HR. Written only through
--     the functions below, with server times.
--
-- Safe to run any time, and safe to re-run.
-- =============================================================================

create table if not exists wfh_schedules (
  employee_id text primary key references employees (id) on delete cascade,
  -- {"1": {"start": "08:00", "end": "17:00"}, "6": {"minutes": 120}} (1 = Monday … 7 = Sunday)
  days jsonb not null default '{}'::jsonb,
  acknowledged_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists wfh_sessions (
  id text primary key,
  employee_id text not null references employees (id) on delete cascade,
  work_date date not null,
  started_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  ended_at timestamptz,
  report text
);

create index if not exists wfh_sessions_employee_idx on wfh_sessions (employee_id, work_date);

create table if not exists wfh_events (
  id text primary key,
  session_id text not null references wfh_sessions (id) on delete cascade,
  employee_id text not null references employees (id) on delete cascade,
  kind text not null check (kind in ('idle', 'locked', 'offline', 'check_ok', 'check_missed')),
  started_at timestamptz not null,
  ended_at timestamptz,
  reason text
);

create index if not exists wfh_events_session_idx on wfh_events (session_id, started_at);

alter table wfh_schedules enable row level security;
alter table wfh_sessions enable row level security;
alter table wfh_events enable row level security;

drop policy if exists "wfh schedules read" on wfh_schedules;
create policy "wfh schedules read" on wfh_schedules for select to authenticated
  using (employee_id = app_current_employee_id() or app_is_supervisor_of(employee_id) or app_is_hr_manager());
drop policy if exists "wfh schedules hr" on wfh_schedules;
create policy "wfh schedules hr" on wfh_schedules for all to authenticated
  using (app_is_hr_manager()) with check (app_is_hr_manager());

drop policy if exists "wfh sessions read" on wfh_sessions;
create policy "wfh sessions read" on wfh_sessions for select to authenticated
  using (employee_id = app_current_employee_id() or app_is_supervisor_of(employee_id) or app_is_hr_manager());
drop policy if exists "wfh events read" on wfh_events;
create policy "wfh events read" on wfh_events for select to authenticated
  using (employee_id = app_current_employee_id() or app_is_supervisor_of(employee_id) or app_is_hr_manager());
-- No insert / update policies: everything goes through the functions below.

create or replace function wfh_acknowledge()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update wfh_schedules set acknowledged_at = coalesce(acknowledged_at, now()) where employee_id = app_current_employee_id();
  if not found then
    raise exception 'You aren''t set up for work from home.';
  end if;
end;
$$;

-- Start working (or continue today's open session). Returns the session id.
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
  select * into s from wfh_sessions where employee_id = me and ended_at is null order by started_at desc limit 1 for update;
  if found then
    -- The tab was closed for a while: log the gap.
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

-- Every minute while the tab is open.
create or replace function wfh_beat(p_session text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update wfh_sessions set last_seen_at = now()
   where id = p_session and employee_id = app_current_employee_id() and ended_at is null;
end;
$$;

-- An idle / locked stretch (its start as the browser saw it, its end now),
-- or a presence check (answered or missed).
create or replace function wfh_log(p_session text, p_kind text, p_started timestamptz)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me text := app_current_employee_id();
  s wfh_sessions%rowtype;
  st timestamptz;
begin
  select * into s from wfh_sessions where id = p_session and employee_id = me and ended_at is null;
  if not found then
    raise exception 'No open work-from-home session.';
  end if;
  if p_kind not in ('idle', 'locked', 'check_ok', 'check_missed') then
    raise exception 'Unknown activity.';
  end if;
  st := greatest(least(coalesce(p_started, now()), now()), s.started_at);
  insert into wfh_events (id, session_id, employee_id, kind, started_at, ended_at)
  values (gen_random_uuid()::text, p_session, me, p_kind, st, case when p_kind in ('idle', 'locked') then now() else null end);
  update wfh_sessions set last_seen_at = now() where id = p_session;
end;
$$;

create or replace function wfh_stop(p_session text, p_report text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_report text := nullif(btrim(coalesce(p_report, '')), '');
begin
  if v_report is null or char_length(v_report) > 4000 then
    raise exception 'Write what you accomplished today (up to 4000 characters).';
  end if;
  update wfh_sessions set ended_at = now(), last_seen_at = now(), report = v_report
   where id = p_session and employee_id = app_current_employee_id() and ended_at is null;
  if not found then
    raise exception 'No open work-from-home session.';
  end if;
end;
$$;

-- The employee explains an idle / offline stretch.
create or replace function wfh_explain(p_event text, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if v_reason is not null and char_length(v_reason) > 300 then
    raise exception 'Keep the reason under 300 characters.';
  end if;
  update wfh_events set reason = v_reason
   where id = p_event and employee_id = app_current_employee_id() and kind in ('idle', 'locked', 'offline');
  if not found then
    raise exception 'You can only explain your own idle or offline time.';
  end if;
end;
$$;

revoke all on function wfh_acknowledge() from public, anon;
grant execute on function wfh_acknowledge() to authenticated;
revoke all on function wfh_start() from public, anon;
grant execute on function wfh_start() to authenticated;
revoke all on function wfh_beat(text) from public, anon;
grant execute on function wfh_beat(text) to authenticated;
revoke all on function wfh_log(text, text, timestamptz) from public, anon;
grant execute on function wfh_log(text, text, timestamptz) to authenticated;
revoke all on function wfh_stop(text, text) from public, anon;
grant execute on function wfh_stop(text, text) to authenticated;
revoke all on function wfh_explain(text, text) from public, anon;
grant execute on function wfh_explain(text, text) to authenticated;
