-- =============================================================================
-- Phase 62: only HR marks a disciplinary record resolved (or reopens it).
--
-- Department Heads still issue records, attach notices and assess
-- explanations; changing a record's status is HR's. The HRIS's own steps
-- (e.g. withdrawing an NTE after excused late days) still do it.
--
-- Safe to run any time, and safe to re-run.
-- =============================================================================

create or replace function app_guard_discipline_status()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(current_setting('app.discipline_response', true), '') = 'on' then
    return new;
  end if;
  if new.status is distinct from old.status and not coalesce(app_is_hr_manager(), false) then
    raise exception 'Only HR can mark a disciplinary record resolved.';
  end if;
  return new;
end;
$$;

drop trigger if exists disciplinary_records_guard_status on disciplinary_records;
create trigger disciplinary_records_guard_status
  before update on disciplinary_records
  for each row execute function app_guard_discipline_status();
