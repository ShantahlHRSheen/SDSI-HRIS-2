"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BookOpen, Download, ExternalLink, Upload } from "lucide-react";
import { useHris } from "@/lib/store";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { reportSaveError } from "@/lib/save-errors";
import { fetchCompanyDocument, HANDBOOK_PATH, replaceCompanyDocument, type CompanyDocument } from "@/lib/supabase/company-documents";

const DOWNLOAD_NAME = "SDSI Employee Handbook.pdf";

function formatSize(bytes: number | null): string {
  if (!bytes) return "";
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;
}

export default function HandbookPage() {
  const { currentUser, isRealAccount } = useHris();
  const isHr = !!currentUser?.roles.includes("hr_admin");
  const [doc, setDoc] = useState<CompanyDocument | null | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    fetchCompanyDocument(HANDBOOK_PATH, DOWNLOAD_NAME).then(
      (d) => {
        setDoc(d);
        setLoadError(null);
      },
      (err) => setLoadError(err instanceof Error ? err.message : "Couldn't load the handbook."),
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
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploadError(null);
    setUploading(true);
    try {
      await replaceCompanyDocument(HANDBOOK_PATH, file);
      load();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Upload failed.";
      setUploadError(message);
      reportSaveError("Couldn't upload the handbook", err);
    } finally {
      setUploading(false);
    }
  }

  const updated = doc?.updatedAt ? new Date(doc.updatedAt).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", year: "numeric", month: "long", day: "numeric" }) : null;
  const button = "flex items-center gap-1.5 rounded-lg border border-[var(--border-hairline)] px-3 py-2 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40";

  if (!isRealAccount) {
    return (
      <div>
        <PageHeader title="Employee Handbook" subtitle="Shantahl Direct Sales Inc. company policies and guidelines." />
        <EmptyState icon={BookOpen} title="Not available in the demo" description="Sign in with your employee account to read the handbook." />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Employee Handbook"
        subtitle="Shantahl Direct Sales Inc. company policies and guidelines. Please read it and keep it handy — ask HR if anything is unclear."
        actions={
          isHr && (
            <>
              <input ref={fileInput} type="file" accept="application/pdf,.pdf" className="hidden" onChange={upload} />
              <button onClick={() => fileInput.current?.click()} disabled={uploading} className={`${button} disabled:opacity-50`}>
                <Upload size={16} /> {uploading ? "Uploading…" : doc ? "Upload new version" : "Upload handbook"}
              </button>
            </>
          )
        }
      />
      {uploadError && <div className="mb-3 text-sm text-[var(--status-critical)]">{uploadError}</div>}

      {loadError && <div className="text-sm text-[var(--status-critical)]">Couldn&rsquo;t load the handbook: {loadError}</div>}
      {!loadError && doc === undefined && <div className="text-sm text-[var(--text-muted)]">Loading…</div>}
      {!loadError && doc === null && (
        <EmptyState icon={BookOpen} title="The handbook hasn't been uploaded yet" description={isHr ? "Use “Upload handbook” to add the PDF." : "Please check back soon, or ask HR for a copy."} />
      )}
      {doc && (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <a href={doc.url} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 rounded-lg bg-[var(--series-1)] px-3 py-2 text-sm font-medium text-[var(--on-accent)]">
              <ExternalLink size={16} /> Open full screen
            </a>
            <a href={doc.downloadUrl} className={button}>
              <Download size={16} /> Download PDF
            </a>
            <span className="text-xs text-[var(--text-muted)]">
              {[updated && `Updated ${updated}`, formatSize(doc.sizeBytes)].filter(Boolean).join(" · ")}
            </span>
          </div>
          {/* Phones generally can't show a PDF inside a page, so they get the buttons above. */}
          <iframe src={doc.url} title="SDSI Employee Handbook" className="hidden h-[calc(100dvh-13rem)] min-h-[520px] w-full rounded-xl border border-[var(--border-hairline)] bg-white md:block" />
          <p className="mt-2 text-xs text-[var(--text-muted)] md:hidden">On a phone, tap &ldquo;Open full screen&rdquo; to read the handbook, or download it to keep a copy.</p>
        </>
      )}
    </div>
  );
}
