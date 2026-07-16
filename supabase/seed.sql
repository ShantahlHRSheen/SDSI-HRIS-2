-- =============================================================================
-- Shantahl HRIS — seed data (generated from lib/mock-data.ts)
--
-- Run once against a fresh project that already has supabase/schema.sql
-- applied: paste into the SQL Editor (Database > SQL Editor) and Run, or
-- `psql <connection-string> -f supabase/seed.sql`.
--
-- The final step links employees.user_id to any auth.users row with a
-- matching email, so accounts already created (Authentication > Users)
-- attach to their employee record and can log in immediately.
-- =============================================================================

-- Branches
insert into branches (id, name, code, address) values ('br-cbt', 'Cabanatuan', 'CBT', 'Maharlika Highway, Cabanatuan City');
insert into branches (id, name, code, address) values ('br-mnl', 'Manila', 'MNL', 'Shantahl Bldg, Ortigas Ave, Pasig City');
insert into branches (id, name, code, address) values ('br-ceb', 'Cebu', 'CEB', 'IT Park, Cebu City');
insert into branches (id, name, code, address) values ('br-mdu', 'Mandaue', 'MDU', 'A.S. Fortuna St, Mandaue City');
insert into branches (id, name, code, address) values ('br-dvo', 'Davao', 'DVO', 'J.P. Laurel Ave, Davao City');
insert into branches (id, name, code, address) values ('br-cav', 'Cavite', 'CAV', 'Aguinaldo Highway, Cavite City');
insert into branches (id, name, code, address) values ('br-cdo', 'Cagayan de Oro', 'CDO', 'Corrales Ave, Cagayan de Oro');
insert into branches (id, name, code, address) values ('br-pgs', 'Pangasinan', 'PGS', 'McArthur Highway, Dagupan City, Pangasinan');
insert into branches (id, name, code, address) values ('br-lcn', 'Lucena', 'LCN', 'Merchan St, Lucena City');
insert into branches (id, name, code, address) values ('br-bcd', 'Bacolod', 'BCD', 'Lacson St, Bacolod City');

-- Departments
insert into departments (id, name) values ('dp-bod', 'BOD');
insert into departments (id, name) values ('dp-acctg', 'Accounting');
insert into departments (id, name) values ('dp-fin', 'Finance');
insert into departments (id, name) values ('dp-hr', 'Human Resources');
insert into departments (id, name) values ('dp-darofy-mktg', 'Darofy - Marketing');
insert into departments (id, name) values ('dp-darofy-sales', 'Darofy - Sales');
insert into departments (id, name) values ('dp-mlm-netdev', 'MLM - Network Development');
insert into departments (id, name) values ('dp-mlm-mktg', 'MLM - Marketing');
insert into departments (id, name) values ('dp-mlm-sales', 'MLM - Sales');
insert into departments (id, name) values ('dp-cosmetics', 'Cosmetics');
insert into departments (id, name) values ('dp-darofy-marketing-corp', 'Darofy Marketing');
insert into departments (id, name) values ('dp-indie-mktg', 'Independent Marketing');
insert into departments (id, name) values ('dp-operation', 'Operations');

-- Positions
insert into positions (id, title, department_id) values ('ps-chairman-of-the-board-1', 'Chairman of the Board', 'dp-bod');
insert into positions (id, title, department_id) values ('ps-president-for-cosmetics-2', 'President for Cosmetics', 'dp-bod');
insert into positions (id, title, department_id) values ('ps-president-for-darofy-3', 'President for Darofy', 'dp-bod');
insert into positions (id, title, department_id) values ('ps-vice-chairperson-4', 'Vice Chairperson', 'dp-bod');
insert into positions (id, title, department_id) values ('ps-chief-finance-officer-5', 'Chief Finance Officer', 'dp-acctg');
insert into positions (id, title, department_id) values ('ps-accounting-clerk-6', 'Accounting Clerk', 'dp-acctg');
insert into positions (id, title, department_id) values ('ps-sr-accounting-assistant-7', 'Sr. Accounting Assistant', 'dp-acctg');
insert into positions (id, title, department_id) values ('ps-jr-accounting-assistant-8', 'Jr. Accounting Assistant', 'dp-acctg');
insert into positions (id, title, department_id) values ('ps-bookkeeper-9', 'Bookkeeper', 'dp-fin');
insert into positions (id, title, department_id) values ('ps-corporate-treasurer-10', 'Corporate Treasurer', 'dp-fin');
insert into positions (id, title, department_id) values ('ps-hr-manager-11', 'HR Manager', 'dp-hr');
insert into positions (id, title, department_id) values ('ps-content-creator-12', 'Content Creator', 'dp-darofy-mktg');
insert into positions (id, title, department_id) values ('ps-marketing-head-13', 'Marketing Head', 'dp-darofy-mktg');
insert into positions (id, title, department_id) values ('ps-multimedia-artist-14', 'Multimedia Artist', 'dp-darofy-mktg');
insert into positions (id, title, department_id) values ('ps-sales-manager-15', 'Sales Manager', 'dp-darofy-sales');
insert into positions (id, title, department_id) values ('ps-sales-admin-16', 'Sales Admin', 'dp-darofy-sales');
insert into positions (id, title, department_id) values ('ps-network-development-head-luzon-17', 'Network Development Head - Luzon', 'dp-mlm-netdev');
insert into positions (id, title, department_id) values ('ps-network-development-head-visayas-18', 'Network Development Head - Visayas', 'dp-mlm-netdev');
insert into positions (id, title, department_id) values ('ps-network-development-head-mindanao-19', 'Network Development Head - Mindanao', 'dp-mlm-netdev');
insert into positions (id, title, department_id) values ('ps-multimedia-artist-20', 'Multimedia Artist', 'dp-mlm-mktg');
insert into positions (id, title, department_id) values ('ps-social-media-manager-21', 'Social Media Manager', 'dp-mlm-mktg');
insert into positions (id, title, department_id) values ('ps-video-editor-22', 'Video Editor', 'dp-mlm-mktg');
insert into positions (id, title, department_id) values ('ps-ads-specialist-23', 'Ads Specialist', 'dp-mlm-sales');
insert into positions (id, title, department_id) values ('ps-sales-admin-24', 'Sales Admin', 'dp-mlm-sales');
insert into positions (id, title, department_id) values ('ps-platform-specialist-25', 'Platform Specialist', 'dp-cosmetics');
insert into positions (id, title, department_id) values ('ps-multimedia-artist-head-26', 'Multimedia Artist Head', 'dp-cosmetics');
insert into positions (id, title, department_id) values ('ps-video-editor-27', 'Video Editor', 'dp-cosmetics');
insert into positions (id, title, department_id) values ('ps-multimedia-artist-head-mlm-28', 'Multimedia Artist Head (MLM)', 'dp-darofy-marketing-corp');
insert into positions (id, title, department_id) values ('ps-multimedia-artist-head-29', 'Multimedia Artist Head', 'dp-mlm-mktg');
insert into positions (id, title, department_id) values ('ps-marketing-assistant-30', 'Marketing Assistant', 'dp-indie-mktg');
insert into positions (id, title, department_id) values ('ps-product-specialist-31', 'Product Specialist', 'dp-indie-mktg');
insert into positions (id, title, department_id) values ('ps-cashier-32', 'Cashier', 'dp-operation');
insert into positions (id, title, department_id) values ('ps-csr-33', 'CSR', 'dp-operation');
insert into positions (id, title, department_id) values ('ps-warehouseman-34', 'Warehouseman', 'dp-operation');
insert into positions (id, title, department_id) values ('ps-operations-manager-35', 'Operations Manager', 'dp-operation');
insert into positions (id, title, department_id) values ('ps-driver-messenger-36', 'Driver / Messenger', 'dp-operation');
insert into positions (id, title, department_id) values ('ps-logistics-staff-37', 'Logistics Staff', 'dp-operation');
insert into positions (id, title, department_id) values ('ps-operations-supervisor-38', 'Operations Supervisor', 'dp-operation');
insert into positions (id, title, department_id) values ('ps-utility-39', 'Utility', 'dp-operation');
insert into positions (id, title, department_id) values ('ps-branch-supervisor-40', 'Branch Supervisor', 'dp-operation');
insert into positions (id, title, department_id) values ('ps-branch-manager-41', 'Branch Manager', 'dp-operation');
insert into positions (id, title, department_id) values ('ps-driver-warehouseman-42', 'Driver / Warehouseman', 'dp-operation');
insert into positions (id, title, department_id) values ('ps-stockman-43', 'Stockman', 'dp-operation');

-- Work schedules
insert into work_schedules (id, name, time_in, time_out, days, grace_minutes) values ('ws-day', 'Day Shift', '08:00', '17:00', 'Mon–Fri', 10);
insert into work_schedules (id, name, time_in, time_out, days, grace_minutes) values ('ws-early', 'Early Shift', '06:00', '15:00', 'Mon–Sat', 10);
insert into work_schedules (id, name, time_in, time_out, days, grace_minutes) values ('ws-mid', 'Mid Shift', '10:00', '19:00', 'Mon–Sat', 10);
insert into work_schedules (id, name, time_in, time_out, days, grace_minutes) values ('ws-night', 'Night Shift', '22:00', '07:00', 'Mon–Sat', 15);
insert into work_schedules (id, name, time_in, time_out, days, grace_minutes) values ('ws-flexi', 'Flexi', '09:00', '18:00', 'Mon–Fri', 15);

-- Holidays
insert into holidays (id, name, date, type, verified) values ('hd-1', 'New Year''s Day', '2026-01-01', 'regular', true);
insert into holidays (id, name, date, type, verified) values ('hd-2', 'Araw ng Kagitingan', '2026-04-09', 'regular', true);
insert into holidays (id, name, date, type, verified) values ('hd-3', 'Maundy Thursday', '2026-04-02', 'regular', false);
insert into holidays (id, name, date, type, verified) values ('hd-4', 'Good Friday', '2026-04-03', 'regular', false);
insert into holidays (id, name, date, type, verified) values ('hd-5', 'Labor Day', '2026-05-01', 'regular', true);
insert into holidays (id, name, date, type, verified) values ('hd-6', 'Independence Day', '2026-06-12', 'regular', true);
insert into holidays (id, name, date, type, verified) values ('hd-7', 'Ninoy Aquino Day', '2026-08-21', 'special_non_working', true);
insert into holidays (id, name, date, type, verified) values ('hd-8', 'National Heroes Day', '2026-08-31', 'regular', false);
insert into holidays (id, name, date, type, verified) values ('hd-9', 'All Saints'' Day (observed)', '2026-11-01', 'special_non_working', false);
insert into holidays (id, name, date, type, verified) values ('hd-10', 'Bonifacio Day', '2026-11-30', 'regular', true);
insert into holidays (id, name, date, type, verified) values ('hd-11', 'Christmas Day', '2026-12-25', 'regular', true);
insert into holidays (id, name, date, type, verified) values ('hd-12', 'Rizal Day', '2026-12-30', 'regular', true);
insert into holidays (id, name, date, type, verified) values ('hd-13', 'Last Day of the Year', '2026-12-31', 'special_non_working', false);

-- Leave types
insert into leave_types (id, name, default_credits, requires_cert) values ('lt-vl', 'Vacation Leave', 15, false);
insert into leave_types (id, name, default_credits, requires_cert) values ('lt-sl', 'Sick Leave', 15, true);
insert into leave_types (id, name, default_credits, requires_cert) values ('lt-el', 'Emergency Leave', 3, false);
insert into leave_types (id, name, default_credits, requires_cert) values ('lt-spl', 'Solo Parent Leave', 7, false);
insert into leave_types (id, name, default_credits, requires_cert) values ('lt-ml', 'Maternity Leave', 105, true);
insert into leave_types (id, name, default_credits, requires_cert) values ('lt-pl', 'Paternity Leave', 7, false);
insert into leave_types (id, name, default_credits, requires_cert) values ('lt-bl', 'Bereavement Leave', 3, false);
insert into leave_types (id, name, default_credits, requires_cert) values ('lt-lwop', 'Leave Without Pay', 0, false);

-- Payroll periods
insert into payroll_periods (id, period_start, period_end, status) values ('pp-h1', '2026-01-01', '2026-01-15', 'closed');
insert into payroll_periods (id, period_start, period_end, status) values ('pp-h2', '2026-01-16', '2026-01-31', 'closed');
insert into payroll_periods (id, period_start, period_end, status) values ('pp-h3', '2026-02-01', '2026-02-15', 'closed');
insert into payroll_periods (id, period_start, period_end, status) values ('pp-h4', '2026-02-16', '2026-02-28', 'closed');
insert into payroll_periods (id, period_start, period_end, status) values ('pp-h5', '2026-03-01', '2026-03-15', 'closed');
insert into payroll_periods (id, period_start, period_end, status) values ('pp-h6', '2026-03-16', '2026-03-31', 'closed');
insert into payroll_periods (id, period_start, period_end, status) values ('pp-h7', '2026-04-01', '2026-04-15', 'closed');
insert into payroll_periods (id, period_start, period_end, status) values ('pp-h8', '2026-04-16', '2026-04-30', 'closed');
insert into payroll_periods (id, period_start, period_end, status) values ('pp-1', '2026-05-01', '2026-05-15', 'closed');
insert into payroll_periods (id, period_start, period_end, status) values ('pp-2', '2026-05-16', '2026-05-31', 'closed');
insert into payroll_periods (id, period_start, period_end, status) values ('pp-3', '2026-06-01', '2026-06-15', 'closed');
insert into payroll_periods (id, period_start, period_end, status) values ('pp-4', '2026-06-16', '2026-06-30', 'closed');
insert into payroll_periods (id, period_start, period_end, status) values ('pp-5', '2026-07-01', '2026-07-15', 'locked');
insert into payroll_periods (id, period_start, period_end, status) values ('pp-6', '2026-07-16', '2026-07-31', 'open');

-- Employees (201 file) — inserted with supervisor_id/job_performance_evaluator_id
-- deferred via a second pass, since some supervisors are defined later in the array.
insert into employees (
  id, employee_number, first_name, last_name, middle_name, nickname, gender, birthdate,
  civil_status, nationality, address, contact_number, email, emergency_contact_name, emergency_contact_phone,
  branch_id, department_id, position_id,
  employment_status, date_hired, date_regularized, contract_start, contract_end, probation_ends_at,
  payroll_type, daily_rate, monthly_salary, daily_allowance, monthly_allowance,
  status, status_changed_at, roles
) values (
  'emp-001', 'SDSI-0001', 'Lowel', 'Magdadaro', null, 'Lowe', 'Female', '1975-01-03',
  'Single', 'Filipino', '819 Mabini St., CBT', '09814377841', 'lowel.magdadaro@shantahl.com.ph', 'Santos, Emergency Contact', '09544883796',
  'br-cbt', 'dp-bod', 'ps-chairman-of-the-board-1',
  'regular', '2025-07-13', '2026-01-13', null, null, null,
  'monthly', null, 75000, null, null,
  'active', null, array['upper_management']
);
insert into employees (
  id, employee_number, first_name, last_name, middle_name, nickname, gender, birthdate,
  civil_status, nationality, address, contact_number, email, emergency_contact_name, emergency_contact_phone,
  branch_id, department_id, position_id,
  employment_status, date_hired, date_regularized, contract_start, contract_end, probation_ends_at,
  payroll_type, daily_rate, monthly_salary, daily_allowance, monthly_allowance,
  status, status_changed_at, roles
) values (
  'emp-002', 'SDSI-0002', 'Junrey', 'Japitan', null, 'Junr', 'Female', '1976-04-08',
  'Widowed', 'Filipino', '159 Mabini St., CBT', '09760377693', 'junrey.japitan@shantahl.com.ph', 'Santos, Emergency Contact', '09681966606',
  'br-cbt', 'dp-bod', 'ps-president-for-cosmetics-2',
  'regular', '2024-07-12', '2025-01-12', null, null, null,
  'monthly', null, 50000, null, null,
  'active', null, array['upper_management']
);
insert into employees (
  id, employee_number, first_name, last_name, middle_name, nickname, gender, birthdate,
  civil_status, nationality, address, contact_number, email, emergency_contact_name, emergency_contact_phone,
  branch_id, department_id, position_id,
  employment_status, date_hired, date_regularized, contract_start, contract_end, probation_ends_at,
  payroll_type, daily_rate, monthly_salary, daily_allowance, monthly_allowance,
  status, status_changed_at, roles
) values (
  'emp-003', 'SDSI-0003', 'Magdadaro', 'Mark Anthony', null, 'Magd', 'Female', '1977-07-13',
  'Single', 'Filipino', '721 Mabini St., CBT', '09155203271', 'magdadaro.markanthony@shantahl.com.ph', 'Castillo, Emergency Contact', '09748039203',
  'br-cbt', 'dp-bod', 'ps-president-for-darofy-3',
  'regular', '2023-07-12', '2024-01-12', null, null, null,
  'monthly', null, 50000, null, null,
  'active', null, array['upper_management']
);
insert into employees (
  id, employee_number, first_name, last_name, middle_name, nickname, gender, birthdate,
  civil_status, nationality, address, contact_number, email, emergency_contact_name, emergency_contact_phone,
  branch_id, department_id, position_id,
  employment_status, date_hired, date_regularized, contract_start, contract_end, probation_ends_at,
  payroll_type, daily_rate, monthly_salary, daily_allowance, monthly_allowance,
  status, status_changed_at, roles
) values (
  'emp-004', 'SDSI-0004', 'Sheilah', 'Magdadaro', null, 'Shei', 'Male', '1978-10-18',
  'Widowed', 'Filipino', '389 Mabini St., CBT', '09883582018', 'sheilah.magdadaro@shantahl.com.ph', 'Castillo, Emergency Contact', '09843379746',
  'br-cbt', 'dp-bod', 'ps-vice-chairperson-4',
  'regular', '2022-07-11', '2023-01-11', null, null, null,
  'monthly', null, 35000, null, null,
  'active', null, array['upper_management']
);
insert into employees (
  id, employee_number, first_name, last_name, middle_name, nickname, gender, birthdate,
  civil_status, nationality, address, contact_number, email, emergency_contact_name, emergency_contact_phone,
  branch_id, department_id, position_id,
  employment_status, date_hired, date_regularized, contract_start, contract_end, probation_ends_at,
  payroll_type, daily_rate, monthly_salary, daily_allowance, monthly_allowance,
  status, status_changed_at, roles
) values (
  'emp-005', 'SDSI-0005', 'Maricris', 'Barlinan', null, 'Mari', 'Female', '1979-01-23',
  'Single', 'Filipino', '790 Mabini St., CBT', '09694456749', 'maricris.barlinan@shantahl.com.ph', 'Cruz, Emergency Contact', '09893882675',
  'br-cbt', 'dp-acctg', 'ps-chief-finance-officer-5',
  'regular', '2021-07-10', '2022-01-10', null, null, null,
  'monthly', null, 20000, null, 5000,
  'active', null, array['cfo']
);
insert into employees (
  id, employee_number, first_name, last_name, middle_name, nickname, gender, birthdate,
  civil_status, nationality, address, contact_number, email, emergency_contact_name, emergency_contact_phone,
  branch_id, department_id, position_id,
  employment_status, date_hired, date_regularized, contract_start, contract_end, probation_ends_at,
  payroll_type, daily_rate, monthly_salary, daily_allowance, monthly_allowance,
  status, status_changed_at, roles
) values (
  'emp-006', 'SDSI-0006', 'Abigail', 'Caluya', null, 'Abig', 'Female', '1980-04-03',
  'Single', 'Filipino', '495 Mabini St., CBT', '09515648848', 'abigail.caluya@shantahl.com.ph', 'Garcia, Emergency Contact', '09649037673',
  'br-cbt', 'dp-acctg', 'ps-accounting-clerk-6',
  'regular', '2020-07-09', '2021-01-09', null, null, null,
  'daily', 590, null, 22, null,
  'active', null, array['employee']
);
insert into employees (
  id, employee_number, first_name, last_name, middle_name, nickname, gender, birthdate,
  civil_status, nationality, address, contact_number, email, emergency_contact_name, emergency_contact_phone,
  branch_id, department_id, position_id,
  employment_status, date_hired, date_regularized, contract_start, contract_end, probation_ends_at,
  payroll_type, daily_rate, monthly_salary, daily_allowance, monthly_allowance,
  status, status_changed_at, roles
) values (
  'emp-007', 'SDSI-0007', 'Wendie', 'Halog', null, 'Wend', 'Female', '1981-07-08',
  'Single', 'Filipino', '720 Mabini St., CBT', '09775726408', 'wendie.halog@shantahl.com.ph', 'Garcia, Emergency Contact', '09325738528',
  'br-cbt', 'dp-acctg', 'ps-sr-accounting-assistant-7',
  'regular', '2019-07-09', '2020-01-09', null, null, null,
  'daily', 691, null, 22, null,
  'active', null, array['sr_accounting_assistant', 'payroll_officer']
);
insert into employees (
  id, employee_number, first_name, last_name, middle_name, nickname, gender, birthdate,
  civil_status, nationality, address, contact_number, email, emergency_contact_name, emergency_contact_phone,
  branch_id, department_id, position_id,
  employment_status, date_hired, date_regularized, contract_start, contract_end, probation_ends_at,
  payroll_type, daily_rate, monthly_salary, daily_allowance, monthly_allowance,
  status, status_changed_at, roles
) values (
  'emp-008', 'SDSI-0008', 'Charmaine', 'Palacio', null, 'Char', 'Male', '1982-10-13',
  'Widowed', 'Filipino', '623 Mabini St., CBT', '09596558039', 'charmaine.palacio@shantahl.com.ph', 'Torres, Emergency Contact', '09398102204',
  'br-cbt', 'dp-acctg', 'ps-jr-accounting-assistant-8',
  'regular', '2018-07-08', '2019-01-08', null, null, null,
  'daily', 671, null, 22, null,
  'active', null, array['employee']
);
insert into employees (
  id, employee_number, first_name, last_name, middle_name, nickname, gender, birthdate,
  civil_status, nationality, address, contact_number, email, emergency_contact_name, emergency_contact_phone,
  branch_id, department_id, position_id,
  employment_status, date_hired, date_regularized, contract_start, contract_end, probation_ends_at,
  payroll_type, daily_rate, monthly_salary, daily_allowance, monthly_allowance,
  status, status_changed_at, roles
) values (
  'emp-009', 'SDSI-0009', 'Kathleen', 'Surigao', null, 'Kath', 'Female', '1983-01-18',
  'Widowed', 'Filipino', '883 Mabini St., CBT', '09799299053', 'kathleen.surigao@shantahl.com.ph', 'Ramos, Emergency Contact', '09299216228',
  'br-cbt', 'dp-acctg', 'ps-accounting-clerk-6',
  'regular', '2017-07-07', '2018-01-07', null, null, null,
  'daily', 590, null, 22, null,
  'active', null, array['employee']
);
insert into employees (
  id, employee_number, first_name, last_name, middle_name, nickname, gender, birthdate,
  civil_status, nationality, address, contact_number, email, emergency_contact_name, emergency_contact_phone,
  branch_id, department_id, position_id,
  employment_status, date_hired, date_regularized, contract_start, contract_end, probation_ends_at,
  payroll_type, daily_rate, monthly_salary, daily_allowance, monthly_allowance,
  status, status_changed_at, roles
) values (
  'emp-010', 'SDSI-0010', 'Erika Grace', 'Bulaclac', null, 'Erik', 'Male', '1984-04-23',
  'Single', 'Filipino', '662 Mabini St., CBT', '09223669959', 'erikagrace.bulaclac@shantahl.com.ph', 'Santos, Emergency Contact', '09198070206',
  'br-cbt', 'dp-fin', 'ps-bookkeeper-9',
  'regular', '2016-07-06', '2017-01-06', null, null, null,
  'daily', 590, null, 22, null,
  'active', null, array['employee']
);
insert into employees (
  id, employee_number, first_name, last_name, middle_name, nickname, gender, birthdate,
  civil_status, nationality, address, contact_number, email, emergency_contact_name, emergency_contact_phone,
  branch_id, department_id, position_id,
  employment_status, date_hired, date_regularized, contract_start, contract_end, probation_ends_at,
  payroll_type, daily_rate, monthly_salary, daily_allowance, monthly_allowance,
  status, status_changed_at, roles
) values (
  'emp-011', 'SDSI-0011', 'Joan Mariette', 'Santarina', null, 'Joan', 'Male', '1985-07-16',
  'Single', 'Filipino', '842 Mabini St., CBT', '09280130817', 'joanmariette.santarina@shantahl.com.ph', 'Santos, Emergency Contact', '09503468972',
  'br-cbt', 'dp-fin', 'ps-corporate-treasurer-10',
  'regular', '2025-07-03', '2026-01-03', null, null, null,
  'daily', 723, null, 28, null,
  'active', null, array['treasurer']
);
insert into employees (
  id, employee_number, first_name, last_name, middle_name, nickname, gender, birthdate,
  civil_status, nationality, address, contact_number, email, emergency_contact_name, emergency_contact_phone,
  branch_id, department_id, position_id,
  employment_status, date_hired, date_regularized, contract_start, contract_end, probation_ends_at,
  payroll_type, daily_rate, monthly_salary, daily_allowance, monthly_allowance,
  status, status_changed_at, roles
) values (
  'emp-012', 'SDSI-0012', 'Sheena', 'Evangelista', null, 'Shee', 'Female', '1986-10-08',
  'Single', 'Filipino', '146 Mabini St., CBT', '09202523426', 'sheena.evangelista@shantahl.com.ph', 'Garcia, Emergency Contact', '09809690825',
  'br-cbt', 'dp-hr', 'ps-hr-manager-11',
  'regular', '2024-07-02', '2025-01-02', null, null, null,
  'daily', 723, null, 28, null,
  'active', null, array['hr_admin']
);
insert into employees (
  id, employee_number, first_name, last_name, middle_name, nickname, gender, birthdate,
  civil_status, nationality, address, contact_number, email, emergency_contact_name, emergency_contact_phone,
  branch_id, department_id, position_id,
  employment_status, date_hired, date_regularized, contract_start, contract_end, probation_ends_at,
  payroll_type, daily_rate, monthly_salary, daily_allowance, monthly_allowance,
  status, status_changed_at, roles
) values (
  'emp-013', 'SDSI-0013', 'Angela', 'Acosta', null, 'Ange', 'Female', '1987-01-13',
  'Widowed', 'Filipino', '625 Mabini St., CBT', '09834478972', 'angela.acosta@shantahl.com.ph', 'Torres, Emergency Contact', '09251593727',
  'br-cbt', 'dp-darofy-mktg', 'ps-content-creator-12',
  'regular', '2023-07-02', '2024-01-02', null, null, null,
  'daily', 590, null, 22, null,
  'active', null, array['employee']
);
insert into employees (
  id, employee_number, first_name, last_name, middle_name, nickname, gender, birthdate,
  civil_status, nationality, address, contact_number, email, emergency_contact_name, emergency_contact_phone,
  branch_id, department_id, position_id,
  employment_status, date_hired, date_regularized, contract_start, contract_end, probation_ends_at,
  payroll_type, daily_rate, monthly_salary, daily_allowance, monthly_allowance,
  status, status_changed_at, roles
) values (
  'emp-014', 'SDSI-0014', 'Erwin', 'Carreon', null, 'Erwi', 'Male', '1988-04-18',
  'Single', 'Filipino', '366 Mabini St., CBT', '09374213352', 'erwin.carreon@shantahl.com.ph', 'Cruz, Emergency Contact', '09640012596',
  'br-cbt', 'dp-darofy-mktg', 'ps-content-creator-12',
  'regular', '2022-07-01', '2023-01-01', null, null, null,
  'daily', 590, null, 22, null,
  'active', null, array['employee']
);
insert into employees (
  id, employee_number, first_name, last_name, middle_name, nickname, gender, birthdate,
  civil_status, nationality, address, contact_number, email, emergency_contact_name, emergency_contact_phone,
  branch_id, department_id, position_id,
  employment_status, date_hired, date_regularized, contract_start, contract_end, probation_ends_at,
  payroll_type, daily_rate, monthly_salary, daily_allowance, monthly_allowance,
  status, status_changed_at, roles
) values (
  'emp-015', 'SDSI-0015', 'Sarah Mae', 'Iglesia', null, 'Sara', 'Female', '1989-07-23',
  'Single', 'Filipino', '200 Mabini St., CBT', '09535272254', 'sarahmae.iglesia@shantahl.com.ph', 'Santos, Emergency Contact', '09623635778',
  'br-cbt', 'dp-darofy-mktg', 'ps-marketing-head-13',
  'regular', '2021-06-30', '2021-12-30', null, null, null,
  'daily', 691, null, 22, null,
  'active', null, array['employee']
);
insert into employees (
  id, employee_number, first_name, last_name, middle_name, nickname, gender, birthdate,
  civil_status, nationality, address, contact_number, email, emergency_contact_name, emergency_contact_phone,
  branch_id, department_id, position_id,
  employment_status, date_hired, date_regularized, contract_start, contract_end, probation_ends_at,
  payroll_type, daily_rate, monthly_salary, daily_allowance, monthly_allowance,
  status, status_changed_at, roles
) values (
  'emp-016', 'SDSI-0016', 'Frank', 'Delos Santos', null, 'Fran', 'Female', '1990-10-03',
  'Married', 'Filipino', '375 Mabini St., CBT', '09623078009', 'frank.delossantos@shantahl.com.ph', 'Santos, Emergency Contact', '09397007915',
  'br-cbt', 'dp-darofy-mktg', 'ps-multimedia-artist-14',
  'regular', '2020-06-29', '2020-12-29', null, null, null,
  'daily', 590, null, 22, null,
  'active', null, array['employee']
);
insert into employees (
  id, employee_number, first_name, last_name, middle_name, nickname, gender, birthdate,
  civil_status, nationality, address, contact_number, email, emergency_contact_name, emergency_contact_phone,
  branch_id, department_id, position_id,
  employment_status, date_hired, date_regularized, contract_start, contract_end, probation_ends_at,
  payroll_type, daily_rate, monthly_salary, daily_allowance, monthly_allowance,
  status, status_changed_at, roles
) values (
  'emp-017', 'SDSI-0017', 'Mae', 'Japitan', null, 'Mae', 'Male', '1991-01-08',
  'Single', 'Filipino', '371 Mabini St., CBT', '09769192700', 'mae.japitan@shantahl.com.ph', 'Bautista, Emergency Contact', '09179040997',
  'br-cbt', 'dp-darofy-sales', 'ps-sales-manager-15',
  'regular', '2019-06-29', '2019-12-29', null, null, null,
  'daily', 691, null, 22, null,
  'active', null, array['dept_head', 'employee']
);
insert into employees (
  id, employee_number, first_name, last_name, middle_name, nickname, gender, birthdate,
  civil_status, nationality, address, contact_number, email, emergency_contact_name, emergency_contact_phone,
  branch_id, department_id, position_id,
  employment_status, date_hired, date_regularized, contract_start, contract_end, probation_ends_at,
  payroll_type, daily_rate, monthly_salary, daily_allowance, monthly_allowance,
  status, status_changed_at, roles
) values (
  'emp-018', 'SDSI-0018', 'Christian Mharbee', 'Mongcal', null, 'Chri', 'Female', '1992-04-13',
  'Single', 'Filipino', '157 Mabini St., CBT', '09346999412', 'christianmharbee.mongcal@shantahl.com.ph', 'Ramos, Emergency Contact', '09603287414',
  'br-cbt', 'dp-darofy-sales', 'ps-sales-admin-16',
  'regular', '2018-06-28', '2018-12-28', null, null, null,
  'daily', 590, null, 22, null,
  'active', null, array['employee']
);
insert into employees (
  id, employee_number, first_name, last_name, middle_name, nickname, gender, birthdate,
  civil_status, nationality, address, contact_number, email, emergency_contact_name, emergency_contact_phone,
  branch_id, department_id, position_id,
  employment_status, date_hired, date_regularized, contract_start, contract_end, probation_ends_at,
  payroll_type, daily_rate, monthly_salary, daily_allowance, monthly_allowance,
  status, status_changed_at, roles
) values (
  'emp-019', 'SDSI-0019', 'Fernan', 'Barlinan', null, 'Fern', 'Male', '1993-07-18',
  'Single', 'Filipino', '626 Mabini St., CBT', '09108323567', 'fernan.barlinan@shantahl.com.ph', 'Castillo, Emergency Contact', '09754806675',
  'br-cbt', 'dp-darofy-sales', 'ps-sales-admin-16',
  'regular', '2017-06-27', '2017-12-27', null, null, null,
  'daily', 590, null, 22, null,
  'active', null, array['employee']
);
insert into employees (
  id, employee_number, first_name, last_name, middle_name, nickname, gender, birthdate,
  civil_status, nationality, address, contact_number, email, emergency_contact_name, emergency_contact_phone,
  branch_id, department_id, position_id,
  employment_status, date_hired, date_regularized, contract_start, contract_end, probation_ends_at,
  payroll_type, daily_rate, monthly_salary, daily_allowance, monthly_allowance,
  status, status_changed_at, roles
) values (
  'emp-020', 'SDSI-0020', 'Chester', 'Rosales', null, 'Ches', 'Female', '1994-10-23',
  'Married', 'Filipino', '208 Mabini St., MNL', '09718018064', 'chester.rosales@shantahl.com.ph', 'Torres, Emergency Contact', '09374864293',
  'br-mnl', 'dp-mlm-netdev', 'ps-network-development-head-luzon-17',
  'regular', '2016-06-26', '2016-12-26', null, null, null,
  'monthly', null, 19432, null, 5568,
  'active', null, array['employee']
);
insert into employees (
  id, employee_number, first_name, last_name, middle_name, nickname, gender, birthdate,
  civil_status, nationality, address, contact_number, email, emergency_contact_name, emergency_contact_phone,
  branch_id, department_id, position_id,
  employment_status, date_hired, date_regularized, contract_start, contract_end, probation_ends_at,
  payroll_type, daily_rate, monthly_salary, daily_allowance, monthly_allowance,
  status, status_changed_at, roles
) values (
  'emp-021', 'SDSI-0021', 'Randel', 'Segovia', null, 'Rand', 'Male', '1995-01-03',
  'Widowed', 'Filipino', '685 Mabini St., MDU', '09155228070', 'randel.segovia@shantahl.com.ph', 'Torres, Emergency Contact', '09835109785',
  'br-mdu', 'dp-mlm-netdev', 'ps-network-development-head-visayas-18',
  'regular', '2025-06-23', '2025-12-23', null, null, null,
  'monthly', null, 19432, null, 5568,
  'resigned', '2026-07-07', array['employee']
);
insert into employees (
  id, employee_number, first_name, last_name, middle_name, nickname, gender, birthdate,
  civil_status, nationality, address, contact_number, email, emergency_contact_name, emergency_contact_phone,
  branch_id, department_id, position_id,
  employment_status, date_hired, date_regularized, contract_start, contract_end, probation_ends_at,
  payroll_type, daily_rate, monthly_salary, daily_allowance, monthly_allowance,
  status, status_changed_at, roles
) values (
  'emp-022', 'SDSI-0022', 'Domecillo', 'Romelito', null, 'Dome', 'Female', '1996-04-08',
  'Single', 'Filipino', '386 Mabini St., MNL', '09657433461', 'domecillo.romelito@shantahl.com.ph', 'Ramos, Emergency Contact', '09837355007',
  'br-mnl', 'dp-mlm-netdev', 'ps-network-development-head-mindanao-19',
  'regular', '2024-06-22', '2024-12-22', null, null, null,
  'monthly', null, 19432, null, 5568,
  'active', null, array['employee']
);
insert into employees (
  id, employee_number, first_name, last_name, middle_name, nickname, gender, birthdate,
  civil_status, nationality, address, contact_number, email, emergency_contact_name, emergency_contact_phone,
  branch_id, department_id, position_id,
  employment_status, date_hired, date_regularized, contract_start, contract_end, probation_ends_at,
  payroll_type, daily_rate, monthly_salary, daily_allowance, monthly_allowance,
  status, status_changed_at, roles
) values (
  'emp-023', 'SDSI-0023', 'John Michael', 'De Maliwat', null, 'John', 'Male', '1997-07-13',
  'Single', 'Filipino', '410 Mabini St., CBT', '09716857942', 'johnmichael.demaliwat@shantahl.com.ph', 'Bautista, Emergency Contact', '09310118476',
  'br-cbt', 'dp-mlm-mktg', 'ps-multimedia-artist-20',
  'regular', '2023-06-22', '2023-12-22', null, null, null,
  'daily', 590, null, 22, null,
  'active', null, array['employee']
);
insert into employees (
  id, employee_number, first_name, last_name, middle_name, nickname, gender, birthdate,
  civil_status, nationality, address, contact_number, email, emergency_contact_name, emergency_contact_phone,
  branch_id, department_id, position_id,
  employment_status, date_hired, date_regularized, contract_start, contract_end, probation_ends_at,
  payroll_type, daily_rate, monthly_salary, daily_allowance, monthly_allowance,
  status, status_changed_at, roles
) values (
  'emp-024', 'SDSI-0024', 'Jaz', 'Eusebio', null, 'Jaz', 'Male', '1998-10-18',
  'Widowed', 'Filipino', '893 Mabini St., CBT', '09564468182', 'jaz.eusebio@shantahl.com.ph', 'Santos, Emergency Contact', '09361267731',
  'br-cbt', 'dp-mlm-mktg', 'ps-social-media-manager-21',
  'freelance', '2022-06-21', null, null, null, null,
  'monthly', null, 18000, null, null,
  'active', null, array['employee']
);
insert into employees (
  id, employee_number, first_name, last_name, middle_name, nickname, gender, birthdate,
  civil_status, nationality, address, contact_number, email, emergency_contact_name, emergency_contact_phone,
  branch_id, department_id, position_id,
  employment_status, date_hired, date_regularized, contract_start, contract_end, probation_ends_at,
  payroll_type, daily_rate, monthly_salary, daily_allowance, monthly_allowance,
  status, status_changed_at, roles
) values (
  'emp-025', 'SDSI-0025', 'Renz', 'Nunez', null, 'Renz', 'Male', '1999-01-23',
  'Single', 'Filipino', '832 Mabini St., MNL', '09312321708', 'renz.nunez@shantahl.com.ph', 'Bautista, Emergency Contact', '09810023459',
  'br-mnl', 'dp-mlm-mktg', 'ps-social-media-manager-21',
  'freelance', '2021-06-20', null, null, null, null,
  'daily', 881.79, null, 0, null,
  'active', null, array['employee']
);
insert into employees (
  id, employee_number, first_name, last_name, middle_name, nickname, gender, birthdate,
  civil_status, nationality, address, contact_number, email, emergency_contact_name, emergency_contact_phone,
  branch_id, department_id, position_id,
  employment_status, date_hired, date_regularized, contract_start, contract_end, probation_ends_at,
  payroll_type, daily_rate, monthly_salary, daily_allowance, monthly_allowance,
  status, status_changed_at, roles
) values (
  'emp-026', 'SDSI-0026', 'Danniel', 'Borja', null, 'Dann', 'Female', '1975-04-03',
  'Widowed', 'Filipino', '798 Mabini St., MNL', '09655959362', 'danniel.borja@shantahl.com.ph', 'Ramos, Emergency Contact', '09434923531',
  'br-mnl', 'dp-mlm-mktg', 'ps-video-editor-22',
  'freelance', '2020-06-19', null, null, null, null,
  'daily', 881.79, null, 0, null,
  'active', null, array['employee']
);
insert into employees (
  id, employee_number, first_name, last_name, middle_name, nickname, gender, birthdate,
  civil_status, nationality, address, contact_number, email, emergency_contact_name, emergency_contact_phone,
  branch_id, department_id, position_id,
  employment_status, date_hired, date_regularized, contract_start, contract_end, probation_ends_at,
  payroll_type, daily_rate, monthly_salary, daily_allowance, monthly_allowance,
  status, status_changed_at, roles
) values (
  'emp-027', 'SDSI-0027', 'Michelle', 'Ignacio', null, 'Mich', 'Male', '1976-07-08',
  'Widowed', 'Filipino', '832 Mabini St., CBT', '09202863933', 'michelle.ignacio@shantahl.com.ph', 'Mendoza, Emergency Contact', '09116476333',
  'br-cbt', 'dp-mlm-sales', 'ps-ads-specialist-23',
  'freelance', '2019-06-19', null, null, null, null,
  'monthly', null, 18000, null, null,
  'active', null, array['employee']
);
insert into employees (
  id, employee_number, first_name, last_name, middle_name, nickname, gender, birthdate,
  civil_status, nationality, address, contact_number, email, emergency_contact_name, emergency_contact_phone,
  branch_id, department_id, position_id,
  employment_status, date_hired, date_regularized, contract_start, contract_end, probation_ends_at,
  payroll_type, daily_rate, monthly_salary, daily_allowance, monthly_allowance,
  status, status_changed_at, roles
) values (
  'emp-028', 'SDSI-0028', 'Eric', 'Ads Specialist', null, 'Eric', 'Female', '1977-10-13',
  'Single', 'Filipino', '351 Mabini St., CEB', '09287144025', 'eric.adsspecialist@shantahl.com.ph', 'Flores, Emergency Contact', '09173989182',
  'br-ceb', 'dp-mlm-sales', 'ps-ads-specialist-23',
  'freelance', '2018-06-18', null, null, null, null,
  'monthly', null, 10000, null, null,
  'active', null, array['employee']
);
insert into employees (
  id, employee_number, first_name, last_name, middle_name, nickname, gender, birthdate,
  civil_status, nationality, address, contact_number, email, emergency_contact_name, emergency_contact_phone,
  branch_id, department_id, position_id,
  employment_status, date_hired, date_regularized, contract_start, contract_end, probation_ends_at,
  payroll_type, daily_rate, monthly_salary, daily_allowance, monthly_allowance,
  status, status_changed_at, roles
) values (
  'emp-029', 'SDSI-0029', 'Jennifer', 'Gonzales', null, 'Jenn', 'Female', '1978-01-18',
  'Single', 'Filipino', '817 Mabini St., CBT', '09522888602', 'jennifer.gonzales@shantahl.com.ph', 'Ramos, Emergency Contact', '09592651901',
  'br-cbt', 'dp-mlm-sales', 'ps-sales-admin-24',
  'regular', '2017-06-17', '2017-12-17', null, null, null,
  'daily', 590, null, 22, null,
  'active', null, array['employee']
);
insert into employees (
  id, employee_number, first_name, last_name, middle_name, nickname, gender, birthdate,
  civil_status, nationality, address, contact_number, email, emergency_contact_name, emergency_contact_phone,
  branch_id, department_id, position_id,
  employment_status, date_hired, date_regularized, contract_start, contract_end, probation_ends_at,
  payroll_type, daily_rate, monthly_salary, daily_allowance, monthly_allowance,
  status, status_changed_at, roles
) values (
  'emp-030', 'SDSI-0030', 'Charm', 'Rivera', null, 'Char', 'Female', '1979-04-23',
  'Single', 'Filipino', '570 Mabini St., CBT', '09346510656', 'charm.rivera@shantahl.com.ph', 'Torres, Emergency Contact', '09587864915',
  'br-cbt', 'dp-mlm-sales', 'ps-sales-admin-24',
  'regular', '2016-06-16', '2016-12-16', null, null, null,
  'daily', 590, null, 22, null,
  'active', null, array['employee']
);
insert into employees (
  id, employee_number, first_name, last_name, middle_name, nickname, gender, birthdate,
  civil_status, nationality, address, contact_number, email, emergency_contact_name, emergency_contact_phone,
  branch_id, department_id, position_id,
  employment_status, date_hired, date_regularized, contract_start, contract_end, probation_ends_at,
  payroll_type, daily_rate, monthly_salary, daily_allowance, monthly_allowance,
  status, status_changed_at, roles
) values (
  'emp-031', 'SDSI-0031', 'Jai', 'Jai', null, 'Jai', 'Male', '1980-07-19',
  'Single', 'Filipino', '106 Mabini St., CEB', '09178517533', 'jai.jai@shantahl.com.ph', 'Torres, Emergency Contact', '09249762484',
  'br-ceb', 'dp-mlm-sales', 'ps-sales-admin-24',
  'regular', '2025-07-13', '2026-01-13', null, null, null,
  'daily', 540, null, 0, null,
  'active', null, array['employee']
);
insert into employees (
  id, employee_number, first_name, last_name, middle_name, nickname, gender, birthdate,
  civil_status, nationality, address, contact_number, email, emergency_contact_name, emergency_contact_phone,
  branch_id, department_id, position_id,
  employment_status, date_hired, date_regularized, contract_start, contract_end, probation_ends_at,
  payroll_type, daily_rate, monthly_salary, daily_allowance, monthly_allowance,
  status, status_changed_at, roles
) values (
  'emp-032', 'SDSI-0032', 'Suzanne', 'Sarona', null, 'Suza', 'Male', '1981-10-08',
  'Single', 'Filipino', '217 Mabini St., CEB', '09421037133', 'suzanne.sarona@shantahl.com.ph', 'Reyes, Emergency Contact', '09119699175',
  'br-ceb', 'dp-mlm-sales', 'ps-sales-admin-24',
  'regular', '2024-07-12', '2025-01-12', null, null, null,
  'daily', 540, null, 0, null,
  'active', null, array['employee']
);
insert into employees (
  id, employee_number, first_name, last_name, middle_name, nickname, gender, birthdate,
  civil_status, nationality, address, contact_number, email, emergency_contact_name, emergency_contact_phone,
  branch_id, department_id, position_id,
  employment_status, date_hired, date_regularized, contract_start, contract_end, probation_ends_at,
  payroll_type, daily_rate, monthly_salary, daily_allowance, monthly_allowance,
  status, status_changed_at, roles
) values (
  'emp-033', 'SDSI-0033', 'Marissa', 'Camposo', null, 'Mari', 'Female', '1982-01-13',
  'Single', 'Filipino', '279 Mabini St., CEB', '09686325573', 'marissa.camposo@shantahl.com.ph', 'Santos, Emergency Contact', '09518323723',
  'br-ceb', 'dp-mlm-sales', 'ps-sales-admin-24',
  'regular', '2023-07-12', '2024-01-12', null, null, null,
  'daily', 540, null, 0, null,
  'active', null, array['employee']
);
insert into employees (
  id, employee_number, first_name, last_name, middle_name, nickname, gender, birthdate,
  civil_status, nationality, address, contact_number, email, emergency_contact_name, emergency_contact_phone,
  branch_id, department_id, position_id,
  employment_status, date_hired, date_regularized, contract_start, contract_end, probation_ends_at,
  payroll_type, daily_rate, monthly_salary, daily_allowance, monthly_allowance,
  status, status_changed_at, roles
) values (
  'emp-034', 'SDSI-0034', 'Jerome', 'Canas', null, 'Jero', 'Female', '1983-04-18',
  'Married', 'Filipino', '790 Mabini St., CBT', '09405109318', 'jerome.canas@shantahl.com.ph', 'Garcia, Emergency Contact', '09347769338',
  'br-cbt', 'dp-cosmetics', 'ps-platform-specialist-25',
  'regular', '2022-07-11', '2023-01-11', null, null, null,
  'daily', 590, null, 22, null,
  'active', null, array['employee']
);
insert into employees (
  id, employee_number, first_name, last_name, middle_name, nickname, gender, birthdate,
  civil_status, nationality, address, contact_number, email, emergency_contact_name, emergency_contact_phone,
  branch_id, department_id, position_id,
  employment_status, date_hired, date_regularized, contract_start, contract_end, probation_ends_at,
  payroll_type, daily_rate, monthly_salary, daily_allowance, monthly_allowance,
  status, status_changed_at, roles
) values (
  'emp-035', 'SDSI-0035', 'Loribel', 'Garcia', null, 'Lori', 'Male', '1984-07-23',
  'Widowed', 'Filipino', '221 Mabini St., CBT', '09764742588', 'loribel.garcia@shantahl.com.ph', 'Mendoza, Emergency Contact', '09836137296',
  'br-cbt', 'dp-cosmetics', 'ps-multimedia-artist-head-26',
  'regular', '2021-07-10', '2022-01-10', null, null, null,
  'daily', 606, null, null, 4194,
  'active', null, array['employee']
);
insert into employees (
  id, employee_number, first_name, last_name, middle_name, nickname, gender, birthdate,
  civil_status, nationality, address, contact_number, email, emergency_contact_name, emergency_contact_phone,
  branch_id, department_id, position_id,
  employment_status, date_hired, date_regularized, contract_start, contract_end, probation_ends_at,
  payroll_type, daily_rate, monthly_salary, daily_allowance, monthly_allowance,
  status, status_changed_at, roles
) values (
  'emp-036', 'SDSI-0036', 'Arnie', 'Pangilinan', null, 'Arni', 'Male', '1985-10-03',
  'Widowed', 'Filipino', '736 Mabini St., CBT', '09311053927', 'arnie.pangilinan@shantahl.com.ph', 'Ramos, Emergency Contact', '09599946623',
  'br-cbt', 'dp-cosmetics', 'ps-video-editor-27',
  'regular', '2020-07-09', '2021-01-09', null, null, null,
  'daily', 590, null, null, 2611,
  'active', null, array['employee']
);
insert into employees (
  id, employee_number, first_name, last_name, middle_name, nickname, gender, birthdate,
  civil_status, nationality, address, contact_number, email, emergency_contact_name, emergency_contact_phone,
  branch_id, department_id, position_id,
  employment_status, date_hired, date_regularized, contract_start, contract_end, probation_ends_at,
  payroll_type, daily_rate, monthly_salary, daily_allowance, monthly_allowance,
  status, status_changed_at, roles
) values (
  'emp-037', 'SDSI-0037', 'Ronald', 'Lugtu', null, 'Rona', 'Female', '1986-01-08',
  'Single', 'Filipino', '170 Mabini St., CBT', '09155792455', 'ronald.lugtu@shantahl.com.ph', 'Castillo, Emergency Contact', '09337416176',
  'br-cbt', 'dp-darofy-marketing-corp', 'ps-multimedia-artist-head-mlm-28',
  'regular', '2019-07-09', '2020-01-09', null, null, null,
  'daily', 690.1, null, null, null,
  'active', null, array['employee']
);
insert into employees (
  id, employee_number, first_name, last_name, middle_name, nickname, gender, birthdate,
  civil_status, nationality, address, contact_number, email, emergency_contact_name, emergency_contact_phone,
  branch_id, department_id, position_id,
  employment_status, date_hired, date_regularized, contract_start, contract_end, probation_ends_at,
  payroll_type, daily_rate, monthly_salary, daily_allowance, monthly_allowance,
  status, status_changed_at, roles
) values (
  'emp-038', 'SDSI-0038', 'John Paul Michael', 'Papa', null, 'John', 'Male', '1987-04-13',
  'Married', 'Filipino', '687 Mabini St., CBT', '09373676433', 'johnpaulmichael.papa@shantahl.com.ph', 'Mendoza, Emergency Contact', '09610095354',
  'br-cbt', 'dp-mlm-mktg', 'ps-multimedia-artist-head-29',
  'regular', '2018-07-08', '2019-01-08', null, null, null,
  'monthly', null, 20000, null, 5000,
  'active', null, array['employee']
);
insert into employees (
  id, employee_number, first_name, last_name, middle_name, nickname, gender, birthdate,
  civil_status, nationality, address, contact_number, email, emergency_contact_name, emergency_contact_phone,
  branch_id, department_id, position_id,
  employment_status, date_hired, date_regularized, contract_start, contract_end, probation_ends_at,
  payroll_type, daily_rate, monthly_salary, daily_allowance, monthly_allowance,
  status, status_changed_at, roles
) values (
  'emp-039', 'SDSI-0039', 'Ara Juniella', 'Aling', null, 'Ara ', 'Female', '1988-07-18',
  'Married', 'Filipino', '368 Mabini St., MNL', '09258878968', 'arajuniella.aling@shantahl.com.ph', 'Bautista, Emergency Contact', '09566898997',
  'br-mnl', 'dp-indie-mktg', 'ps-marketing-assistant-30',
  'regular', '2017-07-07', '2018-01-07', null, null, null,
  'daily', 695, null, 22, null,
  'active', null, array['employee']
);
insert into employees (
  id, employee_number, first_name, last_name, middle_name, nickname, gender, birthdate,
  civil_status, nationality, address, contact_number, email, emergency_contact_name, emergency_contact_phone,
  branch_id, department_id, position_id,
  employment_status, date_hired, date_regularized, contract_start, contract_end, probation_ends_at,
  payroll_type, daily_rate, monthly_salary, daily_allowance, monthly_allowance,
  status, status_changed_at, roles
) values (
  'emp-040', 'SDSI-0040', 'Dra.', 'Cecil Catapang', null, 'Dra.', 'Female', '1989-10-23',
  'Widowed', 'Filipino', '155 Mabini St., MNL', '09645182813', 'dra..cecilcatapang@shantahl.com.ph', 'Flores, Emergency Contact', '09892212970',
  'br-mnl', 'dp-indie-mktg', 'ps-product-specialist-31',
  'freelance', '2016-07-06', null, null, null, null,
  'monthly', null, 30000, null, null,
  'active', null, array['employee']
);
insert into employees (
  id, employee_number, first_name, last_name, middle_name, nickname, gender, birthdate,
  civil_status, nationality, address, contact_number, email, emergency_contact_name, emergency_contact_phone,
  branch_id, department_id, position_id,
  employment_status, date_hired, date_regularized, contract_start, contract_end, probation_ends_at,
  payroll_type, daily_rate, monthly_salary, daily_allowance, monthly_allowance,
  status, status_changed_at, roles
) values (
  'emp-041', 'SDSI-0041', 'Shegive', 'Lee', null, 'Sheg', 'Female', '1990-01-03',
  'Single', 'Filipino', '256 Mabini St., MNL', '09613933666', 'shegive.lee@shantahl.com.ph', 'Torres, Emergency Contact', '09677316062',
  'br-mnl', 'dp-indie-mktg', 'ps-product-specialist-31',
  'freelance', '2025-07-03', null, null, null, null,
  'monthly', null, 25000, null, null,
  'active', null, array['employee']
);
insert into employees (
  id, employee_number, first_name, last_name, middle_name, nickname, gender, birthdate,
  civil_status, nationality, address, contact_number, email, emergency_contact_name, emergency_contact_phone,
  branch_id, department_id, position_id,
  employment_status, date_hired, date_regularized, contract_start, contract_end, probation_ends_at,
  payroll_type, daily_rate, monthly_salary, daily_allowance, monthly_allowance,
  status, status_changed_at, roles
) values (
  'emp-042', 'SDSI-0042', 'Reynalyn', 'Alfonso', null, 'Reyn', 'Female', '1991-04-08',
  'Widowed', 'Filipino', '714 Mabini St., CBT', '09332243271', 'reynalyn.alfonso@shantahl.com.ph', 'Garcia, Emergency Contact', '09655059314',
  'br-cbt', 'dp-operation', 'ps-cashier-32',
  'regular', '2024-07-02', '2025-01-02', null, null, null,
  'daily', 590, null, 22, null,
  'active', null, array['employee']
);
insert into employees (
  id, employee_number, first_name, last_name, middle_name, nickname, gender, birthdate,
  civil_status, nationality, address, contact_number, email, emergency_contact_name, emergency_contact_phone,
  branch_id, department_id, position_id,
  employment_status, date_hired, date_regularized, contract_start, contract_end, probation_ends_at,
  payroll_type, daily_rate, monthly_salary, daily_allowance, monthly_allowance,
  status, status_changed_at, roles
) values (
  'emp-043', 'SDSI-0043', 'Cherry Ann', 'Asuncion', null, 'Cher', 'Male', '1992-07-13',
  'Single', 'Filipino', '770 Mabini St., CBT', '09479548553', 'cherryann.asuncion@shantahl.com.ph', 'Flores, Emergency Contact', '09408301147',
  'br-cbt', 'dp-operation', 'ps-csr-33',
  'regular', '2023-07-02', '2024-01-02', null, null, null,
  'daily', 590, null, 22, null,
  'active', null, array['employee']
);
insert into employees (
  id, employee_number, first_name, last_name, middle_name, nickname, gender, birthdate,
  civil_status, nationality, address, contact_number, email, emergency_contact_name, emergency_contact_phone,
  branch_id, department_id, position_id,
  employment_status, date_hired, date_regularized, contract_start, contract_end, probation_ends_at,
  payroll_type, daily_rate, monthly_salary, daily_allowance, monthly_allowance,
  status, status_changed_at, roles
) values (
  'emp-044', 'SDSI-0044', 'Jomari', 'De Dios', null, 'Joma', 'Female', '1993-10-18',
  'Married', 'Filipino', '453 Mabini St., CBT', '09619536130', 'jomari.dedios@shantahl.com.ph', 'Reyes, Emergency Contact', '09442048398',
  'br-cbt', 'dp-operation', 'ps-warehouseman-34',
  'regular', '2022-07-01', '2023-01-01', null, null, null,
  'daily', 590, null, 22, null,
  'active', null, array['employee']
);
insert into employees (
  id, employee_number, first_name, last_name, middle_name, nickname, gender, birthdate,
  civil_status, nationality, address, contact_number, email, emergency_contact_name, emergency_contact_phone,
  branch_id, department_id, position_id,
  employment_status, date_hired, date_regularized, contract_start, contract_end, probation_ends_at,
  payroll_type, daily_rate, monthly_salary, daily_allowance, monthly_allowance,
  status, status_changed_at, roles
) values (
  'emp-045', 'SDSI-0045', 'Marlyn', 'Leonardo', null, 'Marl', 'Female', '1994-01-23',
  'Single', 'Filipino', '326 Mabini St., CBT', '09640841457', 'marlyn.leonardo@shantahl.com.ph', 'Flores, Emergency Contact', '09658435024',
  'br-cbt', 'dp-operation', 'ps-operations-manager-35',
  'regular', '2021-06-30', '2021-12-30', null, null, null,
  'monthly', null, 20000, null, 5000,
  'active', null, array['dept_head', 'employee']
);
insert into employees (
  id, employee_number, first_name, last_name, middle_name, nickname, gender, birthdate,
  civil_status, nationality, address, contact_number, email, emergency_contact_name, emergency_contact_phone,
  branch_id, department_id, position_id,
  employment_status, date_hired, date_regularized, contract_start, contract_end, probation_ends_at,
  payroll_type, daily_rate, monthly_salary, daily_allowance, monthly_allowance,
  status, status_changed_at, roles
) values (
  'emp-046', 'SDSI-0046', 'Ronnel', 'Longalong', null, 'Ronn', 'Female', '1995-04-03',
  'Widowed', 'Filipino', '856 Mabini St., CBT', '09698730557', 'ronnel.longalong@shantahl.com.ph', 'Ramos, Emergency Contact', '09349894925',
  'br-cbt', 'dp-operation', 'ps-driver-messenger-36',
  'regular', '2020-06-29', '2020-12-29', null, null, null,
  'daily', 590, null, 22, null,
  'on_leave', '2026-07-11', array['employee']
);
insert into employees (
  id, employee_number, first_name, last_name, middle_name, nickname, gender, birthdate,
  civil_status, nationality, address, contact_number, email, emergency_contact_name, emergency_contact_phone,
  branch_id, department_id, position_id,
  employment_status, date_hired, date_regularized, contract_start, contract_end, probation_ends_at,
  payroll_type, daily_rate, monthly_salary, daily_allowance, monthly_allowance,
  status, status_changed_at, roles
) values (
  'emp-047', 'SDSI-0047', 'Twinkle', 'Marayag', null, 'Twin', 'Female', '1996-07-08',
  'Single', 'Filipino', '810 Mabini St., CBT', '09327109754', 'twinkle.marayag@shantahl.com.ph', 'Torres, Emergency Contact', '09630285605',
  'br-cbt', 'dp-operation', 'ps-logistics-staff-37',
  'regular', '2019-06-29', '2019-12-29', null, null, null,
  'daily', 590, null, 22, null,
  'active', null, array['employee']
);
insert into employees (
  id, employee_number, first_name, last_name, middle_name, nickname, gender, birthdate,
  civil_status, nationality, address, contact_number, email, emergency_contact_name, emergency_contact_phone,
  branch_id, department_id, position_id,
  employment_status, date_hired, date_regularized, contract_start, contract_end, probation_ends_at,
  payroll_type, daily_rate, monthly_salary, daily_allowance, monthly_allowance,
  status, status_changed_at, roles
) values (
  'emp-048', 'SDSI-0048', 'Jaimie', 'Nucom', null, 'Jaim', 'Male', '1997-10-13',
  'Single', 'Filipino', '895 Mabini St., CBT', '09337570350', 'jaimie.nucom@shantahl.com.ph', 'Cruz, Emergency Contact', '09365641031',
  'br-cbt', 'dp-operation', 'ps-operations-supervisor-38',
  'regular', '2018-06-28', '2018-12-28', null, null, null,
  'daily', 691, null, 22, null,
  'active', null, array['employee']
);
insert into employees (
  id, employee_number, first_name, last_name, middle_name, nickname, gender, birthdate,
  civil_status, nationality, address, contact_number, email, emergency_contact_name, emergency_contact_phone,
  branch_id, department_id, position_id,
  employment_status, date_hired, date_regularized, contract_start, contract_end, probation_ends_at,
  payroll_type, daily_rate, monthly_salary, daily_allowance, monthly_allowance,
  status, status_changed_at, roles
) values (
  'emp-049', 'SDSI-0049', 'Felix Ardee', 'Santarina', null, 'Feli', 'Female', '1998-01-18',
  'Married', 'Filipino', '680 Mabini St., CBT', '09643830844', 'felixardee.santarina@shantahl.com.ph', 'Cruz, Emergency Contact', '09395592550',
  'br-cbt', 'dp-operation', 'ps-logistics-staff-37',
  'regular', '2017-06-27', '2017-12-27', null, null, null,
  'daily', 590, null, 22, null,
  'active', null, array['employee']
);
insert into employees (
  id, employee_number, first_name, last_name, middle_name, nickname, gender, birthdate,
  civil_status, nationality, address, contact_number, email, emergency_contact_name, emergency_contact_phone,
  branch_id, department_id, position_id,
  employment_status, date_hired, date_regularized, contract_start, contract_end, probation_ends_at,
  payroll_type, daily_rate, monthly_salary, daily_allowance, monthly_allowance,
  status, status_changed_at, roles
) values (
  'emp-050', 'SDSI-0050', 'Daiki', 'Yamakawa', null, 'Daik', 'Male', '1999-04-23',
  'Single', 'Filipino', '487 Mabini St., CBT', '09871326587', 'daiki.yamakawa@shantahl.com.ph', 'Cruz, Emergency Contact', '09204643870',
  'br-cbt', 'dp-operation', 'ps-utility-39',
  'regular', '2016-06-26', '2016-12-26', null, null, null,
  'daily', 590, null, 22, null,
  'active', null, array['employee']
);
insert into employees (
  id, employee_number, first_name, last_name, middle_name, nickname, gender, birthdate,
  civil_status, nationality, address, contact_number, email, emergency_contact_name, emergency_contact_phone,
  branch_id, department_id, position_id,
  employment_status, date_hired, date_regularized, contract_start, contract_end, probation_ends_at,
  payroll_type, daily_rate, monthly_salary, daily_allowance, monthly_allowance,
  status, status_changed_at, roles
) values (
  'emp-051', 'SDSI-0051', 'Aboguin', 'Ma. Abegail Fatima', null, 'Abog', 'Male', '1975-07-31',
  'Single', 'Filipino', '716 Mabini St., MNL', '09707497574', 'aboguin.ma.abegailfatima@shantahl.com.ph', 'Flores, Emergency Contact', '09851757640',
  'br-mnl', 'dp-operation', 'ps-branch-supervisor-40',
  'regular', '2025-06-23', '2025-12-23', null, null, null,
  'daily', 715, null, 22, null,
  'active', null, array['employee']
);
insert into employees (
  id, employee_number, first_name, last_name, middle_name, nickname, gender, birthdate,
  civil_status, nationality, address, contact_number, email, emergency_contact_name, emergency_contact_phone,
  branch_id, department_id, position_id,
  employment_status, date_hired, date_regularized, contract_start, contract_end, probation_ends_at,
  payroll_type, daily_rate, monthly_salary, daily_allowance, monthly_allowance,
  status, status_changed_at, roles
) values (
  'emp-052', 'SDSI-0052', 'Abegail', 'Bordaje', null, 'Abeg', 'Female', '1976-10-08',
  'Widowed', 'Filipino', '888 Mabini St., MNL', '09806010398', 'abegail.bordaje@shantahl.com.ph', 'Castillo, Emergency Contact', '09620431406',
  'br-mnl', 'dp-operation', 'ps-cashier-32',
  'regular', '2024-06-22', '2024-12-22', null, null, null,
  'daily', 695, null, 22, null,
  'active', null, array['employee']
);
insert into employees (
  id, employee_number, first_name, last_name, middle_name, nickname, gender, birthdate,
  civil_status, nationality, address, contact_number, email, emergency_contact_name, emergency_contact_phone,
  branch_id, department_id, position_id,
  employment_status, date_hired, date_regularized, contract_start, contract_end, probation_ends_at,
  payroll_type, daily_rate, monthly_salary, daily_allowance, monthly_allowance,
  status, status_changed_at, roles
) values (
  'emp-053', 'SDSI-0053', 'Dayanara', 'Flores', null, 'Daya', 'Male', '1977-01-13',
  'Single', 'Filipino', '846 Mabini St., MNL', '09737681564', 'dayanara.flores@shantahl.com.ph', 'Flores, Emergency Contact', '09710273978',
  'br-mnl', 'dp-operation', 'ps-cashier-32',
  'regular', '2023-06-22', '2023-12-22', null, null, null,
  'daily', 695, null, 22, null,
  'active', null, array['employee']
);
insert into employees (
  id, employee_number, first_name, last_name, middle_name, nickname, gender, birthdate,
  civil_status, nationality, address, contact_number, email, emergency_contact_name, emergency_contact_phone,
  branch_id, department_id, position_id,
  employment_status, date_hired, date_regularized, contract_start, contract_end, probation_ends_at,
  payroll_type, daily_rate, monthly_salary, daily_allowance, monthly_allowance,
  status, status_changed_at, roles
) values (
  'emp-054', 'SDSI-0054', 'Jemuel', 'Castillo', null, 'Jemu', 'Male', '1978-04-18',
  'Widowed', 'Filipino', '899 Mabini St., MNL', '09842755432', 'jemuel.castillo@shantahl.com.ph', 'Mendoza, Emergency Contact', '09487314626',
  'br-mnl', 'dp-operation', 'ps-warehouseman-34',
  'regular', '2022-06-21', '2022-12-21', null, null, null,
  'daily', 695, null, 47, null,
  'active', null, array['employee']
);
insert into employees (
  id, employee_number, first_name, last_name, middle_name, nickname, gender, birthdate,
  civil_status, nationality, address, contact_number, email, emergency_contact_name, emergency_contact_phone,
  branch_id, department_id, position_id,
  employment_status, date_hired, date_regularized, contract_start, contract_end, probation_ends_at,
  payroll_type, daily_rate, monthly_salary, daily_allowance, monthly_allowance,
  status, status_changed_at, roles
) values (
  'emp-055', 'SDSI-0055', 'Girlie Gail', 'Gallardo', null, 'Girl', 'Female', '1979-07-23',
  'Married', 'Filipino', '440 Mabini St., MNL', '09355178039', 'girliegail.gallardo@shantahl.com.ph', 'Garcia, Emergency Contact', '09365236199',
  'br-mnl', 'dp-operation', 'ps-branch-manager-41',
  'regular', '2021-06-20', '2021-12-20', null, null, null,
  'daily', 754, null, 22, null,
  'active', null, array['dept_head', 'employee']
);
insert into employees (
  id, employee_number, first_name, last_name, middle_name, nickname, gender, birthdate,
  civil_status, nationality, address, contact_number, email, emergency_contact_name, emergency_contact_phone,
  branch_id, department_id, position_id,
  employment_status, date_hired, date_regularized, contract_start, contract_end, probation_ends_at,
  payroll_type, daily_rate, monthly_salary, daily_allowance, monthly_allowance,
  status, status_changed_at, roles
) values (
  'emp-056', 'SDSI-0056', 'Clover', 'Riomalos', null, 'Clov', 'Male', '1980-10-03',
  'Widowed', 'Filipino', '491 Mabini St., MNL', '09820084918', 'clover.riomalos@shantahl.com.ph', 'Santos, Emergency Contact', '09684302189',
  'br-mnl', 'dp-operation', 'ps-cashier-32',
  'regular', '2020-06-19', '2020-12-19', null, null, null,
  'daily', 695, null, 22, null,
  'active', null, array['employee']
);
insert into employees (
  id, employee_number, first_name, last_name, middle_name, nickname, gender, birthdate,
  civil_status, nationality, address, contact_number, email, emergency_contact_name, emergency_contact_phone,
  branch_id, department_id, position_id,
  employment_status, date_hired, date_regularized, contract_start, contract_end, probation_ends_at,
  payroll_type, daily_rate, monthly_salary, daily_allowance, monthly_allowance,
  status, status_changed_at, roles
) values (
  'emp-057', 'SDSI-0057', 'Bersabal', 'Jober', null, 'Bers', 'Male', '1981-01-08',
  'Married', 'Filipino', '334 Mabini St., CEB', '09271003000', 'bersabal.jober@shantahl.com.ph', 'Mendoza, Emergency Contact', '09841398099',
  'br-ceb', 'dp-operation', 'ps-driver-warehouseman-42',
  'regular', '2019-06-19', '2019-12-19', null, null, null,
  'daily', 540, null, 22, null,
  'active', null, array['employee']
);
insert into employees (
  id, employee_number, first_name, last_name, middle_name, nickname, gender, birthdate,
  civil_status, nationality, address, contact_number, email, emergency_contact_name, emergency_contact_phone,
  branch_id, department_id, position_id,
  employment_status, date_hired, date_regularized, contract_start, contract_end, probation_ends_at,
  payroll_type, daily_rate, monthly_salary, daily_allowance, monthly_allowance,
  status, status_changed_at, roles
) values (
  'emp-058', 'SDSI-0058', 'Karlou James', 'Japitan', null, 'Karl', 'Male', '1982-04-13',
  'Single', 'Filipino', '511 Mabini St., MDU', '09310371303', 'karloujames.japitan@shantahl.com.ph', 'Garcia, Emergency Contact', '09688462772',
  'br-mdu', 'dp-operation', 'ps-branch-supervisor-40',
  'regular', '2018-06-18', '2018-12-18', null, null, null,
  'daily', 646, null, 22, null,
  'active', null, array['employee']
);
insert into employees (
  id, employee_number, first_name, last_name, middle_name, nickname, gender, birthdate,
  civil_status, nationality, address, contact_number, email, emergency_contact_name, emergency_contact_phone,
  branch_id, department_id, position_id,
  employment_status, date_hired, date_regularized, contract_start, contract_end, probation_ends_at,
  payroll_type, daily_rate, monthly_salary, daily_allowance, monthly_allowance,
  status, status_changed_at, roles
) values (
  'emp-059', 'SDSI-0059', 'Ricky', 'Malasa', null, 'Rick', 'Female', '1983-07-18',
  'Single', 'Filipino', '784 Mabini St., MDU', '09764522872', 'ricky.malasa@shantahl.com.ph', 'Santos, Emergency Contact', '09548025632',
  'br-mdu', 'dp-operation', 'ps-stockman-43',
  'regular', '2017-06-17', '2017-12-17', null, null, null,
  'daily', 540, null, 22, null,
  'active', null, array['employee']
);
insert into employees (
  id, employee_number, first_name, last_name, middle_name, nickname, gender, birthdate,
  civil_status, nationality, address, contact_number, email, emergency_contact_name, emergency_contact_phone,
  branch_id, department_id, position_id,
  employment_status, date_hired, date_regularized, contract_start, contract_end, probation_ends_at,
  payroll_type, daily_rate, monthly_salary, daily_allowance, monthly_allowance,
  status, status_changed_at, roles
) values (
  'emp-060', 'SDSI-0060', 'Mary Jane', 'Pedrano', null, 'Mary', 'Female', '1984-10-23',
  'Married', 'Filipino', '536 Mabini St., MDU', '09761596281', 'maryjane.pedrano@shantahl.com.ph', 'Torres, Emergency Contact', '09387210965',
  'br-mdu', 'dp-operation', 'ps-branch-manager-41',
  'regular', '2016-06-16', '2016-12-16', null, null, null,
  'daily', 670, null, 22, null,
  'active', null, array['dept_head', 'employee']
);
insert into employees (
  id, employee_number, first_name, last_name, middle_name, nickname, gender, birthdate,
  civil_status, nationality, address, contact_number, email, emergency_contact_name, emergency_contact_phone,
  branch_id, department_id, position_id,
  employment_status, date_hired, date_regularized, contract_start, contract_end, probation_ends_at,
  payroll_type, daily_rate, monthly_salary, daily_allowance, monthly_allowance,
  status, status_changed_at, roles
) values (
  'emp-061', 'SDSI-0061', 'Leonilyn', 'Talisic', null, 'Leon', 'Female', '1985-01-03',
  'Single', 'Filipino', '269 Mabini St., MDU', '09722825985', 'leonilyn.talisic@shantahl.com.ph', 'Santos, Emergency Contact', '09752102555',
  'br-mdu', 'dp-operation', 'ps-cashier-32',
  'regular', '2025-07-13', '2026-01-13', null, null, null,
  'daily', 629, null, 22, null,
  'resigned', '2026-06-25', array['employee']
);
insert into employees (
  id, employee_number, first_name, last_name, middle_name, nickname, gender, birthdate,
  civil_status, nationality, address, contact_number, email, emergency_contact_name, emergency_contact_phone,
  branch_id, department_id, position_id,
  employment_status, date_hired, date_regularized, contract_start, contract_end, probation_ends_at,
  payroll_type, daily_rate, monthly_salary, daily_allowance, monthly_allowance,
  status, status_changed_at, roles
) values (
  'emp-062', 'SDSI-0062', 'Gretchen', 'De Sosa', null, 'Gret', 'Male', '1986-04-08',
  'Widowed', 'Filipino', '806 Mabini St., CAV', '09878052626', 'gretchen.desosa@shantahl.com.ph', 'Bautista, Emergency Contact', '09878196373',
  'br-cav', 'dp-operation', 'ps-cashier-32',
  'regular', '2024-07-12', '2025-01-12', null, null, null,
  'daily', 600, null, 22, null,
  'active', null, array['employee']
);
insert into employees (
  id, employee_number, first_name, last_name, middle_name, nickname, gender, birthdate,
  civil_status, nationality, address, contact_number, email, emergency_contact_name, emergency_contact_phone,
  branch_id, department_id, position_id,
  employment_status, date_hired, date_regularized, contract_start, contract_end, probation_ends_at,
  payroll_type, daily_rate, monthly_salary, daily_allowance, monthly_allowance,
  status, status_changed_at, roles
) values (
  'emp-063', 'SDSI-0063', 'Rhea', 'Francisco', null, 'Rhea', 'Female', '1987-07-13',
  'Single', 'Filipino', '659 Mabini St., CAV', '09615246744', 'rhea.francisco@shantahl.com.ph', 'Reyes, Emergency Contact', '09490490010',
  'br-cav', 'dp-operation', 'ps-cashier-32',
  'regular', '2023-07-12', '2024-01-12', null, null, null,
  'daily', 600, null, 22, null,
  'active', null, array['employee']
);
insert into employees (
  id, employee_number, first_name, last_name, middle_name, nickname, gender, birthdate,
  civil_status, nationality, address, contact_number, email, emergency_contact_name, emergency_contact_phone,
  branch_id, department_id, position_id,
  employment_status, date_hired, date_regularized, contract_start, contract_end, probation_ends_at,
  payroll_type, daily_rate, monthly_salary, daily_allowance, monthly_allowance,
  status, status_changed_at, roles
) values (
  'emp-064', 'SDSI-0064', 'Jemima', 'Amestoso', null, 'Jemi', 'Male', '1988-10-18',
  'Single', 'Filipino', '733 Mabini St., CDO', '09836011136', 'jemima.amestoso@shantahl.com.ph', 'Ramos, Emergency Contact', '09889433095',
  'br-cdo', 'dp-operation', 'ps-cashier-32',
  'regular', '2022-07-11', '2023-01-11', null, null, null,
  'daily', 500, null, 22, null,
  'active', null, array['employee']
);
insert into employees (
  id, employee_number, first_name, last_name, middle_name, nickname, gender, birthdate,
  civil_status, nationality, address, contact_number, email, emergency_contact_name, emergency_contact_phone,
  branch_id, department_id, position_id,
  employment_status, date_hired, date_regularized, contract_start, contract_end, probation_ends_at,
  payroll_type, daily_rate, monthly_salary, daily_allowance, monthly_allowance,
  status, status_changed_at, roles
) values (
  'emp-065', 'SDSI-0065', 'Daniel', 'Bato', null, 'Dani', 'Female', '1989-01-23',
  'Widowed', 'Filipino', '267 Mabini St., PGS', '09581223383', 'daniel.bato@shantahl.com.ph', 'Bautista, Emergency Contact', '09133993434',
  'br-pgs', 'dp-operation', 'ps-cashier-32',
  'regular', '2021-07-10', '2022-01-10', null, null, null,
  'daily', 505, null, 22, null,
  'active', null, array['employee']
);
insert into employees (
  id, employee_number, first_name, last_name, middle_name, nickname, gender, birthdate,
  civil_status, nationality, address, contact_number, email, emergency_contact_name, emergency_contact_phone,
  branch_id, department_id, position_id,
  employment_status, date_hired, date_regularized, contract_start, contract_end, probation_ends_at,
  payroll_type, daily_rate, monthly_salary, daily_allowance, monthly_allowance,
  status, status_changed_at, roles
) values (
  'emp-066', 'SDSI-0066', 'Charles', 'Villaflor', null, 'Char', 'Male', '1990-04-03',
  'Single', 'Filipino', '746 Mabini St., DVO', '09765300255', 'charles.villaflor@shantahl.com.ph', 'Cruz, Emergency Contact', '09757668712',
  'br-dvo', 'dp-operation', 'ps-cashier-32',
  'regular', '2020-07-09', '2021-01-09', null, null, null,
  'daily', 510, null, 22, null,
  'active', null, array['employee']
);
insert into employees (
  id, employee_number, first_name, last_name, middle_name, nickname, gender, birthdate,
  civil_status, nationality, address, contact_number, email, emergency_contact_name, emergency_contact_phone,
  branch_id, department_id, position_id,
  employment_status, date_hired, date_regularized, contract_start, contract_end, probation_ends_at,
  payroll_type, daily_rate, monthly_salary, daily_allowance, monthly_allowance,
  status, status_changed_at, roles
) values (
  'emp-067', 'SDSI-0067', 'Jebeth', 'Guinto', null, 'Jebe', 'Male', '1991-07-08',
  'Widowed', 'Filipino', '335 Mabini St., LCN', '09678580673', 'jebeth.guinto@shantahl.com.ph', 'Castillo, Emergency Contact', '09110380464',
  'br-lcn', 'dp-operation', 'ps-cashier-32',
  'regular', '2019-07-09', '2020-01-09', null, null, null,
  'daily', 600, null, 22, null,
  'active', null, array['employee']
);
insert into employees (
  id, employee_number, first_name, last_name, middle_name, nickname, gender, birthdate,
  civil_status, nationality, address, contact_number, email, emergency_contact_name, emergency_contact_phone,
  branch_id, department_id, position_id,
  employment_status, date_hired, date_regularized, contract_start, contract_end, probation_ends_at,
  payroll_type, daily_rate, monthly_salary, daily_allowance, monthly_allowance,
  status, status_changed_at, roles
) values (
  'emp-068', 'SDSI-0068', 'Catherine', 'Mogato', null, 'Cath', 'Male', '1992-10-13',
  'Single', 'Filipino', '609 Mabini St., BCD', '09763921498', 'catherine.mogato@shantahl.com.ph', 'Ramos, Emergency Contact', '09317860781',
  'br-bcd', 'dp-operation', 'ps-cashier-32',
  'regular', '2018-07-08', '2019-01-08', null, null, null,
  'daily', 480, null, 22, null,
  'active', null, array['employee']
);

-- Second pass: supervisor_id / job_performance_evaluator_id (self-referencing FKs)
update employees set supervisor_id = 'emp-005', job_performance_evaluator_id = null where id = 'emp-006';
update employees set supervisor_id = 'emp-005', job_performance_evaluator_id = null where id = 'emp-007';
update employees set supervisor_id = 'emp-005', job_performance_evaluator_id = null where id = 'emp-008';
update employees set supervisor_id = 'emp-005', job_performance_evaluator_id = null where id = 'emp-009';
update employees set supervisor_id = 'emp-011', job_performance_evaluator_id = null where id = 'emp-010';
update employees set supervisor_id = 'emp-004', job_performance_evaluator_id = null where id = 'emp-011';
update employees set supervisor_id = 'emp-004', job_performance_evaluator_id = null where id = 'emp-012';
update employees set supervisor_id = 'emp-003', job_performance_evaluator_id = null where id = 'emp-015';
update employees set supervisor_id = 'emp-003', job_performance_evaluator_id = null where id = 'emp-017';
update employees set supervisor_id = 'emp-017', job_performance_evaluator_id = null where id = 'emp-018';
update employees set supervisor_id = 'emp-017', job_performance_evaluator_id = null where id = 'emp-019';
update employees set supervisor_id = 'emp-037', job_performance_evaluator_id = null where id = 'emp-023';
update employees set supervisor_id = 'emp-012', job_performance_evaluator_id = null where id = 'emp-029';
update employees set supervisor_id = 'emp-012', job_performance_evaluator_id = null where id = 'emp-030';
update employees set supervisor_id = 'emp-012', job_performance_evaluator_id = null where id = 'emp-031';
update employees set supervisor_id = 'emp-012', job_performance_evaluator_id = null where id = 'emp-032';
update employees set supervisor_id = 'emp-012', job_performance_evaluator_id = null where id = 'emp-033';
update employees set supervisor_id = 'emp-002', job_performance_evaluator_id = null where id = 'emp-034';
update employees set supervisor_id = 'emp-002', job_performance_evaluator_id = null where id = 'emp-035';
update employees set supervisor_id = 'emp-002', job_performance_evaluator_id = null where id = 'emp-036';
update employees set supervisor_id = 'emp-012', job_performance_evaluator_id = null where id = 'emp-039';
update employees set supervisor_id = 'emp-045', job_performance_evaluator_id = null where id = 'emp-042';
update employees set supervisor_id = 'emp-045', job_performance_evaluator_id = null where id = 'emp-043';
update employees set supervisor_id = 'emp-045', job_performance_evaluator_id = null where id = 'emp-044';
update employees set supervisor_id = 'emp-045', job_performance_evaluator_id = null where id = 'emp-046';
update employees set supervisor_id = 'emp-045', job_performance_evaluator_id = null where id = 'emp-047';
update employees set supervisor_id = 'emp-045', job_performance_evaluator_id = null where id = 'emp-048';
update employees set supervisor_id = 'emp-045', job_performance_evaluator_id = null where id = 'emp-049';
update employees set supervisor_id = 'emp-045', job_performance_evaluator_id = null where id = 'emp-050';
update employees set supervisor_id = 'emp-045', job_performance_evaluator_id = null where id = 'emp-051';
update employees set supervisor_id = 'emp-045', job_performance_evaluator_id = null where id = 'emp-052';
update employees set supervisor_id = 'emp-045', job_performance_evaluator_id = null where id = 'emp-053';
update employees set supervisor_id = 'emp-045', job_performance_evaluator_id = null where id = 'emp-054';
update employees set supervisor_id = 'emp-045', job_performance_evaluator_id = null where id = 'emp-055';
update employees set supervisor_id = 'emp-045', job_performance_evaluator_id = null where id = 'emp-056';
update employees set supervisor_id = 'emp-045', job_performance_evaluator_id = null where id = 'emp-057';
update employees set supervisor_id = 'emp-045', job_performance_evaluator_id = null where id = 'emp-058';
update employees set supervisor_id = 'emp-045', job_performance_evaluator_id = null where id = 'emp-059';
update employees set supervisor_id = 'emp-045', job_performance_evaluator_id = null where id = 'emp-060';
update employees set supervisor_id = 'emp-045', job_performance_evaluator_id = null where id = 'emp-061';
update employees set supervisor_id = 'emp-045', job_performance_evaluator_id = null where id = 'emp-062';
update employees set supervisor_id = 'emp-045', job_performance_evaluator_id = null where id = 'emp-063';
update employees set supervisor_id = 'emp-045', job_performance_evaluator_id = null where id = 'emp-064';
update employees set supervisor_id = 'emp-045', job_performance_evaluator_id = null where id = 'emp-065';
update employees set supervisor_id = 'emp-045', job_performance_evaluator_id = null where id = 'emp-066';
update employees set supervisor_id = 'emp-045', job_performance_evaluator_id = null where id = 'emp-067';
update employees set supervisor_id = 'emp-045', job_performance_evaluator_id = null where id = 'emp-068';

-- Attach any employee whose email matches an already-created Auth user, so
-- existing logins (Authentication > Users) resolve to their employee row.
update employees e set user_id = u.id from auth.users u where lower(u.email) = lower(e.email) and e.user_id is null;

