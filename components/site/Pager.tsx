import Link from "next/link";

// Numbered pages: ‹ Previous 1 … 4 5 6 … 12 Next ›
export function Pager({ page, pages, href, color = "#0b6b45" }: { page: number; pages: number; href: (p: number) => string; color?: string }) {
  if (pages <= 1) return null;
  const nums = Array.from({ length: pages }, (_, i) => i + 1).filter((n) => n === 1 || n === pages || Math.abs(n - page) <= 1);
  const box = "rounded-md border border-[var(--border-hairline)] bg-white px-3 py-1.5 text-sm";
  return (
    <nav className="mt-10 flex flex-wrap items-center justify-center gap-1.5" aria-label="Pages">
      {page > 1 && (
        <Link href={href(page - 1)} className={box}>
          ‹ Previous
        </Link>
      )}
      {nums.map((n, i) => (
        <span key={n} className="flex items-center gap-1.5">
          {i > 0 && n - nums[i - 1] > 1 && <span className="px-1 text-[var(--text-muted)]">…</span>}
          <Link href={href(n)} aria-current={n === page ? "page" : undefined} className={`min-w-9 text-center ${box} ${n === page ? "font-semibold text-white" : ""}`} style={n === page ? { background: color, borderColor: color } : undefined}>
            {n}
          </Link>
        </span>
      ))}
      {page < pages && (
        <Link href={href(page + 1)} className={box}>
          Next ›
        </Link>
      )}
    </nav>
  );
}
