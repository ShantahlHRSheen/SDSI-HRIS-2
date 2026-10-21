import { normalizeName } from "../attendance-import";
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
// Whatever the layout, a day's punches are all its times; the first is the
// time in and the last the time out (worked out in compute.ts).

export interface BioPerson {
  // Stable within a branch: the machine's ID if the file has one, else the name.
  key: string;
  deviceId: string;
  name: string;
  // "YYYY-MM-DD" → "HH:MM" times, sorted.
  days: Map<string, string[]>;
}

export interface BioFile {
  format: "summary" | "logs";
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

// Every "H:MM" / "HH:MM" in a cell (a stray "*" marks the machine's own "late").
function timesIn(v: CellValue | undefined): string[] {
  if (typeof v === "number") {
    if (v > 0 && v < 1) {
      const m = Math.round(v * 1440) % 1440;
      return [`${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`];
    }
    return [];
  }
  return [...text(v).matchAll(/(?:^|[^\d])(\d{1,2}):(\d{2})(?!\d)/g)]
    .map((m) => ({ h: Number(m[1]), mi: Number(m[2]) }))
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
    else for (const [d, t] of p.days) addPunches(prev.days, d, t);
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
