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
