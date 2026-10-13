-- =============================================================================
-- Shantahl HRIS — Employee Handbook Acknowledgment Form
--
--   * handbook_info: the handbook's version and effective date (HR sets them
--     on the Employee Handbook page).
--   * handbook_downloads: each time an employee opens or downloads the
--     handbook in the HRIS — the proof of dissemination, and the "Date of
--     HRIS access / download" on the form.
--   * handbook_acknowledgments: the signed "Employee Handbook Acknowledgment
--     Form", one per employee per handbook version. The employee chooses the
--     language item and signs; the database fills in their name, ID no.,
--     position, department / branch, the handbook version and the first
--     download date. Then the HR Manager verifies the download record and
--     signs it as received (handbook_ack_receive).
--   * Signatures: a copy of the signer's saved signature (leave-forms bucket,
--     signatures/<employee id>.png) is placed at
--     handbook/<employee id>/<form id>/employee.png and hr.png.
--   * The employee sees their own forms; the HR Manager and upper management
--     see everyone's.
--
-- Safe to run any time, and safe to re-run.
-- Run once in the SQL Editor (Database > SQL Editor).
-- =============================================================================

create or replace function app_can_view_handbook_acks()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select app_has_any_role(array['hr_admin', 'upper_management']::app_role[]);
$$;

revoke all on function app_can_view_handbook_acks() from public, anon;
grant execute on function app_can_view_handbook_acks() to authenticated;

-- ---- Version and effective date -----------------------------------------------

create table if not exists handbook_info (
  id int primary key default 1 check (id = 1),
  version text not null default '' check (char_length(version) <= 40),
  effective_date date,
  updated_by text references employees (id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table handbook_info enable row level security;

drop policy if exists "handbook info read" on handbook_info;
create policy "handbook info read" on handbook_info for select to authenticated using (true);
drop policy if exists "handbook info insert" on handbook_info;
create policy "handbook info insert" on handbook_info for insert to authenticated with check (app_is_hr_manager());
drop policy if exists "handbook info update" on handbook_info;
create policy "handbook info update" on handbook_info for update to authenticated using (app_is_hr_manager()) with check (app_is_hr_manager());

-- ---- Downloads -----------------------------------------------------------------

create table if not exists handbook_downloads (
  id bigint generated always as identity primary key,
  employee_id text not null references employees (id) on delete cascade,
  handbook_version text not null default '',
  downloaded_at timestamptz not null default now()
);

create index if not exists handbook_downloads_employee_idx on handbook_downloads (employee_id, downloaded_at);

create or replace function app_fill_handbook_download()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.handbook_version := coalesce((select version from handbook_info where id = 1), '');
  new.downloaded_at := now();
  return new;
end;
$$;

drop trigger if exists handbook_downloads_fill on handbook_downloads;
create trigger handbook_downloads_fill
  before insert on handbook_downloads
  for each row execute function app_fill_handbook_download();

alter table handbook_downloads enable row level security;

drop policy if exists "handbook downloads read" on handbook_downloads;
create policy "handbook downloads read" on handbook_downloads for select to authenticated
  using (employee_id = app_current_employee_id() or app_can_view_handbook_acks());
drop policy if exists "handbook downloads record" on handbook_downloads;
create policy "handbook downloads record" on handbook_downloads for insert to authenticated
  with check (employee_id = app_current_employee_id());

-- ---- Acknowledgment forms --------------------------------------------------------

create table if not exists handbook_acknowledgments (
  id text primary key,
  employee_id text not null references employees (id) on delete cascade,
  handbook_version text not null default '',
  handbook_effective date,
  language text not null check (language in ('english', 'explained')),
  explained_language text not null default '' check (char_length(explained_language) <= 60),
  employee_name text not null default '',
  employee_number text not null default '',
  position text not null default '',
  department_branch text not null default '',
  accessed_at timestamptz,
  signed_at timestamptz not null default now(),
  hr_verified boolean,
  hr_log_ref text,
  received_by text references employees (id) on delete set null,
  received_name text,
  received_position text,
  received_at timestamptz,
  unique (employee_id, handbook_version)
);

create or replace function app_fill_handbook_ack()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  e employees%rowtype;
  dept text;
  br text;
begin
  select * into e from employees where id = new.employee_id;
  select version, effective_date into new.handbook_version, new.handbook_effective from handbook_info where id = 1;
  new.handbook_version := coalesce(new.handbook_version, '');
  select min(downloaded_at) into new.accessed_at from handbook_downloads
   where employee_id = new.employee_id and handbook_version = new.handbook_version;
  if new.accessed_at is null then
    raise exception 'Open or download the handbook first.';
  end if;
  if new.language = 'explained' and btrim(new.explained_language) = '' then
    raise exception 'Enter the language the handbook was explained to you in.';
  end if;
  if new.language = 'english' then
    new.explained_language := '';
  end if;
  new.explained_language := btrim(new.explained_language);
  new.employee_name := trim(both ' ' from coalesce(e.first_name, '') || ' ' || coalesce(e.last_name, ''));
  new.employee_number := coalesce(e.employee_number, '');
  new.position := coalesce((select title from positions where id = e.position_id), '');
  dept := coalesce((select name from departments where id = e.department_id), '');
  br := coalesce((select name from branches where id = e.branch_id), '');
  new.department_branch := case when dept <> '' and br <> '' then dept || ' / ' || br else dept || br end;
  new.signed_at := now();
  new.hr_verified := null;
  new.hr_log_ref := null;
  new.received_by := null;
  new.received_name := null;
  new.received_position := null;
  new.received_at := null;
  return new;
end;
$$;

drop trigger if exists handbook_acks_fill on handbook_acknowledgments;
create trigger handbook_acks_fill
  before insert on handbook_acknowledgments
  for each row execute function app_fill_handbook_ack();

create or replace function app_handbook_file_exists(path text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from storage.objects o where o.bucket_id = 'leave-forms' and o.name = path);
$$;

revoke all on function app_handbook_file_exists(text) from public, anon;
grant execute on function app_handbook_file_exists(text) to authenticated;

alter table handbook_acknowledgments enable row level security;

drop policy if exists "handbook acks read" on handbook_acknowledgments;
create policy "handbook acks read" on handbook_acknowledgments for select to authenticated
  using (employee_id = app_current_employee_id() or app_can_view_handbook_acks());
-- The employee submits their own form, once signed.
drop policy if exists "handbook acks submit" on handbook_acknowledgments;
create policy "handbook acks submit" on handbook_acknowledgments for insert to authenticated
  with check (
    employee_id = app_current_employee_id()
    and app_handbook_file_exists('handbook/' || employee_id || '/' || id || '/employee.png')
  );
-- The HR Manager can remove a form (e.g. signed by mistake) so it can be signed again.
drop policy if exists "handbook acks remove" on handbook_acknowledgments;
create policy "handbook acks remove" on handbook_acknowledgments for delete to authenticated
  using (app_is_hr_manager());

create or replace function handbook_ack_receive(p_id text, p_verified boolean, p_log_ref text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me text := app_current_employee_id();
  f handbook_acknowledgments%rowtype;
  nm text;
  pos text;
begin
  if me is null or not app_is_hr_manager() then
    raise exception 'Only the HR Manager can receive acknowledgment forms.';
  end if;
  select * into f from handbook_acknowledgments where id = p_id for update;
  if not found then
    raise exception 'Acknowledgment form not found.';
  end if;
  if f.received_at is not null then
    raise exception 'This form was already received.';
  end if;
  if p_verified is null then
    raise exception 'Choose whether the HRIS download record was verified.';
  end if;
  if char_length(coalesce(p_log_ref, '')) > 120 then
    raise exception 'The log reference is too long.';
  end if;
  if not app_handbook_file_exists('handbook/' || f.employee_id || '/' || p_id || '/hr.png') then
    raise exception 'Attach your signature first.';
  end if;
  select trim(both ' ' from coalesce(e.first_name, '') || ' ' || coalesce(e.last_name, '')), coalesce(p.title, '')
    into nm, pos
    from employees e left join positions p on p.id = e.position_id
   where e.id = me;
  update handbook_acknowledgments
     set hr_verified = p_verified, hr_log_ref = nullif(btrim(coalesce(p_log_ref, '')), ''),
         received_by = me, received_name = nm, received_position = pos, received_at = now()
   where id = p_id;
end;
$$;

revoke all on function handbook_ack_receive(text, boolean, text) from public, anon;
grant execute on function handbook_ack_receive(text, boolean, text) to authenticated;

-- ---- Signatures on the forms (leave-forms bucket) ---------------------------------

create or replace function app_can_sign_handbook_ack(path text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when path ~ '^handbook/[^/]+/[^/]+/employee\.png$' then
      split_part(path, '/', 2) = app_current_employee_id()
      and not exists (select 1 from handbook_acknowledgments a where a.id = split_part(path, '/', 3))
    when path ~ '^handbook/[^/]+/[^/]+/hr\.png$' then app_is_hr_manager()
      and exists (select 1 from handbook_acknowledgments a
                   where a.id = split_part(path, '/', 3) and a.employee_id = split_part(path, '/', 2) and a.received_at is null)
    else false
  end;
$$;

revoke all on function app_can_sign_handbook_ack(text) from public, anon;
grant execute on function app_can_sign_handbook_ack(text) to authenticated;

drop policy if exists "handbook acks signatures read" on storage.objects;
create policy "handbook acks signatures read" on storage.objects for select to authenticated
  using (bucket_id = 'leave-forms' and name like 'handbook/%'
         and (split_part(name, '/', 2) = app_current_employee_id() or app_can_view_handbook_acks()));
drop policy if exists "handbook acks sign" on storage.objects;
create policy "handbook acks sign" on storage.objects for insert to authenticated
  with check (bucket_id = 'leave-forms' and app_can_sign_handbook_ack(name));
drop policy if exists "handbook acks re-sign" on storage.objects;
create policy "handbook acks re-sign" on storage.objects for update to authenticated
  using (bucket_id = 'leave-forms' and app_can_sign_handbook_ack(name))
  with check (bucket_id = 'leave-forms' and app_can_sign_handbook_ack(name));
