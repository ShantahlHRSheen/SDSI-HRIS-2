-- =============================================================================
-- Shantahl HRIS — employees set their own nickname
--
--   * set_employee_nickname(emp_id, nick): the employee themself (or HR)
--     changes the nickname shown on their profile. Only that one field is
--     touched; blank clears it. Up to 40 characters.
--
-- Safe to run any time, and safe to re-run.
-- Run once in the SQL Editor (Database > SQL Editor).
-- =============================================================================

create or replace function set_employee_nickname(emp_id text, nick text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if emp_id is distinct from app_current_employee_id() and not app_is_hr_or_admin() then
    raise exception 'You can only change your own nickname.';
  end if;
  if char_length(btrim(coalesce(nick, ''))) > 40 then
    raise exception 'Nickname is too long (40 characters at most).';
  end if;
  update employees set nickname = btrim(coalesce(nick, '')) where id = emp_id;
end;
$$;

revoke all on function set_employee_nickname(text, text) from public, anon;
grant execute on function set_employee_nickname(text, text) to authenticated;
