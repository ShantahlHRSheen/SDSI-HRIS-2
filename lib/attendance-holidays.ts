import type { Branch, Holiday } from "./types";

// Holidays for the attendance rate (Dashboard, Attendance Report) — not
// payroll. On a holiday some branches run a skeletal set-up, so nobody is
// counted absent: a holiday the employee didn't work counts as present.
//
// The dates are the Holidays list (Admin → Holidays) plus the 2026 national
// days below and each branch city's local special (non-working) days, found
// by the branch's name or address. Sources: Proclamation No. 1006 (2026
// holidays), 1189 (Eid'l Fitr), 1264 (Eid'l Adha), and the local
// proclamations / laws noted per entry.

const NATIONAL: { date: string; name: string }[] = [
  { date: "2026-01-01", name: "New Year's Day" },
  { date: "2026-02-17", name: "Chinese New Year" },
  { date: "2026-03-20", name: "Eid'l Fitr" },
  { date: "2026-04-02", name: "Maundy Thursday" },
  { date: "2026-04-03", name: "Good Friday" },
  { date: "2026-04-04", name: "Black Saturday" },
  { date: "2026-04-09", name: "Araw ng Kagitingan" },
  { date: "2026-05-01", name: "Labor Day" },
  { date: "2026-05-27", name: "Eid'l Adha" },
  { date: "2026-06-12", name: "Independence Day" },
  { date: "2026-08-21", name: "Ninoy Aquino Day" },
  { date: "2026-08-31", name: "National Heroes Day" },
  { date: "2026-11-01", name: "All Saints' Day" },
  { date: "2026-11-02", name: "All Souls' Day" },
  { date: "2026-11-30", name: "Bonifacio Day" },
  { date: "2026-12-08", name: "Feast of the Immaculate Conception" },
  { date: "2026-12-24", name: "Christmas Eve" },
  { date: "2026-12-25", name: "Christmas Day" },
  { date: "2026-12-30", name: "Rizal Day" },
  { date: "2026-12-31", name: "Last Day of the Year" },
];

// places: matched (lower case) against the branch's name and address.
const LOCAL: { date: string; name: string; places: string[] }[] = [
  { date: "2026-01-28", name: "Julian Felipe Day (city declaration)", places: ["cavite city"] },
  { date: "2026-02-03", name: "Cabanatuan City founding anniversary (Proc. 1138)", places: ["cabanatuan"] },
  { date: "2026-03-16", name: "Araw ng Dabaw (Proc. 1174)", places: ["davao city"] },
  { date: "2026-04-25", name: "Nueva Ecija founding anniversary (Proc. 1211)", places: ["nueva ecija", "cabanatuan"] },
  { date: "2026-05-06", name: "ASEAN Summit (Proc. 1239)", places: ["cebu city", "mandaue"] },
  { date: "2026-05-07", name: "ASEAN Summit (Proc. 1239)", places: ["cebu city", "mandaue"] },
  { date: "2026-05-08", name: "ASEAN Summit (Proc. 1239)", places: ["cebu city", "mandaue"] },
  { date: "2026-06-18", name: "Bacolod City Charter Day (RA 11146)", places: ["bacolod"] },
  { date: "2026-08-06", name: "Cebu Provincial Charter Day (RA 8952)", places: ["cebu", "mandaue"] },
  { date: "2026-08-14", name: "Kadayawan (Proc. 1372)", places: ["davao city"] },
  { date: "2026-08-20", name: "Araw ng Lucena (Proc. 1365)", places: ["lucena"] },
  { date: "2026-11-16", name: "ASEAN Summit, NCR (Proc. 1447)", places: ["metro manila", "ncr", "pasig", "manila", "quezon city", "makati", "taguig"] },
  { date: "2026-11-17", name: "ASEAN Summit, NCR (Proc. 1447)", places: ["metro manila", "ncr", "pasig", "manila", "quezon city", "makati", "taguig"] },
  { date: "2026-11-18", name: "ASEAN Summit, NCR (Proc. 1447)", places: ["metro manila", "ncr", "pasig", "manila", "quezon city", "makati", "taguig"] },
];

// Holiday dates ("YYYY-MM-DD") per branch id, for the attendance rate.
export function attendanceHolidaysByBranch(holidays: Holiday[], branches: Branch[]): Map<string, Set<string>> {
  const national = [...holidays.map((h) => h.date.slice(0, 10)), ...NATIONAL.map((h) => h.date)];
  const out = new Map<string, Set<string>>();
  for (const b of branches) {
    const where = `${b.name} ${b.address}`.toLowerCase();
    const local = LOCAL.filter((h) => h.places.some((p) => where.includes(p))).map((h) => h.date);
    out.set(b.id, new Set([...national, ...local]));
  }
  out.set("", new Set(national)); // employees without a known branch
  return out;
}
