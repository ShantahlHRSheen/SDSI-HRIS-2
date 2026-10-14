import { currentCompany } from "@/lib/companies";
import { BranchApprovalBlock } from "@/components/forms/BranchApproval";
import { CORRECTION_TYPES, timeLabel, type CorrectionForm } from "@/lib/correction-form";
import type { LeaveFormSigner } from "@/lib/supabase/leave-forms";

// The printed / on-screen "Attendance Correction Form", in the same style as
// the overtime form. Plain inline styles so it prints the same everywhere.

const exact = { WebkitPrintColorAdjust: "exact", printColorAdjust: "exact" } as const;
const longDate = (d: string) => (d ? new Intl.DateTimeFormat("en-US", { timeZone: "UTC", year: "numeric", month: "long", day: "numeric", weekday: "long" }).format(new Date(`${d.slice(0, 10)}T00:00:00Z`)) : "");
const signedOn = (iso: string | null) => (iso ? new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Manila", month: "short", day: "numeric", year: "numeric" }).format(new Date(iso)) : "");

function Box({ on }: { on: boolean }) {
  return <span style={{ fontSize: "11pt", marginRight: "6px" }}>{on ? "☑" : "☐"}</span>;
}

function Signature({ url, name, caption, date }: { url?: string; name: string | null; caption: string; date?: string | null }) {
  return (
    <div style={{ width: "290px", margin: "2px auto 0", textAlign: "center", breakInside: "avoid" }}>
      <div style={{ height: "40px", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
        {url && (
          // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL from Supabase Storage
          <img src={url} alt="Signature" style={{ maxHeight: "48px", maxWidth: "170px", marginBottom: "-14px", ...exact }} />
        )}
      </div>
      <div style={{ borderBottom: "1px solid #111", fontWeight: 700, textTransform: "uppercase", minHeight: "16px" }}>{name ?? ""}</div>
      <div style={{ fontSize: "8.5pt", fontWeight: 700 }}>{caption}</div>
      {date && <div style={{ fontSize: "8pt", color: "#444" }}>{signedOn(date)}</div>}
    </div>
  );
}

export type CorrectionFormDocData = Omit<CorrectionForm, "submittedAt"> & { submittedAt: string | null };

export function CorrectionFormDocument({ form, signatures = {} }: { form: CorrectionFormDocData; signatures?: Partial<Record<LeaveFormSigner, string>> }) {
  const row: React.CSSProperties = { margin: "0 0 4px", fontSize: "10pt" };
  const label: React.CSSProperties = { fontWeight: 700 };
  const rule = <hr style={{ border: 0, borderTop: "1px solid #999", margin: "8px 0 6px" }} />;
  const section = (t: string) => <div style={{ textAlign: "center", fontWeight: 700, fontSize: "10.5pt", margin: "0 0 6px" }}>{t}</div>;
  const headDone = !!form.headDecision;
  const received = !!form.receivedAt;

  return (
    <div style={{ fontFamily: "Arial, Helvetica, sans-serif", color: "#111", background: "#fff" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "10px", borderBottom: "2px solid #c2185b", paddingBottom: "4px", marginBottom: "8px" }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- static brand asset */}
        <img src={currentCompany().formLogo} alt="" style={{ height: "44px", width: "auto", maxWidth: "140px", objectFit: "contain" }} />
        <div style={{ fontWeight: 700, fontSize: "11pt" }}>
          {currentCompany().name.toUpperCase()} ({currentCompany().shortName.toUpperCase()})
        </div>
      </div>
      <div style={{ textAlign: "center", fontWeight: 700, fontSize: "12.5pt", margin: "2px 0 8px" }}>{currentCompany().shortName} Attendance Correction Form</div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", columnGap: "16px" }}>
        <p style={row}>
          <span style={label}>Name:</span> {form.employeeName}
        </p>
        <p style={row}>
          <span style={label}>Position:</span> {form.position}
        </p>
        <p style={row}>
          <span style={label}>Branch:</span> {form.branch}
        </p>
        <p style={row}>
          <span style={label}>Department:</span> {form.department}
        </p>
        <p style={row}>
          <span style={label}>Department Head:</span> {form.departmentHead}
        </p>
      </div>

      {rule}
      {section("Correction Details")}
      <p style={row}>
        <span style={label}>Date to be corrected:</span> {longDate(form.correctionDate)}
      </p>
      <p style={{ ...row, marginTop: "6px" }}>
        <span style={label}>Correction needed:</span>
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", columnGap: "16px", paddingLeft: "12px", marginBottom: "4px" }}>
        {CORRECTION_TYPES.map((t) => (
          <div key={t.id} style={{ fontSize: "10pt", margin: "0 0 2px" }}>
            <Box on={form.correctionType === t.id} />
            {t.label}
          </div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", columnGap: "16px" }}>
        <p style={row}>
          <span style={label}>Correct time in:</span> {timeLabel(form.timeIn) || "—"}
        </p>
        <p style={row}>
          <span style={label}>Correct time out:</span> {timeLabel(form.timeOut) || "—"}
        </p>
      </div>
      <p style={row}>
        <span style={label}>Reason / explanation:</span>
      </p>
      <p style={{ ...row, whiteSpace: "pre-wrap", paddingLeft: "12px" }}>{form.reason}</p>
      <Signature url={signatures.applicant} name={form.employeeName} caption="Employee’s signature over printed name" date={form.submittedAt} />

      <BranchApprovalBlock form={form} signature={signatures.branch} />
      {rule}
      {section("Department Head’s Approval")}
      <p style={row}>
        <Box on={form.headDecision === "approved"} />
        <span style={label}>Approved</span>
      </p>
      <p style={row}>
        <Box on={form.headDecision === "disapproved"} />
        <span style={label}>Disapproved</span>
        <span style={{ ...label, marginLeft: "24px" }}>Reason of disapproval:</span> {form.headDecision === "disapproved" ? form.headReason : ""}
      </p>
      <Signature url={headDone ? signatures.head : undefined} name={form.headSignedName} caption="Department Head’s signature over printed name" date={form.headSignedAt} />

      {rule}
      <div style={{ breakInside: "avoid" }}>
        {section("HR Department’s Receipt")}
        <p style={row}>
          <Box on={received} />
          <span style={label}>Received</span>
        </p>
        <Signature url={received ? signatures.hr : undefined} name={form.receivedName} caption="Signature over printed name" date={form.receivedAt} />
      </div>
    </div>
  );
}
