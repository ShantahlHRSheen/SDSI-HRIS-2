import { getSupabaseClient } from "./supabase/client";
import { currentCompany } from "./companies";

// Confidential Cases (supabase/migrate_phase71_confidential_cases.sql): HR's
// write-ups of sensitive cases, seen only by HR and the listed viewers (the
// Chairman and the Vice Chairperson).

// Who may open Confidential Cases: HR, and the company's listed viewers.
export function canSeeConfidential(roles: string[], employeeId: string | undefined) {
  return roles.includes("hr_admin") || (!!employeeId && (currentCompany().confidentialViewerIds ?? []).includes(employeeId));
}

export type CaseStatus = "open" | "investigating" | "resolved" | "closed";
export const CASE_STATUS: Record<CaseStatus, { label: string; tone: "warning" | "info" | "good" | "muted" }> = {
  open: { label: "Open", tone: "warning" },
  investigating: { label: "Under investigation", tone: "info" },
  resolved: { label: "Resolved", tone: "good" },
  closed: { label: "Closed", tone: "muted" },
};

export interface CaseDetail {
  label: string;
  value: string;
}
// A report section: text ("- " lines are bullets, **bold**) or a table
// (first row is the header).
export interface CaseSection {
  heading: string;
  kind: "text" | "table";
  body: string;
  rows: string[][];
}
export interface CaseAction {
  text: string;
  done: boolean;
}
// A written explanation asked of someone; HR uploads the signed one.
export interface CaseExplanation {
  name: string;
  requestedOn: string; // YYYY-MM-DD, or ""
  receivedOn: string; // YYYY-MM-DD once the signed explanation is in
  path: string; // the uploaded file, in the case's folder
  fileName: string;
}
export interface CaseSignoff {
  label: string; // "Prepared by" / "Noted by"
  title: string; // "HR Manager"
}

export interface ConfidentialCase {
  id: string;
  title: string;
  caseDate: string;
  status: CaseStatus;
  summary: string;
  details: CaseDetail[];
  sections: CaseSection[];
  actions: CaseAction[];
  signoff: CaseSignoff[];
  explanations: CaseExplanation[];
  createdByName: string;
  createdAt: string;
  updatedByName: string | null;
  updatedAt: string | null;
}

export type CaseInput = Omit<ConfidentialCase, "id" | "createdByName" | "createdAt" | "updatedByName" | "updatedAt">;

// A new case starts from HR's incident-report layout.
export function blankCase(today: string): CaseInput {
  return {
    title: "Incident Report – ",
    caseDate: today,
    status: "investigating",
    summary: "",
    details: ["Subject", "Employees concerned", "Date of meetings", "Meetings held", "Management present", "Prepared by"].map((label) => ({ label, value: label === "Prepared by" ? "HR Manager" : "" })),
    sections: [
      { heading: "Background", kind: "text", body: "", rows: [] },
      {
        heading: "Allegations vs. Explanations",
        kind: "table",
        body: "",
        rows: [
          ["Allegation", "Explanation", "Status"],
          ["", "", ""],
        ],
      },
      { heading: "Initial Observations", kind: "text", body: "", rows: [] },
    ],
    actions: [],
    explanations: [],
    signoff: [
      { label: "Prepared by", title: "HR Manager" },
      { label: "Noted by", title: "Vice Chairperson" },
      { label: "Noted by", title: "Chairman" },
    ],
  };
}

// "**bold** rest" → runs.
export function inlineRuns(t: string): { t: string; b: boolean }[] {
  return t
    .split(/(\*\*[^*]+\*\*)/)
    .filter(Boolean)
    .map((p) => (p.startsWith("**") && p.endsWith("**") ? { t: p.slice(2, -2), b: true } : { t: p, b: false }));
}

// A text section's blocks: paragraphs and bullet lists.
export function textBlocks(body: string): ({ kind: "p"; text: string } | { kind: "ul"; items: string[] })[] {
  const out: ({ kind: "p"; text: string } | { kind: "ul"; items: string[] })[] = [];
  for (const raw of body.split("\n")) {
    const line = raw.trimEnd();
    const bullet = /^\s*[-•]\s+(.*)$/.exec(line);
    const last = out[out.length - 1];
    if (bullet) {
      if (last?.kind === "ul") last.items.push(bullet[1]);
      else out.push({ kind: "ul", items: [bullet[1]] });
    } else if (line.trim()) out.push({ kind: "p", text: line.trim() });
  }
  return out;
}

// ---- Data ---------------------------------------------------------------------------

type Row = Record<string, unknown>;
type Query = PromiseLike<{ data: unknown; error: { message: string } | null }> & {
  select: (c?: string) => Query;
  insert: (v: Row) => Query;
  update: (v: Row) => Query;
  delete: () => Query;
  eq: (c: string, v: string) => Query;
  order: (c: string, o?: { ascending: boolean }) => Query;
  single: () => Query;
};
const table = () => (getSupabaseClient() as unknown as { from: (t: string) => Query }).from("confidential_cases");
const files = () => getSupabaseClient().storage.from("confidential-files");

const SETUP = "Confidential Cases isn't set up yet — ask HR to run the latest database update.";
const friendly = (msg: string) => (/confidential/i.test(msg) && /exist|find|not found|schema cache/i.test(msg) ? SETUP : msg);

const toCase = (r: Row): ConfidentialCase => ({
  id: String(r.id),
  title: String(r.title ?? ""),
  caseDate: String(r.case_date ?? ""),
  status: (r.status as CaseStatus) ?? "open",
  summary: String(r.summary ?? ""),
  details: (r.details as CaseDetail[]) ?? [],
  sections: (r.sections as CaseSection[]) ?? [],
  actions: (r.actions as CaseAction[]) ?? [],
  signoff: (r.signoff as CaseSignoff[]) ?? [],
  explanations: Array.isArray(r.explanations) ? (r.explanations as CaseExplanation[]) : [],
  createdByName: String(r.created_by_name ?? ""),
  createdAt: String(r.created_at ?? ""),
  updatedByName: (r.updated_by_name as string | null) ?? null,
  updatedAt: (r.updated_at as string | null) ?? null,
});
const toRow = (c: CaseInput): Row => ({
  title: c.title.trim(),
  case_date: c.caseDate,
  status: c.status,
  summary: c.summary,
  details: c.details,
  sections: c.sections,
  actions: c.actions,
  signoff: c.signoff,
  explanations: c.explanations,
});

export async function fetchConfidentialCases(): Promise<ConfidentialCase[]> {
  const { data, error } = await table().select("*").order("case_date", { ascending: false });
  if (error) throw new Error(friendly(error.message));
  return (data as Row[]).map(toCase);
}

export async function createConfidentialCase(c: CaseInput): Promise<string> {
  const { data, error } = await table().insert(toRow(c)).select("id").single();
  if (error) throw new Error(friendly(error.message));
  return String((data as Row).id);
}

export async function updateConfidentialCase(id: string, c: CaseInput): Promise<void> {
  const { error } = await table().update(toRow(c)).eq("id", id);
  if (error) throw new Error(friendly(error.message));
}

export async function deleteConfidentialCase(id: string): Promise<void> {
  const list = await caseFiles(id).catch(() => []);
  if (list.length) await files().remove(list.map((f) => f.path));
  const { error } = await table().delete().eq("id", id);
  if (error) throw new Error(friendly(error.message));
}

// ---- Attachments ------------------------------------------------------------------

export interface CaseFile {
  name: string;
  path: string;
  size: number;
  uploadedAt: string;
}

export async function caseFiles(id: string): Promise<CaseFile[]> {
  const { data, error } = await files().list(id, { limit: 100, sortBy: { column: "created_at", order: "asc" } });
  if (error) throw new Error(friendly(error.message));
  return (data ?? [])
    .filter((f) => f.name !== ".emptyFolderPlaceholder")
    .map((f) => ({ name: f.name.replace(/^\d+-/, ""), path: `${id}/${f.name}`, size: Number(f.metadata?.size ?? 0), uploadedAt: f.created_at ?? "" }));
}

export const CASE_FILE_ACCEPT = ".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx";

// Uploads a file to the case's folder; returns its path.
export async function uploadCaseFile(id: string, file: File): Promise<string> {
  if (file.size > 10 * 1024 * 1024) throw new Error("Files up to 10 MB.");
  const safe = file.name.replace(/[^A-Za-z0-9._ -]+/g, "_").slice(-120);
  const path = `${id}/${Date.now()}-${safe}`;
  const { error } = await files().upload(path, file, { contentType: file.type || undefined });
  if (error) throw new Error(/mime|type/i.test(error.message) ? "PDF, Word, Excel or image files only." : friendly(error.message));
  return path;
}

// HR uploads someone's signed explanation: the file goes in the case's
// folder and the explanation is marked received today.
export async function uploadSignedExplanation(c: ConfidentialCase, index: number, file: File, today: string): Promise<void> {
  const path = await uploadCaseFile(c.id, file);
  const explanations = c.explanations.map((x, i) => (i === index ? { ...x, path, fileName: file.name, receivedOn: today } : x));
  const { error } = await table().update({ explanations }).eq("id", c.id);
  if (error) {
    await files().remove([path]);
    throw new Error(friendly(error.message));
  }
}

export async function removeCaseFile(path: string): Promise<void> {
  const { error } = await files().remove([path]);
  if (error) throw new Error(friendly(error.message));
}

export async function caseFileUrl(path: string): Promise<string> {
  const { data, error } = await files().createSignedUrl(path, 600);
  if (error || !data?.signedUrl) throw new Error(error ? friendly(error.message) : "Couldn't open the file.");
  return data.signedUrl;
}
