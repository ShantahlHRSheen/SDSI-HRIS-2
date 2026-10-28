-- =============================================================================
-- Phase 66: the authorized signatory can sign their own Pag-IBIG
-- Multi-Purpose Loan form (Marlyn Leonardo signs as the employer on hers).
--
-- mpl_prepare no longer refuses a signatory who is the borrower.
--
-- Needs migrate_phase56_pagibig_loan_form.sql.
-- Safe to run any time, and safe to re-run.
-- =============================================================================

-- HR: the employer's part and net pay are checked; send to the signatory.
create or replace function mpl_prepare(p_id text, p_data jsonb, p_signatory text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me text := app_current_employee_id();
  r mpl_requests%rowtype;
begin
  if me is null or not app_is_hr_manager() then
    raise exception 'Only HR can prepare the Pag-IBIG loan form.';
  end if;
  select * into r from mpl_requests where id = p_id for update;
  if not found then
    raise exception 'Request not found.';
  end if;
  if r.status <> 'hr' then
    raise exception 'This form was already sent, signed or declined.';
  end if;
  if jsonb_typeof(p_data) <> 'object' or octet_length(p_data::text) > 20000 then
    raise exception 'The form''s details are missing.';
  end if;
  if p_signatory is null or not exists (select 1 from employees where id = p_signatory) then
    raise exception 'Choose the authorized signatory.';
  end if;
  update mpl_requests
     set status = 'signatory', data = p_data, signatory_id = p_signatory,
         signatory_name = (select trim(both ' ' from coalesce(first_name, '') || ' ' || coalesce(last_name, '')) from employees where id = p_signatory),
         prepared_by = me, prepared_at = now(),
         prepared_name = (select trim(both ' ' from coalesce(first_name, '') || ' ' || coalesce(last_name, '')) from employees where id = me)
   where id = p_id;
end;
$$;

revoke all on function mpl_prepare(text, jsonb, text) from public, anon;
grant execute on function mpl_prepare(text, jsonb, text) to authenticated;
