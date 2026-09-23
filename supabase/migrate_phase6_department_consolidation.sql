-- =============================================================================
-- Shantahl HRIS — consolidate departments into Shared Services / Business Units
--
-- The company restructured into two divisions:
--   Shared Services:  Human Resources, Finance, Accounting, Operations,
--                      "BOD - Shared Services" (renamed from "BOD")
--   Business Units:    "MLM Department" (replaces MLM - Network Development,
--                      MLM - Marketing, MLM - Sales, plus the former
--                      Independent Marketing department's "Marketing
--                      Assistant"/"Product Specialist" positions),
--                      "Cosmetics Department" (renamed from "Cosmetics"),
--                      "Darofy Department" (replaces Darofy - Marketing,
--                      Darofy - Sales, and Darofy Marketing)
--
-- Positions and employees pointing at a retired department id are repointed
-- to its replacement before that department row is deleted, so the foreign
-- key constraint always holds. No employees or positions are deleted — only
-- their department_id changes.
--
-- The final step explicitly repoints the two ex-Independent-Marketing
-- positions to dp-mlm by position id (rather than by their old department
-- id) so it still works correctly even if an earlier version of this
-- migration already ran and folded them into dp-darofy.
--
-- Safe to run any time, and safe to re-run — every step is a no-op once
-- already applied.
--
-- Run once in the SQL Editor (Database > SQL Editor).
-- =============================================================================

alter table departments add column if not exists division text;

-- Surviving departments: update name (BOD, Cosmetics) / division for all.
update departments set name = 'BOD - Shared Services', division = 'shared_services' where id = 'dp-bod';
update departments set division = 'shared_services' where id in ('dp-acctg', 'dp-fin', 'dp-hr', 'dp-operation');
update departments set name = 'Cosmetics Department', division = 'business_units' where id = 'dp-cosmetics';

-- New merged departments.
insert into departments (id, name, division) values ('dp-mlm', 'MLM Department', 'business_units')
  on conflict (id) do nothing;
insert into departments (id, name, division) values ('dp-darofy', 'Darofy Department', 'business_units')
  on conflict (id) do nothing;

-- Repoint positions and employees off the 7 retired department ids onto
-- their replacement, before those rows are deleted.
update positions set department_id = 'dp-mlm'
  where department_id in ('dp-mlm-netdev', 'dp-mlm-mktg', 'dp-mlm-sales', 'dp-indie-mktg');
update positions set department_id = 'dp-darofy'
  where department_id in ('dp-darofy-mktg', 'dp-darofy-sales', 'dp-darofy-marketing-corp');

update employees set department_id = 'dp-mlm'
  where department_id in ('dp-mlm-netdev', 'dp-mlm-mktg', 'dp-mlm-sales', 'dp-indie-mktg');
update employees set department_id = 'dp-darofy'
  where department_id in ('dp-darofy-mktg', 'dp-darofy-sales', 'dp-darofy-marketing-corp');

-- Explicit fix-up by position id: makes this step correct whether it's
-- running against a fresh database (dp-indie-mktg still present, handled
-- above) or one where an earlier version of this migration already folded
-- these two positions into dp-darofy.
update positions set department_id = 'dp-mlm'
  where id in ('ps-marketing-assistant-30', 'ps-product-specialist-31');
update employees set department_id = 'dp-mlm'
  where position_id in ('ps-marketing-assistant-30', 'ps-product-specialist-31');

-- Now safe to delete the retired department rows — nothing references them.
delete from departments
  where id in (
    'dp-darofy-mktg', 'dp-darofy-sales', 'dp-mlm-netdev',
    'dp-mlm-mktg', 'dp-mlm-sales', 'dp-darofy-marketing-corp', 'dp-indie-mktg'
  );

alter table departments alter column division set not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'departments_division_check') then
    alter table departments
      add constraint departments_division_check check (division in ('shared_services', 'business_units'));
  end if;
end $$;
