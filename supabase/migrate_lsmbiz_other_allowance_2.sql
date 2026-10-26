-- Run in LSMBiz's SQL Editor FIRST (before merging the PR).
-- Adds the Other Allowance 2 column to saved payroll lines. Nothing else changes.
alter table payroll_line_overrides add column if not exists other_allowance_2 numeric not null default 0;
notify pgrst, 'reload schema';
