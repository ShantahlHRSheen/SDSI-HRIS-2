import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { COMPANY_INFO, employeeGovIds, type Form1601CData, type Form1601CLineItems, type Form2316Data } from "./bir";

// ---------------------------------------------------------------------------
// Fills the company's actual BIR Form 2316 and 1601-C PDF templates (stored
// under public/bir/, byte-identical to the official BIR-published forms)
// with data from the HRIS's payroll/tax engine, using pdf-lib to overlay
// text at fixed coordinates. Neither template has fillable AcroForm fields,
// so coordinates were derived by extracting each label's exact PDF-point
// position (pdfjs-dist) and visually cross-checking against the rendered
// page. This produces a real, byte-accurate copy of the official form with
// the computed figures filled in — not a recreated lookalike.
// ---------------------------------------------------------------------------

const TEXT_COLOR = rgb(0.05, 0.05, 0.15);

function money(n: number): string {
  return n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

interface DrawOpts {
  size?: number;
  align?: "left" | "right" | "center";
  font?: PDFFont;
}

function draw(page: PDFPage, font: PDFFont, text: string, x: number, y: number, opts: DrawOpts = {}) {
  if (!text) return;
  const size = opts.size ?? 7.5;
  const f = opts.font ?? font;
  const width = f.widthOfTextAtSize(text, size);
  let drawX = x;
  if (opts.align === "right") drawX = x - width;
  else if (opts.align === "center") drawX = x - width / 2;
  page.drawText(text, { x: drawX, y, size, font: f, color: TEXT_COLOR });
}

// 1601-C's Part II amount column is a true comb/digit-box grid (unlike
// 2316's, which are plain single-line boxes) — 11 whole-number cells then a
// printed decimal marker then 2 centavo cells, geometry measured directly
// from the template's own vector line-drawing operators.
const COMB_1601C = {
  wholeCellCount: 11,
  wholeCellStart: 391,
  wholeCellPitch: 14.4,
  centsCellStart: 564.2,
  centsCellPitch: 15.1,
};

function drawCombAmount1601C(page: PDFPage, font: PDFFont, amount: number, y: number, size = 7.5) {
  const [wholeStr, centsStr] = money(amount).split(".");
  const digits = wholeStr.replace(/,/g, "").slice(-COMB_1601C.wholeCellCount);
  const startCell = COMB_1601C.wholeCellCount - digits.length;
  for (let i = 0; i < digits.length; i++) {
    const cellLeft = COMB_1601C.wholeCellStart + (startCell + i) * COMB_1601C.wholeCellPitch;
    draw(page, font, digits[i], cellLeft + COMB_1601C.wholeCellPitch / 2, y, { align: "center", size });
  }
  for (let i = 0; i < centsStr.length; i++) {
    const cellLeft = COMB_1601C.centsCellStart + i * COMB_1601C.centsCellPitch;
    draw(page, font, centsStr[i], cellLeft + COMB_1601C.centsCellPitch / 2, y, { align: "center", size });
  }
}

function employeeNameLastFirstMi(employee: Form2316Data["employee"]): string {
  const mi = employee.middleName?.trim();
  return `${employee.lastName}, ${employee.firstName}${mi ? ` ${mi.charAt(0).toUpperCase()}.` : ""}`;
}

// COMPANY_INFO.rdoCode is "043 — Pasig City" for on-screen display; the
// form's RDO Code box is only wide enough for the 3-digit code itself.
function rdoCodeOnly(rdoCode: string): string {
  return rdoCode.split("—")[0].trim();
}

function mmddyyyy(dateStr: string): string {
  const [y, m, d] = dateStr.split("-");
  return `${m}/${d}/${y}`;
}

async function loadTemplate(path: string): Promise<PDFDocument> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Could not load PDF template at ${path}`);
  const bytes = await res.arrayBuffer();
  return PDFDocument.load(bytes);
}

export async function fillForm2316Pdf(data: Form2316Data): Promise<Uint8Array> {
  const pdfDoc = await loadTemplate("/bir/2316-template.pdf");
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const page = pdfDoc.getPages()[0];
  const ids = employeeGovIds(data.employee);

  // --- Part I — Employee Information --------------------------------------
  draw(page, font, String(data.taxYear), 103, 828, { size: 8 });
  draw(page, font, `${ids.tin}-000`, 102, 801.5, { size: 7 });
  draw(page, font, employeeNameLastFirstMi(data.employee), 48, 770);
  draw(page, font, rdoCodeOnly(COMPANY_INFO.rdoCode), 264, 770, { size: 7 });
  draw(page, font, data.employee.address, 48, 745, { size: 7 });
  draw(page, font, mmddyyyy(data.employee.birthdate), 90, 677, { size: 7 });
  draw(page, font, data.employee.contactNumber, 222, 677, { size: 7 });

  // --- Part II — Employer Information (Present) ---------------------------
  draw(page, font, COMPANY_INFO.tin, 102, 589.0, { size: 7 });
  draw(page, font, COMPANY_INFO.name, 48, 560);
  draw(page, font, COMPANY_INFO.address, 48, 534, { size: 7 });
  draw(page, font, "X", 122, 521, { size: 7 });

  // --- Part IV-B — Non-Taxable/Exempt Compensation Income (29-38) --------
  const nonTaxableRows: [number, number][] = [
    [690.3, data.thirteenthMonthPay], // 34
    [666.9, data.deMinimisBenefits], // 35
    [651.9, data.employeeSSS + data.employeeHDMF + data.employeePhilHealth], // 36
    [628.3, Math.max(data.nonTaxableCompensation - data.thirteenthMonthPay - data.deMinimisBenefits - (data.employeeSSS + data.employeeHDMF + data.employeePhilHealth), 0)], // 37
    [612.9, data.nonTaxableCompensation], // 38
  ];
  nonTaxableRows.forEach(([y, amount]) => draw(page, font, money(amount), 585, y, { align: "right", size: 7 }));

  // --- Part IV-B — Taxable Compensation Income Regular (39-52) -----------
  const otherTaxableRegular = Math.max(data.taxableCompensation - data.basicSalary - data.overtimePay, 0);
  const taxableRows: [number, number][] = [
    [571.4, data.basicSalary], // 39
    [479.7, otherTaxableRegular], // 44 Others
    [326.2, data.overtimePay], // 50 Overtime Pay
    [262.6, data.taxableCompensation], // 52 Total Taxable Compensation Income
  ];
  taxableRows.forEach(([y, amount]) => draw(page, font, money(amount), 585, y, { align: "right", size: 7 }));

  // --- Part IV-A — Summary (19-28) ----------------------------------------
  const summaryRows: [number, number][] = [
    [418.1, data.grossCompensation], // 19
    [398.7, data.nonTaxableCompensation], // 20
    [379.3, data.taxableCompensation], // 21
    [340.3, data.taxableCompensation], // 23
    [316.6, data.totalTaxWithheld], // 24 Tax Due
    [301.5, data.totalTaxWithheld], // 25
    [291.7, data.totalTaxWithheld], // 25A
    [262.3, data.totalTaxWithheld], // 26
    [219.1, data.totalTaxWithheld], // 28 Total Taxes Withheld
  ];
  summaryRows.forEach(([y, amount]) => draw(page, font, money(amount), 306, y, { align: "right", size: 7 }));

  return pdfDoc.save();
}

export async function fillForm1601CPdf(data: Form1601CData, items: Form1601CLineItems): Promise<Uint8Array> {
  const pdfDoc = await loadTemplate("/bir/1601c-template.pdf");
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const page = pdfDoc.getPages()[0];

  const [year, month] = data.monthKey.split("-");
  const monthDigits = `${month}${year}`;
  for (let i = 0; i < monthDigits.length; i++) {
    draw(page, font, monthDigits[i], 46.2 + i * 14.4 + 7.2, 814.9, { align: "center", size: 7 });
  }
  draw(page, font, "X", 246, 814.9, { size: 7 }); // Amended Return? No
  draw(page, font, "X", 317, 814.9, { size: 7 }); // Any Taxes Withheld? Yes
  draw(page, font, "1", 415, 825, { size: 8 });

  draw(page, font, COMPANY_INFO.tin, 235, 780, { size: 7 });
  draw(page, font, rdoCodeOnly(COMPANY_INFO.rdoCode), 526, 778, { size: 7 });
  draw(page, font, COMPANY_INFO.name, 32, 754, { size: 7 });
  draw(page, font, COMPANY_INFO.address, 32, 723, { size: 7 });
  draw(page, font, COMPANY_INFO.phone, 34, 690, { size: 7 });
  draw(page, font, COMPANY_INFO.email, 34, 673, { size: 7 });
  draw(page, font, "X", 455, 697, { size: 7 }); // Category of Withholding Agent: Private

  const rows: [number, number][] = [
    [626.9, items.totalCompensation], // 14
    [602.2, items.statutoryMwe], // 15
    [586.3, items.mweHolidayOtNsdHazard], // 16
    [570.3, items.thirteenthMonthAndOtherBenefits], // 17
    [554.5, items.deMinimisBenefits], // 18
    [538.5, items.mandatoryContributions], // 19
    [522.5, items.otherNonTaxable], // 20
    [506.6, items.totalNonTaxable], // 21
    [490.6, items.totalTaxableCompensation], // 22
    [474.6, 0], // 23
    [458.7, items.netTaxableCompensation], // 24
    [442.7, items.totalTaxesWithheld], // 25
    [426.8, 0], // 26
    [410.8, items.taxesWithheldForRemittance], // 27
    [394.9, 0], // 28
    [379.0, 0], // 29
    [362.3, 0], // 30
    [346.4, items.totalAmountStillDue], // 31
    [330.4, 0], // 32
    [314.6, 0], // 33
    [298.6, 0], // 34
    [282.6, 0], // 35
    [266.7, items.totalAmountStillDue], // 36
  ];
  rows.forEach(([y, amount]) => drawCombAmount1601C(page, font, amount, y - 1.5));

  return pdfDoc.save();
}

export function downloadPdfBytes(bytes: Uint8Array, filename: string) {
  const blob = new Blob([bytes as unknown as BlobPart], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
