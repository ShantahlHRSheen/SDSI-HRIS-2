import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient } from "./supabase/client";
import type { CompanyId } from "./companies";

// Careers (supabase/migrate_phase84_careers.sql): the company profile and job
// posts that HR keeps, shown on the public careers page, where people outside
// the company apply. Applications arrive in Hiring & Onboarding as applicants
// (source "online").

export type JobStatus = "draft" | "open" | "closed";
export type JobEmploymentType = "regular" | "probationary" | "reliever" | "project_based";

export interface CompanyProfile {
  tagline: string;
  about: string;
  mission: string;
  vision: string;
  coreValues: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  facebook: string;
  careersNote: string;
  // The company's own homepage (phase 87).
  founderName: string;
  founderTitle: string;
  founderMessage: string;
  founderPhotoPath: string | null;
  heroPhotoPath: string | null;
  updatedAt: string | null;
}

export interface JobPost {
  id: string;
  status: JobStatus;
  title: string;
  branchId: string | null;
  departmentId: string | null;
  location: string;
  employmentType: JobEmploymentType | null;
  slots: number;
  summary: string;
  responsibilities: string;
  qualifications: string;
  benefits: string;
  closesOn: string | null;
  requisitionId: string | null;
  bannerPhotoPath: string | null; // hiring banner (phase 88)
  examId: string | null; // initial exam (phase 85)
  psychScreening: boolean; // the Psychological screening too (phase 86)
  postedAt: string | null;
  updatedAt: string;
}

// What the public careers page gets (app/api/careers).
export interface PublicJob {
  id: string;
  title: string;
  place: string; // location, or branch / department
  employmentType: JobEmploymentType | null;
  slots: number;
  summary: string;
  responsibilities: string;
  qualifications: string;
  benefits: string;
  closesOn: string | null;
  postedAt: string | null;
  banner: string | null; // hiring banner photo URL
}
export interface PublicCareers {
  company: CompanyId;
  profile: CompanyProfile | null;
  jobs: PublicJob[];
}

export const JOB_STATUS: Record<JobStatus, { label: string; tone: "info" | "good" | "muted" }> = {
  draft: { label: "Draft", tone: "info" },
  open: { label: "Open — on the careers page", tone: "good" },
  closed: { label: "Closed", tone: "muted" },
};
export const JOB_TYPES: [JobEmploymentType, string][] = [
  ["regular", "Regular"],
  ["probationary", "Probationary"],
  ["reliever", "Reliever"],
  ["project_based", "Project-based"],
];
export const jobTypeLabel = (t: JobEmploymentType | null) => JOB_TYPES.find(([k]) => k === t)?.[1] ?? "";

// Resumes from the careers page (checked again on the server).
export const RESUME_MAX_BYTES = 4 * 1024 * 1024;
export const RESUME_ACCEPT = ".pdf,.doc,.docx,.jpg,.jpeg,.png";

// Each company's own website: /shantahl, /lsmbiz, /daro.
export { SITE_SLUG } from "./site-domains";
import { SITE_SLUG } from "./site-domains";
export const companyFromSlug = (slug: string): CompanyId | null => (Object.keys(SITE_SLUG) as CompanyId[]).find((k) => SITE_SLUG[k] === slug) ?? null;
export const siteUrl = (co: CompanyId, page = "") => `/${SITE_SLUG[co]}${page ? `/${page}` : ""}`;
export const careersUrl = (co: CompanyId, jobId?: string) => `${siteUrl(co, "careers")}${jobId ? `?job=${encodeURIComponent(jobId)}` : ""}`;

// ---- HR side (signed in) -----------------------------------------------------------

type Row = Record<string, unknown>;
const db = () => getSupabaseClient() as unknown as SupabaseClient;
const SETUP = "Careers isn't set up yet — ask HR to run the latest database update.";
const fail = (e: { message: string } | null) => {
  if (e) throw new Error(/(job_posts|company_profile)/i.test(e.message) && /exist|find|not found|schema cache/i.test(e.message) ? SETUP : e.message);
};

export const toProfile = (r: Row): CompanyProfile => ({
  tagline: String(r.tagline ?? ""),
  about: String(r.about ?? ""),
  mission: String(r.mission ?? ""),
  vision: String(r.vision ?? ""),
  coreValues: String(r.core_values ?? ""),
  address: String(r.address ?? ""),
  phone: String(r.phone ?? ""),
  email: String(r.email ?? ""),
  website: String(r.website ?? ""),
  facebook: String(r.facebook ?? ""),
  careersNote: String(r.careers_note ?? ""),
  founderName: String(r.founder_name ?? ""),
  founderTitle: String(r.founder_title ?? ""),
  founderMessage: String(r.founder_message ?? ""),
  founderPhotoPath: (r.founder_photo_path as string | null) ?? null,
  heroPhotoPath: (r.hero_photo_path as string | null) ?? null,
  updatedAt: (r.updated_at as string | null) ?? null,
});
const PROFILE_COLS: Record<Exclude<keyof CompanyProfile, "updatedAt">, string> = {
  tagline: "tagline",
  about: "about",
  mission: "mission",
  vision: "vision",
  coreValues: "core_values",
  address: "address",
  phone: "phone",
  email: "email",
  website: "website",
  facebook: "facebook",
  careersNote: "careers_note",
  founderName: "founder_name",
  founderTitle: "founder_title",
  founderMessage: "founder_message",
  founderPhotoPath: "founder_photo_path",
  heroPhotoPath: "hero_photo_path",
};

export const toJob = (r: Row): JobPost => ({
  id: String(r.id),
  status: r.status as JobStatus,
  title: String(r.title ?? ""),
  branchId: (r.branch_id as string | null) ?? null,
  departmentId: (r.department_id as string | null) ?? null,
  location: String(r.location ?? ""),
  employmentType: (r.employment_type as JobEmploymentType | null) ?? null,
  slots: Number(r.slots ?? 1),
  summary: String(r.summary ?? ""),
  responsibilities: String(r.responsibilities ?? ""),
  qualifications: String(r.qualifications ?? ""),
  benefits: String(r.benefits ?? ""),
  closesOn: (r.closes_on as string | null) ?? null,
  requisitionId: (r.requisition_id as string | null) ?? null,
  bannerPhotoPath: (r.banner_photo_path as string | null) ?? null,
  examId: (r.exam_id as string | null) ?? null,
  psychScreening: !!r.psych_screening,
  postedAt: (r.posted_at as string | null) ?? null,
  updatedAt: String(r.updated_at ?? ""),
});
const JOB_COLS = {
  status: "status",
  title: "title",
  branchId: "branch_id",
  departmentId: "department_id",
  location: "location",
  employmentType: "employment_type",
  slots: "slots",
  summary: "summary",
  responsibilities: "responsibilities",
  qualifications: "qualifications",
  benefits: "benefits",
  closesOn: "closes_on",
  requisitionId: "requisition_id",
  bannerPhotoPath: "banner_photo_path",
  examId: "exam_id",
  psychScreening: "psych_screening",
} as const;
export type JobPatch = Partial<Pick<JobPost, keyof typeof JOB_COLS>>;
const jobRow = (p: JobPatch): Row =>
  Object.fromEntries(
    Object.entries(p)
      .filter(([k]) => k in JOB_COLS)
      .map(([k, v]) => [JOB_COLS[k as keyof typeof JOB_COLS], v === "" && /Id$|closesOn|employmentType/.test(k) ? null : v]),
  );

export async function fetchProfile(): Promise<CompanyProfile> {
  const { data, error } = await db().from("company_profile").select("*").maybeSingle();
  fail(error);
  return toProfile((data as Row | null) ?? {});
}
export async function saveProfile(p: Partial<CompanyProfile>): Promise<void> {
  const row = Object.fromEntries(Object.entries(p).filter(([k]) => k in PROFILE_COLS).map(([k, v]) => [PROFILE_COLS[k as keyof typeof PROFILE_COLS], v]));
  const { error } = await db().from("company_profile").update(row).eq("id", true);
  fail(error);
}

export async function fetchJobPosts(): Promise<JobPost[]> {
  const { data, error } = await db().from("job_posts").select("*").order("updated_at", { ascending: false });
  fail(error);
  return ((data as Row[]) ?? []).map(toJob);
}
export async function createJobPost(p: JobPatch): Promise<string> {
  const { data, error } = await db().from("job_posts").insert(jobRow(p)).select("id").single();
  fail(error);
  return String((data as Row).id);
}
export async function updateJobPost(id: string, p: JobPatch): Promise<void> {
  const { error } = await db().from("job_posts").update(jobRow(p)).eq("id", id);
  fail(error);
}
export async function deleteJobPost(id: string): Promise<void> {
  const { error } = await db().from("job_posts").delete().eq("id", id);
  fail(error);
}
// Online applications per post.
export async function applicationCounts(): Promise<Record<string, number>> {
  const { data, error } = await db().from("applicants").select("job_post_id").not("job_post_id", "is", null);
  if (error) return {};
  const out: Record<string, number> = {};
  for (const r of (data as Row[]) ?? []) {
    const k = String(r.job_post_id);
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}
