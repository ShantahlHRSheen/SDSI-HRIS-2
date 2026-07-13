import type {
  Announcement,
  AuditLog,
  Branch,
  Department,
  DemoUser,
  DisciplinaryRecord,
  Employee,
  Holiday,
  LeaveType,
  PayrollPeriod,
  PerformanceEvaluation,
  Position,
  Role,
  WorkSchedule,
} from "./types";

// Fixed "today" so the demo's relative dates (contracts expiring, birthdays,
// regularization due) stay meaningful without depending on wall-clock time.
export const TODAY = "2026-07-13";

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function addMonths(dateStr: string, months: number): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  const a = new Date(from + "T00:00:00Z").getTime();
  const b = new Date(to + "T00:00:00Z").getTime();
  return Math.round((b - a) / 86400000);
}

// deterministic pseudo-random for cosmetic jitter (salary, scores) only
function mulberry32(seed: number) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(20260713);

export const BRANCHES: Branch[] = [
  { id: "br-mnl", name: "Manila (Head Office)", code: "MNL", address: "Shantahl Bldg, Ortigas Ave, Pasig City" },
  { id: "br-qc", name: "Quezon City", code: "QC", address: "Commonwealth Ave, Quezon City" },
  { id: "br-ceb", name: "Cebu", code: "CEB", address: "IT Park, Cebu City" },
  { id: "br-dvo", name: "Davao", code: "DVO", address: "J.P. Laurel Ave, Davao City" },
  { id: "br-ilo", name: "Iloilo", code: "ILO", address: "Diversion Rd, Iloilo City" },
  { id: "br-bcd", name: "Bacolod", code: "BCD", address: "Lacson St, Bacolod City" },
  { id: "br-cdo", name: "Cagayan de Oro", code: "CDO", address: "Corrales Ave, Cagayan de Oro" },
  { id: "br-bag", name: "Baguio", code: "BAG", address: "Session Rd, Baguio City" },
  { id: "br-btg", name: "Batangas", code: "BTG", address: "P. Burgos St, Batangas City" },
  { id: "br-ges", name: "General Santos", code: "GES", address: "Pioneer Ave, General Santos City" },
];

export const DEPARTMENTS: Department[] = [
  { id: "dp-exec", name: "Executive" },
  { id: "dp-hr", name: "Human Resources" },
  { id: "dp-fin", name: "Finance & Accounting" },
  { id: "dp-sales", name: "Sales" },
  { id: "dp-mktg", name: "Marketing" },
  { id: "dp-ops", name: "Operations" },
  { id: "dp-wh", name: "Warehouse & Logistics" },
  { id: "dp-cs", name: "Customer Service" },
  { id: "dp-it", name: "Information Technology" },
  { id: "dp-admin", name: "Administrative" },
];

export const POSITIONS: Position[] = [
  { id: "ps-president", title: "President", departmentId: "dp-exec" },
  { id: "ps-vp-ops", title: "VP for Operations", departmentId: "dp-exec" },
  { id: "ps-hr-admin", title: "HR Administrator", departmentId: "dp-hr" },
  { id: "ps-hr-officer", title: "HR Officer", departmentId: "dp-hr" },
  { id: "ps-hr-assistant", title: "HR Assistant", departmentId: "dp-hr" },
  { id: "ps-payroll-officer", title: "Payroll Officer", departmentId: "dp-fin" },
  { id: "ps-sr-acctg", title: "Sr. Accounting Assistant", departmentId: "dp-fin" },
  { id: "ps-treasurer", title: "Corporate Treasurer", departmentId: "dp-fin" },
  { id: "ps-cfo", title: "Chief Finance Officer", departmentId: "dp-fin" },
  { id: "ps-acctg-staff", title: "Accounting Staff", departmentId: "dp-fin" },
  { id: "ps-mktg-officer", title: "Marketing Officer", departmentId: "dp-mktg" },
  { id: "ps-mktg-assistant", title: "Marketing Assistant", departmentId: "dp-mktg" },
  { id: "ps-sysadmin", title: "System Administrator", departmentId: "dp-it" },
  { id: "ps-it-support", title: "IT Support Staff", departmentId: "dp-it" },
  { id: "ps-sales-mgr", title: "Branch Sales Manager", departmentId: "dp-sales" },
  { id: "ps-sales-assoc", title: "Sales Associate", departmentId: "dp-sales" },
  { id: "ps-sales-consultant", title: "Sales Consultant", departmentId: "dp-sales" },
  { id: "ps-ops-mgr", title: "Branch Operations Manager", departmentId: "dp-ops" },
  { id: "ps-ops-staff", title: "Operations Staff", departmentId: "dp-ops" },
  { id: "ps-wh-sup", title: "Warehouse Supervisor", departmentId: "dp-wh" },
  { id: "ps-csr", title: "Customer Service Representative", departmentId: "dp-cs" },
  { id: "ps-admin-staff", title: "Admin Staff", departmentId: "dp-admin" },
];

export const WORK_SCHEDULES: WorkSchedule[] = [
  { id: "ws-day", name: "Day Shift", timeIn: "08:00", timeOut: "17:00", days: "Mon–Fri", graceMinutes: 10 },
  { id: "ws-early", name: "Early Shift", timeIn: "06:00", timeOut: "15:00", days: "Mon–Sat", graceMinutes: 10 },
  { id: "ws-mid", name: "Mid Shift", timeIn: "10:00", timeOut: "19:00", days: "Mon–Sat", graceMinutes: 10 },
  { id: "ws-night", name: "Night Shift", timeIn: "22:00", timeOut: "07:00", days: "Mon–Sat", graceMinutes: 15 },
  { id: "ws-flexi", name: "Flexi", timeIn: "09:00", timeOut: "18:00", days: "Mon–Fri", graceMinutes: 15 },
];

export const HOLIDAYS: Holiday[] = [
  { id: "hd-1", name: "New Year's Day", date: "2026-01-01", type: "regular", verified: true },
  { id: "hd-2", name: "Araw ng Kagitingan", date: "2026-04-09", type: "regular", verified: true },
  { id: "hd-3", name: "Maundy Thursday", date: "2026-04-02", type: "regular", verified: false },
  { id: "hd-4", name: "Good Friday", date: "2026-04-03", type: "regular", verified: false },
  { id: "hd-5", name: "Labor Day", date: "2026-05-01", type: "regular", verified: true },
  { id: "hd-6", name: "Independence Day", date: "2026-06-12", type: "regular", verified: true },
  { id: "hd-7", name: "Ninoy Aquino Day", date: "2026-08-21", type: "special_non_working", verified: true },
  { id: "hd-8", name: "National Heroes Day", date: "2026-08-31", type: "regular", verified: false },
  { id: "hd-9", name: "All Saints' Day (observed)", date: "2026-11-01", type: "special_non_working", verified: false },
  { id: "hd-10", name: "Bonifacio Day", date: "2026-11-30", type: "regular", verified: true },
  { id: "hd-11", name: "Christmas Day", date: "2026-12-25", type: "regular", verified: true },
  { id: "hd-12", name: "Rizal Day", date: "2026-12-30", type: "regular", verified: true },
  { id: "hd-13", name: "Last Day of the Year", date: "2026-12-31", type: "special_non_working", verified: false },
];

export const LEAVE_TYPES: LeaveType[] = [
  { id: "lt-vl", name: "Vacation Leave", defaultCredits: 15, requiresCert: false },
  { id: "lt-sl", name: "Sick Leave", defaultCredits: 15, requiresCert: true },
  { id: "lt-el", name: "Emergency Leave", defaultCredits: 3, requiresCert: false },
  { id: "lt-spl", name: "Solo Parent Leave", defaultCredits: 7, requiresCert: false },
  { id: "lt-ml", name: "Maternity Leave", defaultCredits: 105, requiresCert: true },
  { id: "lt-pl", name: "Paternity Leave", defaultCredits: 7, requiresCert: false },
  { id: "lt-bl", name: "Bereavement Leave", defaultCredits: 3, requiresCert: false },
  { id: "lt-lwop", name: "Leave Without Pay", defaultCredits: 0, requiresCert: false },
];

export const PAYROLL_PERIODS: PayrollPeriod[] = [
  { id: "pp-1", start: "2026-05-01", end: "2026-05-15", status: "closed" },
  { id: "pp-2", start: "2026-05-16", end: "2026-05-31", status: "closed" },
  { id: "pp-3", start: "2026-06-01", end: "2026-06-15", status: "closed" },
  { id: "pp-4", start: "2026-06-16", end: "2026-06-30", status: "closed" },
  { id: "pp-5", start: "2026-07-01", end: "2026-07-15", status: "locked" },
  { id: "pp-6", start: "2026-07-16", end: "2026-07-31", status: "open" },
];

const FIRST_NAMES = [
  "Maria", "Juan", "Jose", "Ana", "Carlos", "Elena", "Miguel", "Isabel", "Ramon", "Patricia",
  "Roberto", "Rosario", "Antonio", "Teresa", "Francisco", "Corazon", "Eduardo", "Luz", "Ricardo", "Carmen",
  "Alfredo", "Gloria", "Fernando", "Victoria", "Manuel", "Cecilia", "Rodrigo", "Angelica", "Danilo", "Marites",
  "Renato", "Josefina", "Arnel", "Divina", "Bayani", "Leonora", "Reynaldo", "Perla", "Armando", "Rowena",
  "Nestor", "Fe", "Rodel", "Grace", "Wilfredo", "Emilia", "Dennis", "Rosemarie", "Randy", "Jocelyn",
];
const LAST_NAMES = [
  "Santos", "Reyes", "Cruz", "Bautista", "Garcia", "Torres", "Flores", "Ramos", "Mendoza", "Castillo",
  "Villanueva", "Aquino", "Del Rosario", "Gonzales", "Rivera", "Domingo", "Pascual", "Fernandez", "De Guzman", "Aguilar",
  "Salazar", "Navarro", "Marasigan", "Uy", "Tan", "Lim", "Yap", "Ocampo", "Manalo", "Sarmiento",
];

let empSeq = 0;
function nextEmployeeNumber(): string {
  empSeq += 1;
  return `SDSI-${String(empSeq).padStart(4, "0")}`;
}

interface BuildEmployeeArgs {
  id: string;
  firstName: string;
  lastName: string;
  branchId: string;
  departmentId: string;
  positionId: string;
  supervisorId: string | null;
  employmentStatus: Employee["employmentStatus"];
  dateHired: string;
  dateRegularized?: string | null;
  contractStart?: string | null;
  contractEnd?: string | null;
  probationEndsAt?: string | null;
  payrollType: "daily" | "monthly";
  dailyRate?: number | null;
  monthlySalary?: number | null;
  status?: Employee["status"];
  statusChangedAt?: string | null;
  roles: Role[];
  birthMonth: number;
  birthDay: number;
  birthYear: number;
}

function buildEmployee(a: BuildEmployeeArgs): Employee {
  const mm = String(a.birthMonth).padStart(2, "0");
  const dd = String(a.birthDay).padStart(2, "0");
  return {
    id: a.id,
    employeeNumber: nextEmployeeNumber(),
    firstName: a.firstName,
    lastName: a.lastName,
    nickname: a.firstName.slice(0, 4),
    gender: rng() > 0.5 ? "Male" : "Female",
    birthdate: `${a.birthYear}-${mm}-${dd}`,
    civilStatus: (["Single", "Married", "Single", "Widowed"] as const)[Math.floor(rng() * 4)],
    nationality: "Filipino",
    address: `${100 + Math.floor(rng() * 800)} Mabini St., ${a.branchId.replace("br-", "").toUpperCase()}`,
    contactNumber: `09${String(100000000 + Math.floor(rng() * 800000000)).slice(0, 9)}`,
    email: `${a.firstName.toLowerCase()}.${a.lastName.toLowerCase().replace(/\s+/g, "")}@shantahl.com.ph`,
    emergencyContactName: `${LAST_NAMES[Math.floor(rng() * LAST_NAMES.length)]}, Emergency Contact`,
    emergencyContactPhone: `09${String(100000000 + Math.floor(rng() * 800000000)).slice(0, 9)}`,
    branchId: a.branchId,
    departmentId: a.departmentId,
    positionId: a.positionId,
    supervisorId: a.supervisorId,
    employmentStatus: a.employmentStatus,
    dateHired: a.dateHired,
    dateRegularized: a.dateRegularized ?? null,
    contractStart: a.contractStart ?? null,
    contractEnd: a.contractEnd ?? null,
    probationEndsAt: a.probationEndsAt ?? null,
    payrollType: a.payrollType,
    dailyRate: a.dailyRate ?? null,
    monthlySalary: a.monthlySalary ?? null,
    status: a.status ?? "active",
    statusChangedAt: a.statusChangedAt ?? null,
    roles: a.roles,
  };
}

export const EMPLOYEES: Employee[] = [];

// --- Corporate / Head Office staff -----------------------------------------
const president = buildEmployee({
  id: "emp-001", firstName: "Fernando", lastName: "Reyes", branchId: "br-mnl", departmentId: "dp-exec",
  positionId: "ps-president", supervisorId: null, employmentStatus: "regular", dateHired: "2008-02-01",
  dateRegularized: "2008-08-01", payrollType: "monthly", monthlySalary: 250000, roles: ["upper_management"],
  birthMonth: 3, birthDay: 12, birthYear: 1968,
});
const vpOps = buildEmployee({
  id: "emp-002", firstName: "Isabel", lastName: "Garcia", branchId: "br-mnl", departmentId: "dp-exec",
  positionId: "ps-vp-ops", supervisorId: president.id, employmentStatus: "regular", dateHired: "2011-05-16",
  dateRegularized: "2011-11-16", payrollType: "monthly", monthlySalary: 180000, roles: ["upper_management"],
  birthMonth: 7, birthDay: 20, birthYear: 1975,
});
const hrAdmin = buildEmployee({
  id: "emp-003", firstName: "Maria", lastName: "Santos", branchId: "br-mnl", departmentId: "dp-hr",
  positionId: "ps-hr-admin", supervisorId: vpOps.id, employmentStatus: "regular", dateHired: "2014-01-20",
  dateRegularized: "2014-07-20", payrollType: "monthly", monthlySalary: 75000, roles: ["hr_admin"],
  birthMonth: 7, birthDay: 28, birthYear: 1982,
});
const hrOfficer = buildEmployee({
  id: "emp-004", firstName: "Rosario", lastName: "Domingo", branchId: "br-mnl", departmentId: "dp-hr",
  positionId: "ps-hr-officer", supervisorId: hrAdmin.id, employmentStatus: "regular", dateHired: "2019-03-04",
  dateRegularized: "2019-09-04", payrollType: "monthly", monthlySalary: 38000, roles: ["employee"],
  birthMonth: 2, birthDay: 9, birthYear: 1990,
});
const hrAssistant = buildEmployee({
  id: "emp-005", firstName: "Divina", lastName: "Pascual", branchId: "br-mnl", departmentId: "dp-hr",
  positionId: "ps-hr-assistant", supervisorId: hrAdmin.id, employmentStatus: "probationary", dateHired: "2026-03-02",
  probationEndsAt: addMonths("2026-03-02", 6), payrollType: "monthly", monthlySalary: 26000, roles: ["employee"],
  birthMonth: 9, birthDay: 15, birthYear: 1996,
});
const payrollOfficer = buildEmployee({
  id: "emp-006", firstName: "Juan", lastName: "Dela Cruz", branchId: "br-mnl", departmentId: "dp-fin",
  positionId: "ps-payroll-officer", supervisorId: vpOps.id, employmentStatus: "regular", dateHired: "2015-06-10",
  dateRegularized: "2015-12-10", payrollType: "monthly", monthlySalary: 55000, roles: ["payroll_officer"],
  birthMonth: 11, birthDay: 3, birthYear: 1986,
});
const srAcctg = buildEmployee({
  id: "emp-007", firstName: "Ana", lastName: "Reyes", branchId: "br-mnl", departmentId: "dp-fin",
  positionId: "ps-sr-acctg", supervisorId: payrollOfficer.id, employmentStatus: "regular", dateHired: "2016-08-22",
  dateRegularized: "2017-02-22", payrollType: "monthly", monthlySalary: 42000, roles: ["sr_accounting_assistant"],
  birthMonth: 5, birthDay: 30, birthYear: 1988,
});
const treasurer = buildEmployee({
  id: "emp-008", firstName: "Roberto", lastName: "Lim", branchId: "br-mnl", departmentId: "dp-fin",
  positionId: "ps-treasurer", supervisorId: president.id, employmentStatus: "regular", dateHired: "2010-04-05",
  dateRegularized: "2010-10-05", payrollType: "monthly", monthlySalary: 120000, roles: ["treasurer"],
  birthMonth: 12, birthDay: 18, birthYear: 1972,
});
const cfo = buildEmployee({
  id: "emp-009", firstName: "Elena", lastName: "Cruz", branchId: "br-mnl", departmentId: "dp-fin",
  positionId: "ps-cfo", supervisorId: president.id, employmentStatus: "regular", dateHired: "2009-09-14",
  dateRegularized: "2010-03-14", payrollType: "monthly", monthlySalary: 200000, roles: ["cfo"],
  birthMonth: 7, birthDay: 5, birthYear: 1970,
});
const acctgStaff = buildEmployee({
  id: "emp-010", firstName: "Cecilia", lastName: "Ocampo", branchId: "br-mnl", departmentId: "dp-fin",
  positionId: "ps-acctg-staff", supervisorId: srAcctg.id, employmentStatus: "regular", dateHired: "2020-01-13",
  dateRegularized: "2020-07-13", payrollType: "monthly", monthlySalary: 28000, roles: ["employee"],
  birthMonth: 4, birthDay: 22, birthYear: 1993,
});
const mktgOfficer = buildEmployee({
  id: "emp-011", firstName: "Danilo", lastName: "Aquino", branchId: "br-mnl", departmentId: "dp-mktg",
  positionId: "ps-mktg-officer", supervisorId: vpOps.id, employmentStatus: "regular", dateHired: "2017-10-02",
  dateRegularized: "2018-04-02", payrollType: "monthly", monthlySalary: 40000, roles: ["employee"],
  birthMonth: 1, birthDay: 27, birthYear: 1991,
});
const mktgAssistant = buildEmployee({
  id: "emp-012", firstName: "Marites", lastName: "Villanueva", branchId: "br-mnl", departmentId: "dp-mktg",
  positionId: "ps-mktg-assistant", supervisorId: mktgOfficer.id, employmentStatus: "project_based",
  dateHired: "2026-02-16", contractStart: "2026-02-16", contractEnd: "2026-08-15",
  payrollType: "monthly", monthlySalary: 24000, roles: ["employee"],
  birthMonth: 8, birthDay: 8, birthYear: 1997,
});
const sysAdmin = buildEmployee({
  id: "emp-013", firstName: "Patricia", lastName: "Uy", branchId: "br-mnl", departmentId: "dp-it",
  positionId: "ps-sysadmin", supervisorId: vpOps.id, employmentStatus: "regular", dateHired: "2013-11-18",
  dateRegularized: "2014-05-18", payrollType: "monthly", monthlySalary: 65000, roles: ["sys_admin"],
  birthMonth: 6, birthDay: 25, birthYear: 1984,
});
const itSupport = buildEmployee({
  id: "emp-014", firstName: "Renato", lastName: "Navarro", branchId: "br-mnl", departmentId: "dp-it",
  positionId: "ps-it-support", supervisorId: sysAdmin.id, employmentStatus: "regular", dateHired: "2021-05-03",
  dateRegularized: "2021-11-03", payrollType: "monthly", monthlySalary: 26000, roles: ["employee"],
  birthMonth: 7, birthDay: 2, birthYear: 1995,
});

EMPLOYEES.push(
  president, vpOps, hrAdmin, hrOfficer, hrAssistant, payrollOfficer, srAcctg,
  treasurer, cfo, acctgStaff, mktgOfficer, mktgAssistant, sysAdmin, itSupport,
);

// --- Branch staff ------------------------------------------------------
interface BranchSlotTemplate {
  slot: string;
  position: string;
  departmentId: string;
  reportsTo: "vp" | "salesManager" | "opsManager";
  employmentStatus: Employee["employmentStatus"];
  roles: Role[];
  payrollType: "daily" | "monthly";
}

const BRANCH_TEMPLATE: BranchSlotTemplate[] = [
  { slot: "salesManager", position: "ps-sales-mgr", departmentId: "dp-sales", reportsTo: "vp", employmentStatus: "regular", roles: ["dept_head", "employee"], payrollType: "monthly" },
  { slot: "opsManager", position: "ps-ops-mgr", departmentId: "dp-ops", reportsTo: "vp", employmentStatus: "regular", roles: ["dept_head", "employee"], payrollType: "monthly" },
  { slot: "sales1", position: "ps-sales-assoc", departmentId: "dp-sales", reportsTo: "salesManager", employmentStatus: "regular", roles: ["employee"], payrollType: "daily" },
  { slot: "sales2", position: "ps-sales-assoc", departmentId: "dp-sales", reportsTo: "salesManager", employmentStatus: "probationary", roles: ["employee"], payrollType: "daily" },
  { slot: "consultant", position: "ps-sales-consultant", departmentId: "dp-sales", reportsTo: "salesManager", employmentStatus: "freelance", roles: ["freelancer"], payrollType: "daily" },
  { slot: "opsStaff", position: "ps-ops-staff", departmentId: "dp-ops", reportsTo: "opsManager", employmentStatus: "regular", roles: ["employee"], payrollType: "daily" },
  { slot: "warehouseSup", position: "ps-wh-sup", departmentId: "dp-wh", reportsTo: "opsManager", employmentStatus: "regular", roles: ["dept_head", "employee"], payrollType: "monthly" },
  { slot: "csr", position: "ps-csr", departmentId: "dp-cs", reportsTo: "opsManager", employmentStatus: "project_based", roles: ["employee"], payrollType: "daily" },
  { slot: "adminStaff", position: "ps-admin-staff", departmentId: "dp-admin", reportsTo: "opsManager", employmentStatus: "regular", roles: ["employee"], payrollType: "daily" },
];

export const DEPT_HEAD_IDS: Record<string, { salesManager: string; opsManager: string }> = {};
export const FREELANCER_IDS: string[] = [];
export const RANK_AND_FILE_SAMPLE_ID_BY_BRANCH: Record<string, string> = {};

BRANCHES.forEach((branch, branchIdx) => {
  const slotIds: Record<string, string> = {};
  BRANCH_TEMPLATE.forEach((tpl, slotIdx) => {
    const nameIdx = (branchIdx * BRANCH_TEMPLATE.length + slotIdx) % FIRST_NAMES.length;
    const lastIdx = (branchIdx * 7 + slotIdx * 3) % LAST_NAMES.length;
    const id = `emp-${branch.code.toLowerCase()}-${tpl.slot}`;
    let supervisorId: string | null;
    if (tpl.reportsTo === "vp") supervisorId = vpOps.id;
    else supervisorId = slotIds[tpl.reportsTo];

    const hireYearsAgo = 1 + ((branchIdx + slotIdx) % 8);
    let dateHired = addDays(TODAY, -365 * hireYearsAgo - slotIdx * 11);
    let dateRegularized: string | null = addMonths(dateHired, 6);
    let contractStart: string | null = null;
    let contractEnd: string | null = null;
    let probationEndsAt: string | null = null;
    let statusChangedAt: string | null = null;
    let status: Employee["status"] = "active";

    if (tpl.employmentStatus === "probationary") {
      // spread probation end dates around TODAY: some overdue, some due this
      // week, some next month, most further out — for contract-monitoring demo
      const spread = [-10, 3, 15, 40, 75][(branchIdx + slotIdx) % 5];
      dateHired = addDays(addDays(TODAY, spread), -180);
      dateRegularized = null;
      probationEndsAt = addDays(TODAY, spread);
    } else if (tpl.employmentStatus === "freelance" || tpl.employmentStatus === "project_based") {
      const spread = [-5, 8, 20, 45, 70, 90][(branchIdx * 3 + slotIdx) % 6];
      contractStart = addDays(dateHired, 0);
      contractEnd = addDays(TODAY, spread);
      dateRegularized = null;
    }

    // sprinkle a few resignations / on-leave for dashboard widgets
    if (branchIdx === 1 && tpl.slot === "csr") {
      status = "resigned";
      statusChangedAt = addDays(TODAY, -6);
    }
    if (branchIdx === 4 && tpl.slot === "sales1") {
      status = "on_leave";
      statusChangedAt = addDays(TODAY, -2);
    }
    if (branchIdx === 7 && tpl.slot === "opsStaff") {
      status = "resigned";
      statusChangedAt = addDays(TODAY, -18);
    }

    const isMonthly = tpl.payrollType === "monthly";
    const monthlySalary = isMonthly ? 30000 + ((branchIdx + slotIdx) % 6) * 6000 : null;
    const dailyRate = !isMonthly ? 520 + ((branchIdx + slotIdx) % 5) * 35 : null;

    const emp = buildEmployee({
      id,
      firstName: FIRST_NAMES[nameIdx],
      lastName: LAST_NAMES[lastIdx],
      branchId: branch.id,
      departmentId: tpl.departmentId,
      positionId: tpl.position,
      supervisorId,
      employmentStatus: tpl.employmentStatus,
      dateHired,
      dateRegularized,
      contractStart,
      contractEnd,
      probationEndsAt,
      payrollType: tpl.payrollType,
      dailyRate,
      monthlySalary,
      status,
      statusChangedAt,
      roles: tpl.roles,
      birthMonth: ((branchIdx * 3 + slotIdx) % 12) + 1,
      birthDay: 3 + ((slotIdx * 5 + branchIdx) % 25),
      birthYear: 1980 + ((branchIdx + slotIdx) % 20),
    });

    slotIds[tpl.slot] = id;
    EMPLOYEES.push(emp);

    if (tpl.slot === "sales1") RANK_AND_FILE_SAMPLE_ID_BY_BRANCH[branch.id] = id;
    if (tpl.slot === "consultant") FREELANCER_IDS.push(id);
  });
  DEPT_HEAD_IDS[branch.id] = { salesManager: slotIds.salesManager, opsManager: slotIds.opsManager };
});

// force a couple of July birthdays for the "upcoming birthdays" widget, deterministically
EMPLOYEES.find((e) => e.id === "emp-ceb-sales1")!.birthdate = "1992-07-16";
EMPLOYEES.find((e) => e.id === "emp-dvo-opsStaff")!.birthdate = "1989-07-19";
EMPLOYEES.find((e) => e.id === "emp-bag-adminStaff")!.birthdate = "1994-07-31";

// --- Demo login users -----------------------------------------------------
export const DEMO_USERS: DemoUser[] = [
  { id: "u-hr", employeeId: hrAdmin.id, name: "Maria Santos", title: "HR Administrator", roles: ["hr_admin"], initials: "MS" },
  { id: "u-payroll", employeeId: payrollOfficer.id, name: "Juan Dela Cruz", title: "Payroll Officer", roles: ["payroll_officer"], initials: "JD" },
  { id: "u-acctg", employeeId: srAcctg.id, name: "Ana Reyes", title: "Sr. Accounting Assistant", roles: ["sr_accounting_assistant"], initials: "AR" },
  { id: "u-treasurer", employeeId: treasurer.id, name: "Roberto Lim", title: "Corporate Treasurer", roles: ["treasurer"], initials: "RL" },
  { id: "u-cfo", employeeId: cfo.id, name: "Elena Cruz", title: "Chief Finance Officer", roles: ["cfo"], initials: "EC" },
  { id: "u-depthead", employeeId: "emp-ceb-salesManager", name: EMPLOYEES.find((e) => e.id === "emp-ceb-salesManager")!.firstName + " " + EMPLOYEES.find((e) => e.id === "emp-ceb-salesManager")!.lastName, title: "Branch Sales Manager (Cebu)", roles: ["dept_head", "employee"], initials: "BM" },
  { id: "u-employee", employeeId: "emp-qc-sales1", name: EMPLOYEES.find((e) => e.id === "emp-qc-sales1")!.firstName + " " + EMPLOYEES.find((e) => e.id === "emp-qc-sales1")!.lastName, title: "Sales Associate (Quezon City)", roles: ["employee"], initials: "SA" },
  { id: "u-upper", employeeId: vpOps.id, name: "Isabel Garcia", title: "VP for Operations", roles: ["upper_management"], initials: "IG" },
  { id: "u-freelancer", employeeId: "emp-dvo-consultant", name: EMPLOYEES.find((e) => e.id === "emp-dvo-consultant")!.firstName + " " + EMPLOYEES.find((e) => e.id === "emp-dvo-consultant")!.lastName, title: "Sales Consultant (Davao)", roles: ["freelancer"], initials: "FL" },
  { id: "u-sysadmin", employeeId: sysAdmin.id, name: "Patricia Uy", title: "System Administrator", roles: ["sys_admin"], initials: "PU" },
];

// --- Performance evaluations ------------------------------------------------
export const EVAL_CRITERIA_TEMPLATE = [
  { label: "Job Knowledge", weight: 0.25 },
  { label: "Quality of Work", weight: 0.25 },
  { label: "Attendance & Punctuality", weight: 0.2 },
  { label: "Teamwork", weight: 0.15 },
  { label: "Initiative", weight: 0.15 },
];

function makeEvaluation(id: string, employeeId: string, evaluatorId: string, period: string, status: PerformanceEvaluation["status"], seedOffset: number): PerformanceEvaluation {
  let weighted = 0;
  const criteria = EVAL_CRITERIA_TEMPLATE.map((c, i) => {
    const score = 3 + Math.round(rng() * 2 * 10) / 10 - ((i + seedOffset) % 2) * 0.4;
    const clamped = Math.min(5, Math.max(2, Math.round(score * 10) / 10));
    weighted += clamped * c.weight;
    return { ...c, score: clamped };
  });
  return {
    id,
    employeeId,
    evaluatorId,
    period,
    criteria,
    overallScore: Math.round(weighted * 10) / 10,
    comments:
      weighted >= 4.2
        ? "Consistently exceeds expectations; recommended for recognition."
        : weighted >= 3.5
          ? "Meets expectations with room to grow in initiative."
          : "Needs improvement; performance improvement plan to be discussed.",
    status,
    createdAt: addDays(TODAY, -seedOffset * 4 - 3),
  };
}

export const PERFORMANCE_EVALUATIONS: PerformanceEvaluation[] = [];
export const CURRENT_EVAL_PERIOD = "Semi-Annual 2026 (Jan–Jun)";
const evalPeriod = CURRENT_EVAL_PERIOD;
let evalSeq = 0;
EMPLOYEES.filter((e) => e.roles.includes("employee") && e.supervisorId).forEach((e, i) => {
  if (i % 4 !== 0) return; // sample subset
  evalSeq += 1;
  const status: PerformanceEvaluation["status"] = evalSeq % 3 === 0 ? "draft" : evalSeq % 3 === 1 ? "acknowledged" : "submitted";
  PERFORMANCE_EVALUATIONS.push(
    makeEvaluation(`ev-${evalSeq}`, e.id, e.supervisorId as string, evalPeriod, status, evalSeq),
  );
});

// --- Disciplinary records ---------------------------------------------------
const DISC_TYPES: DisciplinaryRecord["type"][] = [
  "incident_report", "verbal_warning", "written_warning", "suspension", "nte", "nod",
];
const DISC_DESCRIPTIONS: Record<DisciplinaryRecord["type"], string> = {
  incident_report: "Reported for repeated tardiness beyond grace period during the pay period.",
  verbal_warning: "Verbally counseled regarding uniform/dress code compliance.",
  written_warning: "Written warning issued for unauthorized absence without prior notice.",
  suspension: "Three (3) day suspension for violation of company code of conduct.",
  nte: "Notice to Explain issued regarding discrepancy in sales report submission.",
  nod: "Notice of Decision issued following completed administrative investigation.",
};

export const DISCIPLINARY_RECORDS: DisciplinaryRecord[] = [];
const discEmployees = EMPLOYEES.filter((e) => e.roles.includes("employee")).slice(0, 12);
discEmployees.forEach((e, i) => {
  const type = DISC_TYPES[i % DISC_TYPES.length];
  DISCIPLINARY_RECORDS.push({
    id: `disc-${i + 1}`,
    employeeId: e.id,
    type,
    description: DISC_DESCRIPTIONS[type],
    issuedBy: hrAdmin.id,
    date: addDays(TODAY, -(i * 9 + 5)),
    status: i % 3 === 0 ? "resolved" : "open",
    attachmentName: i % 2 === 0 ? `${type}-${e.employeeNumber}.pdf` : null,
  });
});

// --- Audit logs --------------------------------------------------------------
export const AUDIT_LOGS: AuditLog[] = [
  { id: "al-1", userId: hrAdmin.id, userName: "Maria Santos", module: "Employee 201 File", action: "update", description: "Updated contact details", previousValue: "0917xxxxxxx", newValue: "0918xxxxxxx", createdAt: addDays(TODAY, -20) },
  { id: "al-2", userId: payrollOfficer.id, userName: "Juan Dela Cruz", module: "Payroll", action: "lock", description: "Locked payroll period 2026-07-01 to 2026-07-15", previousValue: "open", newValue: "locked", createdAt: addDays(TODAY, -2) },
  { id: "al-3", userId: hrAdmin.id, userName: "Maria Santos", module: "Leave Management", action: "approve", description: "Approved Vacation Leave request", previousValue: "pending", newValue: "approved", createdAt: addDays(TODAY, -6) },
  { id: "al-4", userId: sysAdmin.id, userName: "Patricia Uy", module: "System Administration", action: "create", description: "Added new work schedule: Flexi", previousValue: null, newValue: "Flexi 09:00-18:00", createdAt: addDays(TODAY, -30) },
  { id: "al-5", userId: hrAdmin.id, userName: "Maria Santos", module: "Discipline", action: "create", description: "Issued written warning", previousValue: null, newValue: "written_warning", createdAt: addDays(TODAY, -14) },
  { id: "al-6", userId: "emp-ceb-salesManager", userName: "Branch Sales Manager", module: "Overtime", action: "approve", description: "Approved 3 OT hours", previousValue: "pending", newValue: "approved (3 hrs)", createdAt: addDays(TODAY, -4) },
  { id: "al-7", userId: payrollOfficer.id, userName: "Juan Dela Cruz", module: "Payslips", action: "generate", description: "Generated payslips for 104 employees", previousValue: null, newValue: "104 payslips", createdAt: addDays(TODAY, -16) },
  { id: "al-8", userId: hrAdmin.id, userName: "Maria Santos", module: "Contract Monitoring", action: "notify", description: "Sent expiration reminder for 5 contracts", previousValue: null, newValue: "5 notifications sent", createdAt: addDays(TODAY, -1) },
];

// --- Announcements -----------------------------------------------------------
export const ANNOUNCEMENTS: Announcement[] = [
  { id: "an-1", title: "Mid-Year Performance Evaluations Now Open", body: "Department heads may begin conducting Semi-Annual 2026 evaluations for their direct reports. Deadline for submission is July 31.", category: "memo", postedBy: "Maria Santos", postedAt: addDays(TODAY, -3), expiresAt: addDays(TODAY, 20) },
  { id: "an-2", title: "Ninoy Aquino Day — August 21 (Special Non-Working)", body: "Please plan attendance encoding and payroll cut-offs around the August 21 special non-working holiday.", category: "holiday", postedBy: "Patricia Uy", postedAt: addDays(TODAY, -1), expiresAt: "2026-08-22" },
  { id: "an-3", title: "Company Town Hall — August 5", body: "All branches are invited to join the Q2 town hall via video conference. Details to follow from your branch manager.", category: "event", postedBy: "Isabel Garcia", postedAt: addDays(TODAY, -5), expiresAt: "2026-08-06" },
  { id: "an-4", title: "Updated Leave Filing Policy", body: "Leave requests must now be filed at least 3 working days in advance except for emergency and sick leave.", category: "policy", postedBy: "Maria Santos", postedAt: addDays(TODAY, -10), expiresAt: null },
  { id: "an-5", title: "Welcome New Hires — July 2026", body: "Join us in welcoming our newest team members across Marketing and HR this month!", category: "announcement", postedBy: "Maria Santos", postedAt: addDays(TODAY, -2), expiresAt: addDays(TODAY, 30) },
];
