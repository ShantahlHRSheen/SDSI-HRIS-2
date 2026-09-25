"use client";

import { useCallback, useEffect, useState } from "react";
import { useHris } from "./store";
import { reportSaveError } from "./save-errors";
import {
  addVoucherLine,
  deleteVoucherLine,
  ensureDepartmentVoucher,
  fetchDepartmentVouchers,
  updateVoucherLine,
  type DepartmentVoucher,
  type DepartmentVoucherLine,
} from "./supabase/department-vouchers";
import type { PayrollPeriod } from "./types";

// Department vouchers for the Vouchers page and the Payroll Expense Report.
// Real accounts read/write the database; the demo login keeps them in memory.

type LineInput = Omit<DepartmentVoucherLine, "id" | "voucherId" | "sortOrder">;

export function useDepartmentVouchers() {
  const { isRealAccount, currentUser } = useHris();
  const [vouchers, setVouchers] = useState<DepartmentVoucher[]>([]);
  const [lines, setLines] = useState<DepartmentVoucherLine[]>([]);
  const [loaded, setLoaded] = useState(!isRealAccount);
  const [loadError, setLoadError] = useState<string | null>(null);

  const reload = useCallback(() => {
    if (!isRealAccount) return;
    fetchDepartmentVouchers().then(
      (d) => {
        setVouchers(d.vouchers);
        setLines(d.lines);
        setLoaded(true);
        setLoadError(null);
      },
      (err) => {
        setLoaded(true);
        setLoadError(err instanceof Error ? err.message : "Couldn't load vouchers.");
      },
    );
  }, [isRealAccount]);

  useEffect(() => {
    reload();
  }, [reload]);

  async function voucherFor(periodId: string, departmentId: string): Promise<DepartmentVoucher> {
    const existing = vouchers.find((v) => v.periodId === periodId && v.departmentId === departmentId);
    if (existing) return existing;
    const v = isRealAccount
      ? await ensureDepartmentVoucher(periodId, departmentId, currentUser?.name ?? "")
      : { id: `dv-${periodId}-${departmentId}`, periodId, departmentId, notes: "", createdBy: currentUser?.name ?? "", updatedAt: new Date().toISOString() };
    setVouchers((prev) => (prev.some((x) => x.id === v.id) ? prev : [...prev, v]));
    return v;
  }

  // Each resolves to true on success; failures show an error toast.
  async function addLine(period: PayrollPeriod, departmentId: string, input: LineInput): Promise<boolean> {
    try {
      const v = await voucherFor(period.id, departmentId);
      const sortOrder = Math.max(0, ...lines.filter((l) => l.voucherId === v.id).map((l) => l.sortOrder + 1));
      const line = isRealAccount ? await addVoucherLine(v.id, { ...input, sortOrder }) : { ...input, id: `dvl-${Date.now()}`, voucherId: v.id, sortOrder };
      setLines((prev) => [...prev, line]);
      return true;
    } catch (err) {
      reportSaveError("Couldn't add the voucher line", err);
      return false;
    }
  }

  async function editLine(id: string, patch: Partial<LineInput>): Promise<boolean> {
    try {
      const updated = isRealAccount ? await updateVoucherLine(id, patch) : null;
      setLines((prev) => prev.map((l) => (l.id === id ? (updated ?? { ...l, ...patch }) : l)));
      return true;
    } catch (err) {
      reportSaveError("Couldn't save the voucher line", err);
      return false;
    }
  }

  async function removeLine(id: string): Promise<boolean> {
    try {
      if (isRealAccount) await deleteVoucherLine(id);
      setLines((prev) => prev.filter((l) => l.id !== id));
      return true;
    } catch (err) {
      reportSaveError("Couldn't remove the voucher line", err);
      return false;
    }
  }

  return { vouchers, lines, loaded, loadError, reload, addLine, editLine, removeLine };
}
