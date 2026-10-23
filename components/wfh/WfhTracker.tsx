"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, MonitorCheck, Play, ShieldCheck, Square } from "lucide-react";
import { Modal } from "@/components/Modal";
import { todayInManila } from "@/lib/leave-policy";
import {
  WFH_CHECK_RESPONSE_SECONDS,
  WFH_IDLE_MINUTES,
  acknowledgeWfh,
  beatWfh,
  describeDay,
  isoWeekday,
  logWfh,
  planChecks,
  startWfh,
  stateWfh,
  stopWfh,
  type WfhSchedule,
  type WfhSession,
} from "@/lib/wfh";

// Chrome / Edge Idle Detection (not in TypeScript's DOM types yet).
interface IdleDetectorLike extends EventTarget {
  userState: "active" | "idle" | null;
  screenState: "locked" | "unlocked" | null;
  start(o: { threshold: number; signal: AbortSignal }): Promise<void>;
}
type IdleDetectorCtor = { new (): IdleDetectorLike; requestPermission(): Promise<"granted" | "denied"> };
const idleApi = () => (typeof window !== "undefined" ? (window as unknown as { IdleDetector?: IdleDetectorCtor }).IdleDetector : undefined);

const btn = "flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-40";

export function WfhTracker({ schedule, openSession, onChanged }: { schedule: WfhSchedule; openSession: WfhSession | null; onChanged: () => void }) {
  const today = todayInManila();
  const day = schedule.days[String(isoWeekday(today))];
  const [session, setSession] = useState<string | null>(null);
  const [state, setState] = useState<"active" | "idle" | "locked">("active");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [check, setCheck] = useState<{ code: string; shownAt: Date } | null>(null);
  const [answer, setAnswer] = useState("");
  const [stopping, setStopping] = useState(false);
  const [report, setReport] = useState("");
  const abort = useRef<AbortController | null>(null);
  const timers = useRef<number[]>([]);
  const idleSince = useRef<{ at: Date; kind: "idle" | "locked" } | null>(null);
  const sessionRef = useRef<string | null>(null);
  const checkRef = useRef<Date | null>(null);
  const [missed, setMissed] = useState(false);
  // Seconds left to answer the open check.
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    if (!check) return;
    const tick = () => setLeft(Math.max(0, WFH_CHECK_RESPONSE_SECONDS - Math.floor((Date.now() - check.shownAt.getTime()) / 1000)));
    tick();
    const t = window.setInterval(tick, 250);
    return () => window.clearInterval(t);
  }, [check]);

  const cleanup = useCallback(() => {
    abort.current?.abort();
    abort.current = null;
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current.forEach((t) => window.clearInterval(t));
    timers.current = [];
  }, []);
  useEffect(() => cleanup, [cleanup]);

  // Leaving the page while tracking: the browser asks first.
  useEffect(() => {
    if (!session) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [session]);

  function showCheck() {
    const code = String(Math.floor(1000 + Math.random() * 9000));
    const shownAt = new Date();
    setAnswer("");
    setMissed(false);
    checkRef.current = shownAt;
    setCheck({ code, shownAt });
    if ("Notification" in window && Notification.permission === "granted") {
      try {
        new Notification("HRIS — Are you there?", { body: `Open the HRIS tab and type ${code} within ${WFH_CHECK_RESPONSE_SECONDS} seconds.`, requireInteraction: true });
      } catch {
        /* notifications are optional */
      }
    }
    // Not answered in time: logged as missed.
    const t = window.setTimeout(() => {
      if (checkRef.current !== shownAt) return;
      checkRef.current = null;
      setCheck(null);
      setMissed(true);
      if (sessionRef.current) logWfh(sessionRef.current, "check_missed", shownAt).catch(() => {});
    }, WFH_CHECK_RESPONSE_SECONDS * 1000);
    timers.current.push(t);
  }

  async function begin() {
    setBusy(true);
    setError(null);
    try {
      const Api = idleApi();
      if (!Api) throw new Error("Activity tracking needs Google Chrome or Microsoft Edge on a computer.");
      if ((await Api.requestPermission()) !== "granted") throw new Error("Allow activity detection when the browser asks — it's needed to work from home.");
      if ("Notification" in window && Notification.permission === "default") await Notification.requestPermission().catch(() => "denied");
      const id = await startWfh();
      sessionRef.current = id;
      stateWfh(id, "active", new Date());
      cleanup();
      const ctl = new AbortController();
      abort.current = ctl;
      const detector = new Api();
      detector.addEventListener("change", () => {
        const locked = detector.screenState === "locked";
        const idle = detector.userState === "idle";
        if (locked || idle) {
          if (!idleSince.current) idleSince.current = { at: new Date(Date.now() - (locked && !idle ? 0 : WFH_IDLE_MINUTES * 60_000)), kind: locked ? "locked" : "idle" };
          else if (locked) idleSince.current.kind = "locked";
          setState(locked ? "locked" : "idle");
          if (sessionRef.current) stateWfh(sessionRef.current, idleSince.current.kind, idleSince.current.at);
        } else {
          const since = idleSince.current;
          idleSince.current = null;
          setState("active");
          if (since && sessionRef.current) {
            const id = sessionRef.current;
            logWfh(id, since.kind, since.at)
              .catch(() => {})
              .then(() => stateWfh(id, "active", new Date()));
          }
        }
      });
      await detector.start({ threshold: WFH_IDLE_MINUTES * 60_000, signal: ctl.signal });
      timers.current.push(window.setInterval(() => sessionRef.current && beatWfh(sessionRef.current).catch(() => {}), 60_000));
      for (const at of planChecks(day, new Date(), today)) timers.current.push(window.setTimeout(showCheck, at.getTime() - Date.now()));
      setSession(id);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't start.");
    } finally {
      setBusy(false);
    }
  }

  async function answerCheck() {
    if (!check || !session) return;
    if (answer.trim() !== check.code) {
      setError("That's not the code shown — try again.");
      return;
    }
    setError(null);
    const at = check.shownAt;
    checkRef.current = null;
    setCheck(null);
    await logWfh(session, "check_ok", at).catch(() => {});
  }

  async function stop() {
    if (!session) return;
    setBusy(true);
    setError(null);
    try {
      const since = idleSince.current;
      if (since) await logWfh(session, since.kind, since.at).catch(() => {});
      idleSince.current = null;
      await stopWfh(session, report);
      cleanup();
      sessionRef.current = null;
      setSession(null);
      setStopping(false);
      setReport("");
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't stop.");
    } finally {
      setBusy(false);
    }
  }

  if (!schedule.acknowledgedAt) return <Acknowledge onDone={onChanged} />;

  return (
    <div className="mb-4 rounded-xl border border-[var(--series-1)]/40 bg-[var(--surface-1)] p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-sm font-medium text-[var(--text-primary)]">Today&rsquo;s work from home</div>
          <div className="text-xs text-[var(--text-muted)]">Schedule today: {describeDay(day)}</div>
        </div>
        {session ? (
          <div className="flex items-center gap-2">
            <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${state === "active" ? "bg-[var(--status-good)]/15 text-[var(--status-good)]" : "bg-[var(--status-warning)]/15 text-[var(--status-warning)]"}`}>
              {state === "active" ? "● Working" : state === "locked" ? "● Screen locked" : "● Idle"}
            </span>
            <button onClick={() => setStopping(true)} disabled={busy} className={`${btn} bg-[var(--status-critical)] text-white`}>
              <Square size={15} /> Stop working
            </button>
          </div>
        ) : (
          <button onClick={begin} disabled={busy} className={`${btn} bg-[var(--series-1)] text-[var(--on-accent)]`}>
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} />} {openSession ? "Continue working" : "Start working"}
          </button>
        )}
      </div>
      {session ? (
        <p className="text-xs text-[var(--text-secondary)]">
          Keep this HRIS tab open (it can be in the background) while you work in Excel, email or other apps. Time with no keyboard or mouse use for {WFH_IDLE_MINUTES}+ minutes, or a locked screen, is logged as idle. A few times a day an &ldquo;Are you there?&rdquo; check asks you to type a code here within {WFH_CHECK_RESPONSE_SECONDS} seconds.
        </p>
      ) : openSession ? (
        <p className="text-xs text-[var(--status-warning)]">You didn&rsquo;t stop working last time (the tab was closed). Click Continue working — the time it was closed is logged — then Stop working at the end of the day.</p>
      ) : (
        <p className="text-xs text-[var(--text-secondary)]">Click Start working when you begin. Use Google Chrome or Microsoft Edge on a computer, and allow activity detection when asked.</p>
      )}
      {missed && <div className="mt-2 text-xs text-[var(--status-warning)]">You missed an &ldquo;Are you there?&rdquo; check — it&rsquo;s been logged.</div>}
      {error && <div className="mt-2 text-xs text-[var(--status-critical)]">{error}</div>}

      <Modal open={!!check} onClose={() => {}} title="Are you there?">
        {check && (
          <div className="space-y-3 text-sm">
            <p className="text-[var(--text-secondary)]">
              Type this code within {WFH_CHECK_RESPONSE_SECONDS} seconds{left !== null ? ` (${left}s left)` : ""}: <span className="text-2xl font-bold tracking-widest text-[var(--text-primary)]">{check.code}</span>
            </p>
            <input value={answer} onChange={(e) => setAnswer(e.target.value)} onKeyDown={(e) => e.key === "Enter" && answerCheck()} autoFocus inputMode="numeric" maxLength={4} className="w-32 rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-2 text-lg tracking-widest" />
            <div className="flex justify-end">
              <button onClick={answerCheck} className={`${btn} bg-[var(--series-1)] text-[var(--on-accent)]`}>
                <MonitorCheck size={15} /> I&rsquo;m here
              </button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={stopping} onClose={() => !busy && setStopping(false)} title="Stop working — what did you accomplish today?">
        <div className="space-y-3 text-sm">
          <textarea value={report} onChange={(e) => setReport(e.target.value)} rows={6} maxLength={4000} placeholder="List the tasks you finished or worked on today." className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-2 text-sm" />
          {error && <div className="text-xs text-[var(--status-critical)]">{error}</div>}
          <div className="flex justify-end gap-2">
            <button onClick={() => setStopping(false)} disabled={busy} className={`${btn} border border-[var(--border-hairline)] text-[var(--text-secondary)]`}>
              Keep working
            </button>
            <button onClick={stop} disabled={busy || !report.trim()} className={`${btn} bg-[var(--status-critical)] text-white`}>
              {busy ? <Loader2 size={15} className="animate-spin" /> : <Square size={15} />} Stop working
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function Acknowledge({ onDone }: { onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [agree, setAgree] = useState(false);
  async function go() {
    setBusy(true);
    setError(null);
    try {
      await acknowledgeWfh();
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mb-4 rounded-xl border border-[var(--series-1)]/40 bg-[var(--surface-1)] p-4 text-sm">
      <div className="mb-2 flex items-center gap-2 font-medium text-[var(--text-primary)]">
        <ShieldCheck size={16} /> Work from home monitoring notice
      </div>
      <ul className="mb-3 list-disc space-y-1 pl-5 text-[var(--text-secondary)]">
        <li>While you&rsquo;re clocked in (Start working → Stop working), the HRIS records your time in and out.</li>
        <li>It records when there&rsquo;s been no keyboard or mouse use on your computer for {WFH_IDLE_MINUTES}+ minutes, when your screen is locked, and when the HRIS tab is closed. It does not see what you type, which apps or sites you use, or your screen.</li>
        <li>A few times a day it asks you to type a code within {WFH_CHECK_RESPONSE_SECONDS} seconds to confirm you&rsquo;re there (a missed check is logged), and at the end of the day you write what you accomplished.</li>
        <li>Only you, your supervisor and HR can see this log. You can add a reason to idle time (e.g. a call or meeting).</li>
        <li>Using auto-clickers or mouse jigglers to appear active is not allowed.</li>
      </ul>
      <label className="mb-3 flex items-start gap-2 text-[var(--text-primary)]">
        <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 accent-[var(--series-1)]" />
        I have read and understood how my work-from-home time is monitored.
      </label>
      {error && <div className="mb-2 text-xs text-[var(--status-critical)]">{error}</div>}
      <button onClick={go} disabled={busy || !agree} className={`${btn} bg-[var(--series-1)] text-[var(--on-accent)]`}>
        {busy ? <Loader2 size={15} className="animate-spin" /> : <ShieldCheck size={15} />} Acknowledge
      </button>
    </div>
  );
}
