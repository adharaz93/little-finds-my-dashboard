import type { Metrics, MetricSnapshot, MetricSource, Publication } from "./types";
import { isValidDate, sameMetrics } from "./capture";
import { uid } from "./utils";

// Performance history rules (P1b). Every function here is pure: it takes a publication and
// returns a new one. Nothing in this file runs on load; history only changes when the user
// captures, edits, removes or restores numbers.

/* ---------- ordering ---------- */

// Snapshots are ordered by the date the numbers were read (capturedOn), then by when they were
// entered (at). A snapshot whose capture date is unknown sorts before every dated one: its numbers
// can't be placed in time, so any dated capture is treated as newer. Unknown-date snapshots are
// ordered among themselves by `at`. Exact ties keep their stored order (later in the list = newer).
const dateKey = (s: MetricSnapshot) => (isValidDate(s.capturedOn) ? s.capturedOn : "");
export function compareSnapshots(a: MetricSnapshot, b: MetricSnapshot): number {
  return dateKey(a).localeCompare(dateKey(b)) || a.at.localeCompare(b.at);
}

// The newest snapshot that hasn't been removed, or null.
export function latestSnapshot(snapshots: readonly MetricSnapshot[]): MetricSnapshot | null {
  let best: MetricSnapshot | null = null;
  for (const s of snapshots) {
    if (s.deleted) continue;
    if (!best || compareSnapshots(s, best) >= 0) best = s;
  }
  return best;
}

// Current numbers follow history: the latest non-deleted snapshot sets metrics and metricsSource.
// With no snapshots at all the publication is returned unchanged, so numbers recorded before
// history was kept are never dropped. If every snapshot is removed, there are no current numbers.
export function applyLatest(p: Publication): Publication {
  if (p.snapshots.length === 0) return p;
  const latest = latestSnapshot(p.snapshots);
  return latest
    ? { ...p, metrics: structuredClone(latest.metrics), metricsSource: latest.source }
    : { ...p, metrics: null, metricsSource: null };
}

/* ---------- ids ---------- */

export type Options = { now?: string; makeId?: () => string };
const nowIso = (o: Options) => o.now ?? new Date().toISOString();
const newId = (o: Options, taken: Set<string>) => {
  const make = o.makeId ?? (() => `snap-${uid()}`);
  let id = make();
  while (taken.has(id)) id = make();
  taken.add(id);
  return id;
};

// Gives every snapshot a unique id. Existing ids are kept; a missing or repeated id gets a new one.
// Called as the first step of every write, so legacy snapshots get ids "when next written".
export function ensureSnapshotIds(p: Publication, o: Options = {}): Publication {
  const taken = new Set(p.snapshots.flatMap((s) => (s.id ? [s.id] : []))); // new ids never reuse these
  const seen = new Set<string>();
  let changed = false;
  const snapshots = p.snapshots.map((s) => {
    if (s.id && !seen.has(s.id)) {
      seen.add(s.id); // first holder keeps its id
      return s;
    }
    changed = true;
    return { ...s, id: newId(o, taken) };
  });
  return changed ? { ...p, snapshots } : p;
}

/* ---------- writes ---------- */

export const BEFORE_HISTORY_NOTE = "Recorded before history was kept";

export type CaptureInput = { metrics: Metrics; source: MetricSource; capturedOn: string; note?: string };

// Adds a capture. If the publication has numbers but no history yet (saved before snapshots
// existed), those numbers are first kept as a snapshot with an unknown date, so they stay in history.
export function addCapture(p: Publication, c: CaptureInput, o: Options = {}): Publication {
  if (!isValidDate(c.capturedOn)) throw new Error(`addCapture: invalid capturedOn ${JSON.stringify(c.capturedOn)}`);
  const at = nowIso(o);
  let base = p;
  if (p.snapshots.length === 0 && p.metrics) {
    base = { ...p, snapshots: [{ at, source: p.metricsSource ?? "manual", metrics: structuredClone(p.metrics), note: BEFORE_HISTORY_NOTE }] };
  }
  base = ensureSnapshotIds(base, o);
  const taken = new Set(base.snapshots.map((s) => s.id!));
  const snap: MetricSnapshot = { id: newId(o, taken), at, capturedOn: c.capturedOn, source: c.source, metrics: structuredClone(c.metrics) };
  if (c.note) snap.note = c.note;
  return applyLatest({ ...base, snapshots: [...base.snapshots, snap] });
}

export type EditInput = { metrics: Metrics; capturedOn?: string | null; note?: string | null };

// Corrects a capture in place. Its id, `at` and source never change. If the numbers change, the
// previous numbers are appended to `edits` first. capturedOn / note: undefined = leave as is,
// null or "" = clear. Throws if the id doesn't exist, so a mistaken edit never touches other data.
export function editCapture(p: Publication, id: string, e: EditInput, o: Options = {}): Publication {
  const base = ensureSnapshotIds(p, o);
  const i = base.snapshots.findIndex((s) => s.id === id);
  if (i < 0) throw new Error(`editCapture: no snapshot ${id}`);
  if (e.capturedOn && !isValidDate(e.capturedOn)) throw new Error(`editCapture: invalid capturedOn ${JSON.stringify(e.capturedOn)}`);
  const old = base.snapshots[i];
  const next: MetricSnapshot = { ...old, metrics: structuredClone(e.metrics) };
  if (!sameMetrics(old.metrics, e.metrics)) next.edits = [...(old.edits ?? []), { at: nowIso(o), metrics: structuredClone(old.metrics) }];
  if (e.capturedOn !== undefined) {
    if (e.capturedOn) next.capturedOn = e.capturedOn;
    else delete next.capturedOn;
  }
  if (e.note !== undefined) {
    if (e.note) next.note = e.note;
    else delete next.note;
  }
  const snapshots = [...base.snapshots];
  snapshots[i] = next;
  return applyLatest({ ...base, snapshots });
}

function setDeleted(p: Publication, id: string, deleted: boolean, o: Options): Publication {
  const base = ensureSnapshotIds(p, o);
  const i = base.snapshots.findIndex((s) => s.id === id);
  if (i < 0) throw new Error(`${deleted ? "removeCapture" : "restoreCapture"}: no snapshot ${id}`);
  const next: MetricSnapshot = { ...base.snapshots[i] };
  if (deleted) next.deleted = true;
  else delete next.deleted;
  const snapshots = [...base.snapshots];
  snapshots[i] = next;
  return applyLatest({ ...base, snapshots });
}

// Soft delete: the snapshot stays in storage (and in backups) with deleted: true.
export const removeCapture = (p: Publication, id: string, o: Options = {}) => setDeleted(p, id, true, o);
export const restoreCapture = (p: Publication, id: string, o: Options = {}) => setDeleted(p, id, false, o);
