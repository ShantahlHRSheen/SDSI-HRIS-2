-- =============================================================================
-- Phase 59: Work From Home — live status, seen by Upper Management too.
--
--   * wfh_sessions.state / state_since: what the employee is doing right now
--     (active, idle, screen locked), set by the HRIS tab as it changes, so
--     the "Who's working now" board can show it live.
--   * Upper Management reads the WFH schedules, sessions and activity log
--     (read-only), like HR and the employee's supervisor.
--
-- Needs migrate_phase58_work_from_home.sql. Safe to re-run.
-- =============================================================================

alter table wfh_sessions
  add column if not exists state text not null default 'active' check (state in ('active', 'idle', 'locked')),
  add column if not exists state_since timestamptz;

create or replace function app_is_upper_management()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select app_has_any_role(array['upper_management']::app_role[]);
$$;

revoke all on function app_is_upper_management() from public, anon;
grant execute on function app_is_upper_management() to authenticated;

drop policy if exists "wfh schedules read" on wfh_schedules;
create policy "wfh schedules read" on wfh_schedules for select to authenticated
  using (employee_id = app_current_employee_id() or app_is_supervisor_of(employee_id) or app_is_hr_manager() or app_is_upper_management());
drop policy if exists "wfh sessions read" on wfh_sessions;
create policy "wfh sessions read" on wfh_sessions for select to authenticated
  using (employee_id = app_current_employee_id() or app_is_supervisor_of(employee_id) or app_is_hr_manager() or app_is_upper_management());
drop policy if exists "wfh events read" on wfh_events;
create policy "wfh events read" on wfh_events for select to authenticated
  using (employee_id = app_current_employee_id() or app_is_supervisor_of(employee_id) or app_is_hr_manager() or app_is_upper_management());

-- The tab reports a change: idle / locked since a time, or back to active.
create or replace function wfh_state(p_session text, p_state text, p_since timestamptz)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  s wfh_sessions%rowtype;
begin
  if p_state not in ('active', 'idle', 'locked') then
    raise exception 'Unknown state.';
  end if;
  select * into s from wfh_sessions where id = p_session and employee_id = app_current_employee_id() and ended_at is null;
  if not found then
    raise exception 'No open work-from-home session.';
  end if;
  update wfh_sessions
     set state = p_state,
         state_since = greatest(least(coalesce(p_since, now()), now()), s.started_at),
         last_seen_at = now()
   where id = p_session;
end;
$$;

revoke all on function wfh_state(text, text, timestamptz) from public, anon;
grant execute on function wfh_state(text, text, timestamptz) to authenticated;
