-- =============================================================================
-- Shantahl HRIS — employees edit their own Personal Information (201 file)
--
--   set_my_personal_info(info): the signed-in employee updates the Personal
--   Information part of their own 201 file — name, nickname, gender,
--   birthdate, civil status, nationality, address, contact number, email and
--   emergency contact. Nothing else (employment, pay, government IDs, roles)
--   can be changed this way. Each change is written to the audit trail with
--   the old and new values.
--
-- Safe to run any time, and safe to re-run.
-- Run once in the SQL Editor (Database > SQL Editor).
-- =============================================================================

create or replace function set_my_personal_info(info jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me text := app_current_employee_id();
  old employees%rowtype;
  v_first text := btrim(coalesce(info->>'first_name', ''));
  v_last text := btrim(coalesce(info->>'last_name', ''));
  v_middle text := nullif(btrim(coalesce(info->>'middle_name', '')), '');
  v_nick text := btrim(coalesce(info->>'nickname', ''));
  v_gender text := info->>'gender';
  v_birth date;
  v_civil text := nullif(info->>'civil_status', '');
  v_nat text := nullif(btrim(coalesce(info->>'nationality', '')), '');
  v_addr text := nullif(btrim(coalesce(info->>'address', '')), '');
  v_phone text := nullif(btrim(coalesce(info->>'contact_number', '')), '');
  v_email text := nullif(lower(btrim(coalesce(info->>'email', ''))), '');
  v_ec_name text := nullif(btrim(coalesce(info->>'emergency_contact_name', '')), '');
  v_ec_phone text := nullif(btrim(coalesce(info->>'emergency_contact_phone', '')), '');
  changes text[] := '{}';
  before_vals text[] := '{}';
  after_vals text[] := '{}';
begin
  if me is null then
    raise exception 'Not signed in as an employee.';
  end if;
  select * into old from employees where id = me for update;

  begin
    v_birth := nullif(info->>'birthdate', '')::date;
  exception when others then
    raise exception 'Enter a valid birthdate.';
  end;
  if v_first = '' or v_last = '' then
    raise exception 'Enter your first and last name.';
  end if;
  if v_gender not in ('Male', 'Female') then
    raise exception 'Choose your gender.';
  end if;
  if v_civil is not null and v_civil not in ('Single', 'Married', 'Widowed', 'Separated') then
    raise exception 'Choose a civil status.';
  end if;
  if v_birth is not null and (v_birth > current_date or v_birth < date '1900-01-01') then
    raise exception 'Enter a valid birthdate.';
  end if;
  if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Enter a valid email address.';
  end if;
  if v_email is not null and exists (select 1 from employees where lower(email) = v_email and id <> me) then
    raise exception 'That email is already used by another employee.';
  end if;
  if greatest(char_length(v_first), char_length(v_last), char_length(coalesce(v_middle, '')), char_length(v_nick)) > 80
     or char_length(coalesce(v_addr, '')) > 300 or char_length(coalesce(v_nat, '')) > 60
     or greatest(char_length(coalesce(v_phone, '')), char_length(coalesce(v_ec_phone, ''))) > 40
     or char_length(coalesce(v_ec_name, '')) > 120 or char_length(coalesce(v_email, '')) > 120 then
    raise exception 'One of the entries is too long.';
  end if;

  -- What changed, for the audit trail.
  if old.first_name is distinct from v_first then changes := array_append(changes, 'First name'); before_vals := array_append(before_vals, coalesce(old.first_name, '')); after_vals := array_append(after_vals, v_first); end if;
  if old.last_name is distinct from v_last then changes := array_append(changes, 'Last name'); before_vals := array_append(before_vals, coalesce(old.last_name, '')); after_vals := array_append(after_vals, v_last); end if;
  if old.middle_name is distinct from v_middle then changes := array_append(changes, 'Middle name'); before_vals := array_append(before_vals, coalesce(old.middle_name, '')); after_vals := array_append(after_vals, coalesce(v_middle, '')); end if;
  if old.nickname is distinct from v_nick then changes := array_append(changes, 'Nickname'); before_vals := array_append(before_vals, coalesce(old.nickname, '')); after_vals := array_append(after_vals, v_nick); end if;
  if old.gender is distinct from v_gender then changes := array_append(changes, 'Gender'); before_vals := array_append(before_vals, coalesce(old.gender, '')); after_vals := array_append(after_vals, v_gender); end if;
  if old.birthdate is distinct from v_birth then changes := array_append(changes, 'Birthdate'); before_vals := array_append(before_vals, coalesce(old.birthdate::text, '')); after_vals := array_append(after_vals, coalesce(v_birth::text, '')); end if;
  if old.civil_status is distinct from v_civil then changes := array_append(changes, 'Civil status'); before_vals := array_append(before_vals, coalesce(old.civil_status, '')); after_vals := array_append(after_vals, coalesce(v_civil, '')); end if;
  if old.nationality is distinct from v_nat then changes := array_append(changes, 'Nationality'); before_vals := array_append(before_vals, coalesce(old.nationality, '')); after_vals := array_append(after_vals, coalesce(v_nat, '')); end if;
  if old.address is distinct from v_addr then changes := array_append(changes, 'Address'); before_vals := array_append(before_vals, coalesce(old.address, '')); after_vals := array_append(after_vals, coalesce(v_addr, '')); end if;
  if old.contact_number is distinct from v_phone then changes := array_append(changes, 'Contact number'); before_vals := array_append(before_vals, coalesce(old.contact_number, '')); after_vals := array_append(after_vals, coalesce(v_phone, '')); end if;
  if lower(coalesce(old.email, '')) is distinct from coalesce(v_email, '') then changes := array_append(changes, 'Email'); before_vals := array_append(before_vals, coalesce(old.email, '')); after_vals := array_append(after_vals, coalesce(v_email, '')); end if;
  if old.emergency_contact_name is distinct from v_ec_name then changes := array_append(changes, 'Emergency contact'); before_vals := array_append(before_vals, coalesce(old.emergency_contact_name, '')); after_vals := array_append(after_vals, coalesce(v_ec_name, '')); end if;
  if old.emergency_contact_phone is distinct from v_ec_phone then changes := array_append(changes, 'Emergency contact number'); before_vals := array_append(before_vals, coalesce(old.emergency_contact_phone, '')); after_vals := array_append(after_vals, coalesce(v_ec_phone, '')); end if;

  if cardinality(changes) = 0 then
    return;
  end if;

  update employees
     set first_name = v_first, last_name = v_last, middle_name = v_middle, nickname = v_nick, gender = v_gender,
         birthdate = v_birth, civil_status = v_civil, nationality = v_nat, address = v_addr, contact_number = v_phone,
         email = case when lower(coalesce(old.email, '')) = coalesce(v_email, '') then old.email else v_email end,
         emergency_contact_name = v_ec_name, emergency_contact_phone = v_ec_phone
   where id = me;

  insert into audit_logs (actor_employee_id, actor_name, module, action, description, previous_value, new_value)
  values (me, trim(both ' ' from v_first || ' ' || v_last), 'Employees', 'update',
          'Updated own personal information: ' || array_to_string(changes, ', '),
          array_to_string(before_vals, ' | '), array_to_string(after_vals, ' | '));
end;
$$;

revoke all on function set_my_personal_info(jsonb) from public, anon;
grant execute on function set_my_personal_info(jsonb) to authenticated;
