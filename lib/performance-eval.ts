import type { EvaluationCriterion, Employee } from "./types";

// ---------------------------------------------------------------------------
// KPI template and scoring formula for the Employee Performance Evaluation
// Form (company-provided KPI/weight/rating-scale spec) — 14 KPIs across two
// categories, each rated 0-3 against a written anchor per level, weighted to
// a 0-100% overall score with a rating band.
//
// Formula per KPI: Points = (Rating / 3) * Weight
// Category subtotal: sum of that category's Points
// Overall score: sum of all Points, expressed as a percentage (weights are
// already fractions of 100%, e.g. 0.15 = 15%)
// ---------------------------------------------------------------------------

export type KpiCategory = "Behavior" | "Job Performance";

export interface KpiAnchors {
  0: string;
  1: string;
  2: string;
  3: string;
}

export interface KpiTemplateItem {
  category: KpiCategory;
  label: string;
  weight: number;
  anchors: KpiAnchors;
}

export const CATEGORY_WEIGHTS: Record<KpiCategory, number> = {
  Behavior: 0.4,
  "Job Performance": 0.6,
};

export const KPI_TEMPLATE: KpiTemplateItem[] = [
  {
    category: "Behavior",
    label: "Comes to work on time",
    weight: 0.0571,
    anchors: { 0: "Late 6+ times/month", 1: "Late 3-5 times/month", 2: "Late 1-2 times/month", 3: "0 late arrivals/month" },
  },
  {
    category: "Behavior",
    label: "Attendance",
    weight: 0.0571,
    anchors: { 0: "4+ unexcused absences/month", 1: "2-3 unexcused absences/month", 2: "1 unexcused absence/month", 3: "0 unexcused absences/month" },
  },
  {
    category: "Behavior",
    label: "Wears proper uniform, footwear, and ID",
    weight: 0.0571,
    anchors: { 0: "Non-compliant 4+ times/month", 1: "Non-compliant 2-3 times/month", 2: "Non-compliant 1 time/month", 3: "Fully compliant every day observed" },
  },
  {
    category: "Behavior",
    label: "Avoids gossip and negative rumors",
    weight: 0.0571,
    anchors: {
      0: "2+ documented incidents causing conflict/disruption",
      1: "1 documented incident or verbal warning issued",
      2: "No incidents; occasional idle talk, no harm caused",
      3: "No incidents; actively discourages gossip among peers",
    },
  },
  {
    category: "Behavior",
    label: "Not using company time for unauthorized activities",
    weight: 0.0571,
    anchors: {
      0: "Caught 2+ times misusing time/resources",
      1: "Caught 1 time; verbal reminder given",
      2: "No violations; occasionally needs reminders",
      3: "No violations; consistently productive without supervision",
    },
  },
  {
    category: "Behavior",
    label: "Follows established processes (Leaves, OT, Locator, etc.)",
    weight: 0.0571,
    anchors: { 0: "Fails to follow process 4+ times/month", 1: "Fails 2-3 times/month", 2: "Fails 1 time/month", 3: "100% compliance, always on time and correct" },
  },
  {
    category: "Behavior",
    label: "Follows lawful orders of superiors and HR",
    weight: 0.0572,
    anchors: {
      0: "Refuses/disregards instructions (2+ documented cases)",
      1: "1 documented case of non-compliance/pushback",
      2: "Complies but occasionally needs follow-up",
      3: "Complies fully and promptly every time",
    },
  },
  {
    category: "Job Performance",
    label: "Productivity",
    weight: 0.15,
    anchors: { 0: "Output below 70% of target", 1: "Output 70-89% of target", 2: "Output 90-99% of target", 3: "Output ≥100% of target" },
  },
  {
    category: "Job Performance",
    label: "Accuracy of work",
    weight: 0.15,
    anchors: { 0: "Error/rework rate >10%", 1: "Error/rework rate 5-10%", 2: "Error/rework rate 2-4%", 3: "Error/rework rate ≤1%" },
  },
  {
    category: "Job Performance",
    label: "Job Mastery",
    weight: 0.06,
    anchors: {
      0: "Cannot perform core tasks without constant supervision",
      1: "Needs regular guidance on core tasks",
      2: "Performs core tasks independently, occasional guidance",
      3: "Fully independent; can train/assist others",
    },
  },
  {
    category: "Job Performance",
    label: "Cooperation with the team",
    weight: 0.06,
    anchors: {
      0: "Frequently causes conflict/refuses to collaborate (2+ cases)",
      1: "Occasional friction; 1 documented case",
      2: "Cooperates well; works fine within the team",
      3: "Proactively supports teammates; strengthens team performance",
    },
  },
  {
    category: "Job Performance",
    label: "Effective communication",
    weight: 0.06,
    anchors: {
      0: "Frequently unresponsive/unclear causing errors/delays (2+)",
      1: "Sometimes unclear or slow to respond (1 incident)",
      2: "Communicates clearly, responds within expected time",
      3: "Communicates proactively and improves team understanding",
    },
  },
  {
    category: "Job Performance",
    label: "Learning and adaptability",
    weight: 0.06,
    anchors: {
      0: "Resists change; repeats same mistakes after training",
      1: "Adapts slowly; needs repeated coaching",
      2: "Adapts within reasonable time with normal guidance",
      3: "Quickly adapts and applies new skills with minimal guidance",
    },
  },
  {
    category: "Job Performance",
    label: "Compliance to instructions",
    weight: 0.06,
    anchors: { 0: "Fails to follow instructions 4+ times/month, causing issues", 1: "Fails 2-3 times/month", 2: "Fails 1 time/month, no major issue", 3: "Follows instructions accurately every time" },
  },
];

export function computeKpiPoints(score: number, weight: number): number {
  return (score / 3) * weight;
}

export interface CategorySubtotal {
  category: KpiCategory;
  weightSum: number;
  pointsSum: number;
}

export function computeCategorySubtotals(criteria: EvaluationCriterion[]): CategorySubtotal[] {
  const categories = Array.from(new Set(criteria.map((c) => c.category))) as KpiCategory[];
  return categories.map((category) => {
    const rows = criteria.filter((c) => c.category === category);
    return {
      category,
      weightSum: rows.reduce((s, c) => s + c.weight, 0),
      pointsSum: rows.reduce((s, c) => s + computeKpiPoints(c.score, c.weight), 0),
    };
  });
}

// Overall score as a percentage (0-100), one decimal place.
export function computeOverallScore(criteria: EvaluationCriterion[]): number {
  const total = criteria.reduce((s, c) => s + computeKpiPoints(c.score, c.weight), 0);
  return Math.round(total * 1000) / 10;
}

export type RatingBand = "Excellent" | "Good" | "Needs Improvement" | "Failed";

export function ratingBand(overallScorePct: number): RatingBand {
  if (overallScorePct >= 85) return "Excellent";
  if (overallScorePct >= 65) return "Good";
  if (overallScorePct >= 35) return "Needs Improvement";
  return "Failed";
}

export function newCriteriaFromTemplate(): EvaluationCriterion[] {
  return KPI_TEMPLATE.map((k) => ({ category: k.category, label: k.label, weight: k.weight, score: 2, remarks: "" }));
}

export function criteriaForCategory(criteria: EvaluationCriterion[], category: KpiCategory): EvaluationCriterion[] {
  return criteria.filter((c) => c.category === category);
}

// HR assigns this explicitly per employee; until they do, the employee's
// org-chart supervisor is the sensible default Job Performance evaluator
// (matches how Department/Branch Managers already supervise their teams).
export function effectiveJobPerformanceEvaluatorId(employee: Employee): string | null {
  return employee.jobPerformanceEvaluatorId ?? employee.supervisorId ?? null;
}
