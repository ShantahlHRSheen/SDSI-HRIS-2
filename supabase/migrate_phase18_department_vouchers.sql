-- =============================================================================
-- Shantahl HRIS — department vouchers
--
--   * department_vouchers: one voucher per department per payroll period
--     (e.g. "MLM Voucher — May 16–31").
--   * department_voucher_lines: any number of payees on a voucher — an
--     employee (linked by employee_id) or anyone else (freelancer, project-
--     based, outside payee) by name — each with a description and amount.
--   * Totals feed the Payroll Expense Report (by department and division).
--   * Payroll roles (HR, payroll officer, accounting, treasurer, CFO, system
--     admin) manage vouchers; Upper Management can view them (report).
--
-- Safe to run any time, and safe to re-run.
--
-- Run once in the SQL Editor (Database > SQL Editor).
-- =============================================================================

create table if not exists department_vouchers (
  id text primary key default gen_random_uuid()::text,
  period_id text not null references payroll_periods (id) on delete cascade,
  department_id text not null references departments (id),
  notes text not null default '',
  created_by text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (period_id, department_id)
);

create table if not exists department_voucher_lines (
  id text primary key default gen_random_uuid()::text,
  voucher_id text not null references department_vouchers (id) on delete cascade,
  employee_id text references employees (id) on delete set null,
  payee_name text not null check (char_length(btrim(payee_name)) between 1 and 200),
  description text not null default '' check (char_length(description) <= 500),
  amount numeric(12, 2) not null check (amount >= 0 and amount < 100000000),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists department_voucher_lines_voucher_idx on department_voucher_lines (voucher_id, sort_order);

alter table department_vouchers enable row level security;
alter table department_voucher_lines enable row level security;

drop policy if exists "department vouchers read" on department_vouchers;
create policy "department vouchers read" on department_vouchers for select to authenticated using (app_is_elevated());
drop policy if exists "department vouchers write" on department_vouchers;
create policy "department vouchers write" on department_vouchers for all to authenticated
  using (app_is_payroll()) with check (app_is_payroll());

drop policy if exists "department voucher lines read" on department_voucher_lines;
create policy "department voucher lines read" on department_voucher_lines for select to authenticated using (app_is_elevated());
drop policy if exists "department voucher lines write" on department_voucher_lines;
create policy "department voucher lines write" on department_voucher_lines for all to authenticated
  using (app_is_payroll()) with check (app_is_payroll());
