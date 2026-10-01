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

update payroll_periods p set required_days = v.days
from (values
  ('2026-01-01', 11), ('2026-01-16', 14),
  ('2026-02-01', 13), ('2026-02-16', 11),
  ('2026-03-01', 12), ('2026-03-16', 13),
  ('2026-04-01', 10), ('2026-04-16', 13),
  ('2026-05-01', 12), ('2026-05-16', 13),
  ('2026-06-01', 13), ('2026-06-16', 13),
  ('2026-07-01', 13), ('2026-07-16', 14),
  ('2026-08-01', 13), ('2026-08-16', 13),
  ('2026-09-01', 13), ('2026-09-16', 13)
) as v(start_date, days)
where p.period_start = v.start_date::date;
