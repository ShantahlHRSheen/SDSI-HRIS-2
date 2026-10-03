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
