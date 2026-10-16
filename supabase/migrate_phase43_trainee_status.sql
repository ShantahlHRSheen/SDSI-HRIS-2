-- =============================================================================
-- LSM Group HRIS — "Trainee" employment status
--
--   Adds 'trainee' to the employment statuses (after Probationary), for
--   people still in training before probation.
--
-- Run once in EACH company's database (Shantahl, LSMBiz, Daro): SQL Editor >
-- New query > paste > Run. Run it on its own — Postgres won't let a new
-- status be used in the same run that adds it.
-- Safe to re-run. (Already in new-company-setup.sql for new companies.)
-- =============================================================================

alter type employment_status add value if not exists 'trainee' after 'probationary';
