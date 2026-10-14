-- =============================================================================
-- Shantahl HRIS — Travel Allowance Request
--
--   * travel_allowance_requests: the employee files the driver's name, the
--     date, the destination and whether there's an allowance (₱500), and
--     signs; the database fills in their name, position, department,
--     branch and approver (their supervisor — or HR when there's none).
--   * The approver approves or disapproves and signs
--     (travel_allowance_decide); then the HR Manager signs it as received
--     (travel_allowance_receive).
--   * Signatures: copies of each signer's saved signature in the
--     leave-forms bucket, travel/<employee id>/<request id>/applicant|head|hr.png.
--   * Seen by the employee, their supervisor and company-wide roles.
--
-- Needs migrate_phase27_leave_forms.sql.
-- Safe to run any time, and safe to re-run.
-- Run once in the SQL Editor (Database > SQL Editor).
-- =============================================================================

create table if not exists travel_allowance_requests (
  id text primary key,
  employee_id text not null references employees (id) on delete cascade,
  travel_date date not null,
  driver_name text not null check (char_length(btrim(driver_name)) between 1 and 120),
  driver_employee_id text references employees (id) on delete set null,
  destination text not null check (char_length(btrim(destination)) between 1 and 300),
  with_allowance boolean not null,
  amount numeric(10, 2) not null default 0,
  employee_name text not null default '',
  position text not null default '',
  department text not null default '',
  branch text not null default '',
  approver_id text references employees (id) on delete set null,
  approver_name text not null default '',
  submitted_at timestamptz not null default now(),
  head_decision text check (head_decision in ('approved', 'disapproved')),
  head_reason text,
  head_signed_by text references employees (id) on delete set null,
  head_signed_name text,
  head_signed_at timestamptz,
  received_by text references employees (id) on delete set null,
  received_name text,
  received_at timestamptz
);

create index if not exists travel_allowance_employee_idx on travel_allowance_requests (employee_id, travel_date);

create or replace function app_fill_travel_allowance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  e employees%rowtype;
begin
  select * into e from employees where id = new.employee_id;
  new.employee_name := trim(both ' ' from coalesce(e.first_name, '') || ' ' || coalesce(e.last_name, ''));
  new.position := coalesce((select title from positions where id = e.position_id), '');
  new.department := coalesce((select name from departments where id = e.department_id), '');
  new.branch := coalesce((select name from branches where id = e.branch_id), '');
  new.approver_id := e.supervisor_id;
  new.approver_name := coalesce((select trim(both ' ' from coalesce(s.first_name, '') || ' ' || coalesce(s.last_name, '')) from employees s where s.id = e.supervisor_id), '');
  new.driver_name := btrim(new.driver_name);
  new.destination := btrim(new.destination);
  new.amount := case when new.with_allowance then 500 else 0 end;
  new.submitted_at := now();
  new.head_decision := null;
  new.head_reason := null;
  new.head_signed_by := null;
  new.head_signed_name := null;
  new.head_signed_at := null;
  new.received_by := null;
  new.received_name := null;
  new.received_at := null;
  return new;
end;
$$;

drop trigger if exists travel_allowance_fill on travel_allowance_requests;
create trigger travel_allowance_fill
  before insert on travel_allowance_requests
  for each row execute function app_fill_travel_allowance();

-- Who may approve: the employee's supervisor, or the HR Manager when the
-- employee has none. Never one's own.
create or replace function app_travel_head_can(req_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from travel_allowance_requests t join employees e on e.id = t.employee_id
    where t.id = req_id
      and t.employee_id <> coalesce(app_current_employee_id(), '')
      and (e.supervisor_id = app_current_employee_id() or (e.supervisor_id is null and app_is_hr_manager()))
  );
$$;

revoke all on function app_travel_head_can(text) from public, anon;
grant execute on function app_travel_head_can(text) to authenticated;

alter table travel_allowance_requests enable row level security;

drop policy if exists "travel allowance read" on travel_allowance_requests;
create policy "travel allowance read" on travel_allowance_requests for select to authenticated
  using (employee_id = app_current_employee_id() or app_is_supervisor_of(employee_id) or app_is_elevated());
drop policy if exists "travel allowance file" on travel_allowance_requests;
create policy "travel allowance file" on travel_allowance_requests for insert to authenticated
  with check (
    employee_id = app_current_employee_id()
    and app_leave_form_file_exists('travel/' || employee_id || '/' || id || '/applicant.png')
  );
drop policy if exists "travel allowance delete hr" on travel_allowance_requests;
create policy "travel allowance delete hr" on travel_allowance_requests for delete to authenticated
  using (app_is_hr_manager());

create or replace function travel_allowance_decide(p_id text, p_decision text, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me text := app_current_employee_id();
  t travel_allowance_requests%rowtype;
  nm text;
  note text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if me is null then
    raise exception 'Not signed in as an employee.';
  end if;
  select * into t from travel_allowance_requests where id = p_id for update;
  if not found then
    raise exception 'Travel allowance request not found.';
  end if;
  if not app_travel_head_can(p_id) then
    raise exception 'Only the employee''s supervisor can approve this request.';
  end if;
  if t.head_decision is not null then
    raise exception 'This request was already approved or disapproved.';
  end if;
  if p_decision not in ('approved', 'disapproved') then
    raise exception 'Choose Approved or Disapproved.';
  end if;
  if p_decision = 'disapproved' and note is null then
    raise exception 'Give the reason for disapproving.';
  end if;
  if char_length(coalesce(note, '')) > 500 then
    raise exception 'That reason is too long.';
  end if;
  if not app_leave_form_file_exists('travel/' || t.employee_id || '/' || p_id || '/head.png') then
    raise exception 'Attach your signature first.';
  end if;
  select trim(both ' ' from coalesce(first_name, '') || ' ' || coalesce(last_name, '')) into nm from employees where id = me;
  update travel_allowance_requests
     set head_decision = p_decision, head_reason = note, head_signed_by = me, head_signed_name = nm, head_signed_at = now()
   where id = p_id;
end;
$$;

revoke all on function travel_allowance_decide(text, text, text) from public, anon;
grant execute on function travel_allowance_decide(text, text, text) to authenticated;

create or replace function travel_allowance_receive(p_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me text := app_current_employee_id();
  t travel_allowance_requests%rowtype;
  nm text;
begin
  if me is null or not app_is_hr_manager() then
    raise exception 'Only the HR Manager can receive travel allowance requests.';
  end if;
  select * into t from travel_allowance_requests where id = p_id for update;
  if not found then
    raise exception 'Travel allowance request not found.';
  end if;
  if t.head_decision is null then
    raise exception 'The approver hasn''t approved or disapproved it yet.';
  end if;
  if t.received_at is not null then
    raise exception 'This request was already received.';
  end if;
  if not app_leave_form_file_exists('travel/' || t.employee_id || '/' || p_id || '/hr.png') then
    raise exception 'Attach your signature first.';
  end if;
  select trim(both ' ' from coalesce(first_name, '') || ' ' || coalesce(last_name, '')) into nm from employees where id = me;
  update travel_allowance_requests set received_by = me, received_name = nm, received_at = now() where id = p_id;
end;
$$;

revoke all on function travel_allowance_receive(text) from public, anon;
grant execute on function travel_allowance_receive(text) to authenticated;

-- Signatures: travel/<employee id>/<request id>/<applicant|head|hr>.png.
create or replace function app_can_sign_travel(path text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when path ~ '^travel/[^/]+/[^/]+/applicant\.png$' then
      split_part(path, '/', 2) = app_current_employee_id()
      and not exists (select 1 from travel_allowance_requests t where t.id = split_part(path, '/', 3))
    when path ~ '^travel/[^/]+/[^/]+/head\.png$' then app_travel_head_can(split_part(path, '/', 3))
      and exists (select 1 from travel_allowance_requests t where t.id = split_part(path, '/', 3) and t.employee_id = split_part(path, '/', 2) and t.head_decision is null)
    when path ~ '^travel/[^/]+/[^/]+/hr\.png$' then app_is_hr_manager()
      and exists (select 1 from travel_allowance_requests t where t.id = split_part(path, '/', 3) and t.employee_id = split_part(path, '/', 2) and t.head_decision is not null and t.received_at is null)
    else false
  end;
$$;

revoke all on function app_can_sign_travel(text) from public, anon;
grant execute on function app_can_sign_travel(text) to authenticated;

drop policy if exists "travel signatures read" on storage.objects;
create policy "travel signatures read" on storage.objects for select to authenticated
  using (bucket_id = 'leave-forms' and name like 'travel/%'
         and (split_part(name, '/', 2) = app_current_employee_id() or app_is_supervisor_of(split_part(name, '/', 2)) or app_is_elevated()));
drop policy if exists "travel sign" on storage.objects;
create policy "travel sign" on storage.objects for insert to authenticated
  with check (bucket_id = 'leave-forms' and app_can_sign_travel(name));
drop policy if exists "travel re-sign" on storage.objects;
create policy "travel re-sign" on storage.objects for update to authenticated
  using (bucket_id = 'leave-forms' and app_can_sign_travel(name))
  with check (bucket_id = 'leave-forms' and app_can_sign_travel(name));
drop policy if exists "travel files delete hr" on storage.objects;
create policy "travel files delete hr" on storage.objects for delete to authenticated
  using (bucket_id = 'leave-forms' and name like 'travel/%' and app_is_hr_manager());
