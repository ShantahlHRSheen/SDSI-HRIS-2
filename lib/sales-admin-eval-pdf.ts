import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import {
  lengthOfService,
  monthSalesScore,
  requiredSales,
  saeHeads,
  saeScores,
  SAE_BEHAVIOR,
  SAE_BEHAVIOR_KRA,
  SAE_FORMS,
  SAE_OVERALL,
  SAE_SCALE,
  jobItems,
  saeWeights,
  type SaeSigner,
  type SalesAdminEvaluation,
} from "./sales-admin-eval";

// The evaluation as HR's Sales Admin workbook lays it out (8.5 × 13 in):
// Behavior (HR's rating), Job Performance (the head's rating), monthly sales
// (Sales Admin form only), the rating scale, the overall ratings, comments
// and signatures; then HR's certification with the evaluation summary and
// the Vice Chairperson's and Chairman's recommendations.

const W = 612;
const H = 936;
const M = 40;
const INK = rgb(0, 0, 0);
const GRID = rgb(0.55, 0.55, 0.55);
const SHADE = rgb(0.9, 0.93, 0.9);

const clean = (t: string) =>
  t
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/×/g, "x")
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, "?");
const money = (n: number) =>
  (Number(n) || 0).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
const fmt = (n: number) => n.toFixed(2);
const longDate = (d: string | null | undefined) =>
  d
    ? new Date(d.includes("T") ? d : `${d}T00:00:00Z`).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
        timeZone: d.includes("T") ? "Asia/Manila" : "UTC",
      })
    : "";

function wrap(font: PDFFont, text: string, size: number, maxW: number): string[] {
  const out: string[] = [];
  for (const para of text.split(/\n/).map(clean)) {
    let line = "";
    for (const word of para.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (line && font.widthOfTextAtSize(next, size) > maxW) {
        out.push(line);
        line = word;
      } else line = next;
    }
    out.push(line);
  }
  return out;
}

export interface SaeSignatory {
  name: string;
  title: string;
}

export interface SaePdfInput {
  evaluation: SalesAdminEvaluation;
  companyName: string;
  passMark: number;
  letterhead: Uint8Array | null;
  signatures: Partial<Record<SaeSigner, Uint8Array>>;
  head: SaeSignatory;
  head2?: SaeSignatory | null;
  hr: SaeSignatory;
  vc: SaeSignatory;
  chairman: SaeSignatory;
}

export async function buildSaePdf(input: SaePdfInput): Promise<Uint8Array> {
  const e = input.evaluation;
  const hr = e.hr;
  const heads = saeHeads(e);
  const info = hr?.employee;
  const doc = await PDFDocument.create();
  doc.setTitle(`${SAE_FORMS[e.form].title} - ${e.employeeName}`);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const italic = await doc.embedFont(StandardFonts.HelveticaOblique);
  const banner = input.letterhead ? await doc.embedPng(input.letterhead).catch(() => null) : null;
  const sigs: Partial<Record<SaeSigner, PDFImage>> = {};
  for (const [k, v] of Object.entries(input.signatures) as [SaeSigner, Uint8Array][]) {
    const img = await doc.embedPng(v).catch(() => null);
    if (img) sigs[k] = img;
  }
  const scores = saeScores(e.form, hr, heads, input.passMark);
  // The heads (one, or two for Cebu) and HR: ratings, comments, signatures.
  const two = heads.length > 1;
  const headCols = [
    { part: e.head, who: "head" as SaeSigner, s: input.head, at: e.headSignedAt },
    ...(two && input.head2 ? [{ part: e.head2, who: "head2" as SaeSigner, s: input.head2, at: e.head2SignedAt }] : []),
  ];
  const short = (name: string, fallback: string) => (name.trim() ? name.trim().split(/\s+/)[0] : fallback);
  const w = saeWeights(e.form);
  const asOf = (e.hrSignedAt ?? e.createdAt ?? new Date().toISOString()).slice(0, 10);

  let page: PDFPage = doc.addPage([W, H]);
  let y = H;
  const text = (t: string, x: number, top: number, size = 8, f: PDFFont = font, maxW = 500, align: "left" | "center" | "right" = "left") => {
    const s = clean(t);
    if (!s) return;
    let sz = size;
    while (sz > 5 && f.widthOfTextAtSize(s, sz) > maxW) sz -= 0.25;
    const w = f.widthOfTextAtSize(s, sz);
    page.drawText(s, {
      x: align === "center" ? x - w / 2 : align === "right" ? x - w : x,
      y: top,
      size: sz,
      font: f,
      color: INK,
    });
  };
  const rect = (x: number, top: number, w: number, h: number, fill = false) =>
    page.drawRectangle({
      x,
      y: top - h,
      width: w,
      height: h,
      borderColor: GRID,
      borderWidth: 0.6,
      color: fill ? SHADE : undefined,
    });
  const header = () => {
    y = H - 28;
    if (banner) {
      const bw = W - 2 * M;
      const bh = (banner.height / banner.width) * bw;
      page.drawImage(banner, { x: M, y: H - 20 - bh, width: bw, height: bh });
      y = H - 28 - bh;
    } else {
      text(input.companyName.toUpperCase(), W / 2, y - 10, 12, bold, 500, "center");
      y -= 24;
    }
  };
  const newPage = () => {
    page = doc.addPage([W, H]);
    header();
  };
  const ensure = (h: number) => {
    if (y - h < M) newPage();
  };
  // A table row with wrapped cells; returns its height.
  const row = (
    cells: {
      t: string;
      w: number;
      f?: PDFFont;
      align?: "left" | "center" | "right";
      size?: number;
    }[],
    fill = false,
    minH = 13,
  ) => {
    const lines = cells.map((c) => wrap(c.f ?? font, c.t, c.size ?? 7.5, c.w - 6));
    const h = Math.max(minH, ...lines.map((l, i) => l.length * ((cells[i].size ?? 7.5) + 2) + 4));
    ensure(h);
    let x = M;
    cells.forEach((c, i) => {
      rect(x, y, c.w, h, fill);
      const size = c.size ?? 7.5;
      lines[i].forEach((ln, j) => {
        const top = y - 3.5 - size - j * (size + 2) + 1;
        const tx = c.align === "center" ? x + c.w / 2 : c.align === "right" ? x + c.w - 3 : x + 3;
        text(ln, tx, top, size, c.f ?? font, c.w - 6, c.align ?? "left");
      });
      x += c.w;
    });
    y -= h;
  };
  const title = (t: string) => {
    ensure(22);
    y -= 8;
    text(t, M, y - 9, 9.5, bold);
    y -= 14;
  };
  const rating = (r: number | null | undefined) => (typeof r === "number" ? String(r) : "");

  header();
  text(SAE_FORMS[e.form].title, W / 2, y - 12, 12, bold, 500, "center");
  y -= 24;
  text([e.purpose, e.period].filter(Boolean).join(" - "), W / 2, y - 8, 9.5, bold, 500, "center");
  y -= 16;

  const full = W - 2 * M;
  row([
    { t: "Name:", w: 90, f: bold },
    { t: (info?.name || e.employeeName).toUpperCase(), w: full - 90 },
  ]);
  row([
    { t: "Position:", w: 90, f: bold },
    { t: info?.position ?? "", w: 180 },
    { t: "Department:", w: 80, f: bold },
    { t: info?.department ?? "", w: full - 350 },
  ]);
  row([
    { t: "Date hired:", w: 90, f: bold },
    { t: longDate(info?.dateHired), w: 180 },
    { t: "Length of service:", w: 80, f: bold },
    { t: lengthOfService(info?.dateHired, asOf), w: full - 350 },
  ]);

  // ---- Behavior --------------------------------------------------------------------
  title(`BEHAVIOR (${w.behavior}%) - rated by HR`);
  const kraW = 110;
  const rateW = 60;
  row(
    [
      { t: "KRA", w: kraW, f: bold, align: "center" },
      { t: "Behavior", w: full - kraW - rateW, f: bold, align: "center" },
      { t: "HR's rating", w: rateW, f: bold, align: "center" },
    ],
    true,
  );
  SAE_BEHAVIOR.forEach((item, i) =>
    row([
      { t: i === 0 ? SAE_BEHAVIOR_KRA : "", w: kraW, f: bold },
      { t: `${i + 1}. ${item}`, w: full - kraW - rateW },
      { t: rating(hr?.behavior[i]), w: rateW, align: "center", f: bold },
    ]),
  );
  row(
    [
      {
        t: `Behavior score (average ÷ 3 × ${w.behavior})`,
        w: full - rateW,
        f: bold,
        align: "right",
      },
      { t: fmt(scores.behavior), w: rateW, f: bold, align: "center" },
    ],
    true,
  );

  // ---- Job Performance -------------------------------------------------------------
  title(`JOB PERFORMANCE (${w.job}%) - rated by the Department Head${two ? "s (averaged)" : ""}`);
  const rateCols = two ? [...headCols.map((c, i) => `${short(c.s.name, `Head ${i + 1}`)}'s rating`), "Average"] : ["Head's rating"];
  const jobRateW = two ? 52 : rateW;
  const objW = full - kraW - 40 - jobRateW * rateCols.length;
  row(
    [
      { t: "KRA", w: kraW + 40, f: bold, align: "center" },
      { t: "Objective", w: objW, f: bold, align: "center" },
      ...rateCols.map((t) => ({ t, w: jobRateW, f: bold, align: "center" as const })),
    ],
    true,
  );
  jobItems(e.form).forEach((j, i) => {
    const rs = headCols.map((c) => c.part?.job?.[i]);
    const given = rs.filter((x): x is number => typeof x === "number");
    const cells = two ? [...rs.map(rating), given.length ? fmt(given.reduce((a, b) => a + b, 0) / given.length) : ""] : [rating(rs[0])];
    row([
      { t: j.kra, w: kraW + 40, f: bold },
      { t: j.objective, w: objW },
      ...cells.map((t) => ({ t, w: jobRateW, align: "center" as const, f: bold })),
    ]);
  });
  row(
    [
      {
        t: two ? `Job Performance score (average of both heads' ratings ÷ 3 × ${w.job})` : `Job Performance score (average ÷ 3 × ${w.job})`,
        w: full - jobRateW,
        f: bold,
        align: "right",
      },
      { t: fmt(scores.job), w: jobRateW, f: bold, align: "center" },
    ],
    true,
  );

  // ---- Sales -----------------------------------------------------------------------
  if (w.sales > 0) {
    title(`SALES (${w.sales}%)`);
    const sw = full / 5;
    row(
      ["Duration (month)", "Ads spent", "Required sales (3x ads)", "Gross sales", `Score (of ${w.sales})`].map((t) => ({ t, w: sw, f: bold, align: "center" as const })),
      true,
    );
    for (const m of hr?.sales ?? []) {
      const s = monthSalesScore(m);
      row([
        { t: m.month, w: sw, align: "center" },
        { t: money(m.ads), w: sw, align: "right" },
        { t: money(requiredSales(m)), w: sw, align: "right" },
        { t: money(m.gross), w: sw, align: "right" },
        { t: s === null ? "-" : fmt(s), w: sw, align: "center", f: bold },
      ]);
    }
    row(
      [
        {
          t: "Sales score (average of the months; each month gross ÷ required × 80, at most 80)",
          w: full - sw,
          f: bold,
          align: "right",
        },
        { t: fmt(scores.sales), w: sw, f: bold, align: "center" },
      ],
      true,
    );
  }

  // ---- Rating scale ----------------------------------------------------------------
  title("RATING SCALE");
  const qw = full / 4;
  row(
    SAE_SCALE.map((s) => ({
      t: `${s.value} - ${s.label}`,
      w: qw,
      f: bold,
      align: "center" as const,
    })),
    true,
  );
  row(
    SAE_SCALE.map((s) => ({
      t: s.tagalog,
      w: qw,
      f: italic,
      align: "center" as const,
    })),
  );

  // ---- Overall ratings, comments, signatures ----------------------------------------
  const half = full / 2;
  title("OVERALL RATING AND COMMENTS");
  const cols = [
    ...headCols.map((c, i) => ({ ...c, label: two ? `${short(c.s.name, `Head ${i + 1}`)}'s` : "Head's" })),
    { part: hr, who: "hr" as SaeSigner, s: input.hr, at: e.hrSignedAt, label: "HR's" },
  ];
  const colW = full / cols.length;
  const mark = (v: string | undefined) => SAE_OVERALL.map((o) => `${o === v ? "[X]" : "[  ]"} ${o}`).join(cols.length > 2 ? "\n" : "    ");
  row(
    cols.map((c) => ({ t: `${c.label} overall rating`, w: colW, f: bold, align: "center" as const })),
    true,
  );
  row(cols.map((c) => ({ t: mark(c.part?.overall), w: colW })));
  row(
    cols.map((c) => ({ t: `${c.label} comment and recommendation`, w: colW, f: bold, align: "center" as const })),
    true,
  );
  const cr = (p: { comment: string; recommendation: string } | null | undefined) => [p?.comment, p?.recommendation && `Recommendation: ${p.recommendation}`].filter(Boolean).join("\n\n");
  row(
    cols.map((c) => ({ t: cr(c.part), w: colW })),
    false,
    40,
  );

  const signBlock = (cx: number, top: number, who: SaeSigner, s: SaeSignatory, at: string | null, label: string, half = 95) => {
    const img = sigs[who];
    if (img) {
      const sc = Math.min(130 / img.width, 34 / img.height, 1);
      page.drawImage(img, {
        x: cx - (img.width * sc) / 2,
        y: top - 40,
        width: img.width * sc,
        height: img.height * sc,
      });
    }
    page.drawLine({
      start: { x: cx - half, y: top - 42 },
      end: { x: cx + half, y: top - 42 },
      thickness: 0.6,
      color: INK,
    });
    text(s.name.toUpperCase(), cx, top - 52, 8, bold, half * 2, "center");
    text(s.title, cx, top - 61, 7.5, font, half * 2, "center");
    text(at ? `${label} · ${longDate(at)}` : label, cx, top - 70, 6.5, italic, half * 2, "center");
  };
  ensure(80);
  cols.forEach((c, i) =>
    signBlock(M + colW * i + colW / 2, y - 4, c.who, c.s, c.at, c.who === "hr" ? "HR's signature" : "Department Head's signature", Math.min(95, colW / 2 - 8)),
  );
  y -= 80;

  // ---- HR certification ------------------------------------------------------------
  ensure(260);
  title("HR CERTIFICATION");
  const statusLabel = (s: string | undefined) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : "");
  row([
    { t: "Date hired:", w: 110, f: bold },
    { t: longDate(info?.dateHired), w: half - 110 },
    { t: "Length of service:", w: 110, f: bold },
    { t: lengthOfService(info?.dateHired, asOf), w: half - 110 },
  ]);
  row([
    { t: "Employment status:", w: 110, f: bold },
    { t: statusLabel(info?.employmentStatus), w: half - 110 },
    { t: "Contract expiration:", w: 110, f: bold },
    { t: longDate(info?.contractEnd), w: half - 110 },
  ]);
  y -= 6;
  row(
    [
      { t: "Evaluation summary", w: full - 120, f: bold },
      { t: "Score", w: 120, f: bold, align: "center" },
    ],
    true,
  );
  row([
    { t: `Behavior (${w.behavior}%)`, w: full - 120 },
    { t: fmt(scores.behavior), w: 120, align: "center" },
  ]);
  row([
    { t: `Job Performance (${w.job}%)`, w: full - 120 },
    { t: fmt(scores.job), w: 120, align: "center" },
  ]);
  if (w.sales > 0)
    row([
      { t: `Sales Score (${w.sales}%)`, w: full - 120 },
      { t: fmt(scores.sales), w: 120, align: "center" },
    ]);
  row(
    [
      { t: "Actual score", w: full - 120, f: bold },
      { t: fmt(scores.total), w: 120, f: bold, align: "center" },
    ],
    true,
  );
  row(
    [
      {
        t: `Remarks (passing score: ${input.passMark})`,
        w: full - 120,
        f: bold,
      },
      {
        t: scores.complete ? (scores.passed ? "PASSED" : "FAILED") : "INCOMPLETE",
        w: 120,
        f: bold,
        align: "center",
      },
    ],
    true,
  );

  // ---- Recommendations -------------------------------------------------------------
  const recommendation = (label: string, who: SaeSigner, s: SaeSignatory, textValue: string | null, at: string | null) => {
    const lines = wrap(font, textValue ?? "", 8, full - 12);
    ensure(36 + lines.length * 10 + 80);
    title(label);
    rect(M, y, full, Math.max(36, lines.length * 10 + 10));
    lines.forEach((ln, i) => text(ln, M + 6, y - 12 - i * 10, 8));
    y -= Math.max(36, lines.length * 10 + 10);
    signBlock(W - M - 110, y - 2, who, s, at, "Signature");
    y -= 78;
  };
  // No Vice Chairperson on the Sales Admin form.
  if (e.vcId || e.vcSignedAt) recommendation("VICE CHAIRPERSON'S RECOMMENDATION", "vc", input.vc, e.vcRecommendation, e.vcSignedAt);
  recommendation("CHAIRMAN'S RECOMMENDATION", "chairman", input.chairman, e.chairmanRecommendation, e.chairmanSignedAt);

  return doc.save();
}
