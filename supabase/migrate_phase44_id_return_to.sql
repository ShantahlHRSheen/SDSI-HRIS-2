-- =============================================================================
-- Shantahl HRIS — "If found, please return to" on the employee ID
--
--   employees.id_return_name / id_return_address: the name and address
--   printed on the back of the ID card. Empty = the company's own name and
--   address. The employee can change their own (as with the emergency
--   contact); HR can change anyone's.
--
-- Safe to run any time, and safe to re-run.
-- Run once in the SQL Editor (Database > SQL Editor).
-- =============================================================================

alter table employees add column if not exists id_return_name text;
alter table employees add column if not exists id_return_address text;

create or replace function set_employee_id_return(emp_id text, return_name text, return_address text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if emp_id is distinct from app_current_employee_id() and not app_is_hr_or_admin() then
    raise exception 'You can only change your own ID card.';
  end if;
  update employees
     set id_return_name = nullif(btrim(left(return_name, 120)), ''),
         id_return_address = nullif(btrim(left(return_address, 300)), '')
   where id = emp_id;
end;
$$;

revoke all on function set_employee_id_return(text, text, text) from public, anon;
grant execute on function set_employee_id_return(text, text, text) to authenticated;
