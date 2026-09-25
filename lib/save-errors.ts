// A tiny app-wide channel for "your change wasn't saved" errors, so the data
// layer (lib/store.tsx) can surface a failed database write to whoever is
// using the app instead of only logging it to the browser console. Shown by
// components/SaveErrorToasts.tsx.

export interface SaveError {
  id: number;
  message: string;
  detail: string | null;
}

type Listener = (error: SaveError) => void;
const listeners = new Set<Listener>();
let nextId = 1;

export function reportSaveError(message: string, err?: unknown): void {
  console.error(message, err);
  const detail = err instanceof Error ? err.message : err && typeof err === "object" && "message" in err ? String((err as { message: unknown }).message) : null;
  const error = { id: nextId++, message, detail };
  listeners.forEach((l) => l(error));
}

export function onSaveError(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
