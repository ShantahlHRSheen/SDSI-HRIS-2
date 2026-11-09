-- =============================================================================
-- Daro Lending Corporation — Joenifer Gomez, VP for Operations
--
-- He works for LSMBiz and is upper management in Daro, but isn't employed by
-- Daro: no salary and no government contributions. So he gets an admin-only
-- account (ADMIN-05, lib/companies.ts adminAccountNumbers), the same as the
-- LSM Area Managers. He can sign in, but he's kept out of Daro's directory,
-- payroll, contributions, headcount and org chart.
--
-- He signs in to Daro with his LSMBiz email and password (lib/companies.ts
-- linkedSignIn). His first sign-in creates his Daro login. If he later
-- changes his LSMBiz password, his next Daro sign-in with it updates Daro too.
--
-- STEP 1 — in the LSMBiz project (read only), find his details:
--
--   select employee_number, first_name, middle_name, last_name, nickname,
--          gender, email, status
--     from employees
--    where first_name ilike '%joenifer%' or last_name ilike '%gomez%';
--
-- STEP 2 — in the Daro project, run the rest of this file. Put his LSMBiz
-- email in place of joenifer@example.com, and fix the middle name if
-- LSMBiz has one.
--
-- Safe to re-run.
-- =============================================================================

insert into employees (
  id, employee_number, first_name, middle_name, last_name, nickname, gender, email,
  branch_id, department_id, position_id, employment_status, payroll_type, status, roles
) values (
  'emp-admin-05', 'ADMIN-05', 'Joenifer', null, 'Gomez', 'Joenifer', 'Male',
  'joenifer@example.com',  -- ← his LSMBiz sign-in email
  'br-unassigned', 'dp-unassigned', 'ps-unassigned', 'regular', 'monthly', 'active',
  array['upper_management', 'employee']::app_role[]
)
on conflict (employee_number) do update
  set first_name = excluded.first_name, middle_name = excluded.middle_name, last_name = excluded.last_name,
      email = excluded.email, roles = excluded.roles, status = 'active';

-- He is Daro's final approver in Hiring & Onboarding (the final hiring
-- decision and the recommendation for employment). Personnel requisitions
-- stay with the Vice Chairperson; choose her in Hiring settings.
update hiring_settings set final_approver_id = 'emp-admin-05' where id = true;

-- Check.
select employee_number, first_name || ' ' || last_name as name, email, roles, status,
       (select final_approver_id from hiring_settings where id = true) = id as hiring_final_approver
  from employees where employee_number = 'ADMIN-05';
