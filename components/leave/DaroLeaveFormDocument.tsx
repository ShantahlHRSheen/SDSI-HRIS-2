import { useHris } from "@/lib/store";
import { isSickCategory, type LeaveCategory } from "@/lib/leave-form";
import type { LeaveFormSigner } from "@/lib/supabase/leave-forms";
import type { LeaveFormDocData } from "./LeaveFormDocument";

// Daro Lending Corp.'s "Employee's Leave Application Form", laid out like
// its Word form (lib/companies.ts leaveFormLayout). Same data as the
// standard form: the Supervisor's approval is the department head step (the
// employee's supervisor), the Branch Head's is the branch approver step, and
// the Human Resource Certification is HR receiving it, with HR's
// recommendation. Plain inline styles so it prints the same everywhere.

const line = "1px solid #111";
const exact = { WebkitPrintColorAdjust: "exact", printColorAdjust: "exact" } as const;
const longDate = (d: string | null | undefined) => (d ? new Intl.DateTimeFormat("en-US", { timeZone: "UTC", year: "numeric", month: "long", day: "numeric" }).format(new Date(`${d.slice(0, 10)}T00:00:00Z`)) : "");
const shortDate = (d: string) => (d ? new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" }).format(new Date(`${d.slice(0, 10)}T00:00:00Z`)) : "");
const signedOn = (iso: string | null) => (iso ? new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Manila", month: "short", day: "numeric", year: "numeric" }).format(new Date(iso)) : "");
const num = (n: number | undefined) => (n === undefined || n === null ? "" : Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0$/, ""));

function Box({ on }: { on: boolean }) {
  return <span style={{ fontFamily: "Arial, sans-serif", fontSize: "11pt", marginRight: "4px" }}>{on ? "☑" : "☐"}</span>;
}

function Signature({ url }: { url?: string }) {
  return (
    <div style={{ height: "36px", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      {url && (
        // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL from Supabase Storage
        <img src={url} alt="Signature" style={{ maxHeight: "44px", maxWidth: "170px", marginBottom: "-12px", ...exact }} />
      )}
    </div>
  );
}

// Full years and months from the hire date to the application date.
function service(from: string | null | undefined, to: string): { years: number; months: number } | null {
  if (!from || !to) return null;
  const [fy, fm, fd] = from.slice(0, 10).split("-").map(Number);
  const [ty, tm, td] = to.slice(0, 10).split("-").map(Number);
  let months = (ty - fy) * 12 + (tm - fm) - (td < fd ? 1 : 0);
  if (months < 0) months = 0;
  return { years: Math.floor(months / 12), months: months % 12 };
}

const VACATION: LeaveCategory[] = ["vacation_with_pay", "vacation_without_pay"];

export function DaroLeaveFormDocument({ form, signatures = {} }: { form: LeaveFormDocData; signatures?: Partial<Record<LeaveFormSigner, string>> }) {
  const { employees } = useHris();
  const employee = employees.find((e) => e.id === form.employeeId);
  const cell: React.CSSProperties = { border: line, padding: "5px 8px", fontSize: "9.5pt", verticalAlign: "top" };
  const bar: React.CSSProperties = { ...exact, background: "#000", color: "#fff", fontWeight: 700, textAlign: "center", padding: "5px 8px", fontSize: "9.5pt", letterSpacing: "0.3px" };
  const underline: React.CSSProperties = { borderBottom: "1px solid #333", display: "inline-block", minWidth: "60px", padding: "0 4px" };
  const sick = isSickCategory(form.category);
  const vacationLike = VACATION.includes(form.category) || form.category === "absent_without_pay";
  const dates = !form.startDate ? "" : form.startDate === form.endDate ? longDate(form.startDate) : `${shortDate(form.startDate)} – ${shortDate(form.endDate)}`;
  const c = form.credits;
  const tenure = service(employee?.dateHired, form.applicationDate);
  const status = employee?.employmentStatus;

  const approval = (title: string, decision: "approved" | "disapproved" | null, reason: string | null, name: string | null, at: string | null, sig?: string) => (
    <td style={{ ...cell, width: "50%", padding: 0 }}>
      <div style={bar}>{title}</div>
      <div style={{ padding: "8px", minHeight: "120px", display: "flex", flexDirection: "column" }}>
        <div>
          Recommendation:
          <span style={{ marginLeft: "18px" }}>
            <Box on={decision === "approved"} />
            Approved
          </span>
          <span style={{ marginLeft: "14px" }}>
            <Box on={decision === "disapproved"} />
            Disapproved
          </span>
        </div>
        {reason && <div style={{ marginTop: "4px", color: "#333" }}>{decision === "disapproved" ? "Due to: " : "Remarks: "}{reason}</div>}
        <div style={{ marginTop: "auto", display: "grid", gridTemplateColumns: "2fr 1fr", gap: "12px", alignItems: "end" }}>
          <div style={{ textAlign: "center" }}>
            <Signature url={sig} />
            <div style={{ borderBottom: "1px solid #111", fontWeight: 700, textTransform: "uppercase", minHeight: "16px" }}>{name ?? ""}</div>
            <div style={{ fontSize: "8.5pt" }}>Name &amp; Signature of {title.startsWith("SUPERVISOR") ? "Supervisor" : "Branch Head"}</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ borderBottom: "1px solid #111", minHeight: "16px" }}>{signedOn(at)}</div>
            <div style={{ fontSize: "8.5pt" }}>Date</div>
          </div>
        </div>
      </div>
    </td>
  );

  return (
    <div style={{ fontFamily: "Calibri, Carlito, Arial, Helvetica, sans-serif", color: "#111", fontSize: "9.5pt", background: "#fff" }}>
      <div style={{ fontWeight: 700, fontSize: "15pt", marginBottom: "8px" }}>Employee&rsquo;s Leave Application Form</div>
      <div style={{ fontWeight: 700, fontSize: "10.5pt" }}>DARO Lending Corporation</div>
      <div style={{ marginBottom: "8px" }}>
        Branch: <span style={{ ...underline, minWidth: "200px" }}>{form.branch}</span>
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <tbody>
          <tr>
            <td style={bar} colSpan={2}>APPLICANT INFORMATION</td>
          </tr>
          <tr>
            <td style={{ ...cell, width: "65%", height: "36px" }}>
              Employee Name: <strong>{form.employeeName}</strong>
            </td>
            <td style={cell}>
              Position: <strong>{form.designation}</strong>
            </td>
          </tr>
          <tr>
            <td style={{ ...cell, height: "36px" }}>Present Address: {employee?.address ?? ""}</td>
            <td style={cell}>Contact No.: {employee?.contactNumber ?? ""}</td>
          </tr>
        </tbody>
      </table>

      <div style={{ ...bar, marginTop: "10px" }}>LEAVE GUIDELINES</div>
      <div style={{ fontSize: "8.5pt", fontStyle: "italic", padding: "6px 0 2px" }}>
        <div style={{ fontWeight: 700 }}>Vacation Leave/Absent</div>
        <ul style={{ margin: "2px 0 4px 20px", padding: 0, listStyleType: "disc" }}>
          <li>Application for vacation leaves must be filed and approved by the immediate supervisor and Branch Head, at least two weeks before undertaking such leave of absence.</li>
        </ul>
        <div style={{ fontWeight: 700 }}>Sick Leave</div>
        <ul style={{ margin: "2px 0 0 20px", padding: 0, listStyleType: "disc" }}>
          <li>
            Employee or his/her representative must notify immediately on or before 12:00 noon of the day of absence or first day of absence either by phone or email the concerned Department/Branch Head. Upon reporting back to work, the employee should file an application for sick leave with a Medical certificate.
          </li>
        </ul>
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "8px" }}>
        <tbody>
          <tr>
            <td style={bar} colSpan={2}>DETAILS OF APPLICATION</td>
          </tr>
          <tr>
            <td style={{ ...cell, width: "50%", lineHeight: 1.6 }}>
              <div style={{ fontStyle: "italic", margin: "4px 0 6px" }}>Type of Leave</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr" }}>
                <div><Box on={VACATION.includes(form.category)} />Vacation</div>
                <div><Box on={sick} />Sick</div>
                <div><Box on={form.category === "maternity"} />Maternity/Paternity</div>
                <div><Box on={form.category === "absent_without_pay"} />Absent</div>
              </div>
            </td>
            <td style={{ ...cell, lineHeight: 1.6 }}>
              <div>In Case of Vacation Leave/Absent</div>
              <div style={{ marginTop: "4px" }}>
                Reasons: <span style={{ borderBottom: "1px solid #333", whiteSpace: "pre-wrap" }}>{vacationLike ? form.reason : ""}</span>
              </div>
            </td>
          </tr>
          <tr>
            <td style={{ ...cell, padding: 0 }}>
              <div style={{ padding: "5px 8px", borderBottom: line, minHeight: "40px" }}>
                Number of working days applied: <strong>{num(form.days)}</strong>
                {form.unpaidDays ? ` (${num(form.days - form.unpaidDays)} with pay, ${num(form.unpaidDays)} without pay)` : ""}
              </div>
              <div style={{ padding: "5px 8px", minHeight: "40px" }}>
                Inclusive Dates: <strong>{dates}</strong>
              </div>
            </td>
            <td style={{ ...cell, lineHeight: 1.7 }}>
              <div>In Case of Sick Leave:</div>
              <div>
                <Box on={sick && form.sickPlace === "hospital"} />
                In Hospital (Specify) <span style={{ borderBottom: "1px solid #333" }}>{sick && form.sickPlace === "hospital" ? form.sickDetails : ""}</span>
              </div>
              <div>
                <Box on={sick && form.sickPlace === "out_patient"} />
                Out Patient
              </div>
              {sick && !vacationLike && form.reason && <div style={{ color: "#333" }}>Reason: {form.reason}</div>}
            </td>
          </tr>
        </tbody>
      </table>

      <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: "60px", marginTop: "14px", alignItems: "end" }}>
        <div style={{ textAlign: "center" }}>
          <Signature url={signatures.applicant} />
          <div style={{ borderBottom: "1px solid #111", fontWeight: 700, textTransform: "uppercase" }}>{form.employeeName}</div>
          <div style={{ fontSize: "8.5pt" }}>Name and Signature of Applicant</div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ borderBottom: "1px solid #111" }}>{longDate(form.applicationDate)}</div>
          <div style={{ fontSize: "8.5pt" }}>Date of Application</div>
        </div>
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "12px", breakInside: "avoid" }}>
        <tbody>
          <tr>
            {approval("SUPERVISOR’S APPROVAL", form.headDecision, form.headReason, form.headSignedName, form.headSignedAt, signatures.head)}
            {approval("BRANCH HEAD’S APPROVAL", form.branchDecision, form.branchReason, form.branchSignedName, form.branchSignedAt, signatures.branch)}
          </tr>
        </tbody>
      </table>

      <div style={{ breakInside: "avoid", marginTop: "12px" }}>
        <div style={bar}>HUMAN RESOURCE CERTIFICATION</div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <tbody>
            <tr>
              <td style={{ ...cell, width: "33%", textAlign: "center" }}>Employment Information</td>
              <td style={{ ...cell, textAlign: "center" }} colSpan={3}>Certificate of Leave Credits</td>
            </tr>
            <tr>
              <td style={{ ...cell, lineHeight: 1.9 }} rowSpan={4}>
                <div>
                  Status: <Box on={status === "probationary"} />Probationary <Box on={status === "regular"} />Regular
                </div>
                <div>
                  Length of Service: <span style={underline}>{tenure ? `${tenure.years} year${tenure.years === 1 ? "" : "s"}` : ""}</span> (Year/s)
                </div>
                <div>
                  <span style={underline}>{tenure ? `${tenure.months} month${tenure.months === 1 ? "" : "s"}` : ""}</span> (Month/s)
                </div>
                <div>
                  Contract Expiration (if applicable): <span style={underline}>{longDate(employee?.contractEnd)}</span>
                </div>
              </td>
              <td style={{ ...cell, width: "27%" }}>{c.asOf ? `As of ${longDate(c.asOf)}` : ""}</td>
              <td style={{ ...cell, textAlign: "center", fontWeight: 700 }}>Vacation</td>
              <td style={{ ...cell, textAlign: "center", fontWeight: 700 }}>Sick</td>
            </tr>
            <tr>
              <td style={cell}>Balance</td>
              <td style={{ ...cell, textAlign: "center" }}>{num(c.vl)}</td>
              <td style={{ ...cell, textAlign: "center" }}>{num(c.sl)}</td>
            </tr>
            <tr>
              <td style={cell}>Less</td>
              <td style={{ ...cell, textAlign: "center" }}>{num(c.lessVl)}</td>
              <td style={{ ...cell, textAlign: "center" }}>{num(c.lessSl)}</td>
            </tr>
            <tr>
              <td style={{ ...cell, fontWeight: 700 }}>Net Balance</td>
              <td style={{ ...cell, textAlign: "center", fontWeight: 700 }}>{num(Math.round((c.vl - c.lessVl) * 100) / 100)}</td>
              <td style={{ ...cell, textAlign: "center", fontWeight: 700 }}>{num(Math.round((c.sl - c.lessSl) * 100) / 100)}</td>
            </tr>
          </tbody>
        </table>
        <div style={{ marginTop: "10px", lineHeight: 1.7 }}>
          Recommendation:
          <span style={{ marginLeft: "30px" }}>
            <Box on={form.hrDecision === "approved"} />
            Approved
          </span>
          <span style={{ marginLeft: "24px" }}>
            <Box on={form.hrDecision === "disapproved"} />
            Disapproved due to: <span style={{ borderBottom: "1px solid #333", display: "inline-block", minWidth: "260px" }}>{form.hrDecision === "disapproved" ? form.hrReason : ""}</span>
          </span>
          {form.hrDecision === "approved" && form.hrReason && <div style={{ color: "#333" }}>Remarks: {form.hrReason}</div>}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr", gap: "60px", marginTop: "14px", alignItems: "end" }}>
          <div style={{ textAlign: "center" }}>
            <Signature url={signatures.hr} />
            <div style={{ borderBottom: "1px solid #111", fontWeight: 700, textTransform: "uppercase", minHeight: "16px" }}>{form.receivedName ?? ""}</div>
            <div style={{ fontSize: "8.5pt" }}>Name and Signature of HR/Admin</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ borderBottom: "1px solid #111", minHeight: "16px" }}>{signedOn(form.receivedAt)}</div>
            <div style={{ fontSize: "8.5pt" }}>Date Received</div>
          </div>
        </div>
      </div>
    </div>
  );
}
