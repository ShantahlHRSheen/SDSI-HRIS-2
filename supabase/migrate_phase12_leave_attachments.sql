-- =============================================================================
-- Shantahl HRIS — leave request attachments (signed leave form, medical
-- certificate) + supervisor approvals
--
-- Three changes:
--   1. A private Storage bucket "leave-attachments" and a
--      leave_request_attachments table recording each uploaded file. Files
--      live at "<employee id>/<leave request id>/<kind>-<timestamp>.<ext>".
--      They are deleted 30 days after upload by the daily cleanup job
--      (app/api/cron/purge-leave-attachments), which keeps the table row and
--      sets deleted_at so the app can show "deleted after 30 days".
--   2. Who can see the files: the employee who filed the request, HR/system
--      admins, upper management, and the employee's supervisor if that
--      supervisor has the Dept Head role.
--   3. That supervisor (dept head) can now also see and approve/reject the
--      leave requests of the employees they supervise.
--
-- Safe to run any time, and safe to re-run.
--
-- Run once in the SQL Editor (Database > SQL Editor).
-- =============================================================================

-- Is the signed-in user a Dept Head who is this employee's supervisor?
create or replace function app_is_supervising_dept_head(emp_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select app_is_dept_head()
     and exists (select 1 from employees e where e.id = emp_id and e.supervisor_id = app_current_employee_id());
$$;

-- HR/system admins and upper management — the roles that review all leave.
create or replace function app_can_review_all_leave()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select app_has_any_role(array['hr_admin', 'sys_admin', 'upper_management']::app_role[]);
$$;

-- --- Leave requests: supervising dept heads can see and decide ---------------

drop policy if exists "leave requests read" on leave_requests;
create policy "leave requests read" on leave_requests for select
  using (employee_id = app_current_employee_id() or app_is_elevated() or app_is_supervising_dept_head(employee_id));

drop policy if exists "leave requests update elevated or own pending" on leave_requests;
create policy "leave requests update elevated or own pending" on leave_requests for update
  using (
    app_is_elevated()
    or app_is_supervising_dept_head(employee_id)
    or (employee_id = app_current_employee_id() and status = 'pending')
  )
  with check (
    app_is_elevated()
    or app_is_supervising_dept_head(employee_id)
    or (employee_id = app_current_employee_id() and status = 'pending')
  );

-- --- Attachment records --------------------------------------------------------

create table if not exists leave_request_attachments (
  id text primary key default gen_random_uuid()::text,
  leave_request_id text not null references leave_requests (id) on delete cascade,
  employee_id text not null references employees (id),
  kind text not null check (kind in ('leave_form', 'medical_certificate')),
  storage_path text not null unique,
  file_name text not null,
  content_type text not null,
  size_bytes integer not null,
  uploaded_by text references employees (id),
  uploaded_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists leave_request_attachments_request_idx on leave_request_attachments (leave_request_id);
create index if not exists leave_request_attachments_purge_idx on leave_request_attachments (uploaded_at) where deleted_at is null;

alter table leave_request_attachments enable row level security;

drop policy if exists "leave attachments read" on leave_request_attachments;
create policy "leave attachments read" on leave_request_attachments for select
  using (employee_id = app_current_employee_id() or app_can_review_all_leave() or app_is_supervising_dept_head(employee_id));

-- Employees attach files to their own requests; HR can attach on their behalf.
drop policy if exists "leave attachments insert" on leave_request_attachments;
create policy "leave attachments insert" on leave_request_attachments for insert
  with check (
    exists (select 1 from leave_requests r where r.id = leave_request_id and r.employee_id = leave_request_attachments.employee_id)
    and (employee_id = app_current_employee_id() or app_is_hr_or_admin())
  );
-- No update/delete policies: only the cleanup job (service role) marks rows deleted.

-- --- Storage bucket and file access --------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'leave-attachments', 'leave-attachments', false, 10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- The first folder of every path is the employee id the file belongs to.
drop policy if exists "leave attachments upload" on storage.objects;
create policy "leave attachments upload" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'leave-attachments'
    and ((storage.foldername(name))[1] = app_current_employee_id() or app_is_hr_or_admin())
  );

drop policy if exists "leave attachments download" on storage.objects;
create policy "leave attachments download" on storage.objects for select to authenticated
  using (
    bucket_id = 'leave-attachments'
    and (
      (storage.foldername(name))[1] = app_current_employee_id()
      or app_can_review_all_leave()
      or app_is_supervising_dept_head((storage.foldername(name))[1])
    )
  );
