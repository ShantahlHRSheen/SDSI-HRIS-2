-- =============================================================================
-- Phase 84: the public website — company profile, newsroom (press releases),
-- job posts, and online applications from people outside the company.
--
--   company_profile  one row per company: tagline, about, mission, vision,
--                    core values and contact details. HR edits it.
--   job_posts        HR posts a job (from an approved personnel requisition
--                    or on its own): draft → open → closed.
--   news_posts       HR writes news / press releases: draft → published.
--                    Cover photos go in the public "company-media" bucket.
--   applicants       + job_post_id, source ('hr' | 'online'), cover_letter,
--                    privacy_consent_at.
--
-- The public never touches these tables: the careers page and the application
-- form go through the HRIS server (app/api/careers), which reads only open
-- posts and the profile, checks every application (consent, size and type of
-- the resume, one application per email per post a day, a cap per hour) and
-- then adds the applicant to Hiring & Onboarding (status 'screening') with the
-- resume in the private hiring-files bucket. No policy here lets an anonymous
-- visitor read or write anything.
--
-- Run after phase 81 (Hiring & Onboarding) and phase 82. Safe to re-run.
-- Run it in each company's project.
-- =============================================================================

-- ---- Company profile ---------------------------------------------------------------

create table if not exists company_profile (
  id boolean primary key default true check (id),
  tagline text not null default '',
  about text not null default '',
  mission text not null default '',
  vision text not null default '',
  core_values text not null default '',
  address text not null default '',
  phone text not null default '',
  email text not null default '',
  website text not null default '',
  facebook text not null default '',
  careers_note text not null default '',  -- shown above the job list
  updated_by text references employees (id) on delete set null,
  updated_at timestamptz not null default now()
);
insert into company_profile (id) values (true) on conflict (id) do nothing;

alter table company_profile enable row level security;

drop policy if exists "company profile read" on company_profile;
create policy "company profile read" on company_profile for select to authenticated using (true);
drop policy if exists "company profile hr" on company_profile;
create policy "company profile hr" on company_profile for update to authenticated
  using (coalesce(app_is_hr_manager(), false))
  with check (coalesce(app_is_hr_manager(), false));

create or replace function app_touch_company_profile()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  new.updated_by := app_current_employee_id();
  return new;
end;
$$;
drop trigger if exists company_profile_touch on company_profile;
create trigger company_profile_touch before update on company_profile
  for each row execute function app_touch_company_profile();

-- ---- Job posts ---------------------------------------------------------------------

create table if not exists job_posts (
  id text primary key default gen_random_uuid()::text,
  status text not null default 'draft' check (status in ('draft', 'open', 'closed')),
  title text not null check (length(trim(title)) between 2 and 120),
  branch_id text references branches (id) on delete set null,
  department_id text references departments (id) on delete set null,
  location text not null default '',
  employment_type text check (employment_type in ('regular', 'probationary', 'reliever', 'project_based')),
  slots integer not null default 1 check (slots between 1 and 500),
  summary text not null default '',
  responsibilities text not null default '',
  qualifications text not null default '',
  benefits text not null default '',
  closes_on date,
  requisition_id text references personnel_requisitions (id) on delete set null,
  posted_at timestamptz,
  created_by text references employees (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists job_posts_status_idx on job_posts (status);

create or replace function app_touch_job_post()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  if tg_op = 'INSERT' then
    new.created_by := app_current_employee_id();
    new.created_at := now();
  end if;
  if new.status = 'open' and new.posted_at is null then
    new.posted_at := now();
  end if;
  return new;
end;
$$;
drop trigger if exists job_posts_touch on job_posts;
create trigger job_posts_touch before insert or update on job_posts
  for each row execute function app_touch_job_post();

alter table job_posts enable row level security;

-- Employees see open posts (to refer people); HR sees and keeps them all.
drop policy if exists "job posts read" on job_posts;
create policy "job posts read" on job_posts for select to authenticated
  using (status = 'open' or coalesce(app_is_hr_manager(), false));
drop policy if exists "job posts hr" on job_posts;
create policy "job posts hr" on job_posts for all to authenticated
  using (coalesce(app_is_hr_manager(), false))
  with check (coalesce(app_is_hr_manager(), false));

-- ---- Applicants: online applications -----------------------------------------------

alter table applicants add column if not exists job_post_id text references job_posts (id) on delete set null;
alter table applicants add column if not exists source text not null default 'hr';
alter table applicants add column if not exists cover_letter text not null default '';
alter table applicants add column if not exists privacy_consent_at timestamptz;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'applicants_source_check') then
    alter table applicants add constraint applicants_source_check check (source in ('hr', 'online'));
  end if;
end $$;
create index if not exists applicants_job_post_idx on applicants (job_post_id);
-- For the "one application per email per post a day" check.
create index if not exists applicants_email_idx on applicants (lower(email), created_at);

-- ---- Newsroom ----------------------------------------------------------------------

create table if not exists news_posts (
  id text primary key default gen_random_uuid()::text,
  status text not null default 'draft' check (status in ('draft', 'published')),
  title text not null check (length(trim(title)) between 2 and 200),
  summary text not null default '',  -- the excerpt on the card
  body text not null default '',
  cover_path text,                   -- company-media/<path>
  published_on date,                 -- the date shown; set when first published
  created_by text references employees (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists news_posts_published_idx on news_posts (status, published_on desc);

create or replace function app_touch_news_post()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  if tg_op = 'INSERT' then
    new.created_by := app_current_employee_id();
    new.created_at := now();
  end if;
  if new.status = 'published' and new.published_on is null then
    new.published_on := (now() at time zone 'Asia/Manila')::date;
  end if;
  return new;
end;
$$;
drop trigger if exists news_posts_touch on news_posts;
create trigger news_posts_touch before insert or update on news_posts
  for each row execute function app_touch_news_post();

alter table news_posts enable row level security;

drop policy if exists "news read" on news_posts;
create policy "news read" on news_posts for select to authenticated
  using (status = 'published' or coalesce(app_is_hr_manager(), false));
drop policy if exists "news hr" on news_posts;
create policy "news hr" on news_posts for all to authenticated
  using (coalesce(app_is_hr_manager(), false))
  with check (coalesce(app_is_hr_manager(), false));

-- Cover photos: a public bucket (anyone with the link can see a photo), images
-- only, up to 5 MB. Only HR adds, replaces or removes them.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('company-media', 'company-media', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "company media hr add" on storage.objects;
create policy "company media hr add" on storage.objects for insert to authenticated
  with check (bucket_id = 'company-media' and coalesce(app_is_hr_manager(), false));
drop policy if exists "company media hr update" on storage.objects;
create policy "company media hr update" on storage.objects for update to authenticated
  using (bucket_id = 'company-media' and coalesce(app_is_hr_manager(), false));
drop policy if exists "company media hr delete" on storage.objects;
create policy "company media hr delete" on storage.objects for delete to authenticated
  using (bucket_id = 'company-media' and coalesce(app_is_hr_manager(), false));
drop policy if exists "company media hr read" on storage.objects;
create policy "company media hr read" on storage.objects for select to authenticated
  using (bucket_id = 'company-media' and coalesce(app_is_hr_manager(), false));

-- ---- Guests (phase 79) stay out --------------------------------------------------------

do $$
begin
  if exists (select 1 from pg_proc where proname = 'app_is_guest') then
    execute 'drop policy if exists "no guests" on public.company_profile';
    execute 'create policy "no guests" on public.company_profile as restrictive for all to authenticated using (not app_is_guest()) with check (not app_is_guest())';
    execute 'drop policy if exists "no guests" on public.news_posts';
    execute 'create policy "no guests" on public.news_posts as restrictive for all to authenticated using (not app_is_guest()) with check (not app_is_guest())';
    execute 'drop policy if exists "no guests" on public.job_posts';
    execute 'create policy "no guests" on public.job_posts as restrictive for all to authenticated using (not app_is_guest()) with check (not app_is_guest())';
  end if;
end $$;

notify pgrst, 'reload schema';
