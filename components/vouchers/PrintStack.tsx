"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";

// Prints several documents in one go, each starting on a new A4 page.
// Rendered straight into <body> so print CSS (.print-stack in globals.css)
// can hide the rest of the app and let the pages flow normally — unlike
// .bir-print-area, which is pinned to a single page.
export function PrintStack({ children, onDone }: { children: React.ReactNode; onDone: () => void }) {
  useEffect(() => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      onDone();
    };
    window.addEventListener("afterprint", finish);
    // Wait (up to 3 s) for images such as the signature before printing.
    const t = window.setTimeout(async () => {
      const imgs = Array.from(document.querySelectorAll<HTMLImageElement>(".print-stack img"));
      await Promise.race([Promise.all(imgs.map((img) => img.decode().catch(() => {}))), new Promise((r) => window.setTimeout(r, 3000))]);
      if (done) return;
      window.print();
      // Some browsers return from print() before firing afterprint.
      window.setTimeout(finish, 500);
    }, 50);
    return () => {
      done = true;
      window.clearTimeout(t);
      window.removeEventListener("afterprint", finish);
    };
  }, [onDone]);

  return createPortal(<div className="print-stack">{children}</div>, document.body);
}

export function PrintPage({ children }: { children: React.ReactNode }) {
  return <div className="print-stack-page">{children}</div>;
}
