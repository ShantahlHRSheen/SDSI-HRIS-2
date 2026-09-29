"use client";

import { useEffect, useRef } from "react";

// A small, dependency-free emoji picker for the chat box.
const GROUPS: { label: string; emojis: string[] }[] = [
  {
    label: "Smileys",
    emojis: [
      "😀",
      "😃",
      "😄",
      "😁",
      "😆",
      "😅",
      "😂",
      "🤣",
      "😊",
      "🙂",
      "😉",
      "😍",
      "🥰",
      "😘",
      "😋",
      "😎",
      "🤗",
      "🤔",
      "😐",
      "😴",
      "😌",
      "😮",
      "😯",
      "😲",
      "🥺",
      "😢",
      "😭",
      "😤",
      "😡",
      "😳",
      "😬",
      "🙄",
      "😷",
      "🤒",
      "🤧",
      "🥳",
    ],
  },
  { label: "Gestures", emojis: ["👍", "👎", "👌", "✌️", "🤞", "👏", "🙌", "🙏", "💪", "👋", "🤝", "✋", "👉", "👈", "☝️", "🫶"] },
  { label: "Hearts & symbols", emojis: ["❤️", "🧡", "💛", "💚", "💙", "💜", "🤍", "💖", "💯", "✅", "❌", "⚠️", "⭐", "✨", "🔥", "💡"] },
  { label: "Celebrate & work", emojis: ["🎉", "🎊", "🎂", "🎁", "🏆", "🥇", "📅", "⏰", "📝", "📄", "📎", "💼", "🏢", "💰", "🚗", "☕", "🍔", "🌧️", "☀️", "🏥"] },
];

export function EmojiPicker({ onPick, onClose }: { onPick: (emoji: string) => void; onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function outside(e: MouseEvent | TouchEvent) {
      if (box.current && !box.current.contains(e.target as Node)) onClose();
    }
    function esc(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", outside);
    document.addEventListener("touchstart", outside);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", outside);
      document.removeEventListener("touchstart", outside);
      document.removeEventListener("keydown", esc);
    };
  }, [onClose]);

  return (
    <div
      ref={box}
      role="dialog"
      aria-label="Emoji picker"
      className="absolute bottom-full left-0 z-20 mb-2 w-72 rounded-xl border border-[var(--border-hairline)] bg-[var(--surface-1)] p-2 shadow-lg"
    >
      <div className="max-h-64 overflow-y-auto">
        {GROUPS.map((g) => (
          <div key={g.label} className="mb-1.5">
            <div className="px-1 pb-1 text-[10px] font-semibold tracking-wide text-[var(--text-muted)] uppercase">{g.label}</div>
            <div className="grid grid-cols-8 gap-0.5">
              {g.emojis.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => onPick(e)}
                  className="flex h-8 w-8 items-center justify-center rounded-md text-xl hover:bg-[var(--gridline)]/50"
                  aria-label={`Insert ${e}`}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
