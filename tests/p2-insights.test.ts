import { test } from "node:test";
import assert from "node:assert/strict";
import { CONSISTENT, MIN_AGE, MIN_GROUP, MIN_PLATFORM, confidenceFor, median, whatsWorking } from "../src/lib/insights";
import { flattenPosts } from "../src/lib/posts";
import { measured } from "../src/lib/analytics";
import { DEMO_CONTENT } from "../src/lib/demo-data";
import type { ContentItem, Format, Metrics, Platform, Publication } from "../src/lib/types";

const TODAY = "2026-11-27";
// Engagement = likes + comments + shares (+ saves); comments/shares/saves 0 here, so rate = likes / reach.
const M = (reach: number, likes: number): Metrics => ({ reach, impressions: null, likes, comments: 0, shares: 0, saves: null, clicks: null });
let n = 0;
const post = (o: { platform?: Platform; rate?: number; reach?: number; published?: string; pillar?: string; format?: Format; tags?: string[]; demo?: boolean }): ContentItem => {
  const id = `c${++n}`;
  const reach = o.reach ?? 1000;
  const pub: Publication = {
    id: `${id}-p`, platform: o.platform ?? "Instagram", caption: "", status: "Posted", scheduledDate: "2026-11-01", publishedDate: o.published ?? "2026-11-01",
    postUrl: "", postId: "", metrics: M(reach, Math.round((reach * (o.rate ?? 5)) / 100)), metricsSource: o.demo ? "demo" : "manual", lastSyncedAt: null, snapshots: [],
    ...(o.format ? { format: o.format } : {}),
  };
  return { id, title: id, pillar: o.pillar ?? "Promo", idea: "", assetUrl: "", notes: "", publications: [pub], ...(o.tags ? { tags: o.tags } : {}), ...(o.demo ? { isDemo: true } : {}) };
};
const run = (content: ContentItem[], today: string | null = TODAY) => whatsWorking(measured(flattenPosts(content), content.some((c) => c.isDemo) ? "demo" : "real"), today);

test("median of odd and even lists", () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 3, 2]), 2.5);
  assert.ok(Number.isNaN(median([])));
});

test("thresholds: hidden under 3, early signal 3–5, consistent from 6", () => {
  assert.deepEqual([MIN_AGE, MIN_PLATFORM, MIN_GROUP, CONSISTENT], [7, 3, 3, 6]);
  assert.deepEqual([0, 2, 3, 5, 6, 20].map(confidenceFor), [null, null, "early", "early", "consistent", "consistent"]);
});

test("lift is relative to each platform's own median", () => {
  // Instagram rates 2/4/6 (median 4); TikTok rates 10/20/30 (median 20).
  const c = [
    post({ platform: "Instagram", rate: 2, pillar: "A" }), post({ platform: "Instagram", rate: 4, pillar: "A" }), post({ platform: "Instagram", rate: 6, pillar: "B" }),
    post({ platform: "TikTok", rate: 10, pillar: "B" }), post({ platform: "TikTok", rate: 20, pillar: "A" }), post({ platform: "TikTok", rate: 30, pillar: "B" }),
  ];
  const r = run(c);
  assert.equal(r.compared, 6);
  // A: lifts 0.5, 1, 1 → median 1. B: lifts 1.5, 0.5, 1.5 → median 1.5. Raw TikTok rates don't swamp Instagram.
  assert.deepEqual(r.pillars.groups.map((g) => [g.name, g.posts, g.medianLift]), [["B", 3, 1.5], ["A", 3, 1]]);
  assert.equal(r.pillars.groups[0].medianRate, 10); // B's raw rates 6, 10, 30 → median 10
});

test("posts younger than 7 days, without reach, or without a published date are left out", () => {
  const c = [
    post({ rate: 5 }), post({ rate: 5 }), post({ rate: 5 }),
    post({ rate: 50, published: "2026-11-21" }), // 6 days old
    post({ rate: 50, reach: 0 }), // no reach: no rate, not 0%
    post({ rate: 50, published: "" }), // age unknown
  ];
  const r = run(c);
  assert.equal(r.compared, 3);
  assert.equal(r.tooRecent, 1);
  assert.equal(r.noDate, 1);
  assert.equal(run([post({ rate: 5, published: "2026-11-20" })]).tooRecent, 0, "exactly 7 days old counts");
});

test("a platform with fewer than 3 eligible posts is left out and reported", () => {
  const c = [post({}), post({}), post({}), post({ platform: "Threads" }), post({ platform: "Threads" })];
  const r = run(c);
  assert.equal(r.compared, 3);
  assert.deepEqual(r.excludedPlatforms, [{ platform: "Threads", posts: 2 }]);
});

test("formats and topics: grouped, a post counts once per topic, coverage reported", () => {
  const c = [
    post({ rate: 8, format: "Reel", tags: ["toddler play", "gift guide"] }),
    post({ rate: 8, format: "Reel", tags: ["toddler play"] }),
    post({ rate: 8, format: "Reel", tags: ["toddler play", "toddler play"] }), // duplicate tag counted once
    post({ rate: 2, format: "Photo", tags: ["gift guide"] }),
    post({ rate: 2 }),
  ];
  const r = run(c);
  assert.equal(r.formats.covered, 4);
  assert.deepEqual(r.formats.groups.map((g) => [g.name, g.posts, g.confidence]), [["Reel", 3, "early"]]);
  assert.equal(r.formats.hidden, 1, "Photo has 1 post");
  assert.equal(r.topics.covered, 4);
  assert.deepEqual(r.topics.groups.map((g) => [g.name, g.posts]), [["toddler play", 3]]);
  assert.equal(r.topics.hidden, 1, "gift guide has 2 posts");
  assert.equal(r.topics.groups[0].share, 3 / 5);
});

test("consistent label from 6 posts; ties ordered by post count then name", () => {
  const c = [
    ...Array.from({ length: 6 }, () => post({ pillar: "Zeta" })),
    ...Array.from({ length: 3 }, () => post({ pillar: "Alpha" })),
    ...Array.from({ length: 3 }, () => post({ pillar: "Beta" })),
  ];
  const r = run(c);
  assert.deepEqual(r.pillars.groups.map((g) => [g.name, g.confidence]), [["Zeta", "consistent"], ["Alpha", "early"], ["Beta", "early"]]);
  assert.deepEqual(run([...c].reverse()).pillars.groups.map((g) => g.name), ["Zeta", "Alpha", "Beta"], "input order doesn't matter");
});

test("demo and real data are never mixed", () => {
  const real = [post({}), post({}), post({})];
  const demo = [post({ demo: true }), post({ demo: true }), post({ demo: true })];
  const all = [...real, ...demo];
  assert.equal(whatsWorking(measured(flattenPosts(all), "real"), TODAY).compared, 3);
  assert.equal(whatsWorking(measured(flattenPosts(all), "demo"), TODAY).compared, 3);
});

test("no browser date, nothing compared", () => {
  const c = [post({}), post({}), post({})];
  assert.equal(run(c, null).compared, 0);
  assert.equal(run(c, "not a date").compared, 0);
});

test("the input is never changed", () => {
  const c = [post({ tags: ["a"] }), post({ tags: ["a"] }), post({ tags: ["a"] })];
  const before = JSON.stringify(c);
  run(c);
  assert.equal(JSON.stringify(c), before);
});

test("demo samples carry formats and topics, so the demo preview has something to show", () => {
  const demo = structuredClone(DEMO_CONTENT);
  assert.ok(demo.every((c) => (c.tags ?? []).length > 0));
  assert.ok(demo.every((c) => c.publications.every((p) => p.format)));
  const r = whatsWorking(measured(flattenPosts(demo), "demo"), TODAY);
  assert.ok(r.compared >= 6);
  assert.ok(r.topics.groups.some((g) => g.name === "toddler play"));
});

test("Best-performing pillar highlight follows the same rule: lift, a week old, 3+ posts", async () => {
  const { highlights } = await import("../src/lib/analytics");
  const three = [post({ rate: 9, pillar: "Gifts" }), post({ rate: 9, pillar: "Gifts" }), post({ rate: 9, pillar: "Gifts" }), post({ rate: 3, pillar: "Tips" }), post({ rate: 3, pillar: "Tips" }), post({ rate: 3, pillar: "Tips" })];
  const posts = measured(flattenPosts(three), "real");
  const h = highlights(posts, TODAY).find((x) => x.label === "Best-performing pillar");
  assert.equal(h?.value, "Gifts");
  // All Instagram: rates 9,9,9,3,3,3 → usual (median) 6 → Gifts lift 1.5.
  assert.equal(h!.detail, "1.5× your usual engagement rate, 3 posts");
  // One brilliant post is not enough to name a pillar.
  const one = measured(flattenPosts([post({ rate: 50, pillar: "Lucky" }), post({ rate: 2 }), post({ rate: 2 })]), "real");
  assert.equal(highlights(one, TODAY).find((x) => x.label === "Best-performing pillar"), undefined);
  assert.equal(highlights(posts).find((x) => x.label === "Best-performing pillar"), undefined, "no browser date yet");
});
