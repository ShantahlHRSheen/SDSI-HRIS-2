import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFImage, type PDFPage, type RGB } from "pdf-lib";
import type { CompanyConfig } from "./companies";
import { DECISIONS, EDUCATION, EMPLOYMENT_TYPES, HR_ACTIONS, REQUEST_TYPES, type Requisition } from "./requisition";

// The Personnel Requisition Form (HR-PRF-001), laid out like HR's template
// (8.5 × 11 in): the company's logo, name and address on top, the document
// box, the title bar, sections A–F with check boxes, the three signatures,
// and the note. Colors follow the company (CompanyConfig.formTheme).

const W = 612;
const H = 792;
const M = 28;
const INK = rgb(0.1, 0.1, 0.1);
const MUTED = rgb(0.38, 0.38, 0.38);
const LINE = rgb(0.72, 0.72, 0.72);

const hex = (h: string): RGB => {
  const n = parseInt(h.replace("#", ""), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
};
const clean = (t: string) =>
  t
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, "?");
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const longDate = (d: string | null) => (d ? `${MONTHS[Number(d.slice(5, 7)) - 1]} ${Number(d.slice(8, 10))}, ${d.slice(0, 4)}` : "");
const manilaDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Manila" }) : null);

export interface PrfPdfInput {
  r: Requisition;
  company: CompanyConfig;
  logo: Uint8Array | null;
  // A full-width letterhead banner (CompanyConfig.hrLetterhead), used instead
  // of the logo, name and address when the company has one.
  letterhead?: Uint8Array | null;
  branch: string;
  department: string;
  names: { head: string; hr: string; approver: string };
  approverTitle: string;
  signatures: Partial<Record<"head" | "hr" | "approver", Uint8Array>>;
}

export async function buildRequisitionPdf(input: PrfPdfInput): Promise<Uint8Array> {
  const { r, company } = input;
  const theme = company.formTheme ?? { deep: "#013825", mid: "#1f7a5c", accent: "#c9a227" };
  const DEEP = hex(theme.deep);
  const MID = hex(theme.mid);
  const ACCENT = hex(theme.accent);
  const TINT = rgb(0.95, 0.97, 0.96);

  const doc = await PDFDocument.create();
  doc.setTitle(`Personnel Requisition Form${r.prfNo ? ` ${r.prfNo}` : ""} - ${r.position}`);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const italic = await doc.embedFont(StandardFonts.HelveticaOblique);
  const page: PDFPage = doc.addPage([W, H]);
  const sigs: Partial<Record<"head" | "hr" | "approver", PDFImage>> = {};
  for (const [k, v] of Object.entries(input.signatures) as ["head" | "hr" | "approver", Uint8Array][]) {
    const img = await doc.embedPng(v).catch(() => null);
    if (img) sigs[k] = img;
  }
  const logo = input.logo ? await doc.embedPng(input.logo).catch(() => doc.embedJpg(input.logo!).catch(() => null)) : null;
  const banner = input.letterhead ? await doc.embedPng(input.letterhead).catch(() => null) : null;

  const text = (t: string, x: number, y: number, size = 8, f: PDFFont = font, color = INK) => page.drawText(clean(t), { x, y, size, font: f, color });
  const fit = (t: string, width: number, size: number, f: PDFFont = font) => {
    let s = clean(t);
    while (s && f.widthOfTextAtSize(s, size) > width) s = s.slice(0, -1);
    return s.length < clean(t).length ? s.slice(0, -1) + "..." : s;
  };
  const wrap = (t: string, width: number, size: number, f: PDFFont = font): string[] => {
    const out: string[] = [];
    for (const para of clean(t).split(/\n/)) {
      let line = "";
      for (const w of para.split(/\s+/)) {
        const tryLine = line ? `${line} ${w}` : w;
        if (f.widthOfTextAtSize(tryLine, size) > width && line) {
          out.push(line);
          line = w;
        } else line = tryLine;
      }
      out.push(line);
    }
    return out;
  };
  const box = (x: number, y: number, w: number, h: number, fill?: RGB) => page.drawRectangle({ x, y, width: w, height: h, borderColor: LINE, borderWidth: 0.6, color: fill });
  const field = (label: string, value: string, x: number, y: number, lw: number, w: number) => {
    text(label, x, y + 4, 7.5, bold);
    box(x + lw, y - 2, w - lw, 14);
    text(fit(value, w - lw - 6, 8), x + lw + 3, y + 2, 8);
  };
  const check = (on: boolean, label: string, x: number, y: number) => {
    page.drawRectangle({ x, y: y - 1, width: 7, height: 7, borderColor: INK, borderWidth: 0.6 });
    if (on) {
      page.drawLine({ start: { x: x + 1.2, y: y + 2.5 }, end: { x: x + 3, y: y + 0.5 }, thickness: 1.1, color: DEEP });
      page.drawLine({ start: { x: x + 3, y: y + 0.5 }, end: { x: x + 6.2, y: y + 5.5 }, thickness: 1.1, color: DEEP });
    }
    text(label, x + 11, y, 7.5);
  };
  const para = (t: string, x: number, y: number, w: number, h: number) => {
    box(x, y - h, w, h);
    let yy = y - 10;
    for (const l of wrap(t, w - 8, 7.5)) {
      if (yy < y - h + 3) break;
      text(l, x + 4, yy, 7.5);
      yy -= 9;
    }
  };
  // A section's title bar.
  const bar = (letter: string, title: string, sub: string, x: number, y: number, w: number) => {
    page.drawRectangle({ x, y, width: w, height: 16, color: DEEP });
    page.drawRectangle({ x: x + w - 26, y, width: 26, height: 16, color: ACCENT });
    text(`${letter}. ${title}`, x + 8, y + 4.5, 9, bold, rgb(1, 1, 1));
    if (sub) text(sub, x + 14 + bold.widthOfTextAtSize(`${letter}. ${title}`, 9), y + 4.8, 7, italic, rgb(0.9, 0.95, 0.92));
  };

  // ---- Header ---------------------------------------------------------------------
  let y = H - M;
  const docLines = [`Document No.:  HR-PRF-001`, `Revision No.:  00`, `PRF No.:  ${r.prfNo ?? "(on submission)"}`, `Date:  ${longDate(manilaDate(r.headSignedAt ?? r.createdAt))}`];
  if (banner) {
    const bh = ((W - 2 * M) / banner.width) * banner.height;
    page.drawImage(banner, { x: M, y: y - bh, width: W - 2 * M, height: bh });
    y -= bh + 12;
    const line = docLines.join("     ");
    text(line, W - M - font.widthOfTextAtSize(line, 7.5), y, 7.5, font, MUTED);
    y -= 6;
  } else {
    if (logo) {
      const s = Math.min(110 / logo.width, 46 / logo.height);
      page.drawImage(logo, { x: M, y: y - 46 + (46 - logo.height * s) / 2, width: logo.width * s, height: logo.height * s });
    }
    page.drawLine({ start: { x: M + 120, y: y - 2 }, end: { x: M + 120, y: y - 46 }, thickness: 1.2, color: MID });
    text(company.info.name.toUpperCase(), M + 130, y - 16, 13, bold, DEEP);
    if (company.info.address) text(company.info.address, M + 130, y - 29, 7.5, font, MUTED);
    const contact = [company.info.phone && `Tel.: ${company.info.phone}`, company.info.email].filter(Boolean).join("  |  ");
    if (contact) text(contact, M + 130, y - 40, 7.5, font, MUTED);
    box(W - M - 132, y - 48, 132, 48);
    docLines.forEach((l, i) => text(l, W - M - 126, y - 12 - i * 11 + (i === 3 ? 1 : 0), 7.5, i === 2 ? bold : font));
    y -= 56;
  }
  page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 1.5, color: ACCENT });

  // Title bar
  y -= 30;
  page.drawRectangle({ x: M, y, width: W - 2 * M, height: 24, color: DEEP });
  page.drawRectangle({ x: W - M - 150, y, width: 150, height: 24, color: TINT });
  page.drawRectangle({ x: W - M - 156, y, width: 6, height: 24, color: ACCENT });
  text("PERSONNEL REQUISITION FORM", M + 12, y + 7.5, 15, bold, rgb(1, 1, 1));
  text("Request for Manpower /", W - M - 140, y + 13, 7.5, bold, DEEP);
  text("Position Filling", W - M - 140, y + 4, 7.5, bold, DEEP);

  // ---- A. Request details ------------------------------------------------------------
  y -= 24;
  bar("A", "REQUEST DETAILS", "(To be completed by the Requesting Department / Branch)", M, y, W - 2 * M);
  y -= 18;
  const half = (W - 2 * M - 12) / 2;
  field("Position Requested:", r.position, M + 4, y, 82, half + 40);
  field("Branch / Department:", [input.branch, input.department].filter((s) => s && s !== "—").join(" / "), M + half + 52, y, 86, half - 48);
  y -= 18;
  field("Requested by (Name and Position):", [r.requestedByName, r.requestedByPosition].filter(Boolean).join(", "), M + 4, y, 132, half + 40);
  field("Number of Personnel Needed:", String(r.personnelNeeded), M + half + 52, y, 112, half - 48);
  y -= 18;
  text("Employment Type:", M + 4, y + 4, 7.5, bold);
  EMPLOYMENT_TYPES.forEach(([k, label], i) => check(r.employmentType === k, label, M + 80 + [0, 48, 112, 162][i], y + 3));
  field("Target Date of Hiring:", longDate(r.targetDate), M + half + 52, y, 86, half - 48);

  // ---- B. Type of request / C. Reason ------------------------------------------------
  y -= 26;
  const colW = (W - 2 * M - 10) / 2;
  bar("B", "TYPE OF REQUEST", "", M, y, colW);
  bar("C", "REASON FOR REQUEST", "", M + colW + 10, y, colW);
  let by = y - 14;
  REQUEST_TYPES.forEach(([k, label]) => {
    check(r.requestType === k, k === "other" ? `Other: ${r.requestType === "other" ? r.requestTypeOther : "________________"}` : label, M + 8, by);
    by -= 12;
  });
  text("Please state the reason why additional personnel or replacement is needed.", M + colW + 14, y - 11, 7, font, MUTED);
  para(r.reason, M + colW + 14, y - 15, colW - 8, 30);
  text("If replacement, name of previous employee:", M + colW + 14, y - 56, 7, font, MUTED);
  box(M + colW + 14, y - 74, colW - 8, 14);
  text(fit(r.previousEmployee, colW - 16, 8), M + colW + 18, y - 70, 8);
  y -= 96;

  // ---- D. Job requirements -------------------------------------------------------------
  bar("D", "JOB REQUIREMENTS", "", M, y, W - 2 * M);
  y -= 13;
  text("Educational Attainment (minimum requirement):", M + 8, y, 7.5, bold);
  text("Required Work Experience:", M + colW + 14, y, 7.5, bold);
  let ey = y - 12;
  EDUCATION.forEach(([k, label]) => {
    check(r.education === k, k === "other" ? `Others: ${r.education === "other" ? r.educationOther : "________________"}` : label, M + 8, ey);
    ey -= 11;
  });
  para(r.workExperience, M + colW + 14, y - 4, colW - 8, 16);
  text("Required Skills / Qualifications:", M + colW + 14, y - 28, 7.5, bold);
  para(r.skills, M + colW + 14, y - 32, colW - 8, 22);
  y -= 66;

  // ---- E. Approvals -----------------------------------------------------------------------
  bar("E", "APPROVALS", "", M, y, W - 2 * M);
  y -= 6;
  const cw = (W - 2 * M - 16) / 3;
  const cols: { title: string; opts: [boolean, string][]; remarks: string; sig?: PDFImage; name: string; date: string | null }[] = [
    {
      title: "1. REQUESTING DEPARTMENT / BRANCH HEAD",
      opts: [
        [r.headRecommendation === "recommended", "Recommended for Approval"],
        [r.headRecommendation === "not_recommended", "Not Recommended"],
      ],
      remarks: r.headRemarks,
      sig: sigs.head,
      name: input.names.head,
      date: manilaDate(r.headSignedAt),
    },
    {
      title: "2. HR REVIEW AND RECOMMENDATION",
      opts: HR_ACTIONS.map(([k, label]) => [r.hrAction === k, label] as [boolean, string]),
      remarks: r.hrRemarks,
      sig: sigs.hr,
      name: input.names.hr,
      date: manilaDate(r.hrSignedAt),
    },
    {
      title: `3. FINAL APPROVAL (${input.approverTitle.toUpperCase()})`,
      opts: DECISIONS.map(([k, label]) => [r.decision === k, label] as [boolean, string]),
      remarks: r.decisionRemarks,
      sig: sigs.approver,
      name: input.names.approver,
      date: manilaDate(r.decidedAt),
    },
  ];
  cols.forEach((c, i) => {
    const x = M + i * (cw + 8);
    page.drawRectangle({ x, y: y - 14, width: cw, height: 13, color: TINT });
    text(fit(c.title, cw - 8, 6.8, bold), x + 4, y - 10, 6.8, bold, DEEP);
    let oy = y - 26;
    c.opts.forEach(([on, label]) => {
      check(on, label, x + 4, oy);
      oy -= 10;
    });
    text("Remarks:", x + 4, y - 70, 7, bold);
    para(c.remarks, x + 4, y - 73, cw - 8, 26);
    if (c.sig) {
      const s = Math.min((cw - 60) / c.sig.width, 22 / c.sig.height);
      page.drawImage(c.sig, { x: x + 8, y: y - 124, width: c.sig.width * s, height: c.sig.height * s });
    }
    page.drawLine({ start: { x: x + 4, y: y - 126 }, end: { x: x + cw - 50, y: y - 126 }, thickness: 0.5, color: INK });
    page.drawLine({ start: { x: x + cw - 44, y: y - 126 }, end: { x: x + cw - 4, y: y - 126 }, thickness: 0.5, color: INK });
    text(fit(c.name, cw - 58, 7, bold), x + 4, y - 120 + (c.sig ? 0 : 0), 7, bold);
    text("Printed Name & Signature", x + 10, y - 134, 6.5, italic, MUTED);
    text(c.date ? c.date.slice(5).replace("-", "/") + "/" + c.date.slice(0, 4) : "", x + cw - 44, y - 122, 6.5);
    text("Date", x + cw - 30, y - 134, 6.5, italic, MUTED);
  });
  y -= 152;

  // ---- F. HR assessment ---------------------------------------------------------------------
  bar("F", "HR DEPARTMENT ASSESSMENT", "(To be completed by HR)", M, y, W - 2 * M);
  y -= 13;
  text("HR Action:", M + 8, y, 7.5, bold);
  HR_ACTIONS.forEach(([k, label], i) => check(r.hrAction === k, label, M + 12 + (i % 2) * 110, y - 12 - Math.floor(i / 2) * 11));
  text("HR Remarks / Next Steps:", M + colW + 14, y, 7.5, bold);
  para(r.hrRemarks, M + colW + 14, y - 4, colW - 8, 26);
  y -= 46;
  text("Assessed by:", M + 8, y, 7.5, bold);
  if (sigs.hr) {
    const s = Math.min(90 / sigs.hr.width, 18 / sigs.hr.height);
    page.drawImage(sigs.hr, { x: M + 70, y: y - 4, width: sigs.hr.width * s, height: sigs.hr.height * s });
  }
  page.drawLine({ start: { x: M + 62, y: y - 4 }, end: { x: M + 210, y: y - 4 }, thickness: 0.5, color: INK });
  text(fit(input.names.hr, 140, 7, bold), M + 66, y, 7, bold);
  text("Printed Name & Signature (HR / Admin)", M + 80, y - 12, 6.5, italic, MUTED);
  field("Date Received:", longDate(r.hrReceivedAt), M + 220, y - 4, 58, 150);
  field("Target Completion:", longDate(r.hrTargetCompletion), M + 384, y - 4, 74, W - 2 * M - 384);
  y -= 26;

  // ---- Note --------------------------------------------------------------------------------
  page.drawRectangle({ x: M, y: y - 26, width: W - 2 * M, height: 26, color: rgb(0.99, 0.96, 0.88), borderColor: ACCENT, borderWidth: 0.6 });
  page.drawCircle({ x: M + 14, y: y - 13, size: 7, color: ACCENT });
  text("i", M + 12.6, y - 16, 9, bold, rgb(1, 1, 1));
  text("NOTE:", M + 28, y - 10, 7.5, bold, DEEP);
  text("All personnel requests must be submitted to the HR Department for evaluation and approval before conducting recruitment or hiring", M + 54, y - 10, 7, italic);
  text("activities. No department or branch is allowed to hire or promise employment to any applicant without prior management approval.", M + 28, y - 20, 7, italic);

  // Watermark-like status for drafts.
  if (r.status === "draft") text("DRAFT", W - M - 70, M - 6, 16, bold, rgb(0.85, 0.3, 0.3));
  return doc.save();
}
