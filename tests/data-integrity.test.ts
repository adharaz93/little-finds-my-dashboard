import { test } from "node:test";
import assert from "node:assert/strict";
import { KEY_BEFORE_RESET, KEY_V1, KEY_V2, KEY_V2_UNREADABLE, loadState, migrateContent, serialize, type Quarantined } from "../src/lib/migrate";
import { DEMO_CONTENT } from "../src/lib/demo-data";
import { flattenPosts } from "../src/lib/posts";
import { comparison, highlights, measured, totals } from "../src/lib/analytics";
import type { ContentItem } from "../src/lib/types";

// In-memory localStorage. `failWrites` simulates a full or blocked storage.
function fakeStorage(init: Record<string, string> = {}, opts: { failWrites?: boolean; failReads?: boolean } = {}) {
  const data = new Map(Object.entries(init));
  return {
    data,
    getItem(k: string) {
      if (opts.failReads) throw new Error("blocked");
      return data.has(k) ? data.get(k)! : null;
    },
    setItem(k: string, v: string) {
      if (opts.failWrites) throw new Error("quota");
      data.set(k, v);
    },
  };
}

const userItem = (over: Partial<ContentItem> = {}): ContentItem => ({
  id: "u1", title: "My post", pillar: "Promo", idea: "", assetUrl: "", notes: "",
  publications: [{
    id: "u1-ig", platform: "Instagram", caption: "hi", status: "Posted", scheduledDate: "2026-11-20", publishedDate: "2026-11-20",
    postUrl: "", postId: "", metrics: { reach: 1000, impressions: null, likes: 50, comments: 5, shares: 5, saves: null },
    metricsSource: "manual", lastSyncedAt: null, snapshots: [],
  }],
  ...over,
});

const v1Item = { id: "x1", title: "Old post", caption: "cap", platform: "Instagram", pillar: "Promo", status: "Posted", date: "2026-10-01", assetUrl: "", notes: "", postUrl: "", metrics: { reach: 100, impressions: 120, likes: 10, comments: 1, shares: 1, saves: 2, clicks: 0 } };

/* ---------- migration ---------- */

test("first run with empty storage shows demo", () => {
  const r = loadState(fakeStorage());
  assert.equal(r.source, "demo");
  assert.equal(r.canWrite, true);
  assert.ok(r.content.every((c) => c.isDemo));
});

test("valid v2 loads and wins over v1", () => {
  const s = fakeStorage({ [KEY_V2]: JSON.stringify({ version: 2, content: [userItem()], assets: [] }), [KEY_V1]: JSON.stringify({ content: [v1Item] }) });
  const r = loadState(s);
  assert.equal(r.source, "v2");
  assert.deepEqual(r.content.map((c) => c.id), ["u1"]);
  assert.equal(r.notices.length, 0);
});

test("malformed v2 is backed up and v1 is recovered, never demo", () => {
  const s = fakeStorage({ [KEY_V2]: "{not json", [KEY_V1]: JSON.stringify({ content: [v1Item], assets: [] }) });
  const r = loadState(s, 123);
  assert.equal(r.source, "v1");
  assert.equal(r.canWrite, true);
  assert.equal(s.data.get(KEY_V2_UNREADABLE + "123"), "{not json");
  assert.equal(r.content[0].id, "x1");
  assert.equal(r.content[0].publications[0].metricsSource, "manual");
  assert.equal(s.data.get(KEY_V1), JSON.stringify({ content: [v1Item], assets: [] }), "v1 backup untouched");
});

test("v2 without a content array counts as unreadable", () => {
  const s = fakeStorage({ [KEY_V2]: JSON.stringify({ version: 2, content: "oops" }), [KEY_V1]: JSON.stringify({ content: [v1Item] }) });
  const r = loadState(s, 1);
  assert.equal(r.source, "v1");
  assert.ok(s.data.has(KEY_V2_UNREADABLE + "1"));
});

test("unreadable v2 that cannot be backed up turns saving off", () => {
  const s = fakeStorage({ [KEY_V2]: "{broken" }, { failWrites: true });
  const r = loadState(s);
  assert.equal(r.canWrite, false);
  assert.equal(s.data.get(KEY_V2), "{broken");
});

test("unreadable storage turns saving off", () => {
  const r = loadState(fakeStorage({}, { failReads: true }));
  assert.equal(r.canWrite, false);
  assert.equal(r.notices.length, 1);
});

test("unreadable v1 is left untouched", () => {
  const s = fakeStorage({ [KEY_V1]: "garbage" });
  const r = loadState(s);
  assert.equal(r.source, "demo");
  assert.equal(s.data.get(KEY_V1), "garbage");
  assert.ok(r.notices.some((n) => n.includes(KEY_V1)));
});

/* ---------- record validation ---------- */

test("bad records are quarantined, valid ones kept, nothing thrown", () => {
  const q: Quarantined[] = [];
  const good = userItem();
  const out = migrateContent([null, 42, { title: "no id" }, good, { id: "u2", title: "bad pub", publications: [{ id: "p", platform: "MySpace", status: "Posted" }, good.publications[0]] }], q);
  assert.deepEqual(out.map((c) => c.id), ["u1", "u2"]);
  assert.equal(out[1].publications.length, 1);
  assert.equal(q.filter((x) => x.kind === "content").length, 3);
  assert.equal(q.filter((x) => x.kind === "publication").length, 1);
});

test("unreadable metrics are set aside, the publication stays", () => {
  const q: Quarantined[] = [];
  const item = userItem();
  (item.publications[0] as unknown as { metrics: unknown }).metrics = { reach: "lots", likes: 1, comments: 1, shares: 1 };
  const [c] = migrateContent([item], q);
  assert.equal(c.publications[0].metrics, null);
  assert.equal(c.publications[0].metricsSource, null);
  assert.equal(c.publications[0].caption, "hi");
  assert.equal(q[0].kind, "metrics");
});

test("missing impressions and saves become null, not zero", () => {
  const item = userItem();
  (item.publications[0] as unknown as { metrics: unknown }).metrics = { reach: 10, likes: 1, comments: 0, shares: 0 };
  const [c] = migrateContent([item]);
  assert.equal(c.publications[0].metrics?.impressions, null);
  assert.equal(c.publications[0].metrics?.saves, null);
});

test("missing snapshots and text fields are filled safely; extra fields kept", () => {
  const raw = { id: "u3", title: "T", custom: "keep me", publications: [{ id: "p3", platform: "TikTok", status: "Idea", future: 1 }] };
  const [c] = migrateContent([raw]);
  assert.deepEqual(c.publications[0].snapshots, []);
  assert.equal(c.publications[0].caption, "");
  assert.equal((c as unknown as { custom: string }).custom, "keep me");
  assert.equal((c.publications[0] as unknown as { future: number }).future, 1);
});

test("v1 unknown platform/status are recorded in notes, not silently changed", () => {
  const [c] = migrateContent([{ ...v1Item, platform: "Facebook", status: "Live" }]);
  assert.equal(c.publications[0].platform, "Instagram");
  assert.equal(c.publications[0].status, "Idea");
  assert.match(c.notes, /Facebook/);
  assert.match(c.notes, /Live/);
});

test("quarantine survives a save and reload", () => {
  const q: Quarantined[] = [{ kind: "content", reason: "missing id", value: { title: "orphan" } }];
  const s = fakeStorage({ [KEY_V2]: serialize([userItem()], [], q) });
  const r = loadState(s);
  assert.deepEqual(r.quarantine, q);
  assert.equal(r.notices.length, 0, "old quarantine is not re-announced");
});

test("unreadable assets are quarantined, valid assets kept", () => {
  const s = fakeStorage({ [KEY_V2]: JSON.stringify({ content: [], assets: [{ id: "a", name: "n", type: "Photo", url: "", tags: "" }, { id: "b", type: "Hologram" }] }) });
  const r = loadState(s);
  assert.deepEqual(r.assets.map((a) => a.id), ["a"]);
  assert.equal(r.quarantine[0].kind, "asset");
});

/* ---------- demo identification ---------- */

test("an edited sample with a matching id and title stays user-owned when not flagged demo", () => {
  const sample = structuredClone(DEMO_CONTENT[0]);
  delete sample.isDemo;
  sample.publications[0].metricsSource = "manual";
  sample.publications[0].metrics = { ...sample.publications[0].metrics!, likes: 999 };
  const [c] = migrateContent([sample]);
  assert.equal(c.isDemo, undefined);
  assert.equal(c.publications[0].metricsSource, "manual");
});

test("v1 sample edited by the user stays manual", () => {
  const edited = { id: "c1", title: "Wooden stacking toys: 3 ways to play", caption: "my own caption", platform: "Instagram", pillar: "Product Finds", status: "Posted", date: "2026-11-03", assetUrl: "", notes: "", postUrl: "", metrics: { reach: 4200, impressions: 5600, likes: 310, comments: 42, shares: 55, saves: 120, clicks: 88 } };
  const [c] = migrateContent([edited]);
  assert.equal(c.isDemo, undefined);
  assert.equal(c.publications[0].metricsSource, "manual");
});

test("untouched v1 sample becomes the demo sample", () => {
  const untouched = { id: "c5", title: "Year-end sale teaser", caption: "Demo caption: something sweet is coming.", platform: "Instagram", pillar: "Promo", status: "Ready", date: "2026-11-29", assetUrl: "", notes: "", postUrl: "", metrics: null };
  const [c] = migrateContent([untouched]);
  assert.equal(c.isDemo, true);
});

test("stored demo flag is kept, so demo samples stay in the demo preview", () => {
  const out = migrateContent(structuredClone(DEMO_CONTENT));
  assert.ok(out.every((c) => c.isDemo === true));
  assert.equal(measured(flattenPosts(out), "real").length, 0);
});

test("an unflagged record identical to a sample is still demo", () => {
  const sample = structuredClone(DEMO_CONTENT[1]);
  delete sample.isDemo;
  const [c] = migrateContent([sample]);
  assert.equal(c.isDemo, true);
});

/* ---------- analytics ---------- */

test("posts without reach do not count as 0% in averages", () => {
  const a = userItem();
  const b = userItem({ id: "u2", publications: [{ ...userItem().publications[0], id: "u2-ig", metrics: { reach: 0, impressions: null, likes: 3, comments: 0, shares: 0, saves: null } }] });
  const posts = measured(flattenPosts([a, b]), "real");
  const t = totals(posts);
  assert.equal(t.avgRate, 6); // only post a: 60 / 1000
  assert.equal(totals([]).avgRate, null);
  const rows = comparison([a, b], posts);
  assert.equal(rows.find((r) => r.content.id === "u2")!.rate, null);
  const best = highlights(posts).find((h) => h.label === "Best-performing content")!;
  assert.equal(best.value, "My post");
});

test("impressions and saves stay null when no post reports them", () => {
  const t = totals(measured(flattenPosts([userItem()]), "real"));
  assert.equal(t.impressions, null);
  assert.equal(t.saves, null);
});

test("backup-before-reset key is distinct from live keys", () => {
  assert.notEqual(KEY_BEFORE_RESET, KEY_V2);
  assert.notEqual(KEY_BEFORE_RESET, KEY_V1);
});
