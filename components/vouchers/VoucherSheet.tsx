import { amountInWords } from "@/lib/voucher-totals";
import { withShownNames } from "@/lib/demo-mode";
import { currentCompany } from "@/lib/companies";
import { COMPANY_INFO } from "@/lib/bir";

// The printed voucher, laid out like the company's voucher sheet: green
// title bar, company / check-voucher / payee header, the payee table, the
// total with the amount in words, and the signatories. Plain inline styles
// so it prints the same everywhere (A4, black on white, green headers).

const GREEN = "#38761d";
const border = "1px solid #444";
const exact = { WebkitPrintColorAdjust: "exact", printColorAdjust: "exact" } as const;

export const VOUCHER_SIGNATORIES: { role: string; name: string; title: string }[][] = currentCompany().voucherSignatories.map((row) => withShownNames(row));

const money = (n: number) => n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const longDate = (d: string) => new Intl.DateTimeFormat("en-US", { timeZone: "UTC", year: "numeric", month: "long", day: "numeric" }).format(new Date(`${d}T00:00:00Z`));

export interface VoucherColumn {
  label: string;
  width?: string;
  align?: "left" | "right";
}

export function VoucherSheet({
  title,
  date,
  columns,
  rows,
  total,
  minRows = 12,
  note,
  signatures,
}: {
  title: string;
  // Printed at the top right (the cut-off date), YYYY-MM-DD.
  date: string;
  // The last column is the amount column.
  columns: VoucherColumn[];
  rows: { key: string; cells: React.ReactNode[] }[];
  total: number;
  // Blank rows are added so short vouchers keep the sheet's shape.
  minRows?: number;
  note?: string;
  // Signatures to print: Prepared by always (once uploaded); Checked by and
  // Released by only once that person has signed off this voucher.
  signatures?: VoucherSignatureSet;
}) {
  const cell: React.CSSProperties = { border, padding: "3px 6px", fontSize: "9pt", verticalAlign: "top" };
  const head: React.CSSProperties = { ...cell, ...exact, background: GREEN, color: "#fff", fontWeight: 700, textAlign: "center" };
  const blanks = Math.max(0, minRows - rows.length);
  const n = columns.length;
  return (
    <div style={{ fontFamily: "Arial, Helvetica, sans-serif", color: "#111", fontSize: "9pt" }}>
      <div style={{ ...exact, background: GREEN, color: "#fff", textAlign: "center", fontWeight: 700, fontSize: "14pt", padding: "4px 0", textTransform: "uppercase" }}>
        {title}
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "2px" }}>
        <tbody>
          <tr>
            <td style={{ padding: "4px 2px", fontWeight: 700, width: "25%" }}>Company Name:</td>
            <td style={{ padding: "4px 2px", fontWeight: 700 }}>{COMPANY_INFO.name.toUpperCase()}</td>
            <td style={{ padding: "4px 2px", fontWeight: 700, width: "30%" }}>CHECK Voucher No:</td>
          </tr>
          <tr>
            <td style={{ padding: "10px 2px 4px", fontWeight: 700 }}>Payment to:</td>
            <td />
            <td style={{ padding: "10px 2px 4px", fontWeight: 700, textAlign: "right" }}>{longDate(date)}</td>
          </tr>
        </tbody>
      </table>
      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "10px" }}>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.label} style={{ ...head, width: c.width }}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} style={{ breakInside: "avoid" }}>
              {r.cells.map((c, i) => (
                <td key={i} style={{ ...cell, textAlign: columns[i]?.align ?? "left", textTransform: i === 0 ? "uppercase" : undefined }}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
          {Array.from({ length: blanks }, (_, i) => (
            <tr key={`blank-${i}`}>
              {columns.map((c) => (
                <td key={c.label} style={{ ...cell, height: "17px" }} />
              ))}
            </tr>
          ))}
          <tr>
            <td style={{ ...cell, fontWeight: 700 }} colSpan={n - 1}>
              TOTAL
            </td>
            <td style={{ ...cell, fontWeight: 700, textAlign: "right" }}>{money(total)}</td>
          </tr>
          <tr>
            <td style={{ ...cell, fontWeight: 700 }}>Memo:</td>
            <td style={{ ...cell, fontWeight: 700 }} colSpan={n - 1}>
              {amountInWords(total)}
            </td>
          </tr>
          <tr>
            <td style={{ padding: "3px 6px", fontStyle: "italic" }} colSpan={n}>
              REFERENCE
            </td>
          </tr>
        </tbody>
      </table>
      {note && <div style={{ fontSize: "8pt", color: "#444", marginTop: "4px" }}>{note}</div>}
      <VoucherSignatories signatures={signatures} />
    </div>
  );
}

export interface VoucherSignatureSet {
  prepared?: string;
  checked?: { url?: string; at: string };
  released?: { url?: string; at: string };
}

const signedOn = (iso: string) => new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Manila", year: "numeric", month: "short", day: "numeric" }).format(new Date(iso));

export function VoucherSignatories({ signatures = {} }: { signatures?: VoucherSignatureSet }) {
  // Position on the sheet → signature: [row][column].
  const slot = (r: number, i: number): { url?: string; at?: string } | undefined =>
    r === 0 && i === 0
      ? signatures.prepared
        ? { url: signatures.prepared }
        : undefined
      : r === 0 && i === 1
        ? signatures.checked
        : r === 1 && i === 0
          ? signatures.released
          : undefined;
  return (
    <div style={{ marginTop: "18px", breakInside: "avoid" }}>
      {VOUCHER_SIGNATORIES.map((row, r) => (
        <div key={r} style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px", marginTop: r ? "18px" : 0 }}>
          {row.map((s, i) => (
            <div key={`${s.name}-${i}`} style={row.length === 1 ? { gridColumn: "1 / span 2" } : undefined}>
              <div style={{ fontStyle: "italic", fontSize: "9pt" }}>{s.role}</div>
              <div style={{ height: "34px", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
                {slot(r, i)?.url && (
                  // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL from Supabase Storage
                  <img src={slot(r, i)!.url} alt="Signature" style={{ maxHeight: "46px", maxWidth: "150px", marginBottom: "-10px", ...exact }} />
                )}
              </div>
              <div style={{ textAlign: "center", fontWeight: 700, fontSize: "8pt", whiteSpace: "nowrap" }}>{s.name}</div>
              <div style={{ textAlign: "center", fontSize: "7pt", whiteSpace: "nowrap" }}>{s.title}</div>
              {slot(r, i)?.at && <div style={{ textAlign: "center", fontSize: "6.5pt", color: "#444", whiteSpace: "nowrap" }}>{signedOn(slot(r, i)!.at!)}</div>}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
