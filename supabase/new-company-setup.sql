-- =============================================================================
-- LSM Group of Companies HRIS — complete database setup for a NEW company
--
-- Run ONCE in the new company's own Supabase project (SQL Editor > New query >
-- paste the whole file > Run). It creates every table, rule and storage bucket
-- the HRIS needs, plus starter settings (leave types, work schedules, 2026
-- holidays). It contains no employees or company data.
--
-- Built from supabase/schema.sql + migrate_phase1…34 (Shantahl-only data steps
-- left out). Do NOT run this on Shantahl's database.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- schema.sql
-- ---------------------------------------------------------------------------

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
  -- 'unassigned' is a placeholder for a historical/resigned employee
  -- imported without this on file — never used for anyone active.
  'regular', 'probationary', 'trainee', 'project_based', 'freelance', 'consultant', 'intern', 'unassigned'
);
create type employee_lifecycle_status as enum ('active', 'on_leave', 'resigned', 'terminated');
create type payroll_type as enum ('daily', 'monthly', 'unassigned');
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
  name text not null,
  division text not null check (division in ('shared_services', 'business_units'))
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
  -- Nullable to allow importing employees whose personal details aren't on
  -- file yet — the profile page and edit modal show "Not on file" / "—"
  -- until HR fills these in.
  birthdate date,
  civil_status text check (civil_status in ('Single', 'Married', 'Widowed', 'Separated')),
  nationality text,
  address text,
  contact_number text,
  email text unique,
  emergency_contact_name text,
  emergency_contact_phone text,

  -- Real government IDs, entered once known. Null means not on file yet —
  -- BIR forms fall back to an illustrative masked placeholder in that case.
  sss_number text,
  philhealth_number text,
  hdmf_number text,
  tin text,

  branch_id text not null references branches (id),
  department_id text not null references departments (id),
  position_id text not null references positions (id),
  supervisor_id text references employees (id),
  -- Who evaluates this employee's Job Performance KPIs — assigned by HR,
  -- independent of supervisor_id. Null falls back to supervisor_id (see
  -- effectiveJobPerformanceEvaluatorId in lib/performance-eval.ts).
  job_performance_evaluator_id text references employees (id),

  employment_status employment_status not null,
  -- Nullable for the same reason as the personal-detail fields above.
  date_hired date,
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

-- Splits an employee's cost/headcount across more than one department (e.g.
-- a role that's genuinely shared between two business units). Most
-- employees have no rows here at all — they're fully attributed to their
-- plain employees.department_id; only actually-split employees get rows,
-- and those rows' percents should sum to 100 (enforced at the app layer,
-- not here — a cross-row SUM check needs a trigger and isn't worth it for
-- a field HR edits by hand).
create table employee_department_allocations (
  employee_id text not null references employees (id) on delete cascade,
  department_id text not null references departments (id),
  percent numeric not null check (percent > 0 and percent <= 100),
  primary key (employee_id, department_id)
);

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
  -- Actual/raw minutes — the tracker's "Adj Mins" columns are deliberately
  -- not read or stored anywhere in this system.
  late_minutes numeric not null default 0,
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

-- True if an employee counts as belonging to a department — either it's
-- their plain department_id, or they have an explicit row in
-- employee_department_allocations for it (an employee split across more
-- than one department, e.g. a role shared between two business units).
-- Every dept_head-scoped policy below uses this instead of a bare
-- department_id equality check, so a dept_head sees the full membership.
create or replace function app_employee_in_department(emp_id text, dept_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from employees e where e.id = emp_id and e.department_id = dept_id)
      or exists (select 1 from employee_department_allocations a where a.employee_id = emp_id and a.department_id = dept_id);
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
alter table employee_department_allocations enable row level security;
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
    or (app_is_dept_head() and app_employee_in_department(id, app_current_department_id()))
  );
create policy "employees write hr" on employees for all
  using (app_is_hr_or_admin()) with check (app_is_hr_or_admin());

-- Department allocations: read for any signed-in user (same as the other
-- reference/org-structure tables), write for HR/sys admin only.
create policy "reference read" on employee_department_allocations for select using (auth.role() = 'authenticated');
create policy "reference write" on employee_department_allocations for all
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
    or (app_is_dept_head() and app_employee_in_department(employee_id, app_current_department_id()))
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
    or (app_is_dept_head() and app_employee_in_department(employee_id, app_current_department_id()))
  );
create policy "discipline write" on disciplinary_records for all
  using (app_is_elevated() or (app_is_dept_head() and app_employee_in_department(employee_id, app_current_department_id())))
  with check (app_is_elevated() or (app_is_dept_head() and app_employee_in_department(employee_id, app_current_department_id())));

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
    or (app_is_dept_head() and app_employee_in_department(employee_id, app_current_department_id()))
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


-- ---------------------------------------------------------------------------
-- migrate_phase1_schema_drift.sql
-- ---------------------------------------------------------------------------

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


-- ---------------------------------------------------------------------------
-- migrate_phase4_dept_head_rls.sql
-- ---------------------------------------------------------------------------

-- =============================================================================
-- Shantahl HRIS — Phase 4 RLS hardening patch
--
-- Brings an already-applied schema up to date with the latest
-- supabase/schema.sql: scopes dept_head to their own department (instead of
-- seeing everything, company-wide) on the exact tables the app shows them,
-- and closes two pre-existing gaps (audit-log inserts were blocked for
-- non-elevated real accounts; 1601-C company-wide rows were readable by
-- anyone signed in). Nothing here deletes data — it only changes who can
-- read/write which rows.
--
-- Run once in the SQL Editor (Database > SQL Editor), any time after
-- schema.sql + the Phase 1 patch. Order matters: each policy is dropped
-- before being recreated, since Postgres doesn't have "create or replace
-- policy".
-- =============================================================================

-- New/redefined helper functions.
create or replace function app_current_department_id()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select department_id from employees where user_id = auth.uid();
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

-- Employees: dept_head additionally reads their own department.
drop policy if exists "employees read self or elevated" on employees;
create policy "employees read self or elevated" on employees for select
  using (
    id = app_current_employee_id()
    or app_is_elevated()
    or (app_is_dept_head() and department_id = app_current_department_id())
  );

-- Performance evaluations: dept_head reads their department; write access is
-- now "elevated, or one of the two assigned evaluators" instead of a blanket
-- "elevated" that used to include dept_head regardless of assignment.
drop policy if exists "evaluations read" on performance_evaluations;
create policy "evaluations read" on performance_evaluations for select
  using (
    employee_id = app_current_employee_id()
    or behavior_evaluator_id = app_current_employee_id()
    or job_performance_evaluator_id = app_current_employee_id()
    or app_is_elevated()
    or (app_is_dept_head() and employee_id in (select id from employees where department_id = app_current_department_id()))
  );

drop policy if exists "evaluations write elevated" on performance_evaluations;
drop policy if exists "evaluations write" on performance_evaluations;
create policy "evaluations write" on performance_evaluations for all
  using (app_is_elevated() or behavior_evaluator_id = app_current_employee_id() or job_performance_evaluator_id = app_current_employee_id())
  with check (app_is_elevated() or behavior_evaluator_id = app_current_employee_id() or job_performance_evaluator_id = app_current_employee_id());

-- Disciplinary records: dept_head reads and writes for their own department.
drop policy if exists "discipline read" on disciplinary_records;
create policy "discipline read" on disciplinary_records for select
  using (
    employee_id = app_current_employee_id()
    or app_is_elevated()
    or (app_is_dept_head() and employee_id in (select id from employees where department_id = app_current_department_id()))
  );

drop policy if exists "discipline write elevated" on disciplinary_records;
drop policy if exists "discipline write" on disciplinary_records;
create policy "discipline write" on disciplinary_records for all
  using (app_is_elevated() or (app_is_dept_head() and employee_id in (select id from employees where department_id = app_current_department_id())))
  with check (app_is_elevated() or (app_is_dept_head() and employee_id in (select id from employees where department_id = app_current_department_id())));

-- Audit log: insert opened up to any signed-in user (previously blocked any
-- non-elevated real account from ever writing an audit entry, since
-- "elevated" was the only allowed inserter). Read stays elevated-only, which
-- now excludes dept_head.
drop policy if exists "audit write elevated" on audit_logs;
drop policy if exists "audit write authenticated" on audit_logs;
create policy "audit write authenticated" on audit_logs for insert with check (auth.role() = 'authenticated');

-- Attendance: dept_head reads their department (for the report pages).
drop policy if exists "attendance read" on attendance_period_records;
create policy "attendance read" on attendance_period_records for select
  using (
    employee_id = app_current_employee_id()
    or app_is_elevated()
    or (app_is_dept_head() and employee_id in (select id from employees where department_id = app_current_department_id()))
  );

-- BIR forms: company-wide 1601-C rows (employee_id is null) used to be
-- readable by any signed-in user via a bare "employee_id is null" clause —
-- tightened to payroll-tier roles only.
drop policy if exists "bir forms read" on generated_bir_forms;
create policy "bir forms read" on generated_bir_forms for select
  using (employee_id = app_current_employee_id() or app_is_elevated());

-- No changes needed for leave_requests / overtime_requests /
-- attendance_correction_requests / payroll_line_overrides /
-- voucher_amount_overrides / generated_payslips / generated_vouchers — their
-- existing policies already reference app_is_elevated(), so redefining that
-- function above automatically narrows dept_head's access on those tables
-- too (down to "their own rows only", matching the app, which never gives
-- dept_head an approval queue or payroll visibility).


-- ---------------------------------------------------------------------------
-- migrate_phase5_auto_link_trigger.sql
-- ---------------------------------------------------------------------------

-- =============================================================================
-- Shantahl HRIS — auto-link trigger for onboarding new employee logins
--
-- Without this, only the one-time seed.sql script links a new Supabase Auth
-- account to its employees row (by matching email). Any account created
-- afterward — which is the normal way you'll onboard the rest of staff —
-- would need someone to manually re-run that same email-matching UPDATE.
-- This trigger does it automatically: the moment a new Auth user is created
-- (dashboard, invite, whatever), if their email matches an employees row
-- that doesn't have a login yet, it gets linked immediately.
--
-- Safe to run any time, and safe to re-run — it only replaces the function
-- and trigger definitions, doesn't touch any data.
--
-- Run once in the SQL Editor (Database > SQL Editor).
-- =============================================================================

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
-- migrate_phase6 (schema part only)
-- ---------------------------------------------------------------------------

-- Departments are grouped into divisions (Shared Services / Business Units).
alter table departments add column if not exists division text;
update departments set division = 'shared_services' where division is null;
alter table departments alter column division set not null;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'departments_division_check') then
    alter table departments
      add constraint departments_division_check check (division in ('shared_services', 'business_units'));
  end if;
end $$;


-- ---------------------------------------------------------------------------
-- migrate_phase7_employee_department_allocations.sql
-- ---------------------------------------------------------------------------

-- =============================================================================
-- Shantahl HRIS — employee department allocations (multi-department split)
--
-- Lets an employee belong to more than one department at once, with a
-- percentage split (e.g. Cecil Catapang, shared 50/50 between MLM and
-- Darofy — her ₱30,000 monthly salary and headcount are attributed
-- ₱15,000 / 0.5 to each). Most employees never get a row here — they stay
-- fully attributed to their plain employees.department_id, unchanged. This
-- also extends the dept_head RLS scoping so a dept_head sees every employee
-- allocated to their department, not just the one whose department_id
-- happens to point there.
--
-- Safe to run any time, and safe to re-run — every step is a no-op once
-- already applied.
--
-- Run once in the SQL Editor (Database > SQL Editor), any time after
-- migrate_phase4_dept_head_rls.sql.
-- =============================================================================

create table if not exists employee_department_allocations (
  employee_id text not null references employees (id) on delete cascade,
  department_id text not null references departments (id),
  percent numeric not null check (percent > 0 and percent <= 100),
  primary key (employee_id, department_id)
);

alter table employee_department_allocations enable row level security;

drop policy if exists "reference read" on employee_department_allocations;
create policy "reference read" on employee_department_allocations for select using (auth.role() = 'authenticated');
drop policy if exists "reference write" on employee_department_allocations;
create policy "reference write" on employee_department_allocations for all
  using (app_is_hr_or_admin()) with check (app_is_hr_or_admin());

-- True if an employee counts as belonging to a department — either it's
-- their plain department_id, or they have an explicit row above for it.
create or replace function app_employee_in_department(emp_id text, dept_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from employees e where e.id = emp_id and e.department_id = dept_id)
      or exists (select 1 from employee_department_allocations a where a.employee_id = emp_id and a.department_id = dept_id);
$$;

-- Re-patch the dept_head-scoped policies from migrate_phase4_dept_head_rls.sql
-- to use app_employee_in_department() instead of a bare department_id
-- equality check, so a split employee is visible to every dept_head they're
-- allocated to.

drop policy if exists "employees read self or elevated" on employees;
create policy "employees read self or elevated" on employees for select
  using (
    id = app_current_employee_id()
    or app_is_elevated()
    or (app_is_dept_head() and app_employee_in_department(id, app_current_department_id()))
  );

drop policy if exists "evaluations read" on performance_evaluations;
create policy "evaluations read" on performance_evaluations for select
  using (
    employee_id = app_current_employee_id()
    or behavior_evaluator_id = app_current_employee_id()
    or job_performance_evaluator_id = app_current_employee_id()
    or app_is_elevated()
    or (app_is_dept_head() and app_employee_in_department(employee_id, app_current_department_id()))
  );

drop policy if exists "discipline read" on disciplinary_records;
create policy "discipline read" on disciplinary_records for select
  using (
    employee_id = app_current_employee_id()
    or app_is_elevated()
    or (app_is_dept_head() and app_employee_in_department(employee_id, app_current_department_id()))
  );

drop policy if exists "discipline write" on disciplinary_records;
create policy "discipline write" on disciplinary_records for all
  using (app_is_elevated() or (app_is_dept_head() and app_employee_in_department(employee_id, app_current_department_id())))
  with check (app_is_elevated() or (app_is_dept_head() and app_employee_in_department(employee_id, app_current_department_id())));

drop policy if exists "attendance read" on attendance_period_records;
create policy "attendance read" on attendance_period_records for select
  using (
    employee_id = app_current_employee_id()
    or app_is_elevated()
    or (app_is_dept_head() and app_employee_in_department(employee_id, app_current_department_id()))
  );

-- (Shantahl-only data step left out.)


-- ---------------------------------------------------------------------------
-- migrate_phase8_employee_gov_ids.sql
-- ---------------------------------------------------------------------------

-- =============================================================================
-- Shantahl HRIS — real employee government IDs (SSS, PhilHealth, HDMF, TIN)
--
-- Adds 4 nullable columns to employees for HR to fill in as they're
-- confirmed. Until a value is entered, BIR forms and the employee profile
-- page continue to fall back to an illustrative masked placeholder (see
-- employeeGovIds() in lib/bir.ts) — so this is safe to run even before any
-- real numbers are on hand.
--
-- Safe to run any time, and safe to re-run.
--
-- Run once in the SQL Editor (Database > SQL Editor).
-- =============================================================================

alter table employees add column if not exists sss_number text;
alter table employees add column if not exists philhealth_number text;
alter table employees add column if not exists hdmf_number text;
alter table employees add column if not exists tin text;


-- ---------------------------------------------------------------------------
-- migrate_phase9_late_raw_minutes.sql
-- ---------------------------------------------------------------------------

-- =============================================================================
-- Shantahl HRIS — use actual/raw late & undertime minutes, not "Adj"
--
-- Payroll's late deduction previously read whatever value sat in the
-- tracker's "Late Adj Mins" column (imported verbatim, no adjustment logic
-- of our own). Undertime already preferred "Undertime Adj Mins" over
-- "Undertime Raw Mins" when both were present. Going forward, only the
-- "Late Raw Mins" / "Undertime Raw Mins" columns are read — the "Adj Mins"
-- columns are no longer looked at anywhere in this system, on either the
-- Summary sheet or manual entry.
--
-- This renames the existing late_adj_minutes column to late_minutes,
-- preserving whatever values are already on file — those keep meaning
-- "the late minutes recorded for that period," now just under a name that
-- doesn't imply an adjustment. Nothing is deleted; re-import a period from
-- the tracker's Raw columns if you want its historical figure corrected.
--
-- Safe to run any time, and safe to re-run.
--
-- Run once in the SQL Editor (Database > SQL Editor).
-- =============================================================================

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_name = 'attendance_period_records' and column_name = 'late_adj_minutes'
  ) then
    alter table attendance_period_records rename column late_adj_minutes to late_minutes;
  end if;
end $$;


-- ---------------------------------------------------------------------------
-- migrate_phase11_optional_employee_fields.sql
-- ---------------------------------------------------------------------------

-- =============================================================================
-- Shantahl HRIS — allow importing employees with incomplete personal/
-- employment details, to be filled in later through the app
--
-- Two changes:
--   1. Personal/contact fields (birthdate, civil status, nationality,
--      address, contact number, email, emergency contact, date hired)
--      become nullable — display-only fields, safe to leave blank until HR
--      fills them in.
--   2. Employment status and payroll type get a new 'unassigned' enum value,
--      and a real "Unassigned" branch + department + position are added —
--      used only for historical/resigned employees imported without this on
--      file. (branch_id/department_id/position_id stay NOT NULL since
--      scoping/reports throughout the app assume every employee has a real
--      one — they just point at "Unassigned" instead.)
--
-- Safe to run any time, and safe to re-run.
--
-- Run once in the SQL Editor (Database > SQL Editor).
-- =============================================================================

alter table employees alter column birthdate drop not null;
alter table employees alter column civil_status drop not null;
alter table employees alter column nationality drop not null;
alter table employees alter column address drop not null;
alter table employees alter column contact_number drop not null;
alter table employees alter column email drop not null;
alter table employees alter column emergency_contact_name drop not null;
alter table employees alter column emergency_contact_phone drop not null;
alter table employees alter column date_hired drop not null;

alter type employment_status add value if not exists 'unassigned';
alter type payroll_type add value if not exists 'unassigned';

insert into branches (id, name, code, address) values ('br-unassigned', 'Unassigned', 'UNASSIGNED', 'Unassigned')
  on conflict (id) do nothing;
insert into departments (id, name, division) values ('dp-unassigned', 'Unassigned', 'shared_services')
  on conflict (id) do nothing;
insert into positions (id, title, department_id) values ('ps-unassigned', 'Unassigned', 'dp-unassigned')
  on conflict (id) do nothing;


-- ---------------------------------------------------------------------------
-- migrate_phase12_leave_attachments.sql
-- ---------------------------------------------------------------------------

-- =============================================================================
-- Shantahl HRIS — leave request attachments (signed leave form, medical
-- certificate) + supervisor approvals
--
-- Three changes:
--   1. A private Storage bucket "leave-attachments" and a
--      leave_request_attachments table recording each uploaded file. Files
--      live at "<employee id>/<leave request id>/<kind>-<timestamp>.<ext>".
--      They are deleted 30 days after upload by the daily cleanup job
--      (app/api/cron/purge-leave-attachments), which keeps the table row and
--      sets deleted_at so the app can show "deleted after 30 days".
--   2. Who can see the files: the employee who filed the request, HR/system
--      admins, upper management, and the employee's supervisor if that
--      supervisor has the Dept Head role.
--   3. That supervisor (dept head) can now also see and approve/reject the
--      leave requests of the employees they supervise.
--
-- Safe to run any time, and safe to re-run.
--
-- Run once in the SQL Editor (Database > SQL Editor).
-- =============================================================================

-- Is the signed-in user a Dept Head who is this employee's supervisor?
create or replace function app_is_supervising_dept_head(emp_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select app_is_dept_head()
     and exists (select 1 from employees e where e.id = emp_id and e.supervisor_id = app_current_employee_id());
$$;

-- HR/system admins and upper management — the roles that review all leave.
create or replace function app_can_review_all_leave()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select app_has_any_role(array['hr_admin', 'sys_admin', 'upper_management']::app_role[]);
$$;

-- --- Leave requests: supervising dept heads can see and decide ---------------

drop policy if exists "leave requests read" on leave_requests;
create policy "leave requests read" on leave_requests for select
  using (employee_id = app_current_employee_id() or app_is_elevated() or app_is_supervising_dept_head(employee_id));

drop policy if exists "leave requests update elevated or own pending" on leave_requests;
create policy "leave requests update elevated or own pending" on leave_requests for update
  using (
    app_is_elevated()
    or app_is_supervising_dept_head(employee_id)
    or (employee_id = app_current_employee_id() and status = 'pending')
  )
  with check (
    app_is_elevated()
    or app_is_supervising_dept_head(employee_id)
    or (employee_id = app_current_employee_id() and status = 'pending')
  );

-- --- Attachment records --------------------------------------------------------

create table if not exists leave_request_attachments (
  id text primary key default gen_random_uuid()::text,
  leave_request_id text not null references leave_requests (id) on delete cascade,
  employee_id text not null references employees (id),
  kind text not null check (kind in ('leave_form', 'medical_certificate')),
  storage_path text not null unique,
  file_name text not null,
  content_type text not null,
  size_bytes integer not null,
  uploaded_by text references employees (id),
  uploaded_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists leave_request_attachments_request_idx on leave_request_attachments (leave_request_id);
create index if not exists leave_request_attachments_purge_idx on leave_request_attachments (uploaded_at) where deleted_at is null;

alter table leave_request_attachments enable row level security;

drop policy if exists "leave attachments read" on leave_request_attachments;
create policy "leave attachments read" on leave_request_attachments for select
  using (employee_id = app_current_employee_id() or app_can_review_all_leave() or app_is_supervising_dept_head(employee_id));

-- Employees attach files to their own requests; HR can attach on their behalf.
drop policy if exists "leave attachments insert" on leave_request_attachments;
create policy "leave attachments insert" on leave_request_attachments for insert
  with check (
    exists (select 1 from leave_requests r where r.id = leave_request_id and r.employee_id = leave_request_attachments.employee_id)
    and (employee_id = app_current_employee_id() or app_is_hr_or_admin())
  );
-- No update/delete policies: only the cleanup job (service role) marks rows deleted.

-- --- Storage bucket and file access --------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'leave-attachments', 'leave-attachments', false, 10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- The first folder of every path is the employee id the file belongs to.
drop policy if exists "leave attachments upload" on storage.objects;
create policy "leave attachments upload" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'leave-attachments'
    and ((storage.foldername(name))[1] = app_current_employee_id() or app_is_hr_or_admin())
  );

drop policy if exists "leave attachments download" on storage.objects;
create policy "leave attachments download" on storage.objects for select to authenticated
  using (
    bucket_id = 'leave-attachments'
    and (
      (storage.foldername(name))[1] = app_current_employee_id()
      or app_can_review_all_leave()
      or app_is_supervising_dept_head((storage.foldername(name))[1])
    )
  );


-- ---------------------------------------------------------------------------
-- migrate_phase13_announcement_photos.sql
-- ---------------------------------------------------------------------------

-- =============================================================================
-- Shantahl HRIS — photos on Bulletin Board announcements
--
--   1. announcements.images: the photos attached to a post, as a JSON list
--      of { "path": "<storage path>", "name": "<original file name>" }.
--   2. A private Storage bucket "announcement-images". Every signed-in
--      employee can view the photos; the people who can post announcements
--      can upload and remove them. Photos stay as long as the post does.
--   3. Upper Management can post announcements too — the app has always
--      offered them the "Post announcement" button, but the database only
--      let HR/system admins save.
--
-- Safe to run any time, and safe to re-run.
--
-- Run once in the SQL Editor (Database > SQL Editor).
-- =============================================================================

alter table announcements add column if not exists images jsonb not null default '[]'::jsonb;

create or replace function app_can_post_announcements()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select app_has_any_role(array['hr_admin', 'sys_admin', 'upper_management']::app_role[]);
$$;

drop policy if exists "reference write" on announcements;
create policy "reference write" on announcements for all
  using (app_can_post_announcements()) with check (app_can_post_announcements());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'announcement-images', 'announcement-images', false, 10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'image/gif']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "announcement images read" on storage.objects;
create policy "announcement images read" on storage.objects for select to authenticated
  using (bucket_id = 'announcement-images');

drop policy if exists "announcement images upload" on storage.objects;
create policy "announcement images upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'announcement-images' and app_can_post_announcements());

drop policy if exists "announcement images delete" on storage.objects;
create policy "announcement images delete" on storage.objects for delete to authenticated
  using (bucket_id = 'announcement-images' and app_can_post_announcements());


-- ---------------------------------------------------------------------------
-- migrate_phase14_announcement_comments_reactions.sql
-- ---------------------------------------------------------------------------

-- =============================================================================
-- Shantahl HRIS — comments and reactions on Bulletin Board announcements
--
--   * announcement_comments: any signed-in employee can comment. The
--     author's display name is filled in from their employee record by a
--     trigger (regular employees can't read other employees' records, and
--     nobody can post under someone else's name). Authors can delete their
--     own comments; HR / Upper Management can delete any (moderation).
--   * announcement_reactions: one reaction per employee per post — like,
--     heart or celebrate. Changing it replaces the old one; employees can
--     only add/change/remove their own.
--
-- Safe to run any time, and safe to re-run.
--
-- Run once in the SQL Editor (Database > SQL Editor).
-- =============================================================================

create table if not exists announcement_comments (
  id text primary key default gen_random_uuid()::text,
  announcement_id text not null references announcements (id) on delete cascade,
  employee_id text not null references employees (id) on delete cascade,
  author_name text not null default '',
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists announcement_comments_announcement_idx on announcement_comments (announcement_id, created_at);

create table if not exists announcement_reactions (
  announcement_id text not null references announcements (id) on delete cascade,
  employee_id text not null references employees (id) on delete cascade,
  reaction text not null check (reaction in ('like', 'heart', 'celebrate')),
  created_at timestamptz not null default now(),
  primary key (announcement_id, employee_id)
);

-- Fill in the commenter's name from their employee record ("Last, First").
create or replace function app_set_comment_author_name()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select trim(both ' ' from coalesce(e.first_name, '') || ' ' || coalesce(e.last_name, ''))
    into new.author_name
    from employees e where e.id = new.employee_id;
  return new;
end;
$$;

drop trigger if exists announcement_comments_author_name on announcement_comments;
create trigger announcement_comments_author_name
  before insert on announcement_comments
  for each row execute function app_set_comment_author_name();

alter table announcement_comments enable row level security;
alter table announcement_reactions enable row level security;

drop policy if exists "comments read" on announcement_comments;
create policy "comments read" on announcement_comments for select to authenticated using (true);
drop policy if exists "comments insert own" on announcement_comments;
create policy "comments insert own" on announcement_comments for insert to authenticated
  with check (employee_id = app_current_employee_id());
drop policy if exists "comments delete own or moderator" on announcement_comments;
create policy "comments delete own or moderator" on announcement_comments for delete to authenticated
  using (employee_id = app_current_employee_id() or app_can_post_announcements());

drop policy if exists "reactions read" on announcement_reactions;
create policy "reactions read" on announcement_reactions for select to authenticated using (true);
drop policy if exists "reactions insert own" on announcement_reactions;
create policy "reactions insert own" on announcement_reactions for insert to authenticated
  with check (employee_id = app_current_employee_id());
drop policy if exists "reactions update own" on announcement_reactions;
create policy "reactions update own" on announcement_reactions for update to authenticated
  using (employee_id = app_current_employee_id()) with check (employee_id = app_current_employee_id());
drop policy if exists "reactions delete own" on announcement_reactions;
create policy "reactions delete own" on announcement_reactions for delete to authenticated
  using (employee_id = app_current_employee_id());


-- ---------------------------------------------------------------------------
-- migrate_phase15_employee_id_cards.sql
-- ---------------------------------------------------------------------------

-- =============================================================================
-- Shantahl HRIS — employee ID cards
--
-- The ID card itself is drawn by the app from the employee record (nothing
-- stored per card). This adds only what the record doesn't have yet:
--
--   1. employees.id_photo_path / id_signature_path — the employee's photo and
--      signature, stored in a private "employee-id-media" bucket at
--      "<employee id>/photo-<timestamp>.jpg" / "<employee id>/signature-….png".
--      Both are compressed in the browser first (~50 KB photo, ~15 KB
--      signature); a replacement deletes the previous file.
--   2. Employees can set their OWN photo, signature and emergency contact
--      (name + number) through two narrow functions — they still can't edit
--      anything else on their record. HR can do the same for anyone.
--   3. Only the employee and HR/system admins can see an employee's photo and
--      signature files.
--
-- Safe to run any time, and safe to re-run.
--
-- Run once in the SQL Editor (Database > SQL Editor).
-- =============================================================================

alter table employees add column if not exists id_photo_path text;
alter table employees add column if not exists id_signature_path text;

-- Set (or clear, with null) an employee's ID photo or signature.
create or replace function set_employee_id_media(emp_id text, kind text, path text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if emp_id is distinct from app_current_employee_id() and not app_is_hr_or_admin() then
    raise exception 'You can only change your own ID photo and signature.';
  end if;
  if path is not null and split_part(path, '/', 1) <> emp_id then
    raise exception 'File does not belong to this employee.';
  end if;
  if kind = 'photo' then
    update employees set id_photo_path = path where id = emp_id;
  elsif kind = 'signature' then
    update employees set id_signature_path = path where id = emp_id;
  else
    raise exception 'Unknown kind: %', kind;
  end if;
end;
$$;

-- Update an employee's emergency contact (name + number).
create or replace function set_employee_emergency_contact(emp_id text, contact_name text, contact_phone text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if emp_id is distinct from app_current_employee_id() and not app_is_hr_or_admin() then
    raise exception 'You can only change your own emergency contact.';
  end if;
  update employees
     set emergency_contact_name = nullif(btrim(contact_name), ''),
         emergency_contact_phone = nullif(btrim(contact_phone), '')
   where id = emp_id;
end;
$$;

revoke all on function set_employee_id_media(text, text, text) from public, anon;
revoke all on function set_employee_emergency_contact(text, text, text) from public, anon;
grant execute on function set_employee_id_media(text, text, text) to authenticated;
grant execute on function set_employee_emergency_contact(text, text, text) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('employee-id-media', 'employee-id-media', false, 1048576, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "id media read" on storage.objects;
create policy "id media read" on storage.objects for select to authenticated
  using (bucket_id = 'employee-id-media' and ((storage.foldername(name))[1] = app_current_employee_id() or app_is_hr_or_admin()));

drop policy if exists "id media upload" on storage.objects;
create policy "id media upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'employee-id-media' and ((storage.foldername(name))[1] = app_current_employee_id() or app_is_hr_or_admin()));

drop policy if exists "id media delete" on storage.objects;
create policy "id media delete" on storage.objects for delete to authenticated
  using (bucket_id = 'employee-id-media' and ((storage.foldername(name))[1] = app_current_employee_id() or app_is_hr_or_admin()));


-- ---------------------------------------------------------------------------
-- migrate_phase16_hr_messages.sql
-- ---------------------------------------------------------------------------

-- =============================================================================
-- Shantahl HRIS — private chat between each employee and HR
--
--   * hr_messages: one conversation per employee (employee_id). The
--     employee and HR (hr_admin role) can read and write in it; nobody else
--     can, including other employees, department heads and system admins.
--   * Who sent a message, their name, "from HR or not", the time, and the
--     read status are all set by the database, so nobody can post under
--     someone else's name or fake a timestamp.
--   * Messages can't be edited or deleted from the app. Read status is set
--     only through mark_hr_thread_read().
--   * Text up to 2,000 characters, plus an optional photo. Photos are
--     shrunk in the browser (~200–400 KB) and kept in the private
--     "hr-chat-images" bucket for 30 days: the daily cleanup job
--     (app/api/cron/purge-leave-attachments) deletes older ones and marks
--     their messages image_removed_at, so the chat shows "Photo removed".
--
-- Safe to run any time, and safe to re-run.
--
-- Run once in the SQL Editor (Database > SQL Editor).
-- =============================================================================

create table if not exists hr_messages (
  id text primary key default gen_random_uuid()::text,
  employee_id text not null references employees (id) on delete cascade,
  sender_employee_id text references employees (id) on delete set null,
  sender_name text not null default '',
  from_hr boolean not null default false,
  body text not null default '',
  image_path text,
  image_removed_at timestamptz,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
-- For databases where an earlier version of this file already ran.
alter table hr_messages add column if not exists image_path text;
alter table hr_messages add column if not exists image_removed_at timestamptz;
alter table hr_messages alter column body set default '';
-- A message needs text or a photo (or a photo that has since expired).
alter table hr_messages drop constraint if exists hr_messages_body_check;
alter table hr_messages add constraint hr_messages_body_check
  check (char_length(body) <= 2000 and (char_length(btrim(body)) >= 1 or image_path is not null or image_removed_at is not null));
create index if not exists hr_messages_thread_idx on hr_messages (employee_id, created_at);
create index if not exists hr_messages_unread_idx on hr_messages (employee_id) where read_at is null;

create or replace function app_is_hr_manager()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select app_has_any_role(array['hr_admin']::app_role[]);
$$;

create or replace function app_fill_hr_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.sender_employee_id := app_current_employee_id();
  new.from_hr := app_is_hr_manager() and new.employee_id is distinct from new.sender_employee_id;
  select trim(both ' ' from coalesce(e.first_name, '') || ' ' || coalesce(e.last_name, ''))
    into new.sender_name
    from employees e where e.id = new.sender_employee_id;
  new.sender_name := coalesce(new.sender_name, '');
  if new.image_path is not null and split_part(new.image_path, '/', 1) is distinct from new.employee_id then
    raise exception 'Photo does not belong to this conversation.';
  end if;
  new.image_removed_at := null;
  new.created_at := now();
  new.read_at := null;
  return new;
end;
$$;

drop trigger if exists hr_messages_fill on hr_messages;
create trigger hr_messages_fill
  before insert on hr_messages
  for each row execute function app_fill_hr_message();

alter table hr_messages enable row level security;

drop policy if exists "hr messages read" on hr_messages;
create policy "hr messages read" on hr_messages for select to authenticated
  using (employee_id = app_current_employee_id() or app_is_hr_manager());
drop policy if exists "hr messages send" on hr_messages;
create policy "hr messages send" on hr_messages for insert to authenticated
  with check (employee_id = app_current_employee_id() or app_is_hr_manager());

-- Marks the other side's messages in a conversation as read.
create or replace function mark_hr_thread_read(thread_employee_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me text := app_current_employee_id();
begin
  if thread_employee_id = me then
    update hr_messages set read_at = now()
     where employee_id = thread_employee_id and from_hr and read_at is null;
  elsif app_is_hr_manager() then
    update hr_messages set read_at = now()
     where employee_id = thread_employee_id and not from_hr and read_at is null;
  else
    raise exception 'Not allowed.';
  end if;
end;
$$;

revoke all on function mark_hr_thread_read(text) from public, anon;
grant execute on function mark_hr_thread_read(text) to authenticated;
revoke all on function app_is_hr_manager() from public, anon;
grant execute on function app_is_hr_manager() to authenticated;

-- Chat photos: private bucket, one folder per conversation (employee id).
-- The employee and HR can view and upload in that conversation's folder.
-- Nobody deletes from the app; the cleanup job removes them after 30 days.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('hr-chat-images', 'hr-chat-images', false, 3145728, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "hr chat images read" on storage.objects;
create policy "hr chat images read" on storage.objects for select to authenticated
  using (bucket_id = 'hr-chat-images' and ((storage.foldername(name))[1] = app_current_employee_id() or app_is_hr_manager()));

drop policy if exists "hr chat images upload" on storage.objects;
create policy "hr chat images upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'hr-chat-images' and ((storage.foldername(name))[1] = app_current_employee_id() or app_is_hr_manager()));

-- For the cleanup job only: chat photo files older than the cut-off,
-- including any uploaded without a message (e.g. a send that failed).
create or replace function hr_chat_expired_images(older_than timestamptz)
returns setof text
language sql
stable
security definer
set search_path = public, storage
as $$
  select name from storage.objects
   where bucket_id = 'hr-chat-images' and created_at < older_than
   order by created_at
   limit 1000;
$$;

revoke all on function hr_chat_expired_images(timestamptz) from public, anon, authenticated;
grant execute on function hr_chat_expired_images(timestamptz) to service_role;


-- ---------------------------------------------------------------------------
-- migrate_phase17_company_documents.sql
-- ---------------------------------------------------------------------------

-- =============================================================================
-- Shantahl HRIS — company documents (the Employee Handbook)
--
--   * A private Storage bucket "company-documents" holding PDFs every
--     signed-in employee may read — currently employee-handbook.pdf.
--   * Only HR (hr_admin) can upload or replace files; nobody else can
--     change or delete them. Not public: links are short-lived and only
--     handed to signed-in employees.
--
-- Safe to run any time, and safe to re-run. Needs phase 16 (app_is_hr_manager).
--
-- Run once in the SQL Editor (Database > SQL Editor).
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('company-documents', 'company-documents', false, 26214400, array['application/pdf'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "company documents read" on storage.objects;
create policy "company documents read" on storage.objects for select to authenticated
  using (bucket_id = 'company-documents');

drop policy if exists "company documents upload" on storage.objects;
create policy "company documents upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'company-documents' and app_is_hr_manager());

-- Replacing a file (upload with upsert) is an update.
drop policy if exists "company documents replace" on storage.objects;
create policy "company documents replace" on storage.objects for update to authenticated
  using (bucket_id = 'company-documents' and app_is_hr_manager())
  with check (bucket_id = 'company-documents' and app_is_hr_manager());


-- ---------------------------------------------------------------------------
-- migrate_phase18_department_vouchers.sql
-- ---------------------------------------------------------------------------

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


-- ---------------------------------------------------------------------------
-- migrate_phase19_salary_adjustments.sql
-- ---------------------------------------------------------------------------

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


-- ---------------------------------------------------------------------------
-- migrate_phase20_discipline_notices.sql
-- ---------------------------------------------------------------------------

-- =============================================================================
-- Shantahl HRIS — discipline notices with employee acknowledgement
--
--   * HR (or the employee's department head) attaches the NTE / sanction PDF
--     to a disciplinary record, optionally asking for a written explanation
--     by a due date.
--   * The employee opens it in "My Notices", signs to acknowledge receipt,
--     and submits a written explanation (typed and/or an attached file).
--     These two steps only go through discipline_acknowledge() and
--     discipline_submit_explanation(), which stamp the time — nobody,
--     HR included, can fill in or change an employee's response directly.
--   * Who sees what: the employee (own records), HR, Upper Management
--     (read-only), and department heads for their own department. Only HR
--     and the department head create or update records.
--   * Files live in the private "discipline-files" bucket, one folder per
--     record: notice-*, ack-* (signature) and explanation-* files.
--
-- Safe to run any time, and safe to re-run.
-- Run once in the SQL Editor (Database > SQL Editor).
-- =============================================================================

alter table disciplinary_records
  add column if not exists notice_path text,
  add column if not exists notice_file_name text,
  add column if not exists requires_explanation boolean not null default false,
  add column if not exists response_due date,
  add column if not exists acknowledged_at timestamptz,
  add column if not exists ack_signature_path text,
  add column if not exists explanation text,
  add column if not exists explanation_file_path text,
  add column if not exists explanation_file_name text,
  add column if not exists explanation_submitted_at timestamptz,
  add column if not exists created_at timestamptz not null default now();

create or replace function app_can_manage_discipline(emp_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select app_has_any_role(array['hr_admin']::app_role[])
      or (app_is_dept_head() and app_employee_in_department(emp_id, app_current_department_id()));
$$;

create or replace function app_can_view_discipline(emp_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select emp_id = app_current_employee_id()
      or app_has_any_role(array['hr_admin', 'upper_management']::app_role[])
      or app_can_manage_discipline(emp_id);
$$;

revoke all on function app_can_manage_discipline(text) from public, anon;
grant execute on function app_can_manage_discipline(text) to authenticated;
revoke all on function app_can_view_discipline(text) from public, anon;
grant execute on function app_can_view_discipline(text) to authenticated;

drop policy if exists "discipline read" on disciplinary_records;
create policy "discipline read" on disciplinary_records for select to authenticated
  using (app_can_view_discipline(employee_id));

drop policy if exists "discipline write elevated" on disciplinary_records;
drop policy if exists "discipline write" on disciplinary_records;
create policy "discipline write" on disciplinary_records for all to authenticated
  using (app_can_manage_discipline(employee_id))
  with check (app_can_manage_discipline(employee_id));

-- The employee's response columns can only be set by the two functions below.
create or replace function app_guard_discipline_response()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(current_setting('app.discipline_response', true), '') = 'on' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.acknowledged_at := null;
    new.ack_signature_path := null;
    new.explanation := null;
    new.explanation_file_path := null;
    new.explanation_file_name := null;
    new.explanation_submitted_at := null;
    return new;
  end if;
  if new.acknowledged_at is distinct from old.acknowledged_at
     or new.ack_signature_path is distinct from old.ack_signature_path
     or new.explanation is distinct from old.explanation
     or new.explanation_file_path is distinct from old.explanation_file_path
     or new.explanation_file_name is distinct from old.explanation_file_name
     or new.explanation_submitted_at is distinct from old.explanation_submitted_at then
    raise exception 'The employee''s acknowledgement and explanation can''t be changed.';
  end if;
  if old.acknowledged_at is not null
     and (new.notice_path is distinct from old.notice_path or new.notice_file_name is distinct from old.notice_file_name) then
    raise exception 'The notice was already acknowledged by the employee, so its file can''t be replaced.';
  end if;
  return new;
end;
$$;

drop trigger if exists disciplinary_records_guard_response on disciplinary_records;
create trigger disciplinary_records_guard_response
  before insert or update on disciplinary_records
  for each row execute function app_guard_discipline_response();

create or replace function discipline_acknowledge(record_id text, signature_path text)
returns disciplinary_records
language plpgsql
security definer
set search_path = public
as $$
declare
  r disciplinary_records;
begin
  select * into r from disciplinary_records where id = record_id for update;
  if r.id is null or r.employee_id is distinct from app_current_employee_id() then
    raise exception 'This notice isn''t addressed to you.';
  end if;
  if r.acknowledged_at is not null then
    raise exception 'You have already acknowledged this notice.';
  end if;
  if signature_path is null or signature_path not like record_id || '/ack-%'
     or not exists (select 1 from storage.objects o where o.bucket_id = 'discipline-files' and o.name = signature_path) then
    raise exception 'Please sign before acknowledging.';
  end if;
  perform set_config('app.discipline_response', 'on', true);
  update disciplinary_records
     set acknowledged_at = now(), ack_signature_path = signature_path
   where id = record_id
  returning * into r;
  perform set_config('app.discipline_response', 'off', true);
  return r;
end;
$$;

create or replace function discipline_submit_explanation(record_id text, body text, file_path text, file_name text)
returns disciplinary_records
language plpgsql
security definer
set search_path = public
as $$
declare
  r disciplinary_records;
  clean_body text := nullif(btrim(coalesce(body, '')), '');
begin
  select * into r from disciplinary_records where id = record_id for update;
  if r.id is null or r.employee_id is distinct from app_current_employee_id() then
    raise exception 'This notice isn''t addressed to you.';
  end if;
  if r.acknowledged_at is null then
    raise exception 'Please acknowledge receipt of the notice first.';
  end if;
  if r.explanation_submitted_at is not null then
    raise exception 'You have already submitted your explanation.';
  end if;
  if clean_body is null and file_path is null then
    raise exception 'Please write your explanation or attach a file.';
  end if;
  if char_length(coalesce(clean_body, '')) > 20000 then
    raise exception 'The explanation is too long (20,000 characters at most).';
  end if;
  if file_path is not null and (
       file_path not like record_id || '/explanation-%'
       or not exists (select 1 from storage.objects o where o.bucket_id = 'discipline-files' and o.name = file_path)
     ) then
    raise exception 'The attached file could not be found — please attach it again.';
  end if;
  perform set_config('app.discipline_response', 'on', true);
  update disciplinary_records
     set explanation = clean_body,
         explanation_file_path = file_path,
         explanation_file_name = case when file_path is null then null else left(coalesce(nullif(btrim(file_name), ''), 'explanation'), 200) end,
         explanation_submitted_at = now()
   where id = record_id
  returning * into r;
  perform set_config('app.discipline_response', 'off', true);
  return r;
end;
$$;

revoke all on function discipline_acknowledge(text, text) from public, anon;
grant execute on function discipline_acknowledge(text, text) to authenticated;
revoke all on function discipline_submit_explanation(text, text, text, text) from public, anon;
grant execute on function discipline_submit_explanation(text, text, text, text) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('discipline-files', 'discipline-files', false, 10485760, array['application/pdf', 'image/jpeg', 'image/png'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "discipline files read" on storage.objects;
create policy "discipline files read" on storage.objects for select to authenticated
  using (
    bucket_id = 'discipline-files'
    and exists (select 1 from disciplinary_records d where d.id = (storage.foldername(name))[1])
  );

drop policy if exists "discipline files upload" on storage.objects;
create policy "discipline files upload" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'discipline-files'
    and exists (
      select 1 from disciplinary_records d
      where d.id = (storage.foldername(name))[1]
        and (
          (storage.filename(name) like 'notice-%' and d.acknowledged_at is null and app_can_manage_discipline(d.employee_id))
          or (storage.filename(name) like 'ack-%' and d.employee_id = app_current_employee_id() and d.acknowledged_at is null)
          or (storage.filename(name) like 'explanation-%' and d.employee_id = app_current_employee_id() and d.explanation_submitted_at is null)
        )
    )
  );

drop policy if exists "discipline files delete" on storage.objects;
create policy "discipline files delete" on storage.objects for delete to authenticated
  using (
    bucket_id = 'discipline-files'
    and storage.filename(name) like 'notice-%'
    and exists (select 1 from disciplinary_records d where d.id = (storage.foldername(name))[1] and d.acknowledged_at is null and app_can_manage_discipline(d.employee_id))
  );


-- ---------------------------------------------------------------------------
-- migrate_phase21_hr_message_reactions.sql
-- ---------------------------------------------------------------------------

-- =============================================================================
-- Shantahl HRIS — reactions on Chat with HR messages
--
--   * hr_message_reactions: one reaction per person per message — smile,
--     laugh, sad, heart, like or celebrate. Reacting again with another
--     emoji replaces it; removing deletes the row.
--   * Anyone who can see the message (the employee in that conversation
--     and HR) can see its reactions and add/remove their own. The reactor
--     and their name are filled in by the database.
--
-- Safe to run any time, and safe to re-run.
-- Run once in the SQL Editor (Database > SQL Editor).
-- =============================================================================

create table if not exists hr_message_reactions (
  message_id text not null references hr_messages (id) on delete cascade,
  reactor_employee_id text not null references employees (id) on delete cascade,
  reactor_name text not null default '',
  reaction text not null check (reaction in ('smile', 'laugh', 'sad', 'heart', 'like', 'celebrate')),
  created_at timestamptz not null default now(),
  primary key (message_id, reactor_employee_id)
);

create or replace function app_fill_hr_message_reaction()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.reactor_employee_id := app_current_employee_id();
  if new.reactor_employee_id is null then
    raise exception 'Not signed in as an employee.';
  end if;
  select trim(both ' ' from coalesce(e.first_name, '') || ' ' || coalesce(e.last_name, ''))
    into new.reactor_name
    from employees e where e.id = new.reactor_employee_id;
  new.reactor_name := coalesce(new.reactor_name, '');
  new.created_at := now();
  return new;
end;
$$;

drop trigger if exists hr_message_reactions_fill on hr_message_reactions;
create trigger hr_message_reactions_fill
  before insert or update on hr_message_reactions
  for each row execute function app_fill_hr_message_reaction();

alter table hr_message_reactions enable row level security;

drop policy if exists "hr reactions read" on hr_message_reactions;
create policy "hr reactions read" on hr_message_reactions for select to authenticated
  using (exists (select 1 from hr_messages m where m.id = message_id));

drop policy if exists "hr reactions add" on hr_message_reactions;
create policy "hr reactions add" on hr_message_reactions for insert to authenticated
  with check (exists (select 1 from hr_messages m where m.id = message_id));

drop policy if exists "hr reactions change own" on hr_message_reactions;
create policy "hr reactions change own" on hr_message_reactions for update to authenticated
  using (reactor_employee_id = app_current_employee_id())
  with check (exists (select 1 from hr_messages m where m.id = message_id));

drop policy if exists "hr reactions remove own" on hr_message_reactions;
create policy "hr reactions remove own" on hr_message_reactions for delete to authenticated
  using (reactor_employee_id = app_current_employee_id());


-- ---------------------------------------------------------------------------
-- migrate_phase22_employee_nickname.sql
-- ---------------------------------------------------------------------------

-- =============================================================================
-- Shantahl HRIS — employees set their own nickname
--
--   * set_employee_nickname(emp_id, nick): the employee themself (or HR)
--     changes the nickname shown on their profile. Only that one field is
--     touched; blank clears it. Up to 40 characters.
--
-- Safe to run any time, and safe to re-run.
-- Run once in the SQL Editor (Database > SQL Editor).
-- =============================================================================

create or replace function set_employee_nickname(emp_id text, nick text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if emp_id is distinct from app_current_employee_id() and not app_is_hr_or_admin() then
    raise exception 'You can only change your own nickname.';
  end if;
  if char_length(btrim(coalesce(nick, ''))) > 40 then
    raise exception 'Nickname is too long (40 characters at most).';
  end if;
  update employees set nickname = btrim(coalesce(nick, '')) where id = emp_id;
end;
$$;

revoke all on function set_employee_nickname(text, text) from public, anon;
grant execute on function set_employee_nickname(text, text) to authenticated;


-- ---------------------------------------------------------------------------
-- migrate_phase23_prepared_by_signature.sql
-- ---------------------------------------------------------------------------

-- =============================================================================
-- Shantahl HRIS — "Prepared by" signature on printed vouchers
--
--   * Lets the company-documents bucket also hold PNG images, for the HR
--     Manager's signature (signatures/prepared-by.png) that prints above
--     "Prepared by" on vouchers. Every signed-in user can view it (vouchers
--     are printed by payroll/accounting too); only HR can upload, replace
--     or remove it.
--
-- Safe to run any time, and safe to re-run.
-- Run once in the SQL Editor (Database > SQL Editor).
-- =============================================================================

update storage.buckets
   set allowed_mime_types = array['application/pdf', 'image/png']
 where id = 'company-documents';

drop policy if exists "company documents remove" on storage.objects;
create policy "company documents remove" on storage.objects for delete to authenticated
  using (bucket_id = 'company-documents' and app_is_hr_manager());


-- ---------------------------------------------------------------------------
-- migrate_phase24_voucher_signoffs.sql
-- ---------------------------------------------------------------------------

-- =============================================================================
-- Shantahl HRIS — voucher sign-offs (Checked by / Released by)
--
--   * voucher_signoffs: the Sr. Accounting Assistant marks a voucher
--     "checked" and the Corporate Treasurer marks it "released", per payroll
--     period and voucher (a department voucher, or the salary adjustment
--     voucher). The database records who and when, and the voucher total at
--     that moment — the app only prints the signature while the voucher
--     still has that total.
--   * Releasing requires the voucher to be checked first. A sign-off can be
--     withdrawn by the person who made it, or by HR.
--   * Signatures: the Sr. Accounting Assistant can upload
--     signatures/checked-by.png and the Treasurer signatures/released-by.png
--     (HR can manage all of them, as with signatures/prepared-by.png).
--
-- Safe to run any time, and safe to re-run.
-- Run once in the SQL Editor (Database > SQL Editor).
-- =============================================================================

create table if not exists voucher_signoffs (
  period_id text not null references payroll_periods (id) on delete cascade,
  voucher_key text not null check (voucher_key ~ '^(dept:.+|salary_adjustments)$'),
  step text not null check (step in ('checked', 'released')),
  signed_by text not null references employees (id),
  signed_by_name text not null default '',
  signed_total numeric(14, 2) not null,
  signed_at timestamptz not null default now(),
  primary key (period_id, voucher_key, step)
);

create or replace function app_can_sign_voucher(step text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case step
    when 'checked' then app_has_any_role(array['sr_accounting_assistant']::app_role[])
    when 'released' then app_has_any_role(array['treasurer']::app_role[])
    else false
  end;
$$;

revoke all on function app_can_sign_voucher(text) from public, anon;
grant execute on function app_can_sign_voucher(text) to authenticated;

create or replace function app_fill_voucher_signoff()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.signed_by := app_current_employee_id();
  if new.signed_by is null then
    raise exception 'Not signed in as an employee.';
  end if;
  select trim(both ' ' from coalesce(e.first_name, '') || ' ' || coalesce(e.last_name, ''))
    into new.signed_by_name
    from employees e where e.id = new.signed_by;
  new.signed_by_name := coalesce(new.signed_by_name, '');
  new.signed_at := now();
  return new;
end;
$$;

drop trigger if exists voucher_signoffs_fill on voucher_signoffs;
create trigger voucher_signoffs_fill
  before insert or update on voucher_signoffs
  for each row execute function app_fill_voucher_signoff();

alter table voucher_signoffs enable row level security;

drop policy if exists "voucher signoffs read" on voucher_signoffs;
create policy "voucher signoffs read" on voucher_signoffs for select to authenticated
  using (app_is_elevated());

drop policy if exists "voucher signoffs sign" on voucher_signoffs;
create policy "voucher signoffs sign" on voucher_signoffs for insert to authenticated
  with check (
    app_can_sign_voucher(step)
    and (
      step = 'checked'
      or exists (
        select 1 from voucher_signoffs c
        where c.period_id = voucher_signoffs.period_id
          and c.voucher_key = voucher_signoffs.voucher_key
          and c.step = 'checked'
          and c.signed_total = voucher_signoffs.signed_total
      )
    )
  );

-- Re-signing after the voucher changed replaces the old sign-off.
drop policy if exists "voucher signoffs re-sign" on voucher_signoffs;
create policy "voucher signoffs re-sign" on voucher_signoffs for update to authenticated
  using (app_can_sign_voucher(step))
  with check (
    app_can_sign_voucher(step)
    and (
      step = 'checked'
      or exists (
        select 1 from voucher_signoffs c
        where c.period_id = voucher_signoffs.period_id
          and c.voucher_key = voucher_signoffs.voucher_key
          and c.step = 'checked'
          and c.signed_total = voucher_signoffs.signed_total
      )
    )
  );

drop policy if exists "voucher signoffs withdraw" on voucher_signoffs;
create policy "voucher signoffs withdraw" on voucher_signoffs for delete to authenticated
  using (signed_by = app_current_employee_id() or app_is_hr_manager());

-- Signatures for Checked by / Released by, uploaded by the signers themselves.
drop policy if exists "signer signatures upload" on storage.objects;
create policy "signer signatures upload" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'company-documents'
    and ((name = 'signatures/checked-by.png' and app_can_sign_voucher('checked'))
      or (name = 'signatures/released-by.png' and app_can_sign_voucher('released')))
  );

drop policy if exists "signer signatures replace" on storage.objects;
create policy "signer signatures replace" on storage.objects for update to authenticated
  using (
    bucket_id = 'company-documents'
    and ((name = 'signatures/checked-by.png' and app_can_sign_voucher('checked'))
      or (name = 'signatures/released-by.png' and app_can_sign_voucher('released')))
  )
  with check (
    bucket_id = 'company-documents'
    and ((name = 'signatures/checked-by.png' and app_can_sign_voucher('checked'))
      or (name = 'signatures/released-by.png' and app_can_sign_voucher('released')))
  );

drop policy if exists "signer signatures remove" on storage.objects;
create policy "signer signatures remove" on storage.objects for delete to authenticated
  using (
    bucket_id = 'company-documents'
    and ((name = 'signatures/checked-by.png' and app_can_sign_voucher('checked'))
      or (name = 'signatures/released-by.png' and app_can_sign_voucher('released')))
  );


-- ---------------------------------------------------------------------------
-- migrate_phase25_thirteenth_month.sql
-- ---------------------------------------------------------------------------

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


-- ---------------------------------------------------------------------------
-- migrate_phase26_thirteenth_month_slips.sql
-- ---------------------------------------------------------------------------

-- =============================================================================
-- Shantahl HRIS — 13th month pay slips released to employees
--
--   * thirteenth_month_slips: the copy of an employee's 13th month slip that
--     HR released to them (shown under My Payslips), kept as released.
--   * Employees read their own slip and their own Checked by / Released by
--     sign-offs (so the signatures print on their copy); HR and the payroll
--     officer release; the payroll roles and management can view.
--
-- Needs migrate_phase25_thirteenth_month.sql.
-- Safe to run any time, and safe to re-run.
-- Run once in the SQL Editor (Database > SQL Editor).
-- =============================================================================

create table if not exists thirteenth_month_slips (
  year int not null check (year between 2000 and 2100),
  employee_id text not null references employees (id) on delete cascade,
  slip jsonb not null,
  total numeric(14, 2) not null,
  released_by text not null default '',
  released_at timestamptz not null default now(),
  primary key (year, employee_id)
);

alter table thirteenth_month_slips enable row level security;

drop policy if exists "thirteenth month slips read" on thirteenth_month_slips;
create policy "thirteenth month slips read" on thirteenth_month_slips for select to authenticated
  using (employee_id = app_current_employee_id() or app_is_elevated());

drop policy if exists "thirteenth month slips release" on thirteenth_month_slips;
create policy "thirteenth month slips release" on thirteenth_month_slips for all to authenticated
  using (app_has_any_role(array['hr_admin', 'payroll_officer']::app_role[]))
  with check (app_has_any_role(array['hr_admin', 'payroll_officer']::app_role[]));

drop policy if exists "thirteenth month signoffs own" on thirteenth_month_signoffs;
create policy "thirteenth month signoffs own" on thirteenth_month_signoffs for select to authenticated
  using (employee_id = app_current_employee_id());


-- ---------------------------------------------------------------------------
-- migrate_phase27_leave_forms.sql
-- ---------------------------------------------------------------------------

-- =============================================================================
-- Shantahl HRIS — online Application for Leave form
--
--   * leave_forms: the company's "APPLICATION FOR LEAVE" form, one per leave
--     request. The employee fills in the details and signs; the database
--     fills in their name, designation, branch, department and department
--     head (their supervisor) from the 201 file. The certificate of leave
--     credits is stored as computed when the form was submitted.
--   * The department head (the employee's supervisor — or HR when the
--     employee has none) fills in the approval part and signs
--     (leave_form_decide), which also approves / rejects the leave request.
--     Then the HR Manager signs it as received (leave_form_receive).
--   * Signatures: each person keeps their own signature in the private
--     leave-forms bucket (signatures/<employee id>.png); signing a form puts
--     a copy in the form's folder (forms/<leave request id>/applicant.png,
--     head.png, hr.png), so a later change of signature never alters a
--     signed form.
--   * Supervisors (whatever their role) can see their team's leave requests,
--     forms and medical certificates.
--
-- Safe to run any time, and safe to re-run.
-- Run once in the SQL Editor (Database > SQL Editor).
-- =============================================================================

create or replace function app_is_supervisor_of(emp_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from employees e where e.id = emp_id and e.supervisor_id = app_current_employee_id());
$$;

revoke all on function app_is_supervisor_of(text) from public, anon;
grant execute on function app_is_supervisor_of(text) to authenticated;

drop policy if exists "leave requests read supervisor" on leave_requests;
create policy "leave requests read supervisor" on leave_requests for select to authenticated
  using (app_is_supervisor_of(employee_id));

drop policy if exists "leave attachments read supervisor" on leave_request_attachments;
create policy "leave attachments read supervisor" on leave_request_attachments for select to authenticated
  using (app_is_supervisor_of(employee_id));

drop policy if exists "leave attachments download supervisor" on storage.objects;
create policy "leave attachments download supervisor" on storage.objects for select to authenticated
  using (bucket_id = 'leave-attachments' and app_is_supervisor_of((storage.foldername(name))[1]));

create table if not exists leave_forms (
  leave_request_id text primary key references leave_requests (id) on delete cascade,
  employee_id text not null references employees (id) on delete cascade,
  application_date date not null,
  category text not null check (category in (
    'vacation_with_pay', 'vacation_without_pay', 'sick_with_pay', 'sick_without_pay',
    'maternity', 'absent_without_pay', 'bereavement_with_pay', 'bereavement_without_pay'
  )),
  sick_place text check (sick_place in ('hospital', 'out_patient')),
  sick_details text not null default '' check (char_length(sick_details) <= 300),
  reason text not null default '' check (char_length(reason) <= 1000),
  credits jsonb not null default '{}'::jsonb,
  employee_name text not null default '',
  designation text not null default '',
  branch text not null default '',
  department text not null default '',
  department_head_id text references employees (id) on delete set null,
  department_head text not null default '',
  submitted_at timestamptz not null default now(),
  head_days jsonb,
  head_decision text check (head_decision in ('approved', 'disapproved')),
  head_reason text,
  head_signed_by text references employees (id) on delete set null,
  head_signed_name text,
  head_signed_at timestamptz,
  received_by text references employees (id) on delete set null,
  received_name text,
  received_at timestamptz
);

create or replace function app_leave_form_file_exists(path text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from storage.objects o where o.bucket_id = 'leave-forms' and o.name = path);
$$;

revoke all on function app_leave_form_file_exists(text) from public, anon;
grant execute on function app_leave_form_file_exists(text) to authenticated;

-- Who may fill in the department head's part: the employee's supervisor, or
-- the HR Manager when the employee has no supervisor. Never one's own.
create or replace function app_leave_form_head_can(req_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from leave_requests r join employees e on e.id = r.employee_id
    where r.id = req_id
      and r.employee_id <> coalesce(app_current_employee_id(), '')
      and (e.supervisor_id = app_current_employee_id() or (e.supervisor_id is null and app_is_hr_manager()))
  );
$$;

revoke all on function app_leave_form_head_can(text) from public, anon;
grant execute on function app_leave_form_head_can(text) to authenticated;

create or replace function app_can_view_leave_form(req_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from leave_requests r
    where r.id = req_id
      and (r.employee_id = app_current_employee_id() or app_is_supervisor_of(r.employee_id) or app_is_elevated())
  );
$$;

revoke all on function app_can_view_leave_form(text) from public, anon;
grant execute on function app_can_view_leave_form(text) to authenticated;

-- The employee's details for the form, from the 201 file.
create or replace function app_fill_leave_form()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  e employees%rowtype;
begin
  select * into e from employees where id = new.employee_id;
  new.employee_name := trim(both ' ' from coalesce(e.first_name, '') || ' ' || coalesce(e.last_name, ''));
  new.designation := coalesce((select title from positions where id = e.position_id), '');
  new.branch := coalesce((select name from branches where id = e.branch_id), '');
  new.department := coalesce((select name from departments where id = e.department_id), '');
  new.department_head_id := e.supervisor_id;
  new.department_head := coalesce((select trim(both ' ' from coalesce(s.first_name, '') || ' ' || coalesce(s.last_name, '')) from employees s where s.id = e.supervisor_id), '');
  new.submitted_at := now();
  new.head_days := null;
  new.head_decision := null;
  new.head_reason := null;
  new.head_signed_by := null;
  new.head_signed_name := null;
  new.head_signed_at := null;
  new.received_by := null;
  new.received_name := null;
  new.received_at := null;
  return new;
end;
$$;

drop trigger if exists leave_forms_fill on leave_forms;
create trigger leave_forms_fill
  before insert on leave_forms
  for each row execute function app_fill_leave_form();

alter table leave_forms enable row level security;

drop policy if exists "leave forms read" on leave_forms;
create policy "leave forms read" on leave_forms for select to authenticated
  using (app_can_view_leave_form(leave_request_id));

-- The employee submits the form for their own pending request, once signed.
drop policy if exists "leave forms submit" on leave_forms;
create policy "leave forms submit" on leave_forms for insert to authenticated
  with check (
    employee_id = app_current_employee_id()
    and exists (select 1 from leave_requests r where r.id = leave_request_id and r.employee_id = leave_forms.employee_id and r.status = 'pending')
    and app_leave_form_file_exists('forms/' || leave_request_id || '/applicant.png')
  );
-- No update/delete policies: the head's and HR's parts go through the
-- functions below.

create or replace function leave_form_decide(p_request text, p_decision text, p_reason text, p_days jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me text := app_current_employee_id();
  f leave_forms%rowtype;
  nm text;
  note text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if me is null then
    raise exception 'Not signed in as an employee.';
  end if;
  select * into f from leave_forms where leave_request_id = p_request for update;
  if not found then
    raise exception 'Leave form not found.';
  end if;
  if not app_leave_form_head_can(p_request) then
    raise exception 'Only the employee''s department head can approve this leave.';
  end if;
  if f.head_decision is not null then
    raise exception 'This leave form was already approved or disapproved.';
  end if;
  if p_decision not in ('approved', 'disapproved') then
    raise exception 'Choose Approved or Disapproved.';
  end if;
  if p_decision = 'disapproved' and note is null then
    raise exception 'Give the reason for disapproving.';
  end if;
  if char_length(coalesce(note, '')) > 500 or pg_column_size(p_days) > 2000 then
    raise exception 'That is too long.';
  end if;
  if not app_leave_form_file_exists('forms/' || p_request || '/head.png') then
    raise exception 'Attach your signature first.';
  end if;
  select trim(both ' ' from coalesce(first_name, '') || ' ' || coalesce(last_name, '')) into nm from employees where id = me;
  update leave_forms
     set head_days = coalesce(p_days, '{}'::jsonb), head_decision = p_decision, head_reason = note,
         head_signed_by = me, head_signed_name = nm, head_signed_at = now()
   where leave_request_id = p_request;
  update leave_requests
     set status = (case when p_decision = 'approved' then 'approved' else 'rejected' end)::request_status,
         decided_by = me, decided_at = now(), decision_note = note
   where id = p_request;
end;
$$;

revoke all on function leave_form_decide(text, text, text, jsonb) from public, anon;
grant execute on function leave_form_decide(text, text, text, jsonb) to authenticated;

create or replace function leave_form_receive(p_request text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me text := app_current_employee_id();
  f leave_forms%rowtype;
  nm text;
begin
  if me is null or not app_is_hr_manager() then
    raise exception 'Only the HR Manager can receive leave forms.';
  end if;
  select * into f from leave_forms where leave_request_id = p_request for update;
  if not found then
    raise exception 'Leave form not found.';
  end if;
  if f.head_decision is null then
    raise exception 'The department head hasn''t approved or disapproved it yet.';
  end if;
  if f.received_at is not null then
    raise exception 'This leave form was already received.';
  end if;
  if not app_leave_form_file_exists('forms/' || p_request || '/hr.png') then
    raise exception 'Attach your signature first.';
  end if;
  select trim(both ' ' from coalesce(first_name, '') || ' ' || coalesce(last_name, '')) into nm from employees where id = me;
  update leave_forms set received_by = me, received_name = nm, received_at = now() where leave_request_id = p_request;
end;
$$;

revoke all on function leave_form_receive(text) from public, anon;
grant execute on function leave_form_receive(text) to authenticated;

-- The signed-in employee's details for a new form (their department head
-- included, whom they may not otherwise be allowed to look up).
create or replace function my_leave_form_details()
returns table (designation text, branch text, department text, department_head text)
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(p.title, ''), coalesce(b.name, ''), coalesce(d.name, ''),
         coalesce(trim(both ' ' from coalesce(s.first_name, '') || ' ' || coalesce(s.last_name, '')), '')
  from employees e
  left join positions p on p.id = e.position_id
  left join branches b on b.id = e.branch_id
  left join departments d on d.id = e.department_id
  left join employees s on s.id = e.supervisor_id
  where e.id = app_current_employee_id();
$$;

revoke all on function my_leave_form_details() from public, anon;
grant execute on function my_leave_form_details() to authenticated;

-- Signatures: private bucket, PNG only, small.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('leave-forms', 'leave-forms', false, 1048576, array['image/png'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Own signature: signatures/<employee id>.png
drop policy if exists "leave forms own signature read" on storage.objects;
create policy "leave forms own signature read" on storage.objects for select to authenticated
  using (bucket_id = 'leave-forms' and name = 'signatures/' || app_current_employee_id() || '.png');
drop policy if exists "leave forms own signature upload" on storage.objects;
create policy "leave forms own signature upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'leave-forms' and name = 'signatures/' || app_current_employee_id() || '.png');
drop policy if exists "leave forms own signature replace" on storage.objects;
create policy "leave forms own signature replace" on storage.objects for update to authenticated
  using (bucket_id = 'leave-forms' and name = 'signatures/' || app_current_employee_id() || '.png')
  with check (bucket_id = 'leave-forms' and name = 'signatures/' || app_current_employee_id() || '.png');
drop policy if exists "leave forms own signature remove" on storage.objects;
create policy "leave forms own signature remove" on storage.objects for delete to authenticated
  using (bucket_id = 'leave-forms' and name = 'signatures/' || app_current_employee_id() || '.png');

-- A form's signatures: forms/<leave request id>/<applicant|head|hr>.png —
-- viewable by whoever can see the form; each placed by its signer while that
-- step is still open.
create or replace function app_can_sign_leave_form(path text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when path ~ '^forms/[^/]+/applicant\.png$' then exists (
      select 1 from leave_requests r
      where r.id = split_part(path, '/', 2) and r.employee_id = app_current_employee_id() and r.status = 'pending'
        and not exists (select 1 from leave_forms f where f.leave_request_id = r.id))
    when path ~ '^forms/[^/]+/head\.png$' then app_leave_form_head_can(split_part(path, '/', 2))
      and exists (select 1 from leave_forms f where f.leave_request_id = split_part(path, '/', 2) and f.head_decision is null)
    when path ~ '^forms/[^/]+/hr\.png$' then app_is_hr_manager()
      and exists (select 1 from leave_forms f where f.leave_request_id = split_part(path, '/', 2) and f.head_decision is not null and f.received_at is null)
    else false
  end;
$$;

revoke all on function app_can_sign_leave_form(text) from public, anon;
grant execute on function app_can_sign_leave_form(text) to authenticated;

drop policy if exists "leave forms signatures read" on storage.objects;
create policy "leave forms signatures read" on storage.objects for select to authenticated
  using (bucket_id = 'leave-forms' and name like 'forms/%' and app_can_view_leave_form(split_part(name, '/', 2)));
drop policy if exists "leave forms sign" on storage.objects;
create policy "leave forms sign" on storage.objects for insert to authenticated
  with check (bucket_id = 'leave-forms' and app_can_sign_leave_form(name));
drop policy if exists "leave forms re-sign" on storage.objects;
create policy "leave forms re-sign" on storage.objects for update to authenticated
  using (bucket_id = 'leave-forms' and app_can_sign_leave_form(name))
  with check (bucket_id = 'leave-forms' and app_can_sign_leave_form(name));


-- ---------------------------------------------------------------------------
-- migrate_phase28_overtime_forms.sql
-- ---------------------------------------------------------------------------

-- =============================================================================
-- Shantahl HRIS — online Overtime Authorization Form
--
--   * overtime_forms: the company's "SDSI Overtime Authorization Form", one
--     per overtime request. The employee fills in the overtime details and
--     signs; the database fills in their name, position, branch, department
--     and department head (their supervisor) from the 201 file.
--   * The department head (the supervisor — or HR when there's none)
--     approves (with the approved overtime hours) or disapproves, and signs
--     (overtime_form_decide). Disapproving rejects the request.
--   * The HR Manager then verifies it (the request is approved for the
--     approved hours, so it counts in payroll), disapproves it, or returns
--     it for clarification (overtime_form_hr). A returned form is corrected
--     and re-signed by the employee (overtime_form_resubmit) and goes back
--     to the department head.
--   * Signatures use the same private leave-forms bucket and the same saved
--     signature (signatures/<employee id>.png) as the leave form; a form's
--     copies are under ot/<overtime request id>/applicant|head|hr.png.
--   * Supervisors (whatever their role) can see their team's overtime.
--
-- Needs migrate_phase27_leave_forms.sql.
-- Safe to run any time, and safe to re-run.
-- Run once in the SQL Editor (Database > SQL Editor).
-- =============================================================================

drop policy if exists "overtime requests read supervisor" on overtime_requests;
create policy "overtime requests read supervisor" on overtime_requests for select to authenticated
  using (app_is_supervisor_of(employee_id));

create table if not exists overtime_forms (
  overtime_request_id text primary key references overtime_requests (id) on delete cascade,
  employee_id text not null references employees (id) on delete cascade,
  schedule text not null default '' check (char_length(schedule) <= 120),
  ot_date date not null,
  hours_requested numeric(5, 2) not null check (hours_requested > 0 and hours_requested <= 24),
  tasks text not null check (char_length(btrim(tasks)) between 1 and 1000),
  reason text not null check (char_length(btrim(reason)) between 1 and 1000),
  employee_name text not null default '',
  position text not null default '',
  branch text not null default '',
  department text not null default '',
  department_head_id text references employees (id) on delete set null,
  department_head text not null default '',
  submitted_at timestamptz not null default now(),
  resubmissions int not null default 0,
  head_decision text check (head_decision in ('approved', 'disapproved')),
  head_hours numeric(5, 2),
  head_reason text,
  head_signed_by text references employees (id) on delete set null,
  head_signed_name text,
  head_signed_at timestamptz,
  hr_decision text check (hr_decision in ('verified', 'disapproved', 'returned')),
  hr_reason text,
  hr_signed_by text references employees (id) on delete set null,
  hr_signed_name text,
  hr_signed_at timestamptz
);

create or replace function app_overtime_form_head_can(req_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from overtime_requests r join employees e on e.id = r.employee_id
    where r.id = req_id
      and r.employee_id <> coalesce(app_current_employee_id(), '')
      and (e.supervisor_id = app_current_employee_id() or (e.supervisor_id is null and app_is_hr_manager()))
  );
$$;

revoke all on function app_overtime_form_head_can(text) from public, anon;
grant execute on function app_overtime_form_head_can(text) to authenticated;

create or replace function app_can_view_overtime_form(req_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from overtime_requests r
    where r.id = req_id
      and (r.employee_id = app_current_employee_id() or app_is_supervisor_of(r.employee_id) or app_is_elevated())
  );
$$;

revoke all on function app_can_view_overtime_form(text) from public, anon;
grant execute on function app_can_view_overtime_form(text) to authenticated;

create or replace function app_fill_overtime_form()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  e employees%rowtype;
begin
  select * into e from employees where id = new.employee_id;
  new.employee_name := trim(both ' ' from coalesce(e.first_name, '') || ' ' || coalesce(e.last_name, ''));
  new.position := coalesce((select title from positions where id = e.position_id), '');
  new.branch := coalesce((select name from branches where id = e.branch_id), '');
  new.department := coalesce((select name from departments where id = e.department_id), '');
  new.department_head_id := e.supervisor_id;
  new.department_head := coalesce((select trim(both ' ' from coalesce(s.first_name, '') || ' ' || coalesce(s.last_name, '')) from employees s where s.id = e.supervisor_id), '');
  new.submitted_at := now();
  new.resubmissions := 0;
  new.head_decision := null;
  new.head_hours := null;
  new.head_reason := null;
  new.head_signed_by := null;
  new.head_signed_name := null;
  new.head_signed_at := null;
  new.hr_decision := null;
  new.hr_reason := null;
  new.hr_signed_by := null;
  new.hr_signed_name := null;
  new.hr_signed_at := null;
  return new;
end;
$$;

drop trigger if exists overtime_forms_fill on overtime_forms;
create trigger overtime_forms_fill
  before insert on overtime_forms
  for each row execute function app_fill_overtime_form();

alter table overtime_forms enable row level security;

drop policy if exists "overtime forms read" on overtime_forms;
create policy "overtime forms read" on overtime_forms for select to authenticated
  using (app_can_view_overtime_form(overtime_request_id));

drop policy if exists "overtime forms submit" on overtime_forms;
create policy "overtime forms submit" on overtime_forms for insert to authenticated
  with check (
    employee_id = app_current_employee_id()
    and exists (select 1 from overtime_requests r where r.id = overtime_request_id and r.employee_id = overtime_forms.employee_id and r.status = 'pending')
    and app_leave_form_file_exists('ot/' || overtime_request_id || '/applicant.png')
  );
-- No update/delete policies: the rest goes through the functions below.

create or replace function overtime_form_decide(p_request text, p_decision text, p_hours numeric, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me text := app_current_employee_id();
  f overtime_forms%rowtype;
  nm text;
  note text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if me is null then
    raise exception 'Not signed in as an employee.';
  end if;
  select * into f from overtime_forms where overtime_request_id = p_request for update;
  if not found then
    raise exception 'Overtime form not found.';
  end if;
  if not app_overtime_form_head_can(p_request) then
    raise exception 'Only the employee''s department head can approve this overtime.';
  end if;
  if f.head_decision is not null then
    raise exception 'This overtime form was already approved or disapproved.';
  end if;
  if p_decision not in ('approved', 'disapproved') then
    raise exception 'Choose Approved or Disapproved.';
  end if;
  if p_decision = 'approved' and (p_hours is null or p_hours <= 0 or p_hours > f.hours_requested) then
    raise exception 'Approved overtime hours must be more than 0 and at most the % hours requested.', f.hours_requested;
  end if;
  if p_decision = 'disapproved' and note is null then
    raise exception 'Give the reason of disapproval.';
  end if;
  if char_length(coalesce(note, '')) > 500 then
    raise exception 'That reason is too long.';
  end if;
  if not app_leave_form_file_exists('ot/' || p_request || '/head.png') then
    raise exception 'Attach your signature first.';
  end if;
  select trim(both ' ' from coalesce(first_name, '') || ' ' || coalesce(last_name, '')) into nm from employees where id = me;
  update overtime_forms
     set head_decision = p_decision, head_hours = case when p_decision = 'approved' then p_hours end, head_reason = note,
         head_signed_by = me, head_signed_name = nm, head_signed_at = now()
   where overtime_request_id = p_request;
  if p_decision = 'disapproved' then
    update overtime_requests set status = 'rejected', decided_by = me, decided_at = now(), decision_note = note where id = p_request;
  end if;
end;
$$;

revoke all on function overtime_form_decide(text, text, numeric, text) from public, anon;
grant execute on function overtime_form_decide(text, text, numeric, text) to authenticated;

create or replace function overtime_form_hr(p_request text, p_decision text, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me text := app_current_employee_id();
  f overtime_forms%rowtype;
  nm text;
  note text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if me is null or not app_is_hr_manager() then
    raise exception 'Only the HR Manager can verify overtime forms.';
  end if;
  select * into f from overtime_forms where overtime_request_id = p_request for update;
  if not found then
    raise exception 'Overtime form not found.';
  end if;
  if f.head_decision is distinct from 'approved' or f.hr_decision is not null then
    raise exception 'This overtime form isn''t waiting for HR.';
  end if;
  if p_decision not in ('verified', 'disapproved', 'returned') then
    raise exception 'Choose Verified, Disapproved or Returned for clarification.';
  end if;
  if p_decision <> 'verified' and note is null then
    raise exception 'Give the reason.';
  end if;
  if char_length(coalesce(note, '')) > 500 then
    raise exception 'That reason is too long.';
  end if;
  if not app_leave_form_file_exists('ot/' || p_request || '/hr.png') then
    raise exception 'Attach your signature first.';
  end if;
  select trim(both ' ' from coalesce(first_name, '') || ' ' || coalesce(last_name, '')) into nm from employees where id = me;
  update overtime_forms
     set hr_decision = p_decision, hr_reason = note, hr_signed_by = me, hr_signed_name = nm, hr_signed_at = now()
   where overtime_request_id = p_request;
  if p_decision = 'verified' then
    update overtime_requests set status = 'approved', hours = f.head_hours, decided_by = me, decided_at = now(), decision_note = null where id = p_request;
  elsif p_decision = 'disapproved' then
    update overtime_requests set status = 'rejected', decided_by = me, decided_at = now(), decision_note = note where id = p_request;
  end if;
end;
$$;

revoke all on function overtime_form_hr(text, text, text) from public, anon;
grant execute on function overtime_form_hr(text, text, text) to authenticated;

-- A form returned for clarification: the employee corrects it (re-signing
-- it first) and it goes back to the department head.
create or replace function overtime_form_resubmit(p_request text, p_schedule text, p_date date, p_hours numeric, p_tasks text, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me text := app_current_employee_id();
  f overtime_forms%rowtype;
begin
  select * into f from overtime_forms where overtime_request_id = p_request for update;
  if not found or f.employee_id is distinct from me then
    raise exception 'Overtime form not found.';
  end if;
  if f.hr_decision is distinct from 'returned' then
    raise exception 'Only a form returned for clarification can be resubmitted.';
  end if;
  if p_hours is null or p_hours <= 0 or p_hours > 24 then
    raise exception 'Enter the overtime hours (up to 24).';
  end if;
  if char_length(btrim(coalesce(p_tasks, ''))) not between 1 and 1000 or char_length(btrim(coalesce(p_reason, ''))) not between 1 and 1000 then
    raise exception 'Fill in the tasks and the reason.';
  end if;
  update overtime_forms
     set schedule = left(coalesce(p_schedule, ''), 120), ot_date = p_date, hours_requested = p_hours,
         tasks = btrim(p_tasks), reason = btrim(p_reason), submitted_at = now(), resubmissions = f.resubmissions + 1,
         head_decision = null, head_hours = null, head_reason = null, head_signed_by = null, head_signed_name = null, head_signed_at = null,
         hr_decision = null, hr_reason = null, hr_signed_by = null, hr_signed_name = null, hr_signed_at = null
   where overtime_request_id = p_request;
  update overtime_requests set date = p_date, hours = p_hours, reason = btrim(p_reason), status = 'pending', decided_by = null, decided_at = null, decision_note = null where id = p_request;
end;
$$;

revoke all on function overtime_form_resubmit(text, text, date, numeric, text, text) from public, anon;
grant execute on function overtime_form_resubmit(text, text, date, numeric, text, text) to authenticated;

-- A form's signatures: ot/<overtime request id>/<applicant|head|hr>.png in
-- the leave-forms bucket, each placed by its signer while that step is open.
create or replace function app_can_sign_overtime_form(path text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when path ~ '^ot/[^/]+/applicant\.png$' then exists (
      select 1 from overtime_requests r
      where r.id = split_part(path, '/', 2) and r.employee_id = app_current_employee_id() and r.status = 'pending'
        and not exists (select 1 from overtime_forms f where f.overtime_request_id = r.id and f.hr_decision is distinct from 'returned'))
    when path ~ '^ot/[^/]+/head\.png$' then app_overtime_form_head_can(split_part(path, '/', 2))
      and exists (select 1 from overtime_forms f where f.overtime_request_id = split_part(path, '/', 2) and f.head_decision is null)
    when path ~ '^ot/[^/]+/hr\.png$' then app_is_hr_manager()
      and exists (select 1 from overtime_forms f where f.overtime_request_id = split_part(path, '/', 2) and f.head_decision = 'approved' and f.hr_decision is null)
    else false
  end;
$$;

revoke all on function app_can_sign_overtime_form(text) from public, anon;
grant execute on function app_can_sign_overtime_form(text) to authenticated;

drop policy if exists "overtime forms signatures read" on storage.objects;
create policy "overtime forms signatures read" on storage.objects for select to authenticated
  using (bucket_id = 'leave-forms' and name like 'ot/%' and app_can_view_overtime_form(split_part(name, '/', 2)));
drop policy if exists "overtime forms sign" on storage.objects;
create policy "overtime forms sign" on storage.objects for insert to authenticated
  with check (bucket_id = 'leave-forms' and app_can_sign_overtime_form(name));
drop policy if exists "overtime forms re-sign" on storage.objects;
create policy "overtime forms re-sign" on storage.objects for update to authenticated
  using (bucket_id = 'leave-forms' and app_can_sign_overtime_form(name))
  with check (bucket_id = 'leave-forms' and app_can_sign_overtime_form(name));


-- ---------------------------------------------------------------------------
-- migrate_phase29_delete_leave_requests.sql
-- ---------------------------------------------------------------------------

-- =============================================================================
-- Shantahl HRIS — the HR Manager can delete leave requests
--
--   * Deleting a leave request also deletes its online leave form and its
--     attachment records (on delete cascade); the HR Manager may also remove
--     the request's files (form signatures, attachments) from storage.
--
-- Safe to run any time, and safe to re-run.
-- Run once in the SQL Editor (Database > SQL Editor).
-- =============================================================================

drop policy if exists "leave requests delete hr" on leave_requests;
create policy "leave requests delete hr" on leave_requests for delete to authenticated
  using (app_is_hr_manager());

drop policy if exists "leave forms files delete hr" on storage.objects;
create policy "leave forms files delete hr" on storage.objects for delete to authenticated
  using (bucket_id = 'leave-forms' and name like 'forms/%' and app_is_hr_manager());

drop policy if exists "leave attachments delete hr" on storage.objects;
create policy "leave attachments delete hr" on storage.objects for delete to authenticated
  using (bucket_id = 'leave-attachments' and app_is_hr_manager());


-- ---------------------------------------------------------------------------
-- migrate_phase30_delete_overtime_requests.sql
-- ---------------------------------------------------------------------------

-- =============================================================================
-- Shantahl HRIS — the HR Manager can delete overtime requests
--
--   * Deleting an overtime request also deletes its online overtime form
--     (on delete cascade); the HR Manager may also remove the form's
--     signature files (ot/<request id>/...) from storage.
--
-- Safe to run any time, and safe to re-run.
-- Run once in the SQL Editor (Database > SQL Editor).
-- =============================================================================

drop policy if exists "overtime requests delete hr" on overtime_requests;
create policy "overtime requests delete hr" on overtime_requests for delete to authenticated
  using (app_is_hr_manager());

drop policy if exists "overtime forms files delete hr" on storage.objects;
create policy "overtime forms files delete hr" on storage.objects for delete to authenticated
  using (bucket_id = 'leave-forms' and name like 'ot/%' and app_is_hr_manager());


-- ---------------------------------------------------------------------------
-- migrate_phase31_period_required_days.sql
-- ---------------------------------------------------------------------------

-- =============================================================================
-- Shantahl HRIS — required working days per payroll period
--
--   * payroll_periods.required_days: the regular working days in the cut-off
--     (holidays are not required). The attendance rate is days worked over
--     this. Blank = Monday to Saturday in the period.
--   * Seeds the 2026 cut-offs given by HR.
--
-- Safe to run any time, and safe to re-run.
-- Run once in the SQL Editor (Database > SQL Editor).
-- =============================================================================

alter table payroll_periods add column if not exists required_days numeric;

-- (Shantahl's 2026 required working days left out — set them on the Payroll Periods page.)


-- ---------------------------------------------------------------------------
-- migrate_phase32_announcement_files.sql
-- ---------------------------------------------------------------------------

-- =============================================================================
-- Shantahl HRIS — file attachments on Bulletin Board announcements
--
--   1. announcements.files: the files attached to a post (PDF, Word, Excel,
--      PowerPoint, text, CSV, ZIP), as a JSON list of
--      { "path", "name", "size", "type" }.
--   2. A private Storage bucket "announcement-files" (up to 25 MB a file).
--      Every signed-in employee can download them; the people who can post
--      announcements can upload and remove them.
--
-- Safe to run any time, and safe to re-run.
-- Run once in the SQL Editor (Database > SQL Editor).
-- =============================================================================

alter table announcements add column if not exists files jsonb not null default '[]'::jsonb;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'announcement-files', 'announcement-files', false, 26214400,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain', 'text/csv', 'application/zip', 'application/x-zip-compressed'
  ]
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "announcement files read" on storage.objects;
create policy "announcement files read" on storage.objects for select to authenticated
  using (bucket_id = 'announcement-files');

drop policy if exists "announcement files upload" on storage.objects;
create policy "announcement files upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'announcement-files' and app_can_post_announcements());

drop policy if exists "announcement files delete" on storage.objects;
create policy "announcement files delete" on storage.objects for delete to authenticated
  using (bucket_id = 'announcement-files' and app_can_post_announcements());


-- ---------------------------------------------------------------------------
-- migrate_phase33_voucher_date.sql
-- ---------------------------------------------------------------------------

-- =============================================================================
-- Shantahl HRIS — custom voucher date per payroll period
--
--   payroll_periods.voucher_date: the date printed on the period's vouchers
--   (department vouchers and the salary adjustment voucher). Blank = the
--   cut-off end date, as before.
--
-- Safe to run any time, and safe to re-run.
-- Run once in the SQL Editor (Database > SQL Editor).
-- =============================================================================

alter table payroll_periods add column if not exists voucher_date date;


-- ---------------------------------------------------------------------------
-- migrate_phase34_my_voucher_slips.sql
-- ---------------------------------------------------------------------------

-- =============================================================================
-- Shantahl HRIS — employees see their own voucher payslips ("My Payslips")
--
--   my_voucher_slips(): the signed-in employee's own department voucher
--   lines (lines linked to them), once final — the payroll period is locked
--   or closed, or the voucher was marked released by the Treasurer (for its
--   current total). Employees still can't read vouchers themselves; this
--   returns only their own lines.
--
-- Safe to run any time, and safe to re-run.
-- Run once in the SQL Editor (Database > SQL Editor).
-- =============================================================================

create or replace function my_voucher_slips()
returns table (
  line_id text,
  period_id text,
  period_start date,
  period_end date,
  voucher_date date,
  department_id text,
  department_name text,
  payee_name text,
  description text,
  amount numeric,
  released_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with me as (select app_current_employee_id() as id),
  totals as (
    select l.voucher_id, sum(l.amount) as total from department_voucher_lines l group by l.voucher_id
  )
  select l.id, p.id, p.period_start, p.period_end, p.voucher_date, d.id, d.name, l.payee_name, l.description, l.amount, s.signed_at
  from department_voucher_lines l
  join me on l.employee_id = me.id
  join department_vouchers v on v.id = l.voucher_id
  join payroll_periods p on p.id = v.period_id
  join departments d on d.id = v.department_id
  join totals t on t.voucher_id = v.id
  left join voucher_signoffs s
    on s.period_id = v.period_id and s.voucher_key = 'dept:' || v.department_id and s.step = 'released' and s.signed_total = t.total
  where me.id is not null
    and (p.status in ('locked', 'closed') or s.signed_at is not null)
  order by p.period_start, d.name, l.sort_order;
$$;

revoke all on function my_voucher_slips() from public, anon;
grant execute on function my_voucher_slips() to authenticated;


-- ---------------------------------------------------------------------------
-- migrate_phase35_handbook_acknowledgments.sql
-- ---------------------------------------------------------------------------

-- =============================================================================
-- Shantahl HRIS — Employee Handbook Acknowledgment Form
--
--   * handbook_info: the handbook's version and effective date (HR sets them
--     on the Employee Handbook page).
--   * handbook_downloads: each time an employee opens or downloads the
--     handbook in the HRIS — the proof of dissemination, and the "Date of
--     HRIS access / download" on the form.
--   * handbook_acknowledgments: the signed "Employee Handbook Acknowledgment
--     Form", one per employee per handbook version. The employee chooses the
--     language item and signs; the database fills in their name, ID no.,
--     position, department / branch, the handbook version and the first
--     download date. Then the HR Manager verifies the download record and
--     signs it as received (handbook_ack_receive).
--   * Signatures: a copy of the signer's saved signature (leave-forms bucket,
--     signatures/<employee id>.png) is placed at
--     handbook/<employee id>/<form id>/employee.png and hr.png.
--   * The employee sees their own forms; the HR Manager and upper management
--     see everyone's.
--
-- Safe to run any time, and safe to re-run.
-- Run once in the SQL Editor (Database > SQL Editor).
-- =============================================================================

create or replace function app_can_view_handbook_acks()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select app_has_any_role(array['hr_admin', 'upper_management']::app_role[]);
$$;

revoke all on function app_can_view_handbook_acks() from public, anon;
grant execute on function app_can_view_handbook_acks() to authenticated;

-- ---- Version and effective date -----------------------------------------------

create table if not exists handbook_info (
  id int primary key default 1 check (id = 1),
  version text not null default '' check (char_length(version) <= 40),
  effective_date date,
  updated_by text references employees (id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table handbook_info enable row level security;

drop policy if exists "handbook info read" on handbook_info;
create policy "handbook info read" on handbook_info for select to authenticated using (true);
drop policy if exists "handbook info insert" on handbook_info;
create policy "handbook info insert" on handbook_info for insert to authenticated with check (app_is_hr_manager());
drop policy if exists "handbook info update" on handbook_info;
create policy "handbook info update" on handbook_info for update to authenticated using (app_is_hr_manager()) with check (app_is_hr_manager());

-- ---- Downloads -----------------------------------------------------------------

create table if not exists handbook_downloads (
  id bigint generated always as identity primary key,
  employee_id text not null references employees (id) on delete cascade,
  handbook_version text not null default '',
  downloaded_at timestamptz not null default now()
);

create index if not exists handbook_downloads_employee_idx on handbook_downloads (employee_id, downloaded_at);

create or replace function app_fill_handbook_download()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.handbook_version := coalesce((select version from handbook_info where id = 1), '');
  new.downloaded_at := now();
  return new;
end;
$$;

drop trigger if exists handbook_downloads_fill on handbook_downloads;
create trigger handbook_downloads_fill
  before insert on handbook_downloads
  for each row execute function app_fill_handbook_download();

alter table handbook_downloads enable row level security;

drop policy if exists "handbook downloads read" on handbook_downloads;
create policy "handbook downloads read" on handbook_downloads for select to authenticated
  using (employee_id = app_current_employee_id() or app_can_view_handbook_acks());
drop policy if exists "handbook downloads record" on handbook_downloads;
create policy "handbook downloads record" on handbook_downloads for insert to authenticated
  with check (employee_id = app_current_employee_id());

-- ---- Acknowledgment forms --------------------------------------------------------

create table if not exists handbook_acknowledgments (
  id text primary key,
  employee_id text not null references employees (id) on delete cascade,
  handbook_version text not null default '',
  handbook_effective date,
  language text not null check (language in ('english', 'explained')),
  explained_language text not null default '' check (char_length(explained_language) <= 60),
  employee_name text not null default '',
  employee_number text not null default '',
  position text not null default '',
  department_branch text not null default '',
  accessed_at timestamptz,
  signed_at timestamptz not null default now(),
  hr_verified boolean,
  hr_log_ref text,
  received_by text references employees (id) on delete set null,
  received_name text,
  received_position text,
  received_at timestamptz,
  unique (employee_id, handbook_version)
);

create or replace function app_fill_handbook_ack()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  e employees%rowtype;
  dept text;
  br text;
begin
  select * into e from employees where id = new.employee_id;
  select version, effective_date into new.handbook_version, new.handbook_effective from handbook_info where id = 1;
  new.handbook_version := coalesce(new.handbook_version, '');
  select min(downloaded_at) into new.accessed_at from handbook_downloads
   where employee_id = new.employee_id and handbook_version = new.handbook_version;
  if new.accessed_at is null then
    raise exception 'Open or download the handbook first.';
  end if;
  if new.language = 'explained' and btrim(new.explained_language) = '' then
    raise exception 'Enter the language the handbook was explained to you in.';
  end if;
  if new.language = 'english' then
    new.explained_language := '';
  end if;
  new.explained_language := btrim(new.explained_language);
  new.employee_name := trim(both ' ' from coalesce(e.first_name, '') || ' ' || coalesce(e.last_name, ''));
  new.employee_number := coalesce(e.employee_number, '');
  new.position := coalesce((select title from positions where id = e.position_id), '');
  dept := coalesce((select name from departments where id = e.department_id), '');
  br := coalesce((select name from branches where id = e.branch_id), '');
  new.department_branch := case when dept <> '' and br <> '' then dept || ' / ' || br else dept || br end;
  new.signed_at := now();
  new.hr_verified := null;
  new.hr_log_ref := null;
  new.received_by := null;
  new.received_name := null;
  new.received_position := null;
  new.received_at := null;
  return new;
end;
$$;

drop trigger if exists handbook_acks_fill on handbook_acknowledgments;
create trigger handbook_acks_fill
  before insert on handbook_acknowledgments
  for each row execute function app_fill_handbook_ack();

create or replace function app_handbook_file_exists(path text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from storage.objects o where o.bucket_id = 'leave-forms' and o.name = path);
$$;

revoke all on function app_handbook_file_exists(text) from public, anon;
grant execute on function app_handbook_file_exists(text) to authenticated;

alter table handbook_acknowledgments enable row level security;

drop policy if exists "handbook acks read" on handbook_acknowledgments;
create policy "handbook acks read" on handbook_acknowledgments for select to authenticated
  using (employee_id = app_current_employee_id() or app_can_view_handbook_acks());
-- The employee submits their own form, once signed.
drop policy if exists "handbook acks submit" on handbook_acknowledgments;
create policy "handbook acks submit" on handbook_acknowledgments for insert to authenticated
  with check (
    employee_id = app_current_employee_id()
    and app_handbook_file_exists('handbook/' || employee_id || '/' || id || '/employee.png')
  );
-- The HR Manager can remove a form (e.g. signed by mistake) so it can be signed again.
drop policy if exists "handbook acks remove" on handbook_acknowledgments;
create policy "handbook acks remove" on handbook_acknowledgments for delete to authenticated
  using (app_is_hr_manager());

create or replace function handbook_ack_receive(p_id text, p_verified boolean, p_log_ref text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me text := app_current_employee_id();
  f handbook_acknowledgments%rowtype;
  nm text;
  pos text;
begin
  if me is null or not app_is_hr_manager() then
    raise exception 'Only the HR Manager can receive acknowledgment forms.';
  end if;
  select * into f from handbook_acknowledgments where id = p_id for update;
  if not found then
    raise exception 'Acknowledgment form not found.';
  end if;
  if f.received_at is not null then
    raise exception 'This form was already received.';
  end if;
  if p_verified is null then
    raise exception 'Choose whether the HRIS download record was verified.';
  end if;
  if char_length(coalesce(p_log_ref, '')) > 120 then
    raise exception 'The log reference is too long.';
  end if;
  if not app_handbook_file_exists('handbook/' || f.employee_id || '/' || p_id || '/hr.png') then
    raise exception 'Attach your signature first.';
  end if;
  select trim(both ' ' from coalesce(e.first_name, '') || ' ' || coalesce(e.last_name, '')), coalesce(p.title, '')
    into nm, pos
    from employees e left join positions p on p.id = e.position_id
   where e.id = me;
  update handbook_acknowledgments
     set hr_verified = p_verified, hr_log_ref = nullif(btrim(coalesce(p_log_ref, '')), ''),
         received_by = me, received_name = nm, received_position = pos, received_at = now()
   where id = p_id;
end;
$$;

revoke all on function handbook_ack_receive(text, boolean, text) from public, anon;
grant execute on function handbook_ack_receive(text, boolean, text) to authenticated;

-- ---- Signatures on the forms (leave-forms bucket) ---------------------------------

create or replace function app_can_sign_handbook_ack(path text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when path ~ '^handbook/[^/]+/[^/]+/employee\.png$' then
      split_part(path, '/', 2) = app_current_employee_id()
      and not exists (select 1 from handbook_acknowledgments a where a.id = split_part(path, '/', 3))
    when path ~ '^handbook/[^/]+/[^/]+/hr\.png$' then app_is_hr_manager()
      and exists (select 1 from handbook_acknowledgments a
                   where a.id = split_part(path, '/', 3) and a.employee_id = split_part(path, '/', 2) and a.received_at is null)
    else false
  end;
$$;

revoke all on function app_can_sign_handbook_ack(text) from public, anon;
grant execute on function app_can_sign_handbook_ack(text) to authenticated;

drop policy if exists "handbook acks signatures read" on storage.objects;
create policy "handbook acks signatures read" on storage.objects for select to authenticated
  using (bucket_id = 'leave-forms' and name like 'handbook/%'
         and (split_part(name, '/', 2) = app_current_employee_id() or app_can_view_handbook_acks()));
drop policy if exists "handbook acks sign" on storage.objects;
create policy "handbook acks sign" on storage.objects for insert to authenticated
  with check (bucket_id = 'leave-forms' and app_can_sign_handbook_ack(name));
drop policy if exists "handbook acks re-sign" on storage.objects;
create policy "handbook acks re-sign" on storage.objects for update to authenticated
  using (bucket_id = 'leave-forms' and app_can_sign_handbook_ack(name))
  with check (bucket_id = 'leave-forms' and app_can_sign_handbook_ack(name));


-- ---------------------------------------------------------------------------
-- migrate_phase36_correction_forms.sql
-- ---------------------------------------------------------------------------

-- =============================================================================
-- Shantahl HRIS — online Attendance Correction Form
--
--   * correction_forms: one per attendance correction request. The employee
--     fills in the date, what to correct, the correct time in / out and the
--     reason, and signs; the database fills in their name, position, branch,
--     department and department head (their supervisor) from the 201 file.
--   * The department head (the supervisor — or HR when there's none)
--     approves or disapproves and signs (correction_form_decide), which also
--     approves / rejects the correction request.
--   * Then the HR Manager signs it as received (correction_form_receive).
--   * Signatures use the same private leave-forms bucket and saved signature
--     (signatures/<employee id>.png) as the leave and overtime forms; a
--     form's copies are under corr/<request id>/applicant|head|hr.png.
--   * Supervisors (whatever their role) can see their team's corrections.
--
-- Needs migrate_phase27_leave_forms.sql.
-- Safe to run any time, and safe to re-run.
-- Run once in the SQL Editor (Database > SQL Editor).
-- =============================================================================

drop policy if exists "correction requests read supervisor" on attendance_correction_requests;
create policy "correction requests read supervisor" on attendance_correction_requests for select to authenticated
  using (app_is_supervisor_of(employee_id));

create table if not exists correction_forms (
  correction_request_id text primary key references attendance_correction_requests (id) on delete cascade,
  employee_id text not null references employees (id) on delete cascade,
  correction_date date not null,
  correction_type text not null check (correction_type in ('missed_in', 'missed_out', 'missed_both', 'wrong_time', 'device_failure', 'other')),
  time_in text check (time_in ~ '^[0-2][0-9]:[0-5][0-9]$'),
  time_out text check (time_out ~ '^[0-2][0-9]:[0-5][0-9]$'),
  reason text not null check (char_length(btrim(reason)) between 1 and 1000),
  employee_name text not null default '',
  position text not null default '',
  branch text not null default '',
  department text not null default '',
  department_head_id text references employees (id) on delete set null,
  department_head text not null default '',
  submitted_at timestamptz not null default now(),
  head_decision text check (head_decision in ('approved', 'disapproved')),
  head_reason text,
  head_signed_by text references employees (id) on delete set null,
  head_signed_name text,
  head_signed_at timestamptz,
  received_by text references employees (id) on delete set null,
  received_name text,
  received_at timestamptz
);

create or replace function app_correction_form_head_can(req_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from attendance_correction_requests r join employees e on e.id = r.employee_id
    where r.id = req_id
      and r.employee_id <> coalesce(app_current_employee_id(), '')
      and (e.supervisor_id = app_current_employee_id() or (e.supervisor_id is null and app_is_hr_manager()))
  );
$$;

revoke all on function app_correction_form_head_can(text) from public, anon;
grant execute on function app_correction_form_head_can(text) to authenticated;

create or replace function app_can_view_correction_form(req_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from attendance_correction_requests r
    where r.id = req_id
      and (r.employee_id = app_current_employee_id() or app_is_supervisor_of(r.employee_id) or app_is_elevated())
  );
$$;

revoke all on function app_can_view_correction_form(text) from public, anon;
grant execute on function app_can_view_correction_form(text) to authenticated;

create or replace function app_fill_correction_form()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  e employees%rowtype;
begin
  select * into e from employees where id = new.employee_id;
  new.employee_name := trim(both ' ' from coalesce(e.first_name, '') || ' ' || coalesce(e.last_name, ''));
  new.position := coalesce((select title from positions where id = e.position_id), '');
  new.branch := coalesce((select name from branches where id = e.branch_id), '');
  new.department := coalesce((select name from departments where id = e.department_id), '');
  new.department_head_id := e.supervisor_id;
  new.department_head := coalesce((select trim(both ' ' from coalesce(s.first_name, '') || ' ' || coalesce(s.last_name, '')) from employees s where s.id = e.supervisor_id), '');
  new.submitted_at := now();
  new.head_decision := null;
  new.head_reason := null;
  new.head_signed_by := null;
  new.head_signed_name := null;
  new.head_signed_at := null;
  new.received_by := null;
  new.received_name := null;
  new.received_at := null;
  return new;
end;
$$;

drop trigger if exists correction_forms_fill on correction_forms;
create trigger correction_forms_fill
  before insert on correction_forms
  for each row execute function app_fill_correction_form();

alter table correction_forms enable row level security;

drop policy if exists "correction forms read" on correction_forms;
create policy "correction forms read" on correction_forms for select to authenticated
  using (app_can_view_correction_form(correction_request_id));

-- The employee submits the form for their own pending request, once signed.
drop policy if exists "correction forms submit" on correction_forms;
create policy "correction forms submit" on correction_forms for insert to authenticated
  with check (
    employee_id = app_current_employee_id()
    and exists (select 1 from attendance_correction_requests r where r.id = correction_request_id and r.employee_id = correction_forms.employee_id and r.status = 'pending')
    and app_leave_form_file_exists('corr/' || correction_request_id || '/applicant.png')
  );
-- No update/delete policies: the head's and HR's parts go through the
-- functions below.

create or replace function correction_form_decide(p_request text, p_decision text, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me text := app_current_employee_id();
  f correction_forms%rowtype;
  nm text;
  note text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if me is null then
    raise exception 'Not signed in as an employee.';
  end if;
  select * into f from correction_forms where correction_request_id = p_request for update;
  if not found then
    raise exception 'Attendance correction form not found.';
  end if;
  if not app_correction_form_head_can(p_request) then
    raise exception 'Only the employee''s department head can approve this correction.';
  end if;
  if f.head_decision is not null then
    raise exception 'This form was already approved or disapproved.';
  end if;
  if p_decision not in ('approved', 'disapproved') then
    raise exception 'Choose Approved or Disapproved.';
  end if;
  if p_decision = 'disapproved' and note is null then
    raise exception 'Give the reason for disapproving.';
  end if;
  if char_length(coalesce(note, '')) > 500 then
    raise exception 'That reason is too long.';
  end if;
  if not app_leave_form_file_exists('corr/' || p_request || '/head.png') then
    raise exception 'Attach your signature first.';
  end if;
  select trim(both ' ' from coalesce(first_name, '') || ' ' || coalesce(last_name, '')) into nm from employees where id = me;
  update correction_forms
     set head_decision = p_decision, head_reason = note, head_signed_by = me, head_signed_name = nm, head_signed_at = now()
   where correction_request_id = p_request;
  update attendance_correction_requests
     set status = (case when p_decision = 'approved' then 'approved' else 'rejected' end)::request_status,
         decided_by = me, decided_at = now(), decision_note = note
   where id = p_request;
end;
$$;

revoke all on function correction_form_decide(text, text, text) from public, anon;
grant execute on function correction_form_decide(text, text, text) to authenticated;

create or replace function correction_form_receive(p_request text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me text := app_current_employee_id();
  f correction_forms%rowtype;
  nm text;
begin
  if me is null or not app_is_hr_manager() then
    raise exception 'Only the HR Manager can receive attendance correction forms.';
  end if;
  select * into f from correction_forms where correction_request_id = p_request for update;
  if not found then
    raise exception 'Attendance correction form not found.';
  end if;
  if f.head_decision is null then
    raise exception 'The department head hasn''t approved or disapproved it yet.';
  end if;
  if f.received_at is not null then
    raise exception 'This form was already received.';
  end if;
  if not app_leave_form_file_exists('corr/' || p_request || '/hr.png') then
    raise exception 'Attach your signature first.';
  end if;
  select trim(both ' ' from coalesce(first_name, '') || ' ' || coalesce(last_name, '')) into nm from employees where id = me;
  update correction_forms set received_by = me, received_name = nm, received_at = now() where correction_request_id = p_request;
end;
$$;

revoke all on function correction_form_receive(text) from public, anon;
grant execute on function correction_form_receive(text) to authenticated;

-- A form's signatures: corr/<request id>/<applicant|head|hr>.png in the
-- leave-forms bucket, each placed by its signer while that step is open.
create or replace function app_can_sign_correction_form(path text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when path ~ '^corr/[^/]+/applicant\.png$' then exists (
      select 1 from attendance_correction_requests r
      where r.id = split_part(path, '/', 2) and r.employee_id = app_current_employee_id() and r.status = 'pending'
        and not exists (select 1 from correction_forms f where f.correction_request_id = r.id))
    when path ~ '^corr/[^/]+/head\.png$' then app_correction_form_head_can(split_part(path, '/', 2))
      and exists (select 1 from correction_forms f where f.correction_request_id = split_part(path, '/', 2) and f.head_decision is null)
    when path ~ '^corr/[^/]+/hr\.png$' then app_is_hr_manager()
      and exists (select 1 from correction_forms f where f.correction_request_id = split_part(path, '/', 2) and f.head_decision is not null and f.received_at is null)
    else false
  end;
$$;

revoke all on function app_can_sign_correction_form(text) from public, anon;
grant execute on function app_can_sign_correction_form(text) to authenticated;

drop policy if exists "correction forms signatures read" on storage.objects;
create policy "correction forms signatures read" on storage.objects for select to authenticated
  using (bucket_id = 'leave-forms' and name like 'corr/%' and app_can_view_correction_form(split_part(name, '/', 2)));
drop policy if exists "correction forms sign" on storage.objects;
create policy "correction forms sign" on storage.objects for insert to authenticated
  with check (bucket_id = 'leave-forms' and app_can_sign_correction_form(name));
drop policy if exists "correction forms re-sign" on storage.objects;
create policy "correction forms re-sign" on storage.objects for update to authenticated
  using (bucket_id = 'leave-forms' and app_can_sign_correction_form(name))
  with check (bucket_id = 'leave-forms' and app_can_sign_correction_form(name));


-- ---------------------------------------------------------------------------
-- migrate_phase37_leave_form_unpaid_days.sql
-- ---------------------------------------------------------------------------

-- =============================================================================
-- Shantahl HRIS — leave form: paid days plus days without pay
--
--   When an employee applies for more days than their remaining leave
--   credits (e.g. 1 day of vacation leave left, applying for 2.5 days), one
--   leave form covers both: its request is the paid part (vacation / sick /
--   bereavement with pay), and a second Leave Without Pay request — linked as
--   leave_forms.unpaid_request_id — holds the rest. The department head's
--   approval (leave_form_decide) approves or rejects both; deleting the form
--   removes the linked request too.
--
-- Needs migrate_phase27_leave_forms.sql.
-- Safe to run any time, and safe to re-run.
-- Run once in the SQL Editor (Database > SQL Editor).
-- =============================================================================

alter table leave_forms add column if not exists unpaid_request_id text references leave_requests (id) on delete set null;
alter table leave_forms add column if not exists unpaid_days numeric(6, 2);

-- The linked request must be the same employee's own pending Leave Without
-- Pay request; its days are copied onto the form.
create or replace function app_check_leave_form_unpaid()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r leave_requests%rowtype;
begin
  if new.unpaid_request_id is null then
    new.unpaid_days := null;
    return new;
  end if;
  select * into r from leave_requests where id = new.unpaid_request_id;
  if not found or r.employee_id <> new.employee_id or r.status <> 'pending' or r.leave_type_id <> 'lt-lwop' or r.id = new.leave_request_id then
    raise exception 'The days without pay must be your own pending Leave Without Pay request.';
  end if;
  if exists (select 1 from leave_forms f where f.unpaid_request_id = new.unpaid_request_id or f.leave_request_id = new.unpaid_request_id) then
    raise exception 'That Leave Without Pay request already has a leave form.';
  end if;
  new.unpaid_days := r.days;
  return new;
end;
$$;

drop trigger if exists leave_forms_unpaid on leave_forms;
create trigger leave_forms_unpaid
  before insert on leave_forms
  for each row execute function app_check_leave_form_unpaid();

-- The department head's decision covers the linked request too.
create or replace function app_leave_form_decide_unpaid()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.unpaid_request_id is not null and new.head_decision is not null and old.head_decision is null then
    update leave_requests
       set status = (case when new.head_decision = 'approved' then 'approved' else 'rejected' end)::request_status,
           decided_by = new.head_signed_by, decided_at = now(), decision_note = new.head_reason
     where id = new.unpaid_request_id;
  end if;
  return new;
end;
$$;

drop trigger if exists leave_forms_decide_unpaid on leave_forms;
create trigger leave_forms_decide_unpaid
  after update on leave_forms
  for each row execute function app_leave_form_decide_unpaid();

-- Deleting the form (with its paid request) removes the linked request.
create or replace function app_leave_form_delete_unpaid()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.unpaid_request_id is not null then
    delete from leave_requests where id = old.unpaid_request_id;
  end if;
  return old;
end;
$$;

drop trigger if exists leave_forms_delete_unpaid on leave_forms;
create trigger leave_forms_delete_unpaid
  after delete on leave_forms
  for each row execute function app_leave_form_delete_unpaid();

-- Whoever can see the form can see its linked request (e.g. the department head).
create or replace function app_can_view_leave_unpaid(req_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from leave_forms f where f.unpaid_request_id = req_id and app_can_view_leave_form(f.leave_request_id));
$$;

revoke all on function app_can_view_leave_unpaid(text) from public, anon;
grant execute on function app_can_view_leave_unpaid(text) to authenticated;

drop policy if exists "leave requests read via form" on leave_requests;
create policy "leave requests read via form" on leave_requests for select to authenticated
  using (app_can_view_leave_unpaid(id));


-- ---------------------------------------------------------------------------
-- migrate_phase38_my_personal_info.sql
-- ---------------------------------------------------------------------------

-- =============================================================================
-- Shantahl HRIS — employees edit their own Personal Information (201 file)
--
--   set_my_personal_info(info): the signed-in employee updates the Personal
--   Information part of their own 201 file — name, nickname, gender,
--   birthdate, civil status, nationality, address, contact number, email and
--   emergency contact. Nothing else (employment, pay, government IDs, roles)
--   can be changed this way. Each change is written to the audit trail with
--   the old and new values.
--
-- Safe to run any time, and safe to re-run.
-- Run once in the SQL Editor (Database > SQL Editor).
-- =============================================================================

create or replace function set_my_personal_info(info jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me text := app_current_employee_id();
  old employees%rowtype;
  v_first text := btrim(coalesce(info->>'first_name', ''));
  v_last text := btrim(coalesce(info->>'last_name', ''));
  v_middle text := nullif(btrim(coalesce(info->>'middle_name', '')), '');
  v_nick text := btrim(coalesce(info->>'nickname', ''));
  v_gender text := info->>'gender';
  v_birth date;
  v_civil text := nullif(info->>'civil_status', '');
  v_nat text := nullif(btrim(coalesce(info->>'nationality', '')), '');
  v_addr text := nullif(btrim(coalesce(info->>'address', '')), '');
  v_phone text := nullif(btrim(coalesce(info->>'contact_number', '')), '');
  v_email text := nullif(lower(btrim(coalesce(info->>'email', ''))), '');
  v_ec_name text := nullif(btrim(coalesce(info->>'emergency_contact_name', '')), '');
  v_ec_phone text := nullif(btrim(coalesce(info->>'emergency_contact_phone', '')), '');
  changes text[] := '{}';
  before_vals text[] := '{}';
  after_vals text[] := '{}';
begin
  if me is null then
    raise exception 'Not signed in as an employee.';
  end if;
  select * into old from employees where id = me for update;

  begin
    v_birth := nullif(info->>'birthdate', '')::date;
  exception when others then
    raise exception 'Enter a valid birthdate.';
  end;
  if v_first = '' or v_last = '' then
    raise exception 'Enter your first and last name.';
  end if;
  if v_gender not in ('Male', 'Female') then
    raise exception 'Choose your gender.';
  end if;
  if v_civil is not null and v_civil not in ('Single', 'Married', 'Widowed', 'Separated') then
    raise exception 'Choose a civil status.';
  end if;
  if v_birth is not null and (v_birth > current_date or v_birth < date '1900-01-01') then
    raise exception 'Enter a valid birthdate.';
  end if;
  if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Enter a valid email address.';
  end if;
  if v_email is not null and exists (select 1 from employees where lower(email) = v_email and id <> me) then
    raise exception 'That email is already used by another employee.';
  end if;
  if greatest(char_length(v_first), char_length(v_last), char_length(coalesce(v_middle, '')), char_length(v_nick)) > 80
     or char_length(coalesce(v_addr, '')) > 300 or char_length(coalesce(v_nat, '')) > 60
     or greatest(char_length(coalesce(v_phone, '')), char_length(coalesce(v_ec_phone, ''))) > 40
     or char_length(coalesce(v_ec_name, '')) > 120 or char_length(coalesce(v_email, '')) > 120 then
    raise exception 'One of the entries is too long.';
  end if;

  -- What changed, for the audit trail.
  if old.first_name is distinct from v_first then changes := array_append(changes, 'First name'); before_vals := array_append(before_vals, coalesce(old.first_name, '')); after_vals := array_append(after_vals, v_first); end if;
  if old.last_name is distinct from v_last then changes := array_append(changes, 'Last name'); before_vals := array_append(before_vals, coalesce(old.last_name, '')); after_vals := array_append(after_vals, v_last); end if;
  if old.middle_name is distinct from v_middle then changes := array_append(changes, 'Middle name'); before_vals := array_append(before_vals, coalesce(old.middle_name, '')); after_vals := array_append(after_vals, coalesce(v_middle, '')); end if;
  if old.nickname is distinct from v_nick then changes := array_append(changes, 'Nickname'); before_vals := array_append(before_vals, coalesce(old.nickname, '')); after_vals := array_append(after_vals, v_nick); end if;
  if old.gender is distinct from v_gender then changes := array_append(changes, 'Gender'); before_vals := array_append(before_vals, coalesce(old.gender, '')); after_vals := array_append(after_vals, v_gender); end if;
  if old.birthdate is distinct from v_birth then changes := array_append(changes, 'Birthdate'); before_vals := array_append(before_vals, coalesce(old.birthdate::text, '')); after_vals := array_append(after_vals, coalesce(v_birth::text, '')); end if;
  if old.civil_status is distinct from v_civil then changes := array_append(changes, 'Civil status'); before_vals := array_append(before_vals, coalesce(old.civil_status, '')); after_vals := array_append(after_vals, coalesce(v_civil, '')); end if;
  if old.nationality is distinct from v_nat then changes := array_append(changes, 'Nationality'); before_vals := array_append(before_vals, coalesce(old.nationality, '')); after_vals := array_append(after_vals, coalesce(v_nat, '')); end if;
  if old.address is distinct from v_addr then changes := array_append(changes, 'Address'); before_vals := array_append(before_vals, coalesce(old.address, '')); after_vals := array_append(after_vals, coalesce(v_addr, '')); end if;
  if old.contact_number is distinct from v_phone then changes := array_append(changes, 'Contact number'); before_vals := array_append(before_vals, coalesce(old.contact_number, '')); after_vals := array_append(after_vals, coalesce(v_phone, '')); end if;
  if lower(coalesce(old.email, '')) is distinct from coalesce(v_email, '') then changes := array_append(changes, 'Email'); before_vals := array_append(before_vals, coalesce(old.email, '')); after_vals := array_append(after_vals, coalesce(v_email, '')); end if;
  if old.emergency_contact_name is distinct from v_ec_name then changes := array_append(changes, 'Emergency contact'); before_vals := array_append(before_vals, coalesce(old.emergency_contact_name, '')); after_vals := array_append(after_vals, coalesce(v_ec_name, '')); end if;
  if old.emergency_contact_phone is distinct from v_ec_phone then changes := array_append(changes, 'Emergency contact number'); before_vals := array_append(before_vals, coalesce(old.emergency_contact_phone, '')); after_vals := array_append(after_vals, coalesce(v_ec_phone, '')); end if;

  if cardinality(changes) = 0 then
    return;
  end if;

  update employees
     set first_name = v_first, last_name = v_last, middle_name = v_middle, nickname = v_nick, gender = v_gender,
         birthdate = v_birth, civil_status = v_civil, nationality = v_nat, address = v_addr, contact_number = v_phone,
         email = case when lower(coalesce(old.email, '')) = coalesce(v_email, '') then old.email else v_email end,
         emergency_contact_name = v_ec_name, emergency_contact_phone = v_ec_phone
   where id = me;

  insert into audit_logs (actor_employee_id, actor_name, module, action, description, previous_value, new_value)
  values (me, trim(both ' ' from v_first || ' ' || v_last), 'Employees', 'update',
          'Updated own personal information: ' || array_to_string(changes, ', '),
          array_to_string(before_vals, ' | '), array_to_string(after_vals, ' | '));
end;
$$;

revoke all on function set_my_personal_info(jsonb) from public, anon;
grant execute on function set_my_personal_info(jsonb) to authenticated;


-- ---------------------------------------------------------------------------
-- migrate_phase39_leave_credit_adjustments.sql
-- ---------------------------------------------------------------------------

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


-- ---------------------------------------------------------------------------
-- migrate_phase40_branch_approver.sql
-- ---------------------------------------------------------------------------

-- =============================================================================
-- Shantahl HRIS — branch approver on leave, overtime and attendance
-- correction forms
--
--   * branches.approver_id: the branch's approver (e.g. Manila: Mary Jane
--     Pedrano). For an employee of that branch, a form now goes:
--     employee → branch approver → department head (supervisor) → HR.
--     The step is skipped when the employee is the approver themself, or the
--     approver is already their supervisor.
--   * Each form keeps who the branch approver was (branch_approver_id /
--     branch_approver) and their decision and signature
--     (<forms|ot|corr>/<request id>/branch.png in the leave-forms bucket).
--   * form_branch_decide(kind, request, decision, reason): the branch
--     approver approves (the form goes on to the department head) or
--     disapproves (the request is rejected and the form ends there).
--   * The department head can only decide once the branch approver has
--     approved. An overtime form returned by HR for clarification goes back
--     to the branch approver first.
--
-- Needs migrate_phase27, phase28, phase36 and phase37.
-- Safe to run any time, and safe to re-run.
-- Run once in the SQL Editor (Database > SQL Editor).
-- =============================================================================

alter table branches add column if not exists approver_id text references employees (id) on delete set null;

alter table leave_forms add column if not exists branch_approver_id text references employees (id) on delete set null;
alter table leave_forms add column if not exists branch_approver text not null default '';
alter table leave_forms add column if not exists branch_decision text check (branch_decision in ('approved', 'disapproved'));
alter table leave_forms add column if not exists branch_reason text;
alter table leave_forms add column if not exists branch_signed_name text;
alter table leave_forms add column if not exists branch_signed_at timestamptz;

alter table overtime_forms add column if not exists branch_approver_id text references employees (id) on delete set null;
alter table overtime_forms add column if not exists branch_approver text not null default '';
alter table overtime_forms add column if not exists branch_decision text check (branch_decision in ('approved', 'disapproved'));
alter table overtime_forms add column if not exists branch_reason text;
alter table overtime_forms add column if not exists branch_signed_name text;
alter table overtime_forms add column if not exists branch_signed_at timestamptz;

alter table correction_forms add column if not exists branch_approver_id text references employees (id) on delete set null;
alter table correction_forms add column if not exists branch_approver text not null default '';
alter table correction_forms add column if not exists branch_decision text check (branch_decision in ('approved', 'disapproved'));
alter table correction_forms add column if not exists branch_reason text;
alter table correction_forms add column if not exists branch_signed_name text;
alter table correction_forms add column if not exists branch_signed_at timestamptz;

-- On a new form: who the branch approver is (if any), and nothing decided.
create or replace function app_fill_form_branch()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  appr text;
  sup text;
begin
  select b.approver_id, e.supervisor_id into appr, sup
    from employees e left join branches b on b.id = e.branch_id
   where e.id = new.employee_id;
  if appr is null or appr = new.employee_id or appr = sup then
    new.branch_approver_id := null;
    new.branch_approver := '';
  else
    new.branch_approver_id := appr;
    new.branch_approver := coalesce((select trim(both ' ' from coalesce(first_name, '') || ' ' || coalesce(last_name, '')) from employees where id = appr), '');
  end if;
  new.branch_decision := null;
  new.branch_reason := null;
  new.branch_signed_name := null;
  new.branch_signed_at := null;
  return new;
end;
$$;

drop trigger if exists leave_forms_branch on leave_forms;
create trigger leave_forms_branch before insert on leave_forms for each row execute function app_fill_form_branch();
drop trigger if exists overtime_forms_branch on overtime_forms;
create trigger overtime_forms_branch before insert on overtime_forms for each row execute function app_fill_form_branch();
drop trigger if exists correction_forms_branch on correction_forms;
create trigger correction_forms_branch before insert on correction_forms for each row execute function app_fill_form_branch();

-- The department head decides only after the branch approver has approved;
-- an overtime form resubmitted after HR returned it goes back to the branch
-- approver.
create or replace function app_guard_form_branch()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.branch_approver_id is not null and new.head_decision is not null and old.head_decision is null
     and new.branch_decision is distinct from 'approved' then
    raise exception 'Waiting for the branch approver (%) first.', new.branch_approver;
  end if;
  return new;
end;
$$;

drop trigger if exists leave_forms_branch_guard on leave_forms;
create trigger leave_forms_branch_guard before update on leave_forms for each row execute function app_guard_form_branch();
drop trigger if exists correction_forms_branch_guard on correction_forms;
create trigger correction_forms_branch_guard before update on correction_forms for each row execute function app_guard_form_branch();

create or replace function app_guard_ot_form_branch()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Resubmitted after "returned for clarification": back to the branch approver.
  if old.hr_decision = 'returned' and new.hr_decision is null and new.branch_approver_id is not null then
    new.branch_decision := null;
    new.branch_reason := null;
    new.branch_signed_name := null;
    new.branch_signed_at := null;
  end if;
  if new.branch_approver_id is not null and new.head_decision is not null and old.head_decision is null
     and new.branch_decision is distinct from 'approved' then
    raise exception 'Waiting for the branch approver (%) first.', new.branch_approver;
  end if;
  return new;
end;
$$;

drop trigger if exists overtime_forms_branch_guard on overtime_forms;
create trigger overtime_forms_branch_guard before update on overtime_forms for each row execute function app_guard_ot_form_branch();

-- Is the signed-in employee the branch approver of this form?
create or replace function app_is_form_branch_approver(kind text, req_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case kind
    when 'leave' then exists (select 1 from leave_forms f where f.leave_request_id = req_id and f.branch_approver_id = app_current_employee_id())
    when 'ot' then exists (select 1 from overtime_forms f where f.overtime_request_id = req_id and f.branch_approver_id = app_current_employee_id())
    when 'corr' then exists (select 1 from correction_forms f where f.correction_request_id = req_id and f.branch_approver_id = app_current_employee_id())
    else false
  end;
$$;

revoke all on function app_is_form_branch_approver(text, text) from public, anon;
grant execute on function app_is_form_branch_approver(text, text) to authenticated;

-- Who can see a form: as before, plus its branch approver.
create or replace function app_can_view_leave_form(req_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from leave_requests r
    where r.id = req_id
      and (r.employee_id = app_current_employee_id() or app_is_supervisor_of(r.employee_id) or app_is_elevated())
  ) or app_is_form_branch_approver('leave', req_id);
$$;

create or replace function app_can_view_overtime_form(req_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from overtime_requests r
    where r.id = req_id
      and (r.employee_id = app_current_employee_id() or app_is_supervisor_of(r.employee_id) or app_is_elevated())
  ) or app_is_form_branch_approver('ot', req_id);
$$;

create or replace function app_can_view_correction_form(req_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from attendance_correction_requests r
    where r.id = req_id
      and (r.employee_id = app_current_employee_id() or app_is_supervisor_of(r.employee_id) or app_is_elevated())
  ) or app_is_form_branch_approver('corr', req_id);
$$;

-- The branch approver can see the requests behind their forms.
drop policy if exists "leave requests read branch approver" on leave_requests;
create policy "leave requests read branch approver" on leave_requests for select to authenticated
  using (app_is_form_branch_approver('leave', id));
drop policy if exists "overtime requests read branch approver" on overtime_requests;
create policy "overtime requests read branch approver" on overtime_requests for select to authenticated
  using (app_is_form_branch_approver('ot', id));
drop policy if exists "correction requests read branch approver" on attendance_correction_requests;
create policy "correction requests read branch approver" on attendance_correction_requests for select to authenticated
  using (app_is_form_branch_approver('corr', id));

-- The branch approver's decision.
create or replace function form_branch_decide(p_kind text, p_request text, p_decision text, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me text := app_current_employee_id();
  appr text;
  dec text;
  unpaid text;
  folder text;
  nm text;
  note text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if me is null then
    raise exception 'Not signed in as an employee.';
  end if;
  if p_kind = 'leave' then
    select branch_approver_id, branch_decision, unpaid_request_id into appr, dec, unpaid from leave_forms where leave_request_id = p_request for update;
    folder := 'forms/';
  elsif p_kind = 'ot' then
    select branch_approver_id, branch_decision into appr, dec from overtime_forms where overtime_request_id = p_request for update;
    folder := 'ot/';
  elsif p_kind = 'corr' then
    select branch_approver_id, branch_decision into appr, dec from correction_forms where correction_request_id = p_request for update;
    folder := 'corr/';
  else
    raise exception 'Unknown form.';
  end if;
  if appr is null or appr is distinct from me then
    raise exception 'Only the branch approver can approve this form.';
  end if;
  if dec is not null then
    raise exception 'This form was already approved or disapproved by the branch approver.';
  end if;
  if p_decision not in ('approved', 'disapproved') then
    raise exception 'Choose Approved or Disapproved.';
  end if;
  if p_decision = 'disapproved' and note is null then
    raise exception 'Give the reason for disapproving.';
  end if;
  if char_length(coalesce(note, '')) > 500 then
    raise exception 'That reason is too long.';
  end if;
  if not app_leave_form_file_exists(folder || p_request || '/branch.png') then
    raise exception 'Attach your signature first.';
  end if;
  select trim(both ' ' from coalesce(first_name, '') || ' ' || coalesce(last_name, '')) into nm from employees where id = me;
  if p_kind = 'leave' then
    update leave_forms set branch_decision = p_decision, branch_reason = note, branch_signed_name = nm, branch_signed_at = now() where leave_request_id = p_request;
    if p_decision = 'disapproved' then
      update leave_requests set status = 'rejected', decided_by = me, decided_at = now(), decision_note = note where id in (p_request, unpaid);
    end if;
  elsif p_kind = 'ot' then
    update overtime_forms set branch_decision = p_decision, branch_reason = note, branch_signed_name = nm, branch_signed_at = now() where overtime_request_id = p_request;
    if p_decision = 'disapproved' then
      update overtime_requests set status = 'rejected', decided_by = me, decided_at = now(), decision_note = note where id = p_request;
    end if;
  else
    update correction_forms set branch_decision = p_decision, branch_reason = note, branch_signed_name = nm, branch_signed_at = now() where correction_request_id = p_request;
    if p_decision = 'disapproved' then
      update attendance_correction_requests set status = 'rejected', decided_by = me, decided_at = now(), decision_note = note where id = p_request;
    end if;
  end if;
end;
$$;

revoke all on function form_branch_decide(text, text, text, text) from public, anon;
grant execute on function form_branch_decide(text, text, text, text) to authenticated;

-- The branch approver's signature on a form, while their step is open.
create or replace function app_can_sign_form_branch(path text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when path ~ '^forms/[^/]+/branch\.png$' then exists (select 1 from leave_forms f where f.leave_request_id = split_part(path, '/', 2) and f.branch_approver_id = app_current_employee_id() and f.branch_decision is null)
    when path ~ '^ot/[^/]+/branch\.png$' then exists (select 1 from overtime_forms f where f.overtime_request_id = split_part(path, '/', 2) and f.branch_approver_id = app_current_employee_id() and f.branch_decision is null)
    when path ~ '^corr/[^/]+/branch\.png$' then exists (select 1 from correction_forms f where f.correction_request_id = split_part(path, '/', 2) and f.branch_approver_id = app_current_employee_id() and f.branch_decision is null)
    else false
  end;
$$;

revoke all on function app_can_sign_form_branch(text) from public, anon;
grant execute on function app_can_sign_form_branch(text) to authenticated;

drop policy if exists "form branch sign" on storage.objects;
create policy "form branch sign" on storage.objects for insert to authenticated
  with check (bucket_id = 'leave-forms' and app_can_sign_form_branch(name));
drop policy if exists "form branch re-sign" on storage.objects;
create policy "form branch re-sign" on storage.objects for update to authenticated
  using (bucket_id = 'leave-forms' and app_can_sign_form_branch(name))
  with check (bucket_id = 'leave-forms' and app_can_sign_form_branch(name));


-- ---------------------------------------------------------------------------
-- migrate_phase41_travel_allowance.sql
-- ---------------------------------------------------------------------------

-- =============================================================================
-- Shantahl HRIS — Travel Allowance Request
--
--   * travel_allowance_requests: the employee files the driver's name, the
--     date, the destination and whether there's an allowance (₱500), and
--     signs; the database fills in their name, position, department,
--     branch and approver (their supervisor — or HR when there's none).
--   * The approver approves or disapproves and signs
--     (travel_allowance_decide); then the HR Manager signs it as received
--     (travel_allowance_receive).
--   * Signatures: copies of each signer's saved signature in the
--     leave-forms bucket, travel/<employee id>/<request id>/applicant|head|hr.png.
--   * Seen by the employee, their supervisor and company-wide roles.
--
-- Needs migrate_phase27_leave_forms.sql.
-- Safe to run any time, and safe to re-run.
-- Run once in the SQL Editor (Database > SQL Editor).
-- =============================================================================

create table if not exists travel_allowance_requests (
  id text primary key,
  employee_id text not null references employees (id) on delete cascade,
  travel_date date not null,
  driver_name text not null check (char_length(btrim(driver_name)) between 1 and 120),
  driver_employee_id text references employees (id) on delete set null,
  destination text not null check (char_length(btrim(destination)) between 1 and 300),
  with_allowance boolean not null,
  amount numeric(10, 2) not null default 0,
  employee_name text not null default '',
  position text not null default '',
  department text not null default '',
  branch text not null default '',
  approver_id text references employees (id) on delete set null,
  approver_name text not null default '',
  submitted_at timestamptz not null default now(),
  head_decision text check (head_decision in ('approved', 'disapproved')),
  head_reason text,
  head_signed_by text references employees (id) on delete set null,
  head_signed_name text,
  head_signed_at timestamptz,
  received_by text references employees (id) on delete set null,
  received_name text,
  received_at timestamptz
);

create index if not exists travel_allowance_employee_idx on travel_allowance_requests (employee_id, travel_date);

create or replace function app_fill_travel_allowance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  e employees%rowtype;
begin
  select * into e from employees where id = new.employee_id;
  new.employee_name := trim(both ' ' from coalesce(e.first_name, '') || ' ' || coalesce(e.last_name, ''));
  new.position := coalesce((select title from positions where id = e.position_id), '');
  new.department := coalesce((select name from departments where id = e.department_id), '');
  new.branch := coalesce((select name from branches where id = e.branch_id), '');
  new.approver_id := e.supervisor_id;
  new.approver_name := coalesce((select trim(both ' ' from coalesce(s.first_name, '') || ' ' || coalesce(s.last_name, '')) from employees s where s.id = e.supervisor_id), '');
  new.driver_name := btrim(new.driver_name);
  new.destination := btrim(new.destination);
  new.amount := case when new.with_allowance then 500 else 0 end;
  new.submitted_at := now();
  new.head_decision := null;
  new.head_reason := null;
  new.head_signed_by := null;
  new.head_signed_name := null;
  new.head_signed_at := null;
  new.received_by := null;
  new.received_name := null;
  new.received_at := null;
  return new;
end;
$$;

drop trigger if exists travel_allowance_fill on travel_allowance_requests;
create trigger travel_allowance_fill
  before insert on travel_allowance_requests
  for each row execute function app_fill_travel_allowance();

-- Who may approve: the employee's supervisor, or the HR Manager when the
-- employee has none. Never one's own.
create or replace function app_travel_head_can(req_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from travel_allowance_requests t join employees e on e.id = t.employee_id
    where t.id = req_id
      and t.employee_id <> coalesce(app_current_employee_id(), '')
      and (e.supervisor_id = app_current_employee_id() or (e.supervisor_id is null and app_is_hr_manager()))
  );
$$;

revoke all on function app_travel_head_can(text) from public, anon;
grant execute on function app_travel_head_can(text) to authenticated;

alter table travel_allowance_requests enable row level security;

drop policy if exists "travel allowance read" on travel_allowance_requests;
create policy "travel allowance read" on travel_allowance_requests for select to authenticated
  using (employee_id = app_current_employee_id() or app_is_supervisor_of(employee_id) or app_is_elevated());
drop policy if exists "travel allowance file" on travel_allowance_requests;
create policy "travel allowance file" on travel_allowance_requests for insert to authenticated
  with check (
    employee_id = app_current_employee_id()
    and app_leave_form_file_exists('travel/' || employee_id || '/' || id || '/applicant.png')
  );
drop policy if exists "travel allowance delete hr" on travel_allowance_requests;
create policy "travel allowance delete hr" on travel_allowance_requests for delete to authenticated
  using (app_is_hr_manager());

create or replace function travel_allowance_decide(p_id text, p_decision text, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me text := app_current_employee_id();
  t travel_allowance_requests%rowtype;
  nm text;
  note text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if me is null then
    raise exception 'Not signed in as an employee.';
  end if;
  select * into t from travel_allowance_requests where id = p_id for update;
  if not found then
    raise exception 'Travel allowance request not found.';
  end if;
  if not app_travel_head_can(p_id) then
    raise exception 'Only the employee''s supervisor can approve this request.';
  end if;
  if t.head_decision is not null then
    raise exception 'This request was already approved or disapproved.';
  end if;
  if p_decision not in ('approved', 'disapproved') then
    raise exception 'Choose Approved or Disapproved.';
  end if;
  if p_decision = 'disapproved' and note is null then
    raise exception 'Give the reason for disapproving.';
  end if;
  if char_length(coalesce(note, '')) > 500 then
    raise exception 'That reason is too long.';
  end if;
  if not app_leave_form_file_exists('travel/' || t.employee_id || '/' || p_id || '/head.png') then
    raise exception 'Attach your signature first.';
  end if;
  select trim(both ' ' from coalesce(first_name, '') || ' ' || coalesce(last_name, '')) into nm from employees where id = me;
  update travel_allowance_requests
     set head_decision = p_decision, head_reason = note, head_signed_by = me, head_signed_name = nm, head_signed_at = now()
   where id = p_id;
end;
$$;

revoke all on function travel_allowance_decide(text, text, text) from public, anon;
grant execute on function travel_allowance_decide(text, text, text) to authenticated;

create or replace function travel_allowance_receive(p_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me text := app_current_employee_id();
  t travel_allowance_requests%rowtype;
  nm text;
begin
  if me is null or not app_is_hr_manager() then
    raise exception 'Only the HR Manager can receive travel allowance requests.';
  end if;
  select * into t from travel_allowance_requests where id = p_id for update;
  if not found then
    raise exception 'Travel allowance request not found.';
  end if;
  if t.head_decision is null then
    raise exception 'The approver hasn''t approved or disapproved it yet.';
  end if;
  if t.received_at is not null then
    raise exception 'This request was already received.';
  end if;
  if not app_leave_form_file_exists('travel/' || t.employee_id || '/' || p_id || '/hr.png') then
    raise exception 'Attach your signature first.';
  end if;
  select trim(both ' ' from coalesce(first_name, '') || ' ' || coalesce(last_name, '')) into nm from employees where id = me;
  update travel_allowance_requests set received_by = me, received_name = nm, received_at = now() where id = p_id;
end;
$$;

revoke all on function travel_allowance_receive(text) from public, anon;
grant execute on function travel_allowance_receive(text) to authenticated;

-- Signatures: travel/<employee id>/<request id>/<applicant|head|hr>.png.
create or replace function app_can_sign_travel(path text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when path ~ '^travel/[^/]+/[^/]+/applicant\.png$' then
      split_part(path, '/', 2) = app_current_employee_id()
      and not exists (select 1 from travel_allowance_requests t where t.id = split_part(path, '/', 3))
    when path ~ '^travel/[^/]+/[^/]+/head\.png$' then app_travel_head_can(split_part(path, '/', 3))
      and exists (select 1 from travel_allowance_requests t where t.id = split_part(path, '/', 3) and t.employee_id = split_part(path, '/', 2) and t.head_decision is null)
    when path ~ '^travel/[^/]+/[^/]+/hr\.png$' then app_is_hr_manager()
      and exists (select 1 from travel_allowance_requests t where t.id = split_part(path, '/', 3) and t.employee_id = split_part(path, '/', 2) and t.head_decision is not null and t.received_at is null)
    else false
  end;
$$;

revoke all on function app_can_sign_travel(text) from public, anon;
grant execute on function app_can_sign_travel(text) to authenticated;

drop policy if exists "travel signatures read" on storage.objects;
create policy "travel signatures read" on storage.objects for select to authenticated
  using (bucket_id = 'leave-forms' and name like 'travel/%'
         and (split_part(name, '/', 2) = app_current_employee_id() or app_is_supervisor_of(split_part(name, '/', 2)) or app_is_elevated()));
drop policy if exists "travel sign" on storage.objects;
create policy "travel sign" on storage.objects for insert to authenticated
  with check (bucket_id = 'leave-forms' and app_can_sign_travel(name));
drop policy if exists "travel re-sign" on storage.objects;
create policy "travel re-sign" on storage.objects for update to authenticated
  using (bucket_id = 'leave-forms' and app_can_sign_travel(name))
  with check (bucket_id = 'leave-forms' and app_can_sign_travel(name));
drop policy if exists "travel files delete hr" on storage.objects;
create policy "travel files delete hr" on storage.objects for delete to authenticated
  using (bucket_id = 'leave-forms' and name like 'travel/%' and app_is_hr_manager());


-- ---------------------------------------------------------------------------
-- migrate_phase42_payroll_encoded.sql
-- ---------------------------------------------------------------------------

-- =============================================================================
-- Shantahl HRIS — "encoded in payroll" check on requests
--
--   payroll_encoded: HR ticks a leave, overtime or attendance correction
--   request once it has been encoded in payroll (kind = 'leave' | 'ot' |
--   'corr'). Who ticked it and when are kept. HR and payroll can tick and
--   untick; company-wide roles can see the ticks.
--
-- Safe to run any time, and safe to re-run.
-- Run once in the SQL Editor (Database > SQL Editor).
-- =============================================================================

create table if not exists payroll_encoded (
  kind text not null check (kind in ('leave', 'ot', 'corr')),
  request_id text not null,
  encoded_by text references employees (id) on delete set null,
  encoded_by_name text not null default '',
  encoded_at timestamptz not null default now(),
  primary key (kind, request_id)
);

alter table payroll_encoded enable row level security;

drop policy if exists "payroll encoded read" on payroll_encoded;
create policy "payroll encoded read" on payroll_encoded for select to authenticated
  using (app_is_elevated());
drop policy if exists "payroll encoded tick" on payroll_encoded;
create policy "payroll encoded tick" on payroll_encoded for insert to authenticated
  with check (app_has_any_role(array['hr_admin', 'payroll_officer']::app_role[]) and encoded_by = app_current_employee_id());
drop policy if exists "payroll encoded untick" on payroll_encoded;
create policy "payroll encoded untick" on payroll_encoded for delete to authenticated
  using (app_has_any_role(array['hr_admin', 'payroll_officer']::app_role[]));


-- ---------------------------------------------------------------------------

-- Phase 44: "If found, please return to" on the employee ID
alter table employees add column if not exists id_return_name text;
alter table employees add column if not exists id_return_address text;

create or replace function set_employee_id_return(emp_id text, return_name text, return_address text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if emp_id is distinct from app_current_employee_id() and not app_is_hr_or_admin() then
    raise exception 'You can only change your own ID card.';
  end if;
  update employees
     set id_return_name = nullif(btrim(left(return_name, 120)), ''),
         id_return_address = nullif(btrim(left(return_address, 300)), '')
   where id = emp_id;
end;
$$;

revoke all on function set_employee_id_return(text, text, text) from public, anon;
grant execute on function set_employee_id_return(text, text, text) to authenticated;

-- Phase 45: files in Chat with HR
alter table hr_messages add column if not exists file_path text;
alter table hr_messages add column if not exists file_name text;
alter table hr_messages add column if not exists file_removed_at timestamptz;

alter table hr_messages drop constraint if exists hr_messages_body_check;
alter table hr_messages add constraint hr_messages_body_check
  check (char_length(body) <= 2000 and (char_length(btrim(body)) >= 1 or image_path is not null or image_removed_at is not null
    or file_path is not null or file_removed_at is not null));

create or replace function app_fill_hr_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.sender_employee_id := app_current_employee_id();
  new.from_hr := app_is_hr_manager() and new.employee_id is distinct from new.sender_employee_id;
  select trim(both ' ' from coalesce(e.first_name, '') || ' ' || coalesce(e.last_name, ''))
    into new.sender_name
    from employees e where e.id = new.sender_employee_id;
  new.sender_name := coalesce(new.sender_name, '');
  if new.image_path is not null and split_part(new.image_path, '/', 1) is distinct from new.employee_id then
    raise exception 'Photo does not belong to this conversation.';
  end if;
  if new.file_path is not null and split_part(new.file_path, '/', 1) is distinct from new.employee_id then
    raise exception 'File does not belong to this conversation.';
  end if;
  new.file_name := case when new.file_path is null then null else left(coalesce(nullif(btrim(new.file_name), ''), 'file'), 200) end;
  new.image_removed_at := null;
  new.file_removed_at := null;
  new.created_at := now();
  new.read_at := null;
  return new;
end;
$$;

-- Chat files: private bucket, one folder per conversation (employee id).
-- The employee and HR can view and upload in that conversation's folder.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('hr-chat-files', 'hr-chat-files', false, 10485760, null)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "hr chat files read" on storage.objects;
create policy "hr chat files read" on storage.objects for select to authenticated
  using (bucket_id = 'hr-chat-files' and ((storage.foldername(name))[1] = app_current_employee_id() or app_is_hr_manager()));

drop policy if exists "hr chat files upload" on storage.objects;
create policy "hr chat files upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'hr-chat-files' and ((storage.foldername(name))[1] = app_current_employee_id() or app_is_hr_manager()));

-- For the cleanup job only: chat files older than the cut-off.
create or replace function hr_chat_expired_files(older_than timestamptz)
returns setof text
language sql
stable
security definer
set search_path = public, storage
as $$
  select name from storage.objects
   where bucket_id = 'hr-chat-files' and created_at < older_than
   order by created_at
   limit 1000;
$$;

revoke all on function hr_chat_expired_files(timestamptz) from public, anon, authenticated;
grant execute on function hr_chat_expired_files(timestamptz) to service_role;

-- Phase 46: biometrics import
create table if not exists biometric_links (
  branch_id text not null,
  device_key text not null,
  device_name text not null default '',
  employee_id text not null references employees (id) on delete cascade,
  updated_at timestamptz not null default now(),
  primary key (branch_id, device_key)
);

alter table biometric_links enable row level security;

drop policy if exists "biometric links hr" on biometric_links;
create policy "biometric links hr" on biometric_links for all to authenticated
  using (app_has_any_role(array['hr_admin', 'payroll_officer']::app_role[]))
  with check (app_has_any_role(array['hr_admin', 'payroll_officer']::app_role[]));

alter table attendance_period_records add column if not exists missing_punches jsonb;

-- Phase 47: approved attendance corrections update biometrics attendance
alter table attendance_period_records add column if not exists biometric_detail jsonb;

-- Phase 48: branches import their own biometrics attendance
create table if not exists attendance_importers (
  employee_id text not null references employees (id) on delete cascade,
  branch_id text not null references branches (id) on delete cascade,
  primary key (employee_id, branch_id)
);

alter table attendance_importers enable row level security;

drop policy if exists "attendance importers read" on attendance_importers;
create policy "attendance importers read" on attendance_importers for select to authenticated
  using (employee_id = app_current_employee_id() or app_has_any_role(array['hr_admin', 'payroll_officer']::app_role[]));
drop policy if exists "attendance importers hr" on attendance_importers;
create policy "attendance importers hr" on attendance_importers for all to authenticated
  using (app_has_any_role(array['hr_admin']::app_role[]))
  with check (app_has_any_role(array['hr_admin']::app_role[]));

create or replace function app_can_import_branch(p_branch text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_branch is not null and p_branch <> 'br-unassigned' and (
    app_has_any_role(array['hr_admin', 'payroll_officer']::app_role[])
    or exists (select 1 from branches b where b.id = p_branch and b.approver_id = app_current_employee_id())
    or exists (select 1 from attendance_importers i where i.branch_id = p_branch and i.employee_id = app_current_employee_id())
    or exists (
      select 1 from employees me
       where me.id = app_current_employee_id() and me.branch_id = p_branch
         and (
           exists (select 1 from employees e where e.supervisor_id = me.id and e.branch_id = p_branch and e.status in ('active', 'on_leave'))
           or not exists (select 1 from employees o where o.branch_id = p_branch and o.id <> me.id and o.status in ('active', 'on_leave'))
         )
    )
  );
$$;

revoke all on function app_can_import_branch(text) from public, anon;
grant execute on function app_can_import_branch(text) to authenticated;

drop policy if exists "biometric links hr" on biometric_links;
drop policy if exists "biometric links branch" on biometric_links;
create policy "biometric links branch" on biometric_links for all to authenticated
  using (app_can_import_branch(branch_id))
  with check (app_can_import_branch(branch_id));

create or replace function import_branch_attendance(p_period text, p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r jsonb;
  emp_branch text;
  me text := app_current_employee_id();
  my_name text;
  n integer := 0;
begin
  if me is null then
    raise exception 'Not signed in as an employee.';
  end if;
  if not exists (select 1 from payroll_periods where id = p_period and status = 'open') then
    raise exception 'This cut-off is locked or closed — its attendance can''t be changed.';
  end if;
  select trim(both ' ' from coalesce(first_name, '') || ' ' || coalesce(last_name, '')) into my_name from employees where id = me;
  for r in select * from jsonb_array_elements(p_rows) loop
    select branch_id into emp_branch from employees where id = r->>'employee_id';
    if emp_branch is null or not app_can_import_branch(emp_branch) then
      raise exception 'You can only import attendance for your own branch.';
    end if;
    insert into attendance_period_records (
      period_id, employee_id, days_worked, holiday_days, sl_days, vl_days, late_minutes, undertime_minutes, notes, source, updated_by, updated_at,
      late_instances, late_day_details, undertime_instances, undertime_day_details, half_day_instances, half_day_dates, absence_instances, absent_dates,
      missing_punches, biometric_detail
    ) values (
      p_period, r->>'employee_id',
      coalesce((r->>'days_worked')::numeric, 0), coalesce((r->>'holiday_days')::numeric, 0), coalesce((r->>'sl_days')::numeric, 0), coalesce((r->>'vl_days')::numeric, 0),
      coalesce((r->>'late_minutes')::numeric, 0), coalesce((r->>'undertime_minutes')::numeric, 0), left(coalesce(r->>'notes', ''), 500), 'import', coalesce(my_name, ''), now(),
      (r->>'late_instances')::integer, r->'late_day_details', (r->>'undertime_instances')::integer, r->'undertime_day_details',
      (r->>'half_day_instances')::integer, r->'half_day_dates', (r->>'absence_instances')::integer, r->'absent_dates',
      r->'missing_punches', r->'biometric_detail'
    )
    on conflict (period_id, employee_id) do update set
      days_worked = excluded.days_worked, holiday_days = excluded.holiday_days, sl_days = excluded.sl_days, vl_days = excluded.vl_days,
      late_minutes = excluded.late_minutes, undertime_minutes = excluded.undertime_minutes, notes = excluded.notes, source = excluded.source,
      updated_by = excluded.updated_by, updated_at = excluded.updated_at,
      late_instances = excluded.late_instances, late_day_details = excluded.late_day_details,
      undertime_instances = excluded.undertime_instances, undertime_day_details = excluded.undertime_day_details,
      half_day_instances = excluded.half_day_instances, half_day_dates = excluded.half_day_dates,
      absence_instances = excluded.absence_instances, absent_dates = excluded.absent_dates,
      missing_punches = excluded.missing_punches, biometric_detail = excluded.biometric_detail;
    n := n + 1;
  end loop;
  return n;
end;
$$;

revoke all on function import_branch_attendance(text, jsonb) from public, anon;
grant execute on function import_branch_attendance(text, jsonb) to authenticated;


-- Phase 49: named attendance importers take over their branch
create or replace function app_can_import_branch(p_branch text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_branch is not null and p_branch <> 'br-unassigned' and (
    app_has_any_role(array['hr_admin', 'payroll_officer']::app_role[])
    or exists (select 1 from branches b where b.id = p_branch and b.approver_id = app_current_employee_id())
    or exists (select 1 from attendance_importers i where i.branch_id = p_branch and i.employee_id = app_current_employee_id())
    or (
      not exists (select 1 from attendance_importers i where i.branch_id = p_branch)
      and exists (
        select 1 from employees me
         where me.id = app_current_employee_id() and me.branch_id = p_branch
           and (
             exists (select 1 from employees e where e.supervisor_id = me.id and e.branch_id = p_branch and e.status in ('active', 'on_leave'))
             or not exists (select 1 from employees o where o.branch_id = p_branch and o.id <> me.id and o.status in ('active', 'on_leave'))
           )
      )
    )
  );
$$;

revoke all on function app_can_import_branch(text) from public, anon;
grant execute on function app_can_import_branch(text) to authenticated;

-- Phase 50: remove the branch attendance upload (phases 48–49).
--
-- HR imports one consolidated biometrics file for all branches, so branch
-- staff no longer upload their branch's attendance:
--   * biometric_links is HR / payroll only again (as in phase 46);
--   * import_branch_attendance, app_can_import_branch and the
--     attendance_importers list are removed.
--
-- Safe to run any time, and safe to re-run.

drop policy if exists "biometric links branch" on biometric_links;
drop policy if exists "biometric links hr" on biometric_links;
create policy "biometric links hr" on biometric_links for all to authenticated
  using (app_has_any_role(array['hr_admin', 'payroll_officer']::app_role[]))
  with check (app_has_any_role(array['hr_admin', 'payroll_officer']::app_role[]));

drop function if exists import_branch_attendance(text, jsonb);
drop function if exists app_can_import_branch(text);
drop table if exists attendance_importers;

-- Phase 51: notices signed HR Manager → Department Manager → employee.
--
--   * A record with sign_flow (the generated Tardiness NTEs) is signed first
--     by the HR Manager, then by its Department Manager (manager_id), and only
--     then reaches the employee, who signs it as received.
--   * Signatures only go through discipline_sign(), which stamps the time;
--     the employee doesn't see the record until both have signed.
--   * notice_data: what the notice was generated from, so it can be printed
--     with the signatures on it.
--
-- Safe to run any time, and safe to re-run.

alter table disciplinary_records
  add column if not exists sign_flow boolean not null default false,
  add column if not exists notice_data jsonb,
  add column if not exists manager_id text references employees (id) on delete set null,
  add column if not exists hr_signer_id text references employees (id) on delete set null,
  add column if not exists hr_signed_at timestamptz,
  add column if not exists hr_signature_path text,
  add column if not exists manager_signed_at timestamptz,
  add column if not exists manager_signature_path text;

-- Read: as before, but the employee only once both have signed; and the
-- Department Manager of a record they sign.
drop policy if exists "discipline read" on disciplinary_records;
create policy "discipline read" on disciplinary_records for select to authenticated
  using (
    (app_can_view_discipline(employee_id)
      and (employee_id is distinct from app_current_employee_id() or not sign_flow or manager_signed_at is not null))
    or (manager_id is not null and manager_id = app_current_employee_id())
  );

create or replace function app_guard_discipline_response()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(current_setting('app.discipline_response', true), '') = 'on' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.acknowledged_at := null;
    new.ack_signature_path := null;
    new.explanation := null;
    new.explanation_file_path := null;
    new.explanation_file_name := null;
    new.explanation_submitted_at := null;
    new.hr_signer_id := null;
    new.hr_signed_at := null;
    new.hr_signature_path := null;
    new.manager_signed_at := null;
    new.manager_signature_path := null;
    return new;
  end if;
  if new.acknowledged_at is distinct from old.acknowledged_at
     or new.ack_signature_path is distinct from old.ack_signature_path
     or new.explanation is distinct from old.explanation
     or new.explanation_file_path is distinct from old.explanation_file_path
     or new.explanation_file_name is distinct from old.explanation_file_name
     or new.explanation_submitted_at is distinct from old.explanation_submitted_at then
    raise exception 'The employee''s acknowledgement and explanation can''t be changed.';
  end if;
  if new.hr_signer_id is distinct from old.hr_signer_id
     or new.hr_signed_at is distinct from old.hr_signed_at
     or new.hr_signature_path is distinct from old.hr_signature_path
     or new.manager_signed_at is distinct from old.manager_signed_at
     or new.manager_signature_path is distinct from old.manager_signature_path then
    raise exception 'Signatures can only be added by signing.';
  end if;
  if old.hr_signed_at is not null
     and (new.sign_flow is distinct from old.sign_flow or new.notice_data is distinct from old.notice_data or new.employee_id is distinct from old.employee_id) then
    raise exception 'The notice was already signed, so it can''t be changed.';
  end if;
  if old.manager_signed_at is not null and new.manager_id is distinct from old.manager_id then
    raise exception 'The Department Manager already signed.';
  end if;
  if old.acknowledged_at is not null
     and (new.notice_path is distinct from old.notice_path or new.notice_file_name is distinct from old.notice_file_name) then
    raise exception 'The notice was already acknowledged by the employee, so its file can''t be replaced.';
  end if;
  return new;
end;
$$;

-- HR Manager first, then the Department Manager.
create or replace function discipline_sign(record_id text, signature_path text)
returns disciplinary_records
language plpgsql
security definer
set search_path = public
as $$
declare
  r disciplinary_records;
  me text := app_current_employee_id();
begin
  select * into r from disciplinary_records where id = record_id for update;
  if r.id is null or not r.sign_flow then
    raise exception 'This notice doesn''t need signatures.';
  end if;
  if r.hr_signed_at is null then
    if not app_is_hr_manager() then
      raise exception 'The HR Manager signs this notice first.';
    end if;
    if signature_path is null or signature_path not like record_id || '/hrsign-%'
       or not exists (select 1 from storage.objects o where o.bucket_id = 'discipline-files' and o.name = signature_path) then
      raise exception 'Please sign before saving.';
    end if;
    perform set_config('app.discipline_response', 'on', true);
    update disciplinary_records set hr_signer_id = me, hr_signed_at = now(), hr_signature_path = signature_path where id = record_id returning * into r;
  elsif r.manager_signed_at is null then
    if r.manager_id is null or r.manager_id is distinct from me then
      raise exception 'Only the Department Manager named on this notice can sign it now.';
    end if;
    if signature_path is null or signature_path not like record_id || '/mgrsign-%'
       or not exists (select 1 from storage.objects o where o.bucket_id = 'discipline-files' and o.name = signature_path) then
      raise exception 'Please sign before saving.';
    end if;
    perform set_config('app.discipline_response', 'on', true);
    update disciplinary_records set manager_signed_at = now(), manager_signature_path = signature_path where id = record_id returning * into r;
  else
    raise exception 'This notice has already been signed.';
  end if;
  perform set_config('app.discipline_response', 'off', true);
  return r;
end;
$$;

revoke all on function discipline_sign(text, text) from public, anon;
grant execute on function discipline_sign(text, text) to authenticated;

-- The employee acknowledges only once both have signed.
create or replace function discipline_acknowledge(record_id text, signature_path text)
returns disciplinary_records
language plpgsql
security definer
set search_path = public
as $$
declare
  r disciplinary_records;
begin
  select * into r from disciplinary_records where id = record_id for update;
  if r.id is null or r.employee_id is distinct from app_current_employee_id() then
    raise exception 'This notice isn''t addressed to you.';
  end if;
  if r.sign_flow and r.manager_signed_at is null then
    raise exception 'This notice isn''t signed yet.';
  end if;
  if r.acknowledged_at is not null then
    raise exception 'You have already acknowledged this notice.';
  end if;
  if signature_path is null or signature_path not like record_id || '/ack-%'
     or not exists (select 1 from storage.objects o where o.bucket_id = 'discipline-files' and o.name = signature_path) then
    raise exception 'Please sign before acknowledging.';
  end if;
  perform set_config('app.discipline_response', 'on', true);
  update disciplinary_records
     set acknowledged_at = now(), ack_signature_path = signature_path
   where id = record_id
  returning * into r;
  perform set_config('app.discipline_response', 'off', true);
  return r;
end;
$$;

drop policy if exists "discipline files upload" on storage.objects;
create policy "discipline files upload" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'discipline-files'
    and exists (
      select 1 from disciplinary_records d
      where d.id = (storage.foldername(name))[1]
        and (
          (storage.filename(name) like 'notice-%' and d.acknowledged_at is null and app_can_manage_discipline(d.employee_id))
          or (storage.filename(name) like 'ack-%' and d.employee_id = app_current_employee_id() and d.acknowledged_at is null)
          or (storage.filename(name) like 'explanation-%' and d.employee_id = app_current_employee_id() and d.explanation_submitted_at is null)
          or (storage.filename(name) like 'hrsign-%' and d.sign_flow and d.hr_signed_at is null and app_is_hr_manager())
          or (storage.filename(name) like 'mgrsign-%' and d.sign_flow and d.hr_signed_at is not null and d.manager_signed_at is null and d.manager_id = app_current_employee_id())
        )
    )
  );

-- Tardiness NTEs given before the HRIS (paper notices): how many offenses
-- each employee already had, counted with the HRIS's own tardiness NTEs for
-- the next one's offense number. HR only.
create table if not exists tardiness_prior_offenses (
  employee_id text primary key references employees (id) on delete cascade,
  offenses integer not null check (offenses >= 0),
  note text not null default '',
  updated_at timestamptz not null default now()
);

alter table tardiness_prior_offenses enable row level security;

drop policy if exists "tardiness prior offenses hr" on tardiness_prior_offenses;
create policy "tardiness prior offenses hr" on tardiness_prior_offenses for all to authenticated
  using (app_has_any_role(array['hr_admin']::app_role[]))
  with check (app_has_any_role(array['hr_admin']::app_role[]));

-- Phase 52: the HR Manager and the Department Manager sign to receive the
-- employee's written explanation (in either order), through
-- discipline_receive_explanation(), which stamps the time.
--
-- Safe to run any time, and safe to re-run (after phase 51).

alter table disciplinary_records
  add column if not exists expl_hr_receiver_id text references employees (id) on delete set null,
  add column if not exists expl_hr_received_at timestamptz,
  add column if not exists expl_hr_signature_path text,
  add column if not exists expl_mgr_received_at timestamptz,
  add column if not exists expl_mgr_signature_path text;

-- Signature / receipt columns only change through the functions.
create or replace function app_guard_discipline_signatures()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(current_setting('app.discipline_response', true), '') = 'on' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.expl_hr_receiver_id := null;
    new.expl_hr_received_at := null;
    new.expl_hr_signature_path := null;
    new.expl_mgr_received_at := null;
    new.expl_mgr_signature_path := null;
    return new;
  end if;
  if new.expl_hr_receiver_id is distinct from old.expl_hr_receiver_id
     or new.expl_hr_received_at is distinct from old.expl_hr_received_at
     or new.expl_hr_signature_path is distinct from old.expl_hr_signature_path
     or new.expl_mgr_received_at is distinct from old.expl_mgr_received_at
     or new.expl_mgr_signature_path is distinct from old.expl_mgr_signature_path then
    raise exception 'Receipt of the explanation can only be signed.';
  end if;
  return new;
end;
$$;

drop trigger if exists disciplinary_records_guard_signatures on disciplinary_records;
create trigger disciplinary_records_guard_signatures
  before insert or update on disciplinary_records
  for each row execute function app_guard_discipline_signatures();

create or replace function discipline_receive_explanation(record_id text, signature_path text)
returns disciplinary_records
language plpgsql
security definer
set search_path = public
as $$
declare
  r disciplinary_records;
  me text := app_current_employee_id();
begin
  select * into r from disciplinary_records where id = record_id for update;
  if r.id is null or r.explanation_submitted_at is null then
    raise exception 'There is no written explanation to receive yet.';
  end if;
  if app_is_hr_manager() and r.expl_hr_received_at is null then
    if signature_path is null or signature_path not like record_id || '/hrrecv-%'
       or not exists (select 1 from storage.objects o where o.bucket_id = 'discipline-files' and o.name = signature_path) then
      raise exception 'Please sign before saving.';
    end if;
    perform set_config('app.discipline_response', 'on', true);
    update disciplinary_records set expl_hr_receiver_id = me, expl_hr_received_at = now(), expl_hr_signature_path = signature_path where id = record_id returning * into r;
  elsif r.manager_id is not null and r.manager_id = me and r.expl_mgr_received_at is null then
    if signature_path is null or signature_path not like record_id || '/mgrrecv-%'
       or not exists (select 1 from storage.objects o where o.bucket_id = 'discipline-files' and o.name = signature_path) then
      raise exception 'Please sign before saving.';
    end if;
    perform set_config('app.discipline_response', 'on', true);
    update disciplinary_records set expl_mgr_received_at = now(), expl_mgr_signature_path = signature_path where id = record_id returning * into r;
  else
    raise exception 'You have nothing to sign on this explanation.';
  end if;
  perform set_config('app.discipline_response', 'off', true);
  return r;
end;
$$;

revoke all on function discipline_receive_explanation(text, text) from public, anon;
grant execute on function discipline_receive_explanation(text, text) to authenticated;

drop policy if exists "discipline receipt files upload" on storage.objects;
create policy "discipline receipt files upload" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'discipline-files'
    and exists (
      select 1 from disciplinary_records d
      where d.id = (storage.foldername(name))[1]
        and d.explanation_submitted_at is not null
        and (
          (storage.filename(name) like 'hrrecv-%' and d.expl_hr_received_at is null and app_is_hr_manager())
          or (storage.filename(name) like 'mgrrecv-%' and d.expl_mgr_received_at is null and d.manager_id = app_current_employee_id())
        )
    )
  );

-- Phase 53: a Branch Manager signs generated notices too.
--
--   * branch_manager_id: the employee's branch approver (branches.approver_id,
--     e.g. Cebu: Mary Jane Pedrano), set when the notice is issued.
--   * Order: HR Manager → Department Manager → Branch Manager → employee.
--     The employee sees the notice only once every named signatory signed,
--     no excuse request is waiting for HR, and it wasn't withdrawn (excused
--     days left fewer than 5 late days).
--
-- Safe to run any time, and safe to re-run (after phases 51–52).

alter table disciplinary_records
  add column if not exists branch_manager_id text references employees (id) on delete set null,
  add column if not exists branch_manager_signed_at timestamptz,
  add column if not exists branch_manager_signature_path text,
  add column if not exists excuse_requests jsonb not null default '[]'::jsonb,
  add column if not exists withdrawn_at timestamptz;

drop policy if exists "discipline read" on disciplinary_records;
create policy "discipline read" on disciplinary_records for select to authenticated
  using (
    (app_can_view_discipline(employee_id)
      and (employee_id is distinct from app_current_employee_id() or not sign_flow
           or (manager_signed_at is not null and (branch_manager_id is null or branch_manager_signed_at is not null)
               and withdrawn_at is null and not (excuse_requests @> '[{"status": "pending"}]'::jsonb))))
    or (manager_id is not null and manager_id = app_current_employee_id())
    or (branch_manager_id is not null and branch_manager_id = app_current_employee_id())
  );

create or replace function app_guard_discipline_signatures()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(current_setting('app.discipline_response', true), '') = 'on' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.expl_hr_receiver_id := null;
    new.expl_hr_received_at := null;
    new.expl_hr_signature_path := null;
    new.expl_mgr_received_at := null;
    new.expl_mgr_signature_path := null;
    new.branch_manager_signed_at := null;
    new.branch_manager_signature_path := null;
    return new;
  end if;
  if new.expl_hr_receiver_id is distinct from old.expl_hr_receiver_id
     or new.expl_hr_received_at is distinct from old.expl_hr_received_at
     or new.expl_hr_signature_path is distinct from old.expl_hr_signature_path
     or new.expl_mgr_received_at is distinct from old.expl_mgr_received_at
     or new.expl_mgr_signature_path is distinct from old.expl_mgr_signature_path
     or new.branch_manager_signed_at is distinct from old.branch_manager_signed_at
     or new.branch_manager_signature_path is distinct from old.branch_manager_signature_path then
    raise exception 'Signatures can only be added by signing.';
  end if;
  if old.branch_manager_signed_at is not null and new.branch_manager_id is distinct from old.branch_manager_id then
    raise exception 'The Branch Manager already signed.';
  end if;
  return new;
end;
$$;

create or replace function discipline_sign(record_id text, signature_path text)
returns disciplinary_records
language plpgsql
security definer
set search_path = public
as $$
declare
  r disciplinary_records;
  me text := app_current_employee_id();
  prefix text;
begin
  select * into r from disciplinary_records where id = record_id for update;
  if r.id is null or not r.sign_flow then
    raise exception 'This notice doesn''t need signatures.';
  end if;
  if r.withdrawn_at is not null then
    raise exception 'This notice was withdrawn.';
  end if;
  prefix := case
    when r.hr_signed_at is null then '/hrsign-'
    when r.manager_signed_at is null then '/mgrsign-'
    when r.branch_manager_id is not null and r.branch_manager_signed_at is null then '/bmsign-'
  end;
  if prefix is null then
    raise exception 'This notice has already been signed.';
  end if;
  if prefix = '/hrsign-' and not app_is_hr_manager() then
    raise exception 'The HR Manager signs this notice first.';
  end if;
  if prefix = '/mgrsign-' and (r.manager_id is null or r.manager_id is distinct from me) then
    raise exception 'Only the Department Manager named on this notice can sign it now.';
  end if;
  if prefix = '/bmsign-' and r.branch_manager_id is distinct from me then
    raise exception 'Only the Branch Manager named on this notice can sign it now.';
  end if;
  if signature_path is null or signature_path not like record_id || prefix || '%'
     or not exists (select 1 from storage.objects o where o.bucket_id = 'discipline-files' and o.name = signature_path) then
    raise exception 'Please sign before saving.';
  end if;
  perform set_config('app.discipline_response', 'on', true);
  if prefix = '/hrsign-' then
    update disciplinary_records set hr_signer_id = me, hr_signed_at = now(), hr_signature_path = signature_path where id = record_id returning * into r;
  elsif prefix = '/mgrsign-' then
    update disciplinary_records set manager_signed_at = now(), manager_signature_path = signature_path where id = record_id returning * into r;
  else
    update disciplinary_records set branch_manager_signed_at = now(), branch_manager_signature_path = signature_path where id = record_id returning * into r;
  end if;
  perform set_config('app.discipline_response', 'off', true);
  return r;
end;
$$;

create or replace function discipline_acknowledge(record_id text, signature_path text)
returns disciplinary_records
language plpgsql
security definer
set search_path = public
as $$
declare
  r disciplinary_records;
begin
  select * into r from disciplinary_records where id = record_id for update;
  if r.id is null or r.employee_id is distinct from app_current_employee_id() then
    raise exception 'This notice isn''t addressed to you.';
  end if;
  if r.sign_flow and (r.manager_signed_at is null or (r.branch_manager_id is not null and r.branch_manager_signed_at is null)
                      or r.withdrawn_at is not null or r.excuse_requests @> '[{"status": "pending"}]'::jsonb) then
    raise exception 'This notice isn''t ready for you yet.';
  end if;
  if r.acknowledged_at is not null then
    raise exception 'You have already acknowledged this notice.';
  end if;
  if signature_path is null or signature_path not like record_id || '/ack-%'
     or not exists (select 1 from storage.objects o where o.bucket_id = 'discipline-files' and o.name = signature_path) then
    raise exception 'Please sign before acknowledging.';
  end if;
  perform set_config('app.discipline_response', 'on', true);
  update disciplinary_records set acknowledged_at = now(), ack_signature_path = signature_path where id = record_id returning * into r;
  perform set_config('app.discipline_response', 'off', true);
  return r;
end;
$$;

drop policy if exists "discipline branch manager files upload" on storage.objects;
create policy "discipline branch manager files upload" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'discipline-files'
    and storage.filename(name) like 'bmsign-%'
    and exists (
      select 1 from disciplinary_records d
      where d.id = (storage.foldername(name))[1]
        and d.sign_flow and d.manager_signed_at is not null and d.branch_manager_signed_at is null
        and d.branch_manager_id = app_current_employee_id()
    )
  );

-- Excuse requests: the Department / Branch Manager asks HR not to count
-- some late days, each with its reason; HR accepts or declines each request.
-- When the accepted days leave fewer than 5 late days, the NTE is withdrawn
-- (resolved; the employee never receives it).
--   [{ "id", "by", "role": "manager"|"branch", "items": [{ "date", "minutes", "reason" }],
--      "at", "status": "pending"|"accepted"|"declined", "decided_by", "decided_at" }]

create or replace function app_guard_discipline_excuses()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(current_setting('app.discipline_response', true), '') = 'on' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.excuse_requests := '[]'::jsonb;
    new.withdrawn_at := null;
  elsif new.excuse_requests is distinct from old.excuse_requests or new.withdrawn_at is distinct from old.withdrawn_at then
    raise exception 'Excuse requests change only through the Department / Branch Manager and HR.';
  end if;
  return new;
end;
$$;

drop trigger if exists disciplinary_records_guard_excuses on disciplinary_records;
create trigger disciplinary_records_guard_excuses
  before insert or update on disciplinary_records
  for each row execute function app_guard_discipline_excuses();

create or replace function discipline_request_excuse(record_id text, items jsonb)
returns disciplinary_records
language plpgsql
security definer
set search_path = public
as $$
declare
  r disciplinary_records;
  me text := app_current_employee_id();
  role text;
begin
  select * into r from disciplinary_records where id = record_id for update;
  if r.id is null or not r.sign_flow then
    raise exception 'This notice doesn''t take excuse requests.';
  end if;
  if r.withdrawn_at is not null then
    raise exception 'This notice was withdrawn.';
  end if;
  role := case when r.manager_id = me then 'manager' when r.branch_manager_id = me then 'branch' end;
  if role is null then
    raise exception 'Only the Department or Branch Manager named on this notice can ask to excuse late days.';
  end if;
  if jsonb_typeof(items) <> 'array' or jsonb_array_length(items) = 0 or jsonb_array_length(items) > 31 then
    raise exception 'Choose at least one late day.';
  end if;
  if exists (select 1 from jsonb_array_elements(items) i where coalesce(btrim(i->>'reason'), '') = '' or coalesce(i->>'date', '') !~ '^\d{4}-\d{2}-\d{2}$') then
    raise exception 'Give the reason for each day.';
  end if;
  if exists (select 1 from jsonb_array_elements(items) i where char_length(i->>'reason') > 500) then
    raise exception 'Keep each reason under 500 characters.';
  end if;
  perform set_config('app.discipline_response', 'on', true);
  update disciplinary_records
     set excuse_requests = excuse_requests || jsonb_build_array(jsonb_build_object(
       'id', gen_random_uuid()::text, 'by', me, 'role', role, 'items', items, 'at', now(), 'status', 'pending'))
   where id = record_id
  returning * into r;
  perform set_config('app.discipline_response', 'off', true);
  return r;
end;
$$;

create or replace function discipline_decide_excuse(record_id text, request_id text, accept boolean)
returns disciplinary_records
language plpgsql
security definer
set search_path = public
as $$
declare
  r disciplinary_records;
begin
  if not app_is_hr_manager() then
    raise exception 'Only HR decides on excuse requests.';
  end if;
  select * into r from disciplinary_records where id = record_id for update;
  if r.id is null or not exists (select 1 from jsonb_array_elements(r.excuse_requests) x where x->>'id' = request_id and x->>'status' = 'pending') then
    raise exception 'That request was already decided or doesn''t exist.';
  end if;
  perform set_config('app.discipline_response', 'on', true);
  update disciplinary_records
     set excuse_requests = (
       select jsonb_agg(case when x->>'id' = request_id
                             then x || jsonb_build_object('status', case when accept then 'accepted' else 'declined' end,
                                                          'decided_by', app_current_employee_id(), 'decided_at', now())
                             else x end order by ord)
       from jsonb_array_elements(r.excuse_requests) with ordinality as t(x, ord))
   where id = record_id
  returning * into r;
  -- Fewer than 5 late days left once the accepted ones are excused: withdrawn.
  if accept and jsonb_typeof(r.notice_data->'days') = 'array'
     and jsonb_array_length(r.notice_data->'days') - (
       select count(distinct i->>'date')
       from jsonb_array_elements(r.excuse_requests) x, jsonb_array_elements(x->'items') i
       where x->>'status' = 'accepted') < 5 then
    update disciplinary_records set withdrawn_at = now(), status = 'resolved' where id = record_id returning * into r;
  end if;
  perform set_config('app.discipline_response', 'off', true);
  return r;
end;
$$;

revoke all on function discipline_request_excuse(text, jsonb) from public, anon;
grant execute on function discipline_request_excuse(text, jsonb) to authenticated;
revoke all on function discipline_decide_excuse(text, text, boolean) from public, anon;
grant execute on function discipline_decide_excuse(text, text, boolean) to authenticated;

-- Phase 54: the Branch Manager signs (notes) before the Department Manager.
--
--   * Order: HR Manager → Branch Manager (if any, "Noted by") → Department
--     Manager → employee. Notices already waiting for the Department Manager
--     go to the Branch Manager first.
--
-- Safe to run any time, and safe to re-run (after phase 53).

create or replace function discipline_sign(record_id text, signature_path text)
returns disciplinary_records
language plpgsql
security definer
set search_path = public
as $$
declare
  r disciplinary_records;
  me text := app_current_employee_id();
  prefix text;
begin
  select * into r from disciplinary_records where id = record_id for update;
  if r.id is null or not r.sign_flow then
    raise exception 'This notice doesn''t need signatures.';
  end if;
  if r.withdrawn_at is not null then
    raise exception 'This notice was withdrawn.';
  end if;
  prefix := case
    when r.hr_signed_at is null then '/hrsign-'
    when r.branch_manager_id is not null and r.branch_manager_signed_at is null then '/bmsign-'
    when r.manager_signed_at is null then '/mgrsign-'
  end;
  if prefix is null then
    raise exception 'This notice has already been signed.';
  end if;
  if prefix = '/hrsign-' and not app_is_hr_manager() then
    raise exception 'The HR Manager signs this notice first.';
  end if;
  if prefix = '/bmsign-' and r.branch_manager_id is distinct from me then
    raise exception 'Only the Branch Manager named on this notice can sign it now.';
  end if;
  if prefix = '/mgrsign-' and (r.manager_id is null or r.manager_id is distinct from me) then
    raise exception 'Only the Department Manager named on this notice can sign it now.';
  end if;
  if signature_path is null or signature_path not like record_id || prefix || '%'
     or not exists (select 1 from storage.objects o where o.bucket_id = 'discipline-files' and o.name = signature_path) then
    raise exception 'Please sign before saving.';
  end if;
  perform set_config('app.discipline_response', 'on', true);
  if prefix = '/hrsign-' then
    update disciplinary_records set hr_signer_id = me, hr_signed_at = now(), hr_signature_path = signature_path where id = record_id returning * into r;
  elsif prefix = '/mgrsign-' then
    update disciplinary_records set manager_signed_at = now(), manager_signature_path = signature_path where id = record_id returning * into r;
  else
    update disciplinary_records set branch_manager_signed_at = now(), branch_manager_signature_path = signature_path where id = record_id returning * into r;
  end if;
  perform set_config('app.discipline_response', 'off', true);
  return r;
end;
$$;

-- The Branch Manager's signature can be uploaded once HR has signed.
drop policy if exists "discipline branch manager files upload" on storage.objects;
create policy "discipline branch manager files upload" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'discipline-files'
    and storage.filename(name) like 'bmsign-%'
    and exists (
      select 1 from disciplinary_records d
      where d.id = (storage.foldername(name))[1]
        and d.sign_flow and d.hr_signed_at is not null and d.branch_manager_signed_at is null
        and d.branch_manager_id = app_current_employee_id()
    )
  );

-- =============================================================================
-- Phase 55: Certificate of Employment (COE)
--
--   * coe_requests: an employee asks for a COE (purpose, with or without
--     compensation); HR can also start one for anyone, former employees
--     included. The database fills in the name and when / who asked.
--   * The HR Manager issues it (coe_issue) with the certificate's wording
--     saved in `data`, signed with their saved signature (a copy in the
--     leave-forms bucket at coe/<employee id>/<request id>/hr.png), or
--     declines it with a reason (coe_decline).
--   * Seen only by the employee and HR (it can show compensation).
--
-- Needs migrate_phase27_leave_forms.sql.
-- Safe to run any time, and safe to re-run.
-- =============================================================================

create table if not exists coe_requests (
  id text primary key,
  employee_id text not null references employees (id) on delete cascade,
  employee_name text not null default '',
  purpose text not null default '' check (char_length(purpose) <= 200),
  with_compensation boolean not null default false,
  status text not null default 'pending' check (status in ('pending', 'issued', 'declined')),
  requested_by text references employees (id) on delete set null,
  requested_at timestamptz not null default now(),
  decided_by text references employees (id) on delete set null,
  decided_name text,
  decided_at timestamptz,
  decline_reason text,
  data jsonb
);

create index if not exists coe_requests_employee_idx on coe_requests (employee_id, requested_at);

create or replace function app_fill_coe_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.employee_name := coalesce((select trim(both ' ' from coalesce(first_name, '') || ' ' || coalesce(last_name, '')) from employees where id = new.employee_id), '');
  new.purpose := btrim(coalesce(new.purpose, ''));
  new.status := 'pending';
  new.requested_by := app_current_employee_id();
  new.requested_at := now();
  new.decided_by := null;
  new.decided_name := null;
  new.decided_at := null;
  new.decline_reason := null;
  new.data := null;
  return new;
end;
$$;

drop trigger if exists coe_request_fill on coe_requests;
create trigger coe_request_fill
  before insert on coe_requests
  for each row execute function app_fill_coe_request();

alter table coe_requests enable row level security;

drop policy if exists "coe read" on coe_requests;
create policy "coe read" on coe_requests for select to authenticated
  using (employee_id = app_current_employee_id() or app_is_hr_manager());
drop policy if exists "coe request" on coe_requests;
create policy "coe request" on coe_requests for insert to authenticated
  with check (employee_id = app_current_employee_id() or app_is_hr_manager());
drop policy if exists "coe delete hr" on coe_requests;
create policy "coe delete hr" on coe_requests for delete to authenticated
  using (app_is_hr_manager());
-- No update policy: issuing / declining go through the functions below.

create or replace function coe_issue(p_id text, p_data jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me text := app_current_employee_id();
  r coe_requests%rowtype;
  nm text;
begin
  if me is null or not app_is_hr_manager() then
    raise exception 'Only the HR Manager can issue a Certificate of Employment.';
  end if;
  select * into r from coe_requests where id = p_id for update;
  if not found then
    raise exception 'COE request not found.';
  end if;
  if r.status <> 'pending' then
    raise exception 'This COE request was already issued or declined.';
  end if;
  if jsonb_typeof(p_data) <> 'object' or octet_length(p_data::text) > 20000 then
    raise exception 'The certificate''s details are missing.';
  end if;
  if not app_leave_form_file_exists('coe/' || r.employee_id || '/' || p_id || '/hr.png') then
    raise exception 'Attach your signature first.';
  end if;
  select trim(both ' ' from coalesce(first_name, '') || ' ' || coalesce(last_name, '')) into nm from employees where id = me;
  update coe_requests
     set status = 'issued', data = p_data, decided_by = me, decided_name = nm, decided_at = now()
   where id = p_id;
end;
$$;

revoke all on function coe_issue(text, jsonb) from public, anon;
grant execute on function coe_issue(text, jsonb) to authenticated;

create or replace function coe_decline(p_id text, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me text := app_current_employee_id();
  r coe_requests%rowtype;
  nm text;
  note text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if me is null or not app_is_hr_manager() then
    raise exception 'Only the HR Manager can decline a COE request.';
  end if;
  select * into r from coe_requests where id = p_id for update;
  if not found then
    raise exception 'COE request not found.';
  end if;
  if r.status <> 'pending' then
    raise exception 'This COE request was already issued or declined.';
  end if;
  if note is null or char_length(note) > 500 then
    raise exception 'Give the reason for declining (up to 500 characters).';
  end if;
  select trim(both ' ' from coalesce(first_name, '') || ' ' || coalesce(last_name, '')) into nm from employees where id = me;
  update coe_requests
     set status = 'declined', decline_reason = note, decided_by = me, decided_name = nm, decided_at = now()
   where id = p_id;
end;
$$;

revoke all on function coe_decline(text, text) from public, anon;
grant execute on function coe_decline(text, text) to authenticated;

-- HR's signature on a COE: coe/<employee id>/<request id>/hr.png, while
-- the request is pending.
create or replace function app_can_sign_coe(path text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select path ~ '^coe/[^/]+/[^/]+/hr\.png$'
    and app_is_hr_manager()
    and exists (select 1 from coe_requests r
                where r.id = split_part(path, '/', 3) and r.employee_id = split_part(path, '/', 2) and r.status = 'pending');
$$;

revoke all on function app_can_sign_coe(text) from public, anon;
grant execute on function app_can_sign_coe(text) to authenticated;

drop policy if exists "coe signatures read" on storage.objects;
create policy "coe signatures read" on storage.objects for select to authenticated
  using (bucket_id = 'leave-forms' and name like 'coe/%'
         and (split_part(name, '/', 2) = app_current_employee_id() or app_is_hr_manager()));
drop policy if exists "coe sign" on storage.objects;
create policy "coe sign" on storage.objects for insert to authenticated
  with check (bucket_id = 'leave-forms' and app_can_sign_coe(name));
drop policy if exists "coe re-sign" on storage.objects;
create policy "coe re-sign" on storage.objects for update to authenticated
  using (bucket_id = 'leave-forms' and app_can_sign_coe(name))
  with check (bucket_id = 'leave-forms' and app_can_sign_coe(name));
drop policy if exists "coe files delete hr" on storage.objects;
create policy "coe files delete hr" on storage.objects for delete to authenticated
  using (bucket_id = 'leave-forms' and name like 'coe/%' and app_is_hr_manager());

-- =============================================================================
-- Phase 56: Pag-IBIG Multi-Purpose Loan Application Form (HQP-SLF-065)
--
--   * mpl_requests: an employee asks for the employer's part of the form
--     (employer details, authorized signatory, Certificate of Net Pay).
--   * HR checks the figures and sends it to the authorized signatory
--     (mpl_prepare) — or declines; the signatory signs with their saved
--     signature (a copy in the leave-forms bucket at
--     mpl/<employee id>/<request id>/signatory.png) — mpl_sign — or declines.
--   * Seen by the employee, HR and the signatory it was sent to.
--
-- Needs migrate_phase27_leave_forms.sql.
-- Safe to run any time, and safe to re-run.
-- =============================================================================

create table if not exists mpl_requests (
  id text primary key,
  employee_id text not null references employees (id) on delete cascade,
  employee_name text not null default '',
  note text not null default '' check (char_length(note) <= 300),
  status text not null default 'hr' check (status in ('hr', 'signatory', 'signed', 'declined')),
  requested_by text references employees (id) on delete set null,
  requested_at timestamptz not null default now(),
  prepared_by text references employees (id) on delete set null,
  prepared_name text,
  prepared_at timestamptz,
  signatory_id text references employees (id) on delete set null,
  signatory_name text,
  signed_at timestamptz,
  declined_name text,
  decline_reason text,
  data jsonb
);

create index if not exists mpl_requests_employee_idx on mpl_requests (employee_id, requested_at);

create or replace function app_fill_mpl_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.employee_name := coalesce((select trim(both ' ' from coalesce(first_name, '') || ' ' || coalesce(last_name, '')) from employees where id = new.employee_id), '');
  new.note := btrim(coalesce(new.note, ''));
  new.status := 'hr';
  new.requested_by := app_current_employee_id();
  new.requested_at := now();
  new.prepared_by := null;
  new.prepared_name := null;
  new.prepared_at := null;
  new.signatory_id := null;
  new.signatory_name := null;
  new.signed_at := null;
  new.declined_name := null;
  new.decline_reason := null;
  new.data := null;
  return new;
end;
$$;

drop trigger if exists mpl_request_fill on mpl_requests;
create trigger mpl_request_fill
  before insert on mpl_requests
  for each row execute function app_fill_mpl_request();

alter table mpl_requests enable row level security;

drop policy if exists "mpl read" on mpl_requests;
create policy "mpl read" on mpl_requests for select to authenticated
  using (employee_id = app_current_employee_id() or app_is_hr_manager()
         or (signatory_id is not null and signatory_id = app_current_employee_id()));
drop policy if exists "mpl request" on mpl_requests;
create policy "mpl request" on mpl_requests for insert to authenticated
  with check (employee_id = app_current_employee_id() or app_is_hr_manager());
drop policy if exists "mpl delete hr" on mpl_requests;
create policy "mpl delete hr" on mpl_requests for delete to authenticated
  using (app_is_hr_manager());
-- No update policy: the steps go through the functions below.

-- HR: the employer's part and net pay are checked; send to the signatory.
create or replace function mpl_prepare(p_id text, p_data jsonb, p_signatory text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me text := app_current_employee_id();
  r mpl_requests%rowtype;
begin
  if me is null or not app_is_hr_manager() then
    raise exception 'Only HR can prepare the Pag-IBIG loan form.';
  end if;
  select * into r from mpl_requests where id = p_id for update;
  if not found then
    raise exception 'Request not found.';
  end if;
  if r.status <> 'hr' then
    raise exception 'This form was already sent, signed or declined.';
  end if;
  if jsonb_typeof(p_data) <> 'object' or octet_length(p_data::text) > 20000 then
    raise exception 'The form''s details are missing.';
  end if;
  if p_signatory is null or not exists (select 1 from employees where id = p_signatory) then
    raise exception 'Choose the authorized signatory.';
  end if;
  if p_signatory = r.employee_id then
    raise exception 'The borrower can''t sign as the authorized signatory.';
  end if;
  update mpl_requests
     set status = 'signatory', data = p_data, signatory_id = p_signatory,
         signatory_name = (select trim(both ' ' from coalesce(first_name, '') || ' ' || coalesce(last_name, '')) from employees where id = p_signatory),
         prepared_by = me, prepared_at = now(),
         prepared_name = (select trim(both ' ' from coalesce(first_name, '') || ' ' || coalesce(last_name, '')) from employees where id = me)
   where id = p_id;
end;
$$;

revoke all on function mpl_prepare(text, jsonb, text) from public, anon;
grant execute on function mpl_prepare(text, jsonb, text) to authenticated;

-- The authorized signatory signs.
create or replace function mpl_sign(p_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me text := app_current_employee_id();
  r mpl_requests%rowtype;
begin
  select * into r from mpl_requests where id = p_id for update;
  if not found then
    raise exception 'Request not found.';
  end if;
  if me is null or r.signatory_id is distinct from me then
    raise exception 'Only the authorized signatory named on this form can sign it.';
  end if;
  if r.status <> 'signatory' then
    raise exception 'This form isn''t waiting for your signature.';
  end if;
  if not app_leave_form_file_exists('mpl/' || r.employee_id || '/' || p_id || '/signatory.png') then
    raise exception 'Attach your signature first.';
  end if;
  update mpl_requests set status = 'signed', signed_at = now() where id = p_id;
end;
$$;

revoke all on function mpl_sign(text) from public, anon;
grant execute on function mpl_sign(text) to authenticated;

-- HR (before sending) or the signatory (before signing) declines.
create or replace function mpl_decline(p_id text, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me text := app_current_employee_id();
  r mpl_requests%rowtype;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  select * into r from mpl_requests where id = p_id for update;
  if not found then
    raise exception 'Request not found.';
  end if;
  if not ((r.status = 'hr' and app_is_hr_manager()) or (r.status = 'signatory' and (r.signatory_id = me or app_is_hr_manager()))) then
    raise exception 'You can''t decline this form now.';
  end if;
  if v_reason is null or char_length(v_reason) > 500 then
    raise exception 'Give the reason for declining (up to 500 characters).';
  end if;
  update mpl_requests
     set status = 'declined', decline_reason = v_reason,
         declined_name = (select trim(both ' ' from coalesce(first_name, '') || ' ' || coalesce(last_name, '')) from employees where id = me)
   where id = p_id;
end;
$$;

revoke all on function mpl_decline(text, text) from public, anon;
grant execute on function mpl_decline(text, text) to authenticated;

-- The signatory's signature: mpl/<employee id>/<request id>/signatory.png,
-- while the form waits for them.
create or replace function app_can_sign_mpl(path text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select path ~ '^mpl/[^/]+/[^/]+/signatory\.png$'
    and exists (select 1 from mpl_requests r
                where r.id = split_part(path, '/', 3) and r.employee_id = split_part(path, '/', 2)
                  and r.status = 'signatory' and r.signatory_id = app_current_employee_id());
$$;

revoke all on function app_can_sign_mpl(text) from public, anon;
grant execute on function app_can_sign_mpl(text) to authenticated;

drop policy if exists "mpl signatures read" on storage.objects;
create policy "mpl signatures read" on storage.objects for select to authenticated
  using (bucket_id = 'leave-forms' and name like 'mpl/%'
         and (split_part(name, '/', 2) = app_current_employee_id() or app_is_hr_manager()
              or exists (select 1 from mpl_requests r where r.id = split_part(name, '/', 3) and r.signatory_id = app_current_employee_id())));
drop policy if exists "mpl sign" on storage.objects;
create policy "mpl sign" on storage.objects for insert to authenticated
  with check (bucket_id = 'leave-forms' and app_can_sign_mpl(name));
drop policy if exists "mpl re-sign" on storage.objects;
create policy "mpl re-sign" on storage.objects for update to authenticated
  using (bucket_id = 'leave-forms' and app_can_sign_mpl(name))
  with check (bucket_id = 'leave-forms' and app_can_sign_mpl(name));
drop policy if exists "mpl files delete hr" on storage.objects;
create policy "mpl files delete hr" on storage.objects for delete to authenticated
  using (bucket_id = 'leave-forms' and name like 'mpl/%' and app_is_hr_manager());

-- =============================================================================
-- Phase 57: Upper Management reads the payroll figures (read-only).
--
-- Payroll Processing's per-employee figures (payroll_line_overrides: the
-- imported payroll file and HR's edits) and voucher amounts were readable
-- only by payroll roles, so an Upper Management account's Executive
-- Dashboard / reports recomputed pay without them and showed different
-- totals. They can now read them (never change them), like the other
-- company-wide roles.
--
-- Safe to run any time, and safe to re-run.
-- =============================================================================

drop policy if exists "payroll overrides read elevated" on payroll_line_overrides;
create policy "payroll overrides read elevated" on payroll_line_overrides for select to authenticated
  using (app_is_elevated());

drop policy if exists "voucher overrides read elevated" on voucher_amount_overrides;
create policy "voucher overrides read elevated" on voucher_amount_overrides for select to authenticated
  using (app_is_elevated());

-- =============================================================================
-- Phase 58: Work From Home activity log
--
--   * wfh_schedules: who works from home and when (per weekday: hours, or
--     expected minutes), set by HR; the employee acknowledges the
--     monitoring notice once.
--   * wfh_sessions: "Start working" → "Stop working" with the day's
--     accomplishment report; last_seen_at is refreshed every minute while
--     the HRIS tab is open.
--   * wfh_events: idle stretches (no keyboard / mouse anywhere on the
--     computer, or screen locked), times the tab was closed (offline), and
--     the random "Are you there?" checks (answered / missed). The employee
--     can add a reason to an idle or offline stretch.
--   * Seen by the employee, their supervisor and HR. Written only through
--     the functions below, with server times.
--
-- Safe to run any time, and safe to re-run.
-- =============================================================================

create table if not exists wfh_schedules (
  employee_id text primary key references employees (id) on delete cascade,
  -- {"1": {"start": "08:00", "end": "17:00"}, "6": {"minutes": 120}} (1 = Monday … 7 = Sunday)
  days jsonb not null default '{}'::jsonb,
  acknowledged_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists wfh_sessions (
  id text primary key,
  employee_id text not null references employees (id) on delete cascade,
  work_date date not null,
  started_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  ended_at timestamptz,
  report text
);

create index if not exists wfh_sessions_employee_idx on wfh_sessions (employee_id, work_date);

create table if not exists wfh_events (
  id text primary key,
  session_id text not null references wfh_sessions (id) on delete cascade,
  employee_id text not null references employees (id) on delete cascade,
  kind text not null check (kind in ('idle', 'locked', 'offline', 'check_ok', 'check_missed')),
  started_at timestamptz not null,
  ended_at timestamptz,
  reason text
);

create index if not exists wfh_events_session_idx on wfh_events (session_id, started_at);

alter table wfh_schedules enable row level security;
alter table wfh_sessions enable row level security;
alter table wfh_events enable row level security;

drop policy if exists "wfh schedules read" on wfh_schedules;
create policy "wfh schedules read" on wfh_schedules for select to authenticated
  using (employee_id = app_current_employee_id() or app_is_supervisor_of(employee_id) or app_is_hr_manager());
drop policy if exists "wfh schedules hr" on wfh_schedules;
create policy "wfh schedules hr" on wfh_schedules for all to authenticated
  using (app_is_hr_manager()) with check (app_is_hr_manager());

drop policy if exists "wfh sessions read" on wfh_sessions;
create policy "wfh sessions read" on wfh_sessions for select to authenticated
  using (employee_id = app_current_employee_id() or app_is_supervisor_of(employee_id) or app_is_hr_manager());
drop policy if exists "wfh events read" on wfh_events;
create policy "wfh events read" on wfh_events for select to authenticated
  using (employee_id = app_current_employee_id() or app_is_supervisor_of(employee_id) or app_is_hr_manager());
-- No insert / update policies: everything goes through the functions below.

create or replace function wfh_acknowledge()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update wfh_schedules set acknowledged_at = coalesce(acknowledged_at, now()) where employee_id = app_current_employee_id();
  if not found then
    raise exception 'You aren''t set up for work from home.';
  end if;
end;
$$;

-- Start working (or continue today's open session). Returns the session id.
create or replace function wfh_start()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  me text := app_current_employee_id();
  s wfh_sessions%rowtype;
  today date := (now() at time zone 'Asia/Manila')::date;
begin
  if me is null or not exists (select 1 from wfh_schedules where employee_id = me and acknowledged_at is not null) then
    raise exception 'You aren''t set up for work from home, or haven''t acknowledged the notice yet.';
  end if;
  select * into s from wfh_sessions where employee_id = me and ended_at is null order by started_at desc limit 1 for update;
  if found then
    -- The tab was closed for a while: log the gap.
    if now() - s.last_seen_at > interval '3 minutes' then
      insert into wfh_events (id, session_id, employee_id, kind, started_at, ended_at)
      values (gen_random_uuid()::text, s.id, me, 'offline', s.last_seen_at, now());
    end if;
    update wfh_sessions set last_seen_at = now() where id = s.id;
    return s.id;
  end if;
  insert into wfh_sessions (id, employee_id, work_date) values (gen_random_uuid()::text, me, today) returning * into s;
  return s.id;
end;
$$;

-- Every minute while the tab is open.
create or replace function wfh_beat(p_session text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update wfh_sessions set last_seen_at = now()
   where id = p_session and employee_id = app_current_employee_id() and ended_at is null;
end;
$$;

-- An idle / locked stretch (its start as the browser saw it, its end now),
-- or a presence check (answered or missed).
create or replace function wfh_log(p_session text, p_kind text, p_started timestamptz)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me text := app_current_employee_id();
  s wfh_sessions%rowtype;
  st timestamptz;
begin
  select * into s from wfh_sessions where id = p_session and employee_id = me and ended_at is null;
  if not found then
    raise exception 'No open work-from-home session.';
  end if;
  if p_kind not in ('idle', 'locked', 'check_ok', 'check_missed') then
    raise exception 'Unknown activity.';
  end if;
  st := greatest(least(coalesce(p_started, now()), now()), s.started_at);
  insert into wfh_events (id, session_id, employee_id, kind, started_at, ended_at)
  values (gen_random_uuid()::text, p_session, me, p_kind, st, case when p_kind in ('idle', 'locked') then now() else null end);
  update wfh_sessions set last_seen_at = now() where id = p_session;
end;
$$;

create or replace function wfh_stop(p_session text, p_report text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_report text := nullif(btrim(coalesce(p_report, '')), '');
begin
  if v_report is null or char_length(v_report) > 4000 then
    raise exception 'Write what you accomplished today (up to 4000 characters).';
  end if;
  update wfh_sessions set ended_at = now(), last_seen_at = now(), report = v_report
   where id = p_session and employee_id = app_current_employee_id() and ended_at is null;
  if not found then
    raise exception 'No open work-from-home session.';
  end if;
end;
$$;

-- The employee explains an idle / offline stretch.
create or replace function wfh_explain(p_event text, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if v_reason is not null and char_length(v_reason) > 300 then
    raise exception 'Keep the reason under 300 characters.';
  end if;
  update wfh_events set reason = v_reason
   where id = p_event and employee_id = app_current_employee_id() and kind in ('idle', 'locked', 'offline');
  if not found then
    raise exception 'You can only explain your own idle or offline time.';
  end if;
end;
$$;

revoke all on function wfh_acknowledge() from public, anon;
grant execute on function wfh_acknowledge() to authenticated;
revoke all on function wfh_start() from public, anon;
grant execute on function wfh_start() to authenticated;
revoke all on function wfh_beat(text) from public, anon;
grant execute on function wfh_beat(text) to authenticated;
revoke all on function wfh_log(text, text, timestamptz) from public, anon;
grant execute on function wfh_log(text, text, timestamptz) to authenticated;
revoke all on function wfh_stop(text, text) from public, anon;
grant execute on function wfh_stop(text, text) to authenticated;
revoke all on function wfh_explain(text, text) from public, anon;
grant execute on function wfh_explain(text, text) to authenticated;

-- =============================================================================
-- Phase 59: Work From Home — live status, seen by Upper Management too.
--
--   * wfh_sessions.state / state_since: what the employee is doing right now
--     (active, idle, screen locked), set by the HRIS tab as it changes, so
--     the "Who's working now" board can show it live.
--   * Upper Management reads the WFH schedules, sessions and activity log
--     (read-only), like HR and the employee's supervisor.
--
-- Needs migrate_phase58_work_from_home.sql. Safe to re-run.
-- =============================================================================

alter table wfh_sessions
  add column if not exists state text not null default 'active' check (state in ('active', 'idle', 'locked')),
  add column if not exists state_since timestamptz;

create or replace function app_is_upper_management()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select app_has_any_role(array['upper_management']::app_role[]);
$$;

revoke all on function app_is_upper_management() from public, anon;
grant execute on function app_is_upper_management() to authenticated;

drop policy if exists "wfh schedules read" on wfh_schedules;
create policy "wfh schedules read" on wfh_schedules for select to authenticated
  using (employee_id = app_current_employee_id() or app_is_supervisor_of(employee_id) or app_is_hr_manager() or app_is_upper_management());
drop policy if exists "wfh sessions read" on wfh_sessions;
create policy "wfh sessions read" on wfh_sessions for select to authenticated
  using (employee_id = app_current_employee_id() or app_is_supervisor_of(employee_id) or app_is_hr_manager() or app_is_upper_management());
drop policy if exists "wfh events read" on wfh_events;
create policy "wfh events read" on wfh_events for select to authenticated
  using (employee_id = app_current_employee_id() or app_is_supervisor_of(employee_id) or app_is_hr_manager() or app_is_upper_management());

-- The tab reports a change: idle / locked since a time, or back to active.
create or replace function wfh_state(p_session text, p_state text, p_since timestamptz)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  s wfh_sessions%rowtype;
begin
  if p_state not in ('active', 'idle', 'locked') then
    raise exception 'Unknown state.';
  end if;
  select * into s from wfh_sessions where id = p_session and employee_id = app_current_employee_id() and ended_at is null;
  if not found then
    raise exception 'No open work-from-home session.';
  end if;
  update wfh_sessions
     set state = p_state,
         state_since = greatest(least(coalesce(p_since, now()), now()), s.started_at),
         last_seen_at = now()
   where id = p_session;
end;
$$;

revoke all on function wfh_state(text, text, timestamptz) from public, anon;
grant execute on function wfh_state(text, text, timestamptz) to authenticated;

-- Starter settings
-- ---------------------------------------------------------------------------

-- Placeholders for people imported without a branch / department / position on file.
insert into branches (id, name, code, address) values ('br-unassigned', 'Unassigned', 'UNASSIGNED', 'Unassigned') on conflict (id) do nothing;
insert into departments (id, name, division) values ('dp-unassigned', 'Unassigned', 'shared_services') on conflict (id) do nothing;
insert into positions (id, title, department_id) values ('ps-unassigned', 'Unassigned', 'dp-unassigned') on conflict (id) do nothing;

-- Work schedules
insert into work_schedules (id, name, time_in, time_out, days, grace_minutes) values ('ws-day', 'Day Shift', '08:00', '17:00', 'Mon–Fri', 10) on conflict (id) do nothing;
insert into work_schedules (id, name, time_in, time_out, days, grace_minutes) values ('ws-early', 'Early Shift', '06:00', '15:00', 'Mon–Sat', 10) on conflict (id) do nothing;
insert into work_schedules (id, name, time_in, time_out, days, grace_minutes) values ('ws-mid', 'Mid Shift', '10:00', '19:00', 'Mon–Sat', 10) on conflict (id) do nothing;
insert into work_schedules (id, name, time_in, time_out, days, grace_minutes) values ('ws-night', 'Night Shift', '22:00', '07:00', 'Mon–Sat', 15) on conflict (id) do nothing;
insert into work_schedules (id, name, time_in, time_out, days, grace_minutes) values ('ws-flexi', 'Flexi', '09:00', '18:00', 'Mon–Fri', 15) on conflict (id) do nothing;

-- 2026 Philippine national holidays (edit under System Administration > Holidays)
insert into holidays (id, name, date, type, verified) values ('hd-1', 'New Year''s Day', '2026-01-01', 'regular', true) on conflict (id) do nothing;
insert into holidays (id, name, date, type, verified) values ('hd-2', 'Araw ng Kagitingan', '2026-04-09', 'regular', true) on conflict (id) do nothing;
insert into holidays (id, name, date, type, verified) values ('hd-3', 'Maundy Thursday', '2026-04-02', 'regular', false) on conflict (id) do nothing;
insert into holidays (id, name, date, type, verified) values ('hd-4', 'Good Friday', '2026-04-03', 'regular', false) on conflict (id) do nothing;
insert into holidays (id, name, date, type, verified) values ('hd-5', 'Labor Day', '2026-05-01', 'regular', true) on conflict (id) do nothing;
insert into holidays (id, name, date, type, verified) values ('hd-6', 'Independence Day', '2026-06-12', 'regular', true) on conflict (id) do nothing;
insert into holidays (id, name, date, type, verified) values ('hd-7', 'Ninoy Aquino Day', '2026-08-21', 'special_non_working', true) on conflict (id) do nothing;
insert into holidays (id, name, date, type, verified) values ('hd-8', 'National Heroes Day', '2026-08-31', 'regular', false) on conflict (id) do nothing;
insert into holidays (id, name, date, type, verified) values ('hd-9', 'All Saints'' Day (observed)', '2026-11-01', 'special_non_working', false) on conflict (id) do nothing;
insert into holidays (id, name, date, type, verified) values ('hd-10', 'Bonifacio Day', '2026-11-30', 'regular', true) on conflict (id) do nothing;
insert into holidays (id, name, date, type, verified) values ('hd-11', 'Christmas Day', '2026-12-25', 'regular', true) on conflict (id) do nothing;
insert into holidays (id, name, date, type, verified) values ('hd-12', 'Rizal Day', '2026-12-30', 'regular', true) on conflict (id) do nothing;
insert into holidays (id, name, date, type, verified) values ('hd-13', 'Last Day of the Year', '2026-12-31', 'special_non_working', false) on conflict (id) do nothing;

-- Leave types (edit credits under System Administration > Leave Types)
insert into leave_types (id, name, default_credits, requires_cert) values ('lt-vl', 'Vacation Leave', 15, false) on conflict (id) do nothing;
insert into leave_types (id, name, default_credits, requires_cert) values ('lt-sl', 'Sick Leave', 15, true) on conflict (id) do nothing;
insert into leave_types (id, name, default_credits, requires_cert) values ('lt-el', 'Emergency Leave', 3, false) on conflict (id) do nothing;
insert into leave_types (id, name, default_credits, requires_cert) values ('lt-spl', 'Solo Parent Leave', 7, false) on conflict (id) do nothing;
insert into leave_types (id, name, default_credits, requires_cert) values ('lt-ml', 'Maternity Leave', 105, true) on conflict (id) do nothing;
insert into leave_types (id, name, default_credits, requires_cert) values ('lt-pl', 'Paternity Leave', 7, false) on conflict (id) do nothing;
insert into leave_types (id, name, default_credits, requires_cert) values ('lt-bl', 'Bereavement Leave', 3, false) on conflict (id) do nothing;
insert into leave_types (id, name, default_credits, requires_cert) values ('lt-lwop', 'Leave Without Pay', 0, false) on conflict (id) do nothing;
