"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ImagePlus, Network, Trash2 } from "lucide-react";
import { useHris } from "@/lib/store";
import { currentCompany } from "@/lib/companies";
import { EmptyState } from "@/components/EmptyState";
import { reportSaveError } from "@/lib/save-errors";
import { fetchOrgChartPhotos, removeOrgChartPhoto, uploadOrgChartPhoto, type OrgChartPhoto } from "@/lib/supabase/company-documents";

// Org chart as photos of the company's own chart, uploaded by HR
// (lib/companies.ts orgChartPhotos).
export function OrgChartPhotos() {
  const { currentUser, isRealAccount } = useHris();
  const isHr = !!currentUser?.roles.includes("hr_admin");
  const [photos, setPhotos] = useState<OrgChartPhoto[] | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    fetchOrgChartPhotos().then(
      (p) => {
        setPhotos(p);
        setLoadError(null);
      },
      (err) => setLoadError(err instanceof Error ? err.message : "Couldn't load the org chart."),
    );
  }, []);

  useEffect(() => {
    if (!isRealAccount) return;
    load();
    // Viewing links last an hour; refresh them before they run out.
    const t = window.setInterval(load, 50 * 60_000);
    return () => window.clearInterval(t);
  }, [isRealAccount, load]);

  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!files.length) return;
    setError(null);
    setBusy(true);
    try {
      for (const f of files) await uploadOrgChartPhoto(f);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
      reportSaveError("Couldn't upload the org chart", err);
    } finally {
      setBusy(false);
      load();
    }
  }

  async function remove(name: string) {
    if (!window.confirm("Remove this org chart photo?")) return;
    setError(null);
    setBusy(true);
    try {
      await removeOrgChartPhoto(name);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't remove the photo.");
      reportSaveError("Couldn't remove the org chart photo", err);
    } finally {
      setBusy(false);
      load();
    }
  }

  return (
    <section className="rounded-2xl border border-[var(--border-hairline)] bg-[var(--surface-1)]/40 p-4 sm:p-6">
      <div className="mb-5 text-center">
        <h1 className="text-2xl font-extrabold tracking-wide text-[var(--text-primary)] uppercase sm:text-3xl">{currentCompany().name}</h1>
        <div className="mt-1.5 text-xs tracking-[0.2em] text-[var(--text-muted)] uppercase">Organizational Structure</div>
        {isHr && isRealAccount && (
          <div className="mt-4 flex justify-center">
            <input ref={fileInput} type="file" accept="image/*" multiple className="hidden" onChange={upload} />
            <button onClick={() => fileInput.current?.click()} disabled={busy} className="flex items-center gap-1.5 rounded-lg bg-[var(--series-1)] px-3 py-2 text-sm font-medium text-[var(--on-accent)] disabled:opacity-50">
              <ImagePlus size={16} /> {busy ? "Saving…" : "Upload org chart photo"}
            </button>
          </div>
        )}
      </div>
      {error && <div className="mb-3 text-center text-sm text-[var(--status-critical)]">{error}</div>}

      {!isRealAccount && <EmptyState icon={Network} title="Not available in the demo" description="Sign in with your employee account to see the org chart." />}
      {isRealAccount && loadError && <div className="text-center text-sm text-[var(--status-critical)]">Couldn&rsquo;t load the org chart: {loadError}</div>}
      {isRealAccount && !loadError && photos === undefined && <div className="text-center text-sm text-[var(--text-muted)]">Loading…</div>}
      {isRealAccount && photos?.length === 0 && (
        <EmptyState icon={Network} title="The org chart hasn't been uploaded yet" description={isHr ? "Use “Upload org chart photo” to add it. You can add more than one photo." : "Please check back soon."} />
      )}
      {!!photos?.length && (
        <div className="space-y-4">
          {photos.map((p) => (
            <figure key={p.name} className="relative overflow-hidden rounded-xl border border-[var(--border-hairline)] bg-white">
              <a href={p.url} target="_blank" rel="noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed Storage URL */}
                <img src={p.url} alt={`${currentCompany().name} organizational chart`} className="mx-auto block h-auto w-full" />
              </a>
              {isHr && (
                <button onClick={() => remove(p.name)} disabled={busy} className="absolute top-2 right-2 flex items-center gap-1 rounded-lg bg-black/60 px-2 py-1 text-xs font-medium text-white disabled:opacity-50">
                  <Trash2 size={13} /> Remove
                </button>
              )}
            </figure>
          ))}
          <p className="text-center text-xs text-[var(--text-muted)]">Tap a photo to open it full size.</p>
        </div>
      )}
    </section>
  );
}
