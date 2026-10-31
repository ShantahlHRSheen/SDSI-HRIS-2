// LSM Group of Companies HRIS: one app, one separate database per company.
// Each company has its own Supabase project (employees, payroll, accounts…),
// so a login for one company can't see another's data. This file holds each
// company's public setup; the database keys come from environment variables
// (Vercel → Settings → Environment Variables):
//
//   Shantahl Direct Sales   NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY
//   LSMBiz Credit Corp.     NEXT_PUBLIC_SUPABASE_URL_LSMBIZ / NEXT_PUBLIC_SUPABASE_ANON_KEY_LSMBIZ / SUPABASE_SERVICE_ROLE_KEY_LSMBIZ
//   Daro Lending Corp.      NEXT_PUBLIC_SUPABASE_URL_DARO / NEXT_PUBLIC_SUPABASE_ANON_KEY_DARO / SUPABASE_SERVICE_ROLE_KEY_DARO
//
// A company without its keys shows as "Coming soon" on the sign-in page.

export const GROUP_NAME = "LSM Group of Companies";
export const APP_NAME = "LSM Group of Companies HRIS";

export type CompanyId = "sdsi" | "lsmbiz" | "daro";

export interface Signatory {
  role: string;
  name: string;
  title: string;
  // Voucher only: columns (of 4) this signatory takes, for a long name.
  span?: number;
}

export interface CompanyConfig {
  id: CompanyId;
  name: string; // "Shantahl Direct Sales Inc."
  shortName: string; // "SDSI"
  // Square logo (sign-in page, sidebar) and the logo printed on forms / IDs.
  logo: string;
  formLogo: string;
  idCardLogo: string;
  // Band / photo-frame color on the employee ID; dark green unless set.
  idCardColor?: string;
  // "gradient": the ID's bands fade from deep navy to bright blue, with a
  // ringed photo and the ID number on a badge (components/id-card/IdCard.tsx).
  idCardStyle?: "gradient" | "modern";
  // Colours of the "modern" ID: band gradient deep → mid, and the lining.
  idCardTheme?: { deep: string; mid: string; line: string };
  info: { name: string; tin: string; address: string; phone: string; email: string; rdoCode: string };
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  // Printed on payslips (Prepared / Checked / Released) and vouchers.
  payslipSignatories: Signatory[];
  voucherSignatories: Signatory[][];
  // 13th month slips (Prepared / Checked / Released); payslip ones if not set.
  thirteenthMonthSignatories?: Signatory[];
  // Placeholder shown in the sign-in email box.
  emailHint: string;
  // Employee numbers of admin-only accounts: people who manage this
  // company's HRIS but don't work for it. They can sign in with their roles,
  // but are left out of every employee list (directory, payroll, headcount,
  // org chart, dropdowns).
  adminAccountNumbers?: string[];
  // Layout of the payroll Excel this company uploads in Payroll Processing:
  // the standard register (lib/payroll-import.ts) unless set.
  payrollImportFormat?: "lsmbiz" | "daro";
  // Payroll Processing's columns, column names and payslip labels follow
  // this company's own payroll sheet (lib/payroll-layout.ts); standard if unset.
  payrollLayout?: "daro";
  // Attendance's Import Excel reads this company's own DTR workbook
  // (lib/attendance-import-daro.ts) instead of the attendance tracker export.
  attendanceImportFormat?: "daro";
  // Payroll Processing lists each allowance (rice, uniform, laundry,
  // medical cash, additional) instead of one Allowances total.
  allowanceBreakdown?: boolean;
  // Payroll Expense Report groups payroll by branch instead of by division
  // (Business Units / Shared Services, which are Shantahl's).
  payrollExpenseByBranch?: boolean;
  // 13th month pay counts the Cash Allowance (Other Allowance 1 in the
  // payroll) along with basic pay.
  thirteenthMonthCashAllowance?: boolean;
  // Each cutoff's Other Allowance, by employee number, for the people whose
  // amount is always the same. When an uploaded payroll file has no Other
  // Allowance column, this much of the ALLOWANCE is Other Allowance and the
  // rest is Cash Allowance (lib/payroll-import-lsmbiz.ts).
  fixedOtherAllowance?: Record<string, number>;
  // People who sign in here with the same email and password as in another
  // company's HRIS (app/api/auth/linked-sign-in): when their password doesn't
  // match here, it's checked against `from`'s database and, if right, saved
  // here too. Listed by employee number in this company.
  // One entry per company the people come from.
  linkedSignIn?: { from: CompanyId; employeeNumbers: string[] }[];
  // Org Chart shows photos of the company's own chart that HR uploads,
  // instead of one drawn from the 201 files.
  orgChartPhotos?: boolean;
  // The HR Department's letterhead banner on generated notices (NTEs);
  // a plain text heading if unset.
  hrLetterhead?: string;
  // Certificate of Employment (lib/coe-pdf.ts): letterhead banner, footer
  // band and watermark images, where it's issued (after the company name)
  // and HR's contact lines under the signature. A plain layout if unset.
  coe?: { header?: string; footer?: string; watermark?: string; issuedAt: string; contact: string; email: string };
  // Pag-IBIG Multi-Purpose Loan form (lib/mpl-pdf.ts): the employer's part —
  // the authorized signatory (employee id), Pag-IBIG employer ID and the
  // business address as the form splits it.
  // A payroll import whose Net Pay is rounded (up to 5 centavos off) saves
  // the difference as the line's net pay rounding, so the HRIS matches what
  // was paid (needs payroll_line_overrides.net_rounding, phase 68).
  payrollNetRounding?: boolean;
  // Approvers whose leave-form approval is titled by their position instead
  // of "Department Head" (employee id → title).
  approverTitles?: Record<string, string>;
  // The leave form's printed layout; the standard APPLICATION FOR LEAVE if
  // unset. "lsmbiz": LSMBiz's Employee's Leave Application Form
  // (components/leave/LsmbizLeaveFormDocument.tsx). "daro": Daro's own form
  // (components/leave/DaroLeaveFormDocument.tsx) with its four leave types,
  // the Supervisor's and Branch Head's approvals, and HR's certification with
  // a recommendation (supabase/migrate_phase66_leave_form_hr_recommendation.sql).
  leaveFormLayout?: "lsmbiz" | "daro";
  // Employees can have a second supervisor who approves like the first
  // (supabase/migrate_phase67_co_supervisor.sql; shown in Edit employee).
  secondSupervisor?: boolean;
  // Fixed-rate employees are left out of the Tardiness Report, except these
  // (employee ids), whose lates only the listed viewers (employee ids) see.
  restrictedLates?: { employeeIds: string[]; viewerIds: string[] };
  // Accounts (employee numbers) that don't get this company's HR Messages:
  // no menu item, unread badge or inbox, even with HR access.
  hrMessagesHiddenFrom?: string[];
  // Sales Admin Evaluation for Regularization (lib/sales-admin-eval.ts):
  // the default Department Head, Vice Chairperson and Chairman (employee
  // ids, with their titles on the form), the pass mark, and the positions
  // evaluated (position id prefix).
  // secondHeads: branches whose employees a second Department Head also
  // rates (branch id → employee id), averaged with the first head.
  salesAdminEval?: {
    headId: string;
    vcId: string;
    chairmanId: string;
    headTitle: string;
    vcTitle: string;
    chairmanTitle: string;
    passMark: number;
    positionPrefix: string;
    secondHeads?: Record<string, string>;
    // Forms that skip the Vice Chairperson's recommendation.
    noVcForms?: string[];
  };
  pagibigMpl?: {
    signatoryId: string;
    employerPagibigId: string;
    address: { unit: string; building: string; house: string; street: string; subdivision: string; barangay: string; city: string; province: string; zip: string };
  };
}

const TBA = { tin: "", address: "", phone: "", email: "", rdoCode: "" };

export const COMPANIES: Record<CompanyId, CompanyConfig> = {
  sdsi: {
    id: "sdsi",
    name: "Shantahl Direct Sales Inc.",
    shortName: "SDSI",
    logo: "/brand/shantahl-circle.png",
    formLogo: "/brand/shantahl-form-logo.png",
    idCardLogo: "/brand/shantahl-logo.png",
    hrLetterhead: "/brand/shantahl-hr-letterhead.png",
    coe: {
      header: "/brand/shantahl-coe-header.jpg",
      footer: "/brand/shantahl-coe-footer.jpg",
      watermark: "/brand/shantahl-coe-watermark.png",
      issuedAt: "CABANATUAN CITY, NUEVA ECIJA (HEAD OFFICE)",
      contact: "09051733206 / 044-960-0126",
      email: "shantahlhr@gmail.com",
    },
    // Sheilah Magdadaro approves Sheena, Joan Mariette, Maricris and Marlyn's leave.
    approverTitles: { "emp-004": "Vice Chairperson" },
    payrollNetRounding: true,
    // Marlyn Leonardo, John Paul Michael Papa, Ronald Lugtu — seen by Lowel
    // and Sheilah Magdadaro and Sheena Evangelista.
    restrictedLates: { employeeIds: ["emp-045", "emp-038", "emp-037"], viewerIds: ["emp-001", "emp-004", "emp-012"] },
    salesAdminEval: {
      headId: "emp-027", // Michelle Ignacio
      vcId: "emp-004", // Sheilah A. Magdadaro
      chairmanId: "emp-001", // Lowel B. Magdadaro
      headTitle: "Department Head",
      vcTitle: "Vice Chairperson",
      chairmanTitle: "Chairman of the Board",
      passMark: 90,
      positionPrefix: "ps-sales-admin",
      // Cebu: Mary Jane Pedrano (Branch Manager) with Marlyn Leonardo.
      secondHeads: { "br-ceb": "emp-060" },
      // Sales Admin: HR and the head, then the Chairman.
      noVcForms: ["sales_admin"],
    },
    pagibigMpl: {
      signatoryId: "emp-045", // Marlyn C. Leonardo, Operations Manager
      employerPagibigId: "208844580009",
      address: { unit: "", building: "", house: "109", street: "Apo St.", subdivision: "Mabini Homesite", barangay: "", city: "Cabanatuan City", province: "Nueva Ecija", zip: "3100" },
    },
    // Green gradient bands, emergency contact + return-to on the back.
    idCardStyle: "modern",
    info: {
      name: "Shantahl Direct Sales Inc.",
      tin: "000-123-456-000",
      address: "109 Apo St., Mabini Homesite, Cabanatuan City, Nueva Ecija",
      phone: "044-960-0126",
      email: "shantahlhr@gmail.com",
      rdoCode: "043 — Pasig City",
    },
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    payslipSignatories: [
      { role: "Prepared by", name: "Sheena A. Evangelista", title: "HR Manager" },
      { role: "Checked by", name: "Wendie Halog", title: "Sr. Accounting Assistant" },
      { role: "Released by", name: "Joan Mariette Santarina", title: "Corporate Treasurer" },
    ],
    voucherSignatories: [
      [
        { role: "Prepared by:", name: "SHEENA A. EVANGELISTA", title: "HR MANAGER" },
        { role: "Checked by:", name: "WENDIE HALOG", title: "SR. ACCOUNTING ASSISTANT" },
        { role: "Approved by:", name: "SHEILAH A. MAGDADARO", title: "VICE CHAIRPERSON" },
        { role: "Approved by:", name: "JUNREY M. JAPITAN", title: "CEO" },
      ],
      [{ role: "Released by:", name: "JOAN MARIETTE O. SANTARINA", title: "CORPORATE TREASURER" }],
    ],
    thirteenthMonthSignatories: [
      { role: "Prepared by", name: "Sheena A. Evangelista", title: "HR Manager" },
      { role: "Checked by", name: "Wendie Halog", title: "Sr. Accounting Assistant" },
      { role: "Released by", name: "Joan Mariette O. Santarina", title: "Corporate Treasurer" },
    ],
    emailHint: "you@shantahl.com.ph",
  },
  lsmbiz: {
    id: "lsmbiz",
    name: "LSMBiz Credit Corporation",
    shortName: "LSMBiz",
    logo: "/brand/lsmbiz.png",
    formLogo: "/brand/lsmbiz-wide.png",
    idCardLogo: "/brand/lsmbiz-wide.png",
    idCardStyle: "modern",
    // Green of the logo, with its dark red as the lining.
    idCardTheme: { deep: "#0d4a1c", mid: "#1f8a35", line: "#7a1010" },
    info: {
      name: "LSMBiz Credit Corporation",
      tin: "007-058-421-000",
      address: "109 Apo St., Mabini Homesite, Cabanatuan City, Nueva Ecija",
      phone: "0915 780 6252",
      email: "lsmbizhrdept@gmail.com",
      rdoCode: "",
    },
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL_LSMBIZ,
    supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY_LSMBIZ,
    // Signatories' job titles not given yet, so the title line stays blank.
    payslipSignatories: [
      { role: "Prepared by", name: "Maricar De Guzman / Noemi Berber", title: "" },
      { role: "Checked by", name: "Merry Cris Layco", title: "" },
      { role: "Released by", name: "Jonalyn Fulo", title: "" },
    ],
    voucherSignatories: [
      [
        { role: "Prepared by:", name: "MARICAR DE GUZMAN / NOEMI BERBER", title: "", span: 2 },
        { role: "Checked by:", name: "MERRY CRIS LAYCO", title: "" },
      ],
      [{ role: "Released by:", name: "JONALYN FULO", title: "" }],
    ],
    thirteenthMonthSignatories: [
      { role: "Prepared by", name: "Maricar De Guzman / Noemi Berber", title: "" },
      { role: "Checked by", name: "Merry Cris Layco", title: "" },
      { role: "Released by", name: "Jonalyn Fulo", title: "" },
    ],
    emailHint: "you@company.com",
    // Sheena Evangelista (LSM Group HR) manages LSMBiz's HRIS but isn't on its roster.
    adminAccountNumbers: ["ADMIN-01"],
    // LSMBiz's HR handles its own HR Messages; Sheena doesn't see them.
    hrMessagesHiddenFrom: ["ADMIN-01"],
    // LSM OP / LSM ADM / CEO sheets — see lib/payroll-import-lsmbiz.ts.
    payrollImportFormat: "lsmbiz",
    allowanceBreakdown: true,
    payrollExpenseByBranch: true,
    thirteenthMonthCashAllowance: true,
    // From HR's Other Allowance list (January to October 2026): Doble,
    // Gantalao, Gomez, Tomas.
    fixedOtherAllowance: { "EMP-0007": 2000, "EMP-0229": 2000, "EMP-0012": 5000, "EMP-0039": 200 },
    orgChartPhotos: true,
    leaveFormLayout: "lsmbiz",
  },
  daro: {
    id: "daro",
    name: "Daro Lending Corporation",
    shortName: "Daro",
    logo: "/brand/daro.png",
    formLogo: "/brand/daro-wide.png",
    idCardLogo: "/brand/daro-wide.png",
    idCardColor: "#1e3a8a",
    idCardStyle: "modern",
    // Navy to blue, from the logo, with dark navy lining.
    idCardTheme: { deep: "#0c2389", mid: "#1d4ed8", line: "#081657" },
    info: { name: "Daro Lending Corporation", ...TBA },
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL_DARO,
    supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY_DARO,
    // Payroll is prepared by HR (Jam Karen Ducusin), checked by Accounting
    // (Richard Tejadillo Jr.) and approved by Maricris Barlinan (ADMIN-02).
    // Who releases it isn't set yet.
    payslipSignatories: [
      { role: "Prepared by", name: "Jam Karen E. Ducusin", title: "HR / Admin" },
      { role: "Checked by", name: "Richard Tejadillo Jr.", title: "Accounting" },
      { role: "Approved by", name: "Maricris Barlinan", title: "" },
    ],
    voucherSignatories: [
      [
        { role: "Prepared by:", name: "JAM KAREN E. DUCUSIN", title: "HR / ADMIN" },
        { role: "Checked by:", name: "RICHARD TEJADILLO JR.", title: "ACCOUNTING" },
        { role: "Approved by:", name: "MARICRIS BARLINAN", title: "" },
      ],
      [{ role: "Released by:", name: "", title: "TREASURY" }],
    ],
    emailHint: "you@company.com",
    // Admin-only accounts, not on Daro's roster: Sheena Evangelista (LSM
    // Group HR, see supabase/daro-first-admin.sql) and Maricris Barlinan
    // (approves payroll; supabase/daro-payroll-signatories.sql).
    adminAccountNumbers: ["ADMIN-01", "ADMIN-02", "ADMIN-03", "ADMIN-04"],
    // Daro's HR handles its own HR Messages; Sheena (ADMIN-01) doesn't see them.
    hrMessagesHiddenFrom: ["ADMIN-01"],
    // Lowel and Sheilah Magdadaro and Maricris Barlinan use their Shantahl sign-in.
    // Jonifer Doble (ADMIN-03) and Raymond Gantalao (ADMIN-04), the LSM Area
    // Managers for HO-Tarlac and Bulacan, use their LSMBiz sign-in.
    linkedSignIn: [
      { from: "sdsi", employeeNumbers: ["EMP-0001", "EMP-0002", "ADMIN-02"] },
      { from: "lsmbiz", employeeNumbers: ["ADMIN-03", "ADMIN-04"] },
    ],
    // HR uploads photos of Daro's own org chart, like LSMBiz.
    // One sheet per branch (BULACAN, CABANATUAN, HO-TARLAC) in the LSMBiz
    // workbook layout, with Daro's own columns — see lib/payroll-import-lsmbiz.ts.
    payrollImportFormat: "daro",
    payrollLayout: "daro",
    // Monthly DTR, one sheet per branch: IN | OUT | IN | OUT per employee.
    // Head Office: two Credit Supervisors both approve.
    secondSupervisor: true,
    leaveFormLayout: "daro",
    attendanceImportFormat: "daro",
    orgChartPhotos: true,
  },
};

// What a not-yet-connected company is missing (names only, never values),
// shown on the sign-in page to help finish setup.
export function companyMissingSetup(id: CompanyId): string[] {
  const c = COMPANIES[id];
  const missing: string[] = [];
  if (!c.supabaseUrl) missing.push("database address (URL)");
  if (!c.supabaseAnonKey) missing.push("access key (anon key)");
  return missing;
}

export const COMPANY_ORDER: CompanyId[] = ["sdsi", "lsmbiz", "daro"];

export function isCompanyId(v: unknown): v is CompanyId {
  return v === "sdsi" || v === "lsmbiz" || v === "daro";
}

// Has its own database connected (Vercel environment variables set).
export function isCompanyReady(id: CompanyId): boolean {
  const c = COMPANIES[id];
  return Boolean(c.supabaseUrl && c.supabaseAnonKey);
}

// ---- The company chosen in this browser -------------------------------------
// Remembered across visits; changing it reloads the app so nothing from one
// company's session stays on screen for another.

const KEY = "lsm-hris.company";

export function currentCompanyId(): CompanyId {
  if (typeof window === "undefined") return "sdsi";
  try {
    const v = window.localStorage.getItem(KEY);
    return isCompanyId(v) && isCompanyReady(v) ? v : "sdsi";
  } catch {
    return "sdsi";
  }
}

export function currentCompany(): CompanyConfig {
  return COMPANIES[currentCompanyId()];
}

export function chooseCompany(id: CompanyId) {
  try {
    window.localStorage.setItem(KEY, id);
  } catch {
    // Storage blocked: stays on the default company.
  }
}

// Prefix for anything this browser stores for the signed-in company, so two
// companies never share saved settings or cached data.
export function companyStorageKey(base: string): string {
  const id = currentCompanyId();
  return id === "sdsi" ? base : `${id}:${base}`;
}
