-- =============================================================================
-- Phase 72: written explanations on a confidential case.
--
-- Each case lists who was asked for a written explanation, when, and — once
-- HR uploads the signed explanation — when it was received and the file
-- ([{name, requestedOn, receivedOn, path, fileName}]). The files are in the
-- case's private confidential-files folder.
--
-- Needs migrate_phase71_confidential_cases.sql.
-- Safe to run any time, and safe to re-run.
-- =============================================================================

alter table confidential_cases add column if not exists explanations jsonb not null default '[]'::jsonb;
