import { normalizeName } from "../attendance-import";
import type { Branch, Employee } from "../types";
import type { BranchSchedule } from "./compute";

// Each branch's schedule (Monday–Saturday, no grace period), as given by HR.
// Used to work out late and undertime from the biometrics punches; the
// import screen pre-fills it and HR can change it for one import.
export const BRANCH_SCHEDULES: Record<string, BranchSchedule> = {
  "br-cbt": { timeIn: "08:00", timeOut: "17:00" }, // Cabanatuan
  "br-pgs": { timeIn: "08:00", timeOut: "17:00" }, // Pangasinan
  "br-cdo": { timeIn: "08:00", timeOut: "17:00" }, // Cagayan de Oro
  "br-cav": { timeIn: "09:00", timeOut: "18:00" }, // Cavite
  "br-lcn": { timeIn: "09:00", timeOut: "18:00" }, // Lucena
  "br-ceb": { timeIn: "10:00", timeOut: "19:00" }, // Cebu
  "br-mnl": { timeIn: "10:00", timeOut: "19:00" }, // Manila
  "br-mdu": { timeIn: "10:00", timeOut: "18:00" }, // Mandaue
  "br-dvo": { timeIn: "11:00", timeOut: "20:00" }, // Davao
  "br-bcd": { timeIn: "11:00", timeOut: "20:00" }, // Bacolod
};

const squash = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");

// The branch a file is for, from its name ("CAGAYAN_DE_ORO.xls" → Cagayan de Oro).
export function guessBranch(fileName: string, branches: Branch[]): Branch | undefined {
  const f = squash(fileName.normalize("NFD").replace(/[̀-ͯ]/g, ""));
  return [...branches].sort((a, b) => b.name.length - a.name.length).find((b) => b.id !== "br-unassigned" && f.includes(squash(b.name)));
}

const tokens = (s: string) => normalizeName(s).split(" ").filter((t) => t.length > 1);

// The employee a full name in the file most likely is: the same first and
// last name, or — if exactly one employee fits — every word of the file's
// name found in theirs ("FRANK JONH DELA CRUZ" → Frank Jonh Paul Dela Cruz).
// Nicknames ("kboy") match no one; HR picks the employee once.
// `includeFormer`: also resigned / terminated employees (for a past cut-off).
export function matchEmployeeByName(name: string, employees: Employee[], includeFormer = false): Employee | undefined {
  const n = normalizeName(name);
  if (!n || n.split(" ").length < 2) return undefined;
  const current = includeFormer ? employees : employees.filter((e) => e.status !== "resigned" && e.status !== "terminated");
  const exact = current.filter((e) => normalizeName(`${e.firstName} ${e.lastName}`) === n || normalizeName(`${e.lastName}, ${e.firstName}`) === n);
  if (exact.length === 1) return exact[0];
  const want = tokens(name);
  const fits = current.filter((e) => {
    const have = new Set(tokens(`${e.firstName} ${e.middleName ?? ""} ${e.lastName}`));
    return want.every((t) => have.has(t)) && tokens(e.lastName).every((t) => want.includes(t));
  });
  return fits.length === 1 ? fits[0] : undefined;
}
