-- =============================================================================
-- Phase 68: net pay rounding on a payroll line.
--
-- A payroll file may round Net Pay (e.g. to the nearest 10 centavos). The
-- import saves the difference — up to 5 centavos, + or − — here, and the net
-- pay adds it, so the HRIS and the payslip show the Net Pay that was paid.
-- Gross Salary and the deductions stay as in the file.
--
-- SDSI only (lib/companies.ts payrollNetRounding). Safe to run any time, and
-- safe to re-run.
-- =============================================================================

alter table payroll_line_overrides add column if not exists net_rounding numeric not null default 0;
