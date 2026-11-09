"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

/* eslint-disable @next/next/no-img-element -- photos from the company-media bucket */

// An article's photos: a grid; a photo opens full size, with next / previous
// (arrow keys, swipe) and Esc to close.
export function NewsGallery({ photos, title }: { photos: string[]; title: string }) {
  const [open, setOpen] = useState<number | null>(null);
  const [touch, setTouch] = useState<number | null>(null);
  const n = photos.length;
  const go = useCallback((d: number) => setOpen((i) => (i === null ? i : (i + d + n) % n)), [n]);
  useEffect(() => {
    if (open === null) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(null);
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
    };
    document.addEventListener("keydown", key);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", key);
      document.body.style.overflow = "";
    };
  }, [open, go]);
  if (!n) return null;
  return (
    <>
      <div className={`mt-8 grid gap-2 ${n === 1 ? "grid-cols-1" : n === 2 ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-3"}`}>
        {photos.map((src, i) => (
          <button key={src} onClick={() => setOpen(i)} className="group overflow-hidden rounded-lg bg-[#eef2f0]" aria-label={`Open photo ${i + 1} of ${n}`}>
            <img src={src} alt={`${title} — photo ${i + 1}`} loading="lazy" className={`w-full object-cover transition-transform duration-300 group-hover:scale-105 ${n === 1 ? "max-h-[520px]" : "aspect-[4/3]"}`} />
          </button>
        ))}
      </div>
      {open !== null && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Photo ${open + 1} of ${n}`}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
          onClick={() => setOpen(null)}
          onTouchStart={(e) => setTouch(e.touches[0].clientX)}
          onTouchEnd={(e) => {
            if (touch === null) return;
            const dx = e.changedTouches[0].clientX - touch;
            if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
            setTouch(null);
          }}
        >
          <img src={photos[open]} alt={`${title} — photo ${open + 1}`} className="max-h-[88vh] max-w-full rounded-lg object-contain" onClick={(e) => e.stopPropagation()} />
          <button onClick={() => setOpen(null)} className="absolute top-4 right-4 rounded-full bg-white/15 p-2 text-white hover:bg-white/25" aria-label="Close">
            <X size={22} />
          </button>
          {n > 1 && (
            <>
              <button onClick={(e) => (e.stopPropagation(), go(-1))} className="absolute top-1/2 left-3 -translate-y-1/2 rounded-full bg-white/15 p-2 text-white hover:bg-white/25" aria-label="Previous photo">
                <ChevronLeft size={26} />
              </button>
              <button onClick={(e) => (e.stopPropagation(), go(1))} className="absolute top-1/2 right-3 -translate-y-1/2 rounded-full bg-white/15 p-2 text-white hover:bg-white/25" aria-label="Next photo">
                <ChevronRight size={26} />
              </button>
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-sm text-white/80">
                {open + 1} / {n}
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
