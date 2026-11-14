import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import { computeMb, contingencyWindow, longDate, mbDays, MB_KINDS, monthLabel, pesosInWords, type MbData, type MbStep } from "./maternity";

// The SSS Maternity Benefit Payment Voucher, laid out like HR's Excel voucher
// (green title and section bars), with each signer's signature and date.
// Page 2: the monthly salary credits behind the SSS benefit.

const W = 612;
const H = 792;
const M = 40;
const INK = rgb(0, 0, 0);
const GREEN = rgb(0.22, 0.46, 0.11);
const LIGHT = rgb(0.85, 0.92, 0.82);
const BRIGHT = rgb(0.0, 0.9, 0.0);
const WHITE = rgb(1, 1, 1);
const GREY = rgb(0.4, 0.4, 0.4);

const clean = (t: string) =>
  t
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/₱/g, "P")
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, "?");
const money = (n: number) => (Number(n) || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num = (n: number) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100));

export interface MbPdfInput {
  data: MbData;
  signatures: Partial<Record<MbStep, Uint8Array>>;
  signedAt: Partial<Record<MbStep, string | null>>;
  companyName: string;
}

export async function buildMaternityPdf(input: MbPdfInput): Promise<Uint8Array> {
  const d = input.data;
  const c = computeMb(d);
  const doc = await PDFDocument.create();
  doc.setTitle(`SSS Maternity Benefit Payment Voucher - ${d.employeeName}`);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const italic = await doc.embedFont(StandardFonts.TimesRomanItalic);
  const sigs: Partial<Record<MbStep, PDFImage>> = {};
  for (const [k, v] of Object.entries(input.signatures) as [MbStep, Uint8Array][]) {
    const img = await doc.embedPng(v).catch(() => null);
    if (img) sigs[k] = img;
  }
  let page: PDFPage = doc.addPage([W, H]);
  let y = H - M;
  const right = W - M;
  const width = W - 2 * M;

  const text = (t: string, x: number, yy: number, f: PDFFont = font, size = 8, color = INK) => page.drawText(clean(t), { x, y: yy, size, font: f, color });
  const rtext = (t: string, x: number, yy: number, f: PDFFont = font, size = 8, color = INK) => text(t, x - f.widthOfTextAtSize(clean(t), size), yy, f, size, color);
  const ctext = (t: string, cx: number, yy: number, f: PDFFont = font, size = 8, color = INK) => text(t, cx - f.widthOfTextAtSize(clean(t), size) / 2, yy, f, size, color);
  const box = (x: number, yy: number, w: number, h: number, fill?: ReturnType<typeof rgb>, border = true) =>
    page.drawRectangle({ x, y: yy, width: w, height: h, color: fill, borderColor: border ? INK : undefined, borderWidth: border ? 0.5 : 0 });

  // ---- Title and the voucher line ----
  const ROW = 12.5;
  box(M, y - 22, width, 22, GREEN);
  ctext("SSS MATERNITY BENEFIT PAYMENT VOUCHER", W / 2, y - 16, bold, 14, WHITE);
  y -= 22;
  const cols = [M, M + 120, M + 245, M + 390, right];
  box(M, y - 13, width, 13, GREEN);
  ["Name", "Position", "Description", "Amount"].forEach((h, i) => ctext(h, (cols[i] + cols[i + 1]) / 2, y - 9.5, bold, 8.5, WHITE));
  y -= 13;
  box(M, y - 48, width, 48);
  for (const x of cols.slice(1, -1)) page.drawLine({ start: { x, y }, end: { x, y: y - 48 }, thickness: 0.5, color: INK });
  text(d.employeeName, cols[0] + 3, y - 44, font, 9);
  text(d.position, cols[1] + 3, y - 44, font, 9);
  text(d.description || "Maternity Benefit", cols[2] + 3, y - 44, font, 9);
  rtext(money(c.net), right - 3, y - 44, bold, 9);
  y -= 48;
  box(M, y - 13, width, 13, LIGHT);
  text(pesosInWords(c.net), M + 3, y - 9.5, bold, 8);
  y -= 24;

  // ---- Sections ----
  const section = (title: string, strong = false) => {
    box(M, y - ROW, width, ROW, GREEN);
    ctext(title, W / 2, y - 9, strong ? bold : font, 7.5, WHITE);
    y -= ROW;
  };
  const row = (label: string, value: string, opts: { shade?: ReturnType<typeof rgb>; indent?: number; bold?: boolean; color?: ReturnType<typeof rgb> } = {}) => {
    box(M, y - ROW, width, ROW, opts.shade);
    text(label, M + 3 + (opts.indent ?? 0), y - 9, opts.bold ? bold : font, 7.5, opts.color ?? INK);
    rtext(value, right - 3, y - 9, opts.bold ? bold : font, 7.5, opts.color ?? INK);
    y -= ROW;
  };

  const kind = MB_KINDS.find((k) => k.value === d.kind);
  const days = mbDays(d.kind);
  section(`COMPUTATION TOTAL BENEFIT / FULL PAY FOR ${d.kind === "miscarriage" ? "MISCARRIAGE / EMERGENCY TERMINATION OF PREGNANCY" : "LIVE BIRTH"} (${days} DAYS)`, true);
  if (d.payBasis === "daily") {
    row("Daily rate", money(d.dailyRate));
    row("No. of working days in a month", num(d.workingDays));
  }
  row("Monthly basic pay", money(c.monthlyBasic));
  row("Maternity period in months", `${num(c.monthsOfLeave)} (${days} days)`);
  row("Total Benefit / Full Pay", money(c.fullPay), { shade: LIGHT, bold: true });

  const win = contingencyWindow(d.deliveryDate);
  section("Amount of SSS Maternity Benefit to be received from SSS");
  row(`Date of ${d.kind === "miscarriage" ? "miscarriage / termination" : "delivery"}`, longDate(d.deliveryDate) || "-");
  if (win) row("Semester of contingency", `${monthLabel(win.semester[0])} - ${monthLabel(win.semester[1])}`);
  row("Monthly Salary Credit considered for Maternity (6 highest of the 12 months before the semester)", money(c.totalMsc));
  row("Average daily salary credit (total MSC / 180)", money(c.adsc));
  row(`Amount of SSS maternity benefit to be received from SSS (x ${days} days)`, money(c.sssBenefit), { shade: LIGHT, bold: true });

  section("Differential");
  row("Differential (Full Pay less SSS Maternity Benefit)", money(c.differentialRaw));
  row(c.differentialRaw > 0 ? "Salary differential paid by the employer" : "Salary differential paid by the employer (none: SSS benefit is equal or higher)", money(c.differential), { shade: LIGHT, bold: true });

  section("TOTAL AMOUNT TO BE RECEIVED BY EMPLOYEE");
  row("Total benefit (SSS Maternity Benefit + salary differential)", money(c.totalBenefit));
  row("(Less) Social Welfare Contributions + Loan Payments", "");
  for (const l of d.deductions.filter((x) => x.label.trim() || x.amount)) row(l.label, money(l.amount), { indent: 120 });
  row("Total Social Welfare Contributions + Loan Payments", money(c.totalDeductions), { shade: LIGHT });
  row("TOTAL AMOUNT TO BE RECEIVED BY EMPLOYEE", money(c.net), { shade: BRIGHT, bold: true });
  y -= 22;

  // ---- Signatures ----
  const sigBlock = (step: MbStep, label: string, x: number, w: number, top: number, withDate = false) => {
    const s = step === "receive" ? { name: d.employeeName, title: d.position } : d.signers[step];
    text(label, x, top, italic, 9);
    const cx = x + w / 2;
    const img = sigs[step];
    if (img) {
      const sc = Math.min(110 / img.width, 30 / img.height, 1);
      page.drawImage(img, { x: cx - (img.width * sc) / 2, y: top - 36, width: img.width * sc, height: img.height * sc });
    }
    ctext((s?.name ?? "").toUpperCase(), cx, top - 30, bold, 7.5);
    ctext(s?.title ?? "", cx, top - 40, font, 7.5);
    const at = input.signedAt[step];
    if (withDate) {
      const dl = `Date: ${at ? longDate(at.slice(0, 10)) : "____________________"}`;
      ctext(dl, cx, top - 52, font, 7.5);
    } else if (at) ctext(`Signed ${longDate(at.slice(0, 10))}`, cx, top - 50, italic, 7, GREY);
  };
  const cw = width / 4;
  sigBlock("hr", "Prepared by:", M, cw, y);
  sigBlock("check", "Checked by:", M + cw, cw, y);
  sigBlock("approve1", "Approved by:", M + 2 * cw, cw, y);
  sigBlock("approve2", "Approved by:", M + 3 * cw, cw, y);
  y -= 72;
  sigBlock("release", "Released by:", M + cw, cw, y, true);
  sigBlock("receive", "Received by:", M + 2 * cw, cw, y, true);

  // ---- Page 2: the monthly salary credits ----
  page = doc.addPage([W, H]);
  y = H - M;
  box(M, y - 18, width, 18, GREEN);
  ctext("SSS MATERNITY BENEFIT - MONTHLY SALARY CREDITS USED", W / 2, y - 13, bold, 11, WHITE);
  y -= 26;
  text(`${d.employeeName} - ${kind?.label ?? ""}`, M, y - 8, bold, 9);
  y -= 14;
  if (win) {
    text(`Date of contingency: ${longDate(d.deliveryDate)}.  Semester of contingency: ${monthLabel(win.semester[0])} - ${monthLabel(win.semester[1])}.`, M, y - 8, font, 8);
    y -= 12;
    text(`12-month period before the semester: ${monthLabel(win.months[0])} - ${monthLabel(win.months[11])}.`, M, y - 8, font, 8);
    y -= 18;
  }
  const top6 = new Set<number>();
  const order = d.months.map((m, i) => ({ i, v: Math.min(Number(m.msc) || 0, 35000) })).sort((a, b) => b.v - a.v).slice(0, 6);
  order.forEach((o) => top6.add(o.i));
  box(M, y - ROW, width, ROW, GREEN);
  text("Month", M + 6, y - 9, bold, 8, WHITE);
  rtext("Monthly Salary Credit", right - 90, y - 9, bold, 8, WHITE);
  rtext("Counted", right - 6, y - 9, bold, 8, WHITE);
  y -= ROW;
  d.months.forEach((m, i) => {
    box(M, y - ROW, width, ROW, top6.has(i) ? LIGHT : undefined);
    text(monthLabel(m.month), M + 6, y - 9, font, 8);
    rtext(m.msc ? money(Math.min(m.msc, 35000)) : "no contribution", right - 90, y - 9, font, 8);
    rtext(top6.has(i) ? "yes" : "", right - 6, y - 9, font, 8);
    y -= ROW;
  });
  row("Total of the 6 highest monthly salary credits", money(c.totalMsc), { shade: LIGHT, bold: true });
  row("Average daily salary credit (total / 180)", money(c.adsc));
  row(`SSS maternity benefit (x ${days} days)`, money(c.sssBenefit), { bold: true });
  y -= 14;
  const notes = [
    "Basis: RA 11210 (105-Day Expanded Maternity Leave Law) and its IRR; SSS Circular 2019-009.",
    "Monthly salary credits are capped at P35,000 (2025 SSS schedule). At least 3 monthly contributions are needed in the 12-month period.",
    "Full pay is basic pay only. The employer advances the SSS benefit and pays the salary differential only when full pay is higher.",
    c.eligible ? "" : "WARNING: fewer than 3 monthly contributions in the 12-month period - check eligibility with SSS.",
  ].filter(Boolean);
  for (const n of notes) {
    text(n, M, y - 8, n.startsWith("WARNING") ? bold : font, 7.5, n.startsWith("WARNING") ? rgb(0.75, 0, 0) : GREY);
    y -= 11;
  }
  text(`${input.companyName}`, M, M - 10, font, 7, GREY);

  return doc.save();
}
