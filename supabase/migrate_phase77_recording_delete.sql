-- =============================================================================
-- Phase 77: deleting a meeting recording.
--
-- A recording can be deleted (its parts in storage, then its row) by the
-- person who recorded it, the meeting's host, or HR (in meetings HR is part
-- of). Others in the meeting can still play and download it.
--
-- Run after phase 75. Safe to re-run.
-- =============================================================================

create or replace function app_can_delete_recording(p_meeting uuid, p_recorded_by text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select app_current_employee_id() is not null
     and (p_recorded_by = app_current_employee_id()
          or exists (select 1 from meetings m where m.id = p_meeting and m.host_id = app_current_employee_id())
          or (coalesce(app_is_hr_manager(), false) and app_is_meeting_participant(p_meeting)));
$$;

revoke all on function app_can_delete_recording(uuid, text) from public, anon;
grant execute on function app_can_delete_recording(uuid, text) to authenticated;

drop policy if exists "meeting recordings delete" on meeting_recordings;
create policy "meeting recordings delete" on meeting_recordings for delete to authenticated
  using (app_can_delete_recording(meeting_id, recorded_by));

-- The parts: <meeting id>/<recording id>/<part>, while the recording's row exists.
drop policy if exists "meeting recordings delete parts" on storage.objects;
create policy "meeting recordings delete parts" on storage.objects for delete to authenticated
  using (bucket_id = 'meeting-recordings'
         and exists (select 1 from meeting_recordings r
                      where r.path = split_part(name, '/', 1) || '/' || split_part(name, '/', 2)
                        and app_can_delete_recording(r.meeting_id, r.recorded_by)));
