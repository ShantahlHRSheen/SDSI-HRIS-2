import { formatCurrency } from "@/lib/helpers";

export function FormShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="bir-print-area rounded-xl border border-[#d8d8d4] p-6 font-sans text-sm text-[#0b0b0b] sm:p-8">
      {children}
    </div>
  );
}

export function FormHeader({ formNo, title, subtitle }: { formNo: string; title: string; subtitle?: string }) {
  return (
    <div className="mb-5 border-b-2 border-[#0b0b0b] pb-3">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs tracking-wide text-[#52514e] uppercase">Republic of the Philippines</div>
          <div className="text-xs tracking-wide text-[#52514e] uppercase">Bureau of Internal Revenue</div>
        </div>
        <div className="text-right">
          <div className="text-xs font-semibold text-[#52514e]">BIR Form No.</div>
          <div className="text-lg font-bold">{formNo}</div>
        </div>
      </div>
      <h1 className="mt-2 text-lg font-bold">{title}</h1>
      {subtitle && <div className="text-xs text-[#52514e]">{subtitle}</div>}
    </div>
  );
}

export function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4 break-inside-avoid">
      <div className="mb-1.5 bg-[#eceeec] px-2 py-1 text-xs font-bold tracking-wide uppercase">{title}</div>
      <div className="divide-y divide-[#e1e0d9] border border-[#e1e0d9]">{children}</div>
    </div>
  );
}

export function FormRow({ label, value, mono = false }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 px-2 py-1.5">
      <span className="text-[#52514e]">{label}</span>
      <span className={`text-right font-medium ${mono ? "tabular" : ""}`}>{value}</span>
    </div>
  );
}

export function FormAmountRow({ label, value, bold = false }: { label: string; value: number; bold?: boolean }) {
  return (
    <div className={`flex items-center justify-between gap-4 px-2 py-1.5 ${bold ? "bg-[#f5f6f4] font-bold" : ""}`}>
      <span className={bold ? "" : "text-[#52514e]"}>{label}</span>
      <span className="tabular text-right">{formatCurrency(value)}</span>
    </div>
  );
}

export function FormFootnote({ children }: { children: React.ReactNode }) {
  return <p className="mt-4 text-[11px] leading-snug text-[#71847a]">{children}</p>;
}
