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
