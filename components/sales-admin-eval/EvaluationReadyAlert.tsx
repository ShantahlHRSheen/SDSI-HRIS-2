"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ClipboardCheck } from "lucide-react";
import { useHris } from "@/lib/store";
import { isSupabaseConfigured } from "@/lib/supabase/auth";
import { myEvaluationsToAcknowledge } from "@/lib/sales-admin-eval";

// A banner on every page while the person has a released evaluation (phase 98)
// they haven't acknowledged yet; it links to Performance Evaluations.
export function EvaluationReadyAlert() {
  const { currentEmployee, isRealAccount } = useHris();
  const pathname = usePathname();
  const me = currentEmployee?.id;
  const [pending, setPending] = useState<{ id: string; purpose: string; period: string }[]>([]);
  useEffect(() => {
    if (me && isRealAccount && isSupabaseConfigured()) myEvaluationsToAcknowledge(me).then(setPending);
  }, [me, isRealAccount, pathname]);
  if (!pending.length || pathname?.startsWith("/sales-admin-evaluation")) return null;
  const first = pending[0];
  return (
    <Link
      href="/sales-admin-evaluation"
      className="flex w-full items-center gap-2 bg-[var(--series-1)] px-4 py-2.5 text-sm font-semibold text-[var(--on-accent)] hover:brightness-110"
      role="status"
    >
      <ClipboardCheck size={18} className="shrink-0" />
      <span className="flex-1">
        Your performance evaluation{pending.length === 1 ? ` (${[first.purpose, first.period].filter(Boolean).join(" ")})` : "s"} {pending.length === 1 ? "is" : "are"} ready. Please read and acknowledge {pending.length === 1 ? "it" : "them"}.
      </span>
      <span className="shrink-0 rounded-full bg-white px-3 py-1 text-xs font-bold text-[var(--series-1)]">View &amp; acknowledge</span>
    </Link>
  );
}
