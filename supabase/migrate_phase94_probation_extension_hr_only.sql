-- =============================================================================
-- Phase 94: Probation Extension — HR is the only signatory.
--
-- The Department Head (Noted by) and the Chairman (Approved by) no longer
-- sign: their names and titles are printed on the letter only. They don't
-- get the notice, can't sign it, and can't return it. HR signs and sends;
-- the employee signs the CONFORME.
--
-- Needs migrate_phase90 and migrate_phase91. Safe to run any time, and safe
-- to re-run.
-- =============================================================================

drop policy if exists "pe read" on probation_extensions;
create policy "pe read" on probation_extensions for select to authenticated
  using (coalesce(app_is_hr_manager(), false)
         or (employee_id = app_current_employee_id() and status in ('employee', 'done')));

create or replace function pe_note(p_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'Only HR signs this notice.';
end;
$$;

create or replace function pe_approve(p_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'Only HR signs this notice.';
end;
$$;

create or replace function pe_return(p_id text, p_note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'Only HR signs this notice.';
end;
$$;

create or replace function app_can_sign_pe(path text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select path ~ '^pe/[^/]+/(hr|employee)\.png$'
    and exists (
      select 1 from probation_extensions r
       where r.id = split_part(path, '/', 2)
         and case split_part(path, '/', 3)
               when 'hr.png' then r.status = 'hr' and coalesce(app_is_hr_manager(), false)
               when 'employee.png' then r.status = 'employee' and r.employee_id = app_current_employee_id()
               else false
             end);
$$;

revoke all on function app_can_sign_pe(text) from public, anon;
grant execute on function app_can_sign_pe(text) to authenticated;

create or replace function app_can_read_pe(path text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select path like 'pe/%'
    and exists (select 1 from probation_extensions r
                 where r.id = split_part(path, '/', 2)
                   and (coalesce(app_is_hr_manager(), false)
                        or (r.employee_id = app_current_employee_id() and r.status in ('employee', 'done'))));
$$;

revoke all on function app_can_read_pe(text) from public, anon;
grant execute on function app_can_read_pe(text) to authenticated;
