-- =============================================================================
-- Shantahl HRIS — the HR Manager can delete leave requests
--
--   * Deleting a leave request also deletes its online leave form and its
--     attachment records (on delete cascade); the HR Manager may also remove
--     the request's files (form signatures, attachments) from storage.
--
-- Safe to run any time, and safe to re-run.
-- Run once in the SQL Editor (Database > SQL Editor).
-- =============================================================================

drop policy if exists "leave requests delete hr" on leave_requests;
create policy "leave requests delete hr" on leave_requests for delete to authenticated
  using (app_is_hr_manager());

drop policy if exists "leave forms files delete hr" on storage.objects;
create policy "leave forms files delete hr" on storage.objects for delete to authenticated
  using (bucket_id = 'leave-forms' and name like 'forms/%' and app_is_hr_manager());

drop policy if exists "leave attachments delete hr" on storage.objects;
create policy "leave attachments delete hr" on storage.objects for delete to authenticated
  using (bucket_id = 'leave-attachments' and app_is_hr_manager());
