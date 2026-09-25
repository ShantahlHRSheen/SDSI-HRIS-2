"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, PenLine, Printer } from "lucide-react";
import { useHris } from "@/lib/store";
import { reportSaveError } from "@/lib/save-errors";
import { prepareIdPhoto, prepareSignature } from "@/lib/id-images";
import { idMediaUrls, replaceIdMedia, saveEmergencyContact, type IdMediaKind } from "@/lib/supabase/id-card";
import { todayInManila } from "@/lib/leave-policy";
import type { Employee } from "@/lib/types";
import { IdCardBack, IdCardFront, idExpiryDate } from "./IdCard";

// ID card page body: the card (front + back), uploads for the photo and
// signature, the emergency contact form, and printing. Used for "My ID
// card" (the signed-in employee) and by HR from an employee's profile.
export function IdCardManager({ employee }: { employee: Employee }) {
  const { patchEmployeeLocal, isRealAccount } = useHris();
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<IdMediaKind | null>(null);
  const [error, setError] = useState<string | null>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  const signatureInput = useRef<HTMLInputElement>(null);
  const [contact, setContact] = useState({ name: employee.emergencyContactName ?? "", phone: employee.emergencyContactPhone ?? "" });
  const [savingContact, setSavingContact] = useState(false);
  const [contactSaved, setContactSaved] = useState(false);
  const expiry = idExpiryDate(todayInManila());

  useEffect(() => {
    if (!isRealAccount) return;
    let active = true;
    idMediaUrls([employee.idPhotoPath, employee.idSignaturePath])
      .then((u) => active && setUrls(u))
      .catch((err) => console.warn("Couldn't load ID photo/signature", err));
    return () => {
      active = false;
    };
  }, [employee.idPhotoPath, employee.idSignaturePath, isRealAccount]);

  async function upload(kind: IdMediaKind, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    setBusy(kind);
    try {
      const prepared = kind === "photo" ? await prepareIdPhoto(file) : await prepareSignature(file);
      const previous = kind === "photo" ? employee.idPhotoPath : employee.idSignaturePath;
      const path = await replaceIdMedia(employee.id, kind, prepared, previous);
      patchEmployeeLocal(employee.id, kind === "photo" ? { idPhotoPath: path } : { idSignaturePath: path });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Upload failed.";
      setError(message);
      if (!/couldn't be read|No signature found/.test(message)) reportSaveError(`Couldn't save the ${kind}`, err);
    } finally {
      setBusy(null);
    }
  }

  async function saveContact(e: React.FormEvent) {
    e.preventDefault();
    setSavingContact(true);
    setContactSaved(false);
    try {
      await saveEmergencyContact(employee.id, contact.name, contact.phone);
      patchEmployeeLocal(employee.id, { emergencyContactName: contact.name.trim() || null, emergencyContactPhone: contact.phone.trim() || null } as Partial<Employee>);
      setContactSaved(true);
    } catch (err) {
      reportSaveError("Couldn't save the emergency contact", err);
    } finally {
      setSavingContact(false);
    }
  }

  const missing = [
    !employee.idPhotoPath && "photo",
    !employee.idSignaturePath && "signature",
    !employee.emergencyContactName?.trim() && "emergency contact",
    !employee.dateHired && "date hired (HR)",
    !employee.birthdate && "date of birth (HR)",
    !employee.address?.trim() && "address (HR)",
    !employee.sssNumber && "SSS (HR)",
    !employee.philHealthNumber && "PhilHealth (HR)",
    !employee.hdmfNumber && "Pag-IBIG (HR)",
    !employee.tin && "TIN (HR)",
  ].filter(Boolean) as string[];

  const photoUrl = employee.idPhotoPath ? urls[employee.idPhotoPath] : undefined;
  const signatureUrl = employee.idSignaturePath ? urls[employee.idSignaturePath] : undefined;
  const input = "w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-2 text-sm";

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[auto_1fr]">
      <div>
        <div className="id-print-area flex flex-wrap gap-6">
          <div className="id-card-screen-zoom">
            <IdCardFront employee={employee} photoUrl={photoUrl} signatureUrl={signatureUrl} expiry={expiry} />
          </div>
          <div className="id-card-screen-zoom">
            <IdCardBack employee={employee} />
          </div>
        </div>
        <button
          onClick={() => window.print()}
          className="mt-4 flex items-center gap-1.5 rounded-lg bg-[var(--series-1)] px-3 py-2 text-sm font-medium text-[var(--on-accent)] print:hidden"
        >
          <Printer size={16} /> Print / Save as PDF
        </button>
        <p className="mt-1 text-xs text-[var(--text-muted)] print:hidden">Prints both sides at actual ID size (85.6 × 54 mm) — cut along the edges and laminate. Choose &ldquo;Save as PDF&rdquo; in the print window to keep a copy.</p>
      </div>

      <div className="space-y-4 print:hidden">
        {missing.length > 0 && (
          <div className="rounded-xl border border-[var(--status-warning)]/40 p-3 text-sm" style={{ background: "color-mix(in srgb, var(--status-warning) 10%, transparent)" }}>
            <div className="font-medium text-[var(--text-primary)]">Still missing on this ID</div>
            <div className="mt-0.5 text-xs text-[var(--text-secondary)]">{missing.join(" · ")}</div>
          </div>
        )}

        {isRealAccount && (
          <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-1)] p-4">
            <div className="mb-3 text-sm font-medium text-[var(--text-primary)]">Photo and signature</div>
            <input ref={photoInput} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => upload("photo", e)} />
            <input ref={signatureInput} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => upload("signature", e)} />
            <div className="flex flex-wrap gap-2">
              <button onClick={() => photoInput.current?.click()} disabled={busy !== null} className="flex items-center gap-1.5 rounded-lg border border-[var(--border-hairline)] px-3 py-2 text-sm text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40 disabled:opacity-50">
                <Camera size={16} /> {busy === "photo" ? "Uploading…" : employee.idPhotoPath ? "Change photo" : "Upload photo"}
              </button>
              <button onClick={() => signatureInput.current?.click()} disabled={busy !== null} className="flex items-center gap-1.5 rounded-lg border border-[var(--border-hairline)] px-3 py-2 text-sm text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40 disabled:opacity-50">
                <PenLine size={16} /> {busy === "signature" ? "Uploading…" : employee.idSignaturePath ? "Change signature" : "Upload signature"}
              </button>
            </div>
            <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs text-[var(--text-muted)]">
              <li>Photo: a clear, front-facing picture on a plain background. It&rsquo;s cropped to ID size automatically.</li>
              <li>Signature: sign in dark ink on plain white paper, then take a photo of it. The paper is removed automatically.</li>
            </ul>
            {error && <div className="mt-2 text-xs text-[var(--status-critical)]">{error}</div>}
          </div>
        )}

        {isRealAccount && (
          <form onSubmit={saveContact} className="rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-1)] p-4">
            <div className="mb-3 text-sm font-medium text-[var(--text-primary)]">Contact in case of emergency</div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Name</label>
                <input value={contact.name} onChange={(e) => { setContact((c) => ({ ...c, name: e.target.value })); setContactSaved(false); }} maxLength={120} className={input} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Contact number</label>
                <input value={contact.phone} onChange={(e) => { setContact((c) => ({ ...c, phone: e.target.value })); setContactSaved(false); }} maxLength={40} inputMode="tel" className={input} />
              </div>
            </div>
            <div className="mt-3 flex items-center gap-3">
              <button type="submit" disabled={savingContact} className="rounded-lg bg-[var(--series-1)] px-3 py-1.5 text-sm font-medium text-[var(--on-accent)] disabled:opacity-40">
                {savingContact ? "Saving…" : "Save"}
              </button>
              {contactSaved && <span className="text-xs text-[var(--status-good)]">Saved</span>}
            </div>
          </form>
        )}

        <div className="text-xs text-[var(--text-muted)]">
          Name, position, department, ID number, dates, address, contact number, birthday and government numbers come from the employee record — ask HR to correct anything wrong there.
        </div>
      </div>
    </div>
  );
}
