import { test } from "node:test";
import assert from "node:assert/strict";
import { CHECKPOINTS, checkpointDone, checkpointFor, dueCheckpoints } from "../src/lib/reminders";
import { addDays, daysBetween } from "../src/lib/analytics";
import { localToday } from "../src/lib/capture";
import type { ContentItem, Metrics, MetricSnapshot, Publication, Status } from "../src/lib/types";

const M = (reach: number): Metrics => ({ reach, impressions: null, likes: 1, comments: 0, shares: 0, saves: null, clicks: null });
const cap = (capturedOn: string | undefined, over: Partial<MetricSnapshot> = {}): MetricSnapshot =>
  ({ id: `s-${capturedOn ?? "x"}-${Math.random()}`, at: "2026-11-20T01:00:00.000Z", ...(capturedOn ? { capturedOn } : {}), source: "manual", metrics: M(1), ...over });
const pub = (id: string, over: Partial<Publication> = {}): Publication => ({
  id, platform: "Instagram", caption: "", status: "Posted", scheduledDate: "2026-11-17", publishedDate: "2026-11-17", postUrl: "", postId: "",
  metrics: null, metricsSource: null, lastSyncedAt: null, snapshots: [], ...over,
});
const item = (id: string, pubs: Publication[], over: Partial<ContentItem> = {}): ContentItem => ({ id, title: `Title ${id}`, pillar: "Promo", idea: "", assetUrl: "", notes: "", publications: pubs, ...over });
const PUB = "2026-11-17";
const on = (age: number) => addDays(PUB, age); // today = publish date + age
const due = (content: ContentItem[], today: string) => dueCheckpoints(content, today).due;

/* ---------- daysBetween (direct coverage) ---------- */

test("daysBetween: same day, forwards, backwards", () => {
  assert.equal(daysBetween("2026-11-17", "2026-11-17"), 0);
  assert.equal(daysBetween("2026-11-17", "2026-11-18"), 1);
  assert.equal(daysBetween("2026-11-18", "2026-11-17"), -1);
  assert.equal(daysBetween("2026-11-17", "2026-12-17"), 30);
});

test("daysBetween: across month, year and leap-day boundaries", () => {
  assert.equal(daysBetween("2026-01-31", "2026-02-01"), 1);
  assert.equal(daysBetween("2026-12-31", "2027-01-01"), 1);
  assert.equal(daysBetween("2026-12-28", "2027-01-04"), 7);
  assert.equal(daysBetween("2028-02-28", "2028-03-01"), 2, "2028 is a leap year");
  assert.equal(daysBetween("2027-02-28", "2027-03-01"), 1);
  assert.equal(daysBetween("2026-01-01", "2027-01-01"), 365);
});

test("daysBetween is not shifted by daylight saving (Europe/London, March change)", () => {
  const saved = process.env.TZ;
  process.env.TZ = "Europe/London";
  try {
    assert.equal(daysBetween("2027-03-27", "2027-03-29"), 2, "clocks change on 28 Mar 2027");
    assert.equal(daysBetween("2027-03-01", "2027-04-01"), 31);
    assert.equal(addDays("2027-03-27", 2), "2027-03-29");
  } finally {
    if (saved === undefined) delete process.env.TZ;
    else process.env.TZ = saved;
  }
});

/* ---------- windows ---------- */

test("checkpoint windows: Day 1 for 1–6, Day 7 for 7–29, Day 30 for 30–44, then none", () => {
  const expect: [number, number | null][] = [[-3, null], [0, null], [1, 1], [6, 1], [7, 7], [29, 7], [30, 30], [44, 30], [45, null], [400, null]];
  for (const [age, cp] of expect) assert.equal(checkpointFor(age), cp, `age ${age}`);
  assert.deepEqual(CHECKPOINTS.map((c) => c.day), [1, 7, 30]);
});

test("a post with no captures gets the reminder for its current window only", () => {
  const c = [item("a", [pub("a-ig")])];
  assert.deepEqual(due(c, on(0)), [], "publish day: nothing yet");
  for (const [age, cp] of [[1, 1], [6, 1], [7, 7], [29, 7], [30, 30], [44, 30]] as const) {
    const r = due(c, on(age));
    assert.equal(r.length, 1, `age ${age}`);
    assert.equal(r[0].checkpoint, cp, `age ${age}`);
    assert.equal(r[0].age, age);
    assert.equal(r[0].dueOn, addDays(PUB, cp));
  }
  assert.deepEqual(due(c, on(45)), [], "expired");
  assert.deepEqual(due(c, on(100)), []);
});

test("a missed Day 1 is replaced by Day 7: one reminder per publication", () => {
  const r = due([item("a", [pub("a-ig")])], on(10));
  assert.equal(r.length, 1);
  assert.equal(r[0].checkpoint, 7);
});

/* ---------- what completes a checkpoint ---------- */

test("a capture on the checkpoint day, or later, completes it", () => {
  assert.deepEqual(due([item("a", [pub("a-ig", { snapshots: [cap(on(7))] })])], on(8)), [], "on the day");
  assert.deepEqual(due([item("a", [pub("a-ig", { snapshots: [cap(on(9))] })])], on(9)), [], "late capture");
  assert.deepEqual(due([item("a", [pub("a-ig", { snapshots: [cap(on(3))] })])], on(5)), [], "Day 1 done on day 3");
});

test("a capture before the checkpoint day doesn't complete it", () => {
  const r = due([item("a", [pub("a-ig", { snapshots: [cap(on(6))] })])], on(7));
  assert.equal(r.length, 1);
  assert.equal(r[0].checkpoint, 7);
  assert.equal(r[0].lastCapturedOn, on(6));
});

test("late capture: Day 7 done on day 9, Day 30 still comes later", () => {
  const p = pub("a-ig", { snapshots: [cap(on(9))] });
  assert.deepEqual(due([item("a", [p])], on(20)), []);
  const r = due([item("a", [p])], on(30));
  assert.equal(r[0].checkpoint, 30);
});

test("removed, undated and pre-publication captures never complete a checkpoint", () => {
  const cases: [string, MetricSnapshot][] = [
    ["removed", cap(on(8), { deleted: true })],
    ["undated", cap(undefined)],
    ["invalid date", cap("2026-02-30")],
    ["before publishing", cap(on(-2))],
  ];
  for (const [name, s] of cases) {
    const r = due([item("a", [pub("a-ig", { snapshots: [s] })])], on(8));
    assert.equal(r.length, 1, name);
    assert.equal(r[0].checkpoint, 7, name);
  }
  // Removed captures don't show as the last capture either.
  assert.equal(due([item("a", [pub("a-ig", { snapshots: [cap(on(8), { deleted: true })] })])], on(8))[0].lastCapturedOn, null);
});

test("numbers saved before history (no captures) still get a reminder", () => {
  const r = due([item("a", [pub("a-ig", { metrics: M(5), metricsSource: "manual" })])], on(2));
  assert.equal(r[0].checkpoint, 1);
});

test("checkpointDone reads only counted captures", () => {
  const p = pub("a-ig", { snapshots: [cap(on(30)), cap(on(40), { deleted: true })] });
  assert.ok(checkpointDone(p, 30));
  assert.ok(checkpointDone(p, 7), "a Day 30 capture also covers Day 7");
  assert.ok(!checkpointDone(pub("b", { snapshots: [cap(on(40), { deleted: true })] }), 30));
});

/* ---------- who is included ---------- */

test("demo content is never included", () => {
  const demo = item("d", [pub("d-ig")], { isDemo: true });
  assert.deepEqual(dueCheckpoints([demo], on(3)), { due: [], missingPublishedDate: [] });
  const demoNoDate = item("d2", [pub("d2-ig", { publishedDate: "" })], { isDemo: true });
  assert.deepEqual(dueCheckpoints([demoNoDate], on(3)).missingPublishedDate, []);
});

test("only Posted publications are included", () => {
  for (const status of ["Idea", "Drafting", "Ready", "Scheduled"] as Status[]) {
    assert.deepEqual(dueCheckpoints([item("a", [pub("a-ig", { status })])], on(3)), { due: [], missingPublishedDate: [] }, status);
  }
});

test("Posted without a valid published date: listed as missing, never as a reminder", () => {
  for (const bad of ["", "2026-02-30", "17/11/2026"]) {
    const r = dueCheckpoints([item("a", [pub("a-ig", { publishedDate: bad })])], on(3));
    assert.deepEqual(r.due, [], bad);
    assert.deepEqual(r.missingPublishedDate, [{ contentId: "a", publicationId: "a-ig", title: "Title a", platform: "Instagram" }], bad);
  }
});

test("a published date in the future gives no reminder and isn't listed as missing", () => {
  const r = dueCheckpoints([item("a", [pub("a-ig", { publishedDate: on(5) })])], on(0));
  assert.deepEqual(r, { due: [], missingPublishedDate: [] });
});

/* ---------- published date changes (nothing stored, everything recalculated) ---------- */

test("moving the published date recalculates window and completion", () => {
  const snapshots = [cap("2026-11-25")];
  const today = "2026-11-26";
  // Published 17 Nov: age 9 → Day 7, done by the 25 Nov capture (day 8).
  assert.deepEqual(due([item("a", [pub("a-ig", { publishedDate: "2026-11-17", snapshots })])], today), []);
  // Moved to 24 Nov: age 2 → Day 1, the 25 Nov capture is day 1 → done.
  assert.deepEqual(due([item("a", [pub("a-ig", { publishedDate: "2026-11-24", snapshots })])], today), []);
  // Moved to 26 Nov: publish day → nothing.
  assert.deepEqual(due([item("a", [pub("a-ig", { publishedDate: "2026-11-26", snapshots })])], today), []);
  // Moved to 20 Nov: age 6 → Day 1, the capture is day 5 → done.
  assert.deepEqual(due([item("a", [pub("a-ig", { publishedDate: "2026-11-20", snapshots })])], today), []);
  // Moved earlier to 27 Oct: age 30 → Day 30, the capture is day 29 → due.
  const r = due([item("a", [pub("a-ig", { publishedDate: "2026-10-27", snapshots })])], today);
  assert.equal(r[0].checkpoint, 30);
  // Moved after the capture: it becomes a pre-publication capture and stops counting.
  const r2 = due([item("a", [pub("a-ig", { publishedDate: "2026-11-25", snapshots: [cap("2026-11-24")] })])], "2026-11-27");
  assert.equal(r2[0].checkpoint, 1);
});

/* ---------- several platforms, dates, ordering ---------- */

test("each platform on one item gets its own reminder", () => {
  const c = [item("a", [pub("a-ig"), pub("a-tt", { platform: "TikTok", snapshots: [cap(on(7))] }), pub("a-th", { platform: "Threads", publishedDate: "2026-11-20" })])];
  // Today 25 Nov. Instagram (17 Nov, age 8): Day 7, due 24 Nov. TikTok: captured on day 7, done.
  // Threads (20 Nov, age 5): Day 1, due 21 Nov, so it comes first (most overdue).
  const r = due(c, on(8));
  assert.deepEqual(r.map((x) => [x.publicationId, x.checkpoint, x.dueOn]), [["a-th", 1, "2026-11-21"], ["a-ig", 7, "2026-11-24"]]);
});

test("dueOn and age across month and year boundaries", () => {
  const r = due([item("a", [pub("a-ig", { publishedDate: "2026-12-28" })])], "2027-01-04");
  assert.deepEqual([r[0].checkpoint, r[0].age, r[0].dueOn], [7, 7, "2027-01-04"]);
  const r2 = due([item("b", [pub("b-ig", { publishedDate: "2026-12-31" })])], "2027-01-30");
  assert.deepEqual([r2[0].checkpoint, r2[0].age, r2[0].dueOn], [30, 30, "2027-01-30"]);
});

test("Malaysia early morning: today is the local date, not the UTC one", () => {
  const saved = process.env.TZ;
  process.env.TZ = "Asia/Kuala_Lumpur";
  try {
    const early = new Date(2026, 10, 18, 1, 30); // 18 Nov 01:30 local = 17 Nov in UTC
    assert.equal(early.toISOString().slice(0, 10), "2026-11-17");
    const today = localToday(early);
    assert.equal(today, "2026-11-18");
    const r = due([item("a", [pub("a-ig")])], today);
    assert.deepEqual([r[0].checkpoint, r[0].age], [1, 1], "using the UTC date would have shown nothing (day 0)");
  } finally {
    if (saved === undefined) delete process.env.TZ;
    else process.env.TZ = saved;
  }
});

test("ordering: most overdue first, then title, then platform", () => {
  const c = [
    item("z", [pub("z-ig", { publishedDate: "2026-11-20" })], { title: "Zebra" }), // Day 1 due 21 Nov
    item("b", [pub("b-tt", { platform: "TikTok" }), pub("b-ig")], { title: "Apple" }), // Day 7 due 24 Nov
    item("a", [pub("a-ig", { publishedDate: "2026-11-19" })], { title: "Mango" }), // Day 7 due 26 Nov
    item("m1", [pub("m1-ig", { publishedDate: "" })], { title: "Pear" }),
    item("m2", [pub("m2-tt", { platform: "TikTok", publishedDate: "" }), pub("m2-ig", { publishedDate: "" })], { title: "Kiwi" }),
  ];
  const r = dueCheckpoints(c, "2026-11-26");
  assert.deepEqual(r.due.map((x) => `${x.title}/${x.platform}/${x.dueOn}`), ["Zebra/Instagram/2026-11-21", "Apple/Instagram/2026-11-24", "Apple/TikTok/2026-11-24", "Mango/Instagram/2026-11-26"]);
  assert.deepEqual(r.missingPublishedDate.map((x) => `${x.title}/${x.platform}`), ["Kiwi/Instagram", "Kiwi/TikTok", "Pear/Instagram"]);
  // Same input in a different order gives the same result.
  assert.deepEqual(dueCheckpoints([...c].reverse(), "2026-11-26"), r);
});

/* ---------- purity and invalid input ---------- */

test("the input is never changed", () => {
  const c = [item("a", [pub("a-ig", { snapshots: [cap(on(3)), cap(undefined), cap(on(8), { deleted: true })] })])];
  const before = JSON.stringify(c);
  dueCheckpoints(c, on(10));
  assert.equal(JSON.stringify(c), before);
});

test("an invalid today returns empty lists", () => {
  const c = [item("a", [pub("a-ig")]), item("b", [pub("b-ig", { publishedDate: "" })])];
  for (const bad of ["", "2026-02-30", "26/11/2026", "today"]) {
    assert.deepEqual(dueCheckpoints(c, bad), { due: [], missingPublishedDate: [] }, bad);
  }
});

test("no content, no reminders", () => {
  assert.deepEqual(dueCheckpoints([], "2026-11-26"), { due: [], missingPublishedDate: [] });
});
