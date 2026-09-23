-- =============================================================================
-- Shantahl HRIS — add "Business Unit President" position to each Business
-- Unit department (MLM, Cosmetics, Darofy)
--
-- Safe to run any time, and safe to re-run.
--
-- Run once in the SQL Editor (Database > SQL Editor).
-- =============================================================================

insert into positions (id, title, department_id) values ('ps-business-unit-president-44', 'Business Unit President', 'dp-darofy')
  on conflict (id) do nothing;
insert into positions (id, title, department_id) values ('ps-business-unit-president-45', 'Business Unit President', 'dp-mlm')
  on conflict (id) do nothing;
insert into positions (id, title, department_id) values ('ps-business-unit-president-46', 'Business Unit President', 'dp-cosmetics')
  on conflict (id) do nothing;
