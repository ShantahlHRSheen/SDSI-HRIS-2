import { withShownNames } from "@/lib/demo-mode";
import { MONTH_NAMES, type ThirteenthMonthSlipData } from "@/lib/thirteenth-month";
import type { VoucherSignatureSet } from "@/components/vouchers/VoucherSheet";

// The printed "13TH MONTH PAY AND LEAVE CREDITS" slip, laid out like the
// company's own sheet. Plain inline styles so it prints the same everywhere.

const GREEN = "#0b7d0b";
const LIGHT_GREEN = "#b6d7a8";
const PINK = "#f4cccc";
const YELLOW = "#ffff00";
const line = "1px solid #333";
const exact = { WebkitPrintColorAdjust: "exact", printColorAdjust: "exact" } as const;

const money = (n: number) => n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const blankIfZero = (n: number) => (n ? money(n) : "");
const days = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2));
const signedOn = (iso: string) => new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Manila", year: "numeric", month: "short", day: "numeric" }).format(new Date(iso));

export const THIRTEENTH_MONTH_SIGNATORIES = withShownNames([
  { role: "Prepared by:", name: "Sheena A. Evangelista", title: "HR Manager", key: "prepared" },
  { role: "Checked by:", name: "Wendie Halog", title: "Sr. Accounting Assistant", key: "checked" },
  { role: "Released by:", name: "Joan Mariette O. Santarina", title: "Corporate Treasurer", key: "released" },
] as const);

export function ThirteenthMonthSlip({ row, signatures = {} }: { row: ThirteenthMonthSlipData; signatures?: VoucherSignatureSet }) {
  const cell: React.CSSProperties = { border: line, padding: "1px 4px", fontSize: "8pt", height: "15px", verticalAlign: "bottom" };
  const num: React.CSSProperties = { ...cell, textAlign: "right" };
  const bar = (text: string) => (
    <tr>
      <td colSpan={6} style={{ ...exact, background: GREEN, color: "#fff", textAlign: "center", fontWeight: 700, fontSize: "8.5pt", padding: "1px 0", border: line }}>
        {text}
      </td>
    </tr>
  );
  const name = row.name;
  const slot = (key: "prepared" | "checked" | "released") =>
    key === "prepared" ? (signatures.prepared ? { url: signatures.prepared, at: undefined as string | undefined } : undefined) : signatures[key];

  return (
    <div style={{ fontFamily: "Arial, Helvetica, sans-serif", color: "#111", border: line, padding: "14px 0 18px", fontSize: "8pt" }}>
      <div style={{ textAlign: "center", fontSize: "9pt", lineHeight: 1.5, marginBottom: "8px" }}>
        <div>SHANTAHL DIRECT SALES INC.</div>
        <div>13TH MONTH PAY AND LEAVE CREDITS</div>
      </div>
      <table style={{ borderCollapse: "collapse", margin: "0 0 2px 0", fontSize: "8pt" }}>
        <tbody>
          <tr>
            <td style={{ padding: "1px 4px", width: "72px" }}>Name:</td>
            <td style={{ padding: "1px 4px" }}>{name}</td>
          </tr>
          <tr>
            <td style={{ padding: "1px 4px" }}>Designation:</td>
            <td style={{ padding: "1px 4px" }}>{row.designation}</td>
          </tr>
        </tbody>
      </table>
      <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
        <colgroup>
          <col style={{ width: "13%" }} />
          <col style={{ width: "25%" }} />
          <col style={{ width: "13%" }} />
          <col style={{ width: "12.5%" }} />
          <col style={{ width: "12.5%" }} />
          <col style={{ width: "24%" }} />
        </colgroup>
        <tbody>
          {bar("13TH MONTH PAY")}
          <tr>
            {["Month", "Basic (1st Cutoff)", "Lates / Absences / Undertime", "Basic (2nd Cutoff)", "Lates / Absences / Undertime", "NET Monthly"].map((h, i) => (
              <td key={i} style={{ ...cell, height: "auto", textAlign: i === 1 ? "right" : "left" }}>
                {h}
              </td>
            ))}
          </tr>
          {row.months.map((m, i) => (
            <tr key={i}>
              <td style={cell}>{MONTH_NAMES[i]}</td>
              <td style={num}>{blankIfZero(m.b1)}</td>
              <td style={num}>{m.b1 || m.l1 ? money(m.l1) : ""}</td>
              <td style={num}>{blankIfZero(m.b2)}</td>
              <td style={num}>{m.b2 || m.l2 ? money(m.l2) : ""}</td>
              <td style={num}>{money(m.net)}</td>
            </tr>
          ))}
          <tr>
            <td style={cell}>Gross Basic Pay</td>
            <td style={cell} colSpan={4} />
            <td style={num}>{money(row.grossBasic)}</td>
          </tr>
          <tr>
            <td style={cell}>13th Month</td>
            <td style={cell} colSpan={4} />
            <td style={{ ...num, ...exact, background: LIGHT_GREEN }}>{money(row.thirteenthMonth)}</td>
          </tr>
          {bar("SERVICE INCENTIVE LEAVE CREDITS (+)")}
          <tr>
            <td style={{ ...cell, textAlign: "center" }} colSpan={3}>
              VACATION LEAVE
            </td>
            <td style={{ ...cell, textAlign: "center" }}>Daily Rate</td>
            <td style={{ ...cell, textAlign: "center" }} colSpan={2}>
              Monetized VL
            </td>
          </tr>
          <tr>
            <td style={num} colSpan={3}>
              {days(row.vlDays)}
            </td>
            <td style={num}>{money(row.dailyRate)}</td>
            <td style={{ ...cell, ...exact, background: LIGHT_GREEN, textAlign: "center" }} colSpan={2}>
              {money(row.monetizedVl)}
            </td>
          </tr>
          {bar("LAST SALARY (add)")}
          <tr>
            <td style={{ ...cell, ...exact, background: LIGHT_GREEN, textAlign: "center" }} colSpan={6}>
              {money(row.lastSalary)}
            </td>
          </tr>
          {bar("SSS, PHILHEALTH, AND PAGIBIG")}
          <tr>
            <td style={{ ...cell, textAlign: "center" }} colSpan={2}>
              SSS
            </td>
            <td style={{ ...cell, textAlign: "center" }} colSpan={2}>
              PHIC
            </td>
            <td style={{ ...cell, textAlign: "center" }} colSpan={2}>
              HDMF
            </td>
          </tr>
          <tr>
            <td style={num} colSpan={2}>
              {money(row.sss)}
            </td>
            <td style={num} colSpan={2}>
              {money(row.philhealth)}
            </td>
            <td style={num} colSpan={2}>
              {money(row.hdmf)}
            </td>
          </tr>
          <tr>
            <td style={{ ...cell, ...exact, background: PINK, textAlign: "center" }} colSpan={6}>
              {money(row.deductions)}
            </td>
          </tr>
          {bar("TOTAL")}
          <tr>
            <td style={{ ...cell, ...exact, background: YELLOW, textAlign: "center", fontWeight: 700 }} colSpan={6}>
              {money(row.total)}
            </td>
          </tr>
        </tbody>
      </table>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", marginTop: "22px", textAlign: "center", fontSize: "8pt", breakInside: "avoid" }}>
        {THIRTEENTH_MONTH_SIGNATORIES.map((s) => {
          const sig = slot(s.key);
          return (
            <div key={s.key}>
              <div>{s.role}</div>
              <div style={{ height: "30px", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
                {sig?.url && (
                  // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL from Supabase Storage
                  <img src={sig.url} alt="Signature" style={{ maxHeight: "44px", maxWidth: "130px", marginBottom: "-12px", ...exact }} />
                )}
              </div>
              <div>{s.name}</div>
              <div>{s.title}</div>
              {sig?.at && <div style={{ fontSize: "6.5pt", color: "#444" }}>{signedOn(sig.at)}</div>}
            </div>
          );
        })}
      </div>
      <div style={{ textAlign: "center", fontSize: "8pt", marginTop: "18px", lineHeight: 1.6, breakInside: "avoid" }}>
        <div>Received by:</div>
        <div style={{ height: "14px" }} />
        <div>{name}</div>
        <div>Employee</div>
        <div style={{ marginTop: "6px", marginLeft: "-60px" }}>
          Date:<span style={{ display: "inline-block", width: "190px", borderBottom: "1px solid #111", marginLeft: "2px" }} />
        </div>
      </div>
    </div>
  );
}
