"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Briefcase, Globe, LogIn, Newspaper } from "lucide-react";
import { useHris } from "@/lib/store";
import { ROLE_LABELS } from "@/lib/types";
import { Badge } from "@/components/Badge";
import { isSupabaseConfigured } from "@/lib/supabase/auth";
import { siteUrl } from "@/lib/careers";
import { COMPANIES, COMPANY_ORDER, GROUP_NAME, chooseCompany, companyMissingSetup, currentCompany, currentCompanyId, isCompanyId, isCompanyReady } from "@/lib/companies";

// Where to go after signing in: the page a link was for (?next=/meetings/…),
// only within the HRIS; otherwise the dashboard.
function safeNext(next: string | null): string {
  const n = next ?? "";
  return n.startsWith("/") && !n.startsWith("//") && !n.startsWith("/\\") ? n : "/dashboard";
}

export default function LoginPageWrapper() {
  return (
    <Suspense fallback={null}>
      <LoginPage />
    </Suspense>
  );
}

function LoginPage() {
  const { ready, currentUser, login, loginWithSupabase, demoUsers } = useHris();
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));
  const nextPage = () => next;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const supabaseConfigured = isSupabaseConfigured();
  // Read only after mount (it lives in this browser's storage).
  const company = ready ? currentCompany() : COMPANIES.sdsi;

  useEffect(() => {
    if (ready && currentUser) router.replace(next);
  }, [ready, currentUser, router, next]);

  // A link for another company's HRIS (…?co=sdsi), or a company website's
  // Employee Login (/login?co=sdsi): switch to that company first.
  const coParam = useSearchParams().get("co");
  useEffect(() => {
    if (!ready) return;
    const co = coParam ?? new URLSearchParams(next.split("?")[1] ?? "").get("co");
    if (co && isCompanyId(co) && isCompanyReady(co) && co !== currentCompanyId()) {
      chooseCompany(co);
      window.location.reload();
    }
  }, [ready, next, coParam]);

  function signInAs(userId: string) {
    login(userId);
    router.push(nextPage());
  }

  async function handleEmailLogin(e: React.FormEvent) {
    e.preventDefault();
    setAuthError(null);
    setSubmitting(true);
    // Phones often capitalise the first letter, and copying from a chat app
    // can add spaces around the text — neither should make a login fail.
    const cleanEmail = email.replace(/\s+/g, "").toLowerCase();
    let { error } = await loginWithSupabase(cleanEmail, password);
    if (error && password.trim() !== password) ({ error } = await loginWithSupabase(cleanEmail, password.trim()));
    setSubmitting(false);
    if (error) {
      setAuthError(/invalid login credentials/i.test(error) ? "Email or password is incorrect. Check the password carefully — it is case-sensitive (capital and small letters must match)." : error);
      return;
    }
    router.push(nextPage());
  }

  return (
    <div className="flex min-h-full flex-1 flex-col items-center bg-[var(--page-plane)] px-4 py-10 sm:py-16">
      <div className="mb-6 flex flex-col items-center text-center">
        <h1 className="flex flex-col items-center gap-1">
          <span className="text-xl font-semibold text-[var(--text-primary)] sm:text-2xl">{GROUP_NAME}</span>
          <span className="text-sm font-medium tracking-wide text-[var(--series-1)] uppercase">HRIS</span>
        </h1>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">Human Resource Information System</p>
      </div>

      {/* Which company to sign in to — each has its own database and logins. */}
      {ready && (
        <div className="mb-6 w-full max-w-xl">
          <div className="mb-2 text-center text-xs font-medium text-[var(--text-muted)]">Choose your company</div>
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            {COMPANY_ORDER.map((id) => {
              const c = COMPANIES[id];
              const available = isCompanyReady(id);
              const selected = id === company.id;
              return (
                <button
                  key={id}
                  type="button"
                  disabled={!available || selected}
                  onClick={() => {
                    chooseCompany(id);
                    // A fresh start, so nothing from the other company stays loaded.
                    window.location.reload();
                  }}
                  aria-pressed={selected}
                  className={`flex flex-col items-center gap-2 rounded-xl border p-3 text-center transition-colors ${
                    selected
                      ? "border-[var(--series-1)] bg-[var(--surface-1)] shadow-md"
                      : available
                        ? "border-[var(--border-hairline)] bg-[var(--surface-1)] hover:border-[var(--series-1)]/60"
                        : "cursor-not-allowed border-dashed border-[var(--border-hairline)] opacity-50"
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- small static brand logo */}
                  <img src={c.logo} alt="" width={96} height={96} className="h-14 w-14 rounded-full object-contain sm:h-20 sm:w-20" />
                  <span className="text-xs leading-tight font-medium text-[var(--text-primary)] sm:text-sm">{c.name}</span>
                  {!available && (
                    <span className="text-[10px] text-[var(--text-muted)]">
                      Coming soon
                      {/* Setup hint for whoever is connecting the company's database. */}
                      {id !== "sdsi" && <span className="block opacity-80">Not set: {companyMissingSetup(id).join(", ")}</span>}
                    </span>
                  )}
                  {selected && <span className="text-[10px] font-medium text-[var(--series-1)]">Selected</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {ready && nextPage().startsWith("/meetings/") && (
        <p className="mb-4 max-w-sm rounded-lg border border-[var(--series-1)]/40 bg-[var(--series-1)]/10 px-3 py-2 text-center text-sm text-[var(--text-primary)]">
          Sign in to join the meeting — you&rsquo;ll go straight to it.
        </p>
      )}

      {ready && supabaseConfigured && (
        <form onSubmit={handleEmailLogin} className="mb-10 w-full max-w-sm rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-1)] p-5">
          <div className="mb-4 flex items-center gap-2 text-sm font-medium text-[var(--text-primary)]">
            <LogIn size={16} /> {company.shortName} Employee Login
          </div>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs text-[var(--text-muted)]">Work email</label>
              <input
                type="email"
                required
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={company.emailHint}
                className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--page-plane)] px-3 py-2 text-sm text-[var(--text-primary)]"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-[var(--text-muted)]">Password</label>
              <input
                type="password"
                required
                autoComplete="current-password"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
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

      {supabaseConfigured ? (
        <>
          <p className="max-w-sm text-center text-xs text-[var(--text-muted)]">
            No login yet, or forgot your password? Ask HR to issue you a temporary one.
          </p>
          {/* The public websites: the group's and each company's. */}
          <nav aria-label="Our websites" className="mt-8 w-full max-w-xl rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-1)] p-4">
            <div className="mb-3 flex items-center justify-center gap-1.5 text-xs font-medium text-[var(--text-muted)]">
              <Globe size={13} /> Visit our websites
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Link href="/" className="flex flex-col items-center gap-1.5 rounded-lg border border-[var(--border-hairline)] px-2 py-2.5 text-center text-xs font-medium text-[var(--text-primary)] hover:border-[var(--series-1)]/60">
                <span className="flex -space-x-2">
                  {COMPANY_ORDER.map((id) => (
                    // eslint-disable-next-line @next/next/no-img-element -- small static brand logos
                    <img key={id} src={COMPANIES[id].logo} alt="" className="h-7 w-7 rounded-full border border-[var(--surface-1)] bg-white object-contain" />
                  ))}
                </span>
                {GROUP_NAME.replace(" of Companies", "")}
              </Link>
              {COMPANY_ORDER.filter((id) => isCompanyReady(id)).map((id) => (
                <Link key={id} href={siteUrl(id)} className="flex flex-col items-center gap-1.5 rounded-lg border border-[var(--border-hairline)] px-2 py-2.5 text-center text-xs font-medium text-[var(--text-primary)] hover:border-[var(--series-1)]/60">
                  {/* eslint-disable-next-line @next/next/no-img-element -- small static brand logo */}
                  <img src={COMPANIES[id].logo} alt="" className="h-7 w-7 rounded-full bg-white object-contain" />
                  {COMPANIES[id].shortName === "SDSI" ? "Shantahl" : COMPANIES[id].shortName}
                </Link>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs">
              <Link href="/news" className="inline-flex items-center gap-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:underline">
                <Newspaper size={13} /> Newsroom
              </Link>
              <Link href="/careers" className="inline-flex items-center gap-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:underline">
                <Briefcase size={13} /> Careers
              </Link>
            </div>
          </nav>
        </>
      ) : (
        <>
          <div className="mb-3 max-w-lg text-center text-xs text-[var(--text-muted)]">
            This is a demo build with sample data only — no real database, credentials, or personal information. Pick a demo user below to preview the system from that role&rsquo;s point of view.
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
        </>
      )}
    </div>
  );
}
