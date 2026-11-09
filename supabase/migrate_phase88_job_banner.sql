-- =============================================================================
-- Phase 88: a hiring banner photo on job posts.
--
--   job_posts + banner_photo_path — a photo in the public company-media
--   bucket (phase 84; only HR can add to it), shown on the careers pages and
--   as the picture when the job's link is shared (e.g. on Facebook).
--
-- Run after phase 84. Safe to re-run. Run it in each company's project.
-- =============================================================================

alter table job_posts add column if not exists banner_photo_path text;

notify pgrst, 'reload schema';
