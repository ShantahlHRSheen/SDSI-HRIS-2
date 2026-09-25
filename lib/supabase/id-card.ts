import { getSupabaseClient } from "./client";

// Employee ID card media (photo + signature) and self-service emergency
// contact — see supabase/migrate_phase15_employee_id_cards.sql. The card
// itself isn't stored; it's drawn from the employee record.

export const ID_MEDIA_BUCKET = "employee-id-media";
export type IdMediaKind = "photo" | "signature";

// The typed client doesn't know these two functions; they're called by name.
function rpc(fn: string, args: Record<string, unknown>) {
  return (getSupabaseClient() as unknown as { rpc: (f: string, a: Record<string, unknown>) => PromiseLike<{ error: { message: string } | null }> }).rpc(fn, args);
}

// Uploads the new file, points the employee record at it, then deletes the
// previous file so replacements don't pile up. Returns the new path.
export async function replaceIdMedia(employeeId: string, kind: IdMediaKind, file: Blob, previousPath: string | null | undefined): Promise<string> {
  const bucket = getSupabaseClient().storage.from(ID_MEDIA_BUCKET);
  const ext = file.type === "image/png" ? "png" : "jpg";
  const path = `${employeeId}/${kind}-${Date.now()}.${ext}`;
  const { error: upErr } = await bucket.upload(path, file, { contentType: file.type });
  if (upErr) throw upErr;
  const { error } = await rpc("set_employee_id_media", { emp_id: employeeId, kind, path });
  if (error) {
    await bucket.remove([path]);
    throw new Error(error.message);
  }
  if (previousPath) await bucket.remove([previousPath]).catch(() => {});
  return path;
}

export async function saveEmergencyContact(employeeId: string, name: string, phone: string): Promise<void> {
  const { error } = await rpc("set_employee_emergency_contact", { emp_id: employeeId, contact_name: name, contact_phone: phone });
  if (error) throw new Error(error.message);
}

// Short-lived (1 hour) viewing links for a photo and/or signature.
export async function idMediaUrls(paths: (string | null | undefined)[]): Promise<Record<string, string>> {
  const wanted = paths.filter((p): p is string => !!p);
  if (!wanted.length) return {};
  const { data, error } = await getSupabaseClient().storage.from(ID_MEDIA_BUCKET).createSignedUrls(wanted, 3600);
  if (error) throw error;
  const urls: Record<string, string> = {};
  for (const d of data) if (d.path && d.signedUrl) urls[d.path] = d.signedUrl;
  return urls;
}
