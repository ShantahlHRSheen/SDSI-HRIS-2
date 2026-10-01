-- =============================================================================
-- Shantahl HRIS — online Application for Leave form
--
--   * leave_forms: the company's "APPLICATION FOR LEAVE" form, one per leave
--     request. The employee fills in the details and signs; the database
--     fills in their name, designation, branch, department and department
--     head (their supervisor) from the 201 file. The certificate of leave
--     credits is stored as computed when the form was submitted.
--   * The department head (the employee's supervisor — or HR when the
--     employee has none) fills in the approval part and signs
--     (leave_form_decide), which also approves / rejects the leave request.
--     Then the HR Manager signs it as received (leave_form_receive).
--   * Signatures: each person keeps their own signature in the private
--     leave-forms bucket (signatures/<employee id>.png); signing a form puts
--     a copy in the form's folder (forms/<leave request id>/applicant.png,
--     head.png, hr.png), so a later change of signature never alters a
--     signed form.
--   * Supervisors (whatever their role) can see their team's leave requests,
--     forms and medical certificates.
--
-- Safe to run any time, and safe to re-run.
-- Run once in the SQL Editor (Database > SQL Editor).
-- =============================================================================

create or replace function app_is_supervisor_of(emp_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from employees e where e.id = emp_id and e.supervisor_id = app_current_employee_id());
$$;

revoke all on function app_is_supervisor_of(text) from public, anon;
grant execute on function app_is_supervisor_of(text) to authenticated;

drop policy if exists "leave requests read supervisor" on leave_requests;
create policy "leave requests read supervisor" on leave_requests for select to authenticated
  using (app_is_supervisor_of(employee_id));

drop policy if exists "leave attachments read supervisor" on leave_request_attachments;
create policy "leave attachments read supervisor" on leave_request_attachments for select to authenticated
  using (app_is_supervisor_of(employee_id));

drop policy if exists "leave attachments download supervisor" on storage.objects;
create policy "leave attachments download supervisor" on storage.objects for select to authenticated
  using (bucket_id = 'leave-attachments' and app_is_supervisor_of((storage.foldername(name))[1]));

create table if not exists leave_forms (
  leave_request_id text primary key references leave_requests (id) on delete cascade,
  employee_id text not null references employees (id) on delete cascade,
  application_date date not null,
  category text not null check (category in (
    'vacation_with_pay', 'vacation_without_pay', 'sick_with_pay', 'sick_without_pay',
    'maternity', 'absent_without_pay', 'bereavement_with_pay', 'bereavement_without_pay'
  )),
  sick_place text check (sick_place in ('hospital', 'out_patient')),
  sick_details text not null default '' check (char_length(sick_details) <= 300),
  reason text not null default '' check (char_length(reason) <= 1000),
  credits jsonb not null default '{}'::jsonb,
  employee_name text not null default '',
  designation text not null default '',
  branch text not null default '',
  department text not null default '',
  department_head_id text references employees (id) on delete set null,
  department_head text not null default '',
  submitted_at timestamptz not null default now(),
  head_days jsonb,
  head_decision text check (head_decision in ('approved', 'disapproved')),
  head_reason text,
  head_signed_by text references employees (id) on delete set null,
  head_signed_name text,
  head_signed_at timestamptz,
  received_by text references employees (id) on delete set null,
  received_name text,
  received_at timestamptz
);

create or replace function app_leave_form_file_exists(path text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from storage.objects o where o.bucket_id = 'leave-forms' and o.name = path);
$$;

revoke all on function app_leave_form_file_exists(text) from public, anon;
grant execute on function app_leave_form_file_exists(text) to authenticated;

-- Who may fill in the department head's part: the employee's supervisor, or
-- the HR Manager when the employee has no supervisor. Never one's own.
create or replace function app_leave_form_head_can(req_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from leave_requests r join employees e on e.id = r.employee_id
    where r.id = req_id
      and r.employee_id <> coalesce(app_current_employee_id(), '')
      and (e.supervisor_id = app_current_employee_id() or (e.supervisor_id is null and app_is_hr_manager()))
  );
$$;

revoke all on function app_leave_form_head_can(text) from public, anon;
grant execute on function app_leave_form_head_can(text) to authenticated;

create or replace function app_can_view_leave_form(req_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from leave_requests r
    where r.id = req_id
      and (r.employee_id = app_current_employee_id() or app_is_supervisor_of(r.employee_id) or app_is_elevated())
  );
$$;

revoke all on function app_can_view_leave_form(text) from public, anon;
grant execute on function app_can_view_leave_form(text) to authenticated;

-- The employee's details for the form, from the 201 file.
create or replace function app_fill_leave_form()
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
  new.designation := coalesce((select title from positions where id = e.position_id), '');
  new.branch := coalesce((select name from branches where id = e.branch_id), '');
  new.department := coalesce((select name from departments where id = e.department_id), '');
  new.department_head_id := e.supervisor_id;
  new.department_head := coalesce((select trim(both ' ' from coalesce(s.first_name, '') || ' ' || coalesce(s.last_name, '')) from employees s where s.id = e.supervisor_id), '');
  new.submitted_at := now();
  new.head_days := null;
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

drop trigger if exists leave_forms_fill on leave_forms;
create trigger leave_forms_fill
  before insert on leave_forms
  for each row execute function app_fill_leave_form();

alter table leave_forms enable row level security;

drop policy if exists "leave forms read" on leave_forms;
create policy "leave forms read" on leave_forms for select to authenticated
  using (app_can_view_leave_form(leave_request_id));

-- The employee submits the form for their own pending request, once signed.
drop policy if exists "leave forms submit" on leave_forms;
create policy "leave forms submit" on leave_forms for insert to authenticated
  with check (
    employee_id = app_current_employee_id()
    and exists (select 1 from leave_requests r where r.id = leave_request_id and r.employee_id = leave_forms.employee_id and r.status = 'pending')
    and app_leave_form_file_exists('forms/' || leave_request_id || '/applicant.png')
  );
-- No update/delete policies: the head's and HR's parts go through the
-- functions below.

create or replace function leave_form_decide(p_request text, p_decision text, p_reason text, p_days jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me text := app_current_employee_id();
  f leave_forms%rowtype;
  nm text;
  note text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if me is null then
    raise exception 'Not signed in as an employee.';
  end if;
  select * into f from leave_forms where leave_request_id = p_request for update;
  if not found then
    raise exception 'Leave form not found.';
  end if;
  if not app_leave_form_head_can(p_request) then
    raise exception 'Only the employee''s department head can approve this leave.';
  end if;
  if f.head_decision is not null then
    raise exception 'This leave form was already approved or disapproved.';
  end if;
  if p_decision not in ('approved', 'disapproved') then
    raise exception 'Choose Approved or Disapproved.';
  end if;
  if p_decision = 'disapproved' and note is null then
    raise exception 'Give the reason for disapproving.';
  end if;
  if char_length(coalesce(note, '')) > 500 or pg_column_size(p_days) > 2000 then
    raise exception 'That is too long.';
  end if;
  if not app_leave_form_file_exists('forms/' || p_request || '/head.png') then
    raise exception 'Attach your signature first.';
  end if;
  select trim(both ' ' from coalesce(first_name, '') || ' ' || coalesce(last_name, '')) into nm from employees where id = me;
  update leave_forms
     set head_days = coalesce(p_days, '{}'::jsonb), head_decision = p_decision, head_reason = note,
         head_signed_by = me, head_signed_name = nm, head_signed_at = now()
   where leave_request_id = p_request;
  update leave_requests
     set status = (case when p_decision = 'approved' then 'approved' else 'rejected' end)::request_status,
         decided_by = me, decided_at = now(), decision_note = note
   where id = p_request;
end;
$$;

revoke all on function leave_form_decide(text, text, text, jsonb) from public, anon;
grant execute on function leave_form_decide(text, text, text, jsonb) to authenticated;

create or replace function leave_form_receive(p_request text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me text := app_current_employee_id();
  f leave_forms%rowtype;
  nm text;
begin
  if me is null or not app_is_hr_manager() then
    raise exception 'Only the HR Manager can receive leave forms.';
  end if;
  select * into f from leave_forms where leave_request_id = p_request for update;
  if not found then
    raise exception 'Leave form not found.';
  end if;
  if f.head_decision is null then
    raise exception 'The department head hasn''t approved or disapproved it yet.';
  end if;
  if f.received_at is not null then
    raise exception 'This leave form was already received.';
  end if;
  if not app_leave_form_file_exists('forms/' || p_request || '/hr.png') then
    raise exception 'Attach your signature first.';
  end if;
  select trim(both ' ' from coalesce(first_name, '') || ' ' || coalesce(last_name, '')) into nm from employees where id = me;
  update leave_forms set received_by = me, received_name = nm, received_at = now() where leave_request_id = p_request;
end;
$$;

revoke all on function leave_form_receive(text) from public, anon;
grant execute on function leave_form_receive(text) to authenticated;

-- The signed-in employee's details for a new form (their department head
-- included, whom they may not otherwise be allowed to look up).
create or replace function my_leave_form_details()
returns table (designation text, branch text, department text, department_head text)
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(p.title, ''), coalesce(b.name, ''), coalesce(d.name, ''),
         coalesce(trim(both ' ' from coalesce(s.first_name, '') || ' ' || coalesce(s.last_name, '')), '')
  from employees e
  left join positions p on p.id = e.position_id
  left join branches b on b.id = e.branch_id
  left join departments d on d.id = e.department_id
  left join employees s on s.id = e.supervisor_id
  where e.id = app_current_employee_id();
$$;

revoke all on function my_leave_form_details() from public, anon;
grant execute on function my_leave_form_details() to authenticated;

-- Signatures: private bucket, PNG only, small.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('leave-forms', 'leave-forms', false, 1048576, array['image/png'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Own signature: signatures/<employee id>.png
drop policy if exists "leave forms own signature read" on storage.objects;
create policy "leave forms own signature read" on storage.objects for select to authenticated
  using (bucket_id = 'leave-forms' and name = 'signatures/' || app_current_employee_id() || '.png');
drop policy if exists "leave forms own signature upload" on storage.objects;
create policy "leave forms own signature upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'leave-forms' and name = 'signatures/' || app_current_employee_id() || '.png');
drop policy if exists "leave forms own signature replace" on storage.objects;
create policy "leave forms own signature replace" on storage.objects for update to authenticated
  using (bucket_id = 'leave-forms' and name = 'signatures/' || app_current_employee_id() || '.png')
  with check (bucket_id = 'leave-forms' and name = 'signatures/' || app_current_employee_id() || '.png');
drop policy if exists "leave forms own signature remove" on storage.objects;
create policy "leave forms own signature remove" on storage.objects for delete to authenticated
  using (bucket_id = 'leave-forms' and name = 'signatures/' || app_current_employee_id() || '.png');

-- A form's signatures: forms/<leave request id>/<applicant|head|hr>.png —
-- viewable by whoever can see the form; each placed by its signer while that
-- step is still open.
create or replace function app_can_sign_leave_form(path text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when path ~ '^forms/[^/]+/applicant\.png$' then exists (
      select 1 from leave_requests r
      where r.id = split_part(path, '/', 2) and r.employee_id = app_current_employee_id() and r.status = 'pending'
        and not exists (select 1 from leave_forms f where f.leave_request_id = r.id))
    when path ~ '^forms/[^/]+/head\.png$' then app_leave_form_head_can(split_part(path, '/', 2))
      and exists (select 1 from leave_forms f where f.leave_request_id = split_part(path, '/', 2) and f.head_decision is null)
    when path ~ '^forms/[^/]+/hr\.png$' then app_is_hr_manager()
      and exists (select 1 from leave_forms f where f.leave_request_id = split_part(path, '/', 2) and f.head_decision is not null and f.received_at is null)
    else false
  end;
$$;

revoke all on function app_can_sign_leave_form(text) from public, anon;
grant execute on function app_can_sign_leave_form(text) to authenticated;

drop policy if exists "leave forms signatures read" on storage.objects;
create policy "leave forms signatures read" on storage.objects for select to authenticated
  using (bucket_id = 'leave-forms' and name like 'forms/%' and app_can_view_leave_form(split_part(name, '/', 2)));
drop policy if exists "leave forms sign" on storage.objects;
create policy "leave forms sign" on storage.objects for insert to authenticated
  with check (bucket_id = 'leave-forms' and app_can_sign_leave_form(name));
drop policy if exists "leave forms re-sign" on storage.objects;
create policy "leave forms re-sign" on storage.objects for update to authenticated
  using (bucket_id = 'leave-forms' and app_can_sign_leave_form(name))
  with check (bucket_id = 'leave-forms' and app_can_sign_leave_form(name));
