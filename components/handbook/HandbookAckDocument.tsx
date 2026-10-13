import { currentCompany } from "@/lib/companies";
import type { HandbookAck } from "@/lib/supabase/handbook-acks";

// The printed / on-screen "Employee Handbook Acknowledgment Form", worded
// like the company's form. Plain inline styles so it prints the same
// everywhere. `page` picks one of its two pages (for the PDF); without it
// both are shown one after the other.

const line = "1px solid #333";
const exact = { WebkitPrintColorAdjust: "exact", printColorAdjust: "exact" } as const;
const longDate = (d: string | null) => (d ? new Intl.DateTimeFormat("en-US", { timeZone: "UTC", year: "numeric", month: "long", day: "numeric" }).format(new Date(`${d.slice(0, 10)}T00:00:00Z`)) : "");
const manilaDate = (iso: string | null) => (iso ? new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Manila", year: "numeric", month: "long", day: "numeric" }).format(new Date(iso)) : "");
export const manilaDateTime = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Manila", year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(iso)) : "";

function Blank({ value, width }: { value: string; width: number }) {
  return <span style={{ display: "inline-block", minWidth: `${width}px`, borderBottom: "1px solid #111", textAlign: "center", padding: "0 4px", fontWeight: 600 }}>{value || " "}</span>;
}

function Box({ on }: { on: boolean }) {
  return <span style={{ fontFamily: "Arial, sans-serif", fontSize: "11pt", marginRight: "6px" }}>{on ? "☑" : "☐"}</span>;
}

function Sig({ url }: { url?: string }) {
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL from Supabase Storage
    <img src={url} alt="Signature" style={{ maxHeight: "40px", maxWidth: "170px", display: "block", ...exact }} />
  ) : null;
}

export function HandbookAckDocument({ ack, signatures = {}, page }: { ack: HandbookAck; signatures?: { employee?: string; hr?: string }; page?: 1 | 2 }) {
  const co = currentCompany();
  const handbook = `${co.shortName} Employee Handbook`;
  const cell: React.CSSProperties = { border: line, padding: "6px 8px", fontSize: "9.5pt", verticalAlign: "middle" };
  const th: React.CSSProperties = { ...cell, ...exact, background: "#eeeeee", fontWeight: 700, textAlign: "left" };
  const h2: React.CSSProperties = { fontSize: "11pt", fontWeight: 700, margin: "14px 0 6px" };
  const item: React.CSSProperties = { margin: "0 0 6px", lineHeight: 1.45 };
  const received = !!ack.receivedAt;

  const items1 = (
    <>
      <li style={item}>
        <b>Access to the HRIS.</b> I have been given my own access to the {co.shortName} Human Resources Information System (HRIS). I will keep my login credentials confidential.
      </li>
      <li style={item}>
        <b>Receipt of the Handbook.</b> I understand that the Company distributes the Employee Handbook through the HRIS. I have accessed and downloaded a copy of the version stated above on the date
        indicated below.
      </li>
      <li style={item}>
        <b>Read and understood.</b> I have read the Handbook, including the Code of Conduct, the list of offenses, and the corresponding disciplinary penalties. I was given the opportunity to ask
        Human Resources about any policy I did not understand, and my questions were answered.
      </li>
      <li style={item}>
        <b>Language.</b> (Check one)
        <div style={{ margin: "4px 0 0 8px" }}>
          <div>
            <Box on={ack.language === "english"} />I read and understand English, the language in which the Handbook is written.
          </div>
          <div>
            <Box on={ack.language === "explained"} />
            The contents of the Handbook were explained to me by Human Resources in <Blank value={ack.explainedLanguage} width={120} />, a language I understand.
          </div>
        </div>
      </li>
      <li style={item}>
        <b>Agreement to comply.</b> I agree to comply with the policies, rules, procedures, and standards in the Handbook. I understand that violations may result in disciplinary action, up to and
        including termination of employment, subject to due process and applicable law.
      </li>
      <li style={item}>
        <b>Amendments.</b> I understand that the Company may revise or add policies. Revisions will be posted on the HRIS and announced through official Company channels. I am responsible for
        reviewing them, and I may be asked to sign a new acknowledgment.
      </li>
    </>
  );
  const items2 = (
    <>
      <li style={item}>
        <b>Applicable law.</b> I understand that the Handbook is applied in accordance with the Labor Code of the Philippines and other applicable laws. If a Handbook provision conflicts with the
        law, the law prevails.
      </li>
      <li style={item}>
        <b>Data privacy.</b> I understand that the Company will keep this form in my 201 file and may keep records of my HRIS access and download activity. These records will be used for HR
        administration and as proof of policy dissemination, in accordance with the Data Privacy Act of 2012 (RA 10173).
      </li>
      <li style={item}>
        <b>Voluntary signing.</b> I am signing this form voluntarily and after having had sufficient time to review the Handbook.
      </li>
    </>
  );

  const pageOne = (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: "10px", borderBottom: "2px solid #c2185b", paddingBottom: "4px", marginBottom: "10px" }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- static brand asset */}
        <img src={co.formLogo} alt="" style={{ height: "44px", width: "auto", maxWidth: "150px", objectFit: "contain" }} />
        <div style={{ fontWeight: 700, fontSize: "11pt" }}>{co.name}</div>
      </div>
      <div style={{ textAlign: "center", fontWeight: 700, fontSize: "14pt", margin: "4px 0 2px" }}>{handbook} Acknowledgment Form</div>
      <div style={{ textAlign: "center", fontSize: "9.5pt", marginBottom: "12px" }}>HRIS Employee Handbook Receipt, Understanding, and Acknowledgment Form</div>
      <p style={{ margin: "0 0 8px", lineHeight: 1.6 }}>
        Handbook covered: {handbook}, Version <Blank value={ack.handbookVersion} width={50} />, effective <Blank value={longDate(ack.handbookEffective)} width={130} />
      </p>
      <p style={{ margin: "0 0 4px", lineHeight: 1.6 }}>
        I, <Blank value={ack.employeeName} width={240} />, an employee of {co.name} (&ldquo;{co.shortName}&rdquo; or the &ldquo;Company&rdquo;), acknowledge and declare the following:
      </p>
      <div style={h2}>Acknowledgments</div>
      <ol style={{ margin: 0, paddingLeft: "22px" }}>{items1}</ol>
    </div>
  );

  const row = (label: string, value: React.ReactNode) => (
    <tr>
      <td style={{ ...cell, width: "45%" }}>{label}</td>
      <td style={cell}>{value}</td>
    </tr>
  );
  const pageTwo = (
    <div>
      <ol start={7} style={{ margin: 0, paddingLeft: "22px" }}>
        {items2}
      </ol>
      <div style={h2}>Employee Information and Signature</div>
      <p style={{ margin: "0 0 8px", lineHeight: 1.45 }}>
        By signing below, I confirm that I have received access to the {co.shortName} HRIS, downloaded a copy of the {handbook}, and read and understood its contents as stated above.
      </p>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={th}>Field</th>
            <th style={th}>Entry</th>
          </tr>
        </thead>
        <tbody>
          {row("Employee name (printed)", ack.employeeName)}
          {row("Employee ID no.", ack.employeeNumber)}
          {row("Position", ack.position)}
          {row("Department / Branch", ack.departmentBranch)}
          {row("Date of HRIS access / download", manilaDate(ack.accessedAt))}
          {row("Employee signature", <div style={{ minHeight: "40px", display: "flex", alignItems: "center" }}><Sig url={signatures.employee} /></div>)}
          {row("Date signed", manilaDate(ack.signedAt))}
        </tbody>
      </table>
      <div style={h2}>For Human Resources Use</div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={th}>Field</th>
            <th style={th}>Entry</th>
          </tr>
        </thead>
        <tbody>
          {row("HRIS download record verified (Yes / No)", received ? (ack.hrVerified ? "Yes" : "No") : "")}
          {row("HRIS log reference or date-time stamp", received ? (ack.hrLogRef ?? "") : "")}
          {row(
            "Received and verified by (name and signature)",
            received ? (
              <div style={{ display: "flex", alignItems: "center", gap: "12px", minHeight: "40px" }}>
                <span>{ack.receivedName}</span>
                <Sig url={signatures.hr} />
              </div>
            ) : (
              <div style={{ minHeight: "40px" }} />
            ),
          )}
          {row("Position", received ? (ack.receivedPosition ?? "") : "")}
          {row("Date received", received ? manilaDate(ack.receivedAt) : "")}
        </tbody>
      </table>
      <p style={{ marginTop: "12px", fontSize: "8.5pt" }}>Original: Employee 201 file. Copy: Employee.</p>
    </div>
  );

  return (
    <div style={{ fontFamily: "Arial, Helvetica, sans-serif", color: "#111", fontSize: "9.5pt", background: "#fff" }}>
      {page !== 2 && pageOne}
      {!page && <div style={{ height: "14px" }} />}
      {page !== 1 && pageTwo}
    </div>
  );
}
