-- =============================================================================
-- Phase 61: the Department Head's assessment of a written explanation.
--
-- For an NTE or incident report a Department Head issued: once the employee
-- submits their written explanation, the head who issued it comments on it
-- and recommends to HR the disciplinary action to give. Kept apart from the
-- record so the employee never sees it; read by HR, Upper Management and
-- the head who issued the record.
--
-- Safe to run any time, and safe to re-run.
-- =============================================================================

create table if not exists discipline_assessments (
  record_id text primary key references disciplinary_records (id) on delete cascade,
  assessor_id text references employees (id) on delete set null,
  assessor_name text not null default '',
  comment text not null check (char_length(btrim(comment)) between 1 and 4000),
  recommendation text not null check (char_length(btrim(recommendation)) between 1 and 200),
  assessed_at timestamptz not null default now()
);

alter table discipline_assessments enable row level security;

drop policy if exists "discipline assessments read" on discipline_assessments;
create policy "discipline assessments read" on discipline_assessments for select to authenticated
  using (
    app_is_hr_manager()
    or app_has_any_role(array['upper_management']::app_role[])
    or exists (select 1 from disciplinary_records d where d.id = record_id and d.issued_by = app_current_employee_id())
  );
-- No insert / update policies: written through discipline_assess().

create or replace function discipline_assess(p_record text, p_comment text, p_recommendation text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me text := app_current_employee_id();
  r disciplinary_records%rowtype;
  v_comment text := nullif(btrim(coalesce(p_comment, '')), '');
  v_rec text := nullif(btrim(coalesce(p_recommendation, '')), '');
begin
  select * into r from disciplinary_records where id = p_record;
  if not found then
    raise exception 'Record not found.';
  end if;
  if me is null or r.issued_by is distinct from me then
    raise exception 'Only the Department Head who issued this record can assess the explanation.';
  end if;
  if r.type not in ('nte', 'incident_report') then
    raise exception 'Only an NTE or incident report takes an assessment.';
  end if;
  if r.explanation_submitted_at is null then
    raise exception 'The employee hasn''t submitted a written explanation yet.';
  end if;
  if r.status = 'resolved' then
    raise exception 'This record is already resolved.';
  end if;
  if v_comment is null or char_length(v_comment) > 4000 then
    raise exception 'Write your comment on the explanation (up to 4000 characters).';
  end if;
  if v_rec is null or char_length(v_rec) > 200 then
    raise exception 'Choose the disciplinary action you recommend.';
  end if;
  insert into discipline_assessments (record_id, assessor_id, assessor_name, comment, recommendation, assessed_at)
  values (p_record, me,
          coalesce((select trim(both ' ' from coalesce(first_name, '') || ' ' || coalesce(last_name, '')) from employees where id = me), ''),
          v_comment, v_rec, now())
  on conflict (record_id) do update
    set comment = excluded.comment, recommendation = excluded.recommendation, assessed_at = excluded.assessed_at,
        assessor_id = excluded.assessor_id, assessor_name = excluded.assessor_name;
end;
$$;

revoke all on function discipline_assess(text, text, text) from public, anon;
grant execute on function discipline_assess(text, text, text) to authenticated;
