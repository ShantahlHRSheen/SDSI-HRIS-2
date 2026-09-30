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
  if (listErr) {
    // Before the phase 17 migration runs the bucket doesn't exist yet.
    if (/not found/i.test(listErr.message)) return null;
    throw listErr;
  }
  const file = files?.find((f) => f.name === path);
  if (!file) return null;
  const [view, download] = await Promise.all([bucket.createSignedUrl(path, 3600), bucket.createSignedUrl(path, 3600, { download: downloadName })]);
  if (view.error) throw view.error;
  if (download.error) throw download.error;
  const size = (file.metadata as { size?: number } | null)?.size;
  return {
    url: view.data.signedUrl,
    downloadUrl: download.data.signedUrl,
    updatedAt: file.updated_at ?? file.created_at ?? null,
    sizeBytes: typeof size === "number" ? size : null,
  };
}

export async function replaceCompanyDocument(path: string, file: File): Promise<void> {
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) throw new Error("Please choose a PDF file.");
  if (file.size > COMPANY_DOC_MAX_BYTES) throw new Error("That PDF is over 25 MB — please compress it first.");
  const { error } = await getSupabaseClient().storage.from(COMPANY_DOCS_BUCKET).upload(path, file, { upsert: true, contentType: "application/pdf", cacheControl: "300" });
  if (error) throw error;
}

// Signatures printed on vouchers (supabase/migrate_phase23_prepared_by_signature.sql,
// migrate_phase24_voucher_signoffs.sql): transparent PNGs in signatures/.
// Prepared by = HR; Checked by = the Sr. Accounting Assistant; Released by =
// the Corporate Treasurer (HR can manage all three).
export type SignatureKind = "prepared-by" | "checked-by" | "released-by";
export const SIGNATURE_KINDS: SignatureKind[] = ["prepared-by", "checked-by", "released-by"];
const signaturePath = (kind: SignatureKind) => `signatures/${kind}.png`;

// Viewing links (1 hour) for the signatures that have been uploaded.
export async function fetchSignatureUrls(): Promise<Partial<Record<SignatureKind, string>>> {
  const bucket = getSupabaseClient().storage.from(COMPANY_DOCS_BUCKET);
  const { data: files, error } = await bucket.list("signatures", { limit: 20 });
  if (error || !files) return {};
  const out: Partial<Record<SignatureKind, string>> = {};
  for (const kind of SIGNATURE_KINDS) {
    const file = files.find((f) => f.name === `${kind}.png`);
    if (!file) continue;
    const { data, error: signErr } = await bucket.createSignedUrl(signaturePath(kind), 3600);
    // The version tag makes browsers pick up a replaced signature straight away.
    if (!signErr) out[kind] = `${data.signedUrl}&v=${encodeURIComponent(file.updated_at ?? file.created_at ?? "")}`;
  }
  return out;
}

export async function uploadSignature(kind: SignatureKind, png: Blob): Promise<void> {
  const { error } = await getSupabaseClient().storage.from(COMPANY_DOCS_BUCKET).upload(signaturePath(kind), png, { upsert: true, contentType: "image/png", cacheControl: "60" });
  if (error) {
    if (/mime|type/i.test(error.message)) throw new Error("Signature upload isn't set up yet — run the latest database update first.");
    if (/row-level security/i.test(error.message)) throw new Error("You can only upload your own signature.");
    throw new Error(error.message);
  }
}

export async function removeSignature(kind: SignatureKind): Promise<void> {
  const { data, error } = await getSupabaseClient()
    .storage.from(COMPANY_DOCS_BUCKET)
    .remove([signaturePath(kind)]);
  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error("You can only remove your own signature.");
}
