import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib";
import { CASE_STATUS, inlineRuns, textBlocks, type ConfidentialCase } from "./confidential-cases";

// A confidential case report as HR writes it (8.5 × 11 in): title, the
// CONFIDENTIAL line, summary, details table, sections (text or tables),
// actions and next steps, and the sign-off lines. Every page is marked
// confidential.

const W = 612;
const H = 792;
const M = 54;
const SIZE = 10;
const LEAD = 13.5;
const INK = rgb(0.1, 0.1, 0.1);
const MUTED = rgb(0.4, 0.4, 0.4);
const RED = rgb(0.7, 0.1, 0.1);
const GRID = rgb(0.6, 0.6, 0.6);
const SHADE = rgb(0.92, 0.92, 0.92);

const clean = (t: string) =>
  t
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/[☒✓]/g, "[x]")
    .replace(/[☐]/g, "[ ]")
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, "?");
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const longDate = (d: string) => (d ? `${MONTHS[Number(d.slice(5, 7)) - 1]} ${Number(d.slice(8, 10))}, ${d.slice(0, 4)}` : "");

export async function buildCasePdf(c: ConfidentialCase, companyName: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`CONFIDENTIAL - ${c.title}`);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const italic = await doc.embedFont(StandardFonts.HelveticaOblique);
  let page: PDFPage = doc.addPage([W, H]);
  let y = H - M;
  const newPage = () => {
    page = doc.addPage([W, H]);
    y = H - M;
  };
  const ensure = (h: number) => {
    if (y - h < M + 14) newPage();
  };

  function wrapRuns(runs: { t: string; b: boolean }[], width: number, size: number): { w: string; f: PDFFont }[][] {
    const words: { w: string; f: PDFFont }[] = [];
    for (const r of runs) for (const w of clean(r.t).split(/(\s+)/)) if (w) words.push({ w, f: r.b ? bold : font });
    const lines: { w: string; f: PDFFont }[][] = [];
    let line: { w: string; f: PDFFont }[] = [];
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
    return lines;
  }
  function para(text: string, opts: { indent?: number; size?: number; after?: number; bullet?: boolean; color?: ReturnType<typeof rgb>; italic?: boolean } = {}) {
    const size = opts.size ?? SIZE;
    const left = M + (opts.indent ?? 0);
    const lines = wrapRuns(opts.italic ? [{ t: text, b: false }] : inlineRuns(text), W - M - left, size);
    lines.forEach((ln, i) => {
      ensure(LEAD);
      if (opts.bullet && i === 0) page.drawText("-", { x: left - 9, y: y - size, size, font, color: INK });
      let x = left;
      for (const p of ln) {
        if (p.w.trim()) page.drawText(p.w, { x, y: y - size, size, font: opts.italic ? italic : p.f, color: opts.color ?? INK });
        x += p.f.widthOfTextAtSize(p.w, size);
      }
      y -= LEAD;
    });
    y -= opts.after ?? 5;
  }
  const heading = (t: string) => {
    ensure(40);
    y -= 6;
    page.drawText(clean(t), { x: M, y: y - 12, size: 12, font: bold, color: INK });
    y -= 20;
  };
  // A table with wrapped cells; the first row shaded as the header.
  function table(rows: string[][], widths?: number[]) {
    const cols = Math.max(...rows.map((r) => r.length));
    const full = W - 2 * M;
    const ws = widths ?? Array.from({ length: cols }, () => full / cols);
    rows.forEach((r, ri) => {
      const cells = ws.map((w, ci) => wrapRuns(ri === 0 ? [{ t: r[ci] ?? "", b: true }] : inlineRuns(r[ci] ?? ""), w - 8, 9));
      const h = Math.max(16, ...cells.map((l) => l.length * 12 + 6));
      ensure(h);
      let x = M;
      cells.forEach((lines, ci) => {
        page.drawRectangle({ x, y: y - h, width: ws[ci], height: h, borderColor: GRID, borderWidth: 0.5, color: ri === 0 ? SHADE : undefined });
        lines.forEach((ln, li) => {
          let tx = x + 4;
          for (const p of ln) {
            if (p.w.trim()) page.drawText(p.w, { x: tx, y: y - 12 - li * 12, size: 9, font: p.f, color: INK });
            tx += p.f.widthOfTextAtSize(p.w, 9);
          }
        });
        x += ws[ci];
      });
      y -= h;
    });
    y -= 8;
  }

  // ---- Title ---------------------------------------------------------------------
  page.drawText(clean(companyName.toUpperCase()), { x: M, y: y - 9, size: 9, font: bold, color: MUTED });
  y -= 22;
  for (const ln of wrapRuns([{ t: c.title, b: true }], W - 2 * M, 17)) {
    page.drawText(ln.map((p) => p.w).join(""), { x: M, y: y - 17, size: 17, font: bold, color: INK });
    y -= 22;
  }
  para(`${longDate(c.caseDate)} · ${CASE_STATUS[c.status].label}`, { color: MUTED, size: 9 });
  para("**CONFIDENTIAL — For the Chairman, the Vice Chairperson and HR only.**", { color: RED, after: 6 });
  if (c.summary.trim()) para(c.summary, { italic: true, after: 8 });

  // ---- Details -------------------------------------------------------------------
  const details = c.details.filter((d) => d.label.trim() || d.value.trim());
  if (details.length) {
    heading("Report Details");
    table([["Item", "Details"], ...details.map((d) => [d.label, d.value])], [150, W - 2 * M - 150]);
  }

  // ---- Sections ------------------------------------------------------------------
  for (const s of c.sections) {
    if (s.heading.trim()) heading(s.heading);
    if (s.kind === "table") {
      const rows = s.rows.filter((r, i) => i === 0 || r.some((x) => x.trim()));
      if (rows.length > 1) table(rows);
    } else {
      for (const b of textBlocks(s.body)) {
        if (b.kind === "p") para(b.text);
        else {
          for (const it of b.items) para(it, { indent: 14, bullet: true, after: 1 });
          y -= 4;
        }
      }
    }
  }

  // ---- Written explanations ------------------------------------------------------
  if (c.explanations.length) {
    heading("Written Explanations");
    table(
      [["Name", "Requested", "Signed explanation"], ...c.explanations.map((x) => [x.name, x.requestedOn ? longDate(x.requestedOn) : "-", x.receivedOn ? `Received ${longDate(x.receivedOn)}` : "Awaiting"])],
      [200, 130, W - 2 * M - 330],
    );
  }

  // ---- Actions -------------------------------------------------------------------
  if (c.actions.length) {
    heading("Actions Taken and Next Steps");
    const done = c.actions.filter((a) => a.done);
    const todo = c.actions.filter((a) => !a.done);
    if (done.length) {
      para("**Done:**", { after: 2 });
      for (const a of done) para(`[x] ${a.text}`, { indent: 10, after: 1 });
      y -= 4;
    }
    if (todo.length) {
      para("**Pending / next steps:**", { after: 2 });
      for (const a of todo) para(`[ ] ${a.text}`, { indent: 10, after: 1 });
      y -= 4;
    }
  }

  // ---- Sign-off ------------------------------------------------------------------
  if (c.signoff.length) {
    // The heading stays with the lines.
    ensure(120);
    heading("Sign-off");
    const cw = (W - 2 * M) / c.signoff.length;
    c.signoff.forEach((s, i) => {
      const x = M + i * cw + 6;
      page.drawText(clean(s.label), { x, y: y - 10, size: 9, font: bold, color: INK });
      page.drawLine({ start: { x, y: y - 42 }, end: { x: x + cw - 18, y: y - 42 }, thickness: 0.6, color: INK });
      page.drawText(clean(s.title), { x, y: y - 54, size: 9, font, color: INK });
      page.drawText("Date: ________", { x, y: y - 67, size: 9, font, color: INK });
    });
    y -= 80;
  }

  // Every page: CONFIDENTIAL and page numbers.
  const pages = doc.getPages();
  pages.forEach((p, i) => {
    p.drawText("CONFIDENTIAL", { x: M, y: 24, size: 8, font: bold, color: RED });
    const t = `Page ${i + 1} of ${pages.length}`;
    p.drawText(t, { x: W - M - font.widthOfTextAtSize(t, 8), y: 24, size: 8, font, color: MUTED });
  });
  return doc.save();
}
