-- =============================================================================
-- Shantahl HRIS — comments and reactions on Bulletin Board announcements
--
--   * announcement_comments: any signed-in employee can comment. The
--     author's display name is filled in from their employee record by a
--     trigger (regular employees can't read other employees' records, and
--     nobody can post under someone else's name). Authors can delete their
--     own comments; HR / Upper Management can delete any (moderation).
--   * announcement_reactions: one reaction per employee per post — like,
--     heart or celebrate. Changing it replaces the old one; employees can
--     only add/change/remove their own.
--
-- Safe to run any time, and safe to re-run.
--
-- Run once in the SQL Editor (Database > SQL Editor).
-- =============================================================================

create table if not exists announcement_comments (
  id text primary key default gen_random_uuid()::text,
  announcement_id text not null references announcements (id) on delete cascade,
  employee_id text not null references employees (id) on delete cascade,
  author_name text not null default '',
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists announcement_comments_announcement_idx on announcement_comments (announcement_id, created_at);

create table if not exists announcement_reactions (
  announcement_id text not null references announcements (id) on delete cascade,
  employee_id text not null references employees (id) on delete cascade,
  reaction text not null check (reaction in ('like', 'heart', 'celebrate')),
  created_at timestamptz not null default now(),
  primary key (announcement_id, employee_id)
);

-- Fill in the commenter's name from their employee record ("Last, First").
create or replace function app_set_comment_author_name()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select trim(both ' ' from coalesce(e.first_name, '') || ' ' || coalesce(e.last_name, ''))
    into new.author_name
    from employees e where e.id = new.employee_id;
  return new;
end;
$$;

drop trigger if exists announcement_comments_author_name on announcement_comments;
create trigger announcement_comments_author_name
  before insert on announcement_comments
  for each row execute function app_set_comment_author_name();

alter table announcement_comments enable row level security;
alter table announcement_reactions enable row level security;

drop policy if exists "comments read" on announcement_comments;
create policy "comments read" on announcement_comments for select to authenticated using (true);
drop policy if exists "comments insert own" on announcement_comments;
create policy "comments insert own" on announcement_comments for insert to authenticated
  with check (employee_id = app_current_employee_id());
drop policy if exists "comments delete own or moderator" on announcement_comments;
create policy "comments delete own or moderator" on announcement_comments for delete to authenticated
  using (employee_id = app_current_employee_id() or app_can_post_announcements());

drop policy if exists "reactions read" on announcement_reactions;
create policy "reactions read" on announcement_reactions for select to authenticated using (true);
drop policy if exists "reactions insert own" on announcement_reactions;
create policy "reactions insert own" on announcement_reactions for insert to authenticated
  with check (employee_id = app_current_employee_id());
drop policy if exists "reactions update own" on announcement_reactions;
create policy "reactions update own" on announcement_reactions for update to authenticated
  using (employee_id = app_current_employee_id()) with check (employee_id = app_current_employee_id());
drop policy if exists "reactions delete own" on announcement_reactions;
create policy "reactions delete own" on announcement_reactions for delete to authenticated
  using (employee_id = app_current_employee_id());
