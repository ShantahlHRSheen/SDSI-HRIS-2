-- =============================================================================
-- Shantahl HRIS — "Prepared by" signature on printed vouchers
--
--   * Lets the company-documents bucket also hold PNG images, for the HR
--     Manager's signature (signatures/prepared-by.png) that prints above
--     "Prepared by" on vouchers. Every signed-in user can view it (vouchers
--     are printed by payroll/accounting too); only HR can upload, replace
--     or remove it.
--
-- Safe to run any time, and safe to re-run.
-- Run once in the SQL Editor (Database > SQL Editor).
-- =============================================================================

update storage.buckets
   set allowed_mime_types = array['application/pdf', 'image/png']
 where id = 'company-documents';

drop policy if exists "company documents remove" on storage.objects;
create policy "company documents remove" on storage.objects for delete to authenticated
  using (bucket_id = 'company-documents' and app_is_hr_manager());
