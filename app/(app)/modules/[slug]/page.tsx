"use client";

import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2, Construction } from "lucide-react";
import { MODULE_STUBS } from "@/lib/module-stubs";
import { Badge } from "@/components/Badge";

export default function ModuleStubPage() {
  const params = useParams<{ slug: string }>();
  const router = useRouter();
  const stub = MODULE_STUBS[params.slug];

  if (!stub) {
    return (
      <div>
        <button onClick={() => router.back()} className="mb-4 flex items-center gap-1.5 text-sm text-[var(--series-1)]"><ArrowLeft size={16} /> Back</button>
        <div className="text-sm text-[var(--text-secondary)]">Unknown module.</div>
      </div>
    );
  }

  return (
    <div>
      <button onClick={() => router.back()} className="mb-4 flex items-center gap-1.5 text-sm text-[var(--series-1)]"><ArrowLeft size={16} /> Back</button>
      <div className="mx-auto max-w-2xl rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-1)] p-6 sm:p-8">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--gridline)]/60 text-[var(--text-secondary)]">
            <Construction size={22} />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-[var(--text-primary)]">{stub.title}</h1>
            <Badge tone="muted">Preview · build spec {stub.specSection}</Badge>
          </div>
        </div>
        <p className="text-sm text-[var(--text-secondary)]">{stub.description}</p>
        <div className="mt-5">
          <div className="mb-2 text-xs font-semibold text-[var(--text-muted)] uppercase">Planned for the full build</div>
          <ul className="space-y-1.5">
            {stub.planned.map((p) => (
              <li key={p} className="flex items-start gap-2 text-sm text-[var(--text-secondary)]">
                <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-[var(--text-muted)]" />
                <span>{p}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="mt-5 rounded-lg bg-[var(--gridline)]/30 p-3 text-xs text-[var(--text-secondary)]">
          This demo focused depth on the Dashboards, Contract Monitoring, Performance Evaluations, Disciplinary Records,
          Audit Trail, and System Administration modules. This module is fully scoped in the build spec and is next in
          the build order (Section 9).
        </div>
      </div>
    </div>
  );
}
