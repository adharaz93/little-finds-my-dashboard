import { test } from "node:test";
import assert from "node:assert/strict";
import {
  KEY_LAST_DELETED, captureCount, commitRecoveryCopy, contentDeletionMessage, contentDeletionRecord, hasPerformanceData, lastDeletedLabel,
  parseLastDeleted, planRestore, platformRemovalMessage, publicationRemovalRecord, readLastDeleted, removedWithData, writeLastDeleted, type LastDeleted,
} from "../src/lib/recovery";
import { dayN, dayNLabel } from "../src/lib/history";
import { serialize, readBackup, KEY_V2 } from "../src/lib/migrate";
import type { ContentItem, Metrics, MetricSnapshot, Publication } from "../src/lib/types";

const M = (reach: number): Metrics => ({ reach, impressions: null, likes: 1, comments: 0, shares: 0, saves: null, clicks: null });
const snap = (id: string, over: Partial<MetricSnapshot> = {}): MetricSnapshot => ({ id, at: "2026-11-20T01:00:00.000Z", capturedOn: "2026-11-20", source: "manual", metrics: M(1), ...over });
// Field order as the app writes it: format after snapshots, tags after publications.
const pub = (id: string, platform: Publication["platform"], snapshots: MetricSnapshot[] = [], over: Partial<Publication> = {}): Publication => ({
  id, platform, caption: `cap ${id}`, status: "Posted", scheduledDate: "2026-11-17", publishedDate: "2026-11-17", postUrl: "https://x/p", postId: "pid",
  metrics: snapshots.length ? M(1) : null, metricsSource: snapshots.length ? "manual" : null, lastSyncedAt: null, snapshots, format: "Reel", ...over,
});
const item = (id: string, title: string, pubs: Publication[]): ContentItem => ({ id, title, pillar: "Promo", idea: "i", assetUrl: "", notes: "n", publications: pubs, tags: ["gift guide"] });

// A content item with everything P0–P1c can store: ids, edits, removed captures, notes, undated legacy.
const rich = () => item("c1", "Gift guide", [
  pub("c1-ig", "Instagram", [
    snap("s1", { note: "IG Insights", edits: [{ at: "2026-11-21T01:00:00.000Z", metrics: M(9) }] }),
    snap("s2", { capturedOn: "2026-11-24", deleted: true }),
    { at: "2026-11-15T01:00:00.000Z", source: "manual", metrics: M(3) }, // legacy: no id, no date
  ]),
  pub("c1-tt", "TikTok", [snap("s3")]),
  pub("c1-th", "Threads", [], { status: "Idea", publishedDate: "" }),
]);

function fakeStorage(init: Record<string, string> = {}, failWrites = false) {
  const data = new Map(Object.entries(init));
  return {
    data,
    getItem: (k: string) => (data.has(k) ? data.get(k)! : null),
    setItem: (k: string, v: string) => { if (failWrites) throw new Error("quota"); data.set(k, v); },
    removeItem: (k: string) => { data.delete(k); },
  };
}

/* ---------- Task 1: what counts and what the messages say ---------- */

test("capture counts include removed captures and legacy ones", () => {
  const c = rich();
  assert.equal(captureCount(c.publications[0]), 3);
  assert.ok(hasPerformanceData(c.publications[0]));
});

test("a publication whose captures were all removed still counts as having history", () => {
  const p = pub("p", "TikTok", [snap("a", { deleted: true })], { metrics: null, metricsSource: null });
  assert.equal(p.metrics, null, "the old check (metrics only) would have skipped the warning");
  assert.ok(hasPerformanceData(p));
  assert.match(platformRemovalMessage(p), /^Remove TikTok\? When you save, this TikTok post and its 1 performance capture will be deleted\./);
});

test("numbers saved before history (no captures) also count", () => {
  const p = pub("p", "Instagram", [], { metrics: M(5), metricsSource: "manual" });
  assert.ok(hasPerformanceData(p));
  assert.match(platformRemovalMessage(p), /its recorded performance numbers will be deleted/);
  assert.ok(!hasPerformanceData(pub("q", "Threads")), "no numbers, no history: no warning needed");
});

test("platform message says deletion happens on save, with the platform and capture count", () => {
  const m = platformRemovalMessage(pub("p", "TikTok", [snap("a"), snap("b"), snap("c", { deleted: true })]));
  assert.match(m, /^Remove TikTok\? When you save, this TikTok post and its 3 performance captures will be deleted\. A recovery copy is kept/);
});

test("content message names the title, platform posts and all captures", () => {
  assert.equal(
    contentDeletionMessage(rich()),
    "Delete 'Gift guide'? This will delete 3 platform posts and 4 performance captures. A recovery copy will be available on the Dashboard until your next deletion.",
  );
  // An item without performance data gets no copy, so the message doesn't promise one.
  assert.equal(
    contentDeletionMessage(item("x", "Solo", [pub("x-ig", "Instagram")])),
    "Delete 'Solo'? This will delete 1 platform post. It has no performance data, so no recovery copy is needed.",
  );
  assert.match(contentDeletionMessage(item("y", "Old numbers", [pub("y-ig", "Instagram", [], { metrics: M(5), metricsSource: "manual" })])), /1 platform post and its recorded performance numbers\. A recovery copy/);
});

/* ---------- Task 2: which publications a save removes ---------- */

test("removedWithData lists only removed publications that hold data", () => {
  const before = rich();
  const after = { ...before, publications: [before.publications[2]] }; // Instagram + TikTok removed, Threads kept
  assert.deepEqual(removedWithData(before, after).map((p) => p.id), ["c1-ig", "c1-tt"]);
  const noData = { ...before, publications: [before.publications[0], before.publications[1]] }; // only empty Threads removed
  assert.deepEqual(removedWithData(before, noData), []);
  assert.deepEqual(removedWithData(undefined, before), [], "new content removes nothing");
});

/* ---------- Task 2: writing and reading the copy ---------- */

test("a failed write returns false and keeps the previous copy", () => {
  const old: LastDeleted = { kind: "content", deletedAt: "2026-11-25T01:00:00.000Z", item: rich() };
  const s = fakeStorage({ [KEY_LAST_DELETED]: JSON.stringify(old) }, true);
  const ok = writeLastDeleted(s, { kind: "content", deletedAt: "2026-11-26T01:00:00.000Z", item: item("z", "Other", [pub("z-ig", "Instagram")]) });
  assert.equal(ok, false);
  assert.equal(s.data.get(KEY_LAST_DELETED), JSON.stringify(old));
});

test("a written copy reads back exactly, every field intact", () => {
  const s = fakeStorage();
  const rec: LastDeleted = { kind: "content", deletedAt: "2026-11-26T03:04:05.000Z", item: rich() };
  assert.ok(writeLastDeleted(s, rec));
  const back = readLastDeleted(s)!;
  assert.equal(JSON.stringify(back), JSON.stringify(rec));
});

test("publication copies read back exactly", () => {
  const rec: LastDeleted = { kind: "publications", deletedAt: "2026-11-26T03:04:05.000Z", contentId: "c1", contentTitle: "Gift guide", publications: rich().publications.slice(0, 2) };
  assert.equal(JSON.stringify(parseLastDeleted(JSON.stringify(rec))), JSON.stringify(rec));
});

test("a valid copy with fields in a different order is still accepted, and kept exactly as stored", () => {
  const reordered = { kind: "content", deletedAt: "2026-11-26T03:04:05.000Z", item: { tags: ["gift guide"], ...rich() } };
  const raw = JSON.stringify(reordered);
  const back = parseLastDeleted(raw);
  assert.ok(back);
  assert.equal(JSON.stringify(back), raw);
});

test("malformed or tampered copies are ignored", () => {
  const good: LastDeleted = { kind: "content", deletedAt: "2026-11-26T03:04:05.000Z", item: rich() };
  const bad = [
    null, "", "{not json", "null", "42", JSON.stringify({}),
    JSON.stringify({ ...good, kind: "other" }),
    JSON.stringify({ ...good, deletedAt: "yesterday" }),
    JSON.stringify({ ...good, item: { title: "no id" } }),
    JSON.stringify({ ...good, item: { ...good.item, publications: [{ id: "p", platform: "MySpace", status: "Posted" }] } }), // would be quarantined
    JSON.stringify({ ...good, item: { ...good.item, extra: undefined, publications: "x" } }),
    JSON.stringify({ kind: "publications", deletedAt: good.deletedAt, contentId: "c1", contentTitle: "t", publications: [] }),
    JSON.stringify({ kind: "publications", deletedAt: good.deletedAt, contentTitle: "t", publications: rich().publications }),
  ];
  for (const raw of bad) assert.equal(parseLastDeleted(raw), null, String(raw).slice(0, 60));
  assert.equal(readLastDeleted({ getItem: () => { throw new Error("blocked"); } }), null);
});

test("the copy is not part of normal backups or saved data", () => {
  const raw = serialize([rich()], [], []);
  assert.ok(!raw.includes(KEY_LAST_DELETED));
  assert.ok(!raw.includes("deletedAt"));
  assert.notEqual(KEY_LAST_DELETED, KEY_V2);
  const b = readBackup(raw)!;
  assert.equal(serialize(b.content, b.assets!, b.quarantine), raw, "backup format unchanged");
  assert.equal(JSON.parse(raw).version, 2);
});

/* ---------- Task 2: an existing copy is never replaced by an empty deletion ---------- */
// These follow the store's exact steps: build the record, commit it, and only then change data.

const T = "2026-11-26T05:00:00.000Z";
const historyCopy = (): LastDeleted => ({ kind: "content", deletedAt: "2026-11-25T01:00:00.000Z", item: rich() });
const emptyDraft = () => item("d1", "Empty draft", [pub("d1-ig", "Instagram", [], { status: "Idea", publishedDate: "" })]);

test("1. an existing history copy survives deleting an empty draft", () => {
  const s = fakeStorage({ [KEY_LAST_DELETED]: JSON.stringify(historyCopy()) });
  const record = contentDeletionRecord(emptyDraft(), T);
  assert.equal(record, null, "an item without performance data needs no copy");
  assert.equal(commitRecoveryCopy(s, record), true, "deletion may go ahead");
  assert.equal(s.data.get(KEY_LAST_DELETED), JSON.stringify(historyCopy()), "the valuable copy is untouched");
});

test("2. an existing history copy survives removing a publication without captures", () => {
  const s = fakeStorage({ [KEY_LAST_DELETED]: JSON.stringify(historyCopy()) });
  const before = item("n1", "Two platforms", [pub("n1-ig", "Instagram", [snap("k1")]), pub("n1-th", "Threads", [], { status: "Idea", publishedDate: "" })]);
  const after = { ...before, publications: [before.publications[0]] }; // empty Threads removed
  const record = publicationRemovalRecord(before, after, T);
  assert.equal(record, null);
  assert.equal(commitRecoveryCopy(s, record), true);
  assert.equal(s.data.get(KEY_LAST_DELETED), JSON.stringify(historyCopy()));
});

test("3. a deletion with new performance history replaces the previous copy", () => {
  const s = fakeStorage({ [KEY_LAST_DELETED]: JSON.stringify(historyCopy()) });
  const other = item("o1", "Other", [pub("o1-tt", "TikTok", [snap("z1", { deleted: true })], { metrics: null, metricsSource: null })]);
  const record = contentDeletionRecord(other, T)!;
  assert.ok(record, "even a lone removed capture is history");
  assert.equal(commitRecoveryCopy(s, record), true);
  const back = readLastDeleted(s)!;
  assert.equal(back.kind, "content");
  assert.equal(JSON.stringify(back), JSON.stringify({ kind: "content", deletedAt: T, item: other }));
  // Same for a platform removal with data.
  const before = rich();
  const after = { ...before, publications: [before.publications[0], before.publications[2]] }; // TikTok removed
  assert.ok(commitRecoveryCopy(s, publicationRemovalRecord(before, after, T)));
  assert.deepEqual((readLastDeleted(s) as Extract<LastDeleted, { kind: "publications" }>).publications.map((p) => p.id), ["c1-tt"]);
});

test("4. deleting empty content works normally when no copy exists, and creates none", () => {
  const s = fakeStorage();
  assert.equal(commitRecoveryCopy(s, contentDeletionRecord(emptyDraft(), T)), true);
  assert.equal(s.data.has(KEY_LAST_DELETED), false, "no unnecessary copy");
  assert.equal(readLastDeleted(s), null);
});

test("5. a failed copy write still blocks destructive changes, and the old copy stays", () => {
  const s = fakeStorage({ [KEY_LAST_DELETED]: JSON.stringify(historyCopy()) }, true);
  assert.equal(commitRecoveryCopy(s, contentDeletionRecord(rich(), T)), false, "content delete must stop");
  const before = rich();
  assert.equal(commitRecoveryCopy(s, publicationRemovalRecord(before, { ...before, publications: [before.publications[2]] }, T)), false, "form save must stop");
  assert.equal(s.data.get(KEY_LAST_DELETED), JSON.stringify(historyCopy()));
  // Nothing to copy: a failing storage doesn't block deleting an empty draft (nothing is written).
  assert.equal(commitRecoveryCopy(s, contentDeletionRecord(emptyDraft(), T)), true);
});

test("numbers saved before history count as performance data for the copy", () => {
  const legacy = item("l1", "Legacy", [pub("l1-ig", "Instagram", [], { metrics: M(7), metricsSource: "manual" })]);
  assert.ok(contentDeletionRecord(legacy, T));
});

/* ---------- Task 2: restoring ---------- */

test("restoring content puts back the exact item", () => {
  const original = rich();
  const others = [item("c2", "Other", [pub("c2-ig", "Instagram")])];
  const plan = planRestore(others, { kind: "content", deletedAt: "2026-11-26T00:00:00.000Z", item: original });
  assert.ok(plan.ok);
  if (plan.ok) {
    assert.equal(JSON.stringify(plan.content.find((c) => c.id === "c1")), JSON.stringify(original));
    assert.equal(plan.content.length, 2);
    assert.equal(plan.message, "Restored 'Gift guide'.");
  }
});

test("restoring content is refused if the id already exists; nothing changes", () => {
  const current = [rich()];
  const plan = planRestore(current, { kind: "content", deletedAt: "2026-11-26T00:00:00.000Z", item: rich() });
  assert.equal(plan.ok, false);
  if (!plan.ok) assert.match(plan.error, /same id already exists\. Nothing was changed\./);
});

test("restoring publications returns them to their parent, exactly", () => {
  const full = rich();
  const parent = { ...full, publications: [full.publications[2]] };
  const rec: LastDeleted = { kind: "publications", deletedAt: "2026-11-26T00:00:00.000Z", contentId: "c1", contentTitle: "Gift guide", publications: full.publications.slice(0, 2) };
  const plan = planRestore([parent], rec);
  assert.ok(plan.ok);
  if (plan.ok) {
    const back = plan.content[0];
    assert.deepEqual(back.publications.map((p) => p.id), ["c1-th", "c1-ig", "c1-tt"]);
    assert.equal(JSON.stringify(back.publications.slice(1)), JSON.stringify(full.publications.slice(0, 2)));
    assert.equal(plan.message, "Restored the Instagram and TikTok posts of 'Gift guide'.");
  }
});

test("restoring publications is refused when the parent is gone", () => {
  const rec: LastDeleted = { kind: "publications", deletedAt: "2026-11-26T00:00:00.000Z", contentId: "c1", contentTitle: "Gift guide", publications: [rich().publications[1]] };
  const plan = planRestore([item("c2", "Other", [pub("c2-ig", "Instagram")])], rec);
  assert.equal(plan.ok, false);
  if (!plan.ok) assert.match(plan.error, /'Gift guide', the content it belonged to, no longer exists/);
});

test("restoring publications is refused on a duplicate id or a platform added again; all or nothing", () => {
  const full = rich();
  const rec: LastDeleted = { kind: "publications", deletedAt: "2026-11-26T00:00:00.000Z", contentId: "c1", contentTitle: "Gift guide", publications: full.publications.slice(0, 2) };
  // Same id somewhere else.
  const dupId = [{ ...full, publications: [full.publications[2]] }, item("c2", "Other", [pub("c1-tt", "Threads")])];
  const a = planRestore(dupId, rec);
  assert.equal(a.ok, false);
  if (!a.ok) assert.match(a.error, /same id already exists/);
  // TikTok added again to the parent since the deletion (new id).
  const readded = [{ ...full, publications: [full.publications[2], pub("new-tt", "TikTok")] }];
  const b = planRestore(readded, rec);
  assert.equal(b.ok, false);
  if (!b.ok) assert.match(b.error, /already has a TikTok post/);
});

test("planning a restore never mutates the current data or the copy", () => {
  const current = [{ ...rich(), publications: [rich().publications[2]] }];
  const rec: LastDeleted = { kind: "publications", deletedAt: "2026-11-26T00:00:00.000Z", contentId: "c1", contentTitle: "Gift guide", publications: rich().publications.slice(0, 2) };
  const before = JSON.stringify([current, rec]);
  planRestore(current, rec);
  assert.equal(JSON.stringify([current, rec]), before);
});

test("restore link label names what and when", () => {
  const c = lastDeletedLabel({ kind: "content", deletedAt: "2026-11-26T06:05:00.000Z", item: rich() });
  assert.match(c, /^Restore 'Gift guide' \(content\) — deleted 26 Nov 2026, \d\d:\d\d$/);
  const p = lastDeletedLabel({ kind: "publications", deletedAt: "2026-11-26T06:05:00.000Z", contentId: "c1", contentTitle: "Gift guide", publications: [rich().publications[1]] });
  assert.match(p, /^Restore TikTok post of 'Gift guide' — deleted 26 Nov 2026/);
});

/* ---------- Task 3: Day N labels ---------- */

test("Day N: one day before publishing reads 'Before publishing'", () => {
  assert.equal(dayN("2026-11-16", "2026-11-17"), -1);
  assert.equal(dayNLabel(dayN("2026-11-16", "2026-11-17")), "Before publishing");
  assert.equal(dayNLabel(dayN("2026-10-01", "2026-11-17")), "Before publishing");
});

test("Day N: publish day is Day 0, then positive days", () => {
  assert.equal(dayNLabel(dayN("2026-11-17", "2026-11-17")), "Day 0");
  assert.equal(dayNLabel(dayN("2026-11-18", "2026-11-17")), "Day 1");
  assert.equal(dayNLabel(dayN("2026-11-24", "2026-11-17")), "Day 7");
  assert.equal(dayNLabel(dayN("2026-12-17", "2026-11-17")), "Day 30");
});

test("Day N: undated legacy capture or missing published date reads 'Day —'", () => {
  assert.equal(dayNLabel(dayN(undefined, "2026-11-17")), "Day —");
  assert.equal(dayNLabel(dayN("2026-11-20", "")), "Day —");
});

test("Day N uses local calendar days, not UTC (Malaysia, early morning)", () => {
  const saved = process.env.TZ;
  process.env.TZ = "Asia/Kuala_Lumpur";
  try {
    // Calendar-date strings only: no Date→ISO conversion that could shift a day.
    assert.equal(dayNLabel(dayN("2026-11-18", "2026-11-17")), "Day 1");
    assert.equal(dayNLabel(dayN("2026-11-17", "2026-11-18")), "Before publishing");
  } finally {
    if (saved === undefined) delete process.env.TZ;
    else process.env.TZ = saved;
  }
});
