"use client";

import { useEffect } from "react";

// Paste a copied photo (Ctrl+V / Cmd+V) anywhere in the HRIS and it goes to the
// photo upload you are working in — HR messages, announcements, news, leave
// attachments, case reports… — exactly as if it had been picked with the
// file chooser. Places that handle pasting themselves (team chat) are left alone.

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|bmp|heic|heif|avif)$/i;

function acceptsImages(input: HTMLInputElement): boolean {
  const accept = input.accept.trim().toLowerCase();
  if (!accept) return true;
  return accept.split(",").some((a) => {
    const t = a.trim();
    return t === "image/*" || t.startsWith("image/") || IMAGE_EXT.test(`x${t}`);
  });
}

function acceptsFile(input: HTMLInputElement, file: File): boolean {
  const accept = input.accept.trim().toLowerCase();
  if (!accept) return true;
  return accept.split(",").some((a) => {
    const t = a.trim();
    if (!t) return false;
    if (t.endsWith("/*")) return file.type.startsWith(t.slice(0, -1));
    if (t.startsWith(".")) return file.name.toLowerCase().endsWith(t) || (file.type === "image/jpeg" && (t === ".jpg" || t === ".jpeg")) || file.type === `image/${t.slice(1)}`;
    return file.type === t;
  });
}

// Usable: enabled, and on screen (its label or wrapper is showing).
function usable(input: HTMLInputElement): boolean {
  if (input.disabled) return false;
  const box = input.parentElement;
  return !!box && box.getClientRects().length > 0;
}

function candidates(root: ParentNode): HTMLInputElement[] {
  return [...root.querySelectorAll<HTMLInputElement>('input[type="file"]')].filter((i) => usable(i) && acceptsImages(i));
}

// The upload nearest to where the person is working: walk out from the focused
// element; with nothing focused, the open dialog, or the only upload on screen.
function findInput(target: EventTarget | null): HTMLInputElement | null {
  let el = (target instanceof Element ? target : document.activeElement) as Element | null;
  while (el && el !== document.body) {
    const found = candidates(el);
    if (found.length) return found[0];
    el = el.parentElement;
  }
  const dialogs = [...document.querySelectorAll('[role="dialog"], dialog[open]')];
  for (const d of dialogs.reverse()) {
    const found = candidates(d);
    if (found.length) return found[0];
  }
  const all = candidates(document);
  return all.length === 1 ? all[0] : null;
}

export function PastePhotos() {
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (e.defaultPrevented || !e.clipboardData) return;
      const images = [...e.clipboardData.files].filter((f) => f.type.startsWith("image/"));
      if (!images.length) return;
      const input = findInput(e.target);
      if (!input) return;
      const files = images.filter((f) => acceptsFile(input, f));
      if (!files.length) return;
      e.preventDefault();
      const dt = new DataTransfer();
      for (const f of input.multiple ? files : files.slice(0, 1)) {
        // Screenshots arrive as "image.png" — give them a clearer name.
        const name = /^image\.\w+$/i.test(f.name) ? `pasted-photo-${Date.now()}.${f.type.split("/")[1] || "png"}` : f.name;
        dt.items.add(name === f.name ? f : new File([f], name, { type: f.type }));
      }
      input.files = dt.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, []);
  return null;
}
