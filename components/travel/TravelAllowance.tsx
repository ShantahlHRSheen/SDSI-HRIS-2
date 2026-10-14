"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Printer } from "lucide-react";
import { useHris } from "@/lib/store";
import { Modal } from "@/components/Modal";
import { Badge } from "@/components/Badge";
import { MySignature } from "@/components/leave/LeaveApplication";
import { TravelAllowanceDocument, type TravelAllowanceDocData } from "@/components/travel/TravelAllowanceDocument";
import { PrintPage, PrintStack } from "@/components/vouchers/PrintStack";
import { DownloadPdfButton, PdfPage } from "@/components/pdf/DownloadPdfButton";
import { fetchMyLeaveFormDetails, type LeaveFormSigner } from "@/lib/supabase/leave-forms";
import { positionTitle } from "@/lib/helpers";
import { todayInManila } from "@/lib/leave-policy";
import {
  TRAVEL_ALLOWANCE_AMOUNT,
  canApproveTravel,
  decideTravelAllowance,
  fetchTravelAllowances,
  fileTravelAllowance,
  receiveTravelAllowance,
  travelProgress,
  travelSignatureUrls,
  travelStage,
  type TravelAllowance,
} from "@/lib/travel-allowance";

export function useTravelAllowances() {
  const { isRealAccount } = useHris();
  const [items, setItems] = useState<TravelAllowance[]>([]);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(() => {
    if (!isRealAccount) return;
    fetchTravelAllowances().then(
      (t) => {
        setItems(t);
        setError(null);
      },
      (e: Error) => setError(e.message),
    );
  }, [isRealAccount]);
  useEffect(() => reload(), [reload]);
  return { items, error, reload };
}

export function TravelProgress({ item }: { item: TravelAllowance }) {
  const p = travelProgress(item);
  return <Badge tone={p.tone}>{p.label}</Badge>;
}

const input = "w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--surface-1)] px-3 py-2 text-sm";
const lbl = "mb-1 block text-xs font-medium text-[var(--text-secondary)]";

// ---- Filing --------------------------------------------------------------------

export function TravelRequestModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { currentEmployee, employees } = useHris();
  const today = useMemo(() => todayInManila(), []);
  const [details, setDetails] = useState<{ designation: string; branch: string; department: string; departmentHead: string } | null>(null);
  useEffect(() => {
    fetchMyLeaveFormDetails().then(setDetails, () => setDetails(null));
  }, []);
  const [driver, setDriver] = useState("");
  const [date, setDate] = useState(today);
  const [destination, setDestination] = useState("");
  const [withAllowance, setWithAllowance] = useState<boolean | null>(null);
  const [hasSignature, setHasSignature] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);

  // Drivers first, then everyone else (a typed name not on the list is fine too).
  const people = useMemo(() => {
    const active = employees.filter((e) => e.status !== "resigned" && e.status !== "terminated");
    const isDriver = (id: string) => /driver/i.test(positionTitle(id));
    return [...active].sort((a, b) => Number(isDriver(b.positionId)) - Number(isDriver(a.positionId)) || a.lastName.localeCompare(b.lastName));
  }, [employees]);
  const driverMatch = people.find((e) => `${e.firstName} ${e.lastName}`.toLowerCase() === driver.trim().toLowerCase());

  const missing = !driver.trim()
    ? "Enter the name of the driver."
    : !date
      ? "Enter the date."
      : !destination.trim()
        ? "Enter the destination."
        : withAllowance === null
          ? "Choose with or without allowance."
          : !hasSignature
            ? "Upload your signature to sign the request."
            : null;

  async function submit() {
    if (!currentEmployee || missing || withAllowance === null) return;
    setBusy(true);
    setError(null);
    try {
      await fileTravelAllowance(currentEmployee.id, { travelDate: date, driverName: driver, driverEmployeeId: driverMatch?.id ?? null, destination, withAllowance });
      onDone();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't file the request.");
    } finally {
      setBusy(false);
    }
  }

  const doc: TravelAllowanceDocData | null = currentEmployee
    ? {
        id: "",
        employeeId: currentEmployee.id,
        travelDate: date,
        driverName: driver,
        driverEmployeeId: null,
        destination,
        withAllowance: !!withAllowance,
        amount: withAllowance ? TRAVEL_ALLOWANCE_AMOUNT : 0,
        employeeName: `${currentEmployee.firstName} ${currentEmployee.lastName}`,
        position: details?.designation ?? "",
        department: details?.department ?? "",
        branch: details?.branch ?? "",
        approverId: null,
        approverName: details?.departmentHead ?? "",
        submittedAt: null,
        headDecision: null,
        headReason: null,
        headSignedName: null,
        headSignedAt: null,
        receivedName: null,
        receivedAt: null,
      }
    : null;

  return (
    <Modal open onClose={onClose} title="Travel Allowance Request" wide>
      {preview && doc ? (
        <div>
          <div className="overflow-x-auto rounded-lg bg-white p-4">
            <div className="min-w-[560px]">
              <TravelAllowanceDocument form={doc} />
            </div>
          </div>
          <div className="mt-3 flex justify-end">
            <button onClick={() => setPreview(false)} className="rounded-lg border border-[var(--border-hairline)] px-3 py-1.5 text-sm text-[var(--text-secondary)]">
              Back to the form
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <label className={lbl} htmlFor="ta-driver">
              Name of driver
            </label>
            <input id="ta-driver" list="ta-drivers" value={driver} onChange={(e) => setDriver(e.target.value)} maxLength={120} placeholder="Type or pick a name" className={input} />
            <datalist id="ta-drivers">
              {people.map((e) => (
                <option key={e.id} value={`${e.firstName} ${e.lastName}`}>
                  {positionTitle(e.positionId)}
                </option>
              ))}
            </datalist>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className={lbl} htmlFor="ta-date">
                Date
              </label>
              <input id="ta-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className={input} />
            </div>
            <div>
              <label className={lbl} htmlFor="ta-destination">
                Destination
              </label>
              <input id="ta-destination" value={destination} onChange={(e) => setDestination(e.target.value)} maxLength={300} className={input} />
            </div>
          </div>
          <div>
            <div className={lbl}>Allowance</div>
            <div className="flex flex-wrap gap-5 text-sm text-[var(--text-primary)]">
              <label className="flex items-center gap-2">
                <input type="radio" name="ta-allowance" checked={withAllowance === true} onChange={() => setWithAllowance(true)} /> With allowance (₱{TRAVEL_ALLOWANCE_AMOUNT})
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" name="ta-allowance" checked={withAllowance === false} onChange={() => setWithAllowance(false)} /> Without allowance
              </label>
            </div>
          </div>
          <div className="text-xs text-[var(--text-muted)]">Approver: {details?.departmentHead || "HR Manager"} → then received by HR.</div>
          <MySignature onChange={setHasSignature} />
          {(error || missing) && <div className={`text-xs ${error ? "text-[var(--status-critical)]" : "text-[var(--text-muted)]"}`}>{error ?? missing}</div>}
          <div className="flex flex-wrap justify-end gap-2 pt-1">
            <button onClick={() => setPreview(true)} disabled={!doc} className="mr-auto rounded-lg border border-[var(--border-hairline)] px-3 py-1.5 text-sm text-[var(--text-secondary)] disabled:opacity-40">
              Preview form
            </button>
            <button onClick={onClose} className="rounded-lg px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40">
              Cancel
            </button>
            <button onClick={submit} disabled={busy || !!missing} className="rounded-lg bg-[var(--series-1)] px-3 py-1.5 text-sm font-medium text-[var(--on-accent)] disabled:opacity-40">
              {busy ? "Submitting…" : "Sign & submit"}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

// ---- Viewing, approving, receiving ---------------------------------------------------

export function TravelFormModal({ item, onClose, onChanged }: { item: TravelAllowance; onClose: () => void; onChanged: () => void }) {
  const { currentEmployee, currentUser } = useHris();
  const me = currentEmployee?.id;
  const isHr = !!currentUser?.roles.includes("hr_admin");
  const [sigs, setSigs] = useState<Partial<Record<LeaveFormSigner, string>>>({});
  const loadSigs = useCallback(() => {
    travelSignatureUrls(item).then(setSigs, () => setSigs({}));
  }, [item]);
  useEffect(() => loadSigs(), [loadSigs]);
  const stage = travelStage(item);
  const canHead = canApproveTravel(item, me, isHr);
  const canReceive = isHr && stage === "waiting_hr" && item.employeeId !== me;
  const [decision, setDecision] = useState<"approved" | "disapproved" | null>(null);
  const [reason, setReason] = useState("");
  const [hasSignature, setHasSignature] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [printing, setPrinting] = useState(false);
  const stopPrinting = useCallback(() => setPrinting(false), []);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      onChanged();
      loadSigs();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't submit.");
    } finally {
      setBusy(false);
    }
  }

  const filename = `Travel-Allowance-${item.employeeName.replace(/[^A-Za-z0-9]+/g, "-")}-${item.travelDate}.pdf`;
  return (
    <Modal open onClose={onClose} title={`Travel allowance — ${item.employeeName}`} wide>
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <TravelProgress item={item} />
          <div className="ml-auto flex items-start gap-2">
            <button onClick={() => setPrinting(true)} className="flex items-center gap-1.5 rounded-lg border border-[var(--border-hairline)] px-3 py-1.5 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--gridline)]/40">
              <Printer size={14} /> Print
            </button>
            <DownloadPdfButton filename={filename}>
              <PdfPage form>
                <TravelAllowanceDocument form={item} signatures={sigs} />
              </PdfPage>
            </DownloadPdfButton>
          </div>
        </div>
        <div className="overflow-x-auto rounded-lg bg-white p-4">
          <div className="min-w-[560px]">
            <TravelAllowanceDocument form={item} signatures={sigs} />
          </div>
        </div>

        {canHead && (
          <div className="space-y-3 rounded-lg border border-[var(--border-hairline)] p-3">
            <div className="text-sm font-semibold text-[var(--text-primary)]">Approval</div>
            <div className="flex flex-wrap gap-4 text-sm text-[var(--text-secondary)]">
              <label className="flex items-center gap-2">
                <input type="radio" name="ta-decision" checked={decision === "approved"} onChange={() => setDecision("approved")} /> Approved
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" name="ta-decision" checked={decision === "disapproved"} onChange={() => setDecision("disapproved")} /> Disapproved
              </label>
            </div>
            {decision === "disapproved" && (
              <div>
                <label className={lbl} htmlFor="ta-reason">
                  Reason of disapproval
                </label>
                <input id="ta-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} className={input} />
              </div>
            )}
            <MySignature onChange={setHasSignature} />
            {error && <div className="text-xs text-[var(--status-critical)]">{error}</div>}
            <div className="flex justify-end">
              <button
                onClick={() => me && decision && run(() => decideTravelAllowance(item, me, decision, reason))}
                disabled={busy || !decision || !hasSignature || (decision === "disapproved" && !reason.trim())}
                className="rounded-lg bg-[var(--series-1)] px-3 py-1.5 text-sm font-medium text-[var(--on-accent)] disabled:opacity-40"
              >
                {busy ? "Submitting…" : decision === "disapproved" ? "Sign & disapprove" : "Sign & approve"}
              </button>
            </div>
          </div>
        )}

        {canReceive && (
          <div className="space-y-3 rounded-lg border border-[var(--border-hairline)] p-3">
            <div className="text-sm font-semibold text-[var(--text-primary)]">HR Department&rsquo;s receipt</div>
            <MySignature onChange={setHasSignature} />
            {error && <div className="text-xs text-[var(--status-critical)]">{error}</div>}
            <div className="flex justify-end">
              <button
                onClick={() => me && run(() => receiveTravelAllowance(item, me))}
                disabled={busy || !hasSignature}
                className="rounded-lg bg-[var(--series-1)] px-3 py-1.5 text-sm font-medium text-[var(--on-accent)] disabled:opacity-40"
              >
                {busy ? "Submitting…" : "Sign as received"}
              </button>
            </div>
          </div>
        )}
        {error && !canHead && !canReceive && <div className="text-xs text-[var(--status-critical)]">{error}</div>}
      </div>
      {printing && (
        <PrintStack onDone={stopPrinting}>
          <PrintPage form>
            <TravelAllowanceDocument form={item} signatures={sigs} />
          </PrintPage>
        </PrintStack>
      )}
    </Modal>
  );
}
