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
