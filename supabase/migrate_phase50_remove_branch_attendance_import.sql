-- Phase 50: remove the branch attendance upload (phases 48–49).
--
-- HR imports one consolidated biometrics file for all branches, so branch
-- staff no longer upload their branch's attendance:
--   * biometric_links is HR / payroll only again (as in phase 46);
--   * import_branch_attendance, app_can_import_branch and the
--     attendance_importers list are removed.
--
-- Safe to run any time, and safe to re-run.

drop policy if exists "biometric links branch" on biometric_links;
drop policy if exists "biometric links hr" on biometric_links;
create policy "biometric links hr" on biometric_links for all to authenticated
  using (app_has_any_role(array['hr_admin', 'payroll_officer']::app_role[]))
  with check (app_has_any_role(array['hr_admin', 'payroll_officer']::app_role[]));

drop function if exists import_branch_attendance(text, jsonb);
drop function if exists app_can_import_branch(text);
drop table if exists attendance_importers;
