import { test } from "node:test";
import assert from "node:assert/strict";
import { DAY7_FROM, DAY7_TO, day7Reading, timelinePoints } from "../src/lib/history";
import { whatsWorking } from "../src/lib/insights";
import { flattenPosts } from "../src/lib/posts";
import { measured } from "../src/lib/analytics";
import type { ContentItem, Metrics, MetricSnapshot, Publication } from "../src/lib/types";

const M = (reach: number, likes: number): Metrics => ({ reach, impressions: null, likes, comments: 0, shares: 0, saves: null, clicks: null });
const snap = (capturedOn: string | undefined, metrics: Metrics, over: Partial<MetricSnapshot> = {}): MetricSnapshot =>
  ({ id: `s-${capturedOn}-${metrics.likes}-${over.at ?? ""}`, at: over.at ?? "2026-11-20T01:00:00.000Z", ...(capturedOn ? { capturedOn } : {}), source: "manual", metrics, ...over });
const pub = (snapshots: MetricSnapshot[], over: Partial<Publication> = {}): Publication => ({
  id: "p", platform: "Instagram", caption: "", status: "Posted", scheduledDate: "2026-11-01", publishedDate: "2026-11-01", postUrl: "", postId: "",
  metrics: snapshots.at(-1)?.metrics ?? null, metricsSource: snapshots.length ? "manual" : null, lastSyncedAt: null, snapshots, ...over,
});

/* ---------- timeline ---------- */

test("timeline: dated captures that aren't removed, oldest first, on a Day N axis", () => {
  const p = pub([
    snap("2026-11-08", M(800, 40)),
    snap("2026-11-02", M(300, 30)),
    snap("2026-11-05", M(500, 0), { deleted: true }),
    snap(undefined, M(900, 9)), // undated legacy: can't be placed
    snap("2026-10-30", M(10, 1)), // before publishing: can't be placed
  ]);
  assert.deepEqual(timelinePoints(p), [
    { day: 1, date: "2026-11-02", reach: 300, rate: 10 },
    { day: 7, date: "2026-11-08", reach: 800, rate: 5 },
  ]);
});

test("timeline: no reach means an unknown rate, never 0%", () => {
  const pts = timelinePoints(pub([snap("2026-11-02", M(0, 5)), snap("2026-11-03", M(100, 5))]));
  assert.equal(pts[0].rate, null);
  assert.equal(pts[1].rate, 5);
});

test("timeline: none without a published date", () => {
  assert.deepEqual(timelinePoints(pub([snap("2026-11-02", M(1, 1)), snap("2026-11-03", M(1, 1))], { publishedDate: "" })), []);
});

/* ---------- Day 7 reading ---------- */

test("Day 7 reading: first capture dated day 7–13; same day → the one entered last", () => {
  assert.deepEqual([DAY7_FROM, DAY7_TO], [7, 13]);
  const p = pub([
    snap("2026-11-07", M(100, 1)), // day 6: too early
    snap("2026-11-10", M(300, 3)), // day 9
    snap("2026-11-09", M(200, 2), { at: "2026-11-09T01:00:00.000Z" }), // day 8
    snap("2026-11-09", M(250, 2), { at: "2026-11-09T05:00:00.000Z" }), // day 8, entered later
    snap("2026-11-20", M(900, 9)), // day 19: too late
  ]);
  assert.equal(day7Reading(p)?.metrics.reach, 250);
});

test("Day 7 reading: removed, undated or out-of-window captures don't count", () => {
  assert.equal(day7Reading(pub([snap("2026-11-08", M(1, 1), { deleted: true })])), null);
  assert.equal(day7Reading(pub([snap(undefined, M(1, 1))])), null);
  assert.equal(day7Reading(pub([snap("2026-11-07", M(1, 1)), snap("2026-11-15", M(1, 1))])), null, "day 6 and day 14");
  assert.equal(day7Reading(pub([snap("2026-11-14", M(1, 1))]))?.capturedOn, "2026-11-14", "day 13 counts");
  assert.equal(day7Reading(pub([snap("2026-11-08", M(1, 1))], { publishedDate: "" })), null);
});

/* ---------- What's working on the Day 7 basis ---------- */

let n = 0;
const item = (pillar: string, day7Likes: number | null, latestLikes: number): ContentItem => {
  const id = `c${++n}`;
  const snaps = [...(day7Likes == null ? [] : [snap("2026-11-08", M(1000, day7Likes))]), snap("2026-11-25", M(1000, latestLikes))];
  return { id, title: id, pillar, idea: "", assetUrl: "", notes: "", publications: [{ ...pub(snaps), id: `${id}-p` }] };
};

test("Day 7 basis compares posts at the same age and counts posts without a reading", () => {
  // On the latest numbers B looks best (60 vs 20); at Day 7 A was best (50 vs 10).
  const content = [item("A", 50, 20), item("A", 50, 20), item("A", 50, 20), item("B", 10, 60), item("B", 10, 60), item("B", 10, 60), item("C", null, 99)];
  const posts = measured(flattenPosts(content), "real");
  const latest = whatsWorking(posts, "2026-11-27", "latest");
  const day7 = whatsWorking(posts, "2026-11-27", "day7");
  assert.equal(latest.pillars.groups[0].name, "B");
  assert.equal(day7.pillars.groups[0].name, "A");
  assert.equal(day7.compared, 6);
  assert.equal(day7.noReading, 1, "C has numbers but no capture from day 7–13");
  assert.equal(latest.noReading, 0);
  assert.equal(day7.pillars.groups[0].medianRate, 5, "rate from the Day 7 capture, not the latest");
});

test("the default basis is unchanged (latest numbers)", () => {
  const content = [item("A", 50, 20), item("A", 50, 20), item("A", 50, 20)];
  const posts = measured(flattenPosts(content), "real");
  assert.deepEqual(whatsWorking(posts, "2026-11-27"), whatsWorking(posts, "2026-11-27", "latest"));
});
