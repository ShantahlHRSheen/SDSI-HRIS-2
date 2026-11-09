"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Check, Copy, Eye, Link2, Plus, Save, Send, Trash2, X } from "lucide-react";
import { Badge } from "@/components/Badge";
import { Modal } from "@/components/Modal";
import { reportSaveError } from "@/lib/save-errors";
import { currentCompanyId } from "@/lib/companies";
import { BAND, LIKERT, PSYCH_ITEMS, PSYCH_NOTE, TRAITS, band, type PsychResult, type Tone, type Trait } from "@/lib/psych";
import {
  EXAM_STATUS,
  assignExam,
  assignPsych,
  cleanQuestions,
  createExam,
  deleteExam,
  examTotals,
  examUrl,
  fetchApplicantExams,
  fetchExams,
  gradeEssays,
  removeApplicantExam,
  updateExam,
  type ApplicantExam,
  type Exam,
  type ExamQuestion,
} from "@/lib/exams";

// HR: initial exams for applicants (lib/exams.ts) — the exam builder, and the
// results on an applicant's record.

const input = "w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-2 text-sm disabled:opacity-70";
const lbl = "mb-1 block text-xs font-medium text-[var(--text-secondary)]";
const primary = "flex items-center gap-1.5 rounded-lg bg-[var(--series-1)] px-3 py-2 text-sm font-medium text-[var(--on-accent)] disabled:opacity-40";
const secondary = "flex items-center gap-1.5 rounded-lg border border-[var(--border-hairline)] px-3 py-2 text-sm text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40 disabled:opacity-40";
const danger = "flex items-center gap-1.5 rounded-lg border border-[var(--status-critical)]/50 px-3 py-2 text-sm text-[var(--status-critical)] hover:bg-[var(--status-critical)]/10 disabled:opacity-40";
const icon = "rounded-md p-1.5 text-[var(--text-muted)] hover:bg-[var(--gridline)]/50 disabled:opacity-30";
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }) : "—");
const STATUS: Record<Exam["status"], { label: string; tone: "info" | "good" | "muted" }> = {
  draft: { label: "Draft", tone: "info" },
  active: { label: "Active — can be given", tone: "good" },
  archived: { label: "Archived", tone: "muted" },
};

export function Exams() {
  const [list, setList] = useState<Exam[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Exam | "new" | null>(null);
  const load = useCallback(() => {
    fetchExams().then(
      (l) => {
        setList(l);
        setError(null);
      },
      (e) => setError(e instanceof Error ? e.message : "Couldn't load the exams."),
    );
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--text-secondary)]">
        Build an initial exam, make it <b>Active</b>, and choose it on a job post: people who apply online for that job can take it right away (or within 7 days from their link). For a walk-in applicant, open their record and use <b>Give an exam</b>.
      </p>
      <button onClick={() => setEditing("new")} className={primary}>
        <Plus size={16} /> New exam
      </button>
      {error && <div className="text-sm text-[var(--status-critical)]">{error}</div>}
      {list === null && !error && <div className="text-sm text-[var(--text-muted)]">Loading…</div>}
      {list && list.length === 0 && <div className="rounded-xl border border-dashed border-[var(--border-hairline)] p-6 text-center text-sm text-[var(--text-muted)]">No exams yet.</div>}
      <div className="space-y-2">
        {list?.map((e) => (
          <button key={e.id} onClick={() => setEditing(e)} className="flex w-full flex-wrap items-center gap-3 rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-1)] p-3 text-left hover:bg-[var(--gridline)]/30">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-[var(--text-primary)]">{e.title}</div>
              <div className="text-xs text-[var(--text-muted)]">
                {e.questions.length} question{e.questions.length === 1 ? "" : "s"} · {e.questions.reduce((t, q) => t + q.points, 0)} points · pass at {e.passingPercent}%{e.timeLimitMinutes ? ` · ${e.timeLimitMinutes} min` : " · no time limit"}
              </div>
            </div>
            <Badge tone={STATUS[e.status].tone}>{STATUS[e.status].label}</Badge>
          </button>
        ))}
      </div>
      {editing && (
        <ExamEditor
          exam={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}
    </div>
  );
}

const newQuestion = (kind: ExamQuestion["kind"]): ExamQuestion => ({ id: `q${crypto.randomUUID().slice(0, 8)}`, kind, prompt: "", choices: kind === "choice" ? ["", ""] : [], answer: kind === "choice" ? 0 : null, points: kind === "choice" ? 1 : 5 });

function ExamEditor({ exam, onClose, onSaved }: { exam: Exam | null; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState(exam?.title ?? "");
  const [instructions, setInstructions] = useState(exam?.instructions ?? "");
  const [limit, setLimit] = useState<string>(exam?.timeLimitMinutes ? String(exam.timeLimitMinutes) : "");
  const [pass, setPass] = useState(String(exam?.passingPercent ?? 75));
  const [qs, setQs] = useState<ExamQuestion[]>(exam?.questions.length ? exam.questions : [newQuestion("choice")]);
  const [busy, setBusy] = useState(false);
  const status = exam?.status ?? "draft";
  const setQ = (i: number, p: Partial<ExamQuestion>) => setQs((l) => l.map((q, k) => (k === i ? { ...q, ...p } : q)));
  const move = (i: number, d: -1 | 1) => setQs((l) => {
    const n = [...l];
    [n[i], n[i + d]] = [n[i + d], n[i]];
    return n;
  });

  async function save(next?: Exam["status"]) {
    if (title.trim().length < 2) return reportSaveError("Type the exam's title.");
    const clean = cleanQuestions(qs.map((q) => ({ ...q, prompt: q.prompt.trim(), choices: q.choices.map((c) => c.trim()) })));
    if ((next ?? status) === "active") {
      if (!clean.length) return reportSaveError("Add at least one question.");
      const badQ = clean.findIndex((q) => !q.prompt || (q.kind === "choice" && (q.choices.length < 2 || q.choices.some((c) => !c) || q.answer === null)));
      if (badQ >= 0) return reportSaveError(`Question ${badQ + 1}: type the question, at least two choices, and mark the right one.`);
    }
    setBusy(true);
    try {
      const p = { title: title.trim(), instructions, timeLimitMinutes: limit ? Math.max(1, Math.min(600, Number(limit) || 0)) : null, passingPercent: Math.max(0, Math.min(100, Number(pass) || 0)), questions: clean, ...(next ? { status: next } : {}) };
      if (exam) await updateExam(exam.id, p);
      else await createExam(p);
      onSaved();
    } catch (e) {
      reportSaveError("Couldn't save the exam", e);
      setBusy(false);
    }
  }

  const total = qs.reduce((t, q) => t + (Number(q.points) || 0), 0);
  return (
    <Modal open onClose={onClose} title={exam ? "Exam" : "New exam"} wide>
      <div className="space-y-3">
        <label className="block">
          <span className={lbl}>Title *</span>
          <input className={input} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Sales Associate — initial exam" />
        </label>
        <label className="block">
          <span className={lbl}>Instructions for the applicant</span>
          <textarea rows={3} className={input} value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="e.g. Choose the best answer. Answer the essay questions in English or Filipino." />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label>
            <span className={lbl}>Time limit in minutes (blank = none)</span>
            <input type="number" min={1} max={600} className={input} value={limit} onChange={(e) => setLimit(e.target.value)} />
          </label>
          <label>
            <span className={lbl}>Passing score (%)</span>
            <input type="number" min={0} max={100} className={input} value={pass} onChange={(e) => setPass(e.target.value)} />
          </label>
        </div>

        <div className="flex items-center gap-2 pt-2">
          <div className="text-xs font-semibold text-[var(--text-primary)] uppercase">Questions</div>
          <span className="text-xs text-[var(--text-muted)]">
            {qs.length} · {total} points
          </span>
        </div>
        {qs.map((q, i) => (
          <div key={q.id} className="space-y-2 rounded-lg border border-[var(--border-hairline)] p-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-[var(--text-primary)]">
                {i + 1}. {q.kind === "choice" ? "Multiple choice" : "Essay (HR scores it)"}
              </span>
              <label className="ml-auto flex items-center gap-1 text-xs text-[var(--text-secondary)]">
                Points
                <input type="number" min={0} max={100} className="w-16 rounded-md border border-[var(--border-hairline)] bg-[var(--surface-1)] px-2 py-1 text-xs" value={q.points} onChange={(e) => setQ(i, { points: Number(e.target.value) })} />
              </label>
              <button className={icon} disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up">
                <ArrowUp size={14} />
              </button>
              <button className={icon} disabled={i === qs.length - 1} onClick={() => move(i, 1)} aria-label="Move down">
                <ArrowDown size={14} />
              </button>
              <button className={icon} onClick={() => setQs((l) => l.filter((_, k) => k !== i))} aria-label="Remove the question">
                <Trash2 size={14} />
              </button>
            </div>
            <textarea rows={2} className={input} value={q.prompt} onChange={(e) => setQ(i, { prompt: e.target.value })} placeholder="Type the question." />
            {q.kind === "choice" && (
              <div className="space-y-1.5">
                {q.choices.map((c, k) => (
                  <div key={k} className="flex items-center gap-2">
                    <input type="radio" name={`ans-${q.id}`} checked={q.answer === k} onChange={() => setQ(i, { answer: k })} title="The right answer" aria-label={`Choice ${k + 1} is the right answer`} />
                    <input className={input} value={c} onChange={(e) => setQ(i, { choices: q.choices.map((x, j) => (j === k ? e.target.value : x)) })} placeholder={`Choice ${k + 1}`} />
                    <button
                      className={icon}
                      disabled={q.choices.length <= 2}
                      onClick={() => setQ(i, { choices: q.choices.filter((_, j) => j !== k), answer: q.answer === k ? 0 : q.answer !== null && q.answer > k ? q.answer - 1 : q.answer })}
                      aria-label="Remove the choice"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
                {q.choices.length < 10 && (
                  <button onClick={() => setQ(i, { choices: [...q.choices, ""] })} className="text-xs text-[var(--series-1)] hover:underline">
                    + Add a choice
                  </button>
                )}
                <p className="text-[11px] text-[var(--text-muted)]">Select the circle beside the right answer.</p>
              </div>
            )}
          </div>
        ))}
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setQs((l) => [...l, newQuestion("choice")])} className={secondary}>
            <Plus size={15} /> Multiple choice
          </button>
          <button onClick={() => setQs((l) => [...l, newQuestion("essay")])} className={secondary}>
            <Plus size={15} /> Essay
          </button>
        </div>
        {exam && <p className="text-[11px] text-[var(--text-muted)]">Changes apply to exams given from now on; exams already given keep the questions they had.</p>}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Badge tone={STATUS[status].tone}>{STATUS[status].label}</Badge>
        <div className="ml-auto flex flex-wrap gap-2">
          {exam && (
            <button disabled={busy} onClick={() => window.confirm("Delete this exam? Results already given stay on the applicants.") && deleteExam(exam.id).then(onSaved, (e) => reportSaveError("Couldn't delete", e))} className={danger}>
              <Trash2 size={15} /> Delete
            </button>
          )}
          <button disabled={busy} onClick={() => save()} className={secondary}>
            <Save size={15} /> Save
          </button>
          {status === "active" ? (
            <button disabled={busy} onClick={() => save("archived")} className={secondary}>
              Archive
            </button>
          ) : (
            <button disabled={busy} onClick={() => save("active")} className={primary}>
              <Send size={15} /> Make active
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}

// ---- On an applicant's record -----------------------------------------------------------

const PSYCH = "__psych";
const TONE: Record<Tone, "good" | "warning" | "critical"> = { good: "good", warn: "warning", bad: "critical" };

export function ApplicantExams({ applicantId, isHr }: { applicantId: string; isHr: boolean }) {
  const [list, setList] = useState<ApplicantExam[] | null>(null);
  const [exams, setExams] = useState<Exam[]>([]);
  const [pick, setPick] = useState("");
  const [link, setLink] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => {
    fetchApplicantExams(applicantId).then(setList, () => setList([]));
  }, [applicantId]);
  useEffect(() => {
    load();
    if (isHr) fetchExams().then((l) => setExams(l.filter((e) => e.status === "active")), () => {});
  }, [load, isHr]);

  async function give() {
    if (!pick) return;
    setBusy(true);
    try {
      const token = pick === PSYCH ? await assignPsych(applicantId) : await assignExam(applicantId, pick);
      setLink(new URL(examUrl(currentCompanyId(), token), window.location.origin).toString());
      setPick("");
      load();
    } catch (e) {
      reportSaveError("Couldn't give the exam", e);
    } finally {
      setBusy(false);
    }
  }

  if (list === null) return null;
  if (!list.length && !isHr) return null;
  return (
    <div>
      <div className="mb-2 text-xs font-semibold text-[var(--text-primary)] uppercase">Initial exam</div>
      {!list.length && <p className="mb-2 text-sm text-[var(--text-muted)]">No exam yet.</p>}
      <div className="space-y-2">
        {list.map((x) => {
          const t = examTotals(x);
          return (
            <div key={x.id} className="rounded-lg border border-[var(--border-hairline)] p-3">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-medium text-[var(--text-primary)]">{x.title}</span>
                <Badge tone={EXAM_STATUS[x.status].tone}>{EXAM_STATUS[x.status].label}</Badge>
                {x.kind === "psych" && x.result && (
                  <>
                    <span className="text-[var(--text-secondary)]">
                      Overall <b className="text-[var(--text-primary)]">{x.result.overall}</b> / 100
                    </span>
                    <Badge tone={TONE[x.result.verdict[0]]}>{x.result.verdict[1]}</Badge>
                  </>
                )}
                {x.kind === "exam" && (x.status === "submitted" || x.status === "expired") && (
                  <>
                    <span className="text-[var(--text-secondary)]">
                      <b className="text-[var(--text-primary)]">{t.score}</b> / {x.maxScore} ({t.percent}%)
                    </span>
                    {t.graded ? <Badge tone={t.passed ? "good" : "critical"}>{t.passed ? "Passed" : "Below passing"}</Badge> : <Badge tone="warning">{t.essayCount} essay{t.essayCount === 1 ? "" : "s"} to score</Badge>}
                  </>
                )}
                <span className="ml-auto text-xs text-[var(--text-muted)]">{x.submittedAt ? `Sent ${when(x.submittedAt)}` : x.status === "pending" ? `Link works until ${when(x.linkExpiresAt)}` : `Started ${when(x.startedAt)}`}</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {(x.status === "submitted" || x.status === "expired") && (
                  <button onClick={() => setOpen(open === x.id ? null : x.id)} className={secondary}>
                    <Eye size={15} /> {open === x.id ? "Hide" : x.kind === "psych" ? "View the report" : isHr && !t.graded ? "View answers and score essays" : "View answers"}
                  </button>
                )}
                {isHr && (
                  <button disabled={busy} onClick={() => window.confirm("Remove this exam from the applicant? Its link stops working and the result is deleted.") && removeApplicantExam(x.id).then(load, (e) => reportSaveError("Couldn't remove it", e))} className={danger}>
                    <Trash2 size={15} /> Remove
                  </button>
                )}
              </div>
              {open === x.id && (x.kind === "psych" ? <PsychReport x={x} /> : <Answers x={x} isHr={isHr} onSaved={load} />)}
            </div>
          );
        })}
      </div>
      {isHr && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <select className={`${input} w-auto`} value={pick} onChange={(e) => setPick(e.target.value)} aria-label="Exam to give">
            <option value="">Give an exam…</option>
            <option value={PSYCH}>Psychological screening (built-in, HR only)</option>
            {exams.map((e) => (
              <option key={e.id} value={e.id}>
                {e.title}
              </option>
            ))}
          </select>
          <button disabled={!pick || busy} onClick={give} className={secondary}>
            <Link2 size={15} /> Make a link
          </button>
        </div>
      )}
      {link && (
        <div className="mt-2 space-y-1.5 rounded-lg border border-[var(--series-1)]/40 bg-[var(--series-1)]/10 p-3 text-sm">
          <p className="text-[var(--text-primary)]">Send this link to the applicant (by text or email). It works for 7 days, once. It won&rsquo;t be shown again.</p>
          <div className="flex gap-2">
            <input readOnly value={link} onFocus={(e) => e.currentTarget.select()} className={`${input} text-xs`} />
            <button onClick={() => void navigator.clipboard?.writeText(link)} className={secondary}>
              <Copy size={15} /> Copy
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Answers({ x, isHr, onSaved }: { x: ApplicantExam; isHr: boolean; onSaved: () => void }) {
  const [scores, setScores] = useState<Record<string, number>>(x.essayScores);
  const [busy, setBusy] = useState(false);
  const changed = JSON.stringify(scores) !== JSON.stringify(x.essayScores);
  return (
    <div className="mt-3 space-y-3 border-t border-[var(--border-hairline)] pt-3">
      {x.questions.map((q, i) => {
        const a = x.answers[q.id];
        return (
          <div key={q.id} className="text-sm">
            <div className="flex gap-2">
              <span className="font-medium text-[var(--text-primary)]">{i + 1}.</span>
              <p className="flex-1 whitespace-pre-wrap text-[var(--text-primary)]">{q.prompt}</p>
              <span className="text-xs text-[var(--text-muted)]">{q.points} pts</span>
            </div>
            {q.kind === "choice" ? (
              <ul className="mt-1 space-y-0.5 pl-5">
                {q.choices.map((c, k) => (
                  <li key={k} className={`flex items-center gap-1.5 ${k === q.answer ? "text-[var(--status-good)]" : a === k ? "text-[var(--status-critical)]" : "text-[var(--text-secondary)]"}`}>
                    {k === q.answer ? <Check size={13} /> : a === k ? <X size={13} /> : <span className="w-[13px]" />}
                    {c}
                    {a === k && <span className="text-xs">(their answer)</span>}
                  </li>
                ))}
                {a === undefined && <li className="text-xs text-[var(--text-muted)]">No answer.</li>}
              </ul>
            ) : (
              <div className="mt-1 space-y-1.5 pl-5">
                <p className="rounded-md bg-[var(--gridline)]/40 p-2 whitespace-pre-wrap text-[var(--text-secondary)]">{typeof a === "string" ? a : "No answer."}</p>
                <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                  Score
                  <input
                    type="number"
                    min={0}
                    max={q.points}
                    disabled={!isHr}
                    value={scores[q.id] ?? ""}
                    onChange={(e) => setScores((s) => {
                      const n = { ...s };
                      if (e.target.value === "") delete n[q.id];
                      else n[q.id] = Math.max(0, Math.min(q.points, Number(e.target.value)));
                      return n;
                    })}
                    className="w-20 rounded-md border border-[var(--border-hairline)] bg-[var(--surface-1)] px-2 py-1"
                  />
                  / {q.points}
                </label>
              </div>
            )}
          </div>
        );
      })}
      {isHr && x.questions.some((q) => q.kind === "essay") && (
        <button
          disabled={!changed || busy}
          onClick={async () => {
            setBusy(true);
            try {
              await gradeEssays(x.id, scores);
              onSaved();
            } catch (e) {
              reportSaveError("Couldn't save the scores", e);
            } finally {
              setBusy(false);
            }
          }}
          className={primary}
        >
          <Save size={15} /> Save essay scores
        </button>
      )}
    </div>
  );
}

// The Psychological screening's report (HR only).
function PsychReport({ x }: { x: ApplicantExam }) {
  const r = x.result as PsychResult | null;
  const [items, setItems] = useState(false);
  if (!r) return <p className="mt-3 text-sm text-[var(--text-muted)]">No result — the time ran out before the answers were sent.</p>;
  const color: Record<Tone, string> = { good: "var(--status-good)", warn: "var(--status-warning)", bad: "var(--status-critical)" };
  return (
    <div className="mt-3 space-y-4 border-t border-[var(--border-hairline)] pt-3 text-sm">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-3xl font-bold text-[var(--text-primary)] tabular-nums">{r.overall}</span>
        <span className="text-xs text-[var(--text-muted)]">/ 100 overall</span>
        <Badge tone={TONE[r.verdict[0]]}>{r.verdict[1]}</Badge>
        <span className="text-xs text-[var(--text-secondary)]">{r.verdict[2]}</span>
      </div>
      <div>
        <div className="mb-2 text-xs font-semibold text-[var(--text-primary)] uppercase">Trait scores</div>
        <div className="space-y-3">
          {(Object.keys(TRAITS) as Trait[]).map((k) => {
            const v = r.traits[k];
            const b = band(v);
            return (
              <div key={k}>
                <div className="flex items-center gap-2">
                  <b className="text-[var(--text-primary)]">{TRAITS[k].name}</b>
                  <span className="ml-auto text-xs tabular-nums" style={{ color: color[BAND[b][1]] }}>
                    {v}% · {BAND[b][0]}
                  </span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-[var(--gridline)]">
                  <div className="h-full rounded-full" style={{ width: `${Math.max(v, 2)}%`, background: color[BAND[b][1]] }} />
                </div>
                <p className="mt-1 text-xs text-[var(--text-muted)]">{TRAITS[k].desc[b]}</p>
              </div>
            );
          })}
        </div>
      </div>
      <div>
        <div className="mb-2 text-xs font-semibold text-[var(--text-primary)] uppercase">Validity checks</div>
        <ul className="space-y-1.5">
          {r.checks.map(([tone, text], i) => (
            <li key={i} className="flex gap-2">
              <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color[tone] }} />
              <span className="text-[var(--text-secondary)]">{text}</span>
            </li>
          ))}
        </ul>
      </div>
      <button onClick={() => setItems((v) => !v)} className="text-xs text-[var(--series-1)] hover:underline">
        {items ? "Hide the answers" : "Show the 30 answers"}
      </button>
      {items && (
        <ol className="space-y-1 text-xs">
          {PSYCH_ITEMS.map((it, i) => (
            <li key={it.id} className="flex gap-2">
              <span className="w-5 text-[var(--text-muted)]">{i + 1}.</span>
              <span className="flex-1 text-[var(--text-secondary)]">{it.prompt}</span>
              <b className="text-[var(--text-primary)]">{x.answers[it.id] ? `${x.answers[it.id]} · ${LIKERT[Number(x.answers[it.id]) - 1]}` : "—"}</b>
            </li>
          ))}
        </ol>
      )}
      <p className="border-t border-[var(--border-hairline)] pt-2 text-[11px] text-[var(--text-muted)]">{PSYCH_NOTE}</p>
    </div>
  );
}
