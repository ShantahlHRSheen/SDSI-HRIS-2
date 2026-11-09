"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

/* eslint-disable @next/next/no-img-element -- static slide images */

// The slides at the top of a company's website: they change every 6 seconds
// (not while hovered, or when the visitor prefers less motion), with arrows,
// dots and swiping on phones.
export function HeroSlider({ slides, color }: { slides: { src: string; alt: string }[]; color: string }) {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const touch = useRef<number | null>(null);
  const n = slides.length;
  const go = useCallback((k: number) => setI(((k % n) + n) % n), [n]);
  useEffect(() => {
    if (paused || n < 2 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => setI((x) => (x + 1) % n), 6000);
    return () => clearInterval(id);
  }, [paused, n]);

  return (
    <section
      className="relative w-full overflow-hidden bg-black"
      aria-roledescription="carousel"
      aria-label="Highlights"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={(e) => (touch.current = e.touches[0].clientX)}
      onTouchEnd={(e) => {
        if (touch.current === null) return;
        const dx = e.changedTouches[0].clientX - touch.current;
        if (Math.abs(dx) > 40) go(i + (dx < 0 ? 1 : -1));
        touch.current = null;
      }}
    >
      <div className="relative aspect-[16/9] max-h-[calc(100vh-4rem)] w-full">
        {slides.map((s, k) => (
          <img
            key={s.src}
            src={s.src}
            alt={s.alt}
            aria-hidden={k !== i}
            fetchPriority={k === 0 ? "high" : "auto"}
            loading={k === 0 ? "eager" : "lazy"}
            className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ${k === i ? "opacity-100" : "opacity-0"}`}
          />
        ))}
      </div>
      {n > 1 && (
        <>
          <button onClick={() => go(i - 1)} className="absolute top-1/2 left-2 hidden -translate-y-1/2 rounded-full sm:block bg-black/30 p-2 text-white backdrop-blur-sm hover:bg-black/50 sm:left-4" aria-label="Previous slide">
            <ChevronLeft size={22} />
          </button>
          <button onClick={() => go(i + 1)} className="absolute top-1/2 right-2 hidden -translate-y-1/2 rounded-full sm:block bg-black/30 p-2 text-white backdrop-blur-sm hover:bg-black/50 sm:right-4" aria-label="Next slide">
            <ChevronRight size={22} />
          </button>
          <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-2">
            {slides.map((s, k) => (
              <button key={s.src} onClick={() => go(k)} aria-label={`Slide ${k + 1}`} aria-current={k === i} className={`h-2.5 rounded-full transition-all ${k === i ? "w-7" : "w-2.5 bg-white/60"}`} style={k === i ? { background: color } : undefined} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
