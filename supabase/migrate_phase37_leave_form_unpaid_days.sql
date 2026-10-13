-- =============================================================================
-- Shantahl HRIS — leave form: paid days plus days without pay
--
--   When an employee applies for more days than their remaining leave
--   credits (e.g. 1 day of vacation leave left, applying for 2.5 days), one
--   leave form covers both: its request is the paid part (vacation / sick /
--   bereavement with pay), and a second Leave Without Pay request — linked as
--   leave_forms.unpaid_request_id — holds the rest. The department head's
--   approval (leave_form_decide) approves or rejects both; deleting the form
--   removes the linked request too.
--
-- Needs migrate_phase27_leave_forms.sql.
-- Safe to run any time, and safe to re-run.
-- Run once in the SQL Editor (Database > SQL Editor).
-- =============================================================================

alter table leave_forms add column if not exists unpaid_request_id text references leave_requests (id) on delete set null;
alter table leave_forms add column if not exists unpaid_days numeric(6, 2);

-- The linked request must be the same employee's own pending Leave Without
-- Pay request; its days are copied onto the form.
create or replace function app_check_leave_form_unpaid()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r leave_requests%rowtype;
begin
  if new.unpaid_request_id is null then
    new.unpaid_days := null;
    return new;
  end if;
  select * into r from leave_requests where id = new.unpaid_request_id;
  if not found or r.employee_id <> new.employee_id or r.status <> 'pending' or r.leave_type_id <> 'lt-lwop' or r.id = new.leave_request_id then
    raise exception 'The days without pay must be your own pending Leave Without Pay request.';
  end if;
  if exists (select 1 from leave_forms f where f.unpaid_request_id = new.unpaid_request_id or f.leave_request_id = new.unpaid_request_id) then
    raise exception 'That Leave Without Pay request already has a leave form.';
  end if;
  new.unpaid_days := r.days;
  return new;
end;
$$;

drop trigger if exists leave_forms_unpaid on leave_forms;
create trigger leave_forms_unpaid
  before insert on leave_forms
  for each row execute function app_check_leave_form_unpaid();

-- The department head's decision covers the linked request too.
create or replace function app_leave_form_decide_unpaid()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.unpaid_request_id is not null and new.head_decision is not null and old.head_decision is null then
    update leave_requests
       set status = (case when new.head_decision = 'approved' then 'approved' else 'rejected' end)::request_status,
           decided_by = new.head_signed_by, decided_at = now(), decision_note = new.head_reason
     where id = new.unpaid_request_id;
  end if;
  return new;
end;
$$;

drop trigger if exists leave_forms_decide_unpaid on leave_forms;
create trigger leave_forms_decide_unpaid
  after update on leave_forms
  for each row execute function app_leave_form_decide_unpaid();

-- Deleting the form (with its paid request) removes the linked request.
create or replace function app_leave_form_delete_unpaid()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.unpaid_request_id is not null then
    delete from leave_requests where id = old.unpaid_request_id;
  end if;
  return old;
end;
$$;

drop trigger if exists leave_forms_delete_unpaid on leave_forms;
create trigger leave_forms_delete_unpaid
  after delete on leave_forms
  for each row execute function app_leave_form_delete_unpaid();

-- Whoever can see the form can see its linked request (e.g. the department head).
create or replace function app_can_view_leave_unpaid(req_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from leave_forms f where f.unpaid_request_id = req_id and app_can_view_leave_form(f.leave_request_id));
$$;

revoke all on function app_can_view_leave_unpaid(text) from public, anon;
grant execute on function app_can_view_leave_unpaid(text) to authenticated;

drop policy if exists "leave requests read via form" on leave_requests;
create policy "leave requests read via form" on leave_requests for select to authenticated
  using (app_can_view_leave_unpaid(id));
