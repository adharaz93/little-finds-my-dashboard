import type { ContentItem, Publication } from "./types";
import { migrateContent, type Quarantined } from "./migrate";

// "Last deleted" safety copy (P1d). One copy of the most recent deletion that held performance
// data, kept in its own key: never part of the v2 data, never in backup exports, never applied
// automatically. Every function here is pure apart from the explicit storage reads and writes.

export const KEY_LAST_DELETED = "lfm-studio-v2-last-deleted";

export type LastDeleted =
  | { kind: "content"; deletedAt: string; item: ContentItem }
  // One form save can remove several platforms: they are kept together and restored together.
  | { kind: "publications"; deletedAt: string; contentId: string; contentTitle: string; publications: Publication[] };

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/* ---------- what counts as performance history ---------- */

// Every capture counts, removed (soft-deleted) ones included: they are still restorable history.
export const captureCount = (p: Publication) => p.snapshots.length;
// Numbers saved before history was kept count too, even with no captures.
export const hasPerformanceData = (p: Publication) => p.snapshots.length > 0 || !!p.metrics;

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/* ---------- confirmation messages ---------- */

// Removing one platform in the content form. Nothing is deleted until the form is saved.
export function platformRemovalMessage(p: Publication): string {
  const n = captureCount(p);
  const what = n > 0 ? `its ${plural(n, "performance capture")}` : "its recorded performance numbers";
  return `Remove ${p.platform}? When you save, this ${p.platform} post and ${what} will be deleted. A recovery copy is kept on the Dashboard until your next deletion.`;
}

export const itemHasPerformanceData = (item: ContentItem) => item.publications.some(hasPerformanceData);

export function contentDeletionMessage(item: ContentItem): string {
  const posts = plural(item.publications.length, "platform post");
  // Nothing to recover: no copy is made, so none is promised (an existing copy is kept as it is).
  if (!itemHasPerformanceData(item)) return `Delete '${item.title}'? This will delete ${posts}. It has no performance data, so no recovery copy is needed.`;
  const captures = item.publications.reduce((s, p) => s + captureCount(p), 0);
  const what = captures > 0 ? plural(captures, "performance capture") : "its recorded performance numbers";
  return `Delete '${item.title}'? This will delete ${posts} and ${what}. A recovery copy will be available on the Dashboard until your next deletion.`;
}

/* ---------- reading and writing the copy ---------- */

// Publications that a save would remove and that hold performance data (before → after).
export function removedWithData(before: ContentItem | undefined, after: ContentItem): Publication[] {
  if (!before) return [];
  const kept = new Set(after.publications.map((p) => p.id));
  return before.publications.filter((p) => !kept.has(p.id) && hasPerformanceData(p));
}

// The copy a deletion needs, or null when it removes no performance data. Null means no copy is
// written, so an existing copy (which may hold real history) is never replaced by an empty one.
export function contentDeletionRecord(item: ContentItem, deletedAt: string): LastDeleted | null {
  return itemHasPerformanceData(item) ? { kind: "content", deletedAt, item: structuredClone(item) } : null;
}
export function publicationRemovalRecord(before: ContentItem | undefined, after: ContentItem, deletedAt: string): LastDeleted | null {
  const removed = removedWithData(before, after);
  // Every removed platform with data goes into one copy, so they are restored together.
  return before && removed.length ? { kind: "publications", deletedAt, contentId: before.id, contentTitle: before.title, publications: structuredClone(removed) } : null;
}

// Call before any destructive change. With no record there is nothing to protect: true, and storage
// is not touched. With a record, true only if it was written; on false the caller must stop.
export function commitRecoveryCopy(storage: StorageLike, record: LastDeleted | null): boolean {
  return record ? writeLastDeleted(storage, record) : true;
}

// Writes the copy. Returns false (and leaves any earlier copy untouched) if storage refuses it,
// so the caller can stop before deleting anything.
export function writeLastDeleted(storage: StorageLike, record: LastDeleted): boolean {
  try {
    storage.setItem(KEY_LAST_DELETED, JSON.stringify(record));
    return true;
  } catch {
    return false;
  }
}

// Same check as loading saved data: the copy is usable only if it reads back exactly as written.
// Anything else (tampered, truncated, wrong shape) is treated as absent, and left in storage untouched.
export function parseLastDeleted(raw: string | null): LastDeleted | null {
  if (!raw) return null;
  let d: unknown;
  try {
    d = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!d || typeof d !== "object") return null;
  const r = d as Record<string, unknown>;
  if (typeof r.deletedAt !== "string" || Number.isNaN(new Date(r.deletedAt).getTime())) return null;
  // Valid only if the normal loader accepts it with nothing set aside and nothing changed in value
  // (key order aside). The stored copy itself is what gets restored, so it stays exact.
  const valid = (items: unknown[]) => {
    const q: Quarantined[] = [];
    const out = migrateContent(items, q);
    return q.length === 0 && canonical(out) === canonical(items);
  };
  if (r.kind === "content") {
    return r.item && typeof r.item === "object" && valid([r.item]) ? { kind: "content", deletedAt: r.deletedAt, item: r.item as ContentItem } : null;
  }
  if (r.kind === "publications") {
    if (typeof r.contentId !== "string" || !r.contentId || typeof r.contentTitle !== "string") return null;
    if (!Array.isArray(r.publications) || r.publications.length === 0) return null;
    // Validate the publications inside a stand-in parent, using the normal loader rules.
    const shell = { id: r.contentId, title: r.contentTitle, pillar: "", idea: "", assetUrl: "", notes: "", publications: r.publications };
    return valid([shell])
      ? { kind: "publications", deletedAt: r.deletedAt, contentId: r.contentId, contentTitle: r.contentTitle, publications: r.publications as Publication[] }
      : null;
  }
  return null;
}

// JSON with object keys sorted, so two values compare equal regardless of key order.
function canonical(x: unknown): string {
  return JSON.stringify(x, (_k, v) => (v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, v[k]])) : v));
}

export function readLastDeleted(storage: Pick<Storage, "getItem">): LastDeleted | null {
  try {
    return parseLastDeleted(storage.getItem(KEY_LAST_DELETED));
  } catch {
    return null;
  }
}

/* ---------- restoring ---------- */

export type RestorePlan = { ok: true; content: ContentItem[]; message: string } | { ok: false; error: string };

// Works out the restored content list without changing anything. All or nothing: if any part
// can't be restored, nothing is.
export function planRestore(content: readonly ContentItem[], record: LastDeleted): RestorePlan {
  if (record.kind === "content") {
    const { item } = record;
    if (content.some((c) => c.id === item.id)) {
      return { ok: false, error: `'${item.title}' can't be restored: a content item with the same id already exists. Nothing was changed.` };
    }
    return { ok: true, content: [structuredClone(item), ...content], message: `Restored '${item.title}'.` };
  }
  const parent = content.find((c) => c.id === record.contentId);
  if (!parent) {
    return { ok: false, error: `The ${names(record.publications)} can't be restored: '${record.contentTitle}', the content it belonged to, no longer exists. Nothing was changed.` };
  }
  const ids = new Set(content.flatMap((c) => c.publications.map((p) => p.id)));
  const clash = record.publications.find((p) => ids.has(p.id));
  if (clash) return { ok: false, error: `The ${clash.platform} post can't be restored: a post with the same id already exists. Nothing was changed.` };
  // One post per platform: the form assumes it, so a platform added again since the deletion blocks the restore.
  const taken = record.publications.find((p) => parent.publications.some((x) => x.platform === p.platform));
  if (taken) return { ok: false, error: `'${parent.title}' already has a ${taken.platform} post, so the deleted one can't be restored. Remove the new ${taken.platform} post first if you want the old one back. Nothing was changed.` };
  const restored = { ...parent, publications: [...parent.publications, ...structuredClone(record.publications)] };
  return { ok: true, content: content.map((c) => (c.id === parent.id ? restored : c)), message: `Restored the ${names(record.publications)} of '${parent.title}'.` };
}

const names = (ps: readonly Publication[]) => {
  const list = ps.map((p) => p.platform);
  return `${list.length > 1 ? `${list.slice(0, -1).join(", ")} and ${list.at(-1)}` : list[0]} post${list.length > 1 ? "s" : ""}`;
};

// Short label for the restore link.
export function lastDeletedLabel(r: LastDeleted): string {
  const d = new Date(r.deletedAt);
  const when = d.toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  return r.kind === "content"
    ? `Restore '${r.item.title}' (content) — deleted ${when}`
    : `Restore ${names(r.publications)} of '${r.contentTitle}' — deleted ${when}`;
}
