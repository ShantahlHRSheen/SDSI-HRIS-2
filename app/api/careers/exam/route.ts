import { isCompanyId, type CompanyId } from "@/lib/companies";
import { cleanQuestions, type PublicExam } from "@/lib/exams";
import { getAdminClient } from "@/lib/server/supabase-admin";
import { hashToken, validToken } from "@/lib/server/exams";

// Public: an applicant's initial exam from their secret link.
//   GET  ?co=&t=                       — the exam (questions once started)
//   POST {co, t, action: "start"}      — starts the clock
//   POST {co, t, action: "submit", answers: {question id: choice index | text}}
// Scored here; the answer key never leaves the server.

const GRACE_MS = 2 * 60_000; // slow networks at the buzzer
const bad = (error: string, status = 400) => Response.json({ error }, { status });
type Row = Record<string, unknown>;

async function load(co: unknown, t: unknown) {
  if (!isCompanyId(co) || !validToken(t)) return null;
  let admin;
  try {
    admin = getAdminClient(co);
  } catch {
    return null;
  }
  const { data } = await admin.from("applicant_exams").select("*").eq("token_hash", hashToken(t)).maybeSingle();
  if (!data) return null;
  return { admin, co: co as CompanyId, x: data as Row };
}

// Time ran out without a submission: closed as it stands.
async function expireIfLate(admin: ReturnType<typeof getAdminClient>, x: Row): Promise<Row> {
  const now = Date.now();
  if (x.status === "in_progress" && x.deadline_at && now > new Date(String(x.deadline_at)).getTime() + GRACE_MS) {
    const { data } = await admin.from("applicant_exams").update({ status: "expired", submitted_at: new Date().toISOString() }).eq("id", x.id).eq("status", "in_progress").select("*").maybeSingle();
    return (data as Row) ?? { ...x, status: "expired" };
  }
  return x;
}

async function view(admin: ReturnType<typeof getAdminClient>, co: CompanyId, x: Row): Promise<PublicExam> {
  const { data: a } = await admin.from("applicants").select("name, position").eq("id", x.applicant_id).maybeSingle();
  const qs = cleanQuestions(x.questions);
  return {
    company: co,
    applicantName: String(a?.name ?? ""),
    position: String(a?.position ?? ""),
    status: x.status as PublicExam["status"],
    title: String(x.title ?? ""),
    instructions: String(x.instructions ?? ""),
    timeLimitMinutes: (x.time_limit_minutes as number | null) ?? null,
    questionCount: qs.length,
    deadlineAt: (x.deadline_at as string | null) ?? null,
    linkExpiresAt: String(x.link_expires_at),
    questions: x.status === "in_progress" ? qs.map(({ id, kind, prompt, choices, points }) => ({ id, kind, prompt, choices, points })) : undefined,
  };
}

const noStore = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
  const u = new URL(request.url);
  const r = await load(u.searchParams.get("co"), u.searchParams.get("t"));
  if (!r) return bad("This exam link isn't valid.", 404);
  const x = await expireIfLate(r.admin, r.x);
  return Response.json(await view(r.admin, r.co, x), { headers: noStore });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { co?: unknown; t?: unknown; action?: unknown; answers?: unknown };
  const r = await load(body.co, body.t);
  if (!r) return bad("This exam link isn't valid.", 404);
  const { admin, co } = r;
  let x = await expireIfLate(admin, r.x);

  if (body.action === "start") {
    if (x.status === "pending") {
      if (Date.now() > new Date(String(x.link_expires_at)).getTime()) return bad("This exam link has expired. Please contact HR.", 410);
      const now = new Date();
      const mins = x.time_limit_minutes as number | null;
      const { data } = await admin
        .from("applicant_exams")
        .update({ status: "in_progress", started_at: now.toISOString(), deadline_at: mins ? new Date(now.getTime() + mins * 60_000).toISOString() : null })
        .eq("id", x.id)
        .eq("status", "pending")
        .select("*")
        .maybeSingle();
      if (data) x = data as Row;
      else x = (await admin.from("applicant_exams").select("*").eq("id", x.id).single()).data as Row;
    }
    return Response.json(await view(admin, co, x), { headers: noStore });
  }

  if (body.action === "submit") {
    if (x.status !== "in_progress") return bad(x.status === "submitted" ? "You already sent your answers. Thank you!" : x.status === "expired" ? "The time for this exam has run out." : "Start the exam first.", 409);
    const qs = cleanQuestions(x.questions);
    const raw = body.answers && typeof body.answers === "object" ? (body.answers as Record<string, unknown>) : {};
    const answers: Record<string, number | string> = {};
    let auto = 0;
    for (const q of qs) {
      const v = raw[q.id];
      if (q.kind === "choice") {
        const n = Number(v);
        if (v !== null && v !== undefined && v !== "" && Number.isInteger(n) && n >= 0 && n < q.choices.length) {
          answers[q.id] = n;
          if (q.answer === n) auto += q.points;
        }
      } else if (typeof v === "string" && v.trim()) {
        answers[q.id] = v.slice(0, 5000);
      }
    }
    const { data, error } = await admin
      .from("applicant_exams")
      .update({ status: "submitted", answers, auto_score: auto, submitted_at: new Date().toISOString() })
      .eq("id", x.id)
      .eq("status", "in_progress")
      .select("*")
      .maybeSingle();
    if (error || !data) return bad("Your answers couldn't be sent. Please try again.", 500);
    return Response.json(await view(admin, co, data as Row), { headers: noStore });
  }
  return bad("Unknown action.");
}
