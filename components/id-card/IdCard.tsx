/* eslint-disable @next/next/no-img-element -- signed Supabase URLs and a small static logo; next/image adds nothing here */
import { departmentName, positionTitle } from "@/lib/helpers";
import type { Employee } from "@/lib/types";

// The company ID card, front and back, at true CR80 size (54 × 85.6 mm,
// portrait). Drawn from the employee record every time — nothing about the
// card itself is stored. Colours are fixed (not the app theme) so it prints
// the same on any screen.

const GREEN = "#0a3326";
const INK = "#111827";
const MUTED = "#4b5563";
export const ID_VERIFY_EMAIL = "shantahlhr@gmail.com";
export const ID_VERIFY_PHONE = "044-960-0126";

function cardName(e: Employee): string {
  const mi = e.middleName?.trim() ? ` ${e.middleName.trim().charAt(0)}.` : "";
  return `${e.firstName}${mi} ${e.lastName}`.toUpperCase();
}

function longDate(d: string | null | undefined): string {
  if (!d) return "—";
  const date = new Date(`${d.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export function idExpiryDate(today: string): string {
  return `${today.slice(0, 4)}-12-31`;
}

const cardStyle: React.CSSProperties = {
  width: "54mm",
  height: "85.6mm",
  borderRadius: "3mm",
  overflow: "hidden",
  background: "#ffffff",
  color: INK,
  display: "flex",
  flexDirection: "column",
  fontFamily: "Arial, Helvetica, sans-serif",
  boxShadow: "0 0 0 0.2mm #d1d5db",
  flexShrink: 0,
  printColorAdjust: "exact",
  WebkitPrintColorAdjust: "exact",
};

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div style={{ display: "flex", gap: "1.5mm", fontSize: "5.6pt", lineHeight: 1.25, marginBottom: "0.9mm" }}>
      <span style={{ color: MUTED, width: "15mm", flexShrink: 0 }}>{label}</span>
      <span style={{ fontWeight: 600, wordBreak: "break-word" }}>{value?.trim() ? value : "—"}</span>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: "5.2pt", fontWeight: 700, color: GREEN, letterSpacing: "0.3mm", margin: "1.6mm 0 0.8mm", textTransform: "uppercase" }}>{children}</div>;
}

export function IdCardFront({ employee, photoUrl, signatureUrl, expiry }: { employee: Employee; photoUrl?: string; signatureUrl?: string; expiry: string }) {
  return (
    <div style={cardStyle} aria-label="ID card front">
      <div style={{ background: GREEN, height: "13mm", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <img src="/brand/shantahl-logo.png" alt="Shantahl Direct Sales Inc." style={{ height: "10.5mm", width: "auto" }} />
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", padding: "2.5mm 3mm 0" }}>
        <div style={{ width: "24mm", height: "32mm", border: `0.5mm solid ${GREEN}`, borderRadius: "1mm", overflow: "hidden", background: "#f3f4f6", display: "flex", alignItems: "center", justifyContent: "center" }}>
          {photoUrl ? (
            <img src={photoUrl} alt="Employee photo" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          ) : (
            <span style={{ fontSize: "5pt", color: MUTED, textAlign: "center", padding: "2mm" }}>No photo yet</span>
          )}
        </div>
        <div style={{ marginTop: "2mm", fontSize: "8pt", fontWeight: 800, textAlign: "center", lineHeight: 1.15 }}>{cardName(employee)}</div>
        <div style={{ fontSize: "6.2pt", fontWeight: 600, color: GREEN, textAlign: "center", marginTop: "0.6mm" }}>{positionTitle(employee.positionId)}</div>
        <div style={{ fontSize: "5.6pt", color: MUTED, textAlign: "center" }}>{departmentName(employee.departmentId)}</div>
        <div style={{ fontSize: "6.4pt", fontWeight: 700, marginTop: "1.2mm" }}>ID No. {employee.employeeNumber}</div>
        <div style={{ marginTop: "auto", marginBottom: "1.2mm", width: "34mm", display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div style={{ height: "7.5mm", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
            {signatureUrl && <img src={signatureUrl} alt="Employee signature" style={{ maxHeight: "7.5mm", maxWidth: "34mm" }} />}
          </div>
          <div style={{ borderTop: `0.2mm solid ${INK}`, width: "100%", textAlign: "center", fontSize: "4.8pt", color: MUTED, paddingTop: "0.3mm" }}>Employee&rsquo;s signature</div>
        </div>
      </div>
      <div style={{ background: GREEN, color: "#ffffff", fontSize: "5pt", padding: "1.2mm 2.5mm", display: "flex", justifyContent: "space-between", gap: "1mm" }}>
        <span>Issued: {longDate(employee.dateHired)}</span>
        <span>Valid until: {longDate(expiry)}</span>
      </div>
    </div>
  );
}

export function IdCardBack({ employee }: { employee: Employee }) {
  return (
    <div style={cardStyle} aria-label="ID card back">
      <div style={{ background: GREEN, color: "#ffffff", fontSize: "6pt", fontWeight: 700, letterSpacing: "0.4mm", padding: "1.6mm 3mm", textAlign: "center" }}>
        EMPLOYEE INFORMATION
      </div>
      <div style={{ flex: 1, padding: "1.2mm 3mm 0" }}>
        <SectionTitle>Personal</SectionTitle>
        <Field label="Address" value={employee.address} />
        <Field label="Contact No." value={employee.contactNumber} />
        <Field label="Date of Birth" value={employee.birthdate ? longDate(employee.birthdate) : null} />
        <SectionTitle>Government IDs</SectionTitle>
        <Field label="Pag-IBIG" value={employee.hdmfNumber} />
        <Field label="PhilHealth" value={employee.philHealthNumber} />
        <Field label="SSS" value={employee.sssNumber} />
        <Field label="TIN" value={employee.tin} />
        <SectionTitle>In case of emergency</SectionTitle>
        <Field label="Contact person" value={employee.emergencyContactName} />
        <Field label="Contact No." value={employee.emergencyContactPhone} />
      </div>
      <div style={{ background: GREEN, color: "#ffffff", fontSize: "5pt", lineHeight: 1.35, padding: "1.5mm 3mm", textAlign: "center" }}>
        For verification: contact SDSI HR Department thru {ID_VERIFY_EMAIL} or {ID_VERIFY_PHONE}.
      </div>
    </div>
  );
}
