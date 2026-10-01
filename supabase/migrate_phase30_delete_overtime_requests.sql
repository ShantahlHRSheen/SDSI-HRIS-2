-- =============================================================================
-- Shantahl HRIS — the HR Manager can delete overtime requests
--
--   * Deleting an overtime request also deletes its online overtime form
--     (on delete cascade); the HR Manager may also remove the form's
--     signature files (ot/<request id>/...) from storage.
--
-- Safe to run any time, and safe to re-run.
-- Run once in the SQL Editor (Database > SQL Editor).
-- =============================================================================

drop policy if exists "overtime requests delete hr" on overtime_requests;
create policy "overtime requests delete hr" on overtime_requests for delete to authenticated
  using (app_is_hr_manager());

drop policy if exists "overtime forms files delete hr" on storage.objects;
create policy "overtime forms files delete hr" on storage.objects for delete to authenticated
  using (bucket_id = 'leave-forms' and name like 'ot/%' and app_is_hr_manager());
