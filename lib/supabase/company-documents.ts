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

// Photos of the company's org chart (lib/companies.ts orgChartPhotos), shown
// on the Org Chart page in name order. The bucket takes PNGs and PDFs only, so
// photos are converted to PNG in the browser, scaled down to keep them small.
const ORG_CHART_DIR = "org-chart";
const ORG_CHART_MAX_SIDE = 2400;

export interface OrgChartPhoto {
  name: string;
  url: string;
}

export async function fetchOrgChartPhotos(): Promise<OrgChartPhoto[]> {
  const bucket = getSupabaseClient().storage.from(COMPANY_DOCS_BUCKET);
  const { data: files, error } = await bucket.list(ORG_CHART_DIR, { limit: 100, sortBy: { column: "name", order: "asc" } });
  if (error) {
    if (/not found/i.test(error.message)) return [];
    throw error;
  }
  const names = (files ?? []).filter((f) => f.name.endsWith(".png")).map((f) => f.name);
  if (!names.length) return [];
  const { data, error: signErr } = await bucket.createSignedUrls(names.map((n) => `${ORG_CHART_DIR}/${n}`), 3600);
  if (signErr) throw signErr;
  return names.map((name, i) => ({ name, url: data[i]?.signedUrl ?? "" })).filter((p) => p.url);
}

async function toPng(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error("Please choose a photo (JPG or PNG).");
  });
  const scale = Math.min(1, ORG_CHART_MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Your browser couldn't read that photo.");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't convert that photo."))), "image/png"));
}

export async function uploadOrgChartPhoto(file: File): Promise<void> {
  const png = await toPng(file);
  if (png.size > COMPANY_DOC_MAX_BYTES) throw new Error("That photo is too large — please use a smaller one.");
  const path = `${ORG_CHART_DIR}/${Date.now()}.png`;
  const { error } = await getSupabaseClient().storage.from(COMPANY_DOCS_BUCKET).upload(path, png, { contentType: "image/png", cacheControl: "300" });
  if (error) {
    if (/row-level security/i.test(error.message)) throw new Error("Only HR can upload the org chart.");
    throw new Error(error.message);
  }
}

export async function removeOrgChartPhoto(name: string): Promise<void> {
  const { data, error } = await getSupabaseClient().storage.from(COMPANY_DOCS_BUCKET).remove([`${ORG_CHART_DIR}/${name}`]);
  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error("Only HR can remove the org chart.");
}
