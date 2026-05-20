const PREFIX = "result-draft:";
const MAX_AGE_MS = 7 * 24 * 3600 * 1000;

type Stored<T> = { savedAt: number; payload: T };

export function saveDraft<T>(visitTestId: string, payload: T): void {
  const stored: Stored<T> = { savedAt: Date.now(), payload };
  try { localStorage.setItem(PREFIX + visitTestId, JSON.stringify(stored)); } catch { /* quota / no-storage */ }
}

export function loadDraft<T>(visitTestId: string): Stored<T> | null {
  const raw = localStorage.getItem(PREFIX + visitTestId);
  if (!raw) return null;
  try { return JSON.parse(raw) as Stored<T>; } catch { return null; }
}

export function clearDraft(visitTestId: string): void {
  localStorage.removeItem(PREFIX + visitTestId);
}

export function evictOldDrafts(): void {
  const cutoff = Date.now() - MAX_AGE_MS;
  const toRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key?.startsWith(PREFIX)) continue;
    try {
      const v = JSON.parse(localStorage.getItem(key) ?? "{}") as Stored<unknown>;
      if (typeof v.savedAt !== "number" || v.savedAt < cutoff) toRemove.push(key);
    } catch {
      toRemove.push(key);
    }
  }
  toRemove.forEach(k => localStorage.removeItem(k));
}
