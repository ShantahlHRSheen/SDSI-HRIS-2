-- SDSI: start the 2026 Year-end managerial evaluations of the HR Manager,
-- the Operations Manager, the Chief Finance Officer and the Corporate
-- Treasurer, rated only by Sheilah A. Magdadaro (Vice Chairperson, emp-004).
--
--   emp-012  Sheena A. Evangelista       HR Manager
--   emp-045  Marlyn C. Leonardo          Operations Manager
--   emp-005  Maricris Barlinan           Chief Finance Officer
--   emp-011  Joan Mariette O. Santarina  Corporate Treasurer
--
-- Needs migrate_phase99_managerial_evaluation.sql. Run once in the SDSI
-- project; running it again does nothing (fixed ids).

insert into sales_admin_evaluations (id, employee_id, employee_name, period, created_by, head_id, head_name, form, purpose, hr_data)
select 'mgr-2026-' || e.id,
       e.id,
       app_sae_name(e.id),
       '2026',
       'emp-012',
       'emp-004',
       app_sae_name('emp-004'),
       'managerial',
       'Year-end Evaluation',
       jsonb_build_object(
         'employee', jsonb_build_object(
           'name', e.first_name || coalesce(' ' || upper(left(nullif(btrim(e.middle_name), ''), 1)) || '.', '') || ' ' || e.last_name,
           'position', coalesce(p.title, ''),
           'department', coalesce(d.name, ''),
           'dateHired', e.date_hired,
           'employmentStatus', e.employment_status,
           'contractEnd', e.contract_end),
         'behavior', '[null,null,null,null,null,null,null,null,null,null,null,null,null]'::jsonb,
         'sales', '[]'::jsonb,
         'overall', '',
         'comment', '',
         'recommendation', '')
  from employees e
  left join positions p on p.id = e.position_id
  left join departments d on d.id = e.department_id
 where e.id in ('emp-012', 'emp-045', 'emp-005', 'emp-011')
on conflict (id) do nothing;

-- Check: the four, open, waiting for Sheilah.
select id, employee_name, purpose, period, form, head_name, status
  from sales_admin_evaluations
 where id like 'mgr-2026-%'
 order by employee_name;
