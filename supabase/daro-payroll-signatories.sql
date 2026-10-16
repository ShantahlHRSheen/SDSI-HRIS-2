-- =============================================================================
-- Daro Lending Corporation — payroll signatories
--
--   Prepared by: Jam Karen Ducusin (EMP-0004, HR / Admin) — already hr_admin.
--   Checked by:  Richard Tejadillo Jr. (EMP-0023) — gets the Sr. Accounting
--                Assistant role, so he can mark payroll vouchers "Checked".
--   Approved by: Maricris Barlinan — admin-only account ADMIN-02 (below).
--
-- Run ONCE in Daro's own Supabase project (SQL Editor), after
-- new-company-setup.sql. Adds ADMIN-02: Maricris approves Daro's payroll (her
-- name prints as "Approved by" on vouchers) and can view payroll, payslips
-- and vouchers read-only. Like ADMIN-01 she isn't a Daro employee, so she's
-- left off every employee list (lib/companies.ts → adminAccountNumbers).
--
-- Replace Maricris's email below with the one she signs in to Shantahl with. If her
-- login already exists in Daro (Authentication > Users), it's linked now;
-- otherwise create it there with the same email and it links by itself.
--
-- Safe to re-run.
-- =============================================================================

insert into employees (
  id, employee_number, first_name, last_name, nickname, gender, email,
  branch_id, department_id, position_id, employment_status, payroll_type, status, roles
) values (
  'emp-admin-02', 'ADMIN-02', 'Maricris', 'Barlinan', 'Maricris', 'Female',
  'maricris@example.com',  -- ← her sign-in email
  'br-unassigned', 'dp-unassigned', 'ps-unassigned', 'regular', 'monthly', 'active',
  array['upper_management']::app_role[]
)
on conflict (employee_number) do update
  set email = excluded.email, roles = excluded.roles, status = 'active';

update employees e
set user_id = u.id
from auth.users u
where e.employee_number = 'ADMIN-02' and e.user_id is null and lower(u.email) = lower(e.email);

-- Richard checks payroll.
update employees
set roles = array(select distinct unnest(roles || array['sr_accounting_assistant']::app_role[]))
where employee_number = 'EMP-0023';
