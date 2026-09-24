"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useHris } from "@/lib/store";
import { SidebarShell } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { ready, currentUser } = useHris();
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
