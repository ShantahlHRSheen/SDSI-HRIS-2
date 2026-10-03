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
