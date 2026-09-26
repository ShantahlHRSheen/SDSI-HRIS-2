-- =============================================================================
-- Shantahl HRIS — salary adjustments (Salary Adjustment Voucher)
--
--   * salary_adjustments: a correction to one part of an employee's payroll
--     for a payroll period — e.g. Basic pay +500, SSS −200 (refund), Other
--     deduction +150 — with the reason. The payroll computation adds it to
--     that component, so it flows into net pay, payslips and reports, and
--     the payslip lists it as a salary adjustment with the reason.
--   * Payroll roles (HR, payroll officer, accounting, treasurer, CFO, system
--     admin) manage adjustments; employees can read their own (for the note
--     on their payslip); Upper Management can view them.
--
-- Safe to run any time, and safe to re-run.
--
-- Run once in the SQL Editor (Database > SQL Editor).
-- =============================================================================

create table if not exists salary_adjustments (
  id text primary key default gen_random_uuid()::text,
  period_id text not null references payroll_periods (id) on delete cascade,
  employee_id text not null references employees (id) on delete cascade,
  component text not null check (component in (
    'basic_pay', 'holiday_pay', 'vl_pay', 'sl_pay', 'ot_pay', 'allowance', 'other_earning',
    'late_deduction', 'sss', 'philhealth', 'hdmf', 'withholding_tax',
    'cash_advance', 'sss_loan', 'hdmf_loan', 'shortages', 'other_deduction'
  )),
  amount numeric(12, 2) not null check (amount <> 0 and abs(amount) < 100000000),
  description text not null check (char_length(btrim(description)) between 1 and 300),
  created_by text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists salary_adjustments_period_idx on salary_adjustments (period_id, employee_id);

alter table salary_adjustments enable row level security;

drop policy if exists "salary adjustments read" on salary_adjustments;
create policy "salary adjustments read" on salary_adjustments for select to authenticated
  using (employee_id = app_current_employee_id() or app_is_elevated());
drop policy if exists "salary adjustments write" on salary_adjustments;
create policy "salary adjustments write" on salary_adjustments for all to authenticated
  using (app_is_payroll()) with check (app_is_payroll());
