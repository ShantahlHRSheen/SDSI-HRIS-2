import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient } from "./supabase/client";
import type { CompanyId } from "./companies";
import { PSYCH_INSTRUCTIONS, PSYCH_ITEMS, PSYCH_TITLE, type PsychResult } from "./psych";

// Initial exams for applicants (supabase/migrate_phase85_applicant_exams.sql).
// HR builds exams; applicants take them from a secret link, served and scored
// by the server (app/api/careers/exam); results show on the applicant.

export interface ExamQuestion {
  id: string;
  kind: "choice" | "essay" | "likert"; // likert: the Psychological screening (1–5)
  prompt: string;
  choices: string[]; // choice only
  answer: number | null; // choice only: the right choice's index
  points: number;
}
export interface Exam {
  id: string;
  status: "draft" | "active" | "archived";
  title: string;
  instructions: string;
  timeLimitMinutes: number | null;
  passingPercent: number;
  questions: ExamQuestion[];
  updatedAt: string;
}
export interface ApplicantExam {
  id: string;
  applicantId: string;
  kind: "exam" | "psych";
  result: PsychResult | null; // psych
  status: "pending" | "in_progress" | "submitted" | "expired";
  title: string;
  passingPercent: number;
  questions: ExamQuestion[];
  answers: Record<string, number | string>;
  autoScore: number;
  essayScores: Record<string, number>;
  maxScore: number;
  linkExpiresAt: string;
  startedAt: string | null;
  submittedAt: string | null;
  gradedAt: string | null;
  createdAt: string;
}

// What the applicant's browser gets: no answer key.
export interface PublicExamQuestion {
  id: string;
  kind: "choice" | "essay" | "likert";
  prompt: string;
  choices: string[];
  points: number;
}
export interface PublicExam {
  company: CompanyId;
  kind: "exam" | "psych";
  applicantName: string;
  position: string;
  status: ApplicantExam["status"];
  title: string;
  instructions: string;
  timeLimitMinutes: number | null;
  questionCount: number;
  deadlineAt: string | null;
  linkExpiresAt: string;
  questions?: PublicExamQuestion[]; // once started
}

export const examUrl = (co: CompanyId, token: string) => `/careers/${co}/exam/${token}`;

export const EXAM_STATUS: Record<ApplicantExam["status"], { label: string; tone: "info" | "warning" | "good" | "critical" | "muted" }> = {
  pending: { label: "Not started", tone: "muted" },
  in_progress: { label: "Taking it now", tone: "warning" },
  submitted: { label: "Submitted", tone: "good" },
  expired: { label: "Time ran out", tone: "critical" },
};

export function examTotals(x: Pick<ApplicantExam, "questions" | "autoScore" | "essayScores" | "maxScore" | "passingPercent">) {
  const essays = x.questions.filter((q) => q.kind === "essay");
  const essayScore = essays.reduce((t, q) => t + (Number(x.essayScores[q.id]) || 0), 0);
  const graded = essays.every((q) => x.essayScores[q.id] !== undefined && x.essayScores[q.id] !== null);
  const score = x.autoScore + essayScore;
  const percent = x.maxScore > 0 ? Math.round((score / x.maxScore) * 1000) / 10 : 0;
  return { score, percent, graded, essayCount: essays.length, passed: graded && percent >= x.passingPercent };
}

// Normalizes questions from the database or the editor.
export function cleanQuestions(raw: unknown): ExamQuestion[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((q: Record<string, unknown>, i): ExamQuestion => {
      const kind = q?.kind === "essay" ? "essay" : q?.kind === "likert" ? "likert" : "choice";
      const choices = kind === "choice" && Array.isArray(q.choices) ? q.choices.map((c) => String(c ?? "")).slice(0, 10) : [];
      const a = Number(q?.answer);
      return {
        id: typeof q?.id === "string" && q.id ? q.id : `q${i + 1}`,
        kind,
        prompt: String(q?.prompt ?? ""),
        choices,
        answer: kind === "choice" && Number.isInteger(a) && a >= 0 && a < choices.length ? a : null,
        points: kind === "likert" ? 0 : Math.max(0, Math.min(100, Number(q?.points) || 1)),
      };
    })
    .slice(0, 200);
}

// ---- HR side ---------------------------------------------------------------------------

type Row = Record<string, unknown>;
const db = () => getSupabaseClient() as unknown as SupabaseClient;
const fail = (e: { message: string } | null) => {
  if (e) throw new Error(/(exams|applicant_exams|hiring_assign_exam|hiring_assign_psych|kind|result)/i.test(e.message) && /exist|find|not found|schema cache/i.test(e.message) ? "Exams aren't set up yet — ask HR to run the latest database update." : e.message);
};
const toExam = (r: Row): Exam => ({
  id: String(r.id),
  status: r.status as Exam["status"],
  title: String(r.title ?? ""),
  instructions: String(r.instructions ?? ""),
  timeLimitMinutes: (r.time_limit_minutes as number | null) ?? null,
  passingPercent: Number(r.passing_percent ?? 75),
  questions: cleanQuestions(r.questions),
  updatedAt: String(r.updated_at ?? ""),
});
const toApplicantExam = (r: Row): ApplicantExam => ({
  id: String(r.id),
  applicantId: String(r.applicant_id),
  kind: r.kind === "psych" ? "psych" : "exam",
  result: (r.result as PsychResult | null) ?? null,
  status: r.status as ApplicantExam["status"],
  title: String(r.title ?? ""),
  passingPercent: Number(r.passing_percent ?? 75),
  questions: cleanQuestions(r.questions),
  answers: (r.answers as ApplicantExam["answers"]) ?? {},
  autoScore: Number(r.auto_score ?? 0),
  essayScores: (r.essay_scores as ApplicantExam["essayScores"]) ?? {},
  maxScore: Number(r.max_score ?? 0),
  linkExpiresAt: String(r.link_expires_at ?? ""),
  startedAt: (r.started_at as string | null) ?? null,
  submittedAt: (r.submitted_at as string | null) ?? null,
  gradedAt: (r.graded_at as string | null) ?? null,
  createdAt: String(r.created_at ?? ""),
});

export async function fetchExams(): Promise<Exam[]> {
  const { data, error } = await db().from("exams").select("*").order("updated_at", { ascending: false });
  fail(error);
  return ((data as Row[]) ?? []).map(toExam);
}
type ExamPatch = Partial<Omit<Exam, "id" | "updatedAt">>;
const examRow = (p: ExamPatch): Row => {
  const r: Row = {};
  if (p.status !== undefined) r.status = p.status;
  if (p.title !== undefined) r.title = p.title;
  if (p.instructions !== undefined) r.instructions = p.instructions;
  if (p.timeLimitMinutes !== undefined) r.time_limit_minutes = p.timeLimitMinutes;
  if (p.passingPercent !== undefined) r.passing_percent = p.passingPercent;
  if (p.questions !== undefined) r.questions = cleanQuestions(p.questions);
  return r;
};
export async function createExam(p: ExamPatch): Promise<string> {
  const { data, error } = await db().from("exams").insert(examRow(p)).select("id").single();
  fail(error);
  return String((data as Row).id);
}
export async function updateExam(id: string, p: ExamPatch): Promise<void> {
  const { error } = await db().from("exams").update(examRow(p)).eq("id", id);
  fail(error);
}
export async function deleteExam(id: string): Promise<void> {
  const { error } = await db().from("exams").delete().eq("id", id);
  fail(error);
}

export async function fetchApplicantExams(applicantId: string): Promise<ApplicantExam[]> {
  const { data, error } = await db().from("applicant_exams").select("*").eq("applicant_id", applicantId).order("created_at", { ascending: false });
  if (error) return [];
  return ((data as Row[]) ?? []).map(toApplicantExam);
}
export async function gradeEssays(id: string, scores: Record<string, number>): Promise<void> {
  const { error } = await db().from("applicant_exams").update({ essay_scores: scores }).eq("id", id);
  fail(error);
}
export async function removeApplicantExam(id: string): Promise<void> {
  const { error } = await db().from("applicant_exams").delete().eq("id", id);
  fail(error);
}

async function newLink(): Promise<{ token: string; hash: string }> {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const token = btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return { token, hash: hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token))) };
}
// The Psychological screening, for an applicant; returns the link's secret.
export async function assignPsych(applicantId: string): Promise<string> {
  const { token, hash } = await newLink();
  const questions = PSYCH_ITEMS.map(({ id, prompt }) => ({ id, kind: "likert", prompt, choices: [], answer: null, points: 0 }));
  const { error } = await db().rpc("hiring_assign_psych", { p_applicant: applicantId, p_token_hash: hash, p_title: PSYCH_TITLE, p_instructions: PSYCH_INSTRUCTIONS, p_questions: questions });
  fail(error);
  return token;
}

const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
// A new secret link for an applicant; only its hash is saved.
export async function assignExam(applicantId: string, examId: string): Promise<string> {
  const { token, hash } = await newLink();
  const { error } = await db().rpc("hiring_assign_exam", { p_applicant: applicantId, p_exam: examId, p_token_hash: hash });
  fail(error);
  return token;
}
