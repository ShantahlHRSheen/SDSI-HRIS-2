"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useHris } from "@/lib/store";
import { SidebarShell } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";
import { PasswordForm } from "@/components/account/PasswordForm";
import { SaveErrorToasts } from "@/components/SaveErrorToasts";
import { AlertTriangle } from "lucide-react";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { ready, currentUser, mustChangePassword, logout, dataLoadError, authPending } = useHris();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Wait for the saved sign-in check before sending anyone to the sign-in
  // page — otherwise a refresh or a direct link bounces to the dashboard.
  useEffect(() => {
    if (ready && !authPending && !currentUser) router.replace("/");
  }, [ready, authPending, currentUser, router]);

  if (!ready || !currentUser) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-[var(--text-muted)]">
        Loading…
      </div>
    );
  }

  // Signed in with a temporary password from HR: choose a new one first.
  if (mustChangePassword) {
    return (
      <div className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-1)] p-5">
          <h1 className="text-lg font-semibold text-[var(--text-primary)]">Choose your own password</h1>
          <p className="mt-1 mb-4 text-sm text-[var(--text-secondary)]">
            Hi {currentUser.name.split(" - ")[1] ?? currentUser.name} — you signed in with a temporary password. Set a new one only you know to continue.
          </p>
          <PasswordForm requireCurrent={false} onDone={() => {}} />
          <button
            onClick={() => {
              logout();
              router.push("/");
            }}
            className="mt-3 w-full text-center text-xs text-[var(--text-muted)] hover:underline"
          >
            Sign out
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-1">
      <SidebarShell mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onMenuClick={() => setMobileOpen(true)} />
        {dataLoadError && (
          <div className="flex flex-wrap items-center gap-2 border-b border-[var(--status-critical)]/40 px-4 py-2 text-sm text-[var(--text-primary)]" style={{ background: "color-mix(in srgb, var(--status-critical) 12%, var(--surface-1))" }} role="alert">
            <AlertTriangle size={16} className="shrink-0 text-[var(--status-critical)]" />
            <span className="flex-1">Couldn&rsquo;t load the latest data from the server — what you see may be out of date.</span>
            <button onClick={() => window.location.reload()} className="rounded-lg border border-[var(--border-hairline)] px-2.5 py-1 text-xs font-medium hover:bg-[var(--gridline)]/40">Refresh</button>
          </div>
        )}
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
        <SaveErrorToasts />
      </div>
    </div>
  );
}
