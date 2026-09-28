import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { COMPANY_INFO } from "./bir";
import { DISCIPLINARY_LABELS, type DisciplinaryRecord } from "./types";

// Builds the downloadable "complete file" for a disciplinary record:
//   1. the NTE / sanction PDF exactly as issued,
//   2. an acknowledgement page — the employee's signature with the date and
//      time they acknowledged receipt — followed by their typed explanation,
//   3. the file they attached as their written explanation (PDF pages, or
//      their photo on its own page).

export interface ResponsePdfInput {
  record: DisciplinaryRecord;
  employeeName: string;
  employeeNumber: string;
  position: string;
  department: string;
  issuedByName: string;
  notice: Blob | null;
  signature: Blob | null;
  explanationFile: Blob | null;
}

const A4: [number, number] = [595.28, 841.89];
const MARGIN = 56;
const INK = rgb(0.07, 0.07, 0.07);
const MUTED = rgb(0.35, 0.35, 0.35);

// The standard PDF fonts only cover Latin-1, so other characters (emoji,
// curly quotes, ₱) are replaced with plain equivalents.
function clean(text: string): string {
  return text
    .replace(/[‘’‚′]/g, "'")
    .replace(/[“”„″]/g, '"')
    .replace(/[–—−]/g, "-")
    .replace(/…/g, "...")
    .replace(/₱/g, "PHP ")
    .replace(/\t/g, "    ")
    .replace(/[^\n\x20-\x7E\xA0-\xFF]/g, "?");
}

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const out: string[] = [];
  for (const para of clean(text).split(/\r?\n/)) {
    if (!para.trim()) {
      out.push("");
      continue;
    }
    let line = "";
    for (const word of para.split(/ +/)) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= width) {
        line = candidate;
        continue;
      }
      if (line) out.push(line);
      // A single word longer than the line is split by characters.
      let rest = word;
      while (font.widthOfTextAtSize(rest, size) > width) {
        let n = rest.length;
        while (n > 1 && font.widthOfTextAtSize(rest.slice(0, n), size) > width) n--;
        out.push(rest.slice(0, n));
        rest = rest.slice(n);
      }
      line = rest;
    }
    out.push(line);
  }
  return out;
}

export function manilaDateTime(iso: string): string {
  return new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", year: "numeric", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}

const longDate = (d: string) => new Intl.DateTimeFormat("en-PH", { timeZone: "UTC", year: "numeric", month: "long", day: "numeric" }).format(new Date(`${d}T00:00:00Z`));

class Writer {
  page!: PDFPage;
  y = 0;
  constructor(
    private doc: PDFDocument,
    public font: PDFFont,
    public bold: PDFFont,
  ) {
    this.newPage();
  }
  newPage() {
    this.page = this.doc.addPage(A4);
    this.y = A4[1] - MARGIN;
  }
  ensure(h: number) {
    if (this.y - h < MARGIN) this.newPage();
  }
  text(t: string, opts: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; indent?: number; gap?: number } = {}) {
    const size = opts.size ?? 10.5;
    const f = opts.bold ? this.bold : this.font;
    const width = A4[0] - MARGIN * 2 - (opts.indent ?? 0);
    for (const line of wrap(t, f, size, width)) {
      this.ensure(size * 1.45);
      this.page.drawText(line, { x: MARGIN + (opts.indent ?? 0), y: this.y - size, size, font: f, color: opts.color ?? INK });
      this.y -= size * 1.45;
    }
    this.y -= opts.gap ?? 0;
  }
  row(label: string, value: string) {
    const size = 10;
    this.ensure(size * 1.5);
    this.page.drawText(clean(label), { x: MARGIN, y: this.y - size, size, font: this.font, color: MUTED });
    const lines = wrap(value || "-", this.bold, size, A4[0] - MARGIN * 2 - 130);
    lines.forEach((l, i) => this.page.drawText(l, { x: MARGIN + 130, y: this.y - size - i * size * 1.4, size, font: this.bold, color: INK }));
    this.y -= Math.max(1, lines.length) * size * 1.4 + 3;
  }
  rule() {
    this.ensure(12);
    this.page.drawLine({ start: { x: MARGIN, y: this.y - 4 }, end: { x: A4[0] - MARGIN, y: this.y - 4 }, thickness: 0.6, color: rgb(0.7, 0.7, 0.7) });
    this.y -= 14;
  }
}

async function embedImage(doc: PDFDocument, blob: Blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  // Sniff the bytes rather than trusting the stored type.
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return doc.embedPng(bytes);
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return doc.embedJpg(bytes);
  return null;
}

async function appendPdf(doc: PDFDocument, blob: Blob): Promise<boolean> {
  try {
    const src = await PDFDocument.load(await blob.arrayBuffer(), { ignoreEncryption: true });
    const pages = await doc.copyPages(src, src.getPageIndices());
    pages.forEach((p) => doc.addPage(p));
    return true;
  } catch {
    return false;
  }
}

export async function buildDisciplineResponsePdf(input: ResponsePdfInput): Promise<Uint8Array> {
  const { record } = input;
  const doc = await PDFDocument.create();
  doc.setTitle(`${DISCIPLINARY_LABELS[record.type]} - ${input.employeeName}`);
  doc.setProducer("Shantahl HRIS");

  const noticeIncluded = input.notice ? await appendPdf(doc, input.notice) : false;

  const w = new Writer(doc, await doc.embedFont(StandardFonts.Helvetica), await doc.embedFont(StandardFonts.HelveticaBold));
  w.text(COMPANY_INFO.name.toUpperCase(), { size: 12, bold: true });
  w.text(COMPANY_INFO.address, { size: 9, color: MUTED, gap: 10 });
  w.text("ACKNOWLEDGEMENT OF RECEIPT AND WRITTEN EXPLANATION", { size: 13, bold: true, gap: 6 });
  w.rule();
  w.row("Employee", `${input.employeeName} (${input.employeeNumber})`);
  w.row("Position / Department", `${input.position} / ${input.department}`);
  w.row("Notice", DISCIPLINARY_LABELS[record.type]);
  w.row("Date issued", longDate(record.date));
  w.row("Issued by", input.issuedByName);
  if (record.responseDue) w.row("Explanation due", longDate(record.responseDue));
  w.row(
    "Notice file",
    record.noticeFileName
      ? `${record.noticeFileName}${noticeIncluded ? " (attached before this page)" : input.notice ? " (could not be merged - download it separately)" : ""}`
      : "None attached",
  );
  w.y -= 4;
  w.text("Details", { size: 10, bold: true });
  w.text(record.description, { size: 10, gap: 8 });
  w.rule();

  w.text("ACKNOWLEDGEMENT OF RECEIPT", { size: 11, bold: true, gap: 4 });
  if (record.acknowledgedAt) {
    w.text(
      `I acknowledge that I have received this ${DISCIPLINARY_LABELS[record.type]}. My acknowledgement confirms receipt only and does not mean that I agree with its contents.`,
      { size: 10, gap: 8 },
    );
    const img = input.signature ? await embedImage(doc, input.signature) : null;
    if (img) {
      const scale = Math.min(200 / img.width, 70 / img.height, 1);
      const h = img.height * scale;
      w.ensure(h + 50);
      w.page.drawImage(img, { x: MARGIN, y: w.y - h, width: img.width * scale, height: h });
      w.y -= h + 4;
    }
    w.page.drawLine({ start: { x: MARGIN, y: w.y }, end: { x: MARGIN + 220, y: w.y }, thickness: 0.8, color: INK });
    w.y -= 4;
    w.text(input.employeeName, { size: 10, bold: true });
    w.text(`Signed electronically in the HRIS on ${manilaDateTime(record.acknowledgedAt)} (Philippine time)`, { size: 9, color: MUTED, gap: 10 });
  } else {
    w.text("Not yet acknowledged by the employee.", { size: 10, color: MUTED, gap: 10 });
  }
  w.rule();

  w.text("WRITTEN EXPLANATION", { size: 11, bold: true, gap: 4 });
  if (record.explanationSubmittedAt) {
    w.text(`Submitted on ${manilaDateTime(record.explanationSubmittedAt)} (Philippine time)`, { size: 9, color: MUTED, gap: 6 });
    if (record.explanation) w.text(record.explanation, { size: 10.5, gap: 8 });
    if (record.explanationFileName) w.text(`Attached file: ${record.explanationFileName} (on the following page${input.explanationFile ? "s" : ""})`, { size: 9.5, color: MUTED });
  } else {
    w.text(record.requiresExplanation ? "Not yet submitted by the employee." : "No written explanation was requested.", { size: 10, color: MUTED });
  }

  if (input.explanationFile) {
    const merged = await appendPdf(doc, input.explanationFile);
    if (!merged) {
      const img = await embedImage(doc, input.explanationFile);
      if (img) {
        const page = doc.addPage(A4);
        const maxW = A4[0] - MARGIN * 2;
        const maxH = A4[1] - MARGIN * 2 - 20;
        const scale = Math.min(maxW / img.width, maxH / img.height, 1);
        page.drawText(clean(`Written explanation - attached by ${input.employeeName}`), { x: MARGIN, y: A4[1] - MARGIN, size: 9, font: w.font, color: MUTED });
        page.drawImage(img, { x: MARGIN, y: A4[1] - MARGIN - 14 - img.height * scale, width: img.width * scale, height: img.height * scale });
      }
    }
  }
  return doc.save();
}
