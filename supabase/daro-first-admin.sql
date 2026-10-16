-- =============================================================================
-- Daro Lending Corporation — first HR admin account
--
-- Run ONCE in Daro's own Supabase project, AFTER new-company-setup.sql.
-- Adds the admin-only account ADMIN-01 (Sheena A. Evangelista, LSM Group HR):
-- she can sign in with full HR / System Administration access, but isn't
-- counted as a Daro employee (lib/companies.ts → adminAccountNumbers), so she
-- never shows in the directory, payroll, headcount or org chart.
--
-- Before running, replace the email below with the one she'll sign in with.
-- Then create her login: Authentication > Users > Add user > Create new user,
-- same email, a password, tick "Auto Confirm User". It links to this row by
-- itself (on_auth_user_created trigger). From then on she adds the rest of
-- Daro's people and logins from inside the HRIS.
--
-- Safe to re-run.
-- =============================================================================

insert into employees (
  id, employee_number, first_name, last_name, middle_name, nickname, gender, email,
  branch_id, department_id, position_id, employment_status, payroll_type, status, roles
) values (
  'emp-admin-01', 'ADMIN-01', 'Sheena', 'Evangelista', 'A.', 'Sheena', 'Female',
  'shantahlhr@gmail.com',  -- ← her sign-in email for Daro
  'br-unassigned', 'dp-unassigned', 'ps-unassigned', 'regular', 'monthly', 'active',
  array['hr_admin', 'sys_admin', 'employee']::app_role[]
)
on conflict (employee_number) do update
  set email = excluded.email, roles = excluded.roles, status = 'active';

-- If her login was created before this row existed, link it now.
update employees e
set user_id = u.id
from auth.users u
where e.employee_number = 'ADMIN-01' and e.user_id is null and lower(u.email) = lower(e.email);
