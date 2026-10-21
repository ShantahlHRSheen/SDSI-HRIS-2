import { normalizeName } from "../attendance-import";
import type { BiometricDayMark } from "../types";
import type { CellValue, Sheet } from "./read-sheets";

// Turns a biometrics export into each person's punches per day. Three
// machine layouts are recognised (see the branch samples):
//   * "summary" — "Attendance Summary": one block per person (Name:/ID: in
//     the block header), days in two side-by-side halves, IN/OUT times
//     scattered over Morning/Afternoon/Overtime columns.
//     (Cabanatuan, Cavite, Pangasinan, Cagayan de Oro, Davao)
//   * "logs" — an "Attend. Logs" / "Detail" sheet: a row of day numbers,
//     then "ID : … Name : …", then that person's punches per day
//     ("09:59 19:00"). (Cebu, Manila, Lucena)
//   * "sheet" — HR's own attendance sheet for all branches: per person a
//     name row, a row of that person's times per day, then "Total Days",
//     "Holiday Pay", … and a row of dates ("2026-01-01") for the columns.
//     Days can be typed as "SL", "VL", "Unpaid VL", "Halfday" or a branch
//     name (worked there) instead of times.
// Whatever the layout, a day's punches are all its times; the first is the
// time in and the last the time out (worked out in compute.ts).

export interface BioPerson {
  // Stable within a branch: the machine's ID if the file has one, else the name.
  key: string;
  deviceId: string;
  name: string;
  // "YYYY-MM-DD" → "HH:MM" times, sorted.
  days: Map<string, string[]>;
  // Days marked instead of punched (HR's sheet only).
  marks?: Map<string, BiometricDayMark>;
}

export interface BioFile {
  format: "summary" | "logs" | "sheet" | "daily";
  formatLabel: string;
  rangeStart: string | null;
  rangeEnd: string | null;
  people: BioPerson[];
  // Blocks with neither a name nor an ID — can't be matched to anyone.
  unidentified: number;
  // The shift printed on the file, when the machine includes one (Lucena).
  shift: { timeIn: string; timeOut: string } | null;
}

const text = (v: CellValue | undefined) => (v === undefined || v === null ? "" : String(v)).trim();

// Every "H:MM" / "HH:MM" in a cell (a stray "*" marks the machine's own "late");
// "8:05:00 PM" is 20:05.
function timesIn(v: CellValue | undefined): string[] {
  if (typeof v === "number") {
    if (v > 0 && v < 1) {
      const m = Math.round(v * 1440) % 1440;
      return [`${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`];
    }
    return [];
  }
  return [...text(v).matchAll(/(?:^|[^\d])(\d{1,2}):(\d{2})(?::\d{2})?(?!\d)(?:\s*([AaPp])\.?[Mm]\b)?/g)]
    .map((m) => {
      const h = Number(m[1]);
      const pm = m[3]?.toLowerCase() === "p";
      const am = m[3]?.toLowerCase() === "a";
      return { h: pm && h < 12 ? h + 12 : am && h === 12 ? 0 : h, mi: Number(m[2]) };
    })
    .filter((t) => t.h < 24 && t.mi < 60)
    .map((t) => `${String(t.h).padStart(2, "0")}:${String(t.mi).padStart(2, "0")}`);
}

// "26.10.01～26.10.31", "2026-10-01 ~ 2026-10-14", "2026.10.01~2026.10.31"
function parseRange(s: string): { start: string; end: string } | null {
  const m = [...s.matchAll(/(\d{2,4})[.\-/](\d{1,2})[.\-/](\d{1,2})/g)];
  if (m.length < 2) return null;
  const iso = (x: RegExpMatchArray) => `${x[1].length === 2 ? `20${x[1]}` : x[1]}-${x[2].padStart(2, "0")}-${x[3].padStart(2, "0")}`;
  return { start: iso(m[0]), end: iso(m[1]) };
}

const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

// A month/day with no year: the year that puts it nearest the file's range
// (or the fallback date), so December/January cut-offs still land right.
function withYear(month: number, day: number, near: string): string | null {
  if (!(month >= 1 && month <= 12 && day >= 1 && day <= 31)) return null;
  const y = Number(near.slice(0, 4));
  const options = [y - 1, y, y + 1].map((yy) => `${yy}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`);
  const t = Date.parse(`${near}T00:00:00Z`);
  return options.sort((a, b) => Math.abs(Date.parse(`${a}T00:00:00Z`) - t) - Math.abs(Date.parse(`${b}T00:00:00Z`) - t))[0];
}

// A day cell of the summary layout: "10.01", "10. 08", "9. 30", or the number
// 10.1 (Excel dropped the zero: the 10th, never the 1st, which would be 10.01).
function summaryDay(v: CellValue | undefined, near: string): string | null {
  if (typeof v === "number") {
    const month = Math.floor(v);
    return withYear(month, Math.round((v - month) * 100), near);
  }
  const m = /^(\d{1,2})\s*[.\-/]\s*(\d{1,2})$/.exec(text(v));
  return m ? withYear(Number(m[1]), Number(m[2]), near) : null;
}

function addPunches(days: Map<string, string[]>, date: string, times: string[]) {
  if (!times.length) return;
  const all = [...(days.get(date) ?? []), ...times];
  days.set(date, [...new Set(all)].sort());
}

function personKey(deviceId: string, name: string): string | null {
  const id = deviceId.replace(/^0+(?=\d)/, "");
  if (id) return `id:${id}`;
  const n = normalizeName(name);
  return n ? `name:${n}` : null;
}

// ---- "logs" layout -----------------------------------------------------------

function parseLogs(sheet: Sheet, fallbackNear: string): Omit<BioFile, "format" | "formatLabel" | "shift"> {
  let range: { start: string; end: string } | null = null;
  for (const row of sheet.rows.slice(0, 6)) {
    const r = parseRange(row.map(text).join(" "));
    if (r) {
      range = r;
      break;
    }
  }
  const near = range?.start ?? fallbackNear;
  const people: BioPerson[] = [];
  let unidentified = 0;
  let dayCols: Map<number, string> = new Map();
  for (let i = 0; i < sheet.rows.length; i++) {
    const row = sheet.rows[i];
    const cells = row.map(text);
    // A row of day numbers ("30","1","2",…): the dates of the columns below.
    const nums = cells.map((c) => (/^\d{1,2}$/.test(c) ? Number(c) : null));
    if (nums.filter((n) => n !== null).length >= 3 && !cells.some((c) => /ID\s*:/i.test(c))) {
      dayCols = new Map();
      let cursor = range?.start ?? null;
      nums.forEach((d, c) => {
        if (d === null) return;
        // Walk forward from the range start to the next date with this day number.
        if (cursor) {
          let probe = cursor;
          for (let k = 0; k < 40 && Number(probe.slice(8, 10)) !== d; k++) probe = addDays(probe, 1);
          dayCols.set(c, probe);
          cursor = addDays(probe, 1);
        } else {
          const date = withYear(Number(near.slice(5, 7)), d, near);
          if (date) dayCols.set(c, date);
        }
      });
      continue;
    }
    const idAt = cells.findIndex((c) => /^ID\s*:/i.test(c));
    if (idAt < 0) continue;
    const after = (label: RegExp) => {
      const at = cells.findIndex((c) => label.test(c));
      if (at < 0) return "";
      const inline = cells[at].replace(label, "").trim();
      return inline || (cells.slice(at + 1).find((c) => c !== "") ?? "");
    };
    const deviceId = after(/^ID\s*:/i);
    const nameRaw = after(/^Name\s*:/i);
    const name = /^Dept/i.test(nameRaw) ? "" : nameRaw;
    const key = personKey(deviceId, name);
    const punchRow = sheet.rows[i + 1] ?? [];
    if (!key) {
      unidentified++;
      continue;
    }
    const days = new Map<string, string[]>();
    for (const [c, date] of dayCols) addPunches(days, date, timesIn(punchRow[c]));
    people.push({ key, deviceId: deviceId.replace(/^0+(?=\d)/, ""), name, days });
    i++;
  }
  return { rangeStart: range?.start ?? null, rangeEnd: range?.end ?? null, people, unidentified };
}

// ---- "sheet" layout (HR's attendance sheet) -----------------------------------

const isoIn = (v: CellValue | undefined): string | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(text(v));
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
};

// The dates of a row of date cells; a date typed with the wrong year
// ("2026-12-31" before "2026-01-01") is moved to the year of the others.
function sheetDayCols(row: CellValue[]): Map<number, string> {
  const found = row.map(isoIn);
  const sorted = found.filter((d): d is string => !!d).sort();
  const mid = Date.parse(`${sorted[Math.floor(sorted.length / 2)]}T00:00:00Z`);
  const out = new Map<number, string>();
  found.forEach((d, c) => {
    if (!d) return;
    let y = Number(d.slice(0, 4));
    const off = (Date.parse(`${d}T00:00:00Z`) - mid) / 86400000;
    if (off > 180) y--;
    if (off < -180) y++;
    out.set(c, `${y}${d.slice(4)}`);
  });
  return out;
}

const isSheetDateRow = (row: CellValue[]) => row.filter((c) => isoIn(c)).length >= 3;
const isTotalDays = (row: CellValue[] | undefined) => /^Total\s*Days$/i.test(text(row?.[0]));

// A day typed instead of punched.
function dayMark(v: CellValue | undefined): BiometricDayMark | null {
  const t = text(v).toLowerCase().replace(/\s+/g, " ");
  if (!t || /\d:\d/.test(t)) return null;
  if (/unpaid|lwop|without pay/.test(t)) return "unpaid";
  if (/half/.test(t)) return "half";
  if (/^s\.?l\b|sick/.test(t)) return "SL";
  if (/^v\.?l\b|vacation/.test(t)) return "VL";
  if (/^[a-z][a-z .]{2,}$/.test(t)) return "field"; // a branch / place: worked there
  return null;
}

// Times typed on a 12-hour clock without AM/PM ("11:00 08:02"): a time
// earlier than the one before it is in the afternoon. "11- 8:09 PM" starts at 11:00.
function sheetTimes(v: CellValue | undefined): string[] {
  const bare = /^\s*(\d{1,2})\s*-\s*(?=\d)/.exec(text(v));
  const times = [...(bare && Number(bare[1]) < 24 ? [`${bare[1].padStart(2, "0")}:00`] : []), ...timesIn(v)];
  const out: string[] = [];
  for (const t of times) {
    const prev = out[out.length - 1];
    const h = Number(t.slice(0, 2));
    out.push(prev && t < prev && h < 12 ? `${String(h + 12).padStart(2, "0")}${t.slice(2)}` : t);
  }
  return out;
}

// Columns nobody punched in (Sundays), from everyone's times rows.
function restColumns(rows: CellValue[][]): Set<number> {
  const counts = new Map<number, number>();
  rows.forEach((row, i) => {
    if (!isTotalDays(row) || i < 1) return;
    rows[i - 1].forEach((v, c) => {
      if (timesIn(v).length) counts.set(c, (counts.get(c) ?? 0) + 1);
    });
  });
  const most = Math.max(0, ...counts.values());
  const out = new Set<number>();
  if (!most) return out;
  const width = Math.max(...counts.keys());
  for (let c = 0; c <= width; c++) if ((counts.get(c) ?? 0) <= most * 0.1) out.add(c);
  return out;
}

const isSunday = (iso: string) => new Date(`${iso}T00:00:00Z`).getUTCDay() === 0;
const shiftYear = (iso: string, by: number) => `${Number(iso.slice(0, 4)) + by}${iso.slice(4)}`;

// A date row typed with the wrong year (a copied template): the year whose
// Sundays are the columns nobody punched in.
function fixSheetYear(dayCols: Map<number, string>, rest: Set<number>): Map<number, string> {
  if (!rest.size) return dayCols;
  const score = (by: number) => {
    let n = 0;
    for (const [c, d] of dayCols) if (isSunday(shiftYear(d, by))) n += rest.has(c) ? 1 : -1;
    return n;
  };
  const best = [0, -1, 1].reduce((a, b) => (score(b) > score(a) ? b : a));
  return best ? new Map([...dayCols].map(([c, d]) => [c, shiftYear(d, best)])) : dayCols;
}

function parseSheet(sheet: Sheet): Omit<BioFile, "format" | "formatLabel" | "shift"> {
  const rows = sheet.rows;
  const rest = restColumns(rows);
  const firstDates = rows.find(isSheetDateRow);
  let dayCols = firstDates ? fixSheetYear(sheetDayCols(firstDates), rest) : new Map<number, string>();
  const people: BioPerson[] = [];
  let unidentified = 0;
  for (let i = 0; i < rows.length; i++) {
    if (isSheetDateRow(rows[i])) dayCols = fixSheetYear(sheetDayCols(rows[i]), rest);
    if (!isTotalDays(rows[i]) || i < 2) continue;
    const header = rows[i - 2].map(text);
    const punchRow = rows[i - 1];
    // The name: after "Name :", else the last cell of words in the row.
    const nameAt = (() => {
      const label = header.findIndex((c) => /^Name\s*:/i.test(c));
      if (label >= 0) {
        if (header[label].replace(/^Name\s*:/i, "").trim()) return label;
        const next = header.findIndex((c, k) => k > label && c !== "");
        if (next >= 0) return next;
      }
      for (let k = header.length - 1; k >= 0; k--) if (/[A-Za-z]{3}/.test(header[k]) && !/\d:\d/.test(header[k]) && !/^(ID|Name|Date)\s*:?$/i.test(header[k])) return k;
      return -1;
    })();
    const name = nameAt >= 0 ? header[nameAt].replace(/^Name\s*:/i, "").trim() : "";
    const key = personKey("", name);
    if (!key) {
      unidentified++;
      continue;
    }
    const days = new Map<string, string[]>();
    const marks = new Map<string, BiometricDayMark>();
    for (const [c, date] of dayCols) {
      addPunches(days, date, sheetTimes(punchRow[c]));
      const mark = dayMark(punchRow[c]);
      if (mark) marks.set(date, mark);
    }
    people.push({ key, deviceId: "", name, days, marks });
  }
  const all = [...dayCols.values()].sort();
  return { rangeStart: all[0] ?? null, rangeEnd: all[all.length - 1] ?? null, people: mergeSameKey(people), unidentified };
}

// ---- "daily" layout (one row per person per day) ------------------------------

// The header row: "Date", "Employee Name", "Time In", "Time Out", …
function dailyHeader(sheet: Sheet): { at: number; col: (label: RegExp) => number } | null {
  for (let i = 0; i < Math.min(sheet.rows.length, 10); i++) {
    const cells = sheet.rows[i].map((c) => text(c).toLowerCase());
    const col = (label: RegExp) => cells.findIndex((c) => label.test(c));
    if (col(/^date$/) >= 0 && col(/name/) >= 0 && col(/^time\s*in$/) >= 0 && col(/^time\s*out$/) >= 0) return { at: i, col };
  }
  return null;
}

function parseDaily(sheet: Sheet): Omit<BioFile, "format" | "formatLabel" | "shift"> {
  const header = dailyHeader(sheet)!;
  const c = {
    date: header.col(/^date$/),
    id: header.col(/^(emp(loyee)?\s*)?id$/),
    name: header.col(/name/),
    punches: [/^time\s*in$/, /^break\s*out$/, /^break\s*in$/, /^time\s*out$/].map(header.col).filter((k) => k >= 0),
    status: header.col(/^status$/),
    dayType: header.col(/^day\s*type$/),
    branch: header.col(/^branch$/),
  };
  const people = new Map<string, BioPerson>();
  let title = ""; // the name heading over each person's rows ("ABOGUIN, MA. ABEGAIL FATIMA")
  let unidentified = 0;
  let first: string | null = null;
  let last: string | null = null;
  // Holidays the file marks ("SPECIAL HOLIDAY"), per branch: not absences there.
  const holidays = new Set<string>();
  const branchOf = new Map<string, string>();
  for (const row of sheet.rows.slice(header.at + 1)) {
    const date = isoIn(row[c.date]);
    if (!date) {
      const t = text(row[0]);
      if (t && !/^total/i.test(t) && /[A-Za-z]{3}/.test(t)) title = t;
      continue;
    }
    // The row's name, or the heading when the row's has no comma ("Aboguin Ma. Abegail Fatima").
    const rowName = text(row[c.name]);
    const name = rowName.includes(",") || !title ? rowName || title : title;
    const key = personKey("", name);
    if (!key) {
      unidentified++;
      continue;
    }
    const person = people.get(key) ?? { key, deviceId: c.id >= 0 ? text(row[c.id]) : "", name, days: new Map(), marks: new Map() };
    people.set(key, person);
    const times = c.punches.flatMap((k) => timesIn(row[k]));
    addPunches(person.days, date, times);
    const status = c.status >= 0 ? text(row[c.status]).toLowerCase() : "";
    const mark: BiometricDayMark | null = /half/.test(status)
      ? "half"
      : /unpaid|lwop|without pay/.test(status)
        ? "unpaid"
        : /^s\.?l\b|sick/.test(status)
          ? "SL"
          : /^v\.?l\b|vacation/.test(status)
            ? "VL"
            : /present/.test(status) && !times.length
              ? "field"
              : null;
    if (mark) person.marks!.set(date, mark);
    const branch = c.branch >= 0 ? text(row[c.branch]).toUpperCase() : "";
    branchOf.set(key, branch);
    if (c.dayType >= 0 && /holiday/i.test(text(row[c.dayType]))) holidays.add(`${branch}|${date}`);
    if (times.length) {
      if (!first || date < first) first = date;
      if (!last || date > last) last = date;
    }
  }
  for (const p of people.values())
    for (const h of holidays) {
      const [branch, date] = h.split("|");
      if (branch === branchOf.get(p.key) && !p.days.get(date)?.length && !p.marks!.has(date)) p.marks!.set(date, "holiday");
    }
  return { rangeStart: first, rangeEnd: last, people: [...people.values()], unidentified };
}

// ---- "summary" layout --------------------------------------------------------

function parseSummary(sheet: Sheet, fallbackNear: string): Omit<BioFile, "format" | "formatLabel" | "shift"> {
  const people: BioPerson[] = [];
  let unidentified = 0;
  let rangeStart: string | null = null;
  let rangeEnd: string | null = null;
  let current: BioPerson | null = null;
  let near = fallbackNear;
  for (const row of sheet.rows) {
    const cells = row.map(text);
    const joined = cells.join(" ");
    if (/Date\s*:/i.test(joined) && (/Name\s*:/i.test(joined) || /ID\s*:/i.test(joined) || /Company Name/i.test(joined) || /Dept/i.test(joined))) {
      const range = parseRange(joined);
      if (range) {
        rangeStart ??= range.start;
        rangeEnd ??= range.end;
        near = range.start;
      }
      const field = (label: RegExp) => {
        const at = cells.findIndex((c) => label.test(c));
        return at < 0 ? "" : cells[at].replace(label, "").trim();
      };
      const deviceId = field(/^ID\s*:/i);
      const name = field(/^Name\s*:/i);
      const key = personKey(deviceId, name);
      if (current) people.push(current);
      current = null;
      if (key) current = { key, deviceId: deviceId.replace(/^0+(?=\d)/, ""), name, days: new Map() };
      else unidentified++;
      continue;
    }
    if (!current) continue;
    // Two halves of 8 columns: Date, Week, then six IN/OUT cells.
    for (const base of [0, 8]) {
      const date = summaryDay(row[base], near);
      if (!date) continue;
      const times = [2, 3, 4, 5, 6, 7].flatMap((k) => timesIn(row[base + k]));
      addPunches(current.days, date, times);
    }
  }
  if (current) people.push(current);
  return { rangeStart, rangeEnd, people: mergeSameKey(people), unidentified };
}

// A person listed twice (two blocks) keeps one entry with all punches.
function mergeSameKey(people: BioPerson[]): BioPerson[] {
  const byKey = new Map<string, BioPerson>();
  for (const p of people) {
    const prev = byKey.get(p.key);
    if (!prev) byKey.set(p.key, p);
    else {
      for (const [d, t] of p.days) addPunches(prev.days, d, t);
      if (p.marks) for (const [d, m] of p.marks) (prev.marks ??= new Map()).set(d, m);
    }
  }
  return [...byKey.values()];
}

export function parseBiometrics(sheets: Sheet[], fallbackNear: string): BioFile {
  // The shift line some machines print ("Shift1 (09:00-18:00;…)").
  let shift: BioFile["shift"] = null;
  for (const s of sheets)
    for (const row of s.rows.slice(0, 12)) {
      const m = /Shift\d*\s*\((\d{1,2}:\d{2})-(\d{1,2}:\d{2})/i.exec(row.map(text).join(" "));
      if (m && m[1] !== "00:00") shift = { timeIn: m[1].padStart(5, "0"), timeOut: m[2].padStart(5, "0") };
    }

  const daily = sheets.find((s) => dailyHeader(s));
  if (daily) {
    const r = parseDaily(daily);
    if (r.people.length) return { ...r, format: "daily", formatLabel: "Daily attendance report (all branches)", shift };
  }
  const hrSheet = sheets.find((s) => s.rows.filter(isTotalDays).length >= 2 && s.rows.some(isSheetDateRow));
  if (hrSheet) {
    const r = parseSheet(hrSheet);
    if (r.people.length) return { ...r, format: "sheet", formatLabel: "HR attendance sheet (all branches)", shift };
  }
  const logs = sheets.find((s) => /^(Attend\.?\s*Logs|Detail)$/i.test(s.name.trim()));
  if (logs) {
    const r = parseLogs(logs, fallbackNear);
    if (r.people.length) return { ...r, format: "logs", formatLabel: "Attendance logs (punches per day)", shift };
  }
  for (const s of sheets) {
    if (!s.rows.some((row) => row.some((c) => /Attendance Summary|Field Report|Name\s*:/i.test(text(c))))) continue;
    const r = parseSummary(s, fallbackNear);
    if (r.people.length || r.unidentified) return { ...r, format: "summary", formatLabel: "Attendance summary (per-person blocks)", shift };
  }
  throw new Error("The HRIS couldn't find anyone's time-ins and time-outs in this file. Is it the biometrics export?");
}
