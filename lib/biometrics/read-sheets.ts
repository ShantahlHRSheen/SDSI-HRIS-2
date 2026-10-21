import ExcelJS from "exceljs";

// Reads any spreadsheet a biometrics machine exports into plain rows of
// cell values, whatever the file really is:
//   * .xlsx (Excel 2007+)                       → ExcelJS
//   * .xls that is "XML Spreadsheet 2003" text   → read here (SpreadsheetML)
//   * .xls that is a real Excel 97–2003 file     → read here (BIFF8 inside a
//                                                  compound file)
// Only cell values are read (text and numbers); formatting is ignored.

export type CellValue = string | number;
export interface Sheet {
  name: string;
  rows: CellValue[][];
}

export async function readSpreadsheet(buffer: ArrayBuffer): Promise<Sheet[]> {
  const bytes = new Uint8Array(buffer);
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) return readXlsx(buffer);
  if (bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0) return readBiff(bytes);
  const head = new TextDecoder("latin1").decode(bytes.slice(0, 400));
  if (/<\?xml|<Workbook/i.test(head)) return readSpreadsheetMl(bytes, head);
  throw new Error("This file isn't a spreadsheet the HRIS can read (expected .xls or .xlsx from the biometrics).");
}

// ---- .xlsx -------------------------------------------------------------------

async function readXlsx(buffer: ArrayBuffer): Promise<Sheet[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  return wb.worksheets.map((ws) => {
    const rows: CellValue[][] = [];
    ws.eachRow({ includeEmpty: true }, (row, r) => {
      const out: CellValue[] = [];
      row.eachCell({ includeEmpty: false }, (cell, c) => {
        // A merged range keeps its value in the first cell only, as in Excel.
        if (cell.isMerged && cell.master.address !== cell.address) return;
        out[c - 1] = scalar(cell.value);
      });
      rows[r - 1] = fill(out);
    });
    return { name: ws.name, rows: fillRows(rows) };
  });
}

function scalar(v: ExcelJS.CellValue): CellValue {
  if (v === null || v === undefined) return "";
  if (typeof v === "number" || typeof v === "string") return v;
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  if (v instanceof Date) {
    // A time with no date (Excel day 0) reads as "HH:MM", like the machine shows it.
    if (v.getUTCFullYear() < 1901) {
      const mins = Math.round((v.getTime() - Date.UTC(v.getUTCFullYear(), v.getUTCMonth(), v.getUTCDate())) / 60000) % 1440;
      return `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
    }
    return v.toISOString().slice(0, 10);
  }
  if (typeof v === "object") {
    if ("result" in v && v.result !== undefined) return scalar(v.result as ExcelJS.CellValue);
    if ("richText" in v) return v.richText.map((t) => t.text).join("");
    if ("text" in v) return String(v.text);
  }
  return "";
}

const fill = (a: CellValue[]) => Array.from(a, (x) => x ?? "");
const fillRows = (rows: CellValue[][]) => Array.from(rows, (r) => r ?? []);

// ---- XML Spreadsheet 2003 ---------------------------------------------------

function readSpreadsheetMl(bytes: Uint8Array, head: string): Sheet[] {
  const encoding = /encoding="([^"]+)"/i.exec(head)?.[1] ?? "utf-8";
  let text: string;
  try {
    text = new TextDecoder(encoding).decode(bytes);
  } catch {
    text = new TextDecoder("latin1").decode(bytes);
  }
  const sheets: Sheet[] = [];
  const wsRe = /<(?:ss:)?Worksheet\b([^>]*)>([\s\S]*?)<\/(?:ss:)?Worksheet>/g;
  for (const ws of text.matchAll(wsRe)) {
    const name = decodeXml(/(?:ss:)?Name="([^"]*)"/.exec(ws[1])?.[1] ?? `Sheet${sheets.length + 1}`);
    const rows: CellValue[][] = [];
    let r = 0;
    const rowRe = /<(?:ss:)?Row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:ss:)?Row>)/g;
    for (const row of ws[2].matchAll(rowRe)) {
      const ri = /(?:ss:)?Index="(\d+)"/.exec(row[1]);
      r = ri ? Number(ri[1]) - 1 : r;
      const out: CellValue[] = [];
      let c = 0;
      const cellRe = /<(?:ss:)?Cell\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:ss:)?Cell>)/g;
      for (const cell of (row[2] ?? "").matchAll(cellRe)) {
        const ci = /(?:ss:)?Index="(\d+)"/.exec(cell[1]);
        c = ci ? Number(ci[1]) - 1 : c;
        const data = /<(?:ss:)?Data\b([^>]*)>([\s\S]*?)<\/(?:ss:)?Data>/.exec(cell[2] ?? "");
        if (data) {
          const raw = decodeXml(data[2].replace(/<[^>]+>/g, ""));
          out[c] = /Type="Number"/.test(data[1]) && raw.trim() !== "" && !Number.isNaN(Number(raw)) ? Number(raw) : raw;
        }
        c += 1 + Number(/(?:ss:)?MergeAcross="(\d+)"/.exec(cell[1])?.[1] ?? 0);
      }
      rows[r] = fill(out);
      r += 1;
    }
    sheets.push({ name, rows: fillRows(rows) });
  }
  return sheets;
}

function decodeXml(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

// ---- Excel 97–2003 (BIFF8 in a compound file) --------------------------------

function readBiff(bytes: Uint8Array): Sheet[] {
  const stream = compoundFileStream(bytes, ["Workbook", "Book"]);
  const dv = new DataView(stream.buffer, stream.byteOffset, stream.byteLength);

  // Split into records; CONTINUE records are kept with their parent.
  type Rec = { type: number; parts: Uint8Array[]; offset: number };
  const recs: Rec[] = [];
  for (let p = 0; p + 4 <= stream.length; ) {
    const type = dv.getUint16(p, true);
    const len = dv.getUint16(p + 2, true);
    const data = stream.subarray(p + 4, p + 4 + len);
    if (type === 0x003c && recs.length) recs[recs.length - 1].parts.push(data);
    else recs.push({ type, parts: [data], offset: p });
    p += 4 + len;
  }

  let sst: string[] = [];
  const sheetsMeta: { name: string; offset: number }[] = [];
  for (const rec of recs) {
    if (rec.type === 0x0085) {
      const d = rec.parts[0];
      const off = new DataView(d.buffer, d.byteOffset, d.byteLength).getUint32(0, true);
      const r = new PieceReader([d.subarray(6)]);
      const cch = r.u8();
      sheetsMeta.push({ name: r.unicodeChars(cch), offset: off });
    } else if (rec.type === 0x00fc) {
      sst = readSst(rec.parts);
    }
  }

  const sheets: Sheet[] = [];
  for (const meta of sheetsMeta) {
    const start = recs.findIndex((x) => x.offset === meta.offset);
    if (start < 0) continue;
    const rows: CellValue[][] = [];
    const put = (r: number, c: number, v: CellValue) => {
      (rows[r] ??= [])[c] = v;
    };
    let pendingFormula: [number, number] | null = null;
    for (let i = start + 1; i < recs.length && recs[i].type !== 0x000a; i++) {
      const { type, parts } = recs[i];
      const d = parts[0];
      const v = new DataView(d.buffer, d.byteOffset, d.byteLength);
      if (type === 0x00fd && d.length >= 10) put(v.getUint16(0, true), v.getUint16(2, true), sst[v.getUint32(6, true)] ?? "");
      else if (type === 0x0203 && d.length >= 14) put(v.getUint16(0, true), v.getUint16(2, true), v.getFloat64(6, true));
      else if (type === 0x027e && d.length >= 10) put(v.getUint16(0, true), v.getUint16(2, true), rk(v.getUint32(6, true)));
      else if (type === 0x00bd && d.length >= 6) {
        const row = v.getUint16(0, true);
        const first = v.getUint16(2, true);
        const n = (d.length - 6) / 6;
        for (let k = 0; k < n; k++) put(row, first + k, rk(v.getUint32(4 + k * 6 + 2, true)));
      } else if (type === 0x0204 && d.length >= 9) {
        const r = new PieceReader(parts.map((x, j) => (j === 0 ? x.subarray(6) : x)));
        put(v.getUint16(0, true), v.getUint16(2, true), r.unicodeChars(r.u16()));
      } else if (type === 0x0006 && d.length >= 14) {
        const row = v.getUint16(0, true);
        const col = v.getUint16(2, true);
        if (v.getUint16(12, true) === 0xffff) {
          if (d[6] === 0) pendingFormula = [row, col];
        } else put(row, col, v.getFloat64(6, true));
      } else if (type === 0x0207 && pendingFormula) {
        const r = new PieceReader(parts);
        put(pendingFormula[0], pendingFormula[1], r.unicodeChars(r.u16()));
        pendingFormula = null;
      }
    }
    sheets.push({ name: meta.name, rows: fillRows(rows.map((r) => fill(r ?? []))) });
  }
  return sheets;
}

function rk(x: number): number {
  const div100 = x & 1;
  let n: number;
  if (x & 2) n = x >> 2;
  else {
    const buf = new DataView(new ArrayBuffer(8));
    buf.setUint32(4, x & 0xfffffffc, true);
    n = buf.getFloat64(0, true);
  }
  return div100 ? n / 100 : n;
}

// Reads across a record and its CONTINUE parts. A string's characters may
// break into the next part, which then starts with a fresh "compressed?" flag.
class PieceReader {
  private i = 0;
  private p = 0;
  constructor(private parts: Uint8Array[]) {}
  private ensure() {
    while (this.i < this.parts.length && this.p >= this.parts[this.i].length) {
      this.i++;
      this.p = 0;
    }
  }
  atPartStart() {
    this.ensure();
    return this.p === 0 && this.i > 0;
  }
  u8(): number {
    this.ensure();
    if (this.i >= this.parts.length) throw new Error("Unexpected end of the .xls file.");
    return this.parts[this.i][this.p++];
  }
  u16(): number {
    return this.u8() | (this.u8() << 8);
  }
  u32(): number {
    return (this.u16() | (this.u16() << 16)) >>> 0;
  }
  skip(n: number) {
    for (let k = 0; k < n; k++) this.u8();
  }
  // XLUnicodeString body after its length: flags byte, then characters.
  unicodeChars(cch: number): string {
    let flags = this.u8();
    let rich = 0;
    let ext = 0;
    if (flags & 0x08) rich = this.u16();
    if (flags & 0x04) ext = this.u32();
    let out = "";
    for (let k = 0; k < cch; k++) {
      if (k > 0 && this.atPartStart()) flags = (flags & ~1) | (this.u8() & 1);
      out += String.fromCharCode(flags & 1 ? this.u16() : this.u8());
    }
    this.skip(rich * 4 + ext);
    return out;
  }
}

function readSst(parts: Uint8Array[]): string[] {
  const r = new PieceReader(parts);
  r.u32();
  const unique = r.u32();
  const out: string[] = [];
  for (let k = 0; k < unique; k++) {
    try {
      out.push(r.unicodeChars(r.u16()));
    } catch {
      break;
    }
  }
  return out;
}

// Minimal compound-file (OLE2) reader: returns the named stream's bytes.
function compoundFileStream(b: Uint8Array, names: string[]): Uint8Array {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const sectorSize = 1 << v.getUint16(30, true);
  const miniSectorSize = 1 << v.getUint16(32, true);
  const dirStart = v.getUint32(48, true);
  const miniCutoff = v.getUint32(56, true);
  const miniFatStart = v.getUint32(60, true);
  let difatStart = v.getUint32(68, true);
  const sectorOffset = (s: number) => (s + 1) * sectorSize;

  const fatSectors: number[] = [];
  for (let k = 0; k < 109; k++) {
    const s = v.getUint32(76 + k * 4, true);
    if (s < 0xfffffffa) fatSectors.push(s);
  }
  for (let guard = 0; difatStart < 0xfffffffa && guard < 10000; guard++) {
    const off = sectorOffset(difatStart);
    for (let k = 0; k < sectorSize / 4 - 1; k++) {
      const s = v.getUint32(off + k * 4, true);
      if (s < 0xfffffffa) fatSectors.push(s);
    }
    difatStart = v.getUint32(off + sectorSize - 4, true);
  }
  const fat: number[] = [];
  for (const s of fatSectors) for (let k = 0; k < sectorSize / 4; k++) fat.push(v.getUint32(sectorOffset(s) + k * 4, true));

  const chain = (start: number, table: number[]) => {
    const out: number[] = [];
    for (let s = start; s < 0xfffffffa && out.length < table.length + 1; s = table[s]) out.push(s);
    return out;
  };
  const readChain = (start: number, size?: number) => {
    const secs = chain(start, fat);
    const out = new Uint8Array(secs.length * sectorSize);
    secs.forEach((s, k) => out.set(b.subarray(sectorOffset(s), sectorOffset(s) + sectorSize), k * sectorSize));
    return size === undefined ? out : out.subarray(0, size);
  };

  const dir = readChain(dirStart);
  const dv = new DataView(dir.buffer, dir.byteOffset, dir.byteLength);
  type Entry = { name: string; type: number; start: number; size: number };
  const entries: Entry[] = [];
  for (let off = 0; off + 128 <= dir.length; off += 128) {
    const nameLen = dv.getUint16(off + 64, true);
    let name = "";
    for (let k = 0; k < Math.max(0, nameLen / 2 - 1); k++) name += String.fromCharCode(dv.getUint16(off + k * 2, true));
    entries.push({ name, type: dir[off + 66], start: dv.getUint32(off + 116, true), size: dv.getUint32(off + 120, true) });
  }
  const entry = entries.find((e) => e.type === 2 && names.includes(e.name));
  if (!entry) throw new Error("This .xls file has no workbook inside.");
  if (entry.size >= miniCutoff) return readChain(entry.start, entry.size);

  // Small stream: stored in the mini stream.
  const root = entries[0];
  const ministream = readChain(root.start, root.size);
  const miniFatBytes = readChain(miniFatStart);
  const mfv = new DataView(miniFatBytes.buffer, miniFatBytes.byteOffset, miniFatBytes.byteLength);
  const miniFat: number[] = [];
  for (let k = 0; k < miniFatBytes.length / 4; k++) miniFat.push(mfv.getUint32(k * 4, true));
  const secs = chain(entry.start, miniFat);
  const out = new Uint8Array(secs.length * miniSectorSize);
  secs.forEach((s, k) => out.set(ministream.subarray(s * miniSectorSize, (s + 1) * miniSectorSize), k * miniSectorSize));
  return out.subarray(0, entry.size);
}
