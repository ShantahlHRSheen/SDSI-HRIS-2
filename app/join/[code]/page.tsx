"use client";

import { Suspense, useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Loader2, LogIn, UserRound, Video } from "lucide-react";
import { useHris } from "@/lib/store";
import { chooseCompany, currentCompany, currentCompanyId, isCompanyId, isCompanyReady } from "@/lib/companies";
import { parseMeetingCode } from "@/lib/meetings";
import { endGuestPass, guestStatus, requestGuestPass, type GuestPass } from "@/lib/meeting-guest";
import { MeetingRoom } from "@/components/meetings/MeetingRoom";

// One meeting link for everyone: /meetings/<code> sends anyone not signed in
// here. Employees sign in and go straight to the meeting; people without an
// HRIS account join as guests and wait until someone in the meeting admits
// them (phase 79).
function JoinPage() {
  const params = useParams<{ code: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const { ready, currentUser } = useHris();
  const code = parseMeetingCode(decodeURIComponent(params.code ?? ""));
  const co = search.get("co");
  const [mode, setMode] = useState<"choose" | "guest" | "waiting" | "in" | "denied">("choose");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pass, setPass] = useState<GuestPass | null>(null);
  const meetingPath = `/meetings/${code}${co ? `?co=${co}` : ""}`;

  // The link's company; signed-in employees go straight in.
  useEffect(() => {
    if (!ready) return;
    if (co && isCompanyId(co) && isCompanyReady(co) && co !== currentCompanyId()) {
      chooseCompany(co);
      window.location.reload();
      return;
    }
    if (currentUser && code && !pass) router.replace(meetingPath);
  }, [ready, currentUser, co, code, pass, router, meetingPath]);

  // Waiting room: check every 2 seconds.
  useEffect(() => {
    if (mode !== "waiting" || !pass) return;
    const t = window.setInterval(() => {
      guestStatus(pass.meetingId).then(
        (s) => {
          if (s === "admitted") setMode("in");
          else if (s === "denied" || s === "ended" || s === "left") {
            endGuestPass();
            setMode("denied");
            setError(s === "denied" ? "The host didn't admit you to this meeting." : "This meeting has ended.");
          }
        },
        () => {},
      );
    }, 2000);
    const leave = () => endGuestPass();
    window.addEventListener("pagehide", leave);
    return () => {
      window.clearInterval(t);
      window.removeEventListener("pagehide", leave);
    };
  }, [mode, pass]);

  async function joinAsGuest() {
    if (!code || busy) return;
    setBusy(true);
    setError(null);
    try {
      const p = await requestGuestPass(code, name);
      setPass(p);
      setMode("waiting");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't join as a guest.");
    } finally {
      setBusy(false);
    }
  }

  if (!code) return <Centered>That isn&rsquo;t a meeting link. Check the code — it looks like abc-defg-hij.</Centered>;
  if (mode === "in" && pass) return <MeetingRoom code={code} autoJoin={false} guest={{ pass, name: name.trim() }} />;

  const company = ready ? currentCompany() : null;
  return (
    <div className="flex min-h-full flex-1 flex-col items-center justify-center bg-[var(--page-plane)] px-4 py-10">
      <div className="w-full max-w-sm rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-1)] p-5">
        <div className="mb-1 flex items-center gap-2 text-base font-semibold text-[var(--text-primary)]">
          <Video size={18} className="text-[var(--series-1)]" /> Join a meeting
        </div>
        <div className="mb-4 text-xs text-[var(--text-muted)]">
          {company?.name ?? ""} · Meeting {code}
        </div>

        {mode === "choose" && (
          <div className="space-y-2">
            <button onClick={() => router.push(`/?next=${encodeURIComponent(meetingPath)}`)} className="flex w-full items-center gap-3 rounded-lg bg-[var(--series-1)] px-3 py-3 text-left text-sm font-medium text-[var(--on-accent)]">
              <LogIn size={18} />
              <span>
                I have an HRIS account
                <span className="block text-xs font-normal opacity-80">Sign in, then go straight to the meeting</span>
              </span>
            </button>
            <button onClick={() => setMode("guest")} className="flex w-full items-center gap-3 rounded-lg border border-[var(--border-hairline)] px-3 py-3 text-left text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--gridline)]/40">
              <UserRound size={18} />
              <span>
                Join as a guest
                <span className="block text-xs font-normal text-[var(--text-muted)]">No HRIS account — the host lets you in</span>
              </span>
            </button>
          </div>
        )}

        {mode === "guest" && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              joinAsGuest();
            }}
          >
            <label className="block text-sm">
              <span className="mb-1 block text-[var(--text-secondary)]">Your name</span>
              <input autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="e.g. Juan Dela Cruz" className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--page-plane)] px-3 py-2 text-sm" />
            </label>
            <p className="mt-2 text-xs text-[var(--text-muted)]">Everyone in the meeting will see this name. As a guest you can see, hear and talk in this meeting only.</p>
            {error && <p className="mt-2 text-xs text-[var(--status-critical)]">{error}</p>}
            <div className="mt-4 flex gap-2">
              <button type="button" onClick={() => setMode("choose")} className="rounded-lg border border-[var(--border-hairline)] px-3 py-2 text-sm text-[var(--text-secondary)]">
                Back
              </button>
              <button type="submit" disabled={busy || name.trim().length < 2} className="flex-1 rounded-lg bg-[var(--series-1)] px-3 py-2 text-sm font-medium text-[var(--on-accent)] disabled:opacity-40">
                {busy ? "Joining…" : "Ask to join"}
              </button>
            </div>
          </form>
        )}

        {mode === "waiting" && (
          <div className="flex flex-col items-center py-4 text-center">
            <Loader2 className="mb-3 animate-spin text-[var(--series-1)]" />
            <div className="text-sm font-medium text-[var(--text-primary)]">Waiting for the host to let you in…</div>
            <div className="mt-1 text-xs text-[var(--text-muted)]">{pass?.title}</div>
            <button
              onClick={() => {
                endGuestPass();
                setPass(null);
                setMode("choose");
              }}
              className="mt-4 text-xs text-[var(--text-muted)] hover:underline"
            >
              Cancel
            </button>
          </div>
        )}

        {mode === "denied" && <div className="py-4 text-center text-sm text-[var(--text-secondary)]">{error}</div>}
      </div>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-[var(--text-secondary)]">{children}</div>;
}

export default function JoinMeetingPage() {
  return (
    <Suspense fallback={null}>
      <JoinPage />
    </Suspense>
  );
}
