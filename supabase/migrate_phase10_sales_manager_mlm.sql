-- =============================================================================
-- Shantahl HRIS — add "Sales Manager" position under MLM Department
--
-- MLM already had "Sales Admin" but not "Sales Manager" (which previously
-- only existed under Darofy Department) — MLM genuinely has this role too.
--
-- Safe to run any time, and safe to re-run.
--
-- Run once in the SQL Editor (Database > SQL Editor).
-- =============================================================================

insert into positions (id, title, department_id) values ('ps-sales-manager-47', 'Sales Manager', 'dp-mlm')
  on conflict (id) do nothing;
