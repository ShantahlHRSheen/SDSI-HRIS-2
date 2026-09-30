"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BadgeCheck, PenLine, Trash2, Undo2 } from "lucide-react";
import { useHris } from "@/lib/store";
import { prepareSignature } from "@/lib/id-images";
import { reportSaveError } from "@/lib/save-errors";
import { fetchSignatureUrls, removeSignature, uploadSignature, type SignatureKind } from "@/lib/supabase/company-documents";
import { fetchVoucherSignoffs, signVoucher, withdrawVoucherSignoff, type SignoffStep, type VoucherSignoff } from "@/lib/supabase/voucher-signoffs";
import type { Role } from "@/lib/types";

// ---- Signature images -------------------------------------------------------

// Who may upload each signature (HR can manage all of them).
const SIGNATURE_OWNER: Record<SignatureKind, { role: Role; label: string }> = {
  "prepared-by": { role: "hr_admin", label: "Prepared-by signature" },
  "checked-by": { role: "sr_accounting_assistant", label: "My Checked-by signature" },
  "released-by": { role: "treasurer", label: "My Released-by signature" },
};

export function signatureKindsFor(roles: Role[]): SignatureKind[] {
  if (roles.includes("hr_admin")) return ["prepared-by", "checked-by", "released-by"];
  return (Object.keys(SIGNATURE_OWNER) as SignatureKind[]).filter((k) => roles.includes(SIGNATURE_OWNER[k].role));
}

// Links for the uploaded signatures. Real accounts only.
export function useVoucherSignatures() {
  const { isRealAccount } = useHris();
  const [urls, setUrls] = useState<Partial<Record<SignatureKind, string>>>({});
  const reload = useCallback(() => {
    if (!isRealAccount) return;
    fetchSignatureUrls().then(setUrls, () => setUrls({}));
  }, [isRealAccount]);
  useEffect(() => {
    reload();
    // Signed links last an hour; refresh before they expire.
    const t = window.setInterval(reload, 50 * 60_000);
    return () => window.clearInterval(t);
  }, [reload]);
  return { urls, reload };
}

// Upload / replace / remove one signature (a photo of a signature on white
// paper; the background is removed automatically, as on the ID card).
export function SignatureControl({ kind, url, onChanged, hrView }: { kind: SignatureKind; url: string | undefined; onChanged: () => void; hrView: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const label = hrView ? { "prepared-by": "Prepared by", "checked-by": "Checked by", "released-by": "Released by" }[kind] + " signature" : SIGNATURE_OWNER[kind].label;

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    try {
      await uploadSignature(kind, await prepareSignature(file));
      onChanged();
    } catch (err) {
      reportSaveError("Couldn't save the signature", err);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm(`Remove this signature from printed vouchers?`)) return;
    setBusy(true);
    try {
      await removeSignature(kind);
      onChanged();
    } catch (err) {
      reportSaveError("Couldn't remove the signature", err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2 rounded-lg border border-[var(--border-hairline)] px-2 py-1">
      <span className="text-xs text-[var(--text-muted)]">{label}:</span>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL from Supabase Storage
        <img src={url} alt={label} className="h-7 max-w-[90px] rounded bg-white object-contain px-1" />
      ) : (
        <span className="text-xs text-[var(--text-muted)] italic">none</span>
      )}
      <button
        type="button"
        onClick={() => input.current?.click()}
        disabled={busy}
        className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40 disabled:opacity-40"
      >
        <PenLine size={13} /> {busy ? "Saving…" : url ? "Replace" : "Upload"}
      </button>
      {url && (
        <button
          type="button"
          onClick={remove}
          disabled={busy}
          className="rounded-md p-1 text-[var(--text-muted)] hover:text-[var(--status-critical)] disabled:opacity-40"
          aria-label={`Remove ${label}`}
        >
          <Trash2 size={13} />
        </button>
      )}
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={pick} />
    </div>
  );
}

// ---- Sign-offs --------------------------------------------------------------

const round2 = (n: number) => Math.round(n * 100) / 100;

// A sign-off counts only while the voucher still has the total it was signed at.
export function validSignoff(signoffs: VoucherSignoff[], voucherKey: string, step: SignoffStep, total: number): VoucherSignoff | null {
  const s = signoffs.find((x) => x.voucherKey === voucherKey && x.step === step);
  return s && Math.abs(s.signedTotal - round2(total)) < 0.005 ? s : null;
}

export function useVoucherSignoffs(periodId: string | undefined) {
  const { isRealAccount, currentUser } = useHris();
  const [signoffs, setSignoffs] = useState<VoucherSignoff[]>([]);
  const reload = useCallback(() => {
    if (!isRealAccount || !periodId) return;
    fetchVoucherSignoffs(periodId).then(setSignoffs, () => setSignoffs([]));
  }, [isRealAccount, periodId]);
  useEffect(() => reload(), [reload]);

  const sign = useCallback(
    async (voucherKey: string, step: SignoffStep, total: number) => {
      if (!periodId || !currentUser?.employeeId) return;
      try {
        await signVoucher(periodId, voucherKey, step, currentUser.employeeId, total);
      } catch (err) {
        reportSaveError(step === "checked" ? "Couldn't mark the voucher as checked" : "Couldn't mark the voucher as released", err);
      }
      reload();
    },
    [periodId, currentUser, reload],
  );
  const withdraw = useCallback(
    async (voucherKey: string, step: SignoffStep) => {
      if (!periodId) return;
      try {
        await withdrawVoucherSignoff(periodId, voucherKey, step);
      } catch (err) {
        reportSaveError("Couldn't undo the sign-off", err);
      }
      reload();
    },
    [periodId, reload],
  );
  // Only this period's (a switch of period shows nothing until its own load).
  return { signoffs: signoffs.filter((x) => x.periodId === periodId), sign, withdraw };
}

const when = (iso: string) =>
  new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(iso));

// Checked / Released status and buttons, shown on each voucher.
export function SignoffBar({
  voucherKey,
  total,
  signoffs,
  onSign,
  onWithdraw,
  disabled,
}: {
  voucherKey: string;
  total: number;
  signoffs: VoucherSignoff[];
  onSign: (voucherKey: string, step: SignoffStep, total: number) => void;
  onWithdraw: (voucherKey: string, step: SignoffStep) => void;
  disabled?: boolean;
}) {
  const { currentUser, currentEmployee, isRealAccount } = useHris();
  if (!isRealAccount) return null;
  const roles = currentUser?.roles ?? [];
  const isHr = roles.includes("hr_admin");
  const steps: { step: SignoffStep; label: string; action: string; canSign: boolean }[] = [
    { step: "checked", label: "Checked", action: "Mark as checked", canSign: roles.includes("sr_accounting_assistant") },
    { step: "released", label: "Released", action: "Mark as released", canSign: roles.includes("treasurer") },
  ];
  const checked = validSignoff(signoffs, voucherKey, "checked", total);

  return (
    <div className="flex flex-wrap items-center gap-2 print:hidden">
      {steps.map(({ step, label, action, canSign }) => {
        const any = signoffs.find((x) => x.voucherKey === voucherKey && x.step === step);
        const valid = validSignoff(signoffs, voucherKey, step, total);
        const blocked = step === "released" && !checked;
        const mine = any && (any.signedBy === currentEmployee?.id || isHr);
        return (
          <div key={step} className="flex items-center gap-1.5 rounded-lg border border-[var(--border-hairline)] px-2 py-1 text-xs">
            {valid ? (
              <span className="flex items-center gap-1 text-[var(--status-good)]" title={`${label} by ${valid.signedByName} on ${when(valid.signedAt)}`}>
                <BadgeCheck size={14} /> {label} · {valid.signedByName} · {when(valid.signedAt)}
              </span>
            ) : any ? (
              <span className="text-[var(--status-warning)]" title={`${label} by ${any.signedByName} when the total was ${any.signedTotal.toFixed(2)}`}>
                Changed since {label.toLowerCase()} — needs {label === "Checked" ? "re-checking" : "re-releasing"}
              </span>
            ) : (
              <span className="text-[var(--text-muted)]">Not yet {label.toLowerCase()}</span>
            )}
            {canSign && !valid && (
              <button
                type="button"
                onClick={() => onSign(voucherKey, step, total)}
                disabled={disabled || blocked}
                title={blocked ? "The voucher has to be checked first." : undefined}
                className="rounded-md bg-[var(--series-1)] px-2 py-0.5 font-medium text-[var(--on-accent)] disabled:opacity-40"
              >
                {action}
              </button>
            )}
            {any && mine && (
              <button
                type="button"
                onClick={() => onWithdraw(voucherKey, step)}
                className="rounded-md p-0.5 text-[var(--text-muted)] hover:text-[var(--status-critical)]"
                aria-label={`Undo ${label.toLowerCase()}`}
                title="Undo"
              >
                <Undo2 size={13} />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
