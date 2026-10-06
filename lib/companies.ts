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
  },
  daro: {
    id: "daro",
    name: "Daro Lending Corporation",
    shortName: "Daro",
    logo: "/brand/daro.png",
    formLogo: "/brand/daro-wide.png",
    idCardLogo: "/brand/daro-wide.png",
    info: { name: "Daro Lending Corporation", ...TBA },
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL_DARO,
    supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY_DARO,
    payslipSignatories: [
      { role: "Prepared by", name: "", title: "HR" },
      { role: "Checked by", name: "", title: "Accounting" },
      { role: "Released by", name: "", title: "Treasury" },
    ],
    voucherSignatories: [
      [
        { role: "Prepared by:", name: "", title: "HR" },
        { role: "Checked by:", name: "", title: "ACCOUNTING" },
        { role: "Approved by:", name: "", title: "MANAGEMENT" },
      ],
      [{ role: "Released by:", name: "", title: "TREASURY" }],
    ],
    emailHint: "you@company.com",
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
