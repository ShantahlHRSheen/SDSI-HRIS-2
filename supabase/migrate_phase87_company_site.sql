-- =============================================================================
-- Phase 87: each company's own website (/shantahl, /lsmbiz, /daro) — the
-- founder section and the photos on the company homepage.
--
--   company_profile  + founder_name, founder_title, founder_message,
--                      founder_photo_path, hero_photo_path
--
-- Photos go in the public company-media bucket (phase 84), which only HR
-- can add to. Nothing else changes. Run after phase 84. Safe to re-run.
-- Run it in each company's project.
-- =============================================================================

alter table company_profile add column if not exists founder_name text not null default '';
alter table company_profile add column if not exists founder_title text not null default '';
alter table company_profile add column if not exists founder_message text not null default '';
alter table company_profile add column if not exists founder_photo_path text;
alter table company_profile add column if not exists hero_photo_path text;

notify pgrst, 'reload schema';
