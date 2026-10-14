-- =============================================================================
-- Shantahl HRIS — branch approver on leave, overtime and attendance
-- correction forms
--
--   * branches.approver_id: the branch's approver (e.g. Manila: Mary Jane
--     Pedrano). For an employee of that branch, a form now goes:
--     employee → branch approver → department head (supervisor) → HR.
--     The step is skipped when the employee is the approver themself, or the
--     approver is already their supervisor.
--   * Each form keeps who the branch approver was (branch_approver_id /
--     branch_approver) and their decision and signature
--     (<forms|ot|corr>/<request id>/branch.png in the leave-forms bucket).
--   * form_branch_decide(kind, request, decision, reason): the branch
--     approver approves (the form goes on to the department head) or
--     disapproves (the request is rejected and the form ends there).
--   * The department head can only decide once the branch approver has
--     approved. An overtime form returned by HR for clarification goes back
--     to the branch approver first.
--
-- Needs migrate_phase27, phase28, phase36 and phase37.
-- Safe to run any time, and safe to re-run.
-- Run once in the SQL Editor (Database > SQL Editor).
-- =============================================================================

alter table branches add column if not exists approver_id text references employees (id) on delete set null;

alter table leave_forms add column if not exists branch_approver_id text references employees (id) on delete set null;
alter table leave_forms add column if not exists branch_approver text not null default '';
alter table leave_forms add column if not exists branch_decision text check (branch_decision in ('approved', 'disapproved'));
alter table leave_forms add column if not exists branch_reason text;
alter table leave_forms add column if not exists branch_signed_name text;
alter table leave_forms add column if not exists branch_signed_at timestamptz;

alter table overtime_forms add column if not exists branch_approver_id text references employees (id) on delete set null;
alter table overtime_forms add column if not exists branch_approver text not null default '';
alter table overtime_forms add column if not exists branch_decision text check (branch_decision in ('approved', 'disapproved'));
alter table overtime_forms add column if not exists branch_reason text;
alter table overtime_forms add column if not exists branch_signed_name text;
alter table overtime_forms add column if not exists branch_signed_at timestamptz;

alter table correction_forms add column if not exists branch_approver_id text references employees (id) on delete set null;
alter table correction_forms add column if not exists branch_approver text not null default '';
alter table correction_forms add column if not exists branch_decision text check (branch_decision in ('approved', 'disapproved'));
alter table correction_forms add column if not exists branch_reason text;
alter table correction_forms add column if not exists branch_signed_name text;
alter table correction_forms add column if not exists branch_signed_at timestamptz;

-- On a new form: who the branch approver is (if any), and nothing decided.
create or replace function app_fill_form_branch()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  appr text;
  sup text;
begin
  select b.approver_id, e.supervisor_id into appr, sup
    from employees e left join branches b on b.id = e.branch_id
   where e.id = new.employee_id;
  if appr is null or appr = new.employee_id or appr = sup then
    new.branch_approver_id := null;
    new.branch_approver := '';
  else
    new.branch_approver_id := appr;
    new.branch_approver := coalesce((select trim(both ' ' from coalesce(first_name, '') || ' ' || coalesce(last_name, '')) from employees where id = appr), '');
  end if;
  new.branch_decision := null;
  new.branch_reason := null;
  new.branch_signed_name := null;
  new.branch_signed_at := null;
  return new;
end;
$$;

drop trigger if exists leave_forms_branch on leave_forms;
create trigger leave_forms_branch before insert on leave_forms for each row execute function app_fill_form_branch();
drop trigger if exists overtime_forms_branch on overtime_forms;
create trigger overtime_forms_branch before insert on overtime_forms for each row execute function app_fill_form_branch();
drop trigger if exists correction_forms_branch on correction_forms;
create trigger correction_forms_branch before insert on correction_forms for each row execute function app_fill_form_branch();

-- The department head decides only after the branch approver has approved;
-- an overtime form resubmitted after HR returned it goes back to the branch
-- approver.
create or replace function app_guard_form_branch()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.branch_approver_id is not null and new.head_decision is not null and old.head_decision is null
     and new.branch_decision is distinct from 'approved' then
    raise exception 'Waiting for the branch approver (%) first.', new.branch_approver;
  end if;
  return new;
end;
$$;

drop trigger if exists leave_forms_branch_guard on leave_forms;
create trigger leave_forms_branch_guard before update on leave_forms for each row execute function app_guard_form_branch();
drop trigger if exists correction_forms_branch_guard on correction_forms;
create trigger correction_forms_branch_guard before update on correction_forms for each row execute function app_guard_form_branch();

create or replace function app_guard_ot_form_branch()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Resubmitted after "returned for clarification": back to the branch approver.
  if old.hr_decision = 'returned' and new.hr_decision is null and new.branch_approver_id is not null then
    new.branch_decision := null;
    new.branch_reason := null;
    new.branch_signed_name := null;
    new.branch_signed_at := null;
  end if;
  if new.branch_approver_id is not null and new.head_decision is not null and old.head_decision is null
     and new.branch_decision is distinct from 'approved' then
    raise exception 'Waiting for the branch approver (%) first.', new.branch_approver;
  end if;
  return new;
end;
$$;

drop trigger if exists overtime_forms_branch_guard on overtime_forms;
create trigger overtime_forms_branch_guard before update on overtime_forms for each row execute function app_guard_ot_form_branch();

-- Is the signed-in employee the branch approver of this form?
create or replace function app_is_form_branch_approver(kind text, req_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case kind
    when 'leave' then exists (select 1 from leave_forms f where f.leave_request_id = req_id and f.branch_approver_id = app_current_employee_id())
    when 'ot' then exists (select 1 from overtime_forms f where f.overtime_request_id = req_id and f.branch_approver_id = app_current_employee_id())
    when 'corr' then exists (select 1 from correction_forms f where f.correction_request_id = req_id and f.branch_approver_id = app_current_employee_id())
    else false
  end;
$$;

revoke all on function app_is_form_branch_approver(text, text) from public, anon;
grant execute on function app_is_form_branch_approver(text, text) to authenticated;

-- Who can see a form: as before, plus its branch approver.
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
  ) or app_is_form_branch_approver('leave', req_id);
$$;

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
  ) or app_is_form_branch_approver('ot', req_id);
$$;

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
  ) or app_is_form_branch_approver('corr', req_id);
$$;

-- The branch approver can see the requests behind their forms.
drop policy if exists "leave requests read branch approver" on leave_requests;
create policy "leave requests read branch approver" on leave_requests for select to authenticated
  using (app_is_form_branch_approver('leave', id));
drop policy if exists "overtime requests read branch approver" on overtime_requests;
create policy "overtime requests read branch approver" on overtime_requests for select to authenticated
  using (app_is_form_branch_approver('ot', id));
drop policy if exists "correction requests read branch approver" on attendance_correction_requests;
create policy "correction requests read branch approver" on attendance_correction_requests for select to authenticated
  using (app_is_form_branch_approver('corr', id));

-- The branch approver's decision.
create or replace function form_branch_decide(p_kind text, p_request text, p_decision text, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me text := app_current_employee_id();
  appr text;
  dec text;
  unpaid text;
  folder text;
  nm text;
  note text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if me is null then
    raise exception 'Not signed in as an employee.';
  end if;
  if p_kind = 'leave' then
    select branch_approver_id, branch_decision, unpaid_request_id into appr, dec, unpaid from leave_forms where leave_request_id = p_request for update;
    folder := 'forms/';
  elsif p_kind = 'ot' then
    select branch_approver_id, branch_decision into appr, dec from overtime_forms where overtime_request_id = p_request for update;
    folder := 'ot/';
  elsif p_kind = 'corr' then
    select branch_approver_id, branch_decision into appr, dec from correction_forms where correction_request_id = p_request for update;
    folder := 'corr/';
  else
    raise exception 'Unknown form.';
  end if;
  if appr is null or appr is distinct from me then
    raise exception 'Only the branch approver can approve this form.';
  end if;
  if dec is not null then
    raise exception 'This form was already approved or disapproved by the branch approver.';
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
  if not app_leave_form_file_exists(folder || p_request || '/branch.png') then
    raise exception 'Attach your signature first.';
  end if;
  select trim(both ' ' from coalesce(first_name, '') || ' ' || coalesce(last_name, '')) into nm from employees where id = me;
  if p_kind = 'leave' then
    update leave_forms set branch_decision = p_decision, branch_reason = note, branch_signed_name = nm, branch_signed_at = now() where leave_request_id = p_request;
    if p_decision = 'disapproved' then
      update leave_requests set status = 'rejected', decided_by = me, decided_at = now(), decision_note = note where id in (p_request, unpaid);
    end if;
  elsif p_kind = 'ot' then
    update overtime_forms set branch_decision = p_decision, branch_reason = note, branch_signed_name = nm, branch_signed_at = now() where overtime_request_id = p_request;
    if p_decision = 'disapproved' then
      update overtime_requests set status = 'rejected', decided_by = me, decided_at = now(), decision_note = note where id = p_request;
    end if;
  else
    update correction_forms set branch_decision = p_decision, branch_reason = note, branch_signed_name = nm, branch_signed_at = now() where correction_request_id = p_request;
    if p_decision = 'disapproved' then
      update attendance_correction_requests set status = 'rejected', decided_by = me, decided_at = now(), decision_note = note where id = p_request;
    end if;
  end if;
end;
$$;

revoke all on function form_branch_decide(text, text, text, text) from public, anon;
grant execute on function form_branch_decide(text, text, text, text) to authenticated;

-- The branch approver's signature on a form, while their step is open.
create or replace function app_can_sign_form_branch(path text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when path ~ '^forms/[^/]+/branch\.png$' then exists (select 1 from leave_forms f where f.leave_request_id = split_part(path, '/', 2) and f.branch_approver_id = app_current_employee_id() and f.branch_decision is null)
    when path ~ '^ot/[^/]+/branch\.png$' then exists (select 1 from overtime_forms f where f.overtime_request_id = split_part(path, '/', 2) and f.branch_approver_id = app_current_employee_id() and f.branch_decision is null)
    when path ~ '^corr/[^/]+/branch\.png$' then exists (select 1 from correction_forms f where f.correction_request_id = split_part(path, '/', 2) and f.branch_approver_id = app_current_employee_id() and f.branch_decision is null)
    else false
  end;
$$;

revoke all on function app_can_sign_form_branch(text) from public, anon;
grant execute on function app_can_sign_form_branch(text) to authenticated;

drop policy if exists "form branch sign" on storage.objects;
create policy "form branch sign" on storage.objects for insert to authenticated
  with check (bucket_id = 'leave-forms' and app_can_sign_form_branch(name));
drop policy if exists "form branch re-sign" on storage.objects;
create policy "form branch re-sign" on storage.objects for update to authenticated
  using (bucket_id = 'leave-forms' and app_can_sign_form_branch(name))
  with check (bucket_id = 'leave-forms' and app_can_sign_form_branch(name));
