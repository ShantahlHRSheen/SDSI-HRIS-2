-- =====================================================================
-- Phase 83: Hiring & Onboarding overview — the last step, Contract signing.
--
-- After the recommendation for employment is approved (status 'hired'),
-- HR records the date the employee signed the contract. Only HR edits
-- applicants directly (policy "applicants hr", phase 81), so nothing else
-- changes. Run after phase 81. Safe to run more than once.
-- =====================================================================

alter table applicants add column if not exists contract_signed_at date;

notify pgrst, 'reload schema';
