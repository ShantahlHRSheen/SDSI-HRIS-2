-- =============================================================================
-- Daro Lending Corporation — approvers of leave, OT and attendance correction
--
--   Each form goes: employee → Branch Head (the branch's Area Manager, the
--   branch approver) → Supervisor (Credit Supervisor) → HR. The branch step
--   is skipped when the Area Manager is already the person's supervisor.
--
--   CABANATUAN  Area Manager: Reymond Leonardo (EMP-0003)
--               Credit Supervisor: Fernan Barlinan (EMP-0015)
--   HO-TARLAC   Area Manager: Jonifer Doble (LSM, admin-only ADMIN-03)
--               Credit Supervisors: Almerson Daileg (EMP-0005) and Michael
--               Cunanan (EMP-0006) — both approve (second supervisor)
--   BULACAN     Area Manager: Raymond Gantalao (LSM, admin-only ADMIN-04)
--               Credit Supervisor: Alberto Cervaña Jr. (EMP-0018)
--
--   The Credit Supervisors and Mario Agunat II (Cabanatuan Branch Head)
--   report to their branch's Area Manager.
--
-- Needs migrate_phase40_branch_approver.sql (in new-company-setup.sql) and
-- migrate_phase67_co_supervisor.sql. Replace the two emails below with the
-- ones Jonifer and Raymond sign in to LSMBiz with — they use that same
-- sign-in for Daro. Safe to re-run.
-- =============================================================================

-- The LSM Area Managers: admin-only accounts, kept off Daro's employee lists.
insert into employees (id, employee_number, first_name, last_name, nickname, gender, email,
  branch_id, department_id, position_id, employment_status, payroll_type, status, roles)
values
  ('emp-admin-03', 'ADMIN-03', 'Jonifer', 'Doble', 'Jonifer', 'Male', 'jonifer@example.com',  -- ← his LSMBiz sign-in email
   'br-ho', 'dp-unassigned', 'ps-unassigned', 'regular', 'monthly', 'active', array['employee']::app_role[]),
  ('emp-admin-04', 'ADMIN-04', 'Raymond', 'Gantalao', 'Raymond', 'Male', 'raymond@example.com',  -- ← his LSMBiz sign-in email
   'br-bul', 'dp-unassigned', 'ps-unassigned', 'regular', 'monthly', 'active', array['employee']::app_role[])
on conflict (employee_number) do update set email = excluded.email, branch_id = excluded.branch_id, status = 'active';

-- Branch approvers (Area Managers).
update branches set approver_id = (select id from employees where employee_number = 'EMP-0003') where id = 'br-cab';
update branches set approver_id = 'emp-admin-03' where id = 'br-ho';
update branches set approver_id = 'emp-admin-04' where id = 'br-bul';

-- Supervisors. sup = Supervisor, co = second supervisor (also approves).
with plan(emp, sup, co) as (values
  -- Cabanatuan
  ('EMP-0016', 'EMP-0015', null),  -- Twinkle Ann Marayag → Fernan Barlinan
  ('EMP-0017', 'EMP-0015', null),  -- Erik Joseph Santos → Fernan Barlinan
  ('EMP-0014', 'EMP-0003', null),  -- Mario Agunat II → Reymond Leonardo
  ('EMP-0015', 'EMP-0003', null),  -- Fernan Barlinan → Reymond Leonardo
  -- HO-Tarlac: Almerson Daileg and Michael Cunanan both approve
  ('EMP-0007', 'EMP-0005', 'EMP-0006'),  -- Menchie Nuqui
  ('EMP-0008', 'EMP-0005', 'EMP-0006'),  -- Joann Lee Jose
  ('EMP-0009', 'EMP-0005', 'EMP-0006'),  -- Mon Calvin Bautista
  ('EMP-0010', 'EMP-0005', 'EMP-0006'),  -- Mark Ignacio
  ('EMP-0011', 'EMP-0005', 'EMP-0006'),  -- Paul Aldrin Ibarra
  ('EMP-0012', 'EMP-0005', 'EMP-0006'),  -- Landel Tayag
  ('EMP-0013', 'EMP-0005', 'EMP-0006'),  -- Raymart Gayla
  ('EMP-0005', 'ADMIN-03', null),        -- Almerson Daileg → Jonifer Doble
  ('EMP-0006', 'ADMIN-03', null),        -- Michael Cunanan → Jonifer Doble
  -- Bulacan
  ('EMP-0019', 'EMP-0018', null),  -- Ricky Santos → Alberto Cervaña Jr.
  ('EMP-0020', 'EMP-0018', null),  -- Orlando Angeles → Alberto Cervaña Jr.
  ('EMP-0021', 'EMP-0018', null),  -- Jeanne Alcontin → Alberto Cervaña Jr.
  ('EMP-0022', 'EMP-0018', null),  -- Thricia Mae Leonardo → Alberto Cervaña Jr.
  ('EMP-0018', 'ADMIN-04', null)   -- Alberto Cervaña Jr. → Raymond Gantalao
)
update employees e
   set supervisor_id = s.id, co_supervisor_id = c.id
  from plan p
  join employees s on s.employee_number = p.sup
  left join employees c on c.employee_number = p.co
 where e.employee_number = p.emp;

-- Check: everyone's supervisors and branch approver.
select e.employee_number, e.first_name || ' ' || e.last_name as employee, b.name as branch,
       coalesce(s.first_name || ' ' || s.last_name, '— (HR approves)') as supervisor,
       coalesce(c.first_name || ' ' || c.last_name, '') as second_supervisor,
       coalesce(a.first_name || ' ' || a.last_name, '') as branch_approver
  from employees e
  join branches b on b.id = e.branch_id
  left join employees s on s.id = e.supervisor_id
  left join employees c on c.id = e.co_supervisor_id
  left join employees a on a.id = b.approver_id
 where e.employee_number like 'EMP-%'
 order by b.name, e.employee_number;
