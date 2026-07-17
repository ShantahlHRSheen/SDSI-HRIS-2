-- =============================================================================
-- Shantahl HRIS — auto-link trigger for onboarding new employee logins
--
-- Without this, only the one-time seed.sql script links a new Supabase Auth
-- account to its employees row (by matching email). Any account created
-- afterward — which is the normal way you'll onboard the rest of staff —
-- would need someone to manually re-run that same email-matching UPDATE.
-- This trigger does it automatically: the moment a new Auth user is created
-- (dashboard, invite, whatever), if their email matches an employees row
-- that doesn't have a login yet, it gets linked immediately.
--
-- Safe to run any time, and safe to re-run — it only replaces the function
-- and trigger definitions, doesn't touch any data.
--
-- Run once in the SQL Editor (Database > SQL Editor).
-- =============================================================================

create or replace function public.link_employee_on_auth_user_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.employees
  set user_id = new.id
  where lower(email) = lower(new.email) and user_id is null;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.link_employee_on_auth_user_created();
