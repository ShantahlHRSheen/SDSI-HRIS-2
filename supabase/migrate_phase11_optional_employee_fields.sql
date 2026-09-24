-- =============================================================================
-- Shantahl HRIS — allow importing employees with incomplete personal/
-- employment details, to be filled in later through the app
--
-- Two changes:
--   1. Personal/contact fields (birthdate, civil status, nationality,
--      address, contact number, email, emergency contact, date hired)
--      become nullable — display-only fields, safe to leave blank until HR
--      fills them in.
--   2. Employment status and payroll type get a new 'unassigned' enum value,
--      and a real "Unassigned" branch + department + position are added —
--      used only for historical/resigned employees imported without this on
--      file. (branch_id/department_id/position_id stay NOT NULL since
--      scoping/reports throughout the app assume every employee has a real
--      one — they just point at "Unassigned" instead.)
--
-- Safe to run any time, and safe to re-run.
--
-- Run once in the SQL Editor (Database > SQL Editor).
-- =============================================================================

alter table employees alter column birthdate drop not null;
alter table employees alter column civil_status drop not null;
alter table employees alter column nationality drop not null;
alter table employees alter column address drop not null;
alter table employees alter column contact_number drop not null;
alter table employees alter column email drop not null;
alter table employees alter column emergency_contact_name drop not null;
alter table employees alter column emergency_contact_phone drop not null;
alter table employees alter column date_hired drop not null;

alter type employment_status add value if not exists 'unassigned';
alter type payroll_type add value if not exists 'unassigned';

insert into branches (id, name, code, address) values ('br-unassigned', 'Unassigned', 'UNASSIGNED', 'Unassigned')
  on conflict (id) do nothing;
insert into departments (id, name, division) values ('dp-unassigned', 'Unassigned', 'shared_services')
  on conflict (id) do nothing;
insert into positions (id, title, department_id) values ('ps-unassigned', 'Unassigned', 'dp-unassigned')
  on conflict (id) do nothing;
