import {
  BRANCHES,
  DEPARTMENTS,
  POSITIONS,
  daysBetween,
  TODAY,
} from "./mock-data";
import type { Employee, Role } from "./types";
import { ROLE_LABELS } from "./types";

export function fullName(e: Employee): string {
  return `${e.firstName} ${e.lastName}`;
}

export function branchName(branchId: string): string {
  return BRANCHES.find((b) => b.id === branchId)?.name ?? "—";
}

export function departmentName(departmentId: string): string {
  return DEPARTMENTS.find((d) => d.id === departmentId)?.name ?? "—";
}

export function positionTitle(positionId: string): string {
  return POSITIONS.find((p) => p.id === positionId)?.title ?? "—";
}

export function hasAnyRole(userRoles: Role[], allowed: Role[]): boolean {
  return userRoles.some((r) => allowed.includes(r));
}

export function roleBadgeLabel(role: Role): string {
  return ROLE_LABELS[role];
}

export function formatCurrency(n: number | null): string {
  if (n === null) return "—";
  return `₱${n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Whole-peso formatting for aggregate figures (stat tiles, chart labels) where
// centavo precision only adds width without adding information.
export function formatCurrencyCompact(n: number | null): string {
  if (n === null) return "—";
  return `₱${Math.round(n).toLocaleString("en-PH")}`;
}

export function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr + "T00:00:00Z");
  return d.toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}

export function relativeDays(dateStr: string): number {
  return daysBetween(TODAY, dateStr);
}

export function dueSoonLabel(days: number): { label: string; tone: "critical" | "warning" | "good" | "muted" } {
  if (days < 0) return { label: `Overdue by ${Math.abs(days)}d`, tone: "critical" };
  if (days <= 15) return { label: `Due in ${days}d`, tone: "warning" };
  if (days <= 45) return { label: `Due in ${days}d`, tone: "good" };
  return { label: `Due in ${days}d`, tone: "muted" };
}

// Deterministic masked-format government ID for demo purposes only (SSS,
// PhilHealth, Pag-IBIG/HDMF, TIN). Shared by the 201 file profile page and
// the BIR forms so the same employee always shows the same value everywhere.
export function maskedGovId(seed: string, groups: number[]): string {
  const digits = seed.replace(/\D/g, "").padEnd(10, "0");
  let i = 0;
  return groups.map((g) => digits.slice(i, (i += g))).join("-");
}

export function employeeTIN(employeeNumber: string): string {
  return maskedGovId(employeeNumber + "4", [3, 3, 3]);
}

export function employeeSssNumber(employeeNumber: string): string {
  return maskedGovId(employeeNumber + "1", [2, 7, 1]);
}

export function employeePhilHealthNumber(employeeNumber: string): string {
  return maskedGovId(employeeNumber + "2", [2, 9, 1]);
}

export function employeeHdmfNumber(employeeNumber: string): string {
  return maskedGovId(employeeNumber + "3", [4, 4, 4]);
}

export function initialsOf(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}
