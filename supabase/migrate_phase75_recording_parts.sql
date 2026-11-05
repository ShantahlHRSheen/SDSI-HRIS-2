-- =============================================================================
-- Phase 75: 50 MB files; recordings uploaded in parts.
--
-- Chat files are up to 50 MB. A meeting recording is uploaded in parts of
-- about 45 MB while the meeting goes on:
--   meeting-recordings/<meeting id>/<recording id>/0001.webm, 0002.webm, ...
-- meeting_recordings.path is that folder (<meeting id>/<recording id>);
-- the parts, joined in order, play as one recording (up to 2 GB).
--
-- Run after phase 73. Safe to re-run.
-- =============================================================================

update storage.buckets set file_size_limit = 52428800 where id in ('chat-files', 'meeting-recordings');

alter table meeting_recordings add column if not exists part_count integer not null default 0;
alter table meeting_recordings add column if not exists mime_type text not null default 'video/webm';
alter table meeting_recordings add column if not exists finished_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'meeting_recordings_parts_check') then
    alter table meeting_recordings add constraint meeting_recordings_parts_check
      check (part_count between 0 and 100 and size_bytes between 0 and 2147483648
             and mime_type in ('video/webm', 'video/mp4', 'audio/webm'));
  end if;
end $$;

-- Whoever is recording updates their recording as parts arrive.
drop policy if exists "meeting recordings update own" on meeting_recordings;
create policy "meeting recordings update own" on meeting_recordings for update to authenticated
  using (recorded_by = app_current_employee_id() and app_is_meeting_participant(meeting_id))
  with check (recorded_by = app_current_employee_id() and app_is_meeting_participant(meeting_id));
