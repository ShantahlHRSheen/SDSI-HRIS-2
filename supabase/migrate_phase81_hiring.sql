-- =============================================================================
-- Phase 81: Hiring and Onboarding.
--
-- One record per applicant, through four sections:
--   1. HR: application information, resume (shortlisted), HR interview and
--      notes, then schedules the interview with a Branch / Department Head.
--   2. The Head: interview, background investigation and findings, then the
--      assessment and recommendation.
--   3. The final approver (Vice Chairperson for SDSI, VP of Operations for
--      LSMBiz and Daro — chosen by HR in hiring_settings): final decision.
--   4. Onboarding: orientation and handbook, meeting the team (HR); training
--      plan and training assessment with scores and recommendation, signed
--      (the Head); HR receives and signs; the final approver approves or
--      disapproves the recommendation for employment, with a comment, signed.
--
-- status: screening → head → final → onboarding → hr_sign → approval → hired
--         (or rejected / not_hired / withdrawn)
-- Seen by HR, the assigned Head (once HR hands the applicant over) and the
-- final approver (from the final decision on). Heads and the approver change
-- only their own parts, through the functions below.
--
-- Files: the private hiring-files bucket, <applicant id>/<file> (resume,
-- background investigation papers). Signatures: copies of each signer's saved
-- signature in leave-forms, hire/<applicant id>/<head|hr|approver>.png.
--
-- Safe to run any time, and safe to re-run. Then choose the final approver in
-- Hiring & Onboarding → Settings (HR).
-- =============================================================================

create table if not exists hiring_settings (
  id boolean primary key default true check (id),
  final_approver_id text references employees (id) on delete set null
);
insert into hiring_settings (id) values (true) on conflict do nothing;

alter table hiring_settings enable row level security;
drop policy if exists "hiring settings read" on hiring_settings;
create policy "hiring settings read" on hiring_settings for select to authenticated
  using (app_current_employee_id() is not null);
drop policy if exists "hiring settings hr" on hiring_settings;
create policy "hiring settings hr" on hiring_settings for update to authenticated
  using (coalesce(app_is_hr_manager(), false)) with check (coalesce(app_is_hr_manager(), false));

create or replace function app_hiring_approver()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select final_approver_id from hiring_settings where id;
$$;

revoke all on function app_hiring_approver() from public, anon;
grant execute on function app_hiring_approver() to authenticated;

create table if not exists applicants (
  id text primary key default gen_random_uuid()::text,
  status text not null default 'screening'
    check (status in ('screening', 'head', 'final', 'onboarding', 'hr_sign', 'approval', 'hired', 'rejected', 'not_hired', 'withdrawn')),

  -- Section 1 (HR)
  name text not null check (char_length(btrim(name)) between 1 and 150),
  email text not null default '',
  contact_number text not null default '',
  address text not null default '',
  position text not null default '',
  branch_id text references branches (id) on delete set null,
  department_id text references departments (id) on delete set null,
  shortlisted boolean not null default false,
  hr_interview_at timestamptz,
  hr_interview_notes text not null default '',
  hr_interview_result text check (hr_interview_result in ('passed', 'failed')),
  head_id text references employees (id) on delete set null,
  head_interview_at timestamptz,

  -- Section 2 (the Head)
  head_interview_notes text not null default '',
  head_interview_result text check (head_interview_result in ('passed', 'failed')),
  background_findings text not null default '',
  background_result text check (background_result in ('passed', 'failed')),
  head_assessment text not null default '',
  head_recommendation text check (head_recommendation in ('hire', 'do_not_hire')),
  head_submitted_at timestamptz,

  -- Section 3 (final approver)
  final_decision text check (final_decision in ('hire', 'reject')),
  final_comment text not null default '',
  final_decided_by text references employees (id) on delete set null,
  final_decided_at timestamptz,

  -- Section 4 (onboarding)
  orientation_at date,
  handbook_received_at date,
  team_meeting_at date,
  -- [{skill, schedule, status: 'planned'|'ongoing'|'completed'}]
  training jsonb not null default '[]'::jsonb check (jsonb_typeof(training) = 'array'),
  -- [{item, required, score}] — what's assessed, the score required, the score given
  training_assessment jsonb not null default '[]'::jsonb check (jsonb_typeof(training_assessment) = 'array'),
  eval_recommendation text not null default '',
  eval_submitted_at timestamptz,
  hr_signed_by text references employees (id) on delete set null,
  hr_signed_at timestamptz,
  approval text check (approval in ('approved', 'disapproved')),
  approval_comment text not null default '',
  approved_by text references employees (id) on delete set null,
  approved_at timestamptz,
  employee_id text references employees (id) on delete set null, -- once added as an employee

  created_by text references employees (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (octet_length(training::text) + octet_length(training_assessment::text) <= 100000)
);

create index if not exists applicants_status_idx on applicants (status);
create index if not exists applicants_head_idx on applicants (head_id);

create or replace function app_touch_applicant()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  if tg_op = 'INSERT' then
    new.created_by := app_current_employee_id();
    new.created_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists applicants_touch on applicants;
create trigger applicants_touch
  before insert or update on applicants
  for each row execute function app_touch_applicant();

-- Who may see an applicant.
create or replace function app_can_see_applicant(p_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(app_is_hr_manager(), false)
      or exists (select 1 from applicants a
                  where a.id = p_id
                    and ((a.head_id = app_current_employee_id() and a.status <> 'screening')
                         or (app_hiring_approver() = app_current_employee_id()
                             and (a.status in ('final', 'onboarding', 'hr_sign', 'approval', 'hired', 'not_hired')
                                  or a.final_decided_at is not null))));
$$;

revoke all on function app_can_see_applicant(text) from public, anon;
grant execute on function app_can_see_applicant(text) to authenticated;

alter table applicants enable row level security;

drop policy if exists "applicants read" on applicants;
create policy "applicants read" on applicants for select to authenticated
  using (app_can_see_applicant(id));
-- HR keeps the record (section 1, onboarding checklist, status).
drop policy if exists "applicants hr" on applicants;
create policy "applicants hr" on applicants for all to authenticated
  using (coalesce(app_is_hr_manager(), false))
  with check (coalesce(app_is_hr_manager(), false));

-- ---- The Head ----------------------------------------------------------------------

-- Saves the Head's parts: section 2 while it's theirs, the training plan and
-- assessment during onboarding.
create or replace function hiring_head_save(p_id text, p jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  a applicants%rowtype;
begin
  select * into a from applicants where id = p_id for update;
  if not found or a.head_id is distinct from app_current_employee_id() then
    raise exception 'This applicant isn''t assigned to you.';
  end if;
  if a.status = 'head' then
    update applicants set
      head_interview_notes = coalesce(p ->> 'headInterviewNotes', head_interview_notes),
      head_interview_result = case when p ? 'headInterviewResult' then nullif(p ->> 'headInterviewResult', '') else head_interview_result end,
      background_findings = coalesce(p ->> 'backgroundFindings', background_findings),
      background_result = case when p ? 'backgroundResult' then nullif(p ->> 'backgroundResult', '') else background_result end,
      head_assessment = coalesce(p ->> 'headAssessment', head_assessment),
      head_recommendation = case when p ? 'headRecommendation' then nullif(p ->> 'headRecommendation', '') else head_recommendation end
    where id = p_id;
  elsif a.status = 'onboarding' then
    update applicants set
      training = coalesce(p -> 'training', training),
      training_assessment = coalesce(p -> 'trainingAssessment', training_assessment),
      eval_recommendation = coalesce(p ->> 'evalRecommendation', eval_recommendation)
    where id = p_id;
  else
    raise exception 'There''s nothing for you to fill in at this step.';
  end if;
end;
$$;

revoke all on function hiring_head_save(text, jsonb) from public, anon;
grant execute on function hiring_head_save(text, jsonb) to authenticated;

-- Section 2 done: sent to the final approver (recommended) or closed.
create or replace function hiring_head_submit(p_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  a applicants%rowtype;
begin
  select * into a from applicants where id = p_id for update;
  if not found or a.head_id is distinct from app_current_employee_id() or a.status <> 'head' then
    raise exception 'This applicant isn''t waiting for your assessment.';
  end if;
  if a.head_interview_result is null or a.head_recommendation is null or btrim(a.head_assessment) = '' then
    raise exception 'Fill in the interview result, the assessment and your recommendation first.';
  end if;
  if a.head_interview_result = 'passed' and a.background_result is null then
    raise exception 'Fill in the background investigation findings and result first.';
  end if;
  update applicants
     set status = case when a.head_recommendation = 'hire' then 'final' else 'rejected' end,
         head_submitted_at = now()
   where id = p_id;
end;
$$;

revoke all on function hiring_head_submit(text) from public, anon;
grant execute on function hiring_head_submit(text) to authenticated;

-- Onboarding: the training assessment and recommendation, signed, to HR.
create or replace function hiring_head_submit_eval(p_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  a applicants%rowtype;
begin
  select * into a from applicants where id = p_id for update;
  if not found or a.head_id is distinct from app_current_employee_id() or a.status <> 'onboarding' then
    raise exception 'This isn''t waiting for your training assessment.';
  end if;
  if jsonb_array_length(a.training_assessment) = 0 or btrim(a.eval_recommendation) = '' then
    raise exception 'Fill in the assessment and your recommendation first.';
  end if;
  if not app_leave_form_file_exists('hire/' || p_id || '/head.png') then
    raise exception 'Attach your signature first.';
  end if;
  update applicants set status = 'hr_sign', eval_submitted_at = now() where id = p_id;
end;
$$;

revoke all on function hiring_head_submit_eval(text) from public, anon;
grant execute on function hiring_head_submit_eval(text) to authenticated;

-- HR returns the assessment to the Head (e.g. to correct it). The app
-- removes the Head's signature copy (hire/<id>/head.png) first.
create or replace function hiring_return_eval(p_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not coalesce(app_is_hr_manager(), false) then
    raise exception 'Only HR can return the assessment.';
  end if;
  update applicants set status = 'onboarding', eval_submitted_at = null where id = p_id and status = 'hr_sign';
end;
$$;

revoke all on function hiring_return_eval(text) from public, anon;
grant execute on function hiring_return_eval(text) to authenticated;

-- ---- HR signs the recommendation for employment ----------------------------------

create or replace function hiring_hr_sign(p_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not coalesce(app_is_hr_manager(), false) then
    raise exception 'Only HR can sign this.';
  end if;
  if not exists (select 1 from applicants where id = p_id and status = 'hr_sign') then
    raise exception 'This isn''t waiting for HR''s signature.';
  end if;
  if not app_leave_form_file_exists('hire/' || p_id || '/hr.png') then
    raise exception 'Attach your signature first.';
  end if;
  update applicants set status = 'approval', hr_signed_by = app_current_employee_id(), hr_signed_at = now() where id = p_id;
end;
$$;

revoke all on function hiring_hr_sign(text) from public, anon;
grant execute on function hiring_hr_sign(text) to authenticated;

-- ---- The final approver -------------------------------------------------------------

-- Section 3: the final hiring decision.
create or replace function hiring_final_decide(p_id text, p_hire boolean, p_comment text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if app_hiring_approver() is distinct from app_current_employee_id() then
    raise exception 'Only the final approver can decide.';
  end if;
  update applicants
     set status = case when p_hire then 'onboarding' else 'rejected' end,
         final_decision = case when p_hire then 'hire' else 'reject' end,
         final_comment = left(coalesce(p_comment, ''), 4000),
         final_decided_by = app_current_employee_id(),
         final_decided_at = now()
   where id = p_id and status = 'final';
  if not found then
    raise exception 'This applicant isn''t waiting for the final decision.';
  end if;
end;
$$;

revoke all on function hiring_final_decide(text, boolean, text) from public, anon;
grant execute on function hiring_final_decide(text, boolean, text) to authenticated;

-- Onboarding: approve or disapprove the recommendation for employment, signed.
create or replace function hiring_approve(p_id text, p_approve boolean, p_comment text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if app_hiring_approver() is distinct from app_current_employee_id() then
    raise exception 'Only the final approver can approve this.';
  end if;
  if not exists (select 1 from applicants where id = p_id and status = 'approval') then
    raise exception 'This isn''t waiting for your approval.';
  end if;
  if not app_leave_form_file_exists('hire/' || p_id || '/approver.png') then
    raise exception 'Attach your signature first.';
  end if;
  update applicants
     set status = case when p_approve then 'hired' else 'not_hired' end,
         approval = case when p_approve then 'approved' else 'disapproved' end,
         approval_comment = left(coalesce(p_comment, ''), 4000),
         approved_by = app_current_employee_id(),
         approved_at = now()
   where id = p_id;
end;
$$;

revoke all on function hiring_approve(text, boolean, text) from public, anon;
grant execute on function hiring_approve(text, boolean, text) to authenticated;

-- ---- Files --------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('hiring-files', 'hiring-files', false, 10485760, array[
  'application/pdf', 'image/png', 'image/jpeg', 'image/webp',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Read: whoever sees the applicant. Add: HR, or the Head (background
-- investigation papers) while section 2 is theirs. Delete: HR.
drop policy if exists "hiring files read" on storage.objects;
create policy "hiring files read" on storage.objects for select to authenticated
  using (bucket_id = 'hiring-files' and app_can_see_applicant(split_part(name, '/', 1)));
drop policy if exists "hiring files add" on storage.objects;
create policy "hiring files add" on storage.objects for insert to authenticated
  with check (bucket_id = 'hiring-files'
              and (coalesce(app_is_hr_manager(), false)
                   or exists (select 1 from applicants a where a.id = split_part(objects.name, '/', 1)
                               and a.head_id = app_current_employee_id() and a.status = 'head'))
              and exists (select 1 from applicants a where a.id = split_part(objects.name, '/', 1)));
drop policy if exists "hiring files delete hr" on storage.objects;
create policy "hiring files delete hr" on storage.objects for delete to authenticated
  using (bucket_id = 'hiring-files' and coalesce(app_is_hr_manager(), false));

-- Signatures: hire/<id>/<head|hr|approver>.png in leave-forms, while that step is open.
create or replace function app_can_sign_hire(path text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select path ~ '^hire/[^/]+/(head|hr|approver)\.png$'
    and exists (
      select 1 from applicants a
       where a.id = split_part(path, '/', 2)
         and case split_part(path, '/', 3)
               when 'head.png' then a.status = 'onboarding' and a.head_id = app_current_employee_id()
               when 'hr.png' then a.status = 'hr_sign' and coalesce(app_is_hr_manager(), false)
               when 'approver.png' then a.status = 'approval' and app_hiring_approver() = app_current_employee_id()
               else false
             end);
$$;

revoke all on function app_can_sign_hire(text) from public, anon;
grant execute on function app_can_sign_hire(text) to authenticated;

drop policy if exists "hire signatures read" on storage.objects;
create policy "hire signatures read" on storage.objects for select to authenticated
  using (bucket_id = 'leave-forms' and name like 'hire/%' and app_can_see_applicant(split_part(name, '/', 2)));
drop policy if exists "hire sign" on storage.objects;
create policy "hire sign" on storage.objects for insert to authenticated
  with check (bucket_id = 'leave-forms' and app_can_sign_hire(name));
drop policy if exists "hire re-sign" on storage.objects;
create policy "hire re-sign" on storage.objects for update to authenticated
  using (bucket_id = 'leave-forms' and app_can_sign_hire(name))
  with check (bucket_id = 'leave-forms' and app_can_sign_hire(name));
drop policy if exists "hire files delete hr" on storage.objects;
create policy "hire files delete hr" on storage.objects for delete to authenticated
  using (bucket_id = 'leave-forms' and name like 'hire/%' and coalesce(app_is_hr_manager(), false));

-- Guests (phase 79) are kept out of the new tables too.
do $$
begin
  if exists (select 1 from pg_proc where proname = 'app_is_guest') then
    execute 'drop policy if exists "no guests" on public.applicants';
    execute 'create policy "no guests" on public.applicants as restrictive for all to authenticated using (not app_is_guest()) with check (not app_is_guest())';
    execute 'drop policy if exists "no guests" on public.hiring_settings';
    execute 'create policy "no guests" on public.hiring_settings as restrictive for all to authenticated using (not app_is_guest()) with check (not app_is_guest())';
  end if;
end $$;
