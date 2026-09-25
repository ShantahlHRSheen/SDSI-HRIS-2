import { getSupabaseClient } from "./client";

// Company-wide PDFs every signed-in employee can read, HR can replace
// (supabase/migrate_phase17_company_documents.sql).

export const COMPANY_DOCS_BUCKET = "company-documents";
export const HANDBOOK_PATH = "employee-handbook.pdf";
export const COMPANY_DOC_MAX_BYTES = 25 * 1024 * 1024;

export interface CompanyDocument {
  url: string;
  downloadUrl: string;
  updatedAt: string | null;
  sizeBytes: number | null;
}

// Null when the file hasn't been uploaded yet. Links last an hour.
export async function fetchCompanyDocument(path: string, downloadName: string): Promise<CompanyDocument | null> {
  const bucket = getSupabaseClient().storage.from(COMPANY_DOCS_BUCKET);
  const { data: files, error: listErr } = await bucket.list("", { search: path, limit: 10 });
  if (listErr) throw listErr;
  const file = files?.find((f) => f.name === path);
  if (!file) return null;
  const [view, download] = await Promise.all([bucket.createSignedUrl(path, 3600), bucket.createSignedUrl(path, 3600, { download: downloadName })]);
  if (view.error) throw view.error;
  if (download.error) throw download.error;
  const size = (file.metadata as { size?: number } | null)?.size;
  return { url: view.data.signedUrl, downloadUrl: download.data.signedUrl, updatedAt: file.updated_at ?? file.created_at ?? null, sizeBytes: typeof size === "number" ? size : null };
}

export async function replaceCompanyDocument(path: string, file: File): Promise<void> {
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) throw new Error("Please choose a PDF file.");
  if (file.size > COMPANY_DOC_MAX_BYTES) throw new Error("That PDF is over 25 MB — please compress it first.");
  const { error } = await getSupabaseClient().storage.from(COMPANY_DOCS_BUCKET).upload(path, file, { upsert: true, contentType: "application/pdf", cacheControl: "300" });
  if (error) throw error;
}
