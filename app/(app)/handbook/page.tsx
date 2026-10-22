"use client";

import { currentCompany } from "@/lib/companies";
import { useCallback, useEffect, useRef, useState } from "react";
import { BookOpen, Download, Maximize2, Upload } from "lucide-react";
import { useHris } from "@/lib/store";
import { FileViewer } from "@/components/FileViewer";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { reportSaveError } from "@/lib/save-errors";
import { fetchCompanyDocument, HANDBOOK_PATH, replaceCompanyDocument, type CompanyDocument } from "@/lib/supabase/company-documents";
import { fetchHandbookInfo, recordHandbookDownload, type HandbookInfo } from "@/lib/supabase/handbook-acks";
import { HandbookAckList, HandbookInfoEditor, MyHandbookAck, useHandbookAcks } from "@/components/handbook/HandbookAcknowledgment";

const downloadName = () => `${currentCompany().shortName} Employee Handbook.pdf`;

function formatSize(bytes: number | null): string {
  if (!bytes) return "";
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;
}

export default function HandbookPage() {
  const { currentUser, currentEmployee, isRealAccount } = useHris();
  const isHr = !!currentUser?.roles.includes("hr_admin");
  // HR and upper management see everyone's acknowledgment forms.
  const seesAll = isHr || !!currentUser?.roles.includes("upper_management");
  const [info, setInfo] = useState<HandbookInfo | null>(null);
  const [infoError, setInfoError] = useState<string | null>(null);
  const loadInfo = useCallback(() => {
    fetchHandbookInfo().then(
      (i) => {
        setInfo(i);
        setInfoError(null);
      },
      (e: Error) => setInfoError(e.message),
    );
  }, []);
  const { acks, downloads, error: ackError, reload: reloadAcks } = useHandbookAcks(isRealAccount);
  useEffect(() => {
    if (isRealAccount) loadInfo();
  }, [isRealAccount, loadInfo]);
  const reloadAll = useCallback(() => {
    loadInfo();
    reloadAcks();
  }, [loadInfo, reloadAcks]);
  // Opening or downloading the handbook is recorded (the "Date of HRIS
  // access / download" on the acknowledgment form).
  const recordDownload = useCallback(() => {
    if (!currentEmployee) return;
    recordHandbookDownload(currentEmployee.id).then(reloadAcks, () => {});
  }, [currentEmployee, reloadAcks]);
  const [doc, setDoc] = useState<CompanyDocument | null | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [reading, setReading] = useState(false);

  const load = useCallback(() => {
    fetchCompanyDocument(HANDBOOK_PATH, downloadName()).then(
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
        <PageHeader title="Employee Handbook" subtitle={`${currentCompany().name} company policies and guidelines.`} />
        <EmptyState icon={BookOpen} title="Not available in the demo" description="Sign in with your employee account to read the handbook." />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Employee Handbook"
        subtitle={`${currentCompany().name} company policies and guidelines. Please read it and keep it handy — ask HR if anything is unclear.`}
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
            <button
              onClick={() => {
                recordDownload();
                setReading(true);
              }}
              className="flex items-center gap-1.5 rounded-lg bg-[var(--series-1)] px-3 py-2 text-sm font-medium text-[var(--on-accent)]"
            >
              <Maximize2 size={16} /> Open full screen
            </button>
            <a href={doc.downloadUrl} onClick={recordDownload} className={button}>
              <Download size={16} /> Download PDF
            </a>
            {/* Only HR sees when the handbook was last replaced. */}
            {isHr && <span className="text-xs text-[var(--text-muted)]">{[updated && `Updated ${updated}`, formatSize(doc.sizeBytes)].filter(Boolean).join(" · ")}</span>}
          </div>
          {/* Only HR sees set-up problems (e.g. before the database update is run). */}
          {isHr && (infoError || ackError) && <div className="mb-3 text-sm text-[var(--status-critical)]">{infoError || ackError}</div>}
          {info && isHr && (
            <div className="mb-3 rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-1)] p-3">
              <HandbookInfoEditor key={`${info.version}|${info.effectiveDate}`} info={info} onSaved={reloadAll} />
            </div>
          )}
          {info && !infoError && !ackError && <MyHandbookAck info={info} acks={acks} downloads={downloads} doc={doc} onChanged={reloadAll} />}
          {/* Phones generally can't show a PDF inside a page, so they get the buttons above. */}
          <iframe src={doc.url} title={`${currentCompany().shortName} Employee Handbook`} className="hidden h-[calc(100dvh-13rem)] min-h-[520px] w-full rounded-xl border border-[var(--border-hairline)] bg-white md:block" />
          <p className="mt-2 text-xs text-[var(--text-muted)] md:hidden">On a phone, tap &ldquo;Open full screen&rdquo; to read the handbook, or download it to keep a copy.</p>
          {info && seesAll && !ackError && <HandbookAckList info={info} acks={acks} downloads={downloads} doc={doc} onChanged={reloadAll} />}
          {reading && <FileViewer file={{ url: doc.url, name: downloadName(), kind: "pdf" }} onClose={() => setReading(false)} />}
        </>
      )}
    </div>
  );
}
