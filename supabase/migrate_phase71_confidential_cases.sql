-- =============================================================================
-- Phase 71: Confidential Cases.
--
-- HR writes up sensitive cases (e.g. an alleged workplace relationship, a
-- harassment complaint, an investigation) as a report: details, sections of
-- text or tables, actions and next steps, sign-off, and attached files. Seen
-- only by HR and the people listed in confidential_case_viewers (the
-- Chairman and the Vice Chairperson) — not by other Upper Management or
-- Department Heads. Written by HR.
--
-- Attachments: the private confidential-files bucket, at <case id>/<file>.
-- Safe to run any time, and safe to re-run.
-- =============================================================================

create table if not exists confidential_case_viewers (
  employee_id text primary key references employees (id) on delete cascade
);
alter table confidential_case_viewers enable row level security;
drop policy if exists "conf viewers read hr" on confidential_case_viewers;
create policy "conf viewers read hr" on confidential_case_viewers for select to authenticated
  using (coalesce(app_is_hr_manager(), false) or employee_id = app_current_employee_id());
-- Changed in the SQL Editor only.

-- Lowel B. Magdadaro (Chairman), Sheilah A. Magdadaro (Vice Chairperson).
insert into confidential_case_viewers (employee_id)
select id from employees where id in ('emp-001', 'emp-004')
on conflict do nothing;

create or replace function app_can_see_confidential()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(app_is_hr_manager(), false)
      or exists (select 1 from confidential_case_viewers v where v.employee_id = app_current_employee_id());
$$;

revoke all on function app_can_see_confidential() from public, anon;
grant execute on function app_can_see_confidential() to authenticated;

create table if not exists confidential_cases (
  id text primary key default gen_random_uuid()::text,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  case_date date not null,
  status text not null default 'open' check (status in ('open', 'investigating', 'resolved', 'closed')),
  summary text not null default '' check (char_length(summary) <= 2000),
  -- [{label, value}], [{heading, kind: 'text'|'table', body, rows: string[][]}],
  -- [{text, done}], [{label, title}] — the report's parts.
  details jsonb not null default '[]'::jsonb,
  sections jsonb not null default '[]'::jsonb,
  actions jsonb not null default '[]'::jsonb,
  signoff jsonb not null default '[]'::jsonb,
  created_by text references employees (id) on delete set null,
  created_by_name text not null default '',
  created_at timestamptz not null default now(),
  updated_by_name text,
  updated_at timestamptz,
  check (octet_length(details::text) + octet_length(sections::text) + octet_length(actions::text) + octet_length(signoff::text) <= 200000)
);

create index if not exists confidential_cases_date_idx on confidential_cases (case_date desc);

create or replace function app_fill_confidential_case()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  nm text := coalesce((select trim(both ' ' from coalesce(first_name, '') || ' ' || coalesce(last_name, '')) from employees where id = app_current_employee_id()), '');
begin
  if tg_op = 'INSERT' then
    new.created_by := app_current_employee_id();
    new.created_by_name := nm;
    new.created_at := now();
    new.updated_by_name := null;
    new.updated_at := null;
  else
    new.created_by := old.created_by;
    new.created_by_name := old.created_by_name;
    new.created_at := old.created_at;
    new.updated_by_name := nm;
    new.updated_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists confidential_cases_fill on confidential_cases;
create trigger confidential_cases_fill
  before insert or update on confidential_cases
  for each row execute function app_fill_confidential_case();

alter table confidential_cases enable row level security;

drop policy if exists "conf cases read" on confidential_cases;
create policy "conf cases read" on confidential_cases for select to authenticated
  using (app_can_see_confidential());
drop policy if exists "conf cases write hr" on confidential_cases;
create policy "conf cases write hr" on confidential_cases for all to authenticated
  using (coalesce(app_is_hr_manager(), false))
  with check (coalesce(app_is_hr_manager(), false));

-- Attachments: a private bucket, <case id>/<file> (PDF, Word, Excel,
-- images; up to 10 MB). Read by those who can see the cases; added and
-- removed by HR.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('confidential-files', 'confidential-files', false, 10485760, array[
  'application/pdf', 'image/png', 'image/jpeg', 'image/webp',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "conf files read" on storage.objects;
create policy "conf files read" on storage.objects for select to authenticated
  using (bucket_id = 'confidential-files' and app_can_see_confidential());
drop policy if exists "conf files add hr" on storage.objects;
create policy "conf files add hr" on storage.objects for insert to authenticated
  with check (bucket_id = 'confidential-files' and coalesce(app_is_hr_manager(), false)
              and exists (select 1 from confidential_cases c where c.id = split_part(name, '/', 1)));
drop policy if exists "conf files delete hr" on storage.objects;
create policy "conf files delete hr" on storage.objects for delete to authenticated
  using (bucket_id = 'confidential-files' and coalesce(app_is_hr_manager(), false));
