-- SDSI: Jaz Eusebio (emp-024) becomes the supervisor — the leave and
-- overtime approver — of Erwin Carreon (emp-014) and Shane Garcia
-- (48387188-…, the active record), in place of Sheena Evangelista (emp-012).
--
-- * Leave requests follow the current supervisor, so Erwin's 2 pending leave
--   requests (Dec 26 and Dec 28) go to Jaz automatically.
-- * An overtime form keeps the head it was filed with, so Erwin's pending OT
--   form (Nov 22, not yet signed by the head) is moved to Jaz here too.
--
-- Run once in the SDSI project.

update employees
   set supervisor_id = 'emp-024'
 where id in ('emp-014', '48387188-d601-43e9-8192-d15d3fc4292d');

update overtime_forms
   set department_head_id = 'emp-024',
       department_head = 'Jaz Eusebio'
 where employee_id in ('emp-014', '48387188-d601-43e9-8192-d15d3fc4292d')
   and department_head_id = 'emp-012'
   and head_signed_at is null;

-- Check
select id, first_name, last_name, supervisor_id
  from employees
 where id in ('emp-014', '48387188-d601-43e9-8192-d15d3fc4292d');
