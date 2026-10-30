-- =============================================================================
-- Phase 67: the employee can edit their attendance correction form until the
-- Department Head signs it.
--
--   * correction_form_edit: the employee changes the date, what to correct,
--     the correct time in / out and the reason while the form waits for the
--     branch approver or the Department Head. The request is updated too.
--   * Each edit is noted on the form (edited_at, edit_count) with the
--     previous version kept in edit_history, so the approvers see it.
--   * An edit after the branch approver approved sends it back to them.
--
-- Needs migrate_phase36_correction_forms.sql and migrate_phase40_branch_approver.sql.
-- Safe to run any time, and safe to re-run.
-- =============================================================================

alter table correction_forms add column if not exists edited_at timestamptz;
alter table correction_forms add column if not exists edit_count integer not null default 0;
alter table correction_forms add column if not exists edit_history jsonb not null default '[]'::jsonb;

create or replace function correction_form_edit(p_request text, p_date date, p_type text, p_time_in text, p_time_out text, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me text := app_current_employee_id();
  f correction_forms%rowtype;
  req attendance_correction_requests%rowtype;
  v_in text := nullif(btrim(coalesce(p_time_in, '')), '');
  v_out text := nullif(btrim(coalesce(p_time_out, '')), '');
  v_reason text := btrim(coalesce(p_reason, ''));
  today date := (now() at time zone 'Asia/Manila')::date;
begin
  select * into f from correction_forms where correction_request_id = p_request for update;
  if not found then
    raise exception 'Form not found.';
  end if;
  if me is null or f.employee_id is distinct from me then
    raise exception 'Only the employee who filed this form can edit it.';
  end if;
  select * into req from attendance_correction_requests where id = p_request for update;
  if f.head_decision is not null or req.status <> 'pending' then
    raise exception 'The Department Head has already signed this form — it can''t be edited.';
  end if;
  if f.branch_decision = 'disapproved' then
    raise exception 'The branch approver disapproved this form — file a new one instead.';
  end if;
  if p_date is null or p_date > today then
    raise exception 'Enter the date to be corrected (not in the future).';
  end if;
  if p_type is null or p_type not in ('missed_in', 'missed_out', 'missed_both', 'wrong_time', 'device_failure', 'other') then
    raise exception 'Choose the correction needed.';
  end if;
  if p_type = 'missed_out' then v_in := null; end if;
  if p_type = 'missed_in' then v_out := null; end if;
  if (v_in is not null and v_in !~ '^[0-2][0-9]:[0-5][0-9]$') or (v_out is not null and v_out !~ '^[0-2][0-9]:[0-5][0-9]$') then
    raise exception 'Enter the times as HH:MM.';
  end if;
  if (p_type in ('missed_in', 'missed_both') and v_in is null) or (p_type in ('missed_out', 'missed_both') and v_out is null) or (v_in is null and v_out is null) then
    raise exception 'Enter the correct time in and / or time out.';
  end if;
  if char_length(v_reason) not between 1 and 1000 then
    raise exception 'Enter the reason / explanation (up to 1000 characters).';
  end if;
  if f.correction_date = p_date and f.correction_type = p_type and f.time_in is not distinct from v_in
     and f.time_out is not distinct from v_out and f.reason = v_reason then
    raise exception 'Nothing was changed.';
  end if;

  update correction_forms
     set correction_date = p_date, correction_type = p_type, time_in = v_in, time_out = v_out, reason = v_reason,
         edited_at = now(), edit_count = f.edit_count + 1,
         -- The version before this edit; the latest 20 are kept.
         edit_history = (
           select coalesce(jsonb_agg(x order by n), '[]'::jsonb)
             from (select x, n from jsonb_array_elements(
                     f.edit_history || jsonb_build_array(jsonb_build_object(
                       'replacedAt', now(), 'date', f.correction_date, 'type', f.correction_type,
                       'timeIn', f.time_in, 'timeOut', f.time_out, 'reason', f.reason)))
                     with ordinality as t(x, n)
                   order by n desc limit 20) last20
         ),
         -- A changed form goes back to the branch approver.
         branch_decision = null, branch_reason = null, branch_signed_name = null, branch_signed_at = null
   where correction_request_id = p_request;

  update attendance_correction_requests
     set date = p_date, requested_time_in = v_in, requested_time_out = v_out, reason = v_reason
   where id = p_request;
end;
$$;

revoke all on function correction_form_edit(text, date, text, text, text, text) from public, anon;
grant execute on function correction_form_edit(text, date, text, text, text, text) to authenticated;
