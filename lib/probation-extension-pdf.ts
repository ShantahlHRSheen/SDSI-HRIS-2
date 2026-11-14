import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import { longDate, peBlocks, peConforme, type PeData, type PeSigner, type Run } from "./probation-extension";

// The Extension of Probationary Employment letter (8.5 × 13 in, Times):
// letterhead, the letter (peBlocks), the signatures, and the CONFORME.

const W = 612;
const H = 936;
const M = 72;
const SIZE = 11;
const LEAD = 15;
const INK = rgb(0, 0, 0);
const GREY = rgb(0.35, 0.35, 0.35);

const clean = (t: string) =>
  t
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/₱/g, "P")
    .replace(/[^\x20-\x7E\xA0-\xFF\u2022]/g, "?");

export interface PePdfInput {
  data: PeData;
  signatures: Partial<Record<PeSigner, Uint8Array>>;
  signedAt: Partial<Record<PeSigner, string | null>>;
  headerLines: string[];
}

export async function buildProbationExtensionPdf(input: PePdfInput): Promise<Uint8Array> {
  const d = input.data;
  const doc = await PDFDocument.create();
  doc.setTitle(`Extension of Probationary Employment - ${d.employeeName}`);
  const font = await doc.embedFont(StandardFonts.TimesRoman);
  const bold = await doc.embedFont(StandardFonts.TimesRomanBold);
  const italic = await doc.embedFont(StandardFonts.TimesRomanItalic);
  const sigs: Partial<Record<PeSigner, PDFImage>> = {};
  for (const [k, v] of Object.entries(input.signatures) as [PeSigner, Uint8Array][]) {
    const img = await doc.embedPng(v).catch(() => null);
    if (img) sigs[k] = img;
  }

  let page: PDFPage = doc.addPage([W, H]);
  let y = H - M;
  const newPage = () => {
    page = doc.addPage([W, H]);
    y = H - M;
  };
  const ensure = (h: number) => {
    if (y - h < M) newPage();
  };
  const text = (t: string, x: number, yy: number, f: PDFFont = font, size = SIZE, color = INK) => page.drawText(clean(t), { x, y: yy, size, font: f, color });
  const centered = (t: string, yy: number, f: PDFFont, size: number, color = INK) => text(t, (W - f.widthOfTextAtSize(clean(t), size)) / 2, yy, f, size, color);

  // A paragraph of runs, justified (last line left).
  function para(runs: Run[], opts: { indent?: number; right?: number; hang?: string; after?: number; align?: "justify" | "left"; size?: number } = {}) {
    const size = opts.size ?? SIZE;
    const left = M + (opts.indent ?? 0);
    const width = W - M - (opts.right ?? 0) - left;
    const words: { w: string; f: PDFFont }[] = [];
    for (const r of runs) for (const w of clean(r.t).split(/(\s+)/)) if (w) words.push({ w, f: r.b ? bold : font });
    const lines: (typeof words)[] = [];
    let line: typeof words = [];
    let lw = 0;
    for (const p of words) {
      const pw = p.f.widthOfTextAtSize(p.w, size);
      if (lw + pw > width && p.w.trim() && line.length) {
        lines.push(line);
        line = [];
        lw = 0;
      }
      if (!line.length && !p.w.trim()) continue;
      line.push(p);
      lw += pw;
    }
    if (line.length) lines.push(line);
    lines.forEach((ln, i) => {
      while (ln.length && !ln[ln.length - 1].w.trim()) ln.pop();
      ensure(LEAD);
      if (i === 0 && opts.hang) text(opts.hang, left - 16, y - size, font, size);
      const natural = ln.reduce((s, p) => s + p.f.widthOfTextAtSize(p.w, size), 0);
      const gaps = ln.filter((p) => !p.w.trim()).length;
      const extra = (opts.align ?? "justify") === "justify" && i < lines.length - 1 && gaps ? (width - natural) / gaps : 0;
      let x = left;
      for (const p of ln) {
        const pw = p.f.widthOfTextAtSize(p.w, size);
        if (p.w.trim()) page.drawText(p.w, { x, y: y - size, size, font: p.f, color: INK });
        x += pw + (p.w.trim() ? 0 : extra);
      }
      y -= LEAD;
    });
    y -= opts.after ?? 7;
  }

  // ---- Letterhead ----
  centered(d.employerName.toUpperCase(), y - 14, bold, 15);
  y -= 22;
  for (const l of input.headerLines) {
    centered(l, y - 10, font, 9.5, GREY);
    y -= 12;
  }
  y -= 6;
  page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 1.2, color: INK });
  y -= 22;

  // ---- The letter ----
  for (const b of peBlocks(d)) {
    if (b.k === "date") para([{ t: b.t }], { after: 10, align: "left" });
    else if (b.k === "address") {
      for (const l of b.lines) para(l, { after: 0, align: "left" });
      y -= 10;
    } else if (b.k === "subject") {
      para([{ t: "Subject: ", b: true }, { t: b.t, b: true }], { after: 10, align: "left" });
    } else if (b.k === "p") para(b.runs);
    else if (b.k === "h") {
      ensure(LEAD * 3);
      y -= 3;
      para([{ t: b.t, b: true }], { after: 4, align: "left" });
    } else if (b.k === "list") {
      b.items.forEach((it, i) => para(it, { indent: 32, hang: b.numbered ? `${i + 1}.` : "•", after: 4 }));
      y -= 4;
    } else if (b.k === "scores") {
      const cols = [M + 10, M + 300, M + 380];
      const rowH = 18;
      ensure(rowH * (b.rows.length + 2) + 10);
      const top = y;
      const rowLine = (yy: number) => page.drawLine({ start: { x: M, y: yy }, end: { x: W - M, y: yy }, thickness: 0.6, color: INK });
      rowLine(y);
      text("Criteria", cols[0], y - 13, bold);
      text("Weight", cols[1], y - 13, bold);
      text("Score", cols[2], y - 13, bold);
      y -= rowH;
      rowLine(y);
      for (const r of b.rows) {
        text(r[0], cols[0], y - 13);
        text(r[1], cols[1], y - 13);
        text(r[2], cols[2], y - 13);
        y -= rowH;
        rowLine(y);
      }
      text(b.total[0], cols[0], y - 13, bold);
      text(b.total[1], cols[2], y - 13, bold);
      y -= rowH;
      rowLine(y);
      for (const x of [M, cols[1] - 10, cols[2] - 10, W - M]) page.drawLine({ start: { x, y: top }, end: { x, y }, thickness: 0.6, color: INK });
      y -= 12;
    }
  }

  // ---- Signatures ----
  const signedOn = (as: PeSigner) => {
    const at = input.signedAt[as];
    return at ? `Signed ${longDate(at.slice(0, 10))}` : "";
  };
  function signBlock(x: number, top: number, who: PeSigner, label: string, name: string, title: string) {
    if (label) text(label, x, top - 11);
    const img = sigs[who];
    const lineY = top - 58;
    if (img) {
      const sc = Math.min(150 / img.width, 40 / img.height, 1);
      page.drawImage(img, { x: x + 4, y: lineY + 2, width: img.width * sc, height: img.height * sc });
    }
    text(name.toUpperCase(), x, lineY - 12, bold);
    text(title, x, lineY - 25);
    const s = signedOn(who);
    if (s) text(s, x, lineY - 37, italic, 8.5, GREY);
  }
  const blockH = 110;
  ensure(blockH * 2 + 10);
  signBlock(M, y, "hr", "Sincerely,", d.hrName, d.hrTitle);
  signBlock(M + 250, y, "noted", "Noted by:", d.notedName, d.notedTitle);
  y -= blockH;
  signBlock(M, y, "approved", "Approved by:", d.approverName, d.approverTitle);
  y -= blockH;

  // ---- CONFORME ----
  const conf = [{ t: peConforme(d) }];
  ensure(190);
  y -= 6;
  const boxTop = y;
  y -= 12;
  centered("CONFORME", y - 11, bold, 12);
  y -= 24;
  para(conf, { indent: 14, right: 14 });
  const lineY = y - 46;
  const img = sigs.employee;
  if (img) {
    const sc = Math.min(160 / img.width, 42 / img.height, 1);
    page.drawImage(img, { x: M + 30, y: lineY + 2, width: img.width * sc, height: img.height * sc });
  }
  page.drawLine({ start: { x: M + 20, y: lineY }, end: { x: M + 250, y: lineY }, thickness: 0.6, color: INK });
  text(d.employeeName.toUpperCase(), M + 20, lineY - 13, bold);
  text("Signature over Printed Name", M + 20, lineY - 26);
  const at = input.signedAt.employee;
  text("Date:", M + 300, lineY + 4);
  page.drawLine({ start: { x: M + 330, y: lineY }, end: { x: W - M - 20, y: lineY }, thickness: 0.6, color: INK });
  if (at) text(longDate(at.slice(0, 10)), M + 336, lineY + 4);
  y = lineY - 40;
  page.drawRectangle({ x: M, y, width: W - 2 * M, height: boxTop - y, borderColor: INK, borderWidth: 0.9 });

  return doc.save();
}
