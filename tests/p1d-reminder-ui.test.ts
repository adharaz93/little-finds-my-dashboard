import { test } from "node:test";
import assert from "node:assert/strict";
import { EMPTY_REMINDERS, dueCheckpoints, indexReminders, reminderKey, reminderLabel, type ReminderSummary } from "../src/lib/reminders";
import { buildTasks } from "../src/lib/tasks";
import { flattenPosts } from "../src/lib/posts";
import { DEMO_CONTENT } from "../src/lib/demo-data";
import type { ContentItem, Metrics, Publication } from "../src/lib/types";

const M = (reach: number): Metrics => ({ reach, impressions: null, likes: 1, comments: 0, shares: 0, saves: null, clicks: null });
const pub = (id: string, over: Partial<Publication> = {}): Publication => ({
  id, platform: "Instagram", caption: "cap", status: "Posted", scheduledDate: "2026-11-17", publishedDate: "2026-11-17", postUrl: "", postId: "",
  metrics: null, metricsSource: null, lastSyncedAt: null, snapshots: [], ...over,
});
const item = (id: string, pubs: Publication[], over: Partial<ContentItem> = {}): ContentItem => ({ id, title: `T ${id}`, pillar: "Promo", idea: "", assetUrl: "https://a", notes: "", publications: pubs, ...over });
const tasksFor = (content: ContentItem[], reminders: ReminderSummary) => buildTasks(flattenPosts(content), content, reminders);
const count = (tasks: { n: number; t: string }[], t: string) => tasks.find((x) => x.t === t)?.n ?? 0;
const TODAY = "2026-11-25"; // 8 days after 17 Nov

// The original task builder, kept here to prove buildTasks matches it when there are no reminders.
const original = (content: ContentItem[]) => {
  const posts = flattenPosts(content);
  return [
    { n: posts.filter((c) => c.status === "Drafting" && !c.caption).length, t: "drafts need a caption", href: "/bank" },
    { n: posts.filter((c) => c.status === "Ready").length, t: "ready to schedule", href: "/posting" },
    { n: posts.filter((c) => c.status === "Posted" && !c.metrics).length, t: "posts need performance data", href: "/analytics" },
    { n: content.filter((c) => c.publications.some((p) => p.status !== "Idea") && !c.assetUrl).length, t: "items missing an asset link", href: "/bank" },
  ].filter((x) => x.n > 0);
};

/* ---------- helpers ---------- */

test("reminderLabel gives the exact badge text", () => {
  assert.equal(reminderLabel(1), "Day 1 numbers due");
  assert.equal(reminderLabel(7), "Day 7 numbers due");
  assert.equal(reminderLabel(30), "Day 30 numbers due");
});

test("indexReminders keys by content id + publication id; a shared publication id stays separate", () => {
  const content = [item("a", [pub("same")]), item("b", [pub("same", { publishedDate: "2026-11-23" })])];
  const idx = indexReminders(dueCheckpoints(content, TODAY));
  assert.equal(idx.size, 2);
  assert.equal(idx.get(reminderKey("a", "same"))?.checkpoint, 7);
  assert.equal(idx.get(reminderKey("b", "same"))?.checkpoint, 1);
  assert.equal(idx.get(reminderKey("c", "same")), undefined, "unrelated publications get nothing");
  assert.notEqual(reminderKey("a", "bc"), reminderKey("ab", "c"), "keys can't collide by concatenation");
});

/* ---------- task counts ---------- */

test("a due post is counted once: under 'due for numbers', not under 'need performance data'", () => {
  const content = [item("a", [pub("a-ig")])]; // Posted, no numbers, age 8 → Day 7 due
  const t = tasksFor(content, dueCheckpoints(content, TODAY));
  assert.equal(count(t, "posts due for numbers"), 1);
  assert.equal(count(t, "posts need performance data"), 0);
});

test("a Posted post without numbers outside every window still counts as needing performance data", () => {
  const content = [item("old", [pub("old-ig", { publishedDate: "2026-09-01" })])]; // day 85: expired
  const t = tasksFor(content, dueCheckpoints(content, TODAY));
  assert.equal(count(t, "posts due for numbers"), 0);
  assert.equal(count(t, "posts need performance data"), 1);
});

test("a due post that already has numbers isn't in 'need performance data' anyway, and is due once", () => {
  const content = [item("a", [pub("a-ig", { metrics: M(5), metricsSource: "manual" })])]; // numbers from before history
  const t = tasksFor(content, dueCheckpoints(content, TODAY));
  assert.equal(count(t, "posts due for numbers"), 1);
  assert.equal(count(t, "posts need performance data"), 0);
});

test("missing published dates are counted separately and link to Content Bank", () => {
  const content = [item("m", [pub("m-ig", { publishedDate: "" }), pub("m-tt", { platform: "TikTok", publishedDate: "2026-02-30" })])];
  const t = tasksFor(content, dueCheckpoints(content, TODAY));
  const line = t.find((x) => x.t === "posted items need a published date");
  assert.deepEqual(line, { n: 2, t: "posted items need a published date", href: "/bank" });
  assert.equal(count(t, "posts due for numbers"), 0, "never treated as reminders");
});

test("reminder line links to Posting Manager", () => {
  const content = [item("a", [pub("a-ig")])];
  assert.deepEqual(tasksFor(content, dueCheckpoints(content, TODAY)).find((x) => x.t === "posts due for numbers"), { n: 1, t: "posts due for numbers", href: "/posting" });
});

test("zero counts are hidden", () => {
  const content = [item("x", [pub("x-ig", { status: "Idea", publishedDate: "" })])]; // nothing to do
  assert.deepEqual(tasksFor(content, dueCheckpoints(content, TODAY)), []);
});

test("before the browser date is known (empty reminders), the list equals the original one", () => {
  const content = [
    item("a", [pub("a-ig"), pub("a-tt", { platform: "TikTok", status: "Ready", publishedDate: "" })]),
    item("b", [pub("b-ig", { status: "Drafting", caption: "", publishedDate: "" })], { assetUrl: "" }),
    item("c", [pub("c-ig", { publishedDate: "" })]),
  ];
  assert.deepEqual(tasksFor(content, EMPTY_REMINDERS), original(content));
  assert.deepEqual(tasksFor(structuredClone(DEMO_CONTENT), EMPTY_REMINDERS), original(structuredClone(DEMO_CONTENT)));
});

test("demo samples never add reminder or missing-date lines", () => {
  const demo = structuredClone(DEMO_CONTENT);
  const t = tasksFor(demo, dueCheckpoints(demo, "2026-11-20"));
  assert.equal(count(t, "posts due for numbers"), 0);
  assert.equal(count(t, "posted items need a published date"), 0);
  assert.deepEqual(t, original(demo), "demo-only data: list unchanged");
});

test("existing task lines behave as before", () => {
  const content = [
    item("d", [pub("d-ig", { status: "Drafting", caption: "", publishedDate: "" }), pub("d-tt", { platform: "TikTok", status: "Drafting", caption: "has one", publishedDate: "" })]),
    item("r", [pub("r-ig", { status: "Ready", publishedDate: "" })], { assetUrl: "" }),
    item("i", [pub("i-ig", { status: "Idea", publishedDate: "" })], { assetUrl: "" }), // ideas don't need an asset
  ];
  const t = tasksFor(content, dueCheckpoints(content, TODAY));
  assert.deepEqual(t, [
    { n: 1, t: "drafts need a caption", href: "/bank" },
    { n: 1, t: "ready to schedule", href: "/posting" },
    { n: 1, t: "items missing an asset link", href: "/bank" },
  ]);
});

test("a full mix: every line counted once, in order", () => {
  const content = [
    item("due1", [pub("p1")]), // Day 7 due
    item("due2", [pub("p2", { publishedDate: "2026-11-22" })]), // Day 1 due
    item("done", [pub("p3", { metrics: M(1), metricsSource: "manual", snapshots: [{ id: "s", at: "x", capturedOn: "2026-11-24", source: "manual", metrics: M(1) }] })]), // Day 7 done
    item("old", [pub("p4", { publishedDate: "2026-08-01" })]), // expired, no numbers
    item("nodate", [pub("p5", { publishedDate: "" })]),
  ];
  const t = tasksFor(content, dueCheckpoints(content, TODAY));
  assert.deepEqual(t, [
    { n: 2, t: "posts due for numbers", href: "/posting" },
    { n: 1, t: "posted items need a published date", href: "/bank" },
    { n: 2, t: "posts need performance data", href: "/analytics" }, // "old" and "nodate"; not the two due
  ]);
});

test("buildTasks never changes its input", () => {
  const content = [item("a", [pub("a-ig")]), item("b", [pub("b-ig", { publishedDate: "" })])];
  const before = JSON.stringify(content);
  tasksFor(content, dueCheckpoints(content, TODAY));
  assert.equal(JSON.stringify(content), before);
});
