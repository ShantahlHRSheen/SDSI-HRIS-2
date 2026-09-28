import { getSupabaseClient } from "./client";
import { toDisciplinaryRecord } from "./repo";
import type { DisciplinaryRecordRow } from "./types";
import type { DisciplinaryRecord } from "../types";
import { loadBitmap, toBlob } from "../id-images";

// Discipline notices and the employee's response
// (supabase/migrate_phase20_discipline_notices.sql). Files live in the
// private "discipline-files" bucket, one folder per record:
//   <record id>/notice-*.pdf        the NTE / sanction, uploaded by HR or the head
//   <record id>/ack-*.png           the employee's signature (acknowledgement)
//   <record id>/explanation-*.pdf|jpg  the employee's attached written explanation

export const DISCIPLINE_BUCKET = "discipline-files";
export const DISCIPLINE_MAX_BYTES = 10 * 1024 * 1024;

const bucket = () => getSupabaseClient().storage.from(DISCIPLINE_BUCKET);
const isPdf = (f: File) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf");
const stamp = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

type RpcResult = { data: DisciplinaryRecordRow | null; error: { message: string } | null };
const rpc = (fn: string, args: Record<string, unknown>) =>
  (getSupabaseClient() as unknown as { rpc: (f: string, a: Record<string, unknown>) => { single: () => PromiseLike<RpcResult> } }).rpc(fn, args).single();

async function upload(path: string, body: Blob, contentType: string): Promise<void> {
  const { error } = await bucket().upload(path, body, { contentType, upsert: false });
  if (error) throw new Error(/row-level security/i.test(error.message) ? "You can't upload a file to this record." : error.message);
}

// HR / department head: attach (or replace, until acknowledged) the notice PDF.
export async function attachNoticePdf(recordId: string, file: File, previousPath: string | null): Promise<DisciplinaryRecord> {
  if (!isPdf(file)) throw new Error("Please choose a PDF file for the notice.");
  if (file.size > DISCIPLINE_MAX_BYTES) throw new Error("That PDF is over 10 MB — please compress it first.");
  const path = `${recordId}/notice-${stamp()}.pdf`;
  await upload(path, file, "application/pdf");
  const { data, error } = await getSupabaseClient()
    .from("disciplinary_records")
    .update({ notice_path: path, notice_file_name: file.name.slice(0, 200) })
    .eq("id", recordId)
    .select()
    .single();
  if (error) {
    await bucket().remove([path]);
    throw new Error(error.message);
  }
  if (previousPath) await bucket().remove([previousPath]);
  return toDisciplinaryRecord(data);
}

// Employee: sign to acknowledge receipt.
export async function acknowledgeNotice(recordId: string, signaturePng: Blob): Promise<DisciplinaryRecord> {
  const path = `${recordId}/ack-${stamp()}.png`;
  await upload(path, signaturePng, "image/png");
  const { data, error } = await rpc("discipline_acknowledge", { record_id: recordId, signature_path: path });
  if (error || !data) throw new Error(error?.message ?? "Couldn't save your acknowledgement.");
  return toDisciplinaryRecord(data);
}

// Photos are re-saved as JPEG (max 2000 px) so they're small and can be
// placed into the downloadable PDF; PDFs are kept as they are.
async function prepareExplanationFile(file: File): Promise<{ blob: Blob; ext: string; type: string }> {
  if (isPdf(file)) {
    if (file.size > DISCIPLINE_MAX_BYTES) throw new Error("That PDF is over 10 MB — please compress it first.");
    return { blob: file, ext: "pdf", type: "application/pdf" };
  }
  if (!file.type.startsWith("image/")) throw new Error("Attach a PDF or a photo (JPG or PNG).");
  const img = await loadBitmap(file);
  const scale = Math.min(1, 2000 / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return { blob: await toBlob(canvas, "image/jpeg", 0.85), ext: "jpg", type: "image/jpeg" };
}

// Employee: submit the written explanation (typed text and/or a file).
export async function submitExplanation(recordId: string, text: string, file: File | null): Promise<DisciplinaryRecord> {
  let path: string | null = null;
  let name: string | null = null;
  if (file) {
    const prepared = await prepareExplanationFile(file);
    path = `${recordId}/explanation-${stamp()}.${prepared.ext}`;
    name = file.name.replace(/\.[^.]+$/, "") + "." + prepared.ext;
    await upload(path, prepared.blob, prepared.type);
  }
  const { data, error } = await rpc("discipline_submit_explanation", { record_id: recordId, body: text, file_path: path, file_name: name });
  if (error || !data) throw new Error(error?.message ?? "Couldn't submit your explanation.");
  return toDisciplinaryRecord(data);
}

// Signed links (1 hour) for viewing; `downloadName` makes the browser save it.
// (Demo login files are in-memory blob: URLs.)
export async function disciplineFileUrl(path: string, downloadName?: string): Promise<string> {
  if (path.startsWith("blob:")) return path;
  const { data, error } = await bucket().createSignedUrl(path, 3600, downloadName ? { download: downloadName } : undefined);
  if (error) throw new Error(error.message);
  return data.signedUrl;
}

export async function downloadDisciplineFile(path: string): Promise<Blob> {
  if (path.startsWith("blob:")) return (await fetch(path)).blob();
  const { data, error } = await bucket().download(path);
  if (error) throw new Error(error.message);
  return data;
}
