-- =============================================================================
-- Shantahl HRIS — leave credit adjustments (balances from HR's leave sheet)
--
--   leave_credit_adjustments: days added to (or taken from) an employee's
--   leave credits for one credit period — e.g. Vacation Leave, Jul–Dec 2026
--   (period_key '2026-H2'). The app's balance is the period's credits plus
--   the adjustment, less the leave filed. HR uses it to bring balances in
--   line with the leave balance sheet.
--   The employee, their supervisor and company-wide roles can read it; only
--   the HR Manager changes it.
--
-- Safe to run any time, and safe to re-run.
-- Run once in the SQL Editor (Database > SQL Editor).
-- =============================================================================

create table if not exists leave_credit_adjustments (
  employee_id text not null references employees (id) on delete cascade,
  leave_type_id text not null references leave_types (id) on delete cascade,
  period_key text not null check (period_key ~ '^[0-9]{4}(-H[12])?$'),
  days numeric(6, 2) not null,
  note text not null default '',
  updated_by text references employees (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (employee_id, leave_type_id, period_key)
);

alter table leave_credit_adjustments enable row level security;

drop policy if exists "leave credit adjustments read" on leave_credit_adjustments;
create policy "leave credit adjustments read" on leave_credit_adjustments for select to authenticated
  using (employee_id = app_current_employee_id() or app_is_elevated() or app_is_supervisor_of(employee_id));
drop policy if exists "leave credit adjustments write" on leave_credit_adjustments;
create policy "leave credit adjustments write" on leave_credit_adjustments for all to authenticated
  using (app_is_hr_manager()) with check (app_is_hr_manager());
