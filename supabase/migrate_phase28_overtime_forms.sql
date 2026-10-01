-- =============================================================================
-- Shantahl HRIS — online Overtime Authorization Form
--
--   * overtime_forms: the company's "SDSI Overtime Authorization Form", one
--     per overtime request. The employee fills in the overtime details and
--     signs; the database fills in their name, position, branch, department
--     and department head (their supervisor) from the 201 file.
--   * The department head (the supervisor — or HR when there's none)
--     approves (with the approved overtime hours) or disapproves, and signs
--     (overtime_form_decide). Disapproving rejects the request.
--   * The HR Manager then verifies it (the request is approved for the
--     approved hours, so it counts in payroll), disapproves it, or returns
--     it for clarification (overtime_form_hr). A returned form is corrected
--     and re-signed by the employee (overtime_form_resubmit) and goes back
--     to the department head.
--   * Signatures use the same private leave-forms bucket and the same saved
--     signature (signatures/<employee id>.png) as the leave form; a form's
--     copies are under ot/<overtime request id>/applicant|head|hr.png.
--   * Supervisors (whatever their role) can see their team's overtime.
--
-- Needs migrate_phase27_leave_forms.sql.
-- Safe to run any time, and safe to re-run.
-- Run once in the SQL Editor (Database > SQL Editor).
-- =============================================================================

drop policy if exists "overtime requests read supervisor" on overtime_requests;
create policy "overtime requests read supervisor" on overtime_requests for select to authenticated
  using (app_is_supervisor_of(employee_id));

create table if not exists overtime_forms (
  overtime_request_id text primary key references overtime_requests (id) on delete cascade,
  employee_id text not null references employees (id) on delete cascade,
  schedule text not null default '' check (char_length(schedule) <= 120),
  ot_date date not null,
  hours_requested numeric(5, 2) not null check (hours_requested > 0 and hours_requested <= 24),
  tasks text not null check (char_length(btrim(tasks)) between 1 and 1000),
  reason text not null check (char_length(btrim(reason)) between 1 and 1000),
  employee_name text not null default '',
  position text not null default '',
  branch text not null default '',
  department text not null default '',
  department_head_id text references employees (id) on delete set null,
  department_head text not null default '',
  submitted_at timestamptz not null default now(),
  resubmissions int not null default 0,
  head_decision text check (head_decision in ('approved', 'disapproved')),
  head_hours numeric(5, 2),
  head_reason text,
  head_signed_by text references employees (id) on delete set null,
  head_signed_name text,
  head_signed_at timestamptz,
  hr_decision text check (hr_decision in ('verified', 'disapproved', 'returned')),
  hr_reason text,
  hr_signed_by text references employees (id) on delete set null,
  hr_signed_name text,
  hr_signed_at timestamptz
);

create or replace function app_overtime_form_head_can(req_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from overtime_requests r join employees e on e.id = r.employee_id
    where r.id = req_id
      and r.employee_id <> coalesce(app_current_employee_id(), '')
      and (e.supervisor_id = app_current_employee_id() or (e.supervisor_id is null and app_is_hr_manager()))
  );
$$;

revoke all on function app_overtime_form_head_can(text) from public, anon;
grant execute on function app_overtime_form_head_can(text) to authenticated;

create or replace function app_can_view_overtime_form(req_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from overtime_requests r
    where r.id = req_id
      and (r.employee_id = app_current_employee_id() or app_is_supervisor_of(r.employee_id) or app_is_elevated())
  );
$$;

revoke all on function app_can_view_overtime_form(text) from public, anon;
grant execute on function app_can_view_overtime_form(text) to authenticated;

create or replace function app_fill_overtime_form()
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
  new.resubmissions := 0;
  new.head_decision := null;
  new.head_hours := null;
  new.head_reason := null;
  new.head_signed_by := null;
  new.head_signed_name := null;
  new.head_signed_at := null;
  new.hr_decision := null;
  new.hr_reason := null;
  new.hr_signed_by := null;
  new.hr_signed_name := null;
  new.hr_signed_at := null;
  return new;
end;
$$;

drop trigger if exists overtime_forms_fill on overtime_forms;
create trigger overtime_forms_fill
  before insert on overtime_forms
  for each row execute function app_fill_overtime_form();

alter table overtime_forms enable row level security;

drop policy if exists "overtime forms read" on overtime_forms;
create policy "overtime forms read" on overtime_forms for select to authenticated
  using (app_can_view_overtime_form(overtime_request_id));

drop policy if exists "overtime forms submit" on overtime_forms;
create policy "overtime forms submit" on overtime_forms for insert to authenticated
  with check (
    employee_id = app_current_employee_id()
    and exists (select 1 from overtime_requests r where r.id = overtime_request_id and r.employee_id = overtime_forms.employee_id and r.status = 'pending')
    and app_leave_form_file_exists('ot/' || overtime_request_id || '/applicant.png')
  );
-- No update/delete policies: the rest goes through the functions below.

create or replace function overtime_form_decide(p_request text, p_decision text, p_hours numeric, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me text := app_current_employee_id();
  f overtime_forms%rowtype;
  nm text;
  note text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if me is null then
    raise exception 'Not signed in as an employee.';
  end if;
  select * into f from overtime_forms where overtime_request_id = p_request for update;
  if not found then
    raise exception 'Overtime form not found.';
  end if;
  if not app_overtime_form_head_can(p_request) then
    raise exception 'Only the employee''s department head can approve this overtime.';
  end if;
  if f.head_decision is not null then
    raise exception 'This overtime form was already approved or disapproved.';
  end if;
  if p_decision not in ('approved', 'disapproved') then
    raise exception 'Choose Approved or Disapproved.';
  end if;
  if p_decision = 'approved' and (p_hours is null or p_hours <= 0 or p_hours > f.hours_requested) then
    raise exception 'Approved overtime hours must be more than 0 and at most the % hours requested.', f.hours_requested;
  end if;
  if p_decision = 'disapproved' and note is null then
    raise exception 'Give the reason of disapproval.';
  end if;
  if char_length(coalesce(note, '')) > 500 then
    raise exception 'That reason is too long.';
  end if;
  if not app_leave_form_file_exists('ot/' || p_request || '/head.png') then
    raise exception 'Attach your signature first.';
  end if;
  select trim(both ' ' from coalesce(first_name, '') || ' ' || coalesce(last_name, '')) into nm from employees where id = me;
  update overtime_forms
     set head_decision = p_decision, head_hours = case when p_decision = 'approved' then p_hours end, head_reason = note,
         head_signed_by = me, head_signed_name = nm, head_signed_at = now()
   where overtime_request_id = p_request;
  if p_decision = 'disapproved' then
    update overtime_requests set status = 'rejected', decided_by = me, decided_at = now(), decision_note = note where id = p_request;
  end if;
end;
$$;

revoke all on function overtime_form_decide(text, text, numeric, text) from public, anon;
grant execute on function overtime_form_decide(text, text, numeric, text) to authenticated;

create or replace function overtime_form_hr(p_request text, p_decision text, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me text := app_current_employee_id();
  f overtime_forms%rowtype;
  nm text;
  note text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if me is null or not app_is_hr_manager() then
    raise exception 'Only the HR Manager can verify overtime forms.';
  end if;
  select * into f from overtime_forms where overtime_request_id = p_request for update;
  if not found then
    raise exception 'Overtime form not found.';
  end if;
  if f.head_decision is distinct from 'approved' or f.hr_decision is not null then
    raise exception 'This overtime form isn''t waiting for HR.';
  end if;
  if p_decision not in ('verified', 'disapproved', 'returned') then
    raise exception 'Choose Verified, Disapproved or Returned for clarification.';
  end if;
  if p_decision <> 'verified' and note is null then
    raise exception 'Give the reason.';
  end if;
  if char_length(coalesce(note, '')) > 500 then
    raise exception 'That reason is too long.';
  end if;
  if not app_leave_form_file_exists('ot/' || p_request || '/hr.png') then
    raise exception 'Attach your signature first.';
  end if;
  select trim(both ' ' from coalesce(first_name, '') || ' ' || coalesce(last_name, '')) into nm from employees where id = me;
  update overtime_forms
     set hr_decision = p_decision, hr_reason = note, hr_signed_by = me, hr_signed_name = nm, hr_signed_at = now()
   where overtime_request_id = p_request;
  if p_decision = 'verified' then
    update overtime_requests set status = 'approved', hours = f.head_hours, decided_by = me, decided_at = now(), decision_note = null where id = p_request;
  elsif p_decision = 'disapproved' then
    update overtime_requests set status = 'rejected', decided_by = me, decided_at = now(), decision_note = note where id = p_request;
  end if;
end;
$$;

revoke all on function overtime_form_hr(text, text, text) from public, anon;
grant execute on function overtime_form_hr(text, text, text) to authenticated;

-- A form returned for clarification: the employee corrects it (re-signing
-- it first) and it goes back to the department head.
create or replace function overtime_form_resubmit(p_request text, p_schedule text, p_date date, p_hours numeric, p_tasks text, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me text := app_current_employee_id();
  f overtime_forms%rowtype;
begin
  select * into f from overtime_forms where overtime_request_id = p_request for update;
  if not found or f.employee_id is distinct from me then
    raise exception 'Overtime form not found.';
  end if;
  if f.hr_decision is distinct from 'returned' then
    raise exception 'Only a form returned for clarification can be resubmitted.';
  end if;
  if p_hours is null or p_hours <= 0 or p_hours > 24 then
    raise exception 'Enter the overtime hours (up to 24).';
  end if;
  if char_length(btrim(coalesce(p_tasks, ''))) not between 1 and 1000 or char_length(btrim(coalesce(p_reason, ''))) not between 1 and 1000 then
    raise exception 'Fill in the tasks and the reason.';
  end if;
  update overtime_forms
     set schedule = left(coalesce(p_schedule, ''), 120), ot_date = p_date, hours_requested = p_hours,
         tasks = btrim(p_tasks), reason = btrim(p_reason), submitted_at = now(), resubmissions = f.resubmissions + 1,
         head_decision = null, head_hours = null, head_reason = null, head_signed_by = null, head_signed_name = null, head_signed_at = null,
         hr_decision = null, hr_reason = null, hr_signed_by = null, hr_signed_name = null, hr_signed_at = null
   where overtime_request_id = p_request;
  update overtime_requests set date = p_date, hours = p_hours, reason = btrim(p_reason), status = 'pending', decided_by = null, decided_at = null, decision_note = null where id = p_request;
end;
$$;

revoke all on function overtime_form_resubmit(text, text, date, numeric, text, text) from public, anon;
grant execute on function overtime_form_resubmit(text, text, date, numeric, text, text) to authenticated;

-- A form's signatures: ot/<overtime request id>/<applicant|head|hr>.png in
-- the leave-forms bucket, each placed by its signer while that step is open.
create or replace function app_can_sign_overtime_form(path text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when path ~ '^ot/[^/]+/applicant\.png$' then exists (
      select 1 from overtime_requests r
      where r.id = split_part(path, '/', 2) and r.employee_id = app_current_employee_id() and r.status = 'pending'
        and not exists (select 1 from overtime_forms f where f.overtime_request_id = r.id and f.hr_decision is distinct from 'returned'))
    when path ~ '^ot/[^/]+/head\.png$' then app_overtime_form_head_can(split_part(path, '/', 2))
      and exists (select 1 from overtime_forms f where f.overtime_request_id = split_part(path, '/', 2) and f.head_decision is null)
    when path ~ '^ot/[^/]+/hr\.png$' then app_is_hr_manager()
      and exists (select 1 from overtime_forms f where f.overtime_request_id = split_part(path, '/', 2) and f.head_decision = 'approved' and f.hr_decision is null)
    else false
  end;
$$;

revoke all on function app_can_sign_overtime_form(text) from public, anon;
grant execute on function app_can_sign_overtime_form(text) to authenticated;

drop policy if exists "overtime forms signatures read" on storage.objects;
create policy "overtime forms signatures read" on storage.objects for select to authenticated
  using (bucket_id = 'leave-forms' and name like 'ot/%' and app_can_view_overtime_form(split_part(name, '/', 2)));
drop policy if exists "overtime forms sign" on storage.objects;
create policy "overtime forms sign" on storage.objects for insert to authenticated
  with check (bucket_id = 'leave-forms' and app_can_sign_overtime_form(name));
drop policy if exists "overtime forms re-sign" on storage.objects;
create policy "overtime forms re-sign" on storage.objects for update to authenticated
  using (bucket_id = 'leave-forms' and app_can_sign_overtime_form(name))
  with check (bucket_id = 'leave-forms' and app_can_sign_overtime_form(name));
