-- Phase 53: a Branch Manager signs generated notices too.
--
--   * branch_manager_id: the employee's branch approver (branches.approver_id,
--     e.g. Cebu: Mary Jane Pedrano), set when the notice is issued.
--   * Order: HR Manager → Department Manager → Branch Manager → employee.
--     The employee sees the notice only once every named signatory signed.
--
-- Safe to run any time, and safe to re-run (after phases 51–52).

alter table disciplinary_records
  add column if not exists branch_manager_id text references employees (id) on delete set null,
  add column if not exists branch_manager_signed_at timestamptz,
  add column if not exists branch_manager_signature_path text;

drop policy if exists "discipline read" on disciplinary_records;
create policy "discipline read" on disciplinary_records for select to authenticated
  using (
    (app_can_view_discipline(employee_id)
      and (employee_id is distinct from app_current_employee_id() or not sign_flow
           or (manager_signed_at is not null and (branch_manager_id is null or branch_manager_signed_at is not null))))
    or (manager_id is not null and manager_id = app_current_employee_id())
    or (branch_manager_id is not null and branch_manager_id = app_current_employee_id())
  );

create or replace function app_guard_discipline_signatures()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(current_setting('app.discipline_response', true), '') = 'on' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.expl_hr_receiver_id := null;
    new.expl_hr_received_at := null;
    new.expl_hr_signature_path := null;
    new.expl_mgr_received_at := null;
    new.expl_mgr_signature_path := null;
    new.branch_manager_signed_at := null;
    new.branch_manager_signature_path := null;
    return new;
  end if;
  if new.expl_hr_receiver_id is distinct from old.expl_hr_receiver_id
     or new.expl_hr_received_at is distinct from old.expl_hr_received_at
     or new.expl_hr_signature_path is distinct from old.expl_hr_signature_path
     or new.expl_mgr_received_at is distinct from old.expl_mgr_received_at
     or new.expl_mgr_signature_path is distinct from old.expl_mgr_signature_path
     or new.branch_manager_signed_at is distinct from old.branch_manager_signed_at
     or new.branch_manager_signature_path is distinct from old.branch_manager_signature_path then
    raise exception 'Signatures can only be added by signing.';
  end if;
  if old.branch_manager_signed_at is not null and new.branch_manager_id is distinct from old.branch_manager_id then
    raise exception 'The Branch Manager already signed.';
  end if;
  return new;
end;
$$;

create or replace function discipline_sign(record_id text, signature_path text)
returns disciplinary_records
language plpgsql
security definer
set search_path = public
as $$
declare
  r disciplinary_records;
  me text := app_current_employee_id();
  prefix text;
begin
  select * into r from disciplinary_records where id = record_id for update;
  if r.id is null or not r.sign_flow then
    raise exception 'This notice doesn''t need signatures.';
  end if;
  prefix := case
    when r.hr_signed_at is null then '/hrsign-'
    when r.manager_signed_at is null then '/mgrsign-'
    when r.branch_manager_id is not null and r.branch_manager_signed_at is null then '/bmsign-'
  end;
  if prefix is null then
    raise exception 'This notice has already been signed.';
  end if;
  if prefix = '/hrsign-' and not app_is_hr_manager() then
    raise exception 'The HR Manager signs this notice first.';
  end if;
  if prefix = '/mgrsign-' and (r.manager_id is null or r.manager_id is distinct from me) then
    raise exception 'Only the Department Manager named on this notice can sign it now.';
  end if;
  if prefix = '/bmsign-' and r.branch_manager_id is distinct from me then
    raise exception 'Only the Branch Manager named on this notice can sign it now.';
  end if;
  if signature_path is null or signature_path not like record_id || prefix || '%'
     or not exists (select 1 from storage.objects o where o.bucket_id = 'discipline-files' and o.name = signature_path) then
    raise exception 'Please sign before saving.';
  end if;
  perform set_config('app.discipline_response', 'on', true);
  if prefix = '/hrsign-' then
    update disciplinary_records set hr_signer_id = me, hr_signed_at = now(), hr_signature_path = signature_path where id = record_id returning * into r;
  elsif prefix = '/mgrsign-' then
    update disciplinary_records set manager_signed_at = now(), manager_signature_path = signature_path where id = record_id returning * into r;
  else
    update disciplinary_records set branch_manager_signed_at = now(), branch_manager_signature_path = signature_path where id = record_id returning * into r;
  end if;
  perform set_config('app.discipline_response', 'off', true);
  return r;
end;
$$;

create or replace function discipline_acknowledge(record_id text, signature_path text)
returns disciplinary_records
language plpgsql
security definer
set search_path = public
as $$
declare
  r disciplinary_records;
begin
  select * into r from disciplinary_records where id = record_id for update;
  if r.id is null or r.employee_id is distinct from app_current_employee_id() then
    raise exception 'This notice isn''t addressed to you.';
  end if;
  if r.sign_flow and (r.manager_signed_at is null or (r.branch_manager_id is not null and r.branch_manager_signed_at is null)) then
    raise exception 'This notice isn''t signed yet.';
  end if;
  if r.acknowledged_at is not null then
    raise exception 'You have already acknowledged this notice.';
  end if;
  if signature_path is null or signature_path not like record_id || '/ack-%'
     or not exists (select 1 from storage.objects o where o.bucket_id = 'discipline-files' and o.name = signature_path) then
    raise exception 'Please sign before acknowledging.';
  end if;
  perform set_config('app.discipline_response', 'on', true);
  update disciplinary_records set acknowledged_at = now(), ack_signature_path = signature_path where id = record_id returning * into r;
  perform set_config('app.discipline_response', 'off', true);
  return r;
end;
$$;

drop policy if exists "discipline branch manager files upload" on storage.objects;
create policy "discipline branch manager files upload" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'discipline-files'
    and storage.filename(name) like 'bmsign-%'
    and exists (
      select 1 from disciplinary_records d
      where d.id = (storage.foldername(name))[1]
        and d.sign_flow and d.manager_signed_at is not null and d.branch_manager_signed_at is null
        and d.branch_manager_id = app_current_employee_id()
    )
  );

-- Excuse requests: the Department / Branch Manager asks HR not to count
-- some late days, each with its reason; HR accepts or declines each request.
--   [{ "id", "by", "role": "manager"|"branch", "items": [{ "date", "minutes", "reason" }],
--      "at", "status": "pending"|"accepted"|"declined", "decided_by", "decided_at" }]
alter table disciplinary_records add column if not exists excuse_requests jsonb not null default '[]'::jsonb;

create or replace function app_guard_discipline_excuses()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(current_setting('app.discipline_response', true), '') = 'on' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.excuse_requests := '[]'::jsonb;
  elsif new.excuse_requests is distinct from old.excuse_requests then
    raise exception 'Excuse requests change only through the Department / Branch Manager and HR.';
  end if;
  return new;
end;
$$;

drop trigger if exists disciplinary_records_guard_excuses on disciplinary_records;
create trigger disciplinary_records_guard_excuses
  before insert or update on disciplinary_records
  for each row execute function app_guard_discipline_excuses();

create or replace function discipline_request_excuse(record_id text, items jsonb)
returns disciplinary_records
language plpgsql
security definer
set search_path = public
as $$
declare
  r disciplinary_records;
  me text := app_current_employee_id();
  role text;
begin
  select * into r from disciplinary_records where id = record_id for update;
  if r.id is null or not r.sign_flow then
    raise exception 'This notice doesn''t take excuse requests.';
  end if;
  role := case when r.manager_id = me then 'manager' when r.branch_manager_id = me then 'branch' end;
  if role is null then
    raise exception 'Only the Department or Branch Manager named on this notice can ask to excuse late days.';
  end if;
  if jsonb_typeof(items) <> 'array' or jsonb_array_length(items) = 0 or jsonb_array_length(items) > 31 then
    raise exception 'Choose at least one late day.';
  end if;
  if exists (select 1 from jsonb_array_elements(items) i where coalesce(btrim(i->>'reason'), '') = '' or coalesce(i->>'date', '') !~ '^\d{4}-\d{2}-\d{2}$') then
    raise exception 'Give the reason for each day.';
  end if;
  if exists (select 1 from jsonb_array_elements(items) i where char_length(i->>'reason') > 500) then
    raise exception 'Keep each reason under 500 characters.';
  end if;
  perform set_config('app.discipline_response', 'on', true);
  update disciplinary_records
     set excuse_requests = excuse_requests || jsonb_build_array(jsonb_build_object(
       'id', gen_random_uuid()::text, 'by', me, 'role', role, 'items', items, 'at', now(), 'status', 'pending'))
   where id = record_id
  returning * into r;
  perform set_config('app.discipline_response', 'off', true);
  return r;
end;
$$;

create or replace function discipline_decide_excuse(record_id text, request_id text, accept boolean)
returns disciplinary_records
language plpgsql
security definer
set search_path = public
as $$
declare
  r disciplinary_records;
begin
  if not app_is_hr_manager() then
    raise exception 'Only HR decides on excuse requests.';
  end if;
  select * into r from disciplinary_records where id = record_id for update;
  if r.id is null or not exists (select 1 from jsonb_array_elements(r.excuse_requests) x where x->>'id' = request_id and x->>'status' = 'pending') then
    raise exception 'That request was already decided or doesn''t exist.';
  end if;
  perform set_config('app.discipline_response', 'on', true);
  update disciplinary_records
     set excuse_requests = (
       select jsonb_agg(case when x->>'id' = request_id
                             then x || jsonb_build_object('status', case when accept then 'accepted' else 'declined' end,
                                                          'decided_by', app_current_employee_id(), 'decided_at', now())
                             else x end order by ord)
       from jsonb_array_elements(r.excuse_requests) with ordinality as t(x, ord))
   where id = record_id
  returning * into r;
  perform set_config('app.discipline_response', 'off', true);
  return r;
end;
$$;

revoke all on function discipline_request_excuse(text, jsonb) from public, anon;
grant execute on function discipline_request_excuse(text, jsonb) to authenticated;
revoke all on function discipline_decide_excuse(text, text, boolean) from public, anon;
grant execute on function discipline_decide_excuse(text, text, boolean) to authenticated;
