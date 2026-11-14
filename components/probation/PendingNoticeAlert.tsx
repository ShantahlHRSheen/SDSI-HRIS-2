"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { AlertTriangle, Signature } from "lucide-react";
import { useHris } from "@/lib/store";
import { longDate, peMyPart, type PeSigner, type ProbationExtension } from "@/lib/probation-extension";
import { SignPeModal, useProbationExtensions } from "@/components/probation/ProbationExtension";

// Hard to miss: when an Extension of Probationary Employment is waiting for
// the signed-in person to sign, a red banner stays at the top of every page
// and a notice pops up once per visit until it's signed.
export function PendingNoticeAlert() {
  const { currentEmployee } = useHris();
  const pathname = usePathname();
  const { items, reload } = useProbationExtensions();
  const me = currentEmployee?.id;
  const [signing, setSigning] = useState<{ item: ProbationExtension; as: Exclude<PeSigner, "hr"> } | null>(null);
  const [dismissed, setDismissed] = useState(() => {
    try {
      return window.sessionStorage.getItem("hris.peAlertSeen") === "1";
    } catch {
      return false;
    }
  });
  if (!items || !me || pathname?.startsWith("/probation-extension")) return null;

  const mine = items.find((r) => peMyPart(r, me) === "employee");
  const dismiss = () => {
    setDismissed(true);
    try {
      window.sessionStorage.setItem("hris.peAlertSeen", "1");
    } catch {
      // Storage blocked: it pops up again next page load.
    }
  };

  return (
    <>
      {mine && (
        <button
          onClick={() => setSigning({ item: mine, as: "employee" })}
          className="flex w-full items-center gap-2 bg-[var(--status-critical)] px-4 py-2.5 text-left text-sm font-semibold text-white hover:brightness-110"
          role="alert"
        >
          <AlertTriangle size={18} className="shrink-0 animate-pulse" />
          <span className="flex-1">IMPORTANT: You have a notice from HR — Extension of Probationary Employment. Please read and sign it.</span>
          <span className="flex shrink-0 items-center gap-1 rounded-full bg-white px-3 py-1 text-xs font-bold text-[var(--status-critical)]">
            <Signature size={13} /> Read &amp; sign
          </span>
        </button>
      )}

      {mine && !dismissed && !signing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Important notice">
          <div className="w-full max-w-md overflow-hidden rounded-2xl bg-[var(--surface-1)] shadow-2xl ring-4 ring-[var(--status-critical)]/60">
            <div className="flex flex-col items-center gap-2 bg-[var(--status-critical)] px-6 py-5 text-center text-white">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/20">
                <AlertTriangle size={30} className="animate-pulse" />
              </div>
              <div className="text-xs font-bold tracking-[0.25em] uppercase">Important notice</div>
              <div className="text-lg leading-snug font-bold">Extension of Probationary Employment</div>
            </div>
            <div className="space-y-3 px-6 py-5 text-sm text-[var(--text-secondary)]">
              <p>
                HR has issued you a notice that needs your <b className="text-[var(--text-primary)]">signature</b>.
              </p>
              <div className="rounded-lg border-2 border-[var(--status-critical)]/50 px-3 py-2 text-center">
                <div className="text-xs text-[var(--text-muted)]">Your probation is extended until</div>
                <div className="text-xl font-bold text-[var(--status-critical)]">{longDate(mine.data.extendTo)}</div>
              </div>
              <p>Please read it carefully and sign the conforme.</p>
              <div className="flex flex-col gap-2 pt-1">
                <button onClick={() => setSigning({ item: mine, as: "employee" })} className="flex items-center justify-center gap-2 rounded-lg bg-[var(--status-critical)] px-4 py-2.5 text-sm font-bold text-white hover:brightness-110">
                  <Signature size={16} /> Read &amp; sign now
                </button>
                <button onClick={dismiss} className="text-xs text-[var(--text-muted)] hover:underline">
                  Remind me later
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {signing && (
        <SignPeModal
          item={signing.item}
          as={signing.as}
          onClose={() => (setSigning(null), dismiss())}
          onChanged={reload}
        />
      )}
    </>
  );
}
