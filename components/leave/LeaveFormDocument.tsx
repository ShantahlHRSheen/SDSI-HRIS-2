import { HEAD_DAY_FIELDS, LEAVE_CATEGORIES, defaultHeadDays, type LeaveForm } from "@/lib/leave-form";
import type { LeaveFormSigner } from "@/lib/supabase/leave-forms";

// The printed / on-screen "APPLICATION FOR LEAVE", laid out like the
// company's Word form. Plain inline styles so it prints the same everywhere.

const line = "1px solid #222";
const exact = { WebkitPrintColorAdjust: "exact", printColorAdjust: "exact" } as const;
const longDate = (d: string) => (d ? new Intl.DateTimeFormat("en-US", { timeZone: "UTC", year: "numeric", month: "long", day: "numeric" }).format(new Date(`${d.slice(0, 10)}T00:00:00Z`)) : "");
const shortDate = (d: string) => (d ? new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" }).format(new Date(`${d.slice(0, 10)}T00:00:00Z`)) : "");
const signedOn = (iso: string | null) => (iso ? new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Manila", month: "short", day: "numeric", year: "numeric" }).format(new Date(iso)) : "");
const num = (n: number | undefined) => (n === undefined || n === null ? "" : Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0$/, ""));

function Box({ on }: { on: boolean }) {
  return <span style={{ fontFamily: "Arial, sans-serif", fontSize: "11pt", marginRight: "4px" }}>{on ? "☑" : "☐"}</span>;
}

function Signature({ url }: { url?: string }) {
  return (
    <div style={{ height: "40px", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      {url && (
        // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL from Supabase Storage
        <img src={url} alt="Signature" style={{ maxHeight: "48px", maxWidth: "170px", marginBottom: "-14px", ...exact }} />
      )}
    </div>
  );
}

export type LeaveFormDocData = Omit<LeaveForm, "submittedAt"> & { submittedAt: string | null; startDate: string; endDate: string; days: number };

export function LeaveFormDocument({ form, signatures = {} }: { form: LeaveFormDocData; signatures?: Partial<Record<LeaveFormSigner, string>> }) {
  const cell: React.CSSProperties = { border: line, padding: "5px 8px", fontSize: "9.5pt", verticalAlign: "top" };
  const head: React.CSSProperties = { ...cell, ...exact, background: "#e8e8e8", fontWeight: 700, textAlign: "center", letterSpacing: "0.5px" };
  const label: React.CSSProperties = { fontWeight: 700 };
  const cat = (id: string) => form.category === id;
  const sick = form.category === "sick_with_pay" || form.category === "sick_without_pay";
  const c = form.credits;
  const headDays = form.headDays ?? defaultHeadDays(form.category, form.days);
  const decided = !!form.headDecision;
  const dates = form.startDate === form.endDate ? longDate(form.startDate) : `${shortDate(form.startDate)} – ${shortDate(form.endDate)}`;

  return (
    <div style={{ fontFamily: "Arial, Helvetica, sans-serif", color: "#111", fontSize: "9.5pt", background: "#fff" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "10px", borderBottom: "2px solid #c2185b", paddingBottom: "6px", marginBottom: "10px" }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- static brand asset */}
        <img src="/brand/shantahl-logo.png" alt="" style={{ height: "46px", width: "46px", objectFit: "contain" }} />
        <div style={{ fontWeight: 700, fontSize: "12pt" }}>SHANTAHL DIRECT SALES, INC. (SDSI)</div>
      </div>
      <div style={{ textAlign: "center", fontWeight: 700, fontSize: "13pt", letterSpacing: "1px", margin: "4px 0 10px" }}>APPLICATION FOR LEAVE</div>

      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <tbody>
          <tr>
            <td style={{ ...cell, width: "55%" }}>
              <span style={label}>NAME OF EMPLOYEE:</span> {form.employeeName}
            </td>
            <td style={cell}>
              <span style={label}>DATE OF APPLICATION:</span> {longDate(form.applicationDate)}
            </td>
          </tr>
          <tr>
            <td style={cell}>
              <span style={label}>DESIGNATION:</span> {form.designation}
            </td>
            <td style={cell}>
              <span style={label}>Branch:</span> {form.branch}
            </td>
          </tr>
          <tr>
            <td style={cell}>
              <span style={label}>Department:</span> {form.department}
            </td>
            <td style={cell}>
              <span style={label}>Department Head:</span> {form.departmentHead}
            </td>
          </tr>
        </tbody>
      </table>

      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "10px" }}>
        <tbody>
          <tr>
            <td style={head} colSpan={2}>
              DETAILS OF APPLICATION
            </td>
          </tr>
          <tr>
            <td style={{ ...cell, width: "45%", lineHeight: 1.9 }}>
              {LEAVE_CATEGORIES.map((k) => (
                <div key={k.id}>
                  <Box on={cat(k.id)} />
                  {k.label}
                </div>
              ))}
            </td>
            <td style={{ ...cell, lineHeight: 1.6 }}>
              <div style={label}>In Case of sick leave</div>
              <div>
                <Box on={sick && form.sickPlace === "hospital"} />
                In Hospital (Specify): <span style={{ borderBottom: "1px solid #555" }}>{sick && form.sickPlace === "hospital" ? form.sickDetails : ""}</span>
              </div>
              <div>
                <Box on={sick && form.sickPlace === "out_patient"} />
                Out Patient{sick && form.sickPlace === "out_patient" && form.sickDetails ? `: ${form.sickDetails}` : ""}
              </div>
              <div style={{ ...label, marginTop: "10px" }}>Reason: (In Case of Vacation/Absent)</div>
              <div style={{ minHeight: "54px", whiteSpace: "pre-wrap" }}>{form.reason}</div>
            </td>
          </tr>
        </tbody>
      </table>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px", marginTop: "18px", alignItems: "end" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ borderBottom: "1px solid #111", paddingBottom: "2px", fontWeight: 700 }}>
            {dates} ({num(form.days)} day{form.days === 1 ? "" : "s"})
          </div>
          <div style={{ fontSize: "8.5pt" }}>(Inclusive Dates)</div>
        </div>
        <div style={{ textAlign: "center" }}>
          <Signature url={signatures.applicant} />
          <div style={{ borderBottom: "1px solid #111", fontWeight: 700, textTransform: "uppercase" }}>{form.employeeName}</div>
          <div style={{ fontSize: "8.5pt" }}>Applicant&rsquo;s Signature above Printed Name</div>
        </div>
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "16px" }}>
        <tbody>
          <tr>
            <td style={head} colSpan={4}>
              CERTIFICATE OF LEAVE CREDITS
            </td>
          </tr>
          <tr>
            <td style={{ ...cell, width: "40%" }}>Balance as of {longDate(c.asOf)}</td>
            <td style={{ ...cell, textAlign: "center", fontWeight: 700 }}>Vacation</td>
            <td style={{ ...cell, textAlign: "center", fontWeight: 700 }}>Sick</td>
            <td style={{ ...cell, width: "1%" }} />
          </tr>
          <tr>
            <td style={cell}>Balance</td>
            <td style={{ ...cell, textAlign: "center" }}>{num(c.vl)}</td>
            <td style={{ ...cell, textAlign: "center" }}>{num(c.sl)}</td>
            <td style={cell} />
          </tr>
          <tr>
            <td style={cell}>Less this application</td>
            <td style={{ ...cell, textAlign: "center" }}>{num(c.lessVl)}</td>
            <td style={{ ...cell, textAlign: "center" }}>{num(c.lessSl)}</td>
            <td style={cell} />
          </tr>
          <tr>
            <td style={{ ...cell, fontWeight: 700 }}>Net Balance</td>
            <td style={{ ...cell, textAlign: "center", fontWeight: 700 }}>{num(Math.round((c.vl - c.lessVl) * 100) / 100)}</td>
            <td style={{ ...cell, textAlign: "center", fontWeight: 700 }}>{num(Math.round((c.sl - c.lessSl) * 100) / 100)}</td>
            <td style={cell} />
          </tr>
        </tbody>
      </table>

      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "16px", breakInside: "avoid" }}>
        <tbody>
          <tr>
            <td style={head} colSpan={2}>
              DEPARTMENT HEAD&rsquo;S APPROVAL
            </td>
          </tr>
          <tr>
            <td style={{ ...cell, width: "45%", lineHeight: 1.9 }}>
              {HEAD_DAY_FIELDS.map((f) => (
                <div key={f.id}>
                  <span style={{ display: "inline-block", minWidth: "34px", borderBottom: "1px solid #555", textAlign: "center", marginRight: "6px" }}>{decided ? num(headDays[f.id]) : ""}</span>
                  {f.label}
                </div>
              ))}
            </td>
            <td style={{ ...cell, lineHeight: 1.7 }}>
              <div>
                <Box on={form.headDecision === "approved"} />
                Approved
              </div>
              <div>
                <Box on={form.headDecision === "disapproved"} />
                Disapproved due to: <span style={{ borderBottom: "1px solid #555" }}>{form.headDecision === "disapproved" ? form.headReason : ""}</span>
              </div>
              {form.headDecision === "approved" && form.headReason && <div style={{ color: "#333" }}>Remarks: {form.headReason}</div>}
              <div style={{ marginTop: "12px" }}>Approved by:</div>
              <div style={{ textAlign: "center" }}>
                <Signature url={signatures.head} />
                <div style={{ borderBottom: "1px solid #111", fontWeight: 700, textTransform: "uppercase", minHeight: "16px" }}>{form.headSignedName ?? ""}</div>
                <div style={{ fontSize: "8.5pt" }}>(Signature over printed name)</div>
                <div style={{ fontSize: "8.5pt" }}>Department Manager{form.headSignedAt ? ` · ${signedOn(form.headSignedAt)}` : ""}</div>
              </div>
            </td>
          </tr>
        </tbody>
      </table>

      <div style={{ marginTop: "20px", width: "260px", breakInside: "avoid" }}>
        <div>Received by:</div>
        <div style={{ textAlign: "center" }}>
          <Signature url={signatures.hr} />
          <div style={{ borderBottom: "1px solid #111", fontWeight: 700, textTransform: "uppercase", minHeight: "16px" }}>{form.receivedName ?? ""}</div>
          <div style={{ fontSize: "8.5pt" }}>HR Manager{form.receivedAt ? ` · ${signedOn(form.receivedAt)}` : ""}</div>
        </div>
      </div>
    </div>
  );
}
