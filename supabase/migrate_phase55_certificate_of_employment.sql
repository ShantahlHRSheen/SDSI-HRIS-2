-- =============================================================================
-- Phase 55: Certificate of Employment (COE)
--
--   * coe_requests: an employee asks for a COE (purpose, with or without
--     compensation); HR can also start one for anyone, former employees
--     included. The database fills in the name and when / who asked.
--   * The HR Manager issues it (coe_issue) with the certificate's wording
--     saved in `data`, signed with their saved signature (a copy in the
--     leave-forms bucket at coe/<employee id>/<request id>/hr.png), or
--     declines it with a reason (coe_decline).
--   * Seen only by the employee and HR (it can show compensation).
--
-- Needs migrate_phase27_leave_forms.sql.
-- Safe to run any time, and safe to re-run.
-- =============================================================================

create table if not exists coe_requests (
  id text primary key,
  employee_id text not null references employees (id) on delete cascade,
  employee_name text not null default '',
  purpose text not null default '' check (char_length(purpose) <= 200),
  with_compensation boolean not null default false,
  status text not null default 'pending' check (status in ('pending', 'issued', 'declined')),
  requested_by text references employees (id) on delete set null,
  requested_at timestamptz not null default now(),
  decided_by text references employees (id) on delete set null,
  decided_name text,
  decided_at timestamptz,
  decline_reason text,
  data jsonb
);

create index if not exists coe_requests_employee_idx on coe_requests (employee_id, requested_at);

create or replace function app_fill_coe_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.employee_name := coalesce((select trim(both ' ' from coalesce(first_name, '') || ' ' || coalesce(last_name, '')) from employees where id = new.employee_id), '');
  new.purpose := btrim(coalesce(new.purpose, ''));
  new.status := 'pending';
  new.requested_by := app_current_employee_id();
  new.requested_at := now();
  new.decided_by := null;
  new.decided_name := null;
  new.decided_at := null;
  new.decline_reason := null;
  new.data := null;
  return new;
end;
$$;

drop trigger if exists coe_request_fill on coe_requests;
create trigger coe_request_fill
  before insert on coe_requests
  for each row execute function app_fill_coe_request();

alter table coe_requests enable row level security;

drop policy if exists "coe read" on coe_requests;
create policy "coe read" on coe_requests for select to authenticated
  using (employee_id = app_current_employee_id() or app_is_hr_manager());
drop policy if exists "coe request" on coe_requests;
create policy "coe request" on coe_requests for insert to authenticated
  with check (employee_id = app_current_employee_id() or app_is_hr_manager());
drop policy if exists "coe delete hr" on coe_requests;
create policy "coe delete hr" on coe_requests for delete to authenticated
  using (app_is_hr_manager());
-- No update policy: issuing / declining go through the functions below.

create or replace function coe_issue(p_id text, p_data jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me text := app_current_employee_id();
  r coe_requests%rowtype;
  nm text;
begin
  if me is null or not app_is_hr_manager() then
    raise exception 'Only the HR Manager can issue a Certificate of Employment.';
  end if;
  select * into r from coe_requests where id = p_id for update;
  if not found then
    raise exception 'COE request not found.';
  end if;
  if r.status <> 'pending' then
    raise exception 'This COE request was already issued or declined.';
  end if;
  if jsonb_typeof(p_data) <> 'object' or octet_length(p_data::text) > 20000 then
    raise exception 'The certificate''s details are missing.';
  end if;
  if not app_leave_form_file_exists('coe/' || r.employee_id || '/' || p_id || '/hr.png') then
    raise exception 'Attach your signature first.';
  end if;
  select trim(both ' ' from coalesce(first_name, '') || ' ' || coalesce(last_name, '')) into nm from employees where id = me;
  update coe_requests
     set status = 'issued', data = p_data, decided_by = me, decided_name = nm, decided_at = now()
   where id = p_id;
end;
$$;

revoke all on function coe_issue(text, jsonb) from public, anon;
grant execute on function coe_issue(text, jsonb) to authenticated;

create or replace function coe_decline(p_id text, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me text := app_current_employee_id();
  r coe_requests%rowtype;
  nm text;
  note text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if me is null or not app_is_hr_manager() then
    raise exception 'Only the HR Manager can decline a COE request.';
  end if;
  select * into r from coe_requests where id = p_id for update;
  if not found then
    raise exception 'COE request not found.';
  end if;
  if r.status <> 'pending' then
    raise exception 'This COE request was already issued or declined.';
  end if;
  if note is null or char_length(note) > 500 then
    raise exception 'Give the reason for declining (up to 500 characters).';
  end if;
  select trim(both ' ' from coalesce(first_name, '') || ' ' || coalesce(last_name, '')) into nm from employees where id = me;
  update coe_requests
     set status = 'declined', decline_reason = note, decided_by = me, decided_name = nm, decided_at = now()
   where id = p_id;
end;
$$;

revoke all on function coe_decline(text, text) from public, anon;
grant execute on function coe_decline(text, text) to authenticated;

-- HR's signature on a COE: coe/<employee id>/<request id>/hr.png, while
-- the request is pending.
create or replace function app_can_sign_coe(path text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select path ~ '^coe/[^/]+/[^/]+/hr\.png$'
    and app_is_hr_manager()
    and exists (select 1 from coe_requests r
                where r.id = split_part(path, '/', 3) and r.employee_id = split_part(path, '/', 2) and r.status = 'pending');
$$;

revoke all on function app_can_sign_coe(text) from public, anon;
grant execute on function app_can_sign_coe(text) to authenticated;

drop policy if exists "coe signatures read" on storage.objects;
create policy "coe signatures read" on storage.objects for select to authenticated
  using (bucket_id = 'leave-forms' and name like 'coe/%'
         and (split_part(name, '/', 2) = app_current_employee_id() or app_is_hr_manager()));
drop policy if exists "coe sign" on storage.objects;
create policy "coe sign" on storage.objects for insert to authenticated
  with check (bucket_id = 'leave-forms' and app_can_sign_coe(name));
drop policy if exists "coe re-sign" on storage.objects;
create policy "coe re-sign" on storage.objects for update to authenticated
  using (bucket_id = 'leave-forms' and app_can_sign_coe(name))
  with check (bucket_id = 'leave-forms' and app_can_sign_coe(name));
drop policy if exists "coe files delete hr" on storage.objects;
create policy "coe files delete hr" on storage.objects for delete to authenticated
  using (bucket_id = 'leave-forms' and name like 'coe/%' and app_is_hr_manager());
