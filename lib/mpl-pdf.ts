import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib";
import { mplTotals, MPL_MAX_LINES, type MplData } from "./mpl";

// Fills the employer's part of Pag-IBIG's Multi-Purpose Loan Application
// Form (HQP-SLF-065, V11 10/2026, 8.5 × 13 in, public/forms/…): employer
// name / address / employee ID / date of employment and the authorized
// signatory on page 1, and the Certificate of Net Pay on page 2. Positions
// are the form's own (points from the top of the page), read off the PDF.

export const MPL_FORM_URL = "/forms/pagibig-mplaf-hqp-slf-065.pdf";
const H = 936;
const INK = rgb(0, 0, 0);

const clean = (t: string) =>
  t
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, "?");
const money = (n: number) => (Number(n) || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const mdy = (d: string) => (d ? `${d.slice(5, 7)}/${d.slice(8, 10)}/${d.slice(0, 4)}` : "");
const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
const MONTHS = ["Jan.", "Feb.", "Mar.", "Apr.", "May", "June", "July", "Aug.", "Sept.", "Oct.", "Nov.", "Dec."];

// Text at x with its baseline `top` points from the top; shrinks to fit maxW.
function put(page: PDFPage, font: PDFFont, t: string, x: number, top: number, size = 8, maxW = 400, align: "left" | "center" | "right" = "left") {
  const s = clean(t);
  if (!s) return;
  let sz = size;
  while (sz > 5 && font.widthOfTextAtSize(s, sz) > maxW) sz -= 0.25;
  const w = font.widthOfTextAtSize(s, sz);
  const left = align === "center" ? x - w / 2 : align === "right" ? x - w : x;
  page.drawText(s, { x: left, y: H - top, size: sz, font, color: INK });
}

export async function buildMplPdf(form: Uint8Array, d: MplData, signature: Uint8Array | null, signedAt: string | null): Promise<Uint8Array> {
  const doc = await PDFDocument.load(form);
  doc.setTitle(`Pag-IBIG MPL Application - ${d.borrowerName}`);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const [p1, p2] = doc.getPages();
  const sig = signature ? await doc.embedPng(signature).catch(() => null) : null;
  const drawSig = (page: PDFPage, cx: number, bottomTop: number, maxW: number, maxH: number) => {
    if (!sig) return;
    const scale = Math.min(maxW / sig.width, maxH / sig.height, 1);
    const w = sig.width * scale;
    page.drawImage(sig, { x: cx - w / 2, y: H - bottomTop, width: w, height: sig.height * scale });
  };

  // ---- Page 1: employer details --------------------------------------------------
  put(p1, font, d.employerName.toUpperCase(), 24, 213.5, 8.5, 350);
  const a = d.address;
  put(p1, font, a.unit.toUpperCase(), 120, 235.5, 7.5, 58);
  put(p1, font, a.building.toUpperCase(), 183, 235.5, 7.5, 42);
  put(p1, font, a.house.toUpperCase(), 229, 235.5, 7.5, 112);
  put(p1, font, a.street.toUpperCase(), 347, 235.5, 7.5, 40);
  put(p1, font, a.subdivision.toUpperCase(), 22, 257.5, 7.5, 47);
  put(p1, font, a.barangay.toUpperCase(), 72, 257.5, 7.5, 44);
  put(p1, font, a.city.toUpperCase(), 119, 257.5, 7.5, 61);
  put(p1, font, a.province.toUpperCase(), 183, 257.5, 7.5, 158);
  put(p1, font, a.zip, 345, 257.5, 7.5, 40);
  put(p1, font, d.employeeNumber.toUpperCase(), 24, 282, 8.5, 120);
  put(p1, font, mdy(d.dateOfEmployment), 151, 282, 8.5, 82);
  // Source of fund: Employment/Salary.
  put(p1, bold, "X", 239.6, 276, 7, 10, "center");

  // Authorized signatory, designation, Pag-IBIG employer ID (right column).
  drawSig(p1, 503.7, 503, 110, 30);
  put(p1, bold, d.signatory.name.toUpperCase(), 503.7, 504.5, 8, 128, "center");
  put(p1, font, d.signatory.designation.toUpperCase(), 500.2, 539.5, 8, 128, "center");
  put(p1, font, d.employerPagibigId, 501.2, 567, 8, 128, "center");

  // ---- Page 2: Certificate of Net Pay --------------------------------------------
  put(p2, bold, d.borrowerName.toUpperCase(), 132, 152, 9, 196, "center");
  put(p2, font, d.month.toUpperCase(), 180.7, 190.5, 8.5, 92, "center");
  put(p2, font, money(d.basic), 227, 226, 8.5, 92, "right");
  const allowRows = [270.8, 293.8, 316.8, 339.8, 362.8, 385.8];
  d.allowances.slice(0, MPL_MAX_LINES).forEach((l, i) => {
    put(p2, font, l.label, 40, allowRows[i], 8, 102);
    put(p2, font, money(l.amount), 229, allowRows[i], 8, 48, "right");
  });
  const t = mplTotals(d);
  put(p2, bold, money(t.gross), 229, 429.8, 8.5, 48, "right");
  const dedRows = [489.3, 512.3, 535.3, 558.3, 581.3, 604.3];
  d.deductions.slice(0, MPL_MAX_LINES).forEach((l, i) => {
    put(p2, font, l.label, 40, dedRows[i], 8, 102);
    put(p2, font, money(l.amount), 229, dedRows[i], 8, 48, "right");
  });
  put(p2, bold, money(t.deductions), 229, 650.4, 8.5, 48, "right");
  put(p2, bold, money(t.net), 229, 695, 8.5, 48, "right");

  // "Issued this ___ day of ___, 20__." and the signature (once signed).
  if (signedAt) {
    const when = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date(signedAt));
    put(p2, font, ordinal(Number(when.slice(8, 10))), 110.5, 753, 8, 42, "center");
    put(p2, font, MONTHS[Number(when.slice(5, 7)) - 1], 178, 753, 7.5, 25, "center");
    put(p2, font, when.slice(2, 4), 210, 753, 8, 14, "center");
  }
  drawSig(p2, 132.3, 817, 120, 22);
  put(p2, bold, d.signatory.name.toUpperCase(), 132.3, 819.5, 8.5, 186, "center");
  return doc.save();
}
