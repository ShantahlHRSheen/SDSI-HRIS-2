"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlarmClock, CheckCircle2, ClipboardCheck, Send, TimerOff } from "lucide-react";
import { COMPANIES, type CompanyId } from "@/lib/companies";
import type { PublicExam } from "@/lib/exams";
import { LIKERT } from "@/lib/psych";

/* eslint-disable @next/next/no-img-element -- static brand logo and exam figures */

// An applicant's initial exam (app/api/careers/exam). Answers are kept in this
// browser while answering, so a refresh doesn't lose them.

type Answers = Record<string, number | string>;
const store = (t: string) => `lsm-exam:${t.slice(0, 16)}`;
const readSaved = (t: string): Answers => {
  try {
    return JSON.parse(localStorage.getItem(store(t)) ?? "{}") as Answers;
  } catch {
    return {};
  }
};

export function ExamTaker({ co, token }: { co: CompanyId; token: string }) {
  const c = COMPANIES[co];
  const t = c.formTheme ?? { deep: "#013825", mid: "#0b6b45", accent: "#7cc9a0" };
  const [exam, setExam] = useState<PublicExam | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [answers, setAnswers] = useState<Answers>({});
  const [now, setNow] = useState(() => Date.now());
  const sent = useRef(false);

  useEffect(() => {
    fetch(`/api/careers/exam?co=${co}&t=${encodeURIComponent(token)}`, { cache: "no-store" })
      .then(async (r) => {
        const b = await r.json();
        if (!r.ok) throw new Error(b.error ?? "This exam link isn't valid.");
        setExam(b as PublicExam);
        setAnswers(readSaved(token));
      })
      .catch((e: Error) => setError(e.message));
  }, [co, token]);

  const post = useCallback(
    async (action: "start" | "submit", body: object = {}) => {
      setBusy(true);
      setError(null);
      try {
        const r = await fetch("/api/careers/exam", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ co, t: token, action, ...body }) });
        const b = await r.json();
        if (!r.ok) throw new Error(b.error ?? "Something went wrong. Please try again.");
        setExam(b as PublicExam);
        if (action === "submit") {
          try {
            localStorage.removeItem(store(token));
          } catch {}
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong.");
        if (action === "submit") sent.current = false;
      } finally {
        setBusy(false);
      }
    },
    [co, token],
  );

  function answer(id: string, v: number | string) {
    setAnswers((a) => {
      const next = { ...a, [id]: v };
      try {
        localStorage.setItem(store(token), JSON.stringify(next));
      } catch {}
      return next;
    });
  }

  const submit = useCallback(() => {
    if (sent.current) return;
    sent.current = true;
    void post("submit", { answers });
  }, [answers, post]);

  // The clock; answers go in by themselves when time runs out.
  const deadline = exam?.status === "in_progress" && exam.deadlineAt ? new Date(exam.deadlineAt).getTime() : null;
  useEffect(() => {
    if (!deadline) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [deadline]);
  const left = deadline ? Math.max(0, deadline - now) : null;
  useEffect(() => {
    if (left === 0) submit();
  }, [left, submit]);

  const answered = useMemo(() => (exam?.questions ?? []).filter((q) => answers[q.id] !== undefined && answers[q.id] !== "").length, [exam, answers]);
  const clock = left === null ? "" : `${Math.floor(left / 60000)}:${String(Math.floor((left % 60000) / 1000)).padStart(2, "0")}`;

  return (
    <div className="flex flex-1 flex-col">
      <section style={{ background: `linear-gradient(120deg, ${t.deep}, ${t.mid})` }}>
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-6 text-white">
          <img src={c.logo} alt="" className="h-12 w-12 shrink-0 rounded-full bg-white object-contain p-0.5" />
          <div className="min-w-0">
            <div className="text-xs text-white/75">{c.name} · {exam?.kind === "psych" ? "Pre-employment screening" : "Initial exam"}</div>
            <h1 className="truncate text-xl font-semibold">{exam?.title || "Initial exam"}</h1>
            {exam && <div className="text-xs text-white/75">{[exam.applicantName, exam.position].filter(Boolean).join(" · ")}</div>}
          </div>
        </div>
      </section>

      {exam?.status === "in_progress" && (
        <div className="sticky top-16 z-30 border-b border-[var(--border-hairline)] bg-white/95 backdrop-blur">
          <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-2 text-sm">
            <span className="text-[var(--text-secondary)]">
              Answered <b className="text-[var(--text-primary)]">{answered}</b> of {exam.questionCount}
            </span>
            {left !== null && (
              <span className={`ml-auto inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-semibold tabular-nums ${left < 60_000 ? "bg-red-100 text-red-700" : "bg-[#eef2f0] text-[var(--text-primary)]"}`}>
                <AlarmClock size={15} /> {clock}
              </span>
            )}
          </div>
        </div>
      )}

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        {!exam && !error && <p className="text-sm text-[var(--text-muted)]">Loading…</p>}
        {error && <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        {exam?.status === "pending" && (
          <div className="space-y-4 rounded-xl border border-[var(--border-hairline)] bg-white p-6">
            <ClipboardCheck size={36} style={{ color: t.mid }} />
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">Before you start</h2>
            {exam.instructions && <p className="text-sm leading-relaxed whitespace-pre-wrap text-[var(--text-secondary)]">{exam.instructions}</p>}
            <ul className="list-disc space-y-1 pl-5 text-sm text-[var(--text-secondary)]">
              <li>{exam.kind === "psych" ? `${exam.questionCount} statements, about 10 minutes.` : `${exam.questionCount} questions.`}</li>
              <li>{exam.timeLimitMinutes ? `You have ${exam.timeLimitMinutes} minutes once you start. Your answers are sent by themselves when the time is up.` : "There's no time limit."}</li>
              <li>You can take it once. Use a steady internet connection.</li>
              <li>This link works until {new Date(exam.linkExpiresAt).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", month: "long", day: "numeric", year: "numeric" })}.</li>
            </ul>
            <button disabled={busy} onClick={() => post("start")} className="inline-flex items-center gap-1.5 rounded-lg px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50" style={{ background: t.mid }}>
              {busy ? "Starting…" : "Start the exam"}
            </button>
          </div>
        )}

        {exam?.status === "in_progress" && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (exam.kind === "psych" && answered < exam.questionCount) {
                const first = exam.questions?.find((q) => answers[q.id] === undefined);
                setError(`Please answer all ${exam.questionCount} statements first (${exam.questionCount - answered} left).`);
                if (first) document.getElementById(`item-${first.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
                return;
              }
              if (window.confirm(answered < exam.questionCount ? `You answered ${answered} of ${exam.questionCount}. Send your answers now?` : "Send your answers now? You can't change them after.")) submit();
            }}
            className="space-y-4"
          >
            {exam.instructions && <p className="text-sm whitespace-pre-wrap text-[var(--text-secondary)]">{exam.instructions}</p>}
            {exam.kind === "psych" && (
              <p className="rounded-lg bg-[#eef2f0] px-3 py-2 text-xs text-[var(--text-secondary)]">
                {LIKERT.map((l, k) => `${k + 1} = ${l}`).join(" · ")}
              </p>
            )}
            {exam.questions?.map((q, i) => (
              <div key={q.id} className="space-y-3">
              {q.section && <h2 className="pt-2 text-sm font-bold tracking-wide text-[var(--text-primary)] uppercase">{q.section}</h2>}
              <fieldset id={`item-${q.id}`} className="rounded-xl border border-[var(--border-hairline)] bg-white p-5">
                <legend className="sr-only">Question {i + 1}</legend>
                <div className="mb-3 flex gap-2">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white" style={{ background: t.mid }}>
                    {i + 1}
                  </span>
                  <p className="flex-1 text-sm font-medium whitespace-pre-wrap text-[var(--text-primary)]">{q.prompt}</p>
                  {q.kind !== "likert" && (
                    <span className="shrink-0 text-xs text-[var(--text-muted)]">
                      {q.points} pt{q.points === 1 ? "" : "s"}
                    </span>
                  )}
                </div>
                {q.image && <img src={q.image} alt={`Figure for question ${i + 1}`} className="mb-3 max-h-72 max-w-full rounded-md border border-[var(--border-hairline)] bg-white sm:ml-8" />}
                {q.kind === "likert" ? (
                  <div className="grid grid-cols-5 gap-1.5 sm:pl-8">
                    {LIKERT.map((l, k) => (
                      <label key={k} className={`flex min-h-12 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-lg border px-1 py-1.5 text-center text-[11px] leading-tight ${answers[q.id] === k + 1 ? "border-[#0b6b45] bg-[#0b6b45] text-white" : "border-[var(--border-hairline)] text-[var(--text-secondary)] hover:border-[#0b6b45]"}`}>
                        <input type="radio" name={q.id} checked={answers[q.id] === k + 1} onChange={() => answer(q.id, k + 1)} className="sr-only" />
                        <b className="text-sm">{k + 1}</b>
                        <span className="hidden sm:block">{l}</span>
                      </label>
                    ))}
                  </div>
                ) : q.kind === "choice" ? (
                  <div className="space-y-2 pl-8">
                    {q.choices.map((ch, k) => (
                      <label key={k} className={`flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 text-sm ${answers[q.id] === k ? "border-[#0b6b45] bg-[#eef7f2]" : "border-[var(--border-hairline)] hover:bg-[#f6f8f7]"}`}>
                        <input type="radio" name={q.id} checked={answers[q.id] === k} onChange={() => answer(q.id, k)} className="mt-0.5" />
                        <span className="text-[var(--text-primary)]">{ch}</span>
                      </label>
                    ))}
                  </div>
                ) : (
                  <textarea rows={5} maxLength={5000} value={String(answers[q.id] ?? "")} onChange={(e) => answer(q.id, e.target.value)} className="ml-8 w-[calc(100%-2rem)] rounded-lg border border-[var(--border-hairline)] bg-white px-3 py-2 text-sm" placeholder="Type your answer." />
                )}
              </fieldset>
              </div>
            ))}
            <div className="flex justify-end">
              <button type="submit" disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50" style={{ background: t.mid }}>
                <Send size={15} /> {busy ? "Sending…" : "Send my answers"}
              </button>
            </div>
          </form>
        )}

        {exam?.status === "submitted" && (
          <div className="space-y-3 rounded-xl border border-[var(--border-hairline)] bg-white p-8 text-center">
            <CheckCircle2 size={44} className="mx-auto" style={{ color: t.mid }} />
            <p className="text-lg font-semibold text-[var(--text-primary)]">Your answers were sent. Thank you!</p>
            <p className="text-sm text-[var(--text-secondary)]">{c.name}&rsquo;s HR team will review your exam with your application and contact you if you&rsquo;re shortlisted.</p>
          </div>
        )}
        {exam?.status === "expired" && (
          <div className="space-y-3 rounded-xl border border-[var(--border-hairline)] bg-white p-8 text-center">
            <TimerOff size={44} className="mx-auto text-[var(--text-muted)]" />
            <p className="text-lg font-semibold text-[var(--text-primary)]">The time for this exam has run out.</p>
            <p className="text-sm text-[var(--text-secondary)]">If something went wrong, please contact {c.name}&rsquo;s HR.</p>
          </div>
        )}
      </main>
    </div>
  );
}
