-- =============================================================================
-- Shantahl HRIS — consolidate departments into Shared Services / Business Units
--
-- The company restructured into two divisions:
--   Shared Services:  Human Resources, Finance, Accounting, Operations,
--                      "BOD - Shared Services" (renamed from "BOD")
--   Business Units:    "MLM Department" (replaces MLM - Network Development,
--                      MLM - Marketing, MLM - Sales), "Cosmetics Department"
--                      (renamed from "Cosmetics"), "Darofy Department"
--                      (replaces Darofy - Marketing, Darofy - Sales,
--                      Darofy Marketing, and Independent Marketing)
--
-- Positions and employees pointing at a retired department id are repointed
-- to its replacement before that department row is deleted, so the foreign
-- key constraint always holds. No employees or positions are deleted — only
-- their department_id changes.
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
  where department_id in ('dp-mlm-netdev', 'dp-mlm-mktg', 'dp-mlm-sales');
update positions set department_id = 'dp-darofy'
  where department_id in ('dp-darofy-mktg', 'dp-darofy-sales', 'dp-darofy-marketing-corp', 'dp-indie-mktg');

update employees set department_id = 'dp-mlm'
  where department_id in ('dp-mlm-netdev', 'dp-mlm-mktg', 'dp-mlm-sales');
update employees set department_id = 'dp-darofy'
  where department_id in ('dp-darofy-mktg', 'dp-darofy-sales', 'dp-darofy-marketing-corp', 'dp-indie-mktg');

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
