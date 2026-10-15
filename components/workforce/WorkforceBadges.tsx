"use client";

import { useCallback, useEffect, useState } from "react";
import { useHris } from "@/lib/store";
import { companyStorageKey } from "@/lib/companies";
import { fetchLeaveForms } from "@/lib/supabase/leave-forms";
import { fetchOvertimeForms } from "@/lib/supabase/overtime-forms";
import { fetchCorrectionForms } from "@/lib/supabase/correction-forms";
import { fetchTravelAllowances, canApproveTravel, travelStage } from "@/lib/travel-allowance";
import { formStage, type LeaveForm } from "@/lib/leave-form";
import { otStage, type OvertimeForm } from "@/lib/overtime-form";
import { correctionStage, type CorrectionForm } from "@/lib/correction-form";
import { canBranch } from "@/lib/branch-approval";

// Red menu badges for the Workforce pages (like Chat with HR):
// - requests / forms waiting for the user (to approve, sign, receive or
//   clarify) — counted until they act on them;
// - the user's own requests that were approved, disapproved or received
//   since they last opened that page.

export type WorkforceKind = "leave" | "ot" | "corr" | "travel";
export const WORKFORCE_PATHS: Record<WorkforceKind, string> = {
  leave: "/modules/leave",
  ot: "/modules/overtime",
  corr: "/modules/corrections",
  travel: "/modules/travel",
};

const POLL_MS = 60_000;
const SEEN_EVENT = "hris:workforce-seen";
const seenKey = (kind: WorkforceKind, me: string) => companyStorageKey(`hris.seen.${kind}.${me}`);

function readSeen(kind: WorkforceKind, me: string): string {
  try {
    const v = window.localStorage.getItem(seenKey(kind, me));
    if (v) return v;
    // First time: start from now, so old decisions don't all show as new.
    const now = new Date().toISOString();
    window.localStorage.setItem(seenKey(kind, me), now);
    return now;
  } catch {
    return new Date().toISOString();
  }
}

// Called by each page when it's opened: the user has seen their updates.
export function useMarkWorkforceSeen(kind: WorkforceKind) {
  const { currentEmployee } = useHris();
  const me = currentEmployee?.id;
  useEffect(() => {
    if (!me) return;
    const mark = () => {
      try {
        window.localStorage.setItem(seenKey(kind, me), new Date().toISOString());
      } catch {
        /* not remembered */
      }
      window.dispatchEvent(new Event(SEEN_EVENT));
    };
    mark();
    // Keep it current while the page stays open.
    const t = window.setInterval(mark, POLL_MS);
    return () => window.clearInterval(t);
  }, [kind, me]);
}

const latest = (...times: (string | null | undefined)[]) => times.filter((t): t is string => !!t).sort().pop() ?? "";

export function useWorkforceBadges(): Record<string, number> {
  const { isRealAccount, currentEmployee, currentUser, employees, leaveRequests, overtimeRequests, correctionRequests } = useHris();
  const me = currentEmployee?.id;
  const isHr = !!currentUser?.roles.includes("hr_admin");
  const [forms, setForms] = useState<{ leave: LeaveForm[]; ot: OvertimeForm[]; corr: CorrectionForm[]; travel: Awaited<ReturnType<typeof fetchTravelAllowances>> }>({ leave: [], ot: [], corr: [], travel: [] });
  const [seenTick, setSeenTick] = useState(0);

  const load = useCallback(() => {
    if (!isRealAccount || !me) return;
    const ok = <T,>(r: PromiseSettledResult<T[]>) => (r.status === "fulfilled" ? r.value : []);
    Promise.allSettled([fetchLeaveForms(), fetchOvertimeForms(), fetchCorrectionForms(), fetchTravelAllowances()]).then(([l, o, c, t]) =>
      setForms({ leave: ok(l), ot: ok(o), corr: ok(c), travel: ok(t) }),
    );
  }, [isRealAccount, me]);

  useEffect(() => {
    load();
    const t = window.setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, POLL_MS);
    const onSeen = () => {
      setSeenTick((n) => n + 1);
      load();
    };
    window.addEventListener(SEEN_EVENT, onSeen);
    return () => {
      window.clearInterval(t);
      window.removeEventListener(SEEN_EVENT, onSeen);
    };
  }, [load]);

  if (!isRealAccount || !me) return {};
  void seenTick;

  const headCan = (f: { employeeId: string; departmentHeadId: string | null }) => f.employeeId !== me && (f.departmentHeadId ? f.departmentHeadId === me : isHr);
  // Requests filed without an online form (older ones): the supervisor or HR decides.
  const supervises = (employeeId: string) => isHr || employees.find((e) => e.id === employeeId)?.supervisorId === me;
  const legacy = <R extends { id: string; employeeId: string; status: string }>(rows: R[], formIds: Set<string>) =>
    rows.filter((r) => r.status === "pending" && r.employeeId !== me && !formIds.has(r.id) && supervises(r.employeeId)).length;

  // Leave
  const leaveFormIds = new Set(forms.leave.flatMap((f) => [f.leaveRequestId, ...(f.unpaidRequestId ? [f.unpaidRequestId] : [])]));
  const leaveAction =
    forms.leave.filter((f) => canBranch(f, me) || (formStage(f) === "waiting_head" && headCan(f)) || (isHr && formStage(f) === "waiting_hr" && f.employeeId !== me)).length +
    legacy(leaveRequests, leaveFormIds);
  const leaveSeen = readSeen("leave", me);
  const leaveUpdates =
    forms.leave.filter((f) => f.employeeId === me && latest(f.branchSignedAt, f.headSignedAt, f.receivedAt) > leaveSeen).length +
    leaveRequests.filter((r) => r.employeeId === me && !leaveFormIds.has(r.id) && r.decidedAt && r.decidedAt > leaveSeen).length;

  // Overtime
  const otFormIds = new Set(forms.ot.map((f) => f.overtimeRequestId));
  const otAction =
    forms.ot.filter(
      (f) =>
        canBranch(f, me) ||
        (otStage(f) === "waiting_head" && headCan(f)) ||
        (isHr && otStage(f) === "waiting_hr" && f.employeeId !== me) ||
        (otStage(f) === "returned" && f.employeeId === me),
    ).length + legacy(overtimeRequests, otFormIds);
  const otSeen = readSeen("ot", me);
  const otUpdates =
    forms.ot.filter((f) => f.employeeId === me && otStage(f) !== "returned" && latest(f.branchSignedAt, f.headSignedAt, f.hrSignedAt) > otSeen).length +
    overtimeRequests.filter((r) => r.employeeId === me && !otFormIds.has(r.id) && r.decidedAt && r.decidedAt > otSeen).length;

  // Attendance corrections
  const corrFormIds = new Set(forms.corr.map((f) => f.correctionRequestId));
  const corrAction =
    forms.corr.filter((f) => canBranch(f, me) || (correctionStage(f) === "waiting_head" && headCan(f)) || (isHr && correctionStage(f) === "waiting_hr" && f.employeeId !== me)).length +
    legacy(correctionRequests, corrFormIds);
  const corrSeen = readSeen("corr", me);
  const corrUpdates =
    forms.corr.filter((f) => f.employeeId === me && latest(f.branchSignedAt, f.headSignedAt, f.receivedAt) > corrSeen).length +
    correctionRequests.filter((r) => r.employeeId === me && !corrFormIds.has(r.id) && r.decidedAt && r.decidedAt > corrSeen).length;

  // Travel allowance
  const travelAction = forms.travel.filter((t) => canApproveTravel(t, me, isHr) || (isHr && travelStage(t) === "waiting_hr" && t.employeeId !== me)).length;
  const travelSeen = readSeen("travel", me);
  const travelUpdates = forms.travel.filter((t) => t.employeeId === me && latest(t.headSignedAt, t.receivedAt) > travelSeen).length;

  return {
    [WORKFORCE_PATHS.leave]: leaveAction + leaveUpdates,
    [WORKFORCE_PATHS.ot]: otAction + otUpdates,
    [WORKFORCE_PATHS.corr]: corrAction + corrUpdates,
    [WORKFORCE_PATHS.travel]: travelAction + travelUpdates,
  };
}
