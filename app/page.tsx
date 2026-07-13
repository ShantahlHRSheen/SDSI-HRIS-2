"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Building2 } from "lucide-react";
import { useHris } from "@/lib/store";
import { ROLE_LABELS } from "@/lib/types";
import { Badge } from "@/components/Badge";

export default function LoginPage() {
  const { ready, currentUser, login, demoUsers } = useHris();
  const router = useRouter();

  useEffect(() => {
    if (ready && currentUser) router.replace("/dashboard");
  }, [ready, currentUser, router]);

  function signInAs(userId: string) {
    login(userId);
    router.push("/dashboard");
  }

  return (
    <div className="flex min-h-full flex-1 flex-col items-center bg-[var(--page-plane)] px-4 py-10 sm:py-16">
      <div className="mb-8 flex flex-col items-center text-center">
        <div className="glow-accent mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--series-1)] text-[var(--on-accent)]">
          <Building2 size={26} />
        </div>
        <h1 className="text-2xl font-semibold text-[var(--text-primary)]">Shantahl Direct Sales Inc.</h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">Human Resource Information System — Demo Instance</p>
        <p className="mt-3 max-w-lg text-xs text-[var(--text-muted)]">
          This is a demo build with sample data only — no real database, credentials, or personal information.
          Pick a demo user below to preview the system from that role&rsquo;s point of view.
        </p>
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
