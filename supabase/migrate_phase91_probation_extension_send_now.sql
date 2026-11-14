-- =============================================================================
-- Phase 91: Probation Extension — the employee gets it as soon as HR sends it.
--
-- Before (phase 90): HR → Noted by → Approved by → employee.
-- Now: HR signs and sends, and the employee sees it and signs the CONFORME
-- right away. The Department Head (Noted by) and the Chairman (Approved by)
-- sign their parts any time after it's sent, in any order — before or after
-- the employee. They can still return it to HR while the employee hasn't
-- signed yet.
--
-- Needs migrate_phase90_probation_extension.sql.
-- Safe to run any time, and safe to re-run.
-- =============================================================================

-- Any already on the old path go to the employee now.
update probation_extensions set status = 'employee' where status in ('noted', 'approved');

-- HR signs it and sends it — straight to the employee.
create or replace function pe_send(p_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me text := app_current_employee_id();
  r probation_extensions%rowtype;
begin
  if me is null or not coalesce(app_is_hr_manager(), false) then
    raise exception 'Only HR can send an extension notice.';
  end if;
  select * into r from probation_extensions where id = p_id for update;
  if not found then
    raise exception 'Not found.';
  end if;
  if r.status <> 'hr' then
    raise exception 'It was already sent.';
  end if;
  if not app_leave_form_file_exists('pe/' || p_id || '/hr.png') then
    raise exception 'Attach your signature first.';
  end if;
  update probation_extensions
     set status = 'employee', hr_id = me, hr_name = app_reg_name(me), hr_signed_at = now(),
         returned_note = null, returned_by = null, returned_at = null
   where id = p_id;
end;
$$;

revoke all on function pe_send(text) from public, anon;
grant execute on function pe_send(text) to authenticated;

-- The Department Head signs "Noted by" (any time after it's sent).
create or replace function pe_note(p_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me text := app_current_employee_id();
  r probation_extensions%rowtype;
begin
  select * into r from probation_extensions where id = p_id for update;
  if not found then
    raise exception 'Not found.';
  end if;
  if me is null or r.noted_id is distinct from me or r.status not in ('employee', 'done') or r.noted_at is not null then
    raise exception 'This notice isn''t waiting for your signature.';
  end if;
  if not app_leave_form_file_exists('pe/' || p_id || '/noted.png') then
    raise exception 'Attach your signature first.';
  end if;
  update probation_extensions set noted_at = now() where id = p_id;
end;
$$;

revoke all on function pe_note(text) from public, anon;
grant execute on function pe_note(text) to authenticated;

-- The Chairman signs "Approved by" (any time after it's sent).
create or replace function pe_approve(p_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me text := app_current_employee_id();
  r probation_extensions%rowtype;
begin
  select * into r from probation_extensions where id = p_id for update;
  if not found then
    raise exception 'Not found.';
  end if;
  if me is null or r.approver_id is distinct from me or r.status not in ('employee', 'done') or r.approved_at is not null then
    raise exception 'This notice isn''t waiting for your approval.';
  end if;
  if not app_leave_form_file_exists('pe/' || p_id || '/approved.png') then
    raise exception 'Attach your signature first.';
  end if;
  update probation_extensions set approved_at = now() where id = p_id;
end;
$$;

revoke all on function pe_approve(text) from public, anon;
grant execute on function pe_approve(text) to authenticated;

-- The Department Head or the Chairman sends it back to HR with a note —
-- only while the employee hasn't signed yet, and before they signed it.
create or replace function pe_return(p_id text, p_note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me text := app_current_employee_id();
  r probation_extensions%rowtype;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  select * into r from probation_extensions where id = p_id for update;
  if not found then
    raise exception 'Not found.';
  end if;
  if me is null or r.status <> 'employee'
     or not ((r.noted_id = me and r.noted_at is null) or (r.approver_id = me and r.approved_at is null)) then
    raise exception 'This notice can''t be returned now.';
  end if;
  if v_note is null or char_length(v_note) > 1000 then
    raise exception 'Say what needs changing (up to 1000 characters).';
  end if;
  update probation_extensions
     set status = 'hr', returned_note = v_note, returned_by = app_reg_name(me), returned_at = now(),
         hr_signed_at = null, noted_at = null, approved_at = null
   where id = p_id;
end;
$$;

revoke all on function pe_return(text, text) from public, anon;
grant execute on function pe_return(text, text) to authenticated;

-- Signatures: pe/<id>/<signer>.png, while that signer's part is open.
create or replace function app_can_sign_pe(path text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select path ~ '^pe/[^/]+/(hr|noted|approved|employee)\.png$'
    and exists (
      select 1 from probation_extensions r
       where r.id = split_part(path, '/', 2)
         and case split_part(path, '/', 3)
               when 'hr.png' then r.status = 'hr' and coalesce(app_is_hr_manager(), false)
               when 'noted.png' then r.status in ('employee', 'done') and r.noted_at is null and r.noted_id = app_current_employee_id()
               when 'approved.png' then r.status in ('employee', 'done') and r.approved_at is null and r.approver_id = app_current_employee_id()
               when 'employee.png' then r.status = 'employee' and r.employee_id = app_current_employee_id()
               else false
             end);
$$;

revoke all on function app_can_sign_pe(text) from public, anon;
grant execute on function app_can_sign_pe(text) to authenticated;
