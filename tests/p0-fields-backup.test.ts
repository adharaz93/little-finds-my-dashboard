import { test } from "node:test";
import assert from "node:assert/strict";
import { KEY_V2, loadState, migrateContent, readBackup, serialize, type Quarantined } from "../src/lib/migrate";
import { DEMO_ASSETS, DEMO_CONTENT } from "../src/lib/demo-data";
import { cleanTags, parseTags } from "../src/lib/utils";
import type { ContentItem } from "../src/lib/types";

const item = (over: Record<string, unknown> = {}, pubOver: Record<string, unknown> = {}) => ({
  id: "u1", title: "My post", pillar: "Promo", idea: "", assetUrl: "", notes: "",
  publications: [{ id: "u1-ig", platform: "Instagram", caption: "", status: "Idea", scheduledDate: "2026-12-01", publishedDate: "", postUrl: "", postId: "", metrics: null, metricsSource: null, lastSyncedAt: null, snapshots: [], ...pubOver }],
  ...over,
});

/* ---------- format ---------- */

test("existing saves without format or tags load unchanged", () => {
  const [c] = migrateContent([item()]);
  assert.equal("format" in c.publications[0], false);
  assert.equal("tags" in c, false);
  const demo = migrateContent(structuredClone(DEMO_CONTENT));
  assert.equal(JSON.stringify(demo), JSON.stringify(DEMO_CONTENT));
});

test("a known format is kept", () => {
  const [c] = migrateContent([item({}, { format: "Reel" })]);
  assert.equal(c.publications[0].format, "Reel");
});

test("an unknown format is set aside, the publication stays", () => {
  const q: Quarantined[] = [];
  const [c] = migrateContent([item({}, { format: "Hologram" })], q);
  assert.equal(c.publications.length, 1);
  assert.equal(c.publications[0].format, undefined);
  assert.equal(q.length, 1);
  assert.deepEqual([q[0].kind, q[0].field, q[0].value, q[0].publicationId], ["field", "format", "Hologram", "u1-ig"]);
});

test("an empty format is treated as not set, not as an error", () => {
  const q: Quarantined[] = [];
  const [c] = migrateContent([item({}, { format: "" })], q);
  assert.equal(c.publications[0].format, undefined);
  assert.equal(q.length, 0);
});

/* ---------- tags ---------- */

test("tags are trimmed, lowercased, single-spaced and unique", () => {
  assert.deepEqual(cleanTags(["  Toddler  Play ", "toddler play", "", "Gift Guide"]), ["toddler play", "gift guide"]);
  assert.deepEqual(parseTags("Sensory, , sensory ,Rainy Day"), ["sensory", "rainy day"]);
  const [c] = migrateContent([item({ tags: ["Gift Guide", "gift guide", " RM50 "] })]);
  assert.deepEqual(c.tags, ["gift guide", "rm50"]);
});

test("a comma-separated tag string is read as a list", () => {
  const [c] = migrateContent([item({ tags: "play, Play, books" })]);
  assert.deepEqual(c.tags, ["play", "books"]);
});

test("unreadable tags are set aside without losing the readable ones", () => {
  const q: Quarantined[] = [];
  const [c] = migrateContent([item({ tags: ["play", 42, null] })], q);
  assert.deepEqual(c.tags, ["play"]);
  assert.equal(q[0].field, "tags");
  assert.deepEqual(q[0].value, ["play", 42, null]);
  const q2: Quarantined[] = [];
  const [d] = migrateContent([item({ tags: { a: 1 } })], q2);
  assert.equal(d.tags, undefined);
  assert.equal(q2.length, 1);
});

test("empty tags are dropped, not stored as []", () => {
  const [c] = migrateContent([item({ tags: [" ", ""] })]);
  assert.equal("tags" in c, false);
});

test("format and tags survive a save and reload", () => {
  const [c] = migrateContent([item({ tags: ["play"] }, { format: "Carousel" })]);
  const r = loadState({ getItem: (k) => (k === KEY_V2 ? serialize([c], [], []) : null), setItem: () => {} });
  assert.equal(r.content[0].publications[0].format, "Carousel");
  assert.deepEqual(r.content[0].tags, ["play"]);
});

/* ---------- backup ---------- */

const mine: ContentItem = migrateContent([item({ tags: ["play"] }, { format: "Reel" })])[0];

test("an exported backup re-imports to identical data", () => {
  const q: Quarantined[] = [{ kind: "content", reason: "missing id", value: { title: "orphan" } }];
  const raw = serialize([mine], DEMO_ASSETS, q);
  const b = readBackup(raw)!;
  assert.equal(serialize(b.content, b.assets!, b.quarantine), raw);
  assert.equal(b.unreadable, 0, "records already set aside are not counted again");
});

test("a file that is not a backup is rejected", () => {
  assert.equal(readBackup("not json"), null);
  assert.equal(readBackup(JSON.stringify({ hello: "world" })), null);
  assert.equal(readBackup(JSON.stringify(null)), null);
});

test("a backup without assets keeps the current assets", () => {
  const b = readBackup(JSON.stringify({ version: 2, content: [mine] }))!;
  assert.equal(b.assets, null);
});

test("unreadable records in a backup are counted and set aside", () => {
  const b = readBackup(JSON.stringify({ version: 2, content: [mine, { title: "no id" }, item({ id: "u2" }, { format: "Zine" })], assets: [] }))!;
  assert.deepEqual(b.content.map((c) => c.id), ["u1", "u2"]);
  assert.equal(b.unreadable, 2);
  assert.equal(b.quarantine.length, 2);
});
