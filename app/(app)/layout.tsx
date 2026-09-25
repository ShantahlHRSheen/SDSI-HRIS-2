"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useHris } from "@/lib/store";
import { SidebarShell } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";
import { PasswordForm } from "@/components/account/PasswordForm";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { ready, currentUser, mustChangePassword, logout } = useHris();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (ready && !currentUser) router.replace("/");
  }, [ready, currentUser, router]);

  if (!ready || !currentUser) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-[var(--text-muted)]">
        Loading demo session…
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
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
