import type { ContentItem, Metrics, MetricSnapshot, Publication } from "./types";
import { isValidDate, sameMetrics, METRIC_ORDER, type MetricKey } from "./capture";
import { compareSnapshots, latestSnapshot } from "./snapshots";
import { daysBetween } from "./analytics";
import { formatDate } from "./utils";

// Display helpers for performance history (P1c). Pure: they never change data.

// One snapshot as shown in a list. `index` is its position in publication.snapshots, which is how
// the UI addresses snapshots that don't have an id yet (legacy ones get it on the next write).
export type HistoryEntry = { snap: MetricSnapshot; index: number; key: string };

const entry = (snap: MetricSnapshot, index: number): HistoryEntry => ({ snap, index, key: snap.id ?? `legacy-${index}` });
const newestFirst = (a: HistoryEntry, b: HistoryEntry) => compareSnapshots(b.snap, a.snap) || b.index - a.index;

// Active dated captures (newest first), active captures with an unknown date, and removed ones.
export function displayOrder(snapshots: readonly MetricSnapshot[]) {
  const all = snapshots.map(entry);
  return {
    dated: all.filter((e) => !e.snap.deleted && isValidDate(e.snap.capturedOn)).sort(newestFirst),
    undated: all.filter((e) => !e.snap.deleted && !isValidDate(e.snap.capturedOn)).sort(newestFirst),
    removed: all.filter((e) => e.snap.deleted).sort(newestFirst),
  };
}

// Days since publication in local calendar days; the publish day is Day 0. Null when either date
// is unknown: never guessed from the scheduled date.
export function dayN(capturedOn: string | undefined, publishedDate: string | undefined): number | null {
  if (!isValidDate(capturedOn) || !isValidDate(publishedDate)) return null;
  return daysBetween(publishedDate, capturedOn);
}

// Each edit as the fields that changed, oldest edit first. `at` is when the change was made.
export type EditChange = { key: MetricKey; from: number | null; to: number | null };
export function editDiffs(s: MetricSnapshot): { at: string; changes: EditChange[] }[] {
  const edits = s.edits ?? [];
  const versions: Metrics[] = [...edits.map((e) => e.metrics), s.metrics];
  return edits.map((e, i) => ({
    at: e.at,
    changes: METRIC_ORDER.flatMap((key) => {
      const from = versions[i][key] ?? null, to = versions[i + 1][key] ?? null;
      return from === to ? [] : [{ key, from, to }];
    }),
  }));
}

// An active capture for the same date with the same numbers (to warn, not block). `exceptIndex`
// skips the capture being edited.
export function findDuplicate(snapshots: readonly MetricSnapshot[], capturedOn: string, metrics: Metrics, exceptIndex = -1): MetricSnapshot | null {
  return snapshots.find((s, i) => i !== exceptIndex && !s.deleted && s.capturedOn === capturedOn && sameMetrics(s.metrics, metrics)) ?? null;
}

// The date a capture can have: required for new captures, not in the future, not before posting.
export function captureDateError(capturedOn: string, publishedDate: string, today: string, required = true): string | null {
  if (capturedOn === "") return required ? "Enter the date you read these numbers." : null;
  if (!isValidDate(capturedOn)) return "Enter a valid date.";
  if (capturedOn > today) return "Can't be in the future.";
  if (isValidDate(publishedDate) && capturedOn < publishedDate) return `Can't be before the post was published (${formatDate(publishedDate)}).`;
  return null;
}

// Publications worth listing in the history overview: posted, or with numbers or history.
export const hasPerformance = (p: Publication) => p.status === "Posted" || !!p.metrics || p.snapshots.length > 0;

export type PublicationSummary = { pub: Publication; latest: MetricSnapshot | null; active: number; removed: number };
export type HistoryGroup = { item: ContentItem; pubs: PublicationSummary[] };

// Most recent known date for a publication: latest capture, published or scheduled date.
const lastActivity = (p: Publication) =>
  [latestSnapshot(p.snapshots)?.capturedOn, p.publishedDate, p.scheduledDate].filter(isValidDate).sort().at(-1) ?? "";

// Content → its publications with history counts, most recent activity first.
// YYYY-MM-DD strings compare correctly as text.
export function historyGroups(content: readonly ContentItem[], platform = "All"): HistoryGroup[] {
  const groups = content
    .map((item) => ({
      item,
      pubs: item.publications
        .filter((p) => hasPerformance(p) && (platform === "All" || p.platform === platform))
        .map((pub) => ({ pub, latest: latestSnapshot(pub.snapshots), active: pub.snapshots.filter((s) => !s.deleted).length, removed: pub.snapshots.filter((s) => s.deleted).length })),
    }))
    .filter((g) => g.pubs.length > 0);
  const recent = (g: HistoryGroup) => g.pubs.map((x) => lastActivity(x.pub)).sort().at(-1) ?? "";
  return groups.sort((a, b) => recent(b).localeCompare(recent(a)));
}
