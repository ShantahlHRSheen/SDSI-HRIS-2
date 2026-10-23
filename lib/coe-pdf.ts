import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import { coeParagraphs, type CoeData, type Run } from "./coe";

// The Certificate of Employment, laid out like HR's template (8.5 × 13 in):
// letterhead banner across the top, the title, justified paragraphs over a
// faint company watermark, HR's signature over their name and contact
// lines, and the footer band at the bottom.

const PAGE: [number, number] = [612, 936];
const MARGIN = 72;
const SIZE = 11;
const LEADING = 20.5;
const INK = rgb(0, 0, 0);

const clean = (t: string) =>
  t
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, "?");

interface Fonts {
  regular: PDFFont;
  bold: PDFFont;
  italic: PDFFont;
  boldItalic: PDFFont;
}
const fontOf = (f: Fonts, r: { bold?: boolean; italic?: boolean }) => (r.bold ? (r.italic ? f.boldItalic : f.bold) : r.italic ? f.italic : f.regular);

export interface CoeImages {
  header?: Uint8Array | null; // JPEG or PNG
  footer?: Uint8Array | null;
  watermark?: Uint8Array | null;
  signature?: Uint8Array | null; // PNG
}

async function embed(doc: PDFDocument, bytes: Uint8Array | null | undefined): Promise<PDFImage | null> {
  if (!bytes) return null;
  const png = bytes[0] === 0x89 && bytes[1] === 0x50;
  return (png ? doc.embedPng(bytes) : doc.embedJpg(bytes)).catch(() => null);
}

// Justified paragraph (the last line left-aligned); returns the new y.
function paragraph(page: PDFPage, f: Fonts, runs: Run[], y: number): number {
  const width = PAGE[0] - MARGIN * 2;
  const words: { w: string; font: PDFFont }[] = [];
  for (const r of runs) for (const w of clean(r.t).split(/(\s+)/)) if (w) words.push({ w, font: fontOf(f, r) });
  const lines: (typeof words)[] = [];
  let line: typeof words = [];
  let lineW = 0;
  for (const part of words) {
    const pw = part.font.widthOfTextAtSize(part.w, SIZE);
    if (lineW + pw > width && part.w.trim() && line.length) {
      lines.push(line);
      line = [];
      lineW = 0;
    }
    if (!line.length && !part.w.trim()) continue;
    line.push(part);
    lineW += pw;
  }
  if (line.length) lines.push(line);
  lines.forEach((ln, i) => {
    while (ln.length && !ln[ln.length - 1].w.trim()) ln.pop();
    const natural = ln.reduce((s, p) => s + p.font.widthOfTextAtSize(p.w, SIZE), 0);
    const gaps = ln.filter((p) => !p.w.trim()).length;
    const extra = i < lines.length - 1 && gaps ? (width - natural) / gaps : 0;
    let x = MARGIN;
    for (const p of ln) {
      const pw = p.font.widthOfTextAtSize(p.w, SIZE);
      if (p.w.trim()) page.drawText(p.w, { x, y: y - SIZE, size: SIZE, font: p.font, color: INK });
      x += pw + (p.w.trim() ? 0 : extra);
    }
    y -= LEADING;
  });
  return y;
}

export async function buildCoePdf(d: CoeData, images: CoeImages = {}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`COE - ${d.fullName}`);
  doc.setProducer("LSM Group HRIS");
  const f: Fonts = {
    regular: await doc.embedFont(StandardFonts.TimesRoman),
    bold: await doc.embedFont(StandardFonts.TimesRomanBold),
    italic: await doc.embedFont(StandardFonts.TimesRomanItalic),
    boldItalic: await doc.embedFont(StandardFonts.TimesRomanBoldItalic),
  };
  const page = doc.addPage(PAGE);
  const [W, H] = PAGE;

  const header = await embed(doc, images.header);
  const footer = await embed(doc, images.footer);
  const watermark = await embed(doc, images.watermark);
  let top = H - 40;
  if (header) {
    const h = (W * header.height) / header.width;
    page.drawImage(header, { x: 0, y: H - h, width: W, height: h });
    top = H - h;
  } else {
    const name = clean(d.company);
    page.drawText(name, { x: (W - f.bold.widthOfTextAtSize(name, 14)) / 2, y: H - 56, size: 14, font: f.bold, color: INK });
    top = H - 70;
  }
  if (footer) {
    const h = (W * footer.height) / footer.width;
    page.drawImage(footer, { x: 0, y: 0, width: W, height: h });
  }
  if (watermark) {
    const w = W - MARGIN * 2 - 10;
    const h = (w * watermark.height) / watermark.width;
    page.drawImage(watermark, { x: (W - w) / 2, y: H * 0.42, width: w, height: h });
  }

  const title = "CERTIFICATE OF EMPLOYMENT";
  page.drawText(title, { x: (W - f.bold.widthOfTextAtSize(title, 20)) / 2, y: top - 92, size: 20, font: f.bold, color: INK });

  let y = top - 140;
  for (const p of coeParagraphs(d)) y = paragraph(page, f, p, y) - LEADING * 1.2;

  // Signature over the name, then title / contact / email.
  y -= 30;
  const nameY = y;
  const sig = await embed(doc, images.signature);
  if (sig) {
    const scale = Math.min(150 / sig.width, 60 / sig.height, 1);
    page.drawImage(sig, { x: MARGIN, y: nameY - 8, width: sig.width * scale, height: sig.height * scale });
  }
  page.drawText(clean(d.signer.name.toUpperCase()), { x: MARGIN, y: nameY, size: 11, font: f.bold, color: INK });
  let ly = nameY - 12.5;
  for (const t of [d.signer.title, d.signer.contact].filter(Boolean)) {
    page.drawText(clean(t), { x: MARGIN, y: ly, size: 9, font: f.regular, color: INK });
    ly -= 11;
  }
  if (d.signer.email) {
    const blue = rgb(0.07, 0.33, 0.8);
    page.drawText(clean(d.signer.email), { x: MARGIN, y: ly, size: 9, font: f.regular, color: blue });
    page.drawLine({ start: { x: MARGIN, y: ly - 1.5 }, end: { x: MARGIN + f.regular.widthOfTextAtSize(clean(d.signer.email), 9), y: ly - 1.5 }, thickness: 0.5, color: blue });
  }
  return doc.save();
}
