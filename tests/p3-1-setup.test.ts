import { test } from "node:test";
import assert from "node:assert/strict";
import { PILLARS, type Asset, type ContentItem } from "../src/lib/types";
import { DEMO_ASSETS, DEMO_CONTENT } from "../src/lib/demo-data";
import { demoCounts, pillarOptions, removeDemoMessage, withoutDemoSamples } from "../src/lib/setup";
import { MOMENTS } from "../src/lib/suggestions";
import { loadState, serialize } from "../src/lib/migrate";

const mine = (id: string, pillar: string): ContentItem => ({ id, title: `Mine ${id}`, pillar, idea: "", assetUrl: "", notes: "", publications: [] });
const myAsset: Asset = { id: "own1", name: "My Canva folder", type: "Design", url: "https://canva.example/f", tags: "carousel" };

/* ---------- pillars ---------- */

test("the account's five pillars are offered, in order", () => {
  assert.deepEqual([...PILLARS], [
    "Motherhood & Real Life",
    "Baby & Toddler Essentials",
    "Learning & Development",
    "Home & Family Finds",
    "Little Finds & Product Discovery",
  ]);
  assert.deepEqual(pillarOptions([]), [...PILLARS]);
});

test("older pillars already saved stay selectable, after the current ones, without duplicates", () => {
  const opts = pillarOptions([mine("a", "Promo"), mine("b", "Promo"), mine("c", "Community"), mine("d", PILLARS[1]), mine("e", "  ")]);
  assert.deepEqual(opts, [...PILLARS, "Community", "Promo"]);
});

test("the pillar being edited is always an option, even if no other content uses it", () => {
  assert.ok(pillarOptions([], "Behind the Scenes").includes("Behind the Scenes"));
  assert.deepEqual(pillarOptions([], PILLARS[0]), [...PILLARS], "a current pillar isn't listed twice");
});

test("every date-based suggestion uses one of the account's pillars", () => {
  for (const m of MOMENTS) assert.ok((PILLARS as readonly string[]).includes(m.pillar), `${m.key} uses ${m.pillar}`);
});

/* ---------- removing the demo samples ---------- */

test("removing demo samples keeps the user's own content and assets, in order", () => {
  const content = [mine("u1", PILLARS[0]), ...structuredClone(DEMO_CONTENT), mine("u2", "Promo")];
  const assets = [myAsset, ...DEMO_ASSETS];
  assert.deepEqual(demoCounts(content, assets), { content: DEMO_CONTENT.length, assets: DEMO_ASSETS.length });
  const r = withoutDemoSamples(content, assets);
  assert.deepEqual(r.content.map((c) => c.id), ["u1", "u2"]);
  assert.deepEqual(r.assets, [myAsset]);
  assert.deepEqual(demoCounts(r.content, r.assets), { content: 0, assets: 0 });
});

test("a demo asset the user edited is kept; only untouched demo links are removed", () => {
  const edited = { ...DEMO_ASSETS[0], url: "https://drive.example/real-folder" };
  const r = withoutDemoSamples([], [edited, DEMO_ASSETS[1]]);
  assert.deepEqual(r.assets, [edited]);
});

test("content without the demo flag is never removed, even with a demo-like id", () => {
  const lookalike = { ...structuredClone(DEMO_CONTENT[0]), isDemo: undefined };
  delete lookalike.isDemo;
  assert.deepEqual(withoutDemoSamples([lookalike], []).content, [lookalike]);
});

test("the inputs are not modified", () => {
  const content = structuredClone(DEMO_CONTENT);
  const before = JSON.stringify(content);
  withoutDemoSamples(content, DEMO_ASSETS);
  assert.equal(JSON.stringify(content), before);
});

test("after removal an empty studio stays empty when reloaded (demo samples are not re-added)", () => {
  const r = withoutDemoSamples(structuredClone(DEMO_CONTENT), DEMO_ASSETS);
  const store = new Map<string, string>([["lfm-studio-v2", serialize(r.content, r.assets, [])]]);
  const loaded = loadState({ getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) });
  assert.equal(loaded.source, "v2");
  assert.deepEqual(loaded.content, []);
  assert.deepEqual(loaded.assets, []);
});

test("the confirmation names what will be removed and that a copy is kept", () => {
  assert.equal(removeDemoMessage({ content: 9, assets: 4 }), "Remove 9 demo content items and 4 demo asset links?\n\nYour own content and assets stay. A copy of everything is kept in browser storage first.");
  assert.match(removeDemoMessage({ content: 1, assets: 0 }), /^Remove 1 demo content item\?/);
  assert.match(removeDemoMessage({ content: 0, assets: 1 }), /^Remove 1 demo asset link\?/);
});
