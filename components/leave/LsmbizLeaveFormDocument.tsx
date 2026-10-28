"use client";

import { currentCompany } from "@/lib/companies";
import { useHris } from "@/lib/store";
import type { LeaveFormSigner } from "@/lib/supabase/leave-forms";
import type { LeaveFormDocData } from "@/components/leave/LeaveFormDocument";

// LSMBiz's "Employee's Leave Application Form" (leaveFormLayout "lsmbiz"),
// laid out like its Word form: applicant information, leave guidelines,
// details of application, supervisor's and branch head's approval, and HR
// certification. The branch approver signs as Supervisor and the department
// head as Branch Head. Plain inline styles so it prints the same everywhere.

const line = "1px solid #111";
const exact = { WebkitPrintColorAdjust: "exact", printColorAdjust: "exact" } as const;
const longDate = (d: string) => (d ? new Intl.DateTimeFormat("en-US", { timeZone: "UTC", year: "numeric", month: "long", day: "numeric" }).format(new Date(`${d.slice(0, 10)}T00:00:00Z`)) : "");
const shortDate = (d: string) => (d ? new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" }).format(new Date(`${d.slice(0, 10)}T00:00:00Z`)) : "");
const signedOn = (iso: string | null) => (iso ? new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Manila", month: "short", day: "numeric", year: "numeric" }).format(new Date(iso)) : "");
const num = (n: number | undefined) => (n === undefined || n === null ? "" : Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0$/, ""));

// Whole years and months from the date hired to the application date.
function service(hired: string | null, asOf: string): { years: number; months: number } | null {
  if (!hired || !asOf) return null;
  const [hy, hm, hd] = hired.slice(0, 10).split("-").map(Number);
  const [ay, am, ad] = asOf.slice(0, 10).split("-").map(Number);
  let months = (ay - hy) * 12 + (am - hm) - (ad < hd ? 1 : 0);
  if (months < 0) months = 0;
  return { years: Math.floor(months / 12), months: months % 12 };
}

function Box({ on }: { on: boolean }) {
  return <span style={{ fontFamily: "Arial, sans-serif", fontSize: "11pt", marginRight: "4px" }}>{on ? "☑" : "☐"}</span>;
}

function Signature({ url }: { url?: string }) {
  return (
    <div style={{ height: "34px", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      {url && (
        // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL from Supabase Storage
        <img src={url} alt="Signature" style={{ maxHeight: "44px", maxWidth: "170px", marginBottom: "-12px", ...exact }} />
      )}
    </div>
  );
}

// A filled-in blank: the value on an underline.
function Blank({ children, width }: { children?: React.ReactNode; width?: string }) {
  return <span style={{ display: "inline-block", minWidth: width ?? "90px", borderBottom: "1px solid #444", padding: "0 4px", fontWeight: 700 }}>{children || " "}</span>;
}

// Name / signature over a line, with its caption below.
function SignLine({ url, name, caption, width = "100%" }: { url?: string; name?: string | null; caption: string; width?: string }) {
  return (
    <div style={{ textAlign: "center", width }}>
      <Signature url={url} />
      <div style={{ borderBottom: "1px solid #111", fontWeight: 700, textTransform: "uppercase", minHeight: "16px" }}>{name ?? ""}</div>
      <div style={{ fontSize: "8.5pt", marginTop: "2px" }}>{caption}</div>
    </div>
  );
}

function DateLine({ value, caption }: { value: string; caption: string }) {
  return (
    <div style={{ textAlign: "center", width: "150px" }}>
      <div style={{ borderBottom: "1px solid #111", minHeight: "16px", fontWeight: 700 }}>{value}</div>
      <div style={{ fontSize: "8.5pt", marginTop: "2px" }}>{caption}</div>
    </div>
  );
}

export function LsmbizLeaveFormDocument({ form, signatures = {} }: { form: LeaveFormDocData; signatures?: Partial<Record<LeaveFormSigner, string>> }) {
  const { employees, currentEmployee } = useHris();
  const emp = employees.find((e) => e.id === form.employeeId) ?? (currentEmployee?.id === form.employeeId ? currentEmployee : undefined);

  const cell: React.CSSProperties = { border: line, padding: "4px 8px", fontSize: "9.5pt", verticalAlign: "top" };
  const head: React.CSSProperties = { ...cell, ...exact, background: "#000", color: "#fff", fontWeight: 700, textAlign: "center", letterSpacing: "0.5px" };
  const sub: React.CSSProperties = { ...cell, textAlign: "center" };
  const c = form.credits;
  const cat = form.category;
  const sick = cat === "sick_with_pay" || cat === "sick_without_pay";
  const vacation = cat === "vacation_with_pay" || cat === "vacation_without_pay";
  const bereavement = cat === "bereavement_with_pay" || cat === "bereavement_without_pay";
  const approverTitle = (form.departmentHeadId ? currentCompany().approverTitles?.[form.departmentHeadId] : undefined) ?? "Branch Head";
  const dates = form.startDate === form.endDate ? longDate(form.startDate) : `${shortDate(form.startDate)} – ${shortDate(form.endDate)}`;
  const withoutPay = cat === "vacation_without_pay" || cat === "sick_without_pay" || cat === "bereavement_without_pay" || cat === "absent_without_pay";
  const paid = form.days - (form.unpaidDays ?? 0);
  const payNote = form.unpaidDays ? `${num(paid)} with pay, ${num(form.unpaidDays)} without pay` : withoutPay ? "without pay" : "with pay";
  const yrs = service(emp?.dateHired ?? null, form.applicationDate);
  const branchDecided = !!form.branchDecision;
  const hrDecision = form.receivedAt ? form.headDecision : null;
  const reasonLines = !sick ? form.reason : "";

  return (
    <div style={{ fontFamily: "Arial, Helvetica, sans-serif", color: "#111", fontSize: "9.5pt", background: "#fff" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "10px" }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: "15pt", marginBottom: "6px" }}>Employee&rsquo;s Leave Application Form</div>
          <div style={{ fontWeight: 700, fontSize: "10.5pt" }}>{currentCompany().name}</div>
          <div style={{ marginTop: "2px" }}>
            Branch: <Blank width="200px">{form.branch}</Blank>
          </div>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element -- static brand asset */}
        <img src={currentCompany().formLogo} alt="" style={{ height: "44px", width: "auto", maxWidth: "150px", objectFit: "contain" }} />
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "10px" }}>
        <tbody>
          <tr>
            <td style={head} colSpan={2}>
              APPLICANT INFORMATION
            </td>
          </tr>
          <tr>
            <td style={{ ...cell, width: "68%", height: "34px" }}>
              Employee Name: <b>{form.employeeName}</b>
            </td>
            <td style={cell}>
              Position: <b>{form.designation}</b>
            </td>
          </tr>
          <tr>
            <td style={{ ...cell, height: "34px" }}>
              Present Address: <b>{emp?.address ?? ""}</b>
            </td>
            <td style={cell}>
              Contact No.: <b>{emp?.contactNumber ?? ""}</b>
            </td>
          </tr>
        </tbody>
      </table>

      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "8px" }}>
        <tbody>
          <tr>
            <td style={head}>LEAVE GUIDELINES</td>
          </tr>
        </tbody>
      </table>
      <div style={{ fontStyle: "italic", fontSize: "8.5pt", lineHeight: 1.45, margin: "6px 0 8px" }}>
        <div style={{ fontWeight: 700 }}>Vacation Leave/Absent</div>
        <ul style={{ margin: "0 0 4px", paddingLeft: "22px" }}>
          <li>Application for vacation leaves must be filed and approved by the immediate supervisor and Branch Head, at least two weeks before undertaking such leave of absence.</li>
        </ul>
        <div style={{ fontWeight: 700 }}>Sick Leave</div>
        <ul style={{ margin: 0, paddingLeft: "22px" }}>
          <li>
            Employee or his/her representative must notify immediately on or before 12:00 noon of the day of absence or first day of absence either by phone or email the concerned Department/Branch Head. Upon reporting back to work, the employee should file an application for sick leave with a Medical certificate.
          </li>
        </ul>
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <tbody>
          <tr>
            <td style={head} colSpan={2}>
              DETAILS OF APPLICATION
            </td>
          </tr>
          <tr>
            <td style={{ ...cell, width: "50%", lineHeight: 1.6 }}>
              <div style={{ fontStyle: "italic", marginBottom: "2px" }}>Type of Leave</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr" }}>
                <div>
                  <Box on={vacation} />
                  Vacation
                </div>
                <div>
                  <Box on={sick} />
                  Sick
                </div>
                <div>
                  <Box on={cat === "maternity"} />
                  Maternity/Paternity
                </div>
                <div>
                  <Box on={cat === "absent_without_pay"} />
                  Absent
                </div>
                {bereavement && (
                  <div style={{ gridColumn: "1 / -1" }}>
                    <Box on />
                    Others: <Blank>Bereavement</Blank>
                  </div>
                )}
              </div>
            </td>
            <td style={{ ...cell, lineHeight: 1.6 }}>
              <div>In Case of Vacation Leave/Absent</div>
              <div style={{ display: "flex", gap: "4px" }}>
                <span>Reasons:</span>
                <span style={{ flex: 1, borderBottom: "1px solid #444", minHeight: "16px", whiteSpace: "pre-wrap", fontWeight: 700 }}>{reasonLines}</span>
              </div>
              {!reasonLines && <div style={{ borderBottom: "1px solid #444", height: "16px" }} />}
            </td>
          </tr>
          <tr>
            <td style={{ ...cell, height: "34px" }}>
              Number of working days applied: <b>{num(form.days)}</b> <span style={{ fontSize: "8.5pt" }}>({payNote})</span>
            </td>
            <td style={{ ...cell, lineHeight: 1.6 }} rowSpan={2}>
              <div>In Case of Sick Leave:</div>
              <div style={{ display: "flex", gap: "4px" }}>
                <span>
                  <Box on={sick && form.sickPlace === "hospital"} />
                  In Hospital (Specify)
                </span>
                <span style={{ flex: 1, borderBottom: "1px solid #444", minHeight: "16px", fontWeight: 700 }}>{sick && form.sickPlace === "hospital" ? form.sickDetails : ""}</span>
              </div>
              <div>
                <Box on={sick && form.sickPlace === "out_patient"} />
                Out Patient{sick && form.sickPlace === "out_patient" && form.sickDetails ? <b>: {form.sickDetails}</b> : ""}
              </div>
            </td>
          </tr>
          <tr>
            <td style={{ ...cell, height: "34px" }}>
              Inclusive Dates: <b>{dates}</b>
            </td>
          </tr>
        </tbody>
      </table>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginTop: "8px", breakInside: "avoid" }}>
        <SignLine url={signatures.applicant} name={form.employeeName} caption="Name and Signature of Applicant" width="260px" />
        <DateLine value={longDate(form.applicationDate)} caption="Date of Application" />
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "10px", breakInside: "avoid" }}>
        <tbody>
          <tr>
            <td style={{ ...head, width: "50%" }}>SUPERVISOR&rsquo;S APPROVAL</td>
            <td style={head}>{approverTitle.toUpperCase()}&rsquo;S APPROVAL</td>
          </tr>
          <tr>
            <td style={cell}>
              <div style={{ display: "flex", gap: "16px" }}>
                <span>Recommendation:</span>
                <span>
                  <Box on={form.branchDecision === "approved"} />
                  Approved
                </span>
                <span>
                  <Box on={form.branchDecision === "disapproved"} />
                  Disapproved
                </span>
              </div>
              {form.branchDecision === "disapproved" && form.branchReason && <div style={{ fontSize: "8.5pt" }}>Due to: {form.branchReason}</div>}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: "10px", marginTop: "4px" }}>
                <SignLine url={branchDecided ? signatures.branch : undefined} name={form.branchSignedName ?? (form.branchApproverId ? form.branchApprover : "")} caption="Name & Signature of Supervisor" width="62%" />
                <DateLine value={signedOn(form.branchSignedAt)} caption="Date" />
              </div>
            </td>
            <td style={cell}>
              <div style={{ display: "flex", gap: "16px" }}>
                <span>Recommendation:</span>
                <span>
                  <Box on={form.headDecision === "approved"} />
                  Approved
                </span>
                <span>
                  <Box on={form.headDecision === "disapproved"} />
                  Disapproved
                </span>
              </div>
              {form.headReason && <div style={{ fontSize: "8.5pt" }}>{form.headDecision === "disapproved" ? "Due to" : "Remarks"}: {form.headReason}</div>}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: "10px", marginTop: "4px" }}>
                <SignLine url={signatures.head} name={form.headSignedName} caption={`Name & Signature of ${approverTitle}`} width="62%" />
                <DateLine value={signedOn(form.headSignedAt)} caption="Date" />
              </div>
            </td>
          </tr>
        </tbody>
      </table>

      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "10px", breakInside: "avoid" }}>
        <tbody>
          <tr>
            <td style={head} colSpan={4}>
              HUMAN RESOURCE CERTIFICATION
            </td>
          </tr>
          <tr>
            <td style={{ ...sub, width: "50%" }}>Employment Information</td>
            <td style={sub} colSpan={3}>
              Certificate of Leave Credits
            </td>
          </tr>
          <tr>
            <td style={{ ...cell, lineHeight: 1.8 }} rowSpan={4}>
              <div>
                Status: <Box on={emp?.employmentStatus === "probationary"} />
                Probationary <Box on={emp?.employmentStatus === "regular"} />
                Regular
              </div>
              <div>
                Length of Service: <Blank width="34px">{yrs ? String(yrs.years) : ""}</Blank> (Year/s) <Blank width="34px">{yrs ? String(yrs.months) : ""}</Blank> (Month/s)
              </div>
              <div>
                Contract Expiration (if applicable): <Blank>{emp?.contractEnd ? longDate(emp.contractEnd) : ""}</Blank>
              </div>
            </td>
            <td style={{ ...cell, fontSize: "8.5pt" }}>As of {shortDate(c.asOf)}</td>
            <td style={{ ...sub, fontWeight: 700 }}>Vacation</td>
            <td style={{ ...sub, fontWeight: 700 }}>Sick</td>
          </tr>
          <tr>
            <td style={cell}>Balance</td>
            <td style={sub}>{num(c.vl)}</td>
            <td style={sub}>{num(c.sl)}</td>
          </tr>
          <tr>
            <td style={cell}>Less</td>
            <td style={sub}>{num(c.lessVl)}</td>
            <td style={sub}>{num(c.lessSl)}</td>
          </tr>
          <tr>
            <td style={{ ...cell, fontWeight: 700 }}>Net Balance</td>
            <td style={{ ...sub, fontWeight: 700 }}>{num(Math.round((c.vl - c.lessVl) * 100) / 100)}</td>
            <td style={{ ...sub, fontWeight: 700 }}>{num(Math.round((c.sl - c.lessSl) * 100) / 100)}</td>
          </tr>
        </tbody>
      </table>

      <div style={{ display: "flex", gap: "24px", marginTop: "8px", padding: "0 8px" }}>
        <span>Recommendation:</span>
        <span>
          <Box on={hrDecision === "approved"} />
          Approved
        </span>
        <span style={{ flex: 1, display: "flex", gap: "4px" }}>
          <span>
            <Box on={hrDecision === "disapproved"} />
            Disapproved due to:
          </span>
          <span style={{ flex: 1, borderBottom: "1px solid #444", minHeight: "16px", fontWeight: 700 }}>{hrDecision === "disapproved" ? form.headReason : ""}</span>
        </span>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginTop: "6px", breakInside: "avoid" }}>
        <SignLine url={signatures.hr} name={form.receivedName} caption="Name and Signature of HR/Admin" width="260px" />
        <DateLine value={signedOn(form.receivedAt)} caption="Date Received" />
      </div>
    </div>
  );
}
