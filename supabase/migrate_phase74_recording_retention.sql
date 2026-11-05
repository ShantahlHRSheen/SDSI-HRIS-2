-- =============================================================================
-- Phase 74: delete old meeting recordings automatically.
--
-- Every day at 3:17 AM (Manila), pg_cron calls the purge-recordings Edge
-- Function (supabase/functions/purge-recordings). It deletes recordings
-- older than chat_settings.recording_retention_days (60) — the files
-- through the Storage API, then their rows.
--
-- To change the number of days:
--   update chat_settings set recording_retention_days = 90;
--
-- Before running this, deploy the function and store two Vault secrets
-- (SETUP.md, "Recording retention"):
--   project_url               https://<project ref>.supabase.co
--   purge_recordings_secret   the same random value as the function's
--                             PURGE_RECORDINGS_SECRET
-- No secret is written in this file.
--
-- Run after phase 73. Safe to re-run (the job is replaced by name).
-- =============================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 19:17 UTC = 3:17 AM Asia/Manila.
select cron.schedule(
  'purge-meeting-recordings',
  '17 19 * * *',
  $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/purge-recordings',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'purge_recordings_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $job$
);

-- To check it:   select * from cron.job where jobname = 'purge-meeting-recordings';
-- Last runs:     select * from cron.job_run_details order by start_time desc limit 5;
-- To stop it:    select cron.unschedule('purge-meeting-recordings');
