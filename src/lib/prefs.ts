import { isValidDate } from "./capture";
import { daysBetween } from "./analytics";

// Local preferences (Phase 2 P3): which suggestions were dismissed and when. Its own key, never part
// of the lfm-studio-v2 data or backups. Reading and writing never throw.

export const KEY_PREFS = "lfm-studio-prefs";
export const SNOOZE_DAYS = 30; // a dismissed suggestion can come back after this many days

export type Prefs = { dismissed: Record<string, string> }; // suggestion id → local date dismissed
export const EMPTY_PREFS: Prefs = { dismissed: {} };

type StorageLike = Pick<Storage, "getItem" | "setItem">;

// Unreadable or malformed values fall back to no dismissals; invalid entries are dropped.
export function parsePrefs(raw: string | null): Prefs {
  try {
    const d: unknown = raw ? JSON.parse(raw) : null;
    if (!d || typeof d !== "object" || Array.isArray(d)) return { dismissed: {} };
    const dis = (d as { dismissed?: unknown }).dismissed;
    if (!dis || typeof dis !== "object" || Array.isArray(dis)) return { dismissed: {} };
    const dismissed: Record<string, string> = {};
    for (const [id, date] of Object.entries(dis as Record<string, unknown>)) if (id && isValidDate(date)) dismissed[id] = date;
    return { dismissed };
  } catch {
    return { dismissed: {} };
  }
}

export function readPrefs(storage: Pick<Storage, "getItem">): Prefs {
  try {
    return parsePrefs(storage.getItem(KEY_PREFS));
  } catch {
    return { dismissed: {} };
  }
}

export function writePrefs(storage: StorageLike, prefs: Prefs): boolean {
  try {
    storage.setItem(KEY_PREFS, JSON.stringify(prefs));
    return true;
  } catch {
    return false;
  }
}

// Dismissed less than SNOOZE_DAYS ago (by local date).
export function isSnoozed(prefs: Prefs, id: string, today: string): boolean {
  const at = prefs.dismissed[id];
  return !!at && isValidDate(today) && daysBetween(at, today) < SNOOZE_DAYS;
}

// Records a dismissal and drops entries old enough to have expired, so the key stays small.
export function dismiss(prefs: Prefs, id: string, today: string): Prefs {
  const dismissed: Record<string, string> = {};
  for (const [k, at] of Object.entries(prefs.dismissed)) if (daysBetween(at, today) < SNOOZE_DAYS) dismissed[k] = at;
  dismissed[id] = today;
  return { dismissed };
}
