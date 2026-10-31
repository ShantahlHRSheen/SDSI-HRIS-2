import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import { regAllowanceTotal, type RegData, type RegSigner } from "./regularization";

// The Regular Contract of Employment, then the Notice of Regularization and
// Salary Adjustment, as HR's template lays them out (8.5 × 13 in, Times):
// justified paragraphs, bold names and headings, signatures over the names.

const W = 612;
const H = 936;
const M = 72;
const SIZE = 11;
const LEAD = 15;
const INK = rgb(0, 0, 0);

const clean = (t: string) =>
  t
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/₱/g, "P")
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, "?");
const money = (n: number) => (Number(n) || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const longDate = (d: string) => (d ? `${MONTHS[Number(d.slice(5, 7)) - 1]} ${Number(d.slice(8, 10))}, ${d.slice(0, 4)}` : "");
const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
const blank = (v: string, width = 30) => v.trim() || "_".repeat(width);

type Run = { t: string; b?: boolean };

export interface RegPdfInput {
  data: RegData;
  hrName: string;
  hrTitle: string;
  signatures: Partial<Record<RegSigner, Uint8Array>>;
  signedAt: { hr?: string | null; chairman?: string | null; employee?: string | null };
  headerLines: string[]; // under the employer's name on the notice
}

export async function buildRegularizationPdf(input: RegPdfInput): Promise<Uint8Array> {
  const d = input.data;
  const her = d.female ? "her" : "his";
  const doc = await PDFDocument.create();
  doc.setTitle(`Regularization - ${d.employeeName}`);
  const font = await doc.embedFont(StandardFonts.TimesRoman);
  const bold = await doc.embedFont(StandardFonts.TimesRomanBold);
  const sigs: Partial<Record<RegSigner, PDFImage>> = {};
  for (const [k, v] of Object.entries(input.signatures) as [RegSigner, Uint8Array][]) {
    const img = await doc.embedPng(v).catch(() => null);
    if (img) sigs[k] = img;
  }

  let page: PDFPage = doc.addPage([W, H]);
  let y = H - M;
  // Text size and line spacing (the notice is set a little tighter to fit a page).
  let size0 = SIZE;
  let lead = LEAD;
  const newPage = () => {
    page = doc.addPage([W, H]);
    y = H - M;
  };
  const ensure = (h: number) => {
    if (y - h < M) newPage();
  };
  const fontOf = (r: Run): PDFFont => (r.b ? bold : font);

  // A paragraph of runs, justified (last line left) or centered.
  function para(runs: Run[], opts: { align?: "justify" | "center" | "left"; indent?: number; size?: number; after?: number } = {}) {
    const size = opts.size ?? size0;
    const left = M + (opts.indent ?? 0);
    const width = W - M - left;
    const words: { w: string; f: PDFFont }[] = [];
    for (const r of runs) for (const w of clean(r.t).split(/(\s+)/)) if (w) words.push({ w, f: fontOf(r) });
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
      ensure(lead);
      const natural = ln.reduce((s, p) => s + p.f.widthOfTextAtSize(p.w, size), 0);
      const gaps = ln.filter((p) => !p.w.trim()).length;
      const align = opts.align ?? "justify";
      const extra = align === "justify" && i < lines.length - 1 && gaps ? (width - natural) / gaps : 0;
      let x = align === "center" ? left + (width - natural) / 2 : left;
      for (const p of ln) {
        const pw = p.f.widthOfTextAtSize(p.w, size);
        if (p.w.trim()) page.drawText(p.w, { x, y: y - size, size, font: p.f, color: INK });
        x += pw + (p.w.trim() ? 0 : extra);
      }
      y -= lead;
    });
    y -= opts.after ?? 7;
  }
  const heading = (...lines: string[]) => {
    ensure(LEAD * (lines.length + 2));
    for (const l of lines) para([{ t: l, b: true }], { align: "center", after: 0 });
    y -= 6;
  };
  // Name over a line, with a title below; the signature image above.
  function signBlock(cx: number, top: number, who: RegSigner | null, name: string, sub: string[]) {
    const img = who ? sigs[who] : undefined;
    if (img) {
      const sc = Math.min(140 / img.width, 38 / img.height, 1);
      page.drawImage(img, { x: cx - (img.width * sc) / 2, y: top - 30, width: img.width * sc, height: img.height * sc });
    }
    page.drawLine({ start: { x: cx - 105, y: top - 32 }, end: { x: cx + 105, y: top - 32 }, thickness: 0.6, color: INK });
    const nm = clean(name.toUpperCase());
    if (nm) page.drawText(nm, { x: cx - bold.widthOfTextAtSize(nm, SIZE) / 2, y: top - 45, size: SIZE, font: bold, color: INK });
    sub.forEach((s, i) => {
      const t = clean(s);
      page.drawText(t, { x: cx - font.widthOfTextAtSize(t, SIZE) / 2, y: top - 58 - i * 13, size: SIZE, font, color: INK });
    });
  }

  // ---- Regular Contract of Employment ------------------------------------------
  const cd = d.contractDate;
  heading("REGULAR CONTRACT OF EMPLOYMENT");
  y -= 4;
  para([
    { t: `This Contract of Employment is made and executed this ${cd ? `${ordinal(Number(cd.slice(8, 10)))} day of ${MONTHS[Number(cd.slice(5, 7)) - 1]} ${cd.slice(0, 4)}` : "____ day of ________"} in ${d.place}, by and between:` },
  ]);
  para([
    { t: d.employerName, b: true },
    { t: `, a corporation duly organized and existing under the laws of the Republic of the Philippines, with principal office at ${d.employerAddress}, represented herein by its ${d.signatory.title}, ` },
    { t: d.signatory.name.toUpperCase(), b: true },
    { t: ' (hereinafter referred to as the "EMPLOYER");' },
  ]);
  para([{ t: "- and -" }], { align: "center" });
  para([
    { t: d.employeeName, b: true },
    { t: `, of legal age, Filipino, ${blank(d.civilStatus, 12)} (civil status), and residing at ${blank(d.address, 48)} (hereinafter referred to as the "EMPLOYEE").` },
  ]);
  heading("WITNESSETH:");
  para([
    { t: "WHEREAS, ", b: true },
    {
      t: `the EMPLOYEE was engaged by the EMPLOYER on a probationary basis as ${blank(d.position, 32)}, and has been evaluated and found to have satisfactorily met the standards for regularization made known to ${her} at the time of ${her} engagement;`,
    },
  ]);
  para([{ t: "WHEREAS, ", b: true }, { t: "the EMPLOYER desires to continue the services of the EMPLOYEE as a regular employee, and the EMPLOYEE is willing to continue rendering such services, subject to the terms and conditions set forth below;" }]);
  para([{ t: "NOW, THEREFORE, ", b: true }, { t: "for and in consideration of the foregoing premises and the mutual covenants herein contained, the parties agree as follows:" }]);

  heading("ARTICLE I", "POSITION AND DUTIES");
  para([
    {
      t: `The EMPLOYER hereby employs the EMPLOYEE as ${blank(d.position, 32)}. The EMPLOYEE shall perform the duties and responsibilities described in ${her} job description, those customarily performed by persons holding the same or a similar position, and such other related duties as the EMPLOYER may reasonably assign from time to time, under the general supervision and direction of the EMPLOYER and its authorized officers.`,
    },
  ]);
  heading("ARTICLE II", "EMPLOYMENT STATUS AND EFFECTIVITY");
  para([
    { t: `Effective ${longDate(d.effectiveDate)}, the EMPLOYEE's status is hereby confirmed as ` },
    { t: "REGULAR", b: true },
    {
      t: ". Regular status entitles the EMPLOYEE to security of tenure and to the benefits granted by law and by company policy to regular employees. It does not, however, exempt the EMPLOYEE from the performance standards, rules, and grounds for termination set out in this Contract and under the law.",
    },
  ]);
  heading("ARTICLE III", "COMPENSATION AND BENEFITS");
  para([
    {
      t: `The EMPLOYER shall pay the EMPLOYEE a basic daily wage of P${money(d.dailyWage)}${d.allowances.length ? `, plus daily de minimis allowances totaling P${money(regAllowanceTotal(d))}, as itemized in the Notice of Regularization attached hereto` : ""}, payable in accordance with the EMPLOYER's payroll schedule and subject to withholding tax and mandatory contributions (SSS, PhilHealth, Pag-IBIG). The EMPLOYEE shall also be entitled to all benefits mandated by law, including 13th month pay and service incentive leave, and to such other benefits as the EMPLOYER may grant under its policies.`,
    },
  ]);
  heading("ARTICLE IV", "PERFORMANCE STANDARDS AND KEY PERFORMANCE INDICATORS (KPIs)");
  para([{ t: `Regularization does not end the EMPLOYEE's obligation to perform. The EMPLOYEE shall continue to meet the Key Performance Indicators (KPIs), targets, quality standards, and other performance requirements set for ${her} position.` }]);
  para([{ t: "KPIs and performance standards shall be reasonable, shall be communicated to the EMPLOYEE in writing, and may be reviewed and updated by the EMPLOYER from time to time in line with business needs. Any updated KPIs shall be made known to the EMPLOYEE before they take effect." }]);
  para([{ t: "The EMPLOYEE's performance shall be evaluated periodically (e.g., monthly, quarterly, or annually) in accordance with company policy. Results may be used as basis for coaching, performance improvement plans, promotion, salary adjustments, incentives, disciplinary action, or termination." }]);
  para([{ t: `Where the EMPLOYEE fails to meet ${her} KPIs, the EMPLOYER may place ${her === "her" ? "her" : "him"} under a Performance Improvement Plan (PIP) with specific targets and a reasonable period to improve.` }]);
  heading("ARTICLE V", "COMPANY RULES AND POLICIES");
  para([{ t: "The EMPLOYEE shall comply with the EMPLOYER's Code of Conduct, company rules and regulations, and all policies and memoranda now in force or which may hereafter be issued. Violations shall be dealt with in accordance with company policy and applicable law." }]);
  heading("ARTICLE VI", "TERMINATION OF EMPLOYMENT");
  para([{ t: `The EMPLOYEE acknowledges that regular status does not guarantee continued employment. ${her === "her" ? "Her" : "His"} employment may be terminated for any of the following causes, subject to due process:` }]);
  para(
    [
      { t: "(a) Failure to meet performance requirements", b: true },
      { t: ` - repeated or continued failure to meet the KPIs and reasonable performance standards made known to ${her}, including failure to complete a Performance Improvement Plan successfully, which may constitute gross inefficiency or gross and habitual neglect of duties;` },
    ],
    { indent: 18 },
  );
  para(
    [
      { t: "(b) Just causes under Article 297 of the Labor Code of the Philippines", b: true },
      { t: ", including serious misconduct, willful disobedience of lawful orders, gross and habitual neglect of duties, fraud or willful breach of trust, commission of a crime against the EMPLOYER, its representatives or their families, and other analogous causes, including serious violations of company rules;" },
    ],
    { indent: 18 },
  );
  para(
    [
      { t: "(c) Authorized causes under Articles 298 and 299 of the Labor Code", b: true },
      { t: ", including installation of labor-saving devices, redundancy, retrenchment to prevent losses, closure or cessation of business, and disease, in which case separation pay shall be given as provided by law;" },
    ],
    { indent: 18 },
  );
  para([{ t: "(d) Such other causes as may be provided by law." }], { indent: 18 });
  para([
    {
      t: "In all cases, termination shall observe procedural due process. For just causes, the EMPLOYEE shall be given a written notice stating the grounds, a reasonable opportunity to explain and be heard, and a written notice of decision. For authorized causes, written notice shall be served on the EMPLOYEE and on the Department of Labor and Employment at least thirty (30) days before the effective date.",
    },
  ]);
  para([{ t: `The EMPLOYEE may resign by giving the EMPLOYER written notice at least thirty (30) days in advance, and shall properly turn over ${her} work, company property, and records before ${her} separation.` }]);
  heading("ARTICLE VII", "CONFIDENTIALITY");
  para([{ t: `The EMPLOYEE shall keep confidential all business information, customer data, pricing, and other proprietary information of the EMPLOYER obtained during ${her} employment, both during and after ${her} employment, and shall handle personal data in accordance with the Data Privacy Act of 2012.` }]);
  heading("ARTICLE VIII", "GENERAL PROVISIONS");
  para([
    {
      t: `This Contract, together with the Notice of Regularization, the EMPLOYEE's job description, KPIs, and company policies, constitutes the entire agreement of the parties regarding ${her} regular employment. Matters not covered herein shall be governed by the Labor Code of the Philippines and other applicable laws. If any provision is held invalid, the remaining provisions shall remain in full force and effect.`,
    },
  ]);
  para([{ t: "IN WITNESS WHEREOF, the parties have signed this Contract on the date and at the place first above written." }]);

  ensure(190);
  y -= 16;
  signBlock(M + 120, y, input.signedAt.chairman ? "chairman" : null, d.signatory.name, [d.signatory.title, d.employerName]);
  signBlock(W - M - 120, y, input.signedAt.employee ? "employee" : null, d.employeeName, ["Employee"]);
  y -= 100;
  para([{ t: "SIGNED IN THE PRESENCE OF:", b: true }], { align: "center" });
  y -= 6;
  signBlock(M + 120, y, null, "", ["Witness"]);
  signBlock(W - M - 120, y, null, "", ["Witness"]);

  // ---- Notice of Regularization and Salary Adjustment ---------------------------
  newPage();
  y = H - 54;
  size0 = 10.5;
  lead = 13.5;
  para([{ t: d.employerName, b: true }], { align: "center", after: 0, size: 13 });
  for (const l of input.headerLines) para([{ t: l }], { align: "center", after: 0 });
  y -= 12;
  const memo = (k: string, v: string) => {
    page.drawText(k, { x: M, y: y - SIZE, size: SIZE, font: bold, color: INK });
    page.drawText(clean(v), { x: M + 70, y: y - SIZE, size: SIZE, font: bold, color: INK });
    y -= 15;
  };
  memo("To:", d.employeeName);
  memo("From:", "HR DEPARTMENT");
  memo("Date:", longDate(d.noticeDate).toUpperCase());
  memo("Subject:", "NOTICE OF REGULARIZATION AND SALARY ADJUSTMENT");
  page.drawLine({ start: { x: M, y: y }, end: { x: W - M, y: y }, thickness: 0.8, color: INK });
  y -= 10;
  para([{ t: `Dear ${d.salutation}:` }], { align: "left" });
  para([
    { t: "We are pleased to inform you that, based on the evaluation of your performance during your probationary period, you have met the standards for regularization. Accordingly, you are hereby confirmed as a ", b: true },
    { t: "REGULAR EMPLOYEE", b: true },
    { t: ` effective ${longDate(d.effectiveDate).toUpperCase()}.`, b: true },
  ]);
  para([{ t: "In line with your regularization, Management is pleased to approve the following compensation, effective on the same date:" }]);

  // Salary components table.
  const tl = M + 60;
  const tr = W - M - 60;
  const trow = (label: string, amount: string | null, opts: { b?: boolean; center?: boolean; shade?: boolean } = {}) => {
    ensure(20);
    page.drawRectangle({ x: tl, y: y - 17, width: tr - tl, height: 17, borderColor: INK, borderWidth: 0.6, color: opts.shade ? rgb(0.88, 0.88, 0.88) : undefined });
    const f = opts.b ? bold : font;
    const t = clean(label);
    if (opts.center) page.drawText(t, { x: (tl + tr) / 2 - f.widthOfTextAtSize(t, 10) / 2, y: y - 12.5, size: 10, font: f, color: INK });
    else page.drawText(t, { x: tl + 8, y: y - 12.5, size: 10, font: f, color: INK });
    if (amount !== null) {
      const a = clean(amount);
      page.drawText(a, { x: tr - 8 - f.widthOfTextAtSize(a, 10), y: y - 12.5, size: 10, font: f, color: INK });
    }
    y -= 17;
  };
  trow("Salary Components", null, { b: true, center: true, shade: true });
  trow(`Effective ${longDate(d.effectiveDate)}`, null, { b: true, center: true });
  trow("BASIC DAILY WAGE", null, { b: true, center: true, shade: true });
  trow("Basic Daily Wage", `P ${money(d.dailyWage)}`);
  if (d.allowances.length) {
    trow("DAILY ALLOWANCES (DE MINIMIS)", null, { b: true, center: true, shade: true });
    for (const a of d.allowances) trow(a.label, `P ${money(a.amount)}`);
    trow("Total Daily Allowances", `P ${money(regAllowanceTotal(d))}`, { b: true });
  }
  trow("TOTAL DAILY COMPENSATION", `P ${money(d.dailyWage + regAllowanceTotal(d))}`, { b: true, shade: true });
  y -= 10;

  para([
    { t: "Continuing Performance Requirements. ", b: true },
    {
      t: "Please note that regular status does not exempt you from meeting the Key Performance Indicators (KPIs) and performance standards set for your position. Your performance will continue to be evaluated periodically, and you are expected to consistently meet or exceed your targets.",
      b: true,
    },
  ]);
  para([
    {
      t: "Grounds for Termination. While regularization grants you security of tenure, your employment may still be terminated, with due process, for failure to meet performance requirements, or for any other just or authorized cause under the Labor Code of the Philippines and company policy.",
      b: true,
    },
  ]);
  para([
    {
      t: "All other terms and conditions of your employment, as stated in your Regular Contract of Employment and company policies, shall apply. You are expected to continue observing the company's rules and regulations. For any questions or concerns, please feel free to approach the HR Department.",
    },
  ]);
  para([{ t: "Congratulations on your regularization, and we look forward to your continued growth and contribution to the company!" }]);

  // HR's signature, left.
  ensure(150);
  y -= 4;
  const hrImg = input.signedAt.hr ? sigs.hr : undefined;
  if (hrImg) {
    const sc = Math.min(140 / hrImg.width, 38 / hrImg.height, 1);
    page.drawImage(hrImg, { x: M, y: y - 30, width: hrImg.width * sc, height: hrImg.height * sc });
  }
  page.drawText(clean(input.hrName.toUpperCase()), { x: M, y: y - 44, size: SIZE, font: bold, color: INK });
  page.drawText(clean(input.hrTitle), { x: M, y: y - 57, size: SIZE, font, color: INK });
  y -= 70;
  para([{ t: "CONFORME:", b: true }], { align: "left", after: 2 });
  para([{ t: "I have read and understood this notice, including the performance requirements and grounds for termination stated above." }]);
  y -= 6;
  signBlock(M + 120, y, input.signedAt.employee ? "employee" : null, d.employeeName, []);
  // Date received, right.
  const cx = W - M - 120;
  page.drawLine({ start: { x: cx - 105, y: y - 32 }, end: { x: cx + 105, y: y - 32 }, thickness: 0.6, color: INK });
  if (input.signedAt.employee) {
    const t = longDate(new Date(input.signedAt.employee).toLocaleDateString("en-CA", { timeZone: "Asia/Manila" }));
    page.drawText(t, { x: cx - font.widthOfTextAtSize(t, SIZE) / 2, y: y - 28, size: SIZE, font, color: INK });
  }
  page.drawText("Date Received", { x: cx - bold.widthOfTextAtSize("Date Received", SIZE) / 2, y: y - 45, size: SIZE, font: bold, color: INK });

  return doc.save();
}
