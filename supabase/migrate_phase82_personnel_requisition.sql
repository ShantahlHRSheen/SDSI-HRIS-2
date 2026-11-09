-- =============================================================================
-- Phase 82: Personnel Requisition Form (HR-PRF-001), in Hiring & Onboarding.
--
--   1. The Branch / Department Head fills it in (A. request details, B. type
--      of request, C. reason, D. job requirements), recommends and signs.
--   2. HR reviews it (F. HR assessment: action, remarks / next steps, date
--      received, target recruitment completion), recommends and signs — or
--      returns it to the Head.
--   3. The final approver — VP for Operations (LSMBiz), Vice Chairperson
--      (Shantahl, Daro Lending), chosen by HR in hiring_settings — approves,
--      defers (on hold) or disapproves, with remarks, and signs.
-- An approved request can be linked to the applicants hired for it.
--
-- status: draft → hr_review → approval → approved / deferred / disapproved
--         (or cancelled). A deferred request can be decided again.
-- Seen by HR, the person who made it, and the final approver (from the
-- approval step on). Signatures: copies of each signer's saved signature in
-- leave-forms, prf/<id>/<head|hr|approver>.png.
--
-- Run after phase 81. Safe to re-run.
-- =============================================================================

alter table hiring_settings add column if not exists requisition_approver_id text references employees (id) on delete set null;

create or replace function app_requisition_approver()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select requisition_approver_id from hiring_settings where id;
$$;

revoke all on function app_requisition_approver() from public, anon;
grant execute on function app_requisition_approver() to authenticated;

create sequence if not exists personnel_requisition_no;

create table if not exists personnel_requisitions (
  id text primary key default gen_random_uuid()::text,
  prf_no text unique, -- PRF-2026-0001, given when sent to HR
  status text not null default 'draft'
    check (status in ('draft', 'hr_review', 'approval', 'approved', 'deferred', 'disapproved', 'cancelled')),

  -- A. Request details
  position text not null check (char_length(btrim(position)) between 1 and 150),
  branch_id text references branches (id) on delete set null,
  department_id text references departments (id) on delete set null,
  requested_by_name text not null default '',
  requested_by_position text not null default '',
  personnel_needed integer not null default 1 check (personnel_needed between 1 and 500),
  employment_type text check (employment_type in ('regular', 'probationary', 'reliever', 'project_based')),
  target_date date,
  -- B. Type of request
  request_type text check (request_type in ('new', 'replace_resigned', 'replace_terminated', 'replace_transferred', 'other')),
  request_type_other text not null default '',
  -- C. Reason
  reason text not null default '',
  previous_employee text not null default '',
  -- D. Job requirements
  education text check (education in ('high_school', 'college', 'vocational', 'other')),
  education_other text not null default '',
  work_experience text not null default '',
  skills text not null default '',

  -- E1. The requesting Head
  head_recommendation text check (head_recommendation in ('recommended', 'not_recommended')),
  head_remarks text not null default '',
  head_signed_at timestamptz,
  -- F. HR assessment
  hr_action text check (hr_action in ('for_recruitment', 'further_evaluation', 'on_hold', 'not_recommended')),
  hr_remarks text not null default '',
  hr_received_at date,
  hr_target_completion date,
  hr_by text references employees (id) on delete set null,
  hr_name text not null default '',
  hr_signed_at timestamptz,
  returned_note text not null default '',
  -- E3. Final approval
  decision text check (decision in ('approved', 'deferred', 'disapproved')),
  decision_remarks text not null default '',
  decided_by text references employees (id) on delete set null,
  decided_name text not null default '',
  decided_at timestamptz,

  created_by text references employees (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists personnel_requisitions_status_idx on personnel_requisitions (status);
create index if not exists personnel_requisitions_created_by_idx on personnel_requisitions (created_by);

alter table applicants add column if not exists requisition_id text references personnel_requisitions (id) on delete set null;

-- Keeps each part with its owner: only HR changes HR's part, and the steps
-- below (which set app.prf_step) set the number, signatures and decision.
create or replace function app_touch_requisition()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  if tg_op = 'INSERT' then
    new.created_by := app_current_employee_id();
    new.created_at := now();
    new.status := 'draft';
  end if;
  if coalesce(current_setting('app.prf_step', true), '') = '1' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.prf_no := null;
    new.head_signed_at := null;
    new.hr_by := null;
    new.hr_name := '';
    new.hr_signed_at := null;
    new.decision := null;
    new.decision_remarks := '';
    new.decided_by := null;
    new.decided_name := '';
    new.decided_at := null;
    if not coalesce(app_is_hr_manager(), false) then
      new.hr_action := null;
      new.hr_remarks := '';
      new.hr_received_at := null;
      new.hr_target_completion := null;
      new.returned_note := '';
    end if;
  else
    new.prf_no := old.prf_no;
    new.head_signed_at := old.head_signed_at;
    new.hr_by := old.hr_by;
    new.hr_name := old.hr_name;
    new.hr_signed_at := old.hr_signed_at;
    new.decision := old.decision;
    new.decision_remarks := old.decision_remarks;
    new.decided_by := old.decided_by;
    new.decided_name := old.decided_name;
    new.decided_at := old.decided_at;
    if not coalesce(app_is_hr_manager(), false) then
      new.hr_action := old.hr_action;
      new.hr_remarks := old.hr_remarks;
      new.hr_received_at := old.hr_received_at;
      new.hr_target_completion := old.hr_target_completion;
      new.returned_note := old.returned_note;
    end if;
    -- Status moves only through the steps (HR may cancel; the maker may cancel a draft).
    if new.status is distinct from old.status and not (new.status = 'cancelled' and old.status not in ('approved', 'disapproved')) then
      new.status := old.status;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists personnel_requisitions_touch on personnel_requisitions;
create trigger personnel_requisitions_touch
  before insert or update on personnel_requisitions
  for each row execute function app_touch_requisition();

create or replace function app_can_see_requisition(p_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(app_is_hr_manager(), false)
      or exists (select 1 from personnel_requisitions r
                  where r.id = p_id
                    and (r.created_by = app_current_employee_id()
                         or (app_requisition_approver() = app_current_employee_id()
                             and r.status in ('approval', 'approved', 'deferred', 'disapproved'))));
$$;

revoke all on function app_can_see_requisition(text) from public, anon;
grant execute on function app_can_see_requisition(text) to authenticated;

alter table personnel_requisitions enable row level security;

drop policy if exists "prf read" on personnel_requisitions;
create policy "prf read" on personnel_requisitions for select to authenticated
  using (coalesce(app_is_hr_manager(), false)
         or created_by = app_current_employee_id()
         or (app_requisition_approver() = app_current_employee_id()
             and status in ('approval', 'approved', 'deferred', 'disapproved')));
-- Heads (and HR, upper management) start a request.
drop policy if exists "prf add" on personnel_requisitions;
create policy "prf add" on personnel_requisitions for insert to authenticated
  with check (app_current_employee_id() is not null
              and app_has_any_role(array['dept_head', 'hr_admin', 'upper_management']::app_role[]));
-- The one who made it edits it while it's a draft; HR any time.
drop policy if exists "prf edit own draft" on personnel_requisitions;
create policy "prf edit own draft" on personnel_requisitions for update to authenticated
  using (created_by = app_current_employee_id() and status = 'draft')
  with check (created_by = app_current_employee_id() and status in ('draft', 'cancelled'));
drop policy if exists "prf hr" on personnel_requisitions;
create policy "prf hr" on personnel_requisitions for all to authenticated
  using (coalesce(app_is_hr_manager(), false))
  with check (coalesce(app_is_hr_manager(), false));
drop policy if exists "prf delete own draft" on personnel_requisitions;
create policy "prf delete own draft" on personnel_requisitions for delete to authenticated
  using (created_by = app_current_employee_id() and status = 'draft');

-- Applicants can see the request they were hired for (title only, via the app).

-- ---- Steps --------------------------------------------------------------------------

-- The Head sends the signed request to HR.
create or replace function prf_submit(p_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r personnel_requisitions%rowtype;
begin
  select * into r from personnel_requisitions where id = p_id for update;
  if not found or r.created_by is distinct from app_current_employee_id() or r.status <> 'draft' then
    raise exception 'This request isn''t yours to send.';
  end if;
  if r.employment_type is null or r.request_type is null or btrim(r.reason) = '' or r.head_recommendation is null then
    raise exception 'Fill in the employment type, the type of request, the reason and your recommendation first.';
  end if;
  if not app_leave_form_file_exists('prf/' || p_id || '/head.png') then
    raise exception 'Attach your signature first.';
  end if;
  perform set_config('app.prf_step', '1', true);
  update personnel_requisitions
     set status = 'hr_review',
         head_signed_at = now(),
         returned_note = '',
         prf_no = coalesce(prf_no, 'PRF-' || to_char(now() at time zone 'Asia/Manila', 'YYYY') || '-' || lpad(nextval('personnel_requisition_no')::text, 4, '0'))
   where id = p_id;
end;
$$;

revoke all on function prf_submit(text) from public, anon;
grant execute on function prf_submit(text) to authenticated;

-- HR returns it to the Head for changes (the app removes the Head's signature copy first).
create or replace function prf_return(p_id text, p_note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not coalesce(app_is_hr_manager(), false) then
    raise exception 'Only HR can return a request.';
  end if;
  perform set_config('app.prf_step', '1', true);
  update personnel_requisitions set status = 'draft', head_signed_at = null, returned_note = left(coalesce(p_note, ''), 2000)
   where id = p_id and status = 'hr_review';
  if not found then
    raise exception 'This request isn''t waiting for HR''s review.';
  end if;
end;
$$;

revoke all on function prf_return(text, text) from public, anon;
grant execute on function prf_return(text, text) to authenticated;

-- HR's assessment, signed, to the final approver.
create or replace function prf_hr_review(p_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r personnel_requisitions%rowtype;
begin
  if not coalesce(app_is_hr_manager(), false) then
    raise exception 'Only HR can review a request.';
  end if;
  select * into r from personnel_requisitions where id = p_id for update;
  if not found or r.status <> 'hr_review' then
    raise exception 'This request isn''t waiting for HR''s review.';
  end if;
  if r.hr_action is null then
    raise exception 'Choose HR''s action first.';
  end if;
  if not app_leave_form_file_exists('prf/' || p_id || '/hr.png') then
    raise exception 'Attach your signature first.';
  end if;
  perform set_config('app.prf_step', '1', true);
  update personnel_requisitions
     set status = 'approval', hr_by = app_current_employee_id(), hr_signed_at = now(),
         hr_name = coalesce((select btrim(first_name || ' ' || last_name) from employees where id = app_current_employee_id()), ''),
         hr_received_at = coalesce(hr_received_at, (now() at time zone 'Asia/Manila')::date)
   where id = p_id;
end;
$$;

revoke all on function prf_hr_review(text) from public, anon;
grant execute on function prf_hr_review(text) to authenticated;

-- The final approver: approved / deferred (on hold) / disapproved, signed.
create or replace function prf_decide(p_id text, p_decision text, p_remarks text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if app_requisition_approver() is distinct from app_current_employee_id() then
    raise exception 'Only the final approver can decide.';
  end if;
  if p_decision not in ('approved', 'deferred', 'disapproved') then
    raise exception 'Choose Approved, Deferred or Disapproved.';
  end if;
  if not app_leave_form_file_exists('prf/' || p_id || '/approver.png') then
    raise exception 'Attach your signature first.';
  end if;
  perform set_config('app.prf_step', '1', true);
  update personnel_requisitions
     set status = p_decision, decision = p_decision, decision_remarks = left(coalesce(p_remarks, ''), 4000),
         decided_by = app_current_employee_id(), decided_at = now(),
         decided_name = coalesce((select btrim(first_name || ' ' || last_name) from employees where id = app_current_employee_id()), '')
   where id = p_id and status in ('approval', 'deferred');
  if not found then
    raise exception 'This request isn''t waiting for your approval.';
  end if;
end;
$$;

revoke all on function prf_decide(text, text, text) from public, anon;
grant execute on function prf_decide(text, text, text) to authenticated;

-- ---- Signatures: prf/<id>/<head|hr|approver>.png in leave-forms -------------------------

create or replace function app_can_sign_prf(path text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select path ~ '^prf/[^/]+/(head|hr|approver)\.png$'
    and exists (
      select 1 from personnel_requisitions r
       where r.id = split_part(path, '/', 2)
         and case split_part(path, '/', 3)
               when 'head.png' then r.status = 'draft' and r.created_by = app_current_employee_id()
               when 'hr.png' then r.status = 'hr_review' and coalesce(app_is_hr_manager(), false)
               when 'approver.png' then r.status in ('approval', 'deferred') and app_requisition_approver() = app_current_employee_id()
               else false
             end);
$$;

revoke all on function app_can_sign_prf(text) from public, anon;
grant execute on function app_can_sign_prf(text) to authenticated;

drop policy if exists "prf signatures read" on storage.objects;
create policy "prf signatures read" on storage.objects for select to authenticated
  using (bucket_id = 'leave-forms' and name like 'prf/%' and app_can_see_requisition(split_part(name, '/', 2)));
drop policy if exists "prf sign" on storage.objects;
create policy "prf sign" on storage.objects for insert to authenticated
  with check (bucket_id = 'leave-forms' and app_can_sign_prf(name));
drop policy if exists "prf re-sign" on storage.objects;
create policy "prf re-sign" on storage.objects for update to authenticated
  using (bucket_id = 'leave-forms' and app_can_sign_prf(name))
  with check (bucket_id = 'leave-forms' and app_can_sign_prf(name));
drop policy if exists "prf signature delete" on storage.objects;
create policy "prf signature delete" on storage.objects for delete to authenticated
  using (bucket_id = 'leave-forms' and name like 'prf/%'
         and (coalesce(app_is_hr_manager(), false)
              or exists (select 1 from personnel_requisitions r where r.id = split_part(objects.name, '/', 2)
                          and r.created_by = app_current_employee_id() and r.status = 'draft')));

-- Guests (phase 79) are kept out.
do $$
begin
  if exists (select 1 from pg_proc where proname = 'app_is_guest') then
    execute 'drop policy if exists "no guests" on public.personnel_requisitions';
    execute 'create policy "no guests" on public.personnel_requisitions as restrictive for all to authenticated using (not app_is_guest()) with check (not app_is_guest())';
  end if;
end $$;
