-- =============================================================================
-- Phase 56: Pag-IBIG Multi-Purpose Loan Application Form (HQP-SLF-065)
--
--   * mpl_requests: an employee asks for the employer's part of the form
--     (employer details, authorized signatory, Certificate of Net Pay).
--   * HR checks the figures and sends it to the authorized signatory
--     (mpl_prepare) — or declines; the signatory signs with their saved
--     signature (a copy in the leave-forms bucket at
--     mpl/<employee id>/<request id>/signatory.png) — mpl_sign — or declines.
--   * Seen by the employee, HR and the signatory it was sent to.
--
-- Needs migrate_phase27_leave_forms.sql.
-- Safe to run any time, and safe to re-run.
-- =============================================================================

create table if not exists mpl_requests (
  id text primary key,
  employee_id text not null references employees (id) on delete cascade,
  employee_name text not null default '',
  note text not null default '' check (char_length(note) <= 300),
  status text not null default 'hr' check (status in ('hr', 'signatory', 'signed', 'declined')),
  requested_by text references employees (id) on delete set null,
  requested_at timestamptz not null default now(),
  prepared_by text references employees (id) on delete set null,
  prepared_name text,
  prepared_at timestamptz,
  signatory_id text references employees (id) on delete set null,
  signatory_name text,
  signed_at timestamptz,
  declined_name text,
  decline_reason text,
  data jsonb
);

create index if not exists mpl_requests_employee_idx on mpl_requests (employee_id, requested_at);

create or replace function app_fill_mpl_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.employee_name := coalesce((select trim(both ' ' from coalesce(first_name, '') || ' ' || coalesce(last_name, '')) from employees where id = new.employee_id), '');
  new.note := btrim(coalesce(new.note, ''));
  new.status := 'hr';
  new.requested_by := app_current_employee_id();
  new.requested_at := now();
  new.prepared_by := null;
  new.prepared_name := null;
  new.prepared_at := null;
  new.signatory_id := null;
  new.signatory_name := null;
  new.signed_at := null;
  new.declined_name := null;
  new.decline_reason := null;
  new.data := null;
  return new;
end;
$$;

drop trigger if exists mpl_request_fill on mpl_requests;
create trigger mpl_request_fill
  before insert on mpl_requests
  for each row execute function app_fill_mpl_request();

alter table mpl_requests enable row level security;

drop policy if exists "mpl read" on mpl_requests;
create policy "mpl read" on mpl_requests for select to authenticated
  using (employee_id = app_current_employee_id() or app_is_hr_manager()
         or (signatory_id is not null and signatory_id = app_current_employee_id()));
drop policy if exists "mpl request" on mpl_requests;
create policy "mpl request" on mpl_requests for insert to authenticated
  with check (employee_id = app_current_employee_id() or app_is_hr_manager());
drop policy if exists "mpl delete hr" on mpl_requests;
create policy "mpl delete hr" on mpl_requests for delete to authenticated
  using (app_is_hr_manager());
-- No update policy: the steps go through the functions below.

-- HR: the employer's part and net pay are checked; send to the signatory.
create or replace function mpl_prepare(p_id text, p_data jsonb, p_signatory text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me text := app_current_employee_id();
  r mpl_requests%rowtype;
begin
  if me is null or not app_is_hr_manager() then
    raise exception 'Only HR can prepare the Pag-IBIG loan form.';
  end if;
  select * into r from mpl_requests where id = p_id for update;
  if not found then
    raise exception 'Request not found.';
  end if;
  if r.status <> 'hr' then
    raise exception 'This form was already sent, signed or declined.';
  end if;
  if jsonb_typeof(p_data) <> 'object' or octet_length(p_data::text) > 20000 then
    raise exception 'The form''s details are missing.';
  end if;
  if p_signatory is null or not exists (select 1 from employees where id = p_signatory) then
    raise exception 'Choose the authorized signatory.';
  end if;
  if p_signatory = r.employee_id then
    raise exception 'The borrower can''t sign as the authorized signatory.';
  end if;
  update mpl_requests
     set status = 'signatory', data = p_data, signatory_id = p_signatory,
         signatory_name = (select trim(both ' ' from coalesce(first_name, '') || ' ' || coalesce(last_name, '')) from employees where id = p_signatory),
         prepared_by = me, prepared_at = now(),
         prepared_name = (select trim(both ' ' from coalesce(first_name, '') || ' ' || coalesce(last_name, '')) from employees where id = me)
   where id = p_id;
end;
$$;

revoke all on function mpl_prepare(text, jsonb, text) from public, anon;
grant execute on function mpl_prepare(text, jsonb, text) to authenticated;

-- The authorized signatory signs.
create or replace function mpl_sign(p_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me text := app_current_employee_id();
  r mpl_requests%rowtype;
begin
  select * into r from mpl_requests where id = p_id for update;
  if not found then
    raise exception 'Request not found.';
  end if;
  if me is null or r.signatory_id is distinct from me then
    raise exception 'Only the authorized signatory named on this form can sign it.';
  end if;
  if r.status <> 'signatory' then
    raise exception 'This form isn''t waiting for your signature.';
  end if;
  if not app_leave_form_file_exists('mpl/' || r.employee_id || '/' || p_id || '/signatory.png') then
    raise exception 'Attach your signature first.';
  end if;
  update mpl_requests set status = 'signed', signed_at = now() where id = p_id;
end;
$$;

revoke all on function mpl_sign(text) from public, anon;
grant execute on function mpl_sign(text) to authenticated;

-- HR (before sending) or the signatory (before signing) declines.
create or replace function mpl_decline(p_id text, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me text := app_current_employee_id();
  r mpl_requests%rowtype;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  select * into r from mpl_requests where id = p_id for update;
  if not found then
    raise exception 'Request not found.';
  end if;
  if not ((r.status = 'hr' and app_is_hr_manager()) or (r.status = 'signatory' and (r.signatory_id = me or app_is_hr_manager()))) then
    raise exception 'You can''t decline this form now.';
  end if;
  if v_reason is null or char_length(v_reason) > 500 then
    raise exception 'Give the reason for declining (up to 500 characters).';
  end if;
  update mpl_requests
     set status = 'declined', decline_reason = v_reason,
         declined_name = (select trim(both ' ' from coalesce(first_name, '') || ' ' || coalesce(last_name, '')) from employees where id = me)
   where id = p_id;
end;
$$;

revoke all on function mpl_decline(text, text) from public, anon;
grant execute on function mpl_decline(text, text) to authenticated;

-- The signatory's signature: mpl/<employee id>/<request id>/signatory.png,
-- while the form waits for them.
create or replace function app_can_sign_mpl(path text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select path ~ '^mpl/[^/]+/[^/]+/signatory\.png$'
    and exists (select 1 from mpl_requests r
                where r.id = split_part(path, '/', 3) and r.employee_id = split_part(path, '/', 2)
                  and r.status = 'signatory' and r.signatory_id = app_current_employee_id());
$$;

revoke all on function app_can_sign_mpl(text) from public, anon;
grant execute on function app_can_sign_mpl(text) to authenticated;

drop policy if exists "mpl signatures read" on storage.objects;
create policy "mpl signatures read" on storage.objects for select to authenticated
  using (bucket_id = 'leave-forms' and name like 'mpl/%'
         and (split_part(name, '/', 2) = app_current_employee_id() or app_is_hr_manager()
              or exists (select 1 from mpl_requests r where r.id = split_part(name, '/', 3) and r.signatory_id = app_current_employee_id())));
drop policy if exists "mpl sign" on storage.objects;
create policy "mpl sign" on storage.objects for insert to authenticated
  with check (bucket_id = 'leave-forms' and app_can_sign_mpl(name));
drop policy if exists "mpl re-sign" on storage.objects;
create policy "mpl re-sign" on storage.objects for update to authenticated
  using (bucket_id = 'leave-forms' and app_can_sign_mpl(name))
  with check (bucket_id = 'leave-forms' and app_can_sign_mpl(name));
drop policy if exists "mpl files delete hr" on storage.objects;
create policy "mpl files delete hr" on storage.objects for delete to authenticated
  using (bucket_id = 'leave-forms' and name like 'mpl/%' and app_is_hr_manager());
