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
  'regular', 'probationary', 'project_based', 'freelance', 'consultant', 'intern', 'unassigned'
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
