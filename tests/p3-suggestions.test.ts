import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSuggestions, ideaContent, withCrossPost, type Suggestion } from "../src/lib/suggestions";
import { EMPTY_PREFS, KEY_PREFS, SNOOZE_DAYS, dismiss, isSnoozed, parsePrefs, readPrefs, writePrefs } from "../src/lib/prefs";
import { flattenPosts } from "../src/lib/posts";
import { measured } from "../src/lib/analytics";
import { migrateContent, serialize } from "../src/lib/migrate";
import type { ContentItem, Format, Metrics, Platform, Publication, Status } from "../src/lib/types";

const TODAY = "2026-11-27";
const M = (reach: number, likes: number): Metrics => ({ reach, impressions: null, likes, comments: 0, shares: 0, saves: null, clicks: null });
let n = 0;
const item = (o: { platform?: Platform; rate?: number; published?: string; pillar?: string; format?: Format; tags?: string[]; title?: string; status?: Status; scheduled?: string; noMetrics?: boolean; extra?: Publication[] } = {}): ContentItem => {
  const id = `c${++n}`;
  const status = o.status ?? "Posted";
  const pub: Publication = {
    id: `${id}-p`, platform: o.platform ?? "Instagram", caption: "", status, scheduledDate: o.scheduled ?? o.published ?? "2026-11-10",
    publishedDate: status === "Posted" ? o.published ?? "2026-11-10" : "", postUrl: "", postId: "",
    metrics: o.noMetrics || status !== "Posted" ? null : M(1000, Math.round(10 * (o.rate ?? 5))), metricsSource: o.noMetrics || status !== "Posted" ? null : "manual",
    lastSyncedAt: null, snapshots: [], ...(o.format ? { format: o.format } : {}),
  };
  return { id, title: o.title ?? `Title ${id}`, pillar: o.pillar ?? "Promo", idea: "", assetUrl: "", notes: "", publications: [pub, ...(o.extra ?? [])], ...(o.tags ? { tags: o.tags } : {}) };
};
const run = (content: ContentItem[], today: string | null = TODAY) => buildSuggestions(content, measured(flattenPosts(content), "real"), today);
const ids = (s: Suggestion[]) => s.map((x) => x.id);
const lined = () => [item({ status: "Scheduled", scheduled: "2026-11-29" }), item({ status: "Ready", scheduled: "2026-12-01" })];

/* ---------- basics ---------- */

test("no browser date, no suggestions", () => {
  assert.deepEqual(run([item()], null), []);
  assert.deepEqual(run([item()], "nope"), []);
});

/* ---------- pipeline ---------- */

test("thin pipeline is suggested only for an active account with under 2 posts lined up this week", () => {
  assert.ok(ids(run([item()])).includes("pipeline"));
  const p = run([item()]).find((s) => s.id === "pipeline")!;
  assert.equal(p.why, "Nothing is ready or scheduled for the next 7 days.");
  assert.equal(run([item(), lined()[0]]).find((s) => s.id === "pipeline")!.why, "Only 1 post ready or scheduled for the next 7 days.");
  assert.deepEqual(p.action, { type: "link", href: "/bank", label: "Open Content Bank" });
  assert.ok(!ids(run([item(), ...lined()])).includes("pipeline"), "2 lined up is enough");
  assert.ok(!ids(run([item({ status: "Idea", scheduled: "2026-12-30" })])).includes("pipeline"), "nothing posted yet: no nagging");
  assert.ok(ids(run([item(), item({ status: "Scheduled", scheduled: "2026-12-10" })])).includes("pipeline"), "outside the 7-day window doesn't count");
});

/* ---------- fixed-date moments ---------- */

test("a fixed-date moment within 21 days is suggested; further away or already covered is not", () => {
  const s = run([item()]).find((x) => x.kind === "moment")!;
  assert.equal(s.id, "moment:12-12-2026");
  assert.equal(s.title, "12.12 sale is in 15 days");
  assert.equal(s.action.type === "new" && s.action.spec.scheduledDate, "2026-12-12");
  assert.ok(!ids(run([item()])).some((i) => i.startsWith("moment:christmas")), "Christmas is 28 days away");
  assert.ok(!ids(run([item(), item({ title: "Our 12.12 picks", status: "Idea", scheduled: "2026-12-10" })])).some((i) => i.startsWith("moment:12-12")), "already planned");
});

test("moments roll over into next year", () => {
  const s = run([item()], "2026-12-20").filter((x) => x.kind === "moment").map((x) => x.id);
  assert.ok(s.includes("moment:new-year-2027"));
  assert.ok(s.includes("moment:christmas-2026"));
});

/* ---------- pillar / format / topic ---------- */

const groupData = () => [
  item({ rate: 9, pillar: "Product Finds", format: "Carousel", tags: ["gift guide"] }),
  item({ rate: 9, pillar: "Product Finds", format: "Carousel", tags: ["gift guide"] }),
  item({ rate: 9, pillar: "Product Finds", format: "Carousel", tags: ["gift guide"] }),
  item({ rate: 3, pillar: "Parenting Tips", format: "Photo" }),
  item({ rate: 3, pillar: "Parenting Tips", format: "Photo" }),
  item({ rate: 3, pillar: "Parenting Tips", format: "Photo" }),
];

test("best pillar, format and topic above 1.2× are suggested with evidence and a pre-filled idea", () => {
  const s = run([...groupData(), ...lined()]);
  const pillar = s.find((x) => x.id === "pillar:Product Finds")!;
  assert.equal(pillar.title, "Do more Product Finds");
  assert.equal(pillar.why, "Product Finds posts get 1.5× your usual engagement over 3 posts (early signal).");
  assert.deepEqual(pillar.action.type === "new" && pillar.action.spec, { title: "New Product Finds post", pillar: "Product Finds", idea: pillar.why, platform: "Instagram", scheduledDate: TODAY });
  const format = s.find((x) => x.id === "format:Carousel")!;
  assert.equal(format.action.type === "new" && format.action.spec.format, "Carousel");
  const topic = s.find((x) => x.id === "topic:gift guide")!;
  assert.deepEqual(topic.action.type === "new" && topic.action.spec.tags, ["gift guide"]);
  assert.equal(topic.action.type === "new" && topic.action.spec.pillar, "Product Finds");
});

test("no group suggestion when nothing is clearly above usual", () => {
  const flat = [item({ rate: 5, pillar: "A" }), item({ rate: 5, pillar: "A" }), item({ rate: 5, pillar: "A" })];
  assert.ok(!run([...flat, ...lined()]).some((x) => ["pillar", "format", "topic"].includes(x.kind)));
});

test("a suggested format that doesn't exist on the platform is left off the idea", () => {
  const tt = [1, 2, 3].map(() => item({ platform: "TikTok", rate: 9, format: "Reel" })).concat([1, 2, 3].map(() => item({ platform: "TikTok", rate: 3 })));
  const f = run([...tt, ...lined()]).find((x) => x.kind === "format")!;
  assert.equal(f.action.type === "new" && f.action.spec.format, undefined, "TikTok has no Reel format");
});

/* ---------- follow-up and cross-post ---------- */

test("follow-up only for a standout post at least 30 days old, once", () => {
  const old = [item({ rate: 15, published: "2026-10-20", title: "Rainy day bin", tags: ["sensory"] }), item({ rate: 5, published: "2026-10-20" }), item({ rate: 5, published: "2026-10-20" })];
  const f = run([...old, ...lined()]).find((x) => x.kind === "followup")!;
  assert.equal(f.title, "Follow up “Rainy day bin”");
  assert.equal(f.action.type === "new" && f.action.spec.title, "Follow-up: Rainy day bin");
  assert.deepEqual(f.action.type === "new" && f.action.spec.tags, ["sensory"]);
  const recent = [item({ rate: 15, published: "2026-11-10" }), item({ rate: 5 }), item({ rate: 5 })];
  assert.ok(!run([...recent, ...lined()]).some((x) => x.kind === "followup"), "17 days old");
  assert.ok(!run([...old, ...lined(), item({ title: "Follow-up: Rainy day bin", status: "Idea", scheduled: "2026-12-20" })]).some((x) => x.kind === "followup"), "already made");
});

test("cross-post the strongest post to a platform you use that it isn't on", () => {
  const data = [item({ rate: 9, title: "Gift A" }), item({ rate: 5 }), item({ rate: 3 }), item({ platform: "TikTok", status: "Idea", scheduled: "2026-12-20" }), ...lined()];
  const c = run(data).find((x) => x.kind === "crosspost")!;
  assert.equal(c.title, "Post “Gift A” on TikTok");
  assert.deepEqual(c.action, { type: "crosspost", contentId: data[0].id, platform: "TikTok", scheduledDate: TODAY });
  assert.ok(!run([item({ rate: 9 }), item({ rate: 5 }), item({ rate: 3 }), ...lined()]).some((x) => x.kind === "crosspost"), "only Instagram used: nothing to cross-post to");
});

test("order is fixed by kind, then id; same input, same output", () => {
  const data = [...groupData(), item({ platform: "TikTok", status: "Idea", scheduled: "2026-12-20" })];
  const kinds = run(data).map((x) => x.kind);
  assert.deepEqual(kinds, ["pipeline", "moment", "pillar", "format", "topic", "crosspost"]);
  assert.deepEqual(ids(run([...data].reverse())), ids(run(data)));
});

test("building suggestions never changes the input", () => {
  const data = [...groupData(), ...lined()];
  const before = JSON.stringify(data);
  run(data);
  assert.equal(JSON.stringify(data), before);
});

/* ---------- turning suggestions into content ---------- */

test("ideaContent builds a valid Idea item that loads unchanged", () => {
  let k = 0;
  const made = ideaContent({ title: "New Reel", pillar: "Promo", idea: "why", platform: "Instagram", format: "Reel", tags: ["sale"], scheduledDate: TODAY }, () => `id${++k}`);
  assert.equal(made.id, "id1");
  assert.equal(made.publications[0].status, "Idea");
  assert.equal(made.publications[0].metrics, null);
  assert.equal(made.publications[0].format, "Reel");
  assert.deepEqual(made.tags, ["sale"]);
  assert.equal(JSON.stringify(migrateContent([JSON.parse(JSON.stringify(made))])[0]), JSON.stringify(made), "byte-identical through the loader");
  const noFormat = ideaContent({ title: "x", pillar: "Promo", idea: "", platform: "TikTok", format: "Reel", scheduledDate: TODAY }, () => "z");
  assert.equal("format" in noFormat.publications[0], false, "invalid format for TikTok dropped");
});

test("withCrossPost adds one Idea for the platform, never twice, without changing the original", () => {
  const original = item({ rate: 9 });
  const before = JSON.stringify(original);
  const next = withCrossPost(original, "TikTok", TODAY, () => "new")!;
  assert.deepEqual(next.publications.map((p) => [p.platform, p.status]), [["Instagram", "Posted"], ["TikTok", "Idea"]]);
  assert.equal(withCrossPost(next, "TikTok", TODAY, () => "x"), null);
  assert.equal(JSON.stringify(original), before);
});

/* ---------- dismiss preferences ---------- */

test("dismissed suggestions stay hidden for 30 days, then return", () => {
  const p = dismiss(EMPTY_PREFS, "pillar:Promo", "2026-11-01");
  assert.ok(isSnoozed(p, "pillar:Promo", "2026-11-01"));
  assert.ok(isSnoozed(p, "pillar:Promo", "2026-11-30"), "day 29");
  assert.ok(!isSnoozed(p, "pillar:Promo", "2026-12-01"), "day 30");
  assert.ok(!isSnoozed(p, "other", "2026-11-02"));
  assert.equal(SNOOZE_DAYS, 30);
});

test("dismiss drops expired entries so the key stays small", () => {
  const p = dismiss({ dismissed: { old: "2026-09-01", recent: "2026-11-20" } }, "new", TODAY);
  assert.deepEqual(p, { dismissed: { recent: "2026-11-20", new: TODAY } });
});

test("prefs: malformed values fall back safely; writes never throw", () => {
  for (const bad of [null, "", "{", "[]", "42", '{"dismissed":[]}', '{"dismissed":"x"}']) assert.deepEqual(parsePrefs(bad), { dismissed: {} }, String(bad));
  assert.deepEqual(parsePrefs('{"dismissed":{"a":"2026-11-01","b":"nope","c":5}}'), { dismissed: { a: "2026-11-01" } });
  assert.deepEqual(readPrefs({ getItem: () => { throw new Error("blocked"); } }), { dismissed: {} });
  const data = new Map<string, string>();
  assert.equal(writePrefs({ getItem: (k) => data.get(k) ?? null, setItem: (k, v) => { data.set(k, v); } }, { dismissed: { a: TODAY } }), true);
  assert.equal(data.get(KEY_PREFS), JSON.stringify({ dismissed: { a: TODAY } }));
  assert.equal(writePrefs({ getItem: () => null, setItem: () => { throw new Error("quota"); } }, EMPTY_PREFS), false);
});

test("preferences are never part of saved data or backups", () => {
  const raw = serialize([item()], [], []);
  assert.ok(!raw.includes(KEY_PREFS));
  assert.ok(!raw.includes("dismissed"));
});
