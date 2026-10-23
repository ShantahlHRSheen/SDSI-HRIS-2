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
