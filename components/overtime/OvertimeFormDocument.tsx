import type { OvertimeForm } from "@/lib/overtime-form";
import type { LeaveFormSigner } from "@/lib/supabase/leave-forms";

// The printed / on-screen "SDSI Overtime Authorization Form", laid out like
// the company's form. Plain inline styles so it prints the same everywhere.

const exact = { WebkitPrintColorAdjust: "exact", printColorAdjust: "exact" } as const;
const longDate = (d: string) => (d ? new Intl.DateTimeFormat("en-US", { timeZone: "UTC", year: "numeric", month: "long", day: "numeric", weekday: "long" }).format(new Date(`${d.slice(0, 10)}T00:00:00Z`)) : "");
const signedOn = (iso: string | null) => (iso ? new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Manila", month: "short", day: "numeric", year: "numeric" }).format(new Date(iso)) : "");
const hours = (n: number | null | undefined) => (n === null || n === undefined ? "" : `${Number.isInteger(n) ? n : n.toFixed(2).replace(/0$/, "")} hour${n === 1 ? "" : "s"}`);

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

export type OvertimeFormDocData = Omit<OvertimeForm, "submittedAt"> & { submittedAt: string | null };

export function OvertimeFormDocument({ form, signatures = {} }: { form: OvertimeFormDocData; signatures?: Partial<Record<LeaveFormSigner, string>> }) {
  const row: React.CSSProperties = { margin: "0 0 4px", fontSize: "10pt" };
  const label: React.CSSProperties = { fontWeight: 700 };
  const rule = <hr style={{ border: 0, borderTop: "1px solid #999", margin: "8px 0 6px" }} />;
  const section = (t: string) => <div style={{ textAlign: "center", fontWeight: 700, fontSize: "10.5pt", margin: "0 0 6px" }}>{t}</div>;
  const headDone = !!form.headDecision;
  const hrDone = !!form.hrDecision;

  return (
    <div style={{ fontFamily: "Arial, Helvetica, sans-serif", color: "#111", background: "#fff" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "10px", borderBottom: "2px solid #c2185b", paddingBottom: "4px", marginBottom: "8px" }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- static brand asset */}
        <img src="/brand/shantahl-form-logo.png" alt="" style={{ height: "44px", width: "44px", objectFit: "contain" }} />
        <div style={{ fontWeight: 700, fontSize: "11pt" }}>SHANTAHL DIRECT SALES, INC. (SDSI)</div>
      </div>
      <div style={{ textAlign: "center", fontWeight: 700, fontSize: "12.5pt", margin: "2px 0 8px" }}>SDSI Overtime Authorization Form</div>

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
      <p style={row}>
        <span style={label}>Regular working schedule:</span> {form.schedule}
      </p>

      {rule}
      {section("Overtime Details")}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", columnGap: "16px" }}>
        <p style={row}>
          <span style={label}>Date of overtime:</span> {longDate(form.otDate)}
        </p>
        <p style={row}>
          <span style={label}>Number of OT hours requested:</span> {hours(form.hoursRequested)}
        </p>
      </div>
      <p style={row}>
        <span style={label}>Tasks to be done:</span>
      </p>
      <p style={{ ...row, whiteSpace: "pre-wrap", paddingLeft: "12px" }}>{form.tasks}</p>
      <p style={row}>
        <span style={label}>Reason why these tasks can&rsquo;t be done during regular working schedule:</span>
      </p>
      <p style={{ ...row, whiteSpace: "pre-wrap", paddingLeft: "12px" }}>{form.reason}</p>
      <Signature url={signatures.applicant} name={form.employeeName} caption="Employee’s signature over printed name" date={form.submittedAt} />

      {rule}
      {section("Department Head’s Approval")}
      <p style={row}>
        <Box on={form.headDecision === "approved"} />
        <span style={label}>Approved</span>
        <span style={{ ...label, marginLeft: "24px" }}>Approved overtime hours:</span> {form.headDecision === "approved" ? hours(form.headHours) : ""}
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
        <p style={{ ...row, marginBottom: "4px" }}>
          <Box on={form.hrDecision === "verified"} />
          <span style={label}>Verified</span>
        </p>
        <p style={row}>
          <Box on={form.hrDecision === "disapproved"} />
          <span style={label}>Disapproved</span>
          <span style={{ ...label, marginLeft: "24px" }}>Reason:</span> <span style={{ borderBottom: "1px solid #555", display: "inline-block", minWidth: "260px" }}>{form.hrDecision === "disapproved" ? form.hrReason : ""}</span>
        </p>
        <p style={row}>
          <Box on={form.hrDecision === "returned"} />
          <span style={label}>Returned for clarification</span>
          <span style={{ ...label, marginLeft: "24px" }}>Reason:</span> <span style={{ borderBottom: "1px solid #555", display: "inline-block", minWidth: "200px" }}>{form.hrDecision === "returned" ? form.hrReason : ""}</span>
        </p>
        <Signature url={hrDone ? signatures.hr : undefined} name={form.hrSignedName} caption="Signature over printed name" date={form.hrSignedAt} />
      </div>
    </div>
  );
}
