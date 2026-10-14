"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabaseClient } from "./client";
import { useHris } from "../store";

// "Encoded in payroll" ticks on leave / overtime / correction requests
// (supabase/migrate_phase42_payroll_encoded.sql).

export type EncodedKind = "leave" | "ot" | "corr";
export interface EncodedMark {
  byName: string;
  at: string;
}

type Row = Record<string, unknown>;
type Query = PromiseLike<{ data: unknown; error: { message: string } | null }> & {
  select: (c?: string) => Query;
  insert: (v: Row) => Query;
  delete: () => Query;
  eq: (c: string, v: string) => Query;
  range: (from: number, to: number) => Query;
};
const client = () => getSupabaseClient() as unknown as { from: (t: string) => Query };

// null when the table isn't there yet (before the database update).
async function fetchMarks(kind: EncodedKind): Promise<Map<string, EncodedMark> | null> {
  const out = new Map<string, EncodedMark>();
  for (let i = 0; ; i += 1000) {
    const { data, error } = await client().from("payroll_encoded").select("request_id,encoded_by_name,encoded_at").eq("kind", kind).range(i, i + 999);
    if (error) return null;
    const rows = data as Row[];
    for (const r of rows) out.set(String(r.request_id), { byName: String(r.encoded_by_name ?? ""), at: String(r.encoded_at ?? "") });
    if (rows.length < 1000) return out;
  }
}

// Ticks for one kind; `canTick` for HR and payroll. Empty (and no ticking)
// before the database update is run.
export function usePayrollEncoded(kind: EncodedKind) {
  const { isRealAccount, currentUser, currentEmployee } = useHris();
  const [marks, setMarks] = useState<Map<string, EncodedMark>>(new Map());
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canTick = ready && !!currentUser?.roles.some((r) => r === "hr_admin" || r === "payroll_officer");

  useEffect(() => {
    if (!isRealAccount) return;
    let live = true;
    fetchMarks(kind).then((m) => {
      if (!live) return;
      setMarks(m ?? new Map());
      setReady(!!m);
    });
    return () => {
      live = false;
    };
  }, [isRealAccount, kind]);

  const toggle = useCallback(
    async (requestId: string, on: boolean) => {
      if (!currentEmployee) return;
      setError(null);
      // Shown straight away; put back if the save fails.
      const before = marks.get(requestId);
      setMarks((m) => {
        const next = new Map(m);
        if (on) next.set(requestId, { byName: `${currentEmployee.firstName} ${currentEmployee.lastName}`, at: new Date().toISOString() });
        else next.delete(requestId);
        return next;
      });
      const { error: err } = on
        ? await client().from("payroll_encoded").insert({ kind, request_id: requestId, encoded_by: currentEmployee.id, encoded_by_name: `${currentEmployee.firstName} ${currentEmployee.lastName}` })
        : await client().from("payroll_encoded").delete().eq("kind", kind).eq("request_id", requestId);
      if (err && !(on && /duplicate key/i.test(err.message))) {
        setError(err.message);
        setMarks((m) => {
          const next = new Map(m);
          if (before) next.set(requestId, before);
          else next.delete(requestId);
          return next;
        });
      }
    },
    [currentEmployee, kind, marks],
  );

  return { marks, ready, canTick, toggle, error };
}

// The tick box shown beside the employee's name.
export function EncodedBox({ id, marks, canTick, onToggle }: { id: string; marks: Map<string, EncodedMark>; canTick: boolean; onToggle: (id: string, on: boolean) => void }) {
  const mark = marks.get(id);
  const title = mark ? `Encoded in payroll by ${mark.byName} · ${new Date(mark.at).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric", year: "numeric" })}` : "Not yet encoded in payroll";
  return (
    <input
      type="checkbox"
      checked={!!mark}
      disabled={!canTick}
      onChange={(e) => onToggle(id, e.target.checked)}
      title={title}
      aria-label={title}
      className="h-4 w-4 cursor-pointer accent-[var(--series-1)] disabled:cursor-default"
    />
  );
}
