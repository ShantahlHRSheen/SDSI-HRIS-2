-- =============================================================================
-- LSM Group HRIS — HR's recommendation on the leave form
--
--   Daro's leave form ends with a Human Resource Certification where HR marks
--   the application Approved or "Disapproved due to: …". HR records it when
--   receiving the form (leave_form_receive), kept in hr_decision / hr_reason.
--   Optional: companies whose form has no HR recommendation receive as before.
--
-- Safe to run any time, and safe to re-run.
-- Run once in the SQL Editor (Database > SQL Editor) of each company that
-- uses it (Daro). Needs migrate_phase27_leave_forms.sql.
-- =============================================================================

alter table leave_forms add column if not exists hr_decision text check (hr_decision in ('approved', 'disapproved'));
alter table leave_forms add column if not exists hr_reason text;

drop function if exists leave_form_receive(text);
create or replace function leave_form_receive(p_request text, p_decision text default null, p_reason text default null)
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
  if p_decision is not null and p_decision not in ('approved', 'disapproved') then
    raise exception 'Choose Approved or Disapproved.';
  end if;
  if p_decision = 'disapproved' and coalesce(trim(p_reason), '') = '' then
    raise exception 'Give the reason it''s disapproved.';
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
  update leave_forms
     set received_by = me, received_name = nm, received_at = now(),
         hr_decision = p_decision, hr_reason = nullif(trim(coalesce(p_reason, '')), '')
   where leave_request_id = p_request;
end;
$$;

revoke all on function leave_form_receive(text, text, text) from public, anon;
grant execute on function leave_form_receive(text, text, text) to authenticated;
