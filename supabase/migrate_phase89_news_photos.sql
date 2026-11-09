-- =============================================================================
-- Phase 89: up to 10 photos in a news article (besides its cover photo).
--
--   news_posts + photo_paths — paths in the public company-media bucket
--   (phase 84; only HR can add to it), shown as a gallery on the article.
--
-- Run after phase 84. Safe to re-run. Run it in each company's project.
-- =============================================================================

alter table news_posts add column if not exists photo_paths jsonb not null default '[]'::jsonb;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'news_posts_photo_paths_check') then
    alter table news_posts add constraint news_posts_photo_paths_check
      check (jsonb_typeof(photo_paths) = 'array' and jsonb_array_length(photo_paths) <= 10);
  end if;
end $$;

notify pgrst, 'reload schema';
