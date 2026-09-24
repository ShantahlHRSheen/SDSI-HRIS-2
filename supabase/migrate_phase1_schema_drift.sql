-- =============================================================================
-- Shantahl HRIS — Phase 1 schema patch
--
-- Only needed if supabase/schema.sql was already run against your project
-- BEFORE this change (i.e. the tables already exist). It brings an
-- already-applied schema up to date with the latest supabase/schema.sql,
-- non-destructively (no data is dropped). If your project does NOT have
-- these tables yet, ignore this file — just run the current
-- supabase/schema.sql instead, which already includes everything below.
--
-- Run once in the SQL Editor (Database > SQL Editor), after schema.sql and
-- before seed.sql.
-- =============================================================================

alter table employees
  add column if not exists job_performance_evaluator_id text references employees (id);

-- Must drop the old policy before dropping the column it references, or
-- Postgres refuses with "cannot drop column ... because other objects depend
-- on it" (error 2BP01).
drop policy if exists "evaluations read" on performance_evaluations;

alter table performance_evaluations
  add column if not exists behavior_evaluator_id text references employees (id);
alter table performance_evaluations
  add column if not exists job_performance_evaluator_id text references employees (id);
alter table performance_evaluations
  drop column if exists evaluator_id;

create policy "evaluations read" on performance_evaluations for select
  using (
    employee_id = app_current_employee_id()
    or behavior_evaluator_id = app_current_employee_id()
    or job_performance_evaluator_id = app_current_employee_id()
    or app_is_elevated()
  );

alter table attendance_period_records add column if not exists late_instances integer;
alter table attendance_period_records add column if not exists late_day_details jsonb;
alter table attendance_period_records add column if not exists undertime_instances integer;
alter table attendance_period_records add column if not exists undertime_day_details jsonb;
alter table attendance_period_records add column if not exists half_day_instances integer;
alter table attendance_period_records add column if not exists half_day_dates jsonb;
alter table attendance_period_records add column if not exists absence_instances integer;
alter table attendance_period_records add column if not exists absent_dates jsonb;
