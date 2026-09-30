"use client";

import { useCallback, useEffect, useState } from "react";
import { useHris } from "@/lib/store";
import { reportSaveError } from "@/lib/save-errors";
import type { ThirteenthMonthEntry, ThirteenthMonthSlipData } from "@/lib/thirteenth-month";
import {
  deleteThirteenthMonthEntry,
  fetchThirteenthMonthEntries,
  fetchReleasedThirteenthMonthSlips,
  fetchThirteenthMonthSignoffs,
  releaseThirteenthMonthSlips,
  saveThirteenthMonthEntry,
  signThirteenthMonth,
  withdrawThirteenthMonthSignoff,
  withdrawThirteenthMonthSlip,
  type ReleasedThirteenthMonthSlip,
} from "@/lib/supabase/thirteenth-month";
import type { SignoffStep, VoucherSignoff } from "@/lib/supabase/voucher-signoffs";

// HR's edits to the year's 13th month sheet. In the demo they're kept in
// memory only.
export function useThirteenthMonthEntries(year: number) {
  const { isRealAccount, currentUser } = useHris();
  const [state, setState] = useState<{ year: number; entries: ThirteenthMonthEntry[]; error: string | null; loaded: boolean }>({ year, entries: [], error: null, loaded: false });
  useEffect(() => {
    if (!isRealAccount) return;
    let live = true;
    fetchThirteenthMonthEntries(year).then(
      (entries) => live && setState({ year, entries, error: null, loaded: true }),
      (err: Error) => live && setState({ year, entries: [], error: err.message, loaded: true }),
    );
    return () => {
      live = false;
    };
  }, [isRealAccount, year]);

  const current = state.year === year ? state : { year, entries: [], error: null, loaded: false };

  const save = useCallback(
    async (entry: ThirteenthMonthEntry): Promise<boolean> => {
      try {
        const saved = isRealAccount ? await saveThirteenthMonthEntry(entry, currentUser?.name ?? "") : entry;
        setState((s) => ({ ...s, entries: [...s.entries.filter((e) => !(e.year === saved.year && e.employeeId === saved.employeeId)), saved] }));
        return true;
      } catch (err) {
        reportSaveError("Couldn't save the 13th month figures", err);
        return false;
      }
    },
    [isRealAccount, currentUser],
  );

  const reset = useCallback(
    async (y: number, employeeId: string): Promise<boolean> => {
      try {
        if (isRealAccount) await deleteThirteenthMonthEntry(y, employeeId);
        setState((s) => ({ ...s, entries: s.entries.filter((e) => !(e.year === y && e.employeeId === employeeId)) }));
        return true;
      } catch (err) {
        reportSaveError("Couldn't reset the 13th month figures", err);
        return false;
      }
    },
    [isRealAccount],
  );

  return { entries: current.entries, error: current.error, loaded: isRealAccount ? current.loaded : true, save, reset };
}

// Checked by / Released by for the year, shaped like voucher sign-offs.
export function useThirteenthMonthSignoffs(year: number) {
  const { isRealAccount, currentUser } = useHris();
  const [signoffs, setSignoffs] = useState<VoucherSignoff[]>([]);
  const reload = useCallback(() => {
    if (!isRealAccount) return;
    fetchThirteenthMonthSignoffs(year).then(setSignoffs, () => setSignoffs([]));
  }, [isRealAccount, year]);
  useEffect(() => reload(), [reload]);

  const signMany = useCallback(
    async (step: SignoffStep, items: { voucherKey: string; total: number }[]) => {
      if (!currentUser?.employeeId) return;
      try {
        for (const { voucherKey, total } of items) await signThirteenthMonth(year, voucherKey, step, currentUser.employeeId, total);
      } catch (err) {
        reportSaveError(step === "checked" ? "Couldn't mark as checked" : "Couldn't mark as released", err);
      }
      reload();
    },
    [year, currentUser, reload],
  );
  const sign = useCallback((employeeId: string, step: SignoffStep, total: number) => signMany(step, [{ voucherKey: employeeId, total }]), [signMany]);
  const withdraw = useCallback(
    async (employeeId: string, step: SignoffStep) => {
      try {
        await withdrawThirteenthMonthSignoff(year, employeeId, step);
      } catch (err) {
        reportSaveError("Couldn't undo the sign-off", err);
      }
      reload();
    },
    [year, reload],
  );
  return { signoffs: signoffs.filter((s) => s.periodId === String(year)), sign, signMany, withdraw };
}

// Slips released to employees for the year (HR's view). In the demo they're
// kept in memory only.
export function useReleasedThirteenthMonthSlips(year: number) {
  const { isRealAccount, currentUser } = useHris();
  const [state, setState] = useState<{ year: number; slips: ReleasedThirteenthMonthSlip[] }>({ year, slips: [] });
  useEffect(() => {
    if (!isRealAccount) return;
    let live = true;
    fetchReleasedThirteenthMonthSlips({ year }).then((slips) => live && setState({ year, slips }));
    return () => {
      live = false;
    };
  }, [isRealAccount, year]);

  const release = useCallback(
    async (items: { employeeId: string; slip: ThirteenthMonthSlipData }[]) => {
      try {
        const saved = isRealAccount
          ? await releaseThirteenthMonthSlips(year, items, currentUser?.name ?? "")
          : items.map((i) => ({ year, employeeId: i.employeeId, slip: i.slip, total: i.slip.total, releasedBy: currentUser?.name ?? "", releasedAt: new Date().toISOString() }));
        const ids = new Set(saved.map((x) => x.employeeId));
        setState((st) => ({ year, slips: [...(st.year === year ? st.slips : []).filter((x) => !ids.has(x.employeeId)), ...saved] }));
      } catch (err) {
        reportSaveError("Couldn't release the 13th month slips", err);
      }
    },
    [isRealAccount, year, currentUser],
  );
  const withdraw = useCallback(
    async (employeeId: string) => {
      try {
        if (isRealAccount) await withdrawThirteenthMonthSlip(year, employeeId);
        setState((st) => ({ year, slips: (st.year === year ? st.slips : []).filter((x) => x.employeeId !== employeeId) }));
      } catch (err) {
        reportSaveError("Couldn't withdraw the slip", err);
      }
    },
    [isRealAccount, year],
  );
  return { released: state.year === year ? state.slips : [], release, withdraw };
}
