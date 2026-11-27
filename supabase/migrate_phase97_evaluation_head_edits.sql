-- Phase 97: a Department Head can edit their signed part of an evaluation
-- (Job Performance ratings, overall rating, comment, recommendation, special
-- award), with an edit history everyone who can see the evaluation can read.
--
-- Safe to run more than once.

create table if not exists sales_admin_evaluation_edits (
  id bigint generated always as identity primary key,
  evaluation_id text not null references sales_admin_evaluations (id) on delete cascade,
  part text not null check (part in ('head', 'head2')),
  editor_id text,
  editor_name text,
  edited_at timestamptz not null default now(),
  before_data jsonb,
  after_data jsonb not null,
  reason text
);

create index if not exists sales_admin_evaluation_edits_eval_idx on sales_admin_evaluation_edits (evaluation_id, edited_at);

alter table sales_admin_evaluation_edits enable row level security;

-- Readable by whoever can read the evaluation (the "sae read" policy applies
-- inside the subquery).
drop policy if exists "sae edits read" on sales_admin_evaluation_edits;
create policy "sae edits read" on sales_admin_evaluation_edits for select to authenticated
  using (exists (select 1 from sales_admin_evaluations e where e.id = evaluation_id));
-- No insert / update / delete policies: written only through sae_edit_head.

create or replace function sae_edit_head(p_id text, p_data jsonb, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me text := app_current_employee_id();
  r sales_admin_evaluations%rowtype;
  second boolean;
  old jsonb;
begin
  select * into r from sales_admin_evaluations where id = p_id for update;
  if not found then
    raise exception 'Evaluation not found.';
  end if;
  if me is null or (r.head_id is distinct from me and r.head2_id is distinct from me) then
    raise exception 'Only a Department Head named on this evaluation can edit their part.';
  end if;
  second := r.head_id is distinct from me;
  if (case when second then r.head2_signed_at else r.head_signed_at end) is null then
    raise exception 'Your part isn''t signed yet — fill it in and sign it instead.';
  end if;
  if not (r.status in ('open', 'vc')
          or (r.status = 'chairman' and r.vc_id is null)
          or (r.status = 'done' and r.vc_id is null and r.chairman_id is null)) then
    raise exception 'The evaluation already has a recommendation from management, so it can''t be edited.';
  end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' or octet_length(p_data::text) > 20000 then
    raise exception 'The evaluation''s details are missing.';
  end if;
  if not app_sae_ratings_ok(p_data -> 'job') then
    raise exception 'Rate every Job Performance item (0 to 3).';
  end if;
  if nullif(btrim(coalesce(p_data ->> 'overall', '')), '') is null then
    raise exception 'Choose your overall rating.';
  end if;
  if nullif(btrim(coalesce(p_data ->> 'recommendation', '')), '') is null then
    raise exception 'Give your recommendation.';
  end if;
  if char_length(coalesce(p_reason, '')) > 1000 then
    raise exception 'The reason is too long.';
  end if;
  old := case when second then r.head2_data else r.head_data end;
  if old is not distinct from p_data then
    raise exception 'Nothing was changed.';
  end if;

  insert into sales_admin_evaluation_edits (evaluation_id, part, editor_id, editor_name, before_data, after_data, reason)
  values (p_id, case when second then 'head2' else 'head' end, me, app_sae_name(me), old, p_data, nullif(btrim(coalesce(p_reason, '')), ''));

  if second then
    update sales_admin_evaluations set head2_data = p_data where id = p_id;
  else
    update sales_admin_evaluations set head_data = p_data where id = p_id;
  end if;
end;
$$;

revoke all on function sae_edit_head(text, jsonb, text) from public, anon;
grant execute on function sae_edit_head(text, jsonb, text) to authenticated;
