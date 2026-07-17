// ---------------------------------------------------------------------------
// Philippine statutory contribution computations — SSS (incl. WISP/MPF),
// PhilHealth, Pag-IBIG (HDMF), and BIR withholding tax.
//
// These follow the current published schedules (SSS Circular 2022-033 MSC
// table effective Jan 2023; PhilHealth's 5% premium rate per the Universal
// Health Care Act's rate schedule; Pag-IBIG's 2% employee / 2% employer
// standard rate with the ₱10,000 Monthly Fund Salary ceiling effective Feb
// 2024; and the TRAIN law semi-monthly withholding tax table). Verify
// against the current official tables before using this for real payroll —
// government agencies revise these schedules periodically.
// ---------------------------------------------------------------------------

export interface ContributionSplit {
  employee: number;
  employer: number;
}

// --- SSS (Social Security System), including WISP (Workers' Investment and
// Savings Program / Mandatory Provident Fund) ---------------------------

const SSS_RATE_EMPLOYEE = 0.045;
const SSS_RATE_EMPLOYER = 0.095;
const SSS_MSC_MIN = 4000;
const SSS_MSC_REGULAR_MAX = 20000;
const SSS_MSC_MAX = 30000; // regular (20,000) + WISP (10,000)
const SSS_BRACKET_SIZE = 500;
const SSS_BRACKET_FLOOR = 4250; // compensation below this uses the ₱4,000 minimum MSC

// Monthly Salary Credit for a given monthly compensation, per the SSS
// contribution schedule's ₱500 brackets.
export function sssMonthlySalaryCredit(monthlyCompensation: number): number {
  if (monthlyCompensation < SSS_BRACKET_FLOOR) return SSS_MSC_MIN;
  if (monthlyCompensation >= SSS_MSC_MAX - SSS_BRACKET_SIZE + 250) return SSS_MSC_MAX;
  const bracketIndex = Math.floor((monthlyCompensation - SSS_BRACKET_FLOOR) / SSS_BRACKET_SIZE);
  return Math.min(SSS_MSC_MIN + 500 + bracketIndex * SSS_BRACKET_SIZE, SSS_MSC_MAX);
}

export interface SssComputation {
  msc: number;
  regularMsc: number;
  wispMsc: number;
  regular: ContributionSplit;
  wisp: ContributionSplit;
}

// `monthlyCompensation` should be the employee's regular monthly compensation
// (the "Basis of Mandatories") — not a single pay period's actual earnings —
// since SSS contributions are keyed to the employee's standing salary
// bracket, not fluctuating period-to-period pay.
export function computeSss(monthlyCompensation: number): SssComputation {
  const msc = sssMonthlySalaryCredit(monthlyCompensation);
  const regularMsc = Math.min(msc, SSS_MSC_REGULAR_MAX);
  const wispMsc = Math.max(msc - SSS_MSC_REGULAR_MAX, 0);
  return {
    msc,
    regularMsc,
    wispMsc,
    regular: {
      employee: Math.round(regularMsc * SSS_RATE_EMPLOYEE * 100) / 100,
      employer: Math.round(regularMsc * SSS_RATE_EMPLOYER * 100) / 100,
    },
    wisp: {
      employee: Math.round(wispMsc * SSS_RATE_EMPLOYEE * 100) / 100,
      employer: Math.round(wispMsc * SSS_RATE_EMPLOYER * 100) / 100,
    },
  };
}

// --- PhilHealth ------------------------------------------------------------

const PHILHEALTH_RATE = 0.05; // 5% total, split evenly
const PHILHEALTH_FLOOR = 10000;
const PHILHEALTH_CEILING = 100000;

export function computePhilHealth(monthlyCompensation: number): ContributionSplit {
  const base = Math.min(Math.max(monthlyCompensation, PHILHEALTH_FLOOR), PHILHEALTH_CEILING);
  const half = Math.round(((base * PHILHEALTH_RATE) / 2) * 100) / 100;
  return { employee: half, employer: half };
}

// --- Pag-IBIG (HDMF) ---------------------------------------------------------

const HDMF_RATE = 0.02; // both employee and employer, for compensation > 1,500/mo
const HDMF_LOW_RATE_EMPLOYEE = 0.01; // for compensation <= 1,500/mo
const HDMF_LOW_RATE_THRESHOLD = 1500;
const HDMF_CEILING = 10000; // Monthly Fund Salary ceiling, effective Feb 2024

export function computeHdmf(monthlyCompensation: number): ContributionSplit {
  const base = Math.min(monthlyCompensation, HDMF_CEILING);
  const employeeRate = monthlyCompensation <= HDMF_LOW_RATE_THRESHOLD ? HDMF_LOW_RATE_EMPLOYEE : HDMF_RATE;
  return {
    employee: Math.round(base * employeeRate * 100) / 100,
    employer: Math.round(base * HDMF_RATE * 100) / 100,
  };
}

// --- BIR withholding tax (semi-monthly table, TRAIN law) --------------------

const SEMI_MONTHLY_TAX_TABLE = [
  { over: 0, upTo: 10417, base: 0, rate: 0 },
  { over: 10417, upTo: 16667, base: 0, rate: 0.15 },
  { over: 16667, upTo: 33333, base: 937.5, rate: 0.2 },
  { over: 33333, upTo: 83333, base: 4270.7, rate: 0.25 },
  { over: 83333, upTo: 333333, base: 16770.7, rate: 0.3 },
  { over: 333333, upTo: Infinity, base: 91770.7, rate: 0.35 },
];

export function computeSemiMonthlyWithholdingTax(taxableCompensation: number): number {
  if (taxableCompensation <= 0) return 0;
  const bracket = SEMI_MONTHLY_TAX_TABLE.find((b) => taxableCompensation > b.over && taxableCompensation <= b.upTo) ?? SEMI_MONTHLY_TAX_TABLE[SEMI_MONTHLY_TAX_TABLE.length - 1];
  return Math.round(bracket.base + (taxableCompensation - bracket.over) * bracket.rate);
}
