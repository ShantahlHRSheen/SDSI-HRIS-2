import { getSupabaseClient } from "./supabase/client";
import { placeMySignature } from "./supabase/leave-forms";

// The branch approver's step on leave, overtime and attendance correction
// forms (supabase/migrate_phase40_branch_approver.sql): for employees of a
// branch with an approver (e.g. Manila), a form goes employee → branch
// approver → department head → HR.

export type FormKind = "leave" | "ot" | "corr";

export interface BranchApproval {
  branchApproverId: string | null;
  branchApprover: string;
  branchDecision: "approved" | "disapproved" | null;
  branchReason: string | null;
  branchSignedName: string | null;
  branchSignedAt: string | null;
}

export const NO_BRANCH: BranchApproval = { branchApproverId: null, branchApprover: "", branchDecision: null, branchReason: null, branchSignedName: null, branchSignedAt: null };

export function branchFromRow(r: Record<string, unknown>): BranchApproval {
  return {
    branchApproverId: (r.branch_approver_id as string | null) ?? null,
    branchApprover: String(r.branch_approver ?? ""),
    branchDecision: (r.branch_decision as BranchApproval["branchDecision"]) ?? null,
    branchReason: (r.branch_reason as string | null) ?? null,
    branchSignedName: (r.branch_signed_name as string | null) ?? null,
    branchSignedAt: (r.branch_signed_at as string | null) ?? null,
  };
}

// Waiting for the branch approver.
export const waitingBranch = (f: BranchApproval) => !!f.branchApproverId && !f.branchDecision;
export const branchDisapproved = (f: BranchApproval) => f.branchDecision === "disapproved";
export const canBranch = (f: BranchApproval & { employeeId: string }, me: string | undefined) => !!me && f.employeeId !== me && f.branchApproverId === me && !f.branchDecision;

const FOLDER: Record<FormKind, string> = { leave: "forms", ot: "ot", corr: "corr" };

export async function decideBranch(kind: FormKind, requestId: string, me: string, decision: "approved" | "disapproved", reason: string): Promise<void> {
  await placeMySignature(me, `${FOLDER[kind]}/${requestId}/branch.png`);
  const { error } = await (getSupabaseClient() as unknown as { rpc: (fn: string, a: Record<string, unknown>) => PromiseLike<{ error: { message: string } | null }> }).rpc("form_branch_decide", {
    p_kind: kind,
    p_request: requestId,
    p_decision: decision,
    p_reason: reason,
  });
  if (error) throw new Error(/form_branch_decide/.test(error.message) ? "The branch approval isn't set up yet — ask HR to run the latest database update." : error.message);
}
