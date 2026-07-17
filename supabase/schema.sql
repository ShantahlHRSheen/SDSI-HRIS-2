-- =============================================================================
-- Shantahl HRIS — Supabase schema (groundwork)
--
-- Mirrors the data model currently defined in lib/types.ts (localStorage demo)
-- so a future migration can move the app off client-only storage without a
-- redesign. Nothing in the running app reads or writes this schema yet — see
-- lib/supabase/client.ts and lib/supabase/queries.ts for the (currently
-- unused) client-side wiring.
--
-- Run this once, in order, against a fresh Supabase project: paste into the
-- SQL Editor (Database > SQL Editor) and Run, or `psql <connection-string> -f
-- supabase/schema.sql`.
--
-- Auth model: every employee who should be able to log in gets a Supabase
-- Auth user (email + password, created via Auth > Users or the Admin API),
-- then employees.user_id is set to that auth user's id. Employees without a
-- user_id simply have no login — matches today's "7 of 68 have a demo
-- login" state, and lets you onboard the rest incrementally.
-- =============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type app_role as enum (
  'hr_admin',
  'payroll_officer',
  'sr_accounting_assistant',
  'treasurer',
  'cfo',
  'dept_head',
  'employee',
  'upper_management',
  'sys_admin'
);

create type holiday_type as enum ('regular', 'special_non_working');
create type payroll_period_status as enum ('open', 'locked', 'closed');
create type employment_status as enum (
  'regular', 'probationary', 'project_based', 'freelance', 'consultant', 'intern'
);
create type employee_lifecycle_status as enum ('active', 'on_leave', 'resigned', 'terminated');
create type payroll_type as enum ('daily', 'monthly');
create type evaluation_status as enum ('draft', 'submitted', 'acknowledged');
create type disciplinary_type as enum (
  'incident_report', 'verbal_warning', 'written_warning', 'suspension', 'nte', 'nod'
);
create type disciplinary_status as enum ('open', 'resolved');
create type announcement_category as enum (
  'announcement', 'holiday', 'event', 'memo', 'policy'
);
create type bir_form_type as enum ('1601c', '2316');
create type request_status as enum ('pending', 'approved', 'rejected', 'cancelled');
create type attendance_record_source as enum ('import', 'manual');

-- ---------------------------------------------------------------------------
-- Reference / lookup tables
-- ---------------------------------------------------------------------------

create table branches (
  id text primary key default gen_random_uuid()::text,
  name text not null,
  code text not null unique,
  address text not null
);

create table departments (
  id text primary key default gen_random_uuid()::text,
  name text not null
);

create table positions (
  id text primary key default gen_random_uuid()::text,
  title text not null,
  department_id text not null references departments (id)
);

create table work_schedules (
  id text primary key default gen_random_uuid()::text,
  name text not null,
  time_in text not null,
  time_out text not null,
  days text not null,
  grace_minutes integer not null default 0
);

create table holidays (
  id text primary key default gen_random_uuid()::text,
  name text not null,
  date date not null,
  type holiday_type not null,
  verified boolean not null default false
);

create table leave_types (
  id text primary key default gen_random_uuid()::text,
  name text not null,
  default_credits numeric not null default 0,
  requires_cert boolean not null default false
);

create table payroll_periods (
  id text primary key default gen_random_uuid()::text,
  period_start date not null,
  period_end date not null,
  status payroll_period_status not null default 'open',
  check (period_end >= period_start)
);

-- ---------------------------------------------------------------------------
-- Employees — the 201 file + the login link
-- ---------------------------------------------------------------------------

create table employees (
  id text primary key default gen_random_uuid()::text,
  employee_number text not null unique,
  first_name text not null,
  last_name text not null,
  middle_name text,
  nickname text not null,
  gender text not null check (gender in ('Male', 'Female')),
  birthdate date not null,
  civil_status text not null check (civil_status in ('Single', 'Married', 'Widowed', 'Separated')),
  nationality text not null,
  address text not null,
  contact_number text not null,
  email text not null unique,
  emergency_contact_name text not null,
  emergency_contact_phone text not null,

  branch_id text not null references branches (id),
  department_id text not null references departments (id),
  position_id text not null references positions (id),
  supervisor_id text references employees (id),
  -- Who evaluates this employee's Job Performance KPIs — assigned by HR,
  -- independent of supervisor_id. Null falls back to supervisor_id (see
  -- effectiveJobPerformanceEvaluatorId in lib/performance-eval.ts).
  job_performance_evaluator_id text references employees (id),

  employment_status employment_status not null,
  date_hired date not null,
  date_regularized date,
  contract_start date,
  contract_end date,
  probation_ends_at date,

  payroll_type payroll_type not null,
  daily_rate numeric,
  monthly_salary numeric,
  daily_allowance numeric,
  monthly_allowance numeric,

  status employee_lifecycle_status not null default 'active',
  status_changed_at date,
  roles app_role[] not null default '{}',

  -- Nullable: not every employee has been onboarded with a login yet.
  user_id uuid unique references auth.users (id) on delete set null
);

create index employees_supervisor_id_idx on employees (supervisor_id);
create index employees_user_id_idx on employees (user_id);

-- Auto-link onboarding: whenever a new Supabase Auth user is created (via the
-- dashboard, an invite, etc.), attach it to the employees row with the same
-- email if that row doesn't already have a login. Without this, every new
-- account would need someone to manually re-run the email-matching UPDATE
-- from seed.sql — this makes incremental onboarding (see the employees.user_id
-- comment above) actually incremental, with no follow-up step.
create or replace function public.link_employee_on_auth_user_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.employees
  set user_id = new.id
  where lower(email) = lower(new.email) and user_id is null;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.link_employee_on_auth_user_created();

-- ---------------------------------------------------------------------------
-- Performance, discipline, audit, announcements
-- ---------------------------------------------------------------------------

create table performance_evaluations (
  id text primary key default gen_random_uuid()::text,
  employee_id text not null references employees (id),
  -- Split ownership: HR fills/owns Behavior, the employee's designated Job
  -- Performance evaluator fills/owns Job Performance, independently. Null
  -- until that party actually saves their section.
  behavior_evaluator_id text references employees (id),
  job_performance_evaluator_id text references employees (id),
  period text not null,
  criteria jsonb not null default '[]', -- [{ category, label, weight, score, remarks }]
  overall_score numeric not null,
  comments text not null default '',
  status evaluation_status not null default 'draft',
  created_at timestamptz not null default now()
);

create table disciplinary_records (
  id text primary key default gen_random_uuid()::text,
  employee_id text not null references employees (id),
  type disciplinary_type not null,
  description text not null,
  issued_by text not null references employees (id),
  date date not null,
  status disciplinary_status not null default 'open',
  attachment_name text
);

create table audit_logs (
  id text primary key default gen_random_uuid()::text,
  actor_employee_id text references employees (id),
  actor_name text not null, -- denormalized at time of action, for immutability
  module text not null,
  action text not null,
  description text not null,
  previous_value text,
  new_value text,
  created_at timestamptz not null default now()
);

create table announcements (
  id text primary key default gen_random_uuid()::text,
  title text not null,
  body text not null,
  category announcement_category not null,
  posted_by text not null, -- display name, matches current app convention
  posted_at timestamptz not null default now(),
  expires_at timestamptz
);

-- ---------------------------------------------------------------------------
-- Approvable requests (leave / overtime / attendance correction)
-- ---------------------------------------------------------------------------

create table leave_requests (
  id text primary key default gen_random_uuid()::text,
  employee_id text not null references employees (id),
  leave_type_id text not null references leave_types (id),
  start_date date not null,
  end_date date not null,
  days numeric not null,
  reason text not null default '',
  status request_status not null default 'pending',
  filed_at timestamptz not null default now(),
  decided_by text references employees (id),
  decided_at timestamptz,
  decision_note text
);

create table overtime_requests (
  id text primary key default gen_random_uuid()::text,
  employee_id text not null references employees (id),
  date date not null,
  hours numeric not null,
  reason text not null default '',
  status request_status not null default 'pending',
  filed_at timestamptz not null default now(),
  decided_by text references employees (id),
  decided_at timestamptz,
  decision_note text
);

create table attendance_correction_requests (
  id text primary key default gen_random_uuid()::text,
  employee_id text not null references employees (id),
  date date not null,
  requested_time_in text,
  requested_time_out text,
  reason text not null default '',
  status request_status not null default 'pending',
  filed_at timestamptz not null default now(),
  decided_by text references employees (id),
  decided_at timestamptz,
  decision_note text
);

-- ---------------------------------------------------------------------------
-- Attendance + payroll
-- ---------------------------------------------------------------------------

create table attendance_period_records (
  id text primary key default gen_random_uuid()::text,
  period_id text not null references payroll_periods (id),
  employee_id text not null references employees (id),
  days_worked numeric not null default 0,
  holiday_days numeric not null default 0,
  sl_days numeric not null default 0,
  vl_days numeric not null default 0,
  late_adj_minutes numeric not null default 0,
  undertime_minutes numeric not null default 0,
  notes text not null default '',
  source attendance_record_source not null default 'manual',
  updated_by text not null, -- display name
  updated_at timestamptz not null default now(),

  -- Daily-level tardiness/absenteeism detail — only populated when imported
  -- from a tracker export with a "Daily Attendance" sheet. Optional so
  -- manual entries and older imports remain valid without backfilling.
  late_instances integer,
  late_day_details jsonb,
  undertime_instances integer,
  undertime_day_details jsonb,
  half_day_instances integer,
  half_day_dates jsonb,
  absence_instances integer,
  absent_dates jsonb,

  unique (period_id, employee_id)
);

create table payroll_line_overrides (
  id text primary key default gen_random_uuid()::text,
  period_id text not null references payroll_periods (id),
  employee_id text not null references employees (id),
  travel_allowance numeric not null default 0,
  laundry_allowance numeric not null default 0,
  medical_cash_allowance numeric not null default 0,
  supervisor_allowance numeric not null default 0,
  cash_advance numeric not null default 0,
  lsm_biz_loan numeric not null default 0,
  lsm_coop_loan numeric not null default 0,
  shortages numeric not null default 0,
  sss_loan numeric not null default 0,
  hdmf_loan numeric not null default 0,
  hdmf_mp2_savings numeric not null default 0,
  adjustment_add numeric not null default 0,
  adjustment_deduct numeric not null default 0,
  sss_contribution_override numeric,
  sss_wisp_override numeric,
  philhealth_contribution_override numeric,
  hdmf_contribution_override numeric,
  withholding_tax_override numeric,
  daily_allowance_override numeric,
  basic_pay_override numeric,
  lates_undertime_override numeric,
  undertime_deduction_override numeric,
  holiday_pay_override numeric,
  vl_pay_override numeric,
  sl_pay_override numeric,
  ot_hours_override numeric,
  ot_pay_override numeric,
  updated_by text not null,
  updated_at timestamptz not null default now(),
  unique (period_id, employee_id)
);

create table voucher_amount_overrides (
  id text primary key default gen_random_uuid()::text,
  period_id text not null references payroll_periods (id),
  employee_id text not null references employees (id),
  amount numeric not null,
  updated_by text not null,
  updated_at timestamptz not null default now(),
  unique (period_id, employee_id)
);

create table generated_payslips (
  id text primary key default gen_random_uuid()::text,
  period_id text not null references payroll_periods (id),
  employee_id text not null references employees (id),
  generated_by text not null,
  generated_at timestamptz not null default now(),
  summary jsonb not null default '{}'
);

create table generated_vouchers (
  id text primary key default gen_random_uuid()::text,
  period_id text not null references payroll_periods (id),
  employee_id text not null references employees (id),
  amount numeric not null,
  generated_by text not null,
  generated_at timestamptz not null default now()
);

create table generated_bir_forms (
  id text primary key default gen_random_uuid()::text,
  form_type bir_form_type not null,
  period text not null, -- monthKey ("2026-07") for 1601-C, tax year ("2026") for 2316
  employee_id text references employees (id), -- null for 1601-C (company-wide)
  generated_by text not null,
  generated_at timestamptz not null default now(),
  summary jsonb not null default '{}'
);

create index attendance_period_records_employee_idx on attendance_period_records (employee_id);
create index payroll_line_overrides_employee_idx on payroll_line_overrides (employee_id);
create index leave_requests_employee_idx on leave_requests (employee_id);
create index overtime_requests_employee_idx on overtime_requests (employee_id);
create index attendance_correction_requests_employee_idx on attendance_correction_requests (employee_id);
create index performance_evaluations_employee_idx on performance_evaluations (employee_id);
create index disciplinary_records_employee_idx on disciplinary_records (employee_id);
create index generated_payslips_employee_idx on generated_payslips (employee_id);

-- =============================================================================
-- Role-check helpers
--
-- app_current_employee_id() resolves the signed-in employee row from
-- auth.uid(). app_has_any_role(...) checks that employee's roles array.
-- "Elevated" = every role that should see company-wide HR/payroll data
-- regardless of department. dept_head is deliberately NOT elevated — it's
-- scoped to its own department via app_is_dept_head() +
-- app_current_department_id() instead, mirroring lib/helpers.ts's
-- scopeEmployeesForViewer() exactly (same set of pages: employee directory,
-- performance evaluations, disciplinary records, and the
-- attendance/overtime/tardiness/absenteeism reports).
-- =============================================================================

create or replace function app_current_employee_id()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select id from employees where user_id = auth.uid();
$$;

create or replace function app_current_department_id()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select department_id from employees where user_id = auth.uid();
$$;

create or replace function app_has_any_role(target_roles app_role[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select roles && target_roles from employees where user_id = auth.uid()),
    false
  );
$$;

create or replace function app_is_elevated()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select app_has_any_role(array[
    'hr_admin', 'payroll_officer', 'sr_accounting_assistant',
    'treasurer', 'cfo', 'upper_management', 'sys_admin'
  ]::app_role[]);
$$;

create or replace function app_is_dept_head()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select app_has_any_role(array['dept_head']::app_role[]);
$$;

create or replace function app_is_hr_or_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select app_has_any_role(array['hr_admin', 'sys_admin']::app_role[]);
$$;

create or replace function app_is_payroll()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select app_has_any_role(array[
    'hr_admin', 'payroll_officer', 'sr_accounting_assistant',
    'treasurer', 'cfo', 'sys_admin'
  ]::app_role[]);
$$;

-- =============================================================================
-- Row Level Security
--
-- Pattern: reference tables are readable by any signed-in user, writable only
-- by hr_admin/sys_admin. Personal-data tables are readable/writable by the
-- owning employee for their own row, and fully readable/writable by elevated
-- roles. Sensitive company-wide tables (audit log, payroll overrides) are
-- elevated-only. dept_head additionally sees same-department rows on the
-- specific tables the app actually shows them (employees, evaluations,
-- disciplinary records, attendance) — everywhere else dept_head is treated
-- like a plain employee (their own rows only), matching what the frontend
-- already does.
-- =============================================================================

alter table branches enable row level security;
alter table departments enable row level security;
alter table positions enable row level security;
alter table work_schedules enable row level security;
alter table holidays enable row level security;
alter table leave_types enable row level security;
alter table payroll_periods enable row level security;
alter table employees enable row level security;
alter table performance_evaluations enable row level security;
alter table disciplinary_records enable row level security;
alter table audit_logs enable row level security;
alter table announcements enable row level security;
alter table leave_requests enable row level security;
alter table overtime_requests enable row level security;
alter table attendance_correction_requests enable row level security;
alter table attendance_period_records enable row level security;
alter table payroll_line_overrides enable row level security;
alter table voucher_amount_overrides enable row level security;
alter table generated_payslips enable row level security;
alter table generated_vouchers enable row level security;
alter table generated_bir_forms enable row level security;

-- Reference tables: read for any signed-in user, write for HR/sys admin.
create policy "reference read" on branches for select using (auth.role() = 'authenticated');
create policy "reference write" on branches for all using (app_is_hr_or_admin()) with check (app_is_hr_or_admin());

create policy "reference read" on departments for select using (auth.role() = 'authenticated');
create policy "reference write" on departments for all using (app_is_hr_or_admin()) with check (app_is_hr_or_admin());

create policy "reference read" on positions for select using (auth.role() = 'authenticated');
create policy "reference write" on positions for all using (app_is_hr_or_admin()) with check (app_is_hr_or_admin());

create policy "reference read" on work_schedules for select using (auth.role() = 'authenticated');
create policy "reference write" on work_schedules for all using (app_is_hr_or_admin()) with check (app_is_hr_or_admin());

create policy "reference read" on holidays for select using (auth.role() = 'authenticated');
create policy "reference write" on holidays for all using (app_is_hr_or_admin()) with check (app_is_hr_or_admin());

create policy "reference read" on leave_types for select using (auth.role() = 'authenticated');
create policy "reference write" on leave_types for all using (app_is_hr_or_admin()) with check (app_is_hr_or_admin());

create policy "reference read" on announcements for select using (auth.role() = 'authenticated');
create policy "reference write" on announcements for all using (app_is_hr_or_admin()) with check (app_is_hr_or_admin());

-- Payroll periods: elevated roles manage them, everyone signed-in can read
-- (employees need to see period labels on their own payslips/vouchers).
create policy "payroll periods read" on payroll_periods for select using (auth.role() = 'authenticated');
create policy "payroll periods write" on payroll_periods for all using (app_is_payroll()) with check (app_is_payroll());

-- Employees: self row, elevated roles read everyone, dept_head reads their
-- own department; only HR/sys admin can write.
create policy "employees read self or elevated" on employees for select
  using (
    id = app_current_employee_id()
    or app_is_elevated()
    or (app_is_dept_head() and department_id = app_current_department_id())
  );
create policy "employees write hr" on employees for all
  using (app_is_hr_or_admin()) with check (app_is_hr_or_admin());

-- Performance evaluations: the employee being evaluated, either of their two
-- section evaluators (HR for Behavior, the designated evaluator for Job
-- Performance), elevated roles, and dept_head for their own department's
-- employees (read-only overview — a dept_head can still only *write* the
-- section they're actually assigned to evaluate, via the evaluator-id clause,
-- same as anyone else).
create policy "evaluations read" on performance_evaluations for select
  using (
    employee_id = app_current_employee_id()
    or behavior_evaluator_id = app_current_employee_id()
    or job_performance_evaluator_id = app_current_employee_id()
    or app_is_elevated()
    or (app_is_dept_head() and employee_id in (select id from employees where department_id = app_current_department_id()))
  );
create policy "evaluations write" on performance_evaluations for all
  using (app_is_elevated() or behavior_evaluator_id = app_current_employee_id() or job_performance_evaluator_id = app_current_employee_id())
  with check (app_is_elevated() or behavior_evaluator_id = app_current_employee_id() or job_performance_evaluator_id = app_current_employee_id());

-- Disciplinary records: the employee named in the record, elevated roles, and
-- dept_head for their own department (dept_head can also issue these, per
-- the app's "canCreate" check).
create policy "discipline read" on disciplinary_records for select
  using (
    employee_id = app_current_employee_id()
    or app_is_elevated()
    or (app_is_dept_head() and employee_id in (select id from employees where department_id = app_current_department_id()))
  );
create policy "discipline write" on disciplinary_records for all
  using (app_is_elevated() or (app_is_dept_head() and employee_id in (select id from employees where department_id = app_current_department_id())))
  with check (app_is_elevated() or (app_is_dept_head() and employee_id in (select id from employees where department_id = app_current_department_id())));

-- Audit log: read is elevated-only (dept_head is not elevated, so doesn't
-- see this, matching the page's stated "HR and System Administrators"
-- audience). Insert is open to any signed-in user, since every action across
-- every role gets logged — there's no service-role backend here to do it on
-- their behalf.
create policy "audit read elevated" on audit_logs for select using (app_is_elevated());
create policy "audit write authenticated" on audit_logs for insert with check (auth.role() = 'authenticated');

-- Approvable requests: the filer, plus elevated roles who approve them.
-- dept_head isn't elevated, so (like a plain employee) only sees/files their
-- own requests here — the app never gives dept_head an approval queue for
-- leave/overtime/corrections, only hr_admin/upper_management get that.
create policy "leave requests read" on leave_requests for select
  using (employee_id = app_current_employee_id() or app_is_elevated());
create policy "leave requests insert self" on leave_requests for insert
  with check (employee_id = app_current_employee_id() or app_is_elevated());
create policy "leave requests update elevated or own pending" on leave_requests for update
  using (app_is_elevated() or (employee_id = app_current_employee_id() and status = 'pending'))
  with check (app_is_elevated() or (employee_id = app_current_employee_id() and status = 'pending'));

create policy "overtime requests read" on overtime_requests for select
  using (employee_id = app_current_employee_id() or app_is_elevated());
create policy "overtime requests insert self" on overtime_requests for insert
  with check (employee_id = app_current_employee_id() or app_is_elevated());
create policy "overtime requests update elevated or own pending" on overtime_requests for update
  using (app_is_elevated() or (employee_id = app_current_employee_id() and status = 'pending'))
  with check (app_is_elevated() or (employee_id = app_current_employee_id() and status = 'pending'));

create policy "correction requests read" on attendance_correction_requests for select
  using (employee_id = app_current_employee_id() or app_is_elevated());
create policy "correction requests insert self" on attendance_correction_requests for insert
  with check (employee_id = app_current_employee_id() or app_is_elevated());
create policy "correction requests update elevated or own pending" on attendance_correction_requests for update
  using (app_is_elevated() or (employee_id = app_current_employee_id() and status = 'pending'))
  with check (app_is_elevated() or (employee_id = app_current_employee_id() and status = 'pending'));

-- Attendance + payroll figures: the employee can read their own, dept_head
-- can read their department's (for the attendance/overtime/tardiness/
-- absenteeism reports); only payroll-tier roles write.
create policy "attendance read" on attendance_period_records for select
  using (
    employee_id = app_current_employee_id()
    or app_is_elevated()
    or (app_is_dept_head() and employee_id in (select id from employees where department_id = app_current_department_id()))
  );
create policy "attendance write payroll" on attendance_period_records for all
  using (app_is_payroll()) with check (app_is_payroll());

create policy "payroll overrides elevated only" on payroll_line_overrides for all
  using (app_is_payroll()) with check (app_is_payroll());

create policy "voucher overrides elevated only" on voucher_amount_overrides for all
  using (app_is_payroll()) with check (app_is_payroll());

create policy "payslips read" on generated_payslips for select
  using (employee_id = app_current_employee_id() or app_is_elevated());
create policy "payslips write payroll" on generated_payslips for all
  using (app_is_payroll()) with check (app_is_payroll());

create policy "vouchers read" on generated_vouchers for select
  using (employee_id = app_current_employee_id() or app_is_elevated());
create policy "vouchers write payroll" on generated_vouchers for all
  using (app_is_payroll()) with check (app_is_payroll());

-- Company-wide 1601-C rows (employee_id is null) are payroll-tier only, not
-- readable by every signed-in user — tightened from the original policy,
-- which let anyone read them via a bare "employee_id is null" clause.
create policy "bir forms read" on generated_bir_forms for select
  using (employee_id = app_current_employee_id() or app_is_elevated());
create policy "bir forms write payroll" on generated_bir_forms for all
  using (app_is_payroll()) with check (app_is_payroll());
