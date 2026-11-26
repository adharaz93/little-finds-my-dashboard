import { test } from "node:test";
import assert from "node:assert/strict";
import { captureDateError, dayN, displayOrder, editDiffs, findDuplicate, hasPerformance, historyGroups } from "../src/lib/history";
import { addCapture, editCapture, ensureSnapshotIds, removeCapture, restoreCapture } from "../src/lib/snapshots";
import { migrateContent } from "../src/lib/migrate";
import type { ContentItem, Metrics, MetricSnapshot, Publication } from "../src/lib/types";

const M = (reach: number, likes = 10, over: Partial<Metrics> = {}): Metrics => ({ reach, impressions: null, likes, comments: 1, shares: 0, saves: null, ...over });
const S = (over: Partial<MetricSnapshot>): MetricSnapshot => ({ at: "2026-11-20T01:00:00.000Z", source: "manual", metrics: M(1), ...over });
const pub = (over: Partial<Publication> = {}): Publication => ({
  id: "p1", platform: "Instagram", caption: "", status: "Posted", scheduledDate: "2026-11-17", publishedDate: "2026-11-17", postUrl: "", postId: "",
  metrics: null, metricsSource: null, lastSyncedAt: null, snapshots: [], ...over,
});
const item = (id: string, pubs: Publication[]): ContentItem => ({ id, title: id, pillar: "Promo", idea: "", assetUrl: "", notes: "", publications: pubs });

/* ---------- display order ---------- */

test("display order: dated newest first, then unknown dates, removed separately", () => {
  const snaps = [
    S({ id: "a", capturedOn: "2026-11-18", at: "2026-11-18T01:00:00.000Z" }),
    S({ at: "2026-11-25T01:00:00.000Z" }), // legacy, no id, unknown date
    S({ id: "c", capturedOn: "2026-11-24", at: "2026-11-19T01:00:00.000Z" }),
    S({ id: "d", capturedOn: "2026-11-25", deleted: true }),
    S({ id: "e", at: "2026-11-21T01:00:00.000Z" }),
  ];
  const o = displayOrder(snaps);
  assert.deepEqual(o.dated.map((e) => e.key), ["c", "a"]);
  assert.deepEqual(o.undated.map((e) => e.key), ["legacy-1", "e"]);
  assert.deepEqual(o.removed.map((e) => e.key), ["d"]);
  assert.deepEqual(o.undated.map((e) => e.index), [1, 4], "index points back into the stored list");
});

test("an invalid stored date counts as unknown", () => {
  const o = displayOrder([S({ id: "x", capturedOn: "2026-02-30" })]);
  assert.equal(o.undated.length, 1);
});

/* ---------- Day N ---------- */

test("Day N: publish day is Day 0, local calendar days", () => {
  assert.equal(dayN("2026-11-17", "2026-11-17"), 0);
  assert.equal(dayN("2026-11-18", "2026-11-17"), 1);
  assert.equal(dayN("2026-11-24", "2026-11-17"), 7);
  assert.equal(dayN("2026-12-17", "2026-11-17"), 30);
  assert.equal(dayN("2027-01-01", "2026-12-31"), 1, "across a year boundary");
});

test("Day N is unknown without both dates; never guessed", () => {
  assert.equal(dayN(undefined, "2026-11-17"), null);
  assert.equal(dayN("2026-11-24", ""), null);
  assert.equal(dayN("2026-11-24", "garbage"), null);
});

/* ---------- edit history ---------- */

test("edit diffs list only changed fields, oldest edit first", () => {
  const s = S({
    metrics: M(2000, 300, { saves: 5 }),
    edits: [
      { at: "2026-11-24T05:00:00.000Z", metrics: M(2000, 250) },
      { at: "2026-11-25T05:00:00.000Z", metrics: M(2000, 280) },
    ],
  });
  assert.deepEqual(editDiffs(s), [
    { at: "2026-11-24T05:00:00.000Z", changes: [{ key: "likes", from: 250, to: 280 }] },
    { at: "2026-11-25T05:00:00.000Z", changes: [{ key: "likes", from: 280, to: 300 }, { key: "saves", from: null, to: 5 }] },
  ]);
  assert.deepEqual(editDiffs(S({})), []);
});

test("edit diffs treat missing and null as the same 'not reported'", () => {
  const s = S({ metrics: M(1, 1, { clicks: null }), edits: [{ at: "x", metrics: M(1, 1) }] });
  assert.deepEqual(editDiffs(s)[0].changes, []);
});

/* ---------- duplicates and dates ---------- */

test("duplicate warning: same date and numbers, active only, edited capture skipped", () => {
  const snaps = [S({ capturedOn: "2026-11-24", metrics: M(5) }), S({ capturedOn: "2026-11-25", metrics: M(5), deleted: true })];
  assert.ok(findDuplicate(snaps, "2026-11-24", M(5)));
  assert.equal(findDuplicate(snaps, "2026-11-24", M(6)), null);
  assert.equal(findDuplicate(snaps, "2026-11-25", M(5)), null, "removed captures don't count");
  assert.equal(findDuplicate(snaps, "2026-11-24", M(5), 0), null, "the capture being edited doesn't count");
});

test("capture date limits", () => {
  const today = "2026-11-26";
  assert.equal(captureDateError("2026-11-24", "2026-11-17", today), null);
  assert.equal(captureDateError("2026-11-26", "2026-11-26", today), null, "today and publish day are fine");
  assert.match(captureDateError("2026-11-27", "2026-11-17", today)!, /future/);
  assert.match(captureDateError("2026-11-16", "2026-11-17", today)!, /before the post was published \(17 Nov\)/);
  assert.match(captureDateError("", "2026-11-17", today)!, /Enter the date/);
  assert.equal(captureDateError("", "2026-11-17", today, false), null, "optional when editing an undated capture");
  assert.match(captureDateError("2026-02-30", "", today)!, /valid date/);
  assert.equal(captureDateError("2026-01-01", "", today), null, "no published date: only the future is blocked");
});

/* ---------- overview grouping ---------- */

test("history groups: one group per content, one row per platform, most recent first", () => {
  const a = item("old", [pub({ id: "a-ig", publishedDate: "2026-10-01", scheduledDate: "2026-10-01" })]);
  const b = item("new", [
    pub({ id: "b-ig", snapshots: [S({ capturedOn: "2026-11-25", metrics: M(9) }), S({ capturedOn: "2026-11-20", deleted: true })] }),
    pub({ id: "b-tt", platform: "TikTok", status: "Idea", publishedDate: "", scheduledDate: "2026-12-30" }),
  ]);
  const g = historyGroups([a, b]);
  assert.deepEqual(g.map((x) => x.item.id), ["new", "old"]);
  assert.deepEqual(g[0].pubs.map((x) => x.pub.id), ["b-ig"], "unposted publication without numbers is left out");
  assert.deepEqual([g[0].pubs[0].active, g[0].pubs[0].removed, g[0].pubs[0].latest?.metrics.reach], [1, 1, 9]);
  assert.deepEqual(historyGroups([a, b], "TikTok"), []);
});

test("hasPerformance: posted, or has numbers or history", () => {
  assert.ok(hasPerformance(pub()));
  assert.ok(hasPerformance(pub({ status: "Ready", metrics: M(1) })));
  assert.ok(hasPerformance(pub({ status: "Ready", snapshots: [S({})] })));
  assert.ok(!hasPerformance(pub({ status: "Idea" })));
});

/* ---------- UI flows on P1b operations (as the panel performs them) ---------- */

test("panel flow: edit a legacy capture by index assigns ids and edits in one write", () => {
  const p = migrateContent([item("c", [pub({ metrics: M(5), metricsSource: "manual", snapshots: [S({ metrics: M(5) })] })])])[0].publications[0];
  const base = ensureSnapshotIds(p, { makeId: () => "new-id" });
  const after = editCapture(base, base.snapshots[0].id!, { metrics: M(6), capturedOn: "2026-11-20", note: "IG Insights" }, { now: "2026-11-26T00:00:00.000Z" });
  assert.equal(after.snapshots[0].id, "new-id");
  assert.equal(after.snapshots[0].at, "2026-11-20T01:00:00.000Z");
  assert.deepEqual(after.snapshots[0].edits, [{ at: "2026-11-26T00:00:00.000Z", metrics: M(5) }]);
  assert.equal(after.metrics?.reach, 6);
  assert.equal(p.snapshots[0].id, undefined, "original untouched");
});

test("panel flow: remove and restore by index, current numbers follow", () => {
  let p: Publication = pub();
  p = addCapture(p, { metrics: M(100), source: "manual", capturedOn: "2026-11-18" });
  p = addCapture(p, { metrics: M(200), source: "manual", capturedOn: "2026-11-24" });
  const id = ensureSnapshotIds(p).snapshots[1].id!;
  p = removeCapture(p, id);
  assert.equal(p.metrics?.reach, 100);
  assert.equal(displayOrder(p.snapshots).removed.length, 1);
  p = restoreCapture(p, id);
  assert.equal(p.metrics?.reach, 200);
});
