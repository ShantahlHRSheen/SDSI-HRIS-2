-- =============================================================================
-- Phase 86: the built-in Psychological screening for applicants.
--
-- 30 statements answered 1–5 (lib/psych.ts): five work-related traits and
-- validity checks, scored by the HRIS server into a report (result). Given
-- like the initial exam — from a secret link after applying online (when the
-- job post asks for it) or from a link HR makes for a walk-in applicant.
--
--   applicant_exams  + kind ('exam' | 'psych'), + result (the report)
--   job_posts        + psych_screening: online applicants also get it
--
-- The report is confidential: only HR reads psychological screenings (Heads
-- and the final approver keep seeing initial exam results as before).
--
-- Run after phase 85. Safe to re-run. Run it in each company's project.
-- =============================================================================

alter table applicant_exams add column if not exists kind text not null default 'exam';
alter table applicant_exams add column if not exists result jsonb;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'applicant_exams_kind_check') then
    alter table applicant_exams add constraint applicant_exams_kind_check check (kind in ('exam', 'psych'));
  end if;
end $$;

alter table job_posts add column if not exists psych_screening boolean not null default false;

-- Psychological screenings: HR only.
drop policy if exists "applicant exams read" on applicant_exams;
create policy "applicant exams read" on applicant_exams for select to authenticated
  using (app_can_see_applicant(applicant_id) and (kind = 'exam' or coalesce(app_is_hr_manager(), false)));

-- HR's grading still can't change the kind or the report.
create or replace function app_guard_applicant_exam()
returns trigger
language plpgsql
as $$
begin
  if current_setting('app.exam_server', true) = '1' or auth.uid() is null then
    return new; -- the HRIS server (service role)
  end if;
  new.applicant_id := old.applicant_id;
  new.exam_id := old.exam_id;
  new.kind := old.kind;
  new.result := old.result;
  new.token_hash := old.token_hash;
  new.status := old.status;
  new.title := old.title;
  new.instructions := old.instructions;
  new.time_limit_minutes := old.time_limit_minutes;
  new.passing_percent := old.passing_percent;
  new.questions := old.questions;
  new.answers := old.answers;
  new.auto_score := old.auto_score;
  new.max_score := old.max_score;
  new.link_expires_at := old.link_expires_at;
  new.started_at := old.started_at;
  new.deadline_at := old.deadline_at;
  new.submitted_at := old.submitted_at;
  new.created_by := old.created_by;
  new.created_at := old.created_at;
  new.graded_by := app_current_employee_id();
  new.graded_at := now();
  return new;
end;
$$;

-- HR gives the screening to an applicant and gets a link to send (the browser
-- makes the secret; only its hash comes here). The statements come from the
-- app (lib/psych.ts) and are kept with the result; scoring is on the server.
create or replace function hiring_assign_psych(p_applicant text, p_token_hash text, p_title text, p_instructions text, p_questions jsonb)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id text;
begin
  if not coalesce(app_is_hr_manager(), false) then
    raise exception 'Only HR can give the screening.';
  end if;
  if p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Bad link.';
  end if;
  if jsonb_typeof(p_questions) <> 'array' or jsonb_array_length(p_questions) <> 30 then
    raise exception 'The screening must have its 30 statements.';
  end if;
  if not exists (select 1 from applicants where id = p_applicant) then
    raise exception 'Applicant not found.';
  end if;
  insert into applicant_exams (applicant_id, kind, token_hash, title, instructions, passing_percent, questions, max_score, created_by)
  values (p_applicant, 'psych', p_token_hash, left(coalesce(p_title, 'Psychological screening'), 160), coalesce(p_instructions, ''), 0, p_questions, 100, app_current_employee_id())
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function hiring_assign_psych(text, text, text, text, jsonb) from public, anon;
grant execute on function hiring_assign_psych(text, text, text, text, jsonb) to authenticated;

notify pgrst, 'reload schema';
