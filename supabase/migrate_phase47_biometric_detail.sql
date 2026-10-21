-- =============================================================================
-- Shantahl HRIS — approved attendance corrections update biometrics attendance
--
--   attendance_period_records.biometric_detail: what a biometrics import
--   worked from — each day's punches, the schedule, and whether the employee
--   is fixed-rate — so the HRIS can recompute the cut-off when an attendance
--   correction is approved (the corrected time in / out replaces that day's
--   punches). Only on records imported from biometrics.
--
-- Safe to run any time, and safe to re-run.
-- Run once in the SQL Editor (Database > SQL Editor).
-- =============================================================================

alter table attendance_period_records add column if not exists biometric_detail jsonb;
