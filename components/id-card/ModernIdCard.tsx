/* eslint-disable @next/next/no-img-element -- signed Supabase URLs and small static logos; next/image adds nothing here */
import { COMPANY_INFO } from "@/lib/bir";
import { currentCompany } from "@/lib/companies";
import { departmentName, positionTitle } from "@/lib/helpers";
import type { Employee } from "@/lib/types";

// The "modern" ID style (lib/companies.ts idCardStyle): green gradient bands
// with a dot pattern and angled edges, a dark green accent line, and a back
// with the emergency contact, return-to address and terms of use. Same CR80
// size and print rules as IdCard.tsx; angles are clip-paths so several cards
// can share a page without clashing SVG ids.

const DEEP = "#0a3326";
const GREEN = "#12604a";
const LINE = "#04201a";
const INK = "#111827";
const MUTED = "#4b5563";
const BAND = `radial-gradient(rgba(255,255,255,0.10) 0.2mm, transparent 0.25mm) 0 0 / 2mm 2mm, linear-gradient(135deg, ${DEEP}, ${GREEN})`;

const cardStyle: React.CSSProperties = {
  width: "54mm",
  height: "85.6mm",
  borderRadius: "3mm",
  overflow: "hidden",
  background: "linear-gradient(180deg, #ffffff 65%, #f2f7f4)",
  color: INK,
  display: "flex",
  flexDirection: "column",
  fontFamily: "Arial, Helvetica, sans-serif",
  boxShadow: "0 0 0 0.2mm #d1d5db",
  flexShrink: 0,
  position: "relative",
  printColorAdjust: "exact",
  WebkitPrintColorAdjust: "exact",
};

// An angled band: the accent line shows as a sliver of LINE below/above it.
// `edge` is where the slanted edge is (bottom of a header, top of a footer);
// `low` and `high` are that edge's two ends as % of the band's height.
function Band({ height, edge, children }: { height: string; edge: "bottom" | "top"; children?: React.ReactNode }) {
  const line = edge === "bottom" ? "polygon(0 0, 100% 0, 100% 82%, 0 100%)" : "polygon(0 22%, 100% 0, 100% 100%, 0 100%)";
  const band = edge === "bottom" ? "polygon(0 0, 100% 0, 100% calc(82% - 0.55mm), 0 calc(100% - 0.55mm))" : "polygon(0 calc(22% + 0.55mm), 100% 0.55mm, 100% 100%, 0 100%)";
  return (
    <div style={{ position: "relative", height, flexShrink: 0 }}>
      <div style={{ position: "absolute", inset: 0, background: LINE, clipPath: line }} />
      <div style={{ position: "absolute", inset: 0, background: BAND, clipPath: band }} />
      {/* soft light facet in the top-right corner */}
      {edge === "bottom" && <div style={{ position: "absolute", inset: 0, background: "rgba(255,255,255,0.06)", clipPath: "polygon(60% 0, 100% 0, 100% 45%)" }} />}
      <div style={{ position: "relative", height: "100%" }}>{children}</div>
    </div>
  );
}

function cardName(e: Employee): string {
  const mi = e.middleName?.trim() ? ` ${e.middleName.trim().charAt(0)}.` : "";
  return `${e.firstName}${mi} ${e.lastName}`.toUpperCase();
}

function longDate(d: string | null | undefined): string {
  if (!d) return "—";
  const date = new Date(`${d.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export function ModernIdCardFront({ employee, photoUrl, signatureUrl, expiry }: { employee: Employee; photoUrl?: string; signatureUrl?: string; expiry: string }) {
  return (
    <div style={cardStyle} aria-label="ID card front">
      <Band height="23.6mm" edge="bottom">
        <div style={{ display: "flex", justifyContent: "center", paddingTop: "1.6mm" }}>
          <img
            src={currentCompany().idCardLogo}
            alt={COMPANY_INFO.name}
            // The logo has its own green background: fade its edges into the band.
            style={{ height: "9.2mm", width: "auto", maskImage: "radial-gradient(ellipse 60% 75% at 50% 50%, #000 60%, transparent 100%)", WebkitMaskImage: "radial-gradient(ellipse 60% 75% at 50% 50%, #000 60%, transparent 100%)" }}
          />
        </div>
      </Band>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", padding: "0 3mm" }}>
        <div style={{ width: "22.4mm", height: "28mm", marginTop: "-9.6mm", position: "relative", borderRadius: "2.4mm", padding: "0.6mm", background: `linear-gradient(135deg, ${LINE}, ${GREEN})`, boxShadow: "0 1.2mm 2.8mm rgba(10,51,38,0.35)", flexShrink: 0 }}>
          <div style={{ width: "100%", height: "100%", borderRadius: "1.8mm", overflow: "hidden", background: "#f3f4f6", display: "flex", alignItems: "center", justifyContent: "center" }}>
            {photoUrl ? (
              <img src={photoUrl} alt="Employee photo" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            ) : (
              <span style={{ fontSize: "5pt", color: MUTED, textAlign: "center", padding: "2mm" }}>No photo yet</span>
            )}
          </div>
        </div>
        <div style={{ marginTop: "2mm", fontSize: "8.4pt", fontWeight: 800, textAlign: "center", lineHeight: 1.15, letterSpacing: "0.1mm" }}>{cardName(employee)}</div>
        <div style={{ fontSize: "6.6pt", fontWeight: 700, color: GREEN, textAlign: "center", marginTop: "0.5mm" }}>{positionTitle(employee.positionId)}</div>
        <div style={{ fontSize: "5.8pt", color: MUTED, textAlign: "center" }}>{departmentName(employee.departmentId)}</div>
        <div style={{ marginTop: "1.4mm", display: "inline-flex", gap: "1.2mm", alignItems: "center", borderRadius: "4mm", padding: "0.6mm 2.6mm", background: `linear-gradient(135deg, ${DEEP}, ${GREEN})`, color: "#ffffff", fontSize: "6pt", fontWeight: 700, letterSpacing: "0.2mm" }}>
          <span style={{ opacity: 0.7, fontWeight: 400 }}>ID NO.</span> {employee.employeeNumber}
        </div>
        <div style={{ marginTop: "auto", marginBottom: "1mm", width: "36mm", display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div style={{ height: "7.5mm", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
            {signatureUrl && <img src={signatureUrl} alt="Employee signature" style={{ maxHeight: "7.5mm", maxWidth: "36mm" }} />}
          </div>
          <div style={{ borderTop: `0.2mm solid ${INK}`, width: "100%", textAlign: "center", fontSize: "4.8pt", color: MUTED, paddingTop: "0.3mm" }}>Employee&rsquo;s signature</div>
        </div>
      </div>
      <Band height="7.2mm" edge="top">
        <div style={{ color: "#ffffff", fontSize: "4.8pt", fontWeight: 700, display: "flex", justifyContent: "space-between", gap: "1mm", padding: "3mm 2.6mm 0" }}>
          <span>Issued: {longDate(employee.dateHired)}</span>
          <span>Valid until: {longDate(expiry)}</span>
        </div>
      </Band>
    </div>
  );
}

function Icon({ d }: { d: React.ReactNode }) {
  return (
    <span style={{ width: "4.4mm", height: "4.4mm", borderRadius: "1.4mm", background: `linear-gradient(135deg, ${GREEN}, ${DEEP})`, display: "inline-flex", alignItems: "center", justifyContent: "center", boxShadow: "0 0.4mm 1mm rgba(10,51,38,0.35)", flexShrink: 0 }}>
      <svg viewBox="0 0 24 24" style={{ width: "2.6mm", height: "2.6mm" }} fill="none" stroke="#ffffff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        {d}
      </svg>
    </span>
  );
}

function Heading({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "1.4mm", marginBottom: "1mm" }}>
      <Icon d={icon} />
      <span style={{ fontSize: "5.1pt", fontWeight: 800, letterSpacing: "0.32mm", textTransform: "uppercase", color: DEEP }}>{children}</span>
    </div>
  );
}

const PHONE = <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z" />;
const PIN = (
  <>
    <path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z" />
    <circle cx="12" cy="10" r="3" />
  </>
);
const DOC = (
  <>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <path d="M14 2v6h6M8 13h8M8 17h5" />
  </>
);

export function ModernIdCardBack({ employee }: { employee: Employee }) {
  const company = currentCompany();
  const text: React.CSSProperties = { fontSize: "5.2pt", lineHeight: 1.4, color: "#222222" };
  return (
    <div style={cardStyle} aria-label="ID card back">
      <Band height="16.8mm" edge="bottom">
        <div style={{ display: "flex", alignItems: "center", gap: "1.8mm", padding: "2.6mm 3.2mm 0" }}>
          <img src={company.logo} alt="" style={{ width: "6.8mm", height: "6.8mm", borderRadius: "50%", background: "#ffffff", objectFit: "cover", boxShadow: "0 0 0 0.4mm rgba(255,255,255,0.35)" }} />
          <div>
            <div style={{ color: "#ffffff", fontWeight: 800, letterSpacing: "0.5mm", fontSize: "6.2pt" }}>EMPLOYEE ID CARD</div>
            <div style={{ color: "rgba(255,255,255,0.7)", fontSize: "4.3pt", letterSpacing: "0.3mm", marginTop: "0.3mm" }}>{company.name.toUpperCase()}</div>
          </div>
        </div>
      </Band>
      <div style={{ flex: 1, padding: "0.2mm 2.8mm 0", display: "flex", flexDirection: "column" }}>
        <div style={{ borderRadius: "2mm", padding: "1.8mm 2mm", background: "linear-gradient(135deg, rgba(18,96,74,0.10), rgba(4,32,26,0.05))", border: "0.2mm solid rgba(18,96,74,0.18)" }}>
          <Heading icon={PHONE}>In case of emergency</Heading>
          <div style={{ fontWeight: 800, fontSize: "7.1pt" }}>{employee.emergencyContactName?.trim() || "—"}</div>
          <div style={{ fontWeight: 800, fontSize: "8.5pt", color: GREEN, letterSpacing: "0.1mm" }}>{employee.emergencyContactPhone?.trim() || "—"}</div>
          <div style={{ ...text, fontSize: "4.8pt", marginTop: "0.4mm" }}>
            If unreachable, call {company.shortName} HR: <b>{COMPANY_INFO.phone}</b>
          </div>
        </div>
        <div style={{ marginTop: "2mm", paddingLeft: "0.4mm" }}>
          <Heading icon={PIN}>If found, please return to</Heading>
          <div style={{ fontWeight: 800, fontSize: "6pt" }}>{employee.idReturnName?.trim() || company.name}</div>
          <div style={{ ...text, fontSize: "5.1pt" }}>{employee.idReturnName?.trim() || employee.idReturnAddress?.trim() ? employee.idReturnAddress?.trim() || "" : COMPANY_INFO.address}</div>
        </div>
        <div style={{ marginTop: "2mm", paddingLeft: "0.4mm" }}>
          <Heading icon={DOC}>Terms of use</Heading>
          <div style={{ ...text, fontSize: "4.9pt" }}>
            This card is company property and is non-transferable. It must be worn visibly on company premises and surrendered upon separation from the company. Report loss to HR immediately.
          </div>
        </div>
        <div style={{ marginTop: "1.8mm", display: "flex", gap: "1.2mm", alignItems: "flex-start", borderRadius: "1.6mm", padding: "1.2mm 1.6mm", background: "#ffffff", border: "0.2mm dashed rgba(18,96,74,0.35)", fontSize: "4.3pt", color: MUTED, lineHeight: 1.35 }}>
          <svg viewBox="0 0 24 24" style={{ width: "2.4mm", height: "2.4mm", flexShrink: 0 }} fill="none" stroke={GREEN} strokeWidth={2}>
            <rect x="4" y="11" width="16" height="10" rx="2" />
            <path d="M8 11V7a4 4 0 0 1 8 0v4" />
          </svg>
          <span>Personal data on this card is processed in accordance with the Data Privacy Act of 2012 (RA 10173), solely for employee identification.</span>
        </div>
      </div>
      <Band height="10mm" edge="top">
        <div style={{ color: "#ffffff", fontSize: "4.4pt", fontWeight: 700, textAlign: "center", padding: "3.2mm 2mm 0", lineHeight: 1.35 }}>
          To verify this ID, contact {company.shortName} HR Department
          <br />
          <span style={{ fontWeight: 400, opacity: 0.9 }}>
            {COMPANY_INFO.email} · {COMPANY_INFO.phone}
          </span>
        </div>
      </Band>
    </div>
  );
}
