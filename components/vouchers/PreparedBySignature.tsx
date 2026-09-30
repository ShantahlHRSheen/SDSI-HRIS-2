"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PenLine, Trash2 } from "lucide-react";
import { useHris } from "@/lib/store";
import { prepareSignature } from "@/lib/id-images";
import { reportSaveError } from "@/lib/save-errors";
import { fetchPreparedBySignatureUrl, removePreparedBySignature, uploadPreparedBySignature } from "@/lib/supabase/company-documents";

// The "Prepared by" signature printed on vouchers. Real accounts only.
export function usePreparedBySignature() {
  const { isRealAccount } = useHris();
  const [url, setUrl] = useState<string | null>(null);
  const reload = useCallback(() => {
    if (!isRealAccount) return;
    fetchPreparedBySignatureUrl().then(setUrl, () => setUrl(null));
  }, [isRealAccount]);
  useEffect(() => {
    reload();
    // Signed links last an hour; refresh before they expire.
    const t = window.setInterval(reload, 50 * 60_000);
    return () => window.clearInterval(t);
  }, [reload]);
  return { url, reload };
}

// HR: upload / replace / remove the signature (photo of a signature on white
// paper; the background is removed automatically, as on the ID card).
export function PreparedBySignatureControl({ url, onChanged }: { url: string | null; onChanged: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    try {
      await uploadPreparedBySignature(await prepareSignature(file));
      onChanged();
    } catch (err) {
      reportSaveError("Couldn't save the signature", err);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm("Remove the Prepared-by signature from printed vouchers?")) return;
    setBusy(true);
    try {
      await removePreparedBySignature();
      onChanged();
    } catch (err) {
      reportSaveError("Couldn't remove the signature", err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2 rounded-lg border border-[var(--border-hairline)] px-2 py-1">
      <span className="text-xs text-[var(--text-muted)]">Prepared-by signature:</span>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL from Supabase Storage
        <img src={url} alt="Prepared-by signature" className="h-7 max-w-[90px] rounded bg-white px-1 object-contain" />
      ) : (
        <span className="text-xs text-[var(--text-muted)] italic">none</span>
      )}
      <button
        type="button"
        onClick={() => input.current?.click()}
        disabled={busy}
        className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40 disabled:opacity-40"
      >
        <PenLine size={13} /> {busy ? "Saving…" : url ? "Replace" : "Upload"}
      </button>
      {url && (
        <button
          type="button"
          onClick={remove}
          disabled={busy}
          className="rounded-md p-1 text-[var(--text-muted)] hover:text-[var(--status-critical)] disabled:opacity-40"
          aria-label="Remove signature"
        >
          <Trash2 size={13} />
        </button>
      )}
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={pick} />
    </div>
  );
}
