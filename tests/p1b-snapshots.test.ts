import { test } from "node:test";
import assert from "node:assert/strict";
import { KEY_V2, loadState, migrateContent, readBackup, serialize, type Quarantined } from "../src/lib/migrate";
import {
  BEFORE_HISTORY_NOTE, addCapture, applyLatest, compareSnapshots, editCapture, ensureSnapshotIds, latestSnapshot, removeCapture, restoreCapture,
} from "../src/lib/snapshots";
import { flattenPosts } from "../src/lib/posts";
import { measured, totals } from "../src/lib/analytics";
import { DEMO_CONTENT } from "../src/lib/demo-data";
import type { ContentItem, Metrics, MetricSnapshot, Publication } from "../src/lib/types";

const M = (reach: number, likes = 10, over: Partial<Metrics> = {}): Metrics => ({ reach, impressions: null, likes, comments: 1, shares: 0, saves: null, ...over });
const pub = (snapshots: unknown[] = [], over: Record<string, unknown> = {}) => ({
  id: "p1", platform: "Instagram", caption: "", status: "Posted", scheduledDate: "2026-11-10", publishedDate: "2026-11-10", postUrl: "", postId: "",
  metrics: null, metricsSource: null, lastSyncedAt: null, snapshots, ...over,
});
const item = (p: unknown, over: Record<string, unknown> = {}) => ({ id: "c1", title: "Mine", pillar: "Promo", idea: "", assetUrl: "", notes: "", publications: [p], ...over });
const load = (p: unknown, q: Quarantined[] = []) => migrateContent([item(p)], q)[0].publications[0];
const seq = (prefix = "id") => { let n = 0; return () => `${prefix}${++n}`; };
const T1 = "2026-11-20T02:00:00.000Z", T2 = "2026-11-21T02:00:00.000Z", T3 = "2026-11-22T02:00:00.000Z";

/* ---------- legacy snapshots ---------- */

test("legacy snapshots without new fields load unchanged and get no id on load", () => {
  const legacy = { at: T1, source: "manual", metrics: M(100) };
  const p = load(pub([legacy], { metrics: M(100), metricsSource: "manual" }));
  assert.deepEqual(p.snapshots, [legacy]);
  assert.equal("id" in p.snapshots[0], false);
  assert.deepEqual(p.metrics, M(100));
});

test("loading never changes current numbers, even if they differ from history", () => {
  // Rule 13: no recalculation on load. Numbers recorded outside history stay as stored.
  const p = load(pub([{ at: T1, source: "manual", metrics: M(100) }], { metrics: M(500), metricsSource: "manual" }));
  assert.equal(p.metrics?.reach, 500);
});

/* ---------- ids ---------- */

test("legacy snapshots get stable unique ids on the next write, and keep them", () => {
  const p = load(pub([{ at: T1, source: "manual", metrics: M(100) }, { at: T2, source: "manual", metrics: M(200) }], { metrics: M(200), metricsSource: "manual" }));
  const a = addCapture(p, { metrics: M(300), source: "manual", capturedOn: "2026-11-25" }, { now: T3, makeId: seq() });
  const ids = a.snapshots.map((s) => s.id);
  assert.deepEqual(ids, ["id1", "id2", "id3"]);
  const b = addCapture(a, { metrics: M(400), source: "manual", capturedOn: "2026-11-26" }, { now: T3, makeId: seq("x") });
  assert.deepEqual(b.snapshots.slice(0, 3).map((s) => s.id), ids, "existing ids never change");
  assert.equal(new Set(b.snapshots.map((s) => s.id)).size, 4);
});

test("duplicate and colliding ids are resolved without touching the first holder", () => {
  const p = { ...load(pub([{ id: "a", at: T1, source: "manual", metrics: M(1) }, { id: "a", at: T2, source: "manual", metrics: M(2) }, { at: T3, source: "manual", metrics: M(3) }])) };
  const ids = ["a", "a", "b"]; // the generator first offers ids that are already taken
  const fixed = ensureSnapshotIds(p, { makeId: () => ids.shift() ?? "c" });
  assert.deepEqual(fixed.snapshots.map((s) => s.id), ["a", "b", "c"]);
  assert.equal(ensureSnapshotIds(fixed), fixed, "nothing to do returns the same object");
});

test("default ids are generated and unique", () => {
  let p: Publication = load(pub());
  for (let i = 0; i < 50; i++) p = addCapture(p, { metrics: M(i), source: "manual", capturedOn: "2026-11-25" });
  assert.equal(new Set(p.snapshots.map((s) => s.id)).size, 50);
  assert.ok(p.snapshots.every((s) => /^snap-/.test(s.id!)));
});

/* ---------- captured date ---------- */

test("valid capturedOn is kept; addCapture rejects an invalid one", () => {
  const p = load(pub([{ at: T1, capturedOn: "2026-11-20", source: "manual", metrics: M(1) }]));
  assert.equal(p.snapshots[0].capturedOn, "2026-11-20");
  assert.throws(() => addCapture(p, { metrics: M(2), source: "manual", capturedOn: "2026-02-30" }), /invalid capturedOn/);
  assert.throws(() => addCapture(p, { metrics: M(2), source: "manual", capturedOn: "" }), /invalid capturedOn/);
});

test("an invalid capturedOn is set aside; the snapshot is kept with its date unknown", () => {
  for (const bad of ["2026-13-01", "26/11/2026", 20261126, { d: 1 }]) {
    const q: Quarantined[] = [];
    const p = load(pub([{ at: T1, capturedOn: bad, source: "manual", metrics: M(7) }]), q);
    assert.equal(p.snapshots.length, 1);
    assert.equal(p.snapshots[0].capturedOn, undefined);
    assert.equal(p.snapshots[0].metrics.reach, 7);
    assert.equal(q.length, 1);
    assert.equal(q[0].field, "snapshot.capturedOn");
    assert.deepEqual(q[0].value, { snapshotAt: T1, capturedOn: bad });
  }
  const q: Quarantined[] = [];
  load(pub([{ at: T1, capturedOn: "", source: "manual", metrics: M(7) }]), q);
  assert.equal(q.length, 0, "blank means unknown, not an error");
});

/* ---------- edits ---------- */

test("editing keeps id, original at and source, and appends the previous numbers", () => {
  let p: Publication = addCapture(load(pub()), { metrics: M(100), source: "manual", capturedOn: "2026-11-20" }, { now: T1, makeId: () => "s1" });
  p = editCapture(p, "s1", { metrics: M(120) }, { now: T2 });
  p = editCapture(p, "s1", { metrics: M(125, 11) }, { now: T3 });
  const s = p.snapshots[0];
  assert.equal(s.id, "s1");
  assert.equal(s.at, T1, "original entry time preserved");
  assert.equal(s.source, "manual");
  assert.equal(s.capturedOn, "2026-11-20");
  assert.deepEqual(s.metrics, M(125, 11));
  assert.deepEqual(s.edits, [{ at: T2, metrics: M(100) }, { at: T3, metrics: M(120) }]);
  assert.deepEqual(p.metrics, M(125, 11), "current numbers follow the edit");
  assert.equal(p.snapshots.length, 1, "an edit is not a new capture");
});

test("editing only the date or note adds no edit entry; null clears them", () => {
  let p: Publication = addCapture(load(pub()), { metrics: M(100), source: "manual", capturedOn: "2026-11-20", note: "IG Insights" }, { now: T1, makeId: () => "s1" });
  p = editCapture(p, "s1", { metrics: M(100), capturedOn: "2026-11-21", note: "Meta Business Suite" }, { now: T2 });
  assert.equal(p.snapshots[0].edits, undefined);
  assert.equal(p.snapshots[0].capturedOn, "2026-11-21");
  assert.equal(p.snapshots[0].note, "Meta Business Suite");
  p = editCapture(p, "s1", { metrics: M(100), capturedOn: null, note: null }, { now: T2 });
  assert.equal("capturedOn" in p.snapshots[0], false);
  assert.equal("note" in p.snapshots[0], false);
});

test("editing an unknown id or with an invalid date throws and changes nothing", () => {
  const p = addCapture(load(pub()), { metrics: M(1), source: "manual", capturedOn: "2026-11-20" }, { makeId: () => "s1" });
  const before = JSON.stringify(p);
  assert.throws(() => editCapture(p, "nope", { metrics: M(2) }), /no snapshot/);
  assert.throws(() => editCapture(p, "s1", { metrics: M(2), capturedOn: "2026-02-30" }), /invalid capturedOn/);
  assert.equal(JSON.stringify(p), before);
});

test("invalid edit entries are set aside one by one; valid ones and the snapshot are kept", () => {
  const q: Quarantined[] = [];
  const edits = [{ at: T1, metrics: M(90) }, { at: T2 }, "junk", { at: 5, metrics: M(1) }, { at: T2, metrics: M(95) }];
  const p = load(pub([{ id: "s1", at: T1, source: "manual", metrics: M(100), edits }]), q);
  assert.deepEqual(p.snapshots[0].edits, [{ at: T1, metrics: M(90) }, { at: T2, metrics: M(95) }]);
  assert.equal(p.snapshots[0].metrics.reach, 100);
  assert.equal(q.filter((x) => x.field === "snapshot.edits").length, 3);
  const q2: Quarantined[] = [];
  const p2 = load(pub([{ at: T1, source: "manual", metrics: M(100), edits: "not a list" }]), q2);
  assert.equal(p2.snapshots[0].edits, undefined);
  assert.equal(q2.length, 1);
});

/* ---------- soft delete ---------- */

test("removing hides a capture from current numbers but keeps it; restoring brings it back", () => {
  let p: Publication = load(pub());
  p = addCapture(p, { metrics: M(100), source: "manual", capturedOn: "2026-11-20" }, { now: T1, makeId: () => "a" });
  p = addCapture(p, { metrics: M(200), source: "manual", capturedOn: "2026-11-25" }, { now: T2, makeId: () => "b" });
  p = removeCapture(p, "b");
  assert.equal(p.snapshots.length, 2, "never erased");
  assert.equal(p.snapshots[1].deleted, true);
  assert.equal(p.metrics?.reach, 100, "falls back to the latest remaining capture");
  p = restoreCapture(p, "b");
  assert.equal("deleted" in p.snapshots[1], false);
  assert.equal(p.metrics?.reach, 200);
});

test("removing every capture leaves no current numbers; nothing becomes zero", () => {
  let p: Publication = addCapture(load(pub()), { metrics: M(100), source: "manual", capturedOn: "2026-11-20" }, { makeId: () => "a" });
  p = removeCapture(p, "a");
  assert.equal(p.metrics, null);
  assert.equal(p.metricsSource, null);
  assert.equal(p.snapshots.length, 1);
});

test("an unreadable deleted flag keeps the snapshot visible and is set aside", () => {
  const q: Quarantined[] = [];
  const p = load(pub([{ at: T1, source: "manual", metrics: M(1), deleted: "yes" }, { at: T2, source: "manual", metrics: M(2), deleted: false }]), q);
  assert.equal("deleted" in p.snapshots[0], false);
  assert.equal("deleted" in p.snapshots[1], false);
  assert.equal(q.length, 1);
  assert.equal(q[0].field, "snapshot.deleted");
});

/* ---------- latest selection ---------- */

test("latest = newest capturedOn, then newest at; deleted ones are skipped", () => {
  const s = (capturedOn: string | undefined, at: string, reach: number, deleted?: true): MetricSnapshot => ({ at, capturedOn, source: "manual", metrics: M(reach), ...(deleted ? { deleted } : {}) });
  // Entered later but read earlier: the later capture date wins.
  assert.equal(latestSnapshot([s("2026-11-25", T1, 1), s("2026-11-20", T3, 2)])?.metrics.reach, 1);
  // Same capture date: later entry wins.
  assert.equal(latestSnapshot([s("2026-11-25", T2, 1), s("2026-11-25", T1, 2)])?.metrics.reach, 1);
  // Unknown dates count as older than any dated capture, and are ordered by at among themselves.
  assert.equal(latestSnapshot([s(undefined, T3, 1), s("2026-01-01", T1, 2)])?.metrics.reach, 2);
  assert.equal(latestSnapshot([s(undefined, T3, 1), s(undefined, T1, 2)])?.metrics.reach, 1);
  // Deleted newest is skipped.
  assert.equal(latestSnapshot([s("2026-11-20", T1, 1), s("2026-11-25", T2, 2, true)])?.metrics.reach, 1);
  // Exact tie: later in the list wins.
  assert.equal(latestSnapshot([s("2026-11-25", T1, 1), s("2026-11-25", T1, 2)])?.metrics.reach, 2);
  assert.equal(latestSnapshot([]), null);
  assert.ok(compareSnapshots(s(undefined, T3, 0), s("2026-01-01", T1, 0)) < 0);
});

test("current source follows the latest capture", () => {
  let p: Publication = load(pub());
  p = addCapture(p, { metrics: M(1), source: "manual", capturedOn: "2026-11-20" });
  p = addCapture(p, { metrics: M(2), source: "synced", capturedOn: "2026-11-21" });
  assert.equal(p.metricsSource, "synced");
});

test("numbers recorded before history are kept as an unknown-date snapshot on the first capture", () => {
  const p = load(pub([], { metrics: M(500, 40), metricsSource: "manual" }));
  assert.equal(applyLatest(p), p, "no history: nothing changes");
  const a = addCapture(p, { metrics: M(600, 50), source: "manual", capturedOn: "2026-11-25" }, { now: T2, makeId: seq() });
  assert.equal(a.snapshots.length, 2);
  assert.deepEqual(a.snapshots[0], { id: "id1", at: T2, source: "manual", metrics: M(500, 40), note: BEFORE_HISTORY_NOTE });
  assert.equal(a.metrics?.reach, 600);
});

/* ---------- missing metrics ---------- */

test("missing metrics stay null through capture, edit, history and reload", () => {
  const m: Metrics = { reach: 10, impressions: null, likes: 1, comments: 0, shares: 0, saves: null, clicks: null };
  let p: Publication = addCapture(load(pub()), { metrics: m, source: "manual", capturedOn: "2026-11-20" }, { now: T1, makeId: () => "s1" });
  p = editCapture(p, "s1", { metrics: { ...m, likes: 2 } }, { now: T2 });
  for (const x of [p.metrics!, p.snapshots[0].metrics, p.snapshots[0].edits![0].metrics]) {
    assert.equal(x.impressions, null);
    assert.equal(x.saves, null);
    assert.equal(x.clicks, null);
  }
  const reloaded = load(JSON.parse(JSON.stringify(p)));
  assert.equal(reloaded.snapshots[0].edits![0].metrics.saves, null);
  assert.equal(totals(measured(flattenPosts([item(reloaded) as ContentItem]), "real")).saves, null, "analytics still reports 'not reported'");
});

test("a snapshot with missing core numbers is set aside whole, never filled with zeros", () => {
  const q: Quarantined[] = [];
  const p = load(pub([{ at: T1, source: "manual", metrics: { reach: 10, likes: 1 } }]), q);
  assert.equal(p.snapshots.length, 0);
  assert.equal(q[0].kind, "snapshot");
});

/* ---------- demo ---------- */

test("demo captures stay demo and out of real analytics", () => {
  const demo = structuredClone(DEMO_CONTENT[0]);
  demo.publications[0] = addCapture(demo.publications[0], { metrics: M(9999, 999), source: "demo", capturedOn: "2026-11-25" }, { now: T1 });
  const [reloaded] = migrateContent([JSON.parse(JSON.stringify(demo))]);
  assert.equal(reloaded.isDemo, true);
  assert.equal(reloaded.publications[0].metricsSource, "demo");
  assert.ok(reloaded.publications[0].snapshots.every((s) => s.source === "demo"));
  const posts = flattenPosts([reloaded]);
  assert.equal(measured(posts, "real").length, 0);
  assert.ok(measured(posts, "demo").some((p) => p.metrics?.reach === 9999));
});

/* ---------- backup ---------- */

test("backup export/import preserves every new field byte for byte", () => {
  let p: Publication = load(pub([{ at: T1, source: "manual", metrics: M(50) }], { metrics: M(50), metricsSource: "manual" }));
  p = addCapture(p, { metrics: M(100), source: "manual", capturedOn: "2026-11-20", note: "IG Insights" }, { now: T2, makeId: seq() });
  p = editCapture(p, "id2", { metrics: M(110) }, { now: T3 });
  p = removeCapture(p, "id1");
  const raw = serialize([item(p) as ContentItem], [], []);
  const b = readBackup(raw)!;
  assert.equal(b.unreadable, 0);
  assert.equal(serialize(b.content, b.assets!, b.quarantine), raw);
  const s = b.content[0].publications[0].snapshots;
  assert.deepEqual(s.map((x) => [x.id, x.capturedOn, x.note, x.deleted, x.edits?.length]), [
    ["id1", undefined, undefined, true, undefined],
    ["id2", "2026-11-20", "IG Insights", undefined, 1],
  ]);
});

test("backups and saves from before P1b still load and restore", () => {
  const old = JSON.stringify({ version: 2, content: [item(pub([{ at: T1, source: "manual", metrics: M(5) }], { metrics: M(5), metricsSource: "manual" }))], assets: [] });
  const b = readBackup(old)!;
  assert.equal(b.unreadable, 0);
  assert.equal(serialize(b.content, b.assets!, b.quarantine), old, "re-exports byte for byte");
  const r = loadState({ getItem: (k) => (k === KEY_V2 ? old : null), setItem: () => {} });
  assert.equal(r.source, "v2");
  assert.deepEqual(r.content[0].publications[0].snapshots, [{ at: T1, source: "manual", metrics: M(5) }]);
});

test("storage version stays 2", () => {
  assert.equal(JSON.parse(serialize([], [], [])).version, 2);
});
