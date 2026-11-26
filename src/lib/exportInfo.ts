// "Last exported" indicator (P1d Task 6). The time of the last successful backup export, kept in
// its own key: never part of the lfm-studio-v2 data, so it never appears in backup files and the
// backup format is unchanged. Reading and writing never throw.

export const KEY_LAST_EXPORT = "lfm-studio-last-export";

type StorageLike = Pick<Storage, "getItem" | "setItem">;

// A stored value is usable only if it is a valid ISO timestamp; anything else counts as "never".
export function parseLastExport(raw: string | null): string | null {
  if (!raw || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/.test(raw)) return null;
  return Number.isNaN(new Date(raw).getTime()) ? null : raw;
}

export function readLastExport(storage: Pick<Storage, "getItem">): string | null {
  try {
    return parseLastExport(storage.getItem(KEY_LAST_EXPORT));
  } catch {
    return null;
  }
}

// Returns false if storage refuses the write; the export itself still happened.
export function writeLastExport(storage: StorageLike, iso: string): boolean {
  try {
    storage.setItem(KEY_LAST_EXPORT, iso);
    return true;
  } catch {
    return false;
  }
}

// Shown in the visitor's local time, e.g. "Last exported: 27 Nov 2026, 14:05".
export function lastExportLabel(iso: string | null): string {
  if (!iso) return "Last exported: never";
  const when = new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  return `Last exported: ${when}`;
}
