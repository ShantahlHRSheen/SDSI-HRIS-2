"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Building2, LogIn } from "lucide-react";
import { useHris } from "@/lib/store";
import { ROLE_LABELS } from "@/lib/types";
import { Badge } from "@/components/Badge";
import { isSupabaseConfigured } from "@/lib/supabase/auth";

export default function LoginPage() {
  const { ready, currentUser, login, loginWithSupabase, demoUsers } = useHris();
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const supabaseConfigured = isSupabaseConfigured();

  useEffect(() => {
    if (ready && currentUser) router.replace("/dashboard");
  }, [ready, currentUser, router]);

  function signInAs(userId: string) {
    login(userId);
    router.push("/dashboard");
  }

  async function handleEmailLogin(e: React.FormEvent) {
    e.preventDefault();
    setAuthError(null);
    setSubmitting(true);
    const { error } = await loginWithSupabase(email.trim(), password);
    setSubmitting(false);
    if (error) {
      setAuthError(error);
      return;
    }
    router.push("/dashboard");
  }

  return (
    <div className="flex min-h-full flex-1 flex-col items-center bg-[var(--page-plane)] px-4 py-10 sm:py-16">
      <div className="mb-8 flex flex-col items-center text-center">
        <div className="glow-accent mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--series-1)] text-[var(--on-accent)]">
          <Building2 size={26} />
        </div>
        <h1 className="text-2xl font-semibold text-[var(--text-primary)]">Shantahl Direct Sales Inc.</h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">Human Resource Information System</p>
      </div>

      {supabaseConfigured && (
        <form onSubmit={handleEmailLogin} className="mb-10 w-full max-w-sm rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-1)] p-5">
          <div className="mb-4 flex items-center gap-2 text-sm font-medium text-[var(--text-primary)]">
            <LogIn size={16} /> Employee Login
          </div>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs text-[var(--text-muted)]">Work email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@shantahl.com.ph"
                className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--page-plane)] px-3 py-2 text-sm text-[var(--text-primary)]"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-[var(--text-muted)]">Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--page-plane)] px-3 py-2 text-sm text-[var(--text-primary)]"
              />
            </div>
            {authError && <p className="text-xs text-[var(--status-critical)]">{authError}</p>}
            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-lg bg-[var(--series-1)] px-3 py-2 text-sm font-medium text-[var(--on-accent)] disabled:opacity-60"
            >
              {submitting ? "Signing in…" : "Sign in"}
            </button>
          </div>
        </form>
      )}

      <div className="mb-3 max-w-lg text-center text-xs text-[var(--text-muted)]">
        {supabaseConfigured
          ? "Not onboarded with a login yet? Preview the system below from a demo role instead."
          : "This is a demo build with sample data only — no real database, credentials, or personal information. Pick a demo user below to preview the system from that role's point of view."}
      </div>

      <div className="grid w-full max-w-3xl grid-cols-1 gap-3 sm:grid-cols-2">
        {demoUsers.map((u) => (
          <button
            key={u.id}
            onClick={() => signInAs(u.id)}
            className="flex items-center gap-3 rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-1)] p-4 text-left transition-shadow hover:shadow-md"
          >
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-sm font-semibold text-[var(--on-accent)]">
              {u.initials}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-[var(--text-primary)]">{u.name}</div>
              <div className="truncate text-xs text-[var(--text-secondary)]">{u.title}</div>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {u.roles.map((r) => (
                  <Badge key={r} tone="info">{ROLE_LABELS[r]}</Badge>
                ))}
              </div>
            </div>
          </button>
        ))}
      </div>

      <p className="mt-8 text-xs text-[var(--text-muted)]">Build spec Section 2 role matrix — additive roles are shown as multiple badges.</p>
    </div>
  );
}
