-- =============================================================================
-- Shantahl HRIS — 13th month pay and leave credits
--
--   * thirteenth_month_entries: HR's edits to an employee's 13th month pay
--     sheet for a year. Everything is computed from the payroll; only the
--     figures HR changed are stored here (months: {"1": {"b1": .., "l1": ..,
--     "b2": .., "l2": ..}, ...}; a null column means "as computed").
--   * thirteenth_month_signoffs: Checked by (Sr. Accounting Assistant) and
--     Released by (Corporate Treasurer) per employee per year, with the total
--     at that moment — as on vouchers, the signature prints only while the
--     total is unchanged, and releasing requires checking first.
--   * HR and the payroll officer edit; the payroll roles and management view.
--
-- Needs migrate_phase24_voucher_signoffs.sql (app_can_sign_voucher).
-- Safe to run any time, and safe to re-run.
-- Run once in the SQL Editor (Database > SQL Editor).
-- =============================================================================

create table if not exists thirteenth_month_entries (
  year int not null check (year between 2000 and 2100),
  employee_id text not null references employees (id) on delete cascade,
  designation text,
  months jsonb not null default '{}'::jsonb,
  vl_days numeric(8, 2),
  daily_rate numeric(12, 2),
  last_salary numeric(12, 2) not null default 0,
  sss numeric(12, 2) not null default 0,
  philhealth numeric(12, 2) not null default 0,
  hdmf numeric(12, 2) not null default 0,
  updated_by text not null default '',
  updated_at timestamptz not null default now(),
  primary key (year, employee_id)
);

alter table thirteenth_month_entries enable row level security;

drop policy if exists "thirteenth month read" on thirteenth_month_entries;
create policy "thirteenth month read" on thirteenth_month_entries for select to authenticated
  using (app_is_elevated());

drop policy if exists "thirteenth month write" on thirteenth_month_entries;
create policy "thirteenth month write" on thirteenth_month_entries for all to authenticated
  using (app_has_any_role(array['hr_admin', 'payroll_officer']::app_role[]))
  with check (app_has_any_role(array['hr_admin', 'payroll_officer']::app_role[]));

create table if not exists thirteenth_month_signoffs (
  year int not null check (year between 2000 and 2100),
  employee_id text not null references employees (id) on delete cascade,
  step text not null check (step in ('checked', 'released')),
  signed_by text not null references employees (id),
  signed_by_name text not null default '',
  signed_total numeric(14, 2) not null,
  signed_at timestamptz not null default now(),
  primary key (year, employee_id, step)
);

drop trigger if exists thirteenth_month_signoffs_fill on thirteenth_month_signoffs;
create trigger thirteenth_month_signoffs_fill
  before insert or update on thirteenth_month_signoffs
  for each row execute function app_fill_voucher_signoff();

alter table thirteenth_month_signoffs enable row level security;

drop policy if exists "thirteenth month signoffs read" on thirteenth_month_signoffs;
create policy "thirteenth month signoffs read" on thirteenth_month_signoffs for select to authenticated
  using (app_is_elevated());

drop policy if exists "thirteenth month signoffs sign" on thirteenth_month_signoffs;
create policy "thirteenth month signoffs sign" on thirteenth_month_signoffs for insert to authenticated
  with check (
    app_can_sign_voucher(step)
    and (
      step = 'checked'
      or exists (
        select 1 from thirteenth_month_signoffs c
        where c.year = thirteenth_month_signoffs.year
          and c.employee_id = thirteenth_month_signoffs.employee_id
          and c.step = 'checked'
          and c.signed_total = thirteenth_month_signoffs.signed_total
      )
    )
  );

drop policy if exists "thirteenth month signoffs re-sign" on thirteenth_month_signoffs;
create policy "thirteenth month signoffs re-sign" on thirteenth_month_signoffs for update to authenticated
  using (app_can_sign_voucher(step))
  with check (
    app_can_sign_voucher(step)
    and (
      step = 'checked'
      or exists (
        select 1 from thirteenth_month_signoffs c
        where c.year = thirteenth_month_signoffs.year
          and c.employee_id = thirteenth_month_signoffs.employee_id
          and c.step = 'checked'
          and c.signed_total = thirteenth_month_signoffs.signed_total
      )
    )
  );

drop policy if exists "thirteenth month signoffs withdraw" on thirteenth_month_signoffs;
create policy "thirteenth month signoffs withdraw" on thirteenth_month_signoffs for delete to authenticated
  using (signed_by = app_current_employee_id() or app_is_hr_manager());
