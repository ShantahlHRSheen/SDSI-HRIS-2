-- =============================================================================
-- Phase 70: notes on a payroll cut-off.
--
-- HR / payroll leave a note for a cut-off (by its end date, so a note can be
-- left for one that isn't set up yet), about one employee or the whole
-- payroll — e.g. "Nov 15: reimburse Karlou Japitan's SSS loan". It shows on
-- Payroll Processing for that cut-off, and on the employee's line, until
-- it's marked done.
--
-- Read by everyone who can see payroll; written by HR and payroll officers.
-- Safe to run any time, and safe to re-run.
-- =============================================================================

create table if not exists payroll_notes (
  id text primary key default gen_random_uuid()::text,
  cutoff_end date not null,
  employee_id text references employees (id) on delete cascade,
  note text not null check (char_length(btrim(note)) between 1 and 1000),
  created_by text references employees (id) on delete set null,
  created_by_name text not null default '',
  created_at timestamptz not null default now(),
  done_at timestamptz,
  done_by_name text
);

create index if not exists payroll_notes_cutoff_idx on payroll_notes (cutoff_end);

create or replace function app_fill_payroll_note()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := app_current_employee_id();
    new.created_by_name := coalesce((select trim(both ' ' from coalesce(first_name, '') || ' ' || coalesce(last_name, '')) from employees where id = new.created_by), '');
    new.created_at := now();
    new.done_at := null;
    new.done_by_name := null;
  else
    new.created_by := old.created_by;
    new.created_by_name := old.created_by_name;
    new.created_at := old.created_at;
    if new.done_at is not null and old.done_at is null then
      new.done_at := now();
      new.done_by_name := coalesce((select trim(both ' ' from coalesce(first_name, '') || ' ' || coalesce(last_name, '')) from employees where id = app_current_employee_id()), '');
    elsif new.done_at is null then
      new.done_by_name := null;
    else
      new.done_at := old.done_at;
      new.done_by_name := old.done_by_name;
    end if;
  end if;
  new.note := btrim(new.note);
  return new;
end;
$$;

drop trigger if exists payroll_notes_fill on payroll_notes;
create trigger payroll_notes_fill
  before insert or update on payroll_notes
  for each row execute function app_fill_payroll_note();

alter table payroll_notes enable row level security;

drop policy if exists "payroll notes read" on payroll_notes;
create policy "payroll notes read" on payroll_notes for select to authenticated
  using (app_is_elevated());
drop policy if exists "payroll notes write" on payroll_notes;
create policy "payroll notes write" on payroll_notes for all to authenticated
  using (app_has_any_role(array['hr_admin', 'payroll_officer']::app_role[]))
  with check (app_has_any_role(array['hr_admin', 'payroll_officer']::app_role[]));
