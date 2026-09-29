-- =============================================================================
-- Shantahl HRIS — reactions on Chat with HR messages
--
--   * hr_message_reactions: one reaction per person per message — smile,
--     laugh, sad, heart, like or celebrate. Reacting again with another
--     emoji replaces it; removing deletes the row.
--   * Anyone who can see the message (the employee in that conversation
--     and HR) can see its reactions and add/remove their own. The reactor
--     and their name are filled in by the database.
--
-- Safe to run any time, and safe to re-run.
-- Run once in the SQL Editor (Database > SQL Editor).
-- =============================================================================

create table if not exists hr_message_reactions (
  message_id text not null references hr_messages (id) on delete cascade,
  reactor_employee_id text not null references employees (id) on delete cascade,
  reactor_name text not null default '',
  reaction text not null check (reaction in ('smile', 'laugh', 'sad', 'heart', 'like', 'celebrate')),
  created_at timestamptz not null default now(),
  primary key (message_id, reactor_employee_id)
);

create or replace function app_fill_hr_message_reaction()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.reactor_employee_id := app_current_employee_id();
  if new.reactor_employee_id is null then
    raise exception 'Not signed in as an employee.';
  end if;
  select trim(both ' ' from coalesce(e.first_name, '') || ' ' || coalesce(e.last_name, ''))
    into new.reactor_name
    from employees e where e.id = new.reactor_employee_id;
  new.reactor_name := coalesce(new.reactor_name, '');
  new.created_at := now();
  return new;
end;
$$;

drop trigger if exists hr_message_reactions_fill on hr_message_reactions;
create trigger hr_message_reactions_fill
  before insert or update on hr_message_reactions
  for each row execute function app_fill_hr_message_reaction();

alter table hr_message_reactions enable row level security;

drop policy if exists "hr reactions read" on hr_message_reactions;
create policy "hr reactions read" on hr_message_reactions for select to authenticated
  using (exists (select 1 from hr_messages m where m.id = message_id));

drop policy if exists "hr reactions add" on hr_message_reactions;
create policy "hr reactions add" on hr_message_reactions for insert to authenticated
  with check (exists (select 1 from hr_messages m where m.id = message_id));

drop policy if exists "hr reactions change own" on hr_message_reactions;
create policy "hr reactions change own" on hr_message_reactions for update to authenticated
  using (reactor_employee_id = app_current_employee_id())
  with check (exists (select 1 from hr_messages m where m.id = message_id));

drop policy if exists "hr reactions remove own" on hr_message_reactions;
create policy "hr reactions remove own" on hr_message_reactions for delete to authenticated
  using (reactor_employee_id = app_current_employee_id());
