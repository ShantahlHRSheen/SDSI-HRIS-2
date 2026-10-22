import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import { monthLabel, numberWords, NTE_TARDINESS_RE, PENALTY_TABLE, type TardyDay } from "./nte-tardiness";

// The Notice To Explain – Habitual Tardiness, laid out like HR's Word
// template: letterhead, TO / FROM / DATE / RE / CC., the late days table,
// the company's penalty table, and the acknowledgement line.

export interface TardinessNteInput {
  companyName: string; // "Shantahl Direct Sales Inc."
  companyShort: string; // "SDSI"
  companyAddress: string;
  companyContact: string;
  letterhead: Uint8Array | null; // PNG banner
  employeeName: string; // "Halog, Wendie"
  issueDate: string; // "2026-10-22"
  month: string; // "2026-09"
  days: TardyDay[];
  cc: { name: string; title: string } | null;
  // The branch's manager, signing after the Department Manager (under CC).
  branchManager?: { name: string; title: string } | null;
  // Signatures (PNG) printed over the Issued by / CC / Received lines.
  signatures?: { hr?: SignatureMark | null; manager?: SignatureMark | null; branch?: SignatureMark | null; employee?: SignatureMark | null };
}

export interface SignatureMark {
  png: Uint8Array;
  name?: string; // printed under the HR Manager's signature
  at: string; // when signed (ISO)
}

const A4: [number, number] = [595.28, 841.89];
const MARGIN = 64;
const INK = rgb(0, 0, 0);
const LINE = rgb(0.2, 0.2, 0.2);

const longDate = (d: string) => new Intl.DateTimeFormat("en-US", { timeZone: "UTC", year: "numeric", month: "long", day: "numeric" }).format(new Date(`${d}T00:00:00Z`));
const mdY = (d: string) => `${d.slice(5, 7)}/${d.slice(8, 10)}/${d.slice(0, 4)}`;

// Standard PDF fonts cover Latin-1 only (ñ is fine; curly quotes aren't).
const clean = (t: string) =>
  t
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, "?");

interface Fonts {
  regular: PDFFont;
  bold: PDFFont;
}

class Page {
  page!: PDFPage;
  y = 0;
  constructor(
    private doc: PDFDocument,
    public f: Fonts,
    private letterhead: PDFImage | null,
    private headerText: { name: string; sub: string },
  ) {
    this.add();
  }
  add() {
    this.page = this.doc.addPage(A4);
    // The letterhead runs edge to edge across the top, as in the Word header.
    if (this.letterhead) {
      const h = (A4[0] * this.letterhead.height) / this.letterhead.width;
      this.page.drawImage(this.letterhead, { x: 0, y: A4[1] - h, width: A4[0], height: h });
      this.y = A4[1] - h - 28;
    } else {
      this.y = A4[1] - 48;
      this.center(this.headerText.name.toUpperCase(), 13, true);
      this.center(this.headerText.sub, 9, false);
      this.y -= 16;
    }
  }
  ensure(h: number) {
    if (this.y - h < 56) this.add();
  }
  center(t: string, size: number, bold: boolean) {
    const font = bold ? this.f.bold : this.f.regular;
    const w = font.widthOfTextAtSize(clean(t), size);
    this.page.drawText(clean(t), { x: (A4[0] - w) / 2, y: this.y - size, size, font, color: INK });
    this.y -= size * 1.4;
  }
  // A paragraph of runs (some bold / underlined), wrapped and justified-left.
  para(runs: { t: string; bold?: boolean; underline?: boolean }[], size = 11.5, gap = 10) {
    const width = A4[0] - MARGIN * 2;
    const words: { w: string; bold?: boolean; underline?: boolean }[] = [];
    for (const r of runs) for (const w of clean(r.t).split(/(\s+)/)) if (w) words.push({ w, bold: r.bold, underline: r.underline });
    let line: typeof words = [];
    let lineW = 0;
    const flush = () => {
      this.ensure(size * 1.5);
      let x = MARGIN;
      // No leading space on a line.
      while (line.length && !line[0].w.trim()) line.shift();
      for (const part of line) {
        const font = part.bold ? this.f.bold : this.f.regular;
        const pw = font.widthOfTextAtSize(part.w, size);
        this.page.drawText(part.w, { x, y: this.y - size, size, font, color: INK });
        if (part.underline && part.w.trim()) this.page.drawLine({ start: { x, y: this.y - size - 1.5 }, end: { x: x + pw, y: this.y - size - 1.5 }, thickness: 0.6, color: INK });
        x += pw;
      }
      this.y -= size * 1.5;
      line = [];
      lineW = 0;
    };
    for (const part of words) {
      const font = part.bold ? this.f.bold : this.f.regular;
      const pw = font.widthOfTextAtSize(part.w, size);
      if (lineW + pw > width && part.w.trim()) flush();
      line.push(part);
      lineW += pw;
    }
    if (line.length) flush();
    this.y -= gap;
  }
  field(label: string, value: string) {
    const size = 11.5;
    this.ensure(size * 1.6);
    this.page.drawText(label, { x: MARGIN, y: this.y - size, size, font: this.f.bold, color: INK });
    this.page.drawText(clean(value), { x: MARGIN + 64, y: this.y - size, size, font: this.f.bold, color: INK });
    this.y -= size * 1.6;
  }
  // A bordered table; each row's cells centred. Column widths in points.
  table(cols: number[], rows: { cells: string[]; bold?: boolean; span?: boolean }[], size = 9.5) {
    const total = cols.reduce((a, b) => a + b, 0);
    const x0 = (A4[0] - total) / 2;
    const pad = 4;
    for (const row of rows) {
      const font = row.bold ? this.f.bold : this.f.regular;
      const cells = row.span ? [row.cells.join("")] : row.cells;
      const widths = row.span ? [total] : cols;
      const lines = cells.map((c, i) => wrapText(clean(c), font, size, widths[i] - pad * 2));
      const h = Math.max(...lines.map((l) => l.length)) * size * 1.3 + pad * 2;
      this.ensure(h);
      let x = x0;
      cells.forEach((_, i) => {
        this.page.drawRectangle({ x, y: this.y - h, width: widths[i], height: h, borderColor: LINE, borderWidth: 0.6 });
        lines[i].forEach((l, k) => {
          const w = font.widthOfTextAtSize(l, size);
          this.page.drawText(l, { x: x + (widths[i] - w) / 2, y: this.y - pad - size - k * size * 1.3 + 1, size, font, color: INK });
        });
        x += widths[i];
      });
      this.y -= h;
    }
    this.y -= 12;
  }
  text(t: string, opts: { bold?: boolean; size?: number; gap?: number } = {}) {
    const size = opts.size ?? 11.5;
    this.ensure(size * 1.5);
    this.page.drawText(clean(t), { x: MARGIN, y: this.y - size, size, font: opts.bold ? this.f.bold : this.f.regular, color: INK });
    this.y -= size * 1.5 + (opts.gap ?? 0);
  }
}

// A signature image (max 150 × 42 pt) with its date below-right, its
// bottom at y.
async function drawSignature(doc: PDFDocument, page: PDFPage, mark: SignatureMark | null | undefined, x: number, y: number, font: PDFFont) {
  if (!mark) return;
  const img = await doc.embedPng(mark.png).catch(() => null);
  let w = 0;
  if (img) {
    const scale = Math.min(130 / img.width, 40 / img.height, 1);
    w = img.width * scale;
    page.drawImage(img, { x, y, width: w, height: img.height * scale });
  }
  // The date beside the signature.
  const when = new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", year: "numeric", month: "short", day: "numeric" }).format(new Date(mark.at));
  page.drawText(clean(when), { x: x + w + 4, y: y + 2, size: 7, font, color: rgb(0.4, 0.4, 0.4) });
}

function wrapText(t: string, font: PDFFont, size: number, width: number): string[] {
  const out: string[] = [];
  let line = "";
  for (const w of t.split(/ +/)) {
    const c = line ? `${line} ${w}` : w;
    if (font.widthOfTextAtSize(c, size) <= width || !line) line = c;
    else {
      out.push(line);
      line = w;
    }
  }
  out.push(line);
  return out;
}

// One NTE per page set; several employees' NTEs can go in one document.
export async function buildTardinessNtePdf(inputs: TardinessNteInput[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(inputs.length === 1 ? `NTE - Habitual Tardiness - ${inputs[0].employeeName}` : `NTE - Habitual Tardiness - ${monthLabel(inputs[0]?.month ?? "")}`);
  doc.setProducer("LSM Group HRIS");
  const fonts = { regular: await doc.embedFont(StandardFonts.TimesRoman), bold: await doc.embedFont(StandardFonts.TimesRomanBold) };
  const heads = new Map<Uint8Array, PDFImage>();
  for (const n of inputs) {
    let head: PDFImage | null = null;
    if (n.letterhead) {
      head = heads.get(n.letterhead) ?? (await doc.embedPng(n.letterhead).catch(() => null));
      if (head) heads.set(n.letterhead, head);
    }
    const p = new Page(doc, fonts, head, { name: n.companyName, sub: `Human Resources Department · ${[n.companyAddress, n.companyContact].filter(Boolean).join(" · ")}` });
    p.field("TO:", n.employeeName);
    p.field("FROM:", `${n.companyShort} Human Resource Department`);
    p.field("DATE:", longDate(n.issueDate));
    p.field("RE:", NTE_TARDINESS_RE);
    if (n.cc) p.field("CC.:", n.cc.name);
    p.page.drawLine({ start: { x: MARGIN, y: p.y - 2 }, end: { x: A4[0] - MARGIN, y: p.y - 2 }, thickness: 1, color: INK });
    p.y -= 18;

    p.para([{ t: "The matter of your habitual tardiness has been brought to our attention." }]);
    p.para([
      { t: "Based on your attendance record for the month of " },
      { t: monthLabel(n.month).toUpperCase(), bold: true, underline: true },
      { t: ", it shows that you had been late for " },
      { t: `${numberWords(n.days.length)} (${n.days.length}) times`, bold: true, underline: true },
      { t: " as follows:" },
    ]);
    p.table(
      [150, 150],
      [
        { cells: ["DATE", "NUMBER OF LATE"], bold: true },
        ...n.days.map((d) => ({ cells: [mdY(d.date), `${d.minutes} minute${d.minutes === 1 ? "" : "s"}`] })),
        { cells: [`TOTAL : ${n.days.length} DAYS LATE`], bold: true, span: true },
      ],
    );
    p.para([{ t: "Under the Labor Code, habitual tardiness constitutes gross and habitual neglect of duties which may be a cause for suspension/termination." }]);
    p.para([
      {
        t: `Based on the Company Policy of ${n.companyName}, employees who show habitual tardiness shall be penalized with the following penalties based on the gravity of their tardiness:`,
      },
    ]);
    p.table(
      [140, 86, 86, 86, 86],
      [
        { cells: ["ATTENDANCE", "1st Offense", "2nd Offense", "3rd Offense", "4th Offense"], bold: true },
        ...PENALTY_TABLE.map((r) => ({ cells: [r.label.replace(/\s+/g, " "), ...[0, 1, 2, 3].map((i) => r.steps[i] ?? "")] })),
      ],
      9,
    );
    p.para([{ t: "Now, to hear your side, you are required to submit a written letter explaining why this habitual tardiness happened." }]);
    p.para([{ t: "Your compliance is strongly encouraged." }], 11.5, 6);
    p.text("Thank you!", { gap: 14 });

    // Issued by (left) and CC (right), as in the template; each signature
    // sits just above the name it belongs to.
    const sig = n.signatures ?? {};
    p.ensure(n.branchManager ? 200 : 130);
    const top = p.y;
    const size = 11.5;
    const nameY = top - size - 54;
    const bmNameY = nameY - size * 1.5 - 62;
    p.page.drawText("Issued by:", { x: MARGIN, y: top - size, size, font: fonts.regular, color: INK });
    await drawSignature(doc, p.page, sig.hr, MARGIN, nameY + size + 2, fonts.regular);
    p.page.drawText(sig.hr?.name ? clean(sig.hr.name) : "HR DEPARTMENT", { x: MARGIN, y: nameY, size, font: fonts.bold, color: INK });
    if (sig.hr?.name) p.page.drawText("HR Manager", { x: MARGIN, y: nameY - size * 1.5, size, font: fonts.bold, color: INK });
    if (n.cc) {
      const x = A4[0] / 2 + 20;
      p.page.drawText("CC:", { x, y: top - size, size, font: fonts.regular, color: INK });
      await drawSignature(doc, p.page, sig.manager, x, nameY + size + 2, fonts.regular);
      p.page.drawText(clean(n.cc.name), { x, y: nameY, size, font: fonts.bold, color: INK });
      if (n.cc.title) p.page.drawText(clean(n.cc.title), { x, y: nameY - size * 1.5, size, font: fonts.bold, color: INK });
    }
    if (n.branchManager) {
      const x = A4[0] / 2 + 20;
      await drawSignature(doc, p.page, sig.branch, x, bmNameY + size + 2, fonts.regular);
      p.page.drawText(clean(n.branchManager.name), { x, y: bmNameY, size, font: fonts.bold, color: INK });
      if (n.branchManager.title) p.page.drawText(clean(n.branchManager.title), { x, y: bmNameY - size * 1.5, size, font: fonts.bold, color: INK });
    }
    p.y = (n.branchManager ? bmNameY : nameY) - size * 1.5 - 34;
    p.ensure(70);
    const recY = p.y - 40;
    await drawSignature(doc, p.page, sig.employee, MARGIN + 175, recY + 6, fonts.regular);
    p.page.drawText("Received and acknowledged by: ______________________________________", { x: MARGIN, y: recY, size, font: fonts.regular, color: INK });
    p.y = recY - 20;
  }
  return doc.save();
}

// ---- Notice of Sanction ------------------------------------------------------

export interface TardinessSanctionInput {
  companyName: string;
  companyShort: string;
  companyAddress: string;
  companyContact: string;
  letterhead: Uint8Array | null;
  employeeName: string;
  issueDate: string;
  month: string;
  cc: { name: string; title: string } | null;
  nteDate: string;
  explanationDate: string | null;
  daysLate: number;
  offense: number;
  sanction: string;
  suspensionFrom: string | null;
  suspensionTo: string | null;
  findings: string;
  // Late days HR excused on the managers' recommendation, with the reasons.
  excused?: { date: string; reason: string }[];
  signatures?: { hr?: SignatureMark | null; employee?: SignatureMark | null };
}

const ORDINAL = ["", "FIRST", "SECOND", "THIRD", "FOURTH", "FIFTH", "SIXTH"];
const dayAfter = (iso: string) => new Date(Date.parse(`${iso}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);

export async function buildTardinessSanctionPdf(n: TardinessSanctionInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Notice of Sanction - Habitual Tardiness - ${n.employeeName}`);
  doc.setProducer("LSM Group HRIS");
  const fonts = { regular: await doc.embedFont(StandardFonts.TimesRoman), bold: await doc.embedFont(StandardFonts.TimesRomanBold) };
  const head = n.letterhead ? await doc.embedPng(n.letterhead).catch(() => null) : null;
  const p = new Page(doc, fonts, head, { name: n.companyName, sub: `Human Resources Department · ${[n.companyAddress, n.companyContact].filter(Boolean).join(" · ")}` });
  p.field("TO:", n.employeeName);
  p.field("FROM:", `${n.companyShort} Human Resource Department`);
  p.field("DATE:", longDate(n.issueDate));
  p.field("RE:", "Notice of Sanction - Habitual Tardiness");
  if (n.cc) p.field("CC.:", n.cc.name);
  p.page.drawLine({ start: { x: MARGIN, y: p.y - 2 }, end: { x: A4[0] - MARGIN, y: p.y - 2 }, thickness: 1, color: INK });
  p.y -= 18;

  p.para([
    { t: "This refers to the Notice to Explain dated " },
    { t: longDate(n.nteDate), bold: true },
    { t: " regarding your habitual tardiness for the month of " },
    { t: monthLabel(n.month).toUpperCase(), bold: true, underline: true },
    { t: ", in which you were late for " },
    { t: `${numberWords(n.daysLate)} (${n.daysLate}) times`, bold: true, underline: true },
    { t: "." },
  ]);
  p.para([
    {
      t: n.explanationDate
        ? `The Company has received and carefully evaluated your written explanation submitted on ${longDate(n.explanationDate)}.`
        : "The Company has given you the opportunity to explain, and has carefully evaluated the matter.",
    },
  ]);
  if (n.excused?.length) {
    const left = n.daysLate - n.excused.length;
    p.para([
      { t: "Upon the recommendation of your Department / Branch Manager, " },
      { t: `${numberWords(n.excused.length)} (${n.excused.length})`, bold: true },
      { t: ` of these days ${n.excused.length === 1 ? "was" : "were"} excused: ${n.excused.map((x) => `${mdY(x.date)} (${x.reason})`).join("; ")}. This leaves ` },
      { t: `${numberWords(left)} (${left}) days`, bold: true, underline: true },
      { t: " of tardiness." },
    ]);
  }
  for (const para of n.findings.split(/\n\s*\n/).map((x) => x.trim()).filter(Boolean)) p.para([{ t: para.replace(/\s*\n\s*/g, " ") }]);
  const susp = n.suspensionFrom && n.suspensionTo;
  p.para([
    { t: `In accordance with the Company Policy of ${n.companyName} on habitual tardiness, and this being your ` },
    { t: `${ORDINAL[n.offense] ?? `${n.offense}th`} OFFENSE`, bold: true },
    { t: ", you are hereby meted the sanction of " },
    { t: n.sanction.toUpperCase(), bold: true, underline: true },
    ...(susp
      ? [
          { t: ", to be served from " },
          { t: longDate(n.suspensionFrom!), bold: true },
          { t: " to " },
          { t: longDate(n.suspensionTo!), bold: true },
          { t: `. You are expected to report back to work on ${longDate(dayAfter(n.suspensionTo!))}` },
        ]
      : []),
    { t: "." },
  ]);
  p.para([{ t: "Please be reminded that a repetition of the same or a similar offense shall be dealt with more severely, in accordance with the Company Policy." }]);
  p.para([{ t: "For your information and strict compliance." }], 11.5, 6);
  p.text("Thank you!", { gap: 14 });

  const sig = n.signatures ?? {};
  p.ensure(130);
  const top = p.y;
  const size = 11.5;
  const nameY = top - size - 54;
  p.page.drawText("Issued by:", { x: MARGIN, y: top - size, size, font: fonts.regular, color: INK });
  await drawSignature(doc, p.page, sig.hr, MARGIN, nameY + size + 2, fonts.regular);
  p.page.drawText(sig.hr?.name ? clean(sig.hr.name) : "HR DEPARTMENT", { x: MARGIN, y: nameY, size, font: fonts.bold, color: INK });
  if (sig.hr?.name) p.page.drawText("HR Manager", { x: MARGIN, y: nameY - size * 1.5, size, font: fonts.bold, color: INK });
  if (n.cc) {
    const x = A4[0] / 2 + 20;
    p.page.drawText("CC:", { x, y: top - size, size, font: fonts.regular, color: INK });
    p.page.drawText(clean(n.cc.name), { x, y: nameY, size, font: fonts.bold, color: INK });
    if (n.cc.title) p.page.drawText(clean(n.cc.title), { x, y: nameY - size * 1.5, size, font: fonts.bold, color: INK });
  }
  p.y = nameY - size * 1.5 - 34;
  p.ensure(70);
  const recY = p.y - 40;
  await drawSignature(doc, p.page, sig.employee, MARGIN + 175, recY + 6, fonts.regular);
  p.page.drawText("Received and acknowledged by: ______________________________________", { x: MARGIN, y: recY, size, font: fonts.regular, color: INK });
  return doc.save();
}
