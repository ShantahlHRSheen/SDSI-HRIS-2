-- =============================================================================
-- Phase 85: Initial exams for applicants.
--
--   exams             HR builds an exam: instructions, an optional time limit,
--                     the passing score (%), and questions — multiple choice
--                     (scored automatically) or essay (HR scores it).
--   job_posts         + exam_id: the exam for that job's online applicants.
--   applicant_exams   one per applicant per exam: a copy of the questions as
--                     they were when it was given (so later edits don't change
--                     a result), the answers, the scores and HR's grading.
--
-- Applicants never sign in. Right after applying online (or from a link HR
-- copies for a walk-in applicant) they get a secret link; only its SHA-256
-- hash is stored. The exam is served, timed and scored by the HRIS server
-- (app/api/careers/exam) — correct answers never reach the applicant's
-- browser, and nothing here is readable or writable anonymously.
--
-- Run after phase 84. Safe to re-run. Run it in each company's project.
-- =============================================================================

create table if not exists exams (
  id text primary key default gen_random_uuid()::text,
  status text not null default 'draft' check (status in ('draft', 'active', 'archived')),
  title text not null check (length(trim(title)) between 2 and 160),
  instructions text not null default '',
  time_limit_minutes integer check (time_limit_minutes between 1 and 600),
  passing_percent integer not null default 75 check (passing_percent between 0 and 100),
  -- [{id, kind: 'choice'|'essay', prompt, choices: [..], answer: index, points}]
  questions jsonb not null default '[]'::jsonb check (jsonb_typeof(questions) = 'array'),
  created_by text references employees (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function app_touch_exam()
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
drop trigger if exists exams_touch on exams;
create trigger exams_touch before insert or update on exams
  for each row execute function app_touch_exam();

alter table exams enable row level security;
-- Exams (with their answer keys) are HR's only.
drop policy if exists "exams hr" on exams;
create policy "exams hr" on exams for all to authenticated
  using (coalesce(app_is_hr_manager(), false))
  with check (coalesce(app_is_hr_manager(), false));

alter table job_posts add column if not exists exam_id text references exams (id) on delete set null;

create table if not exists applicant_exams (
  id text primary key default gen_random_uuid()::text,
  applicant_id text not null references applicants (id) on delete cascade,
  exam_id text references exams (id) on delete set null,
  token_hash text not null unique,
  status text not null default 'pending' check (status in ('pending', 'in_progress', 'submitted', 'expired')),
  title text not null default '',
  instructions text not null default '',
  time_limit_minutes integer,
  passing_percent integer not null default 75,
  questions jsonb not null default '[]'::jsonb,   -- the copy given, with the key
  answers jsonb not null default '{}'::jsonb,     -- {question id: choice index | text}
  auto_score numeric not null default 0,          -- multiple choice
  essay_scores jsonb not null default '{}'::jsonb, -- {question id: points}, by HR
  max_score numeric not null default 0,
  link_expires_at timestamptz not null default now() + interval '7 days',
  started_at timestamptz,
  deadline_at timestamptz,
  submitted_at timestamptz,
  graded_by text references employees (id) on delete set null,
  graded_at timestamptz,
  created_by text references employees (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists applicant_exams_applicant_idx on applicant_exams (applicant_id);

alter table applicant_exams enable row level security;
-- Whoever sees the applicant sees the result; HR grades the essays.
drop policy if exists "applicant exams read" on applicant_exams;
create policy "applicant exams read" on applicant_exams for select to authenticated
  using (app_can_see_applicant(applicant_id));
drop policy if exists "applicant exams hr" on applicant_exams;
create policy "applicant exams hr" on applicant_exams for update to authenticated
  using (coalesce(app_is_hr_manager(), false))
  with check (coalesce(app_is_hr_manager(), false));
drop policy if exists "applicant exams hr delete" on applicant_exams;
create policy "applicant exams hr delete" on applicant_exams for delete to authenticated
  using (coalesce(app_is_hr_manager(), false));

-- HR's grading touches only the essay scores (and who graded); the answers,
-- the copy of the exam and the automatic score stay as the server set them.
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
drop trigger if exists applicant_exams_guard on applicant_exams;
create trigger applicant_exams_guard before update on applicant_exams
  for each row execute function app_guard_applicant_exam();

-- HR gives an exam to an applicant (e.g. a walk-in) and gets a link to send:
-- the browser makes the secret, only its hash comes here.
create or replace function hiring_assign_exam(p_applicant text, p_exam text, p_token_hash text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  e exams%rowtype;
  v_id text;
  v_max numeric;
begin
  if not coalesce(app_is_hr_manager(), false) then
    raise exception 'Only HR can give an exam.';
  end if;
  if p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Bad link.';
  end if;
  select * into e from exams where id = p_exam;
  if e.id is null or e.status <> 'active' then
    raise exception 'Choose an active exam.';
  end if;
  if jsonb_array_length(e.questions) = 0 then
    raise exception 'This exam has no questions yet.';
  end if;
  if not exists (select 1 from applicants where id = p_applicant) then
    raise exception 'Applicant not found.';
  end if;
  select coalesce(sum(greatest(coalesce((q ->> 'points')::numeric, 1), 0)), 0) into v_max
    from jsonb_array_elements(e.questions) q;
  insert into applicant_exams (applicant_id, exam_id, token_hash, title, instructions, time_limit_minutes,
                               passing_percent, questions, max_score, created_by)
  values (p_applicant, e.id, p_token_hash, e.title, e.instructions, e.time_limit_minutes,
          e.passing_percent, e.questions, v_max, app_current_employee_id())
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function hiring_assign_exam(text, text, text) from public, anon;
grant execute on function hiring_assign_exam(text, text, text) to authenticated;

-- Guests (phase 79) stay out.
do $$
begin
  if exists (select 1 from pg_proc where proname = 'app_is_guest') then
    execute 'drop policy if exists "no guests" on public.exams';
    execute 'create policy "no guests" on public.exams as restrictive for all to authenticated using (not app_is_guest()) with check (not app_is_guest())';
    execute 'drop policy if exists "no guests" on public.applicant_exams';
    execute 'create policy "no guests" on public.applicant_exams as restrictive for all to authenticated using (not app_is_guest()) with check (not app_is_guest())';
  end if;
end $$;

notify pgrst, 'reload schema';
