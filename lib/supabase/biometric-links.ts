import { getSupabaseClient } from "./client";

// Which employee each person in a branch's biometrics file is
// (supabase/migrate_phase46_biometrics_import.sql). Keyed by branch and the
// machine's ID ("id:12") or, when the file has no ID, the name ("name:…").

export interface BiometricLink {
  branchId: string;
  deviceKey: string;
  deviceName: string;
  employeeId: string;
}

type Row = { branch_id: string; device_key: string; device_name: string; employee_id: string };
type Query = PromiseLike<{ data: unknown; error: { message: string } | null }> & {
  select: (c?: string) => Query;
  upsert: (v: Record<string, unknown>[], o?: { onConflict: string }) => Query;
};
const table = () => (getSupabaseClient() as unknown as { from: (t: string) => Query }).from("biometric_links");
const notSetUp = (m: string) => /biometric_links/.test(m);

// Resolves to [] until the biometrics update has been run.
export async function fetchBiometricLinks(): Promise<BiometricLink[]> {
  const { data, error } = await table().select("branch_id, device_key, device_name, employee_id");
  if (error) {
    if (notSetUp(error.message)) return [];
    throw new Error(error.message);
  }
  return (data as Row[]).map((r) => ({ branchId: r.branch_id, deviceKey: r.device_key, deviceName: r.device_name, employeeId: r.employee_id }));
}

export async function saveBiometricLinks(links: BiometricLink[]): Promise<void> {
  if (!links.length) return;
  const { error } = await table().upsert(
    links.map((l) => ({ branch_id: l.branchId, device_key: l.deviceKey, device_name: l.deviceName.slice(0, 200), employee_id: l.employeeId, updated_at: new Date().toISOString() })),
    { onConflict: "branch_id,device_key" },
  );
  if (error) throw new Error(notSetUp(error.message) ? "The biometrics import isn't set up yet — run the latest database update first." : error.message);
}
