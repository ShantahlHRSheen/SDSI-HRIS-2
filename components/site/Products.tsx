/* eslint-disable @next/next/no-img-element -- static product pictures */

// "Our Products" on a company's website (lib/companies.ts siteProducts).
export function Products({ items, t, eyebrow }: { items: { src: string; alt: string; name?: string; wide?: boolean }[]; t: { deep: string; mid: string; accent: string }; eyebrow?: string }) {
  // Full width: the first picture and banners; the rest: a gallery.
  const wide = items.filter((p, i) => i === 0 || p.wide);
  const rest = items.filter((p, i) => i > 0 && !p.wide);
  return (
    <section id="products" className="scroll-mt-20 bg-white py-14">
      <div className="mx-auto max-w-6xl px-4">
        <div className="text-center">
          {eyebrow && (
            <p className="text-xs font-semibold tracking-[0.25em] uppercase" style={{ color: t.mid }}>
              {eyebrow}
            </p>
          )}
          <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-[var(--text-primary)] sm:text-4xl">Our Products</h2>
          <div className="mx-auto mt-3 h-1 w-14 rounded-full" style={{ background: t.mid }} />
          <p className="mx-auto mt-4 max-w-2xl text-[var(--text-secondary)]">Premier health, wellness and beauty products — recognized by award-giving bodies here and abroad.</p>
        </div>
        {wide.map((p) => (
          <figure key={p.src} className="mt-8 overflow-hidden rounded-3xl border border-[var(--border-hairline)] shadow-md">
            <img src={p.src} alt={p.alt} className="block w-full" loading="lazy" />
          </figure>
        ))}
        {rest.length > 0 && (
          <div className="mt-8 flex flex-wrap justify-center gap-4">
            {rest.map((p) => (
              <figure key={p.src} className="group w-[calc(50%-0.5rem)] overflow-hidden sm:w-72 rounded-2xl border border-[var(--border-hairline)] bg-white shadow-sm transition-shadow hover:shadow-md">
                <div className="aspect-square overflow-hidden bg-[#f6f8f7]">
                  <img src={p.src} alt={p.alt} loading="lazy" className="h-full w-full object-contain transition-transform duration-300 group-hover:scale-105" />
                </div>
                {p.name && <figcaption className="px-3 py-2.5 text-center text-sm font-semibold text-[var(--text-primary)]">{p.name}</figcaption>}
              </figure>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
