import "server-only";
import { createHash, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cleanQuestions } from "@/lib/exams";

// Server side of applicant exams (app/api/careers/exam).

export const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");
export const validToken = (t: unknown): t is string => typeof t === "string" && /^[A-Za-z0-9_-]{40,60}$/.test(t);

// Gives an active exam to an applicant who just applied online; returns the
// secret link token, or null if there's no usable exam.
export async function giveExam(admin: SupabaseClient, applicantId: string, examId: string | null): Promise<string | null> {
  if (!examId) return null;
  const { data: e } = await admin.from("exams").select("id, status, title, instructions, time_limit_minutes, passing_percent, questions").eq("id", examId).maybeSingle();
  if (!e || e.status !== "active") return null;
  const questions = cleanQuestions(e.questions);
  if (!questions.length) return null;
  const token = randomBytes(32).toString("base64url");
  const { error } = await admin.from("applicant_exams").insert({
    applicant_id: applicantId,
    exam_id: e.id,
    token_hash: hashToken(token),
    title: e.title,
    instructions: e.instructions,
    time_limit_minutes: e.time_limit_minutes,
    passing_percent: e.passing_percent,
    questions,
    max_score: questions.reduce((t, q) => t + q.points, 0),
  });
  return error ? null : token;
}
