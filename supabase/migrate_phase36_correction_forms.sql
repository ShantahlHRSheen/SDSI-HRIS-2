-- =============================================================================
-- Shantahl HRIS — online Attendance Correction Form
--
--   * correction_forms: one per attendance correction request. The employee
--     fills in the date, what to correct, the correct time in / out and the
--     reason, and signs; the database fills in their name, position, branch,
--     department and department head (their supervisor) from the 201 file.
--   * The department head (the supervisor — or HR when there's none)
--     approves or disapproves and signs (correction_form_decide), which also
--     approves / rejects the correction request.
--   * Then the HR Manager signs it as received (correction_form_receive).
--   * Signatures use the same private leave-forms bucket and saved signature
--     (signatures/<employee id>.png) as the leave and overtime forms; a
--     form's copies are under corr/<request id>/applicant|head|hr.png.
--   * Supervisors (whatever their role) can see their team's corrections.
--
-- Needs migrate_phase27_leave_forms.sql.
-- Safe to run any time, and safe to re-run.
-- Run once in the SQL Editor (Database > SQL Editor).
-- =============================================================================

drop policy if exists "correction requests read supervisor" on attendance_correction_requests;
create policy "correction requests read supervisor" on attendance_correction_requests for select to authenticated
  using (app_is_supervisor_of(employee_id));

create table if not exists correction_forms (
  correction_request_id text primary key references attendance_correction_requests (id) on delete cascade,
  employee_id text not null references employees (id) on delete cascade,
  correction_date date not null,
  correction_type text not null check (correction_type in ('missed_in', 'missed_out', 'missed_both', 'wrong_time', 'device_failure', 'other')),
  time_in text check (time_in ~ '^[0-2][0-9]:[0-5][0-9]$'),
  time_out text check (time_out ~ '^[0-2][0-9]:[0-5][0-9]$'),
  reason text not null check (char_length(btrim(reason)) between 1 and 1000),
  employee_name text not null default '',
  position text not null default '',
  branch text not null default '',
  department text not null default '',
  department_head_id text references employees (id) on delete set null,
  department_head text not null default '',
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

create or replace function app_correction_form_head_can(req_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from attendance_correction_requests r join employees e on e.id = r.employee_id
    where r.id = req_id
      and r.employee_id <> coalesce(app_current_employee_id(), '')
      and (e.supervisor_id = app_current_employee_id() or (e.supervisor_id is null and app_is_hr_manager()))
  );
$$;

revoke all on function app_correction_form_head_can(text) from public, anon;
grant execute on function app_correction_form_head_can(text) to authenticated;

create or replace function app_can_view_correction_form(req_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from attendance_correction_requests r
    where r.id = req_id
      and (r.employee_id = app_current_employee_id() or app_is_supervisor_of(r.employee_id) or app_is_elevated())
  );
$$;

revoke all on function app_can_view_correction_form(text) from public, anon;
grant execute on function app_can_view_correction_form(text) to authenticated;

create or replace function app_fill_correction_form()
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
  new.branch := coalesce((select name from branches where id = e.branch_id), '');
  new.department := coalesce((select name from departments where id = e.department_id), '');
  new.department_head_id := e.supervisor_id;
  new.department_head := coalesce((select trim(both ' ' from coalesce(s.first_name, '') || ' ' || coalesce(s.last_name, '')) from employees s where s.id = e.supervisor_id), '');
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

drop trigger if exists correction_forms_fill on correction_forms;
create trigger correction_forms_fill
  before insert on correction_forms
  for each row execute function app_fill_correction_form();

alter table correction_forms enable row level security;

drop policy if exists "correction forms read" on correction_forms;
create policy "correction forms read" on correction_forms for select to authenticated
  using (app_can_view_correction_form(correction_request_id));

-- The employee submits the form for their own pending request, once signed.
drop policy if exists "correction forms submit" on correction_forms;
create policy "correction forms submit" on correction_forms for insert to authenticated
  with check (
    employee_id = app_current_employee_id()
    and exists (select 1 from attendance_correction_requests r where r.id = correction_request_id and r.employee_id = correction_forms.employee_id and r.status = 'pending')
    and app_leave_form_file_exists('corr/' || correction_request_id || '/applicant.png')
  );
-- No update/delete policies: the head's and HR's parts go through the
-- functions below.

create or replace function correction_form_decide(p_request text, p_decision text, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me text := app_current_employee_id();
  f correction_forms%rowtype;
  nm text;
  note text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if me is null then
    raise exception 'Not signed in as an employee.';
  end if;
  select * into f from correction_forms where correction_request_id = p_request for update;
  if not found then
    raise exception 'Attendance correction form not found.';
  end if;
  if not app_correction_form_head_can(p_request) then
    raise exception 'Only the employee''s department head can approve this correction.';
  end if;
  if f.head_decision is not null then
    raise exception 'This form was already approved or disapproved.';
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
  if not app_leave_form_file_exists('corr/' || p_request || '/head.png') then
    raise exception 'Attach your signature first.';
  end if;
  select trim(both ' ' from coalesce(first_name, '') || ' ' || coalesce(last_name, '')) into nm from employees where id = me;
  update correction_forms
     set head_decision = p_decision, head_reason = note, head_signed_by = me, head_signed_name = nm, head_signed_at = now()
   where correction_request_id = p_request;
  update attendance_correction_requests
     set status = (case when p_decision = 'approved' then 'approved' else 'rejected' end)::request_status,
         decided_by = me, decided_at = now(), decision_note = note
   where id = p_request;
end;
$$;

revoke all on function correction_form_decide(text, text, text) from public, anon;
grant execute on function correction_form_decide(text, text, text) to authenticated;

create or replace function correction_form_receive(p_request text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me text := app_current_employee_id();
  f correction_forms%rowtype;
  nm text;
begin
  if me is null or not app_is_hr_manager() then
    raise exception 'Only the HR Manager can receive attendance correction forms.';
  end if;
  select * into f from correction_forms where correction_request_id = p_request for update;
  if not found then
    raise exception 'Attendance correction form not found.';
  end if;
  if f.head_decision is null then
    raise exception 'The department head hasn''t approved or disapproved it yet.';
  end if;
  if f.received_at is not null then
    raise exception 'This form was already received.';
  end if;
  if not app_leave_form_file_exists('corr/' || p_request || '/hr.png') then
    raise exception 'Attach your signature first.';
  end if;
  select trim(both ' ' from coalesce(first_name, '') || ' ' || coalesce(last_name, '')) into nm from employees where id = me;
  update correction_forms set received_by = me, received_name = nm, received_at = now() where correction_request_id = p_request;
end;
$$;

revoke all on function correction_form_receive(text) from public, anon;
grant execute on function correction_form_receive(text) to authenticated;

-- A form's signatures: corr/<request id>/<applicant|head|hr>.png in the
-- leave-forms bucket, each placed by its signer while that step is open.
create or replace function app_can_sign_correction_form(path text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when path ~ '^corr/[^/]+/applicant\.png$' then exists (
      select 1 from attendance_correction_requests r
      where r.id = split_part(path, '/', 2) and r.employee_id = app_current_employee_id() and r.status = 'pending'
        and not exists (select 1 from correction_forms f where f.correction_request_id = r.id))
    when path ~ '^corr/[^/]+/head\.png$' then app_correction_form_head_can(split_part(path, '/', 2))
      and exists (select 1 from correction_forms f where f.correction_request_id = split_part(path, '/', 2) and f.head_decision is null)
    when path ~ '^corr/[^/]+/hr\.png$' then app_is_hr_manager()
      and exists (select 1 from correction_forms f where f.correction_request_id = split_part(path, '/', 2) and f.head_decision is not null and f.received_at is null)
    else false
  end;
$$;

revoke all on function app_can_sign_correction_form(text) from public, anon;
grant execute on function app_can_sign_correction_form(text) to authenticated;

drop policy if exists "correction forms signatures read" on storage.objects;
create policy "correction forms signatures read" on storage.objects for select to authenticated
  using (bucket_id = 'leave-forms' and name like 'corr/%' and app_can_view_correction_form(split_part(name, '/', 2)));
drop policy if exists "correction forms sign" on storage.objects;
create policy "correction forms sign" on storage.objects for insert to authenticated
  with check (bucket_id = 'leave-forms' and app_can_sign_correction_form(name));
drop policy if exists "correction forms re-sign" on storage.objects;
create policy "correction forms re-sign" on storage.objects for update to authenticated
  using (bucket_id = 'leave-forms' and app_can_sign_correction_form(name))
  with check (bucket_id = 'leave-forms' and app_can_sign_correction_form(name));
