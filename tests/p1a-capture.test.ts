import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isValidDate, localToday, parseCount, parseMetricDraft, resolvePublishedDate, sameMetrics, toMetricDraft, type MetricDraft,
} from "../src/lib/capture";
import { migrateContent } from "../src/lib/migrate";

const draft = (over: Partial<MetricDraft> = {}): MetricDraft => ({
  reach: "1000", impressions: "", likes: "50", comments: "5", shares: "2", saves: "", clicks: "", ...over,
});
const err = (raw: string, required = true) => {
  const r = parseCount(raw, required);
  assert.equal(r.ok, false, `expected "${raw}" to be rejected`);
  return r.ok ? "" : r.error;
};
const val = (raw: string, required = true) => {
  const r = parseCount(raw, required);
  assert.equal(r.ok, true, `expected "${raw}" to be accepted`);
  return r.ok ? r.value : undefined;
};

/* ---------- metric validation ---------- */

test("blank required fields are rejected", () => {
  for (const k of ["reach", "likes", "comments", "shares"] as const) {
    const r = parseMetricDraft(draft({ [k]: "  " }));
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.deepEqual(Object.keys(r.errors), [k]);
      assert.match(r.errors[k]!, /Enter a number \(0 if there were none\)/);
    }
  }
});

test("zero is accepted for required metrics", () => {
  const r = parseMetricDraft(draft({ reach: "0", likes: "0", comments: "0", shares: "0" }));
  assert.equal(r.ok, true);
  if (r.ok) assert.deepEqual([r.metrics.reach, r.metrics.likes, r.metrics.comments, r.metrics.shares], [0, 0, 0, 0]);
});

test("blank optional fields become null, not zero", () => {
  const r = parseMetricDraft(draft());
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.metrics.impressions, null);
    assert.equal(r.metrics.saves, null);
    assert.equal(r.metrics.clicks, null);
  }
  assert.equal(val("", false), null);
});

test("zero in an optional field stays zero", () => {
  const r = parseMetricDraft(draft({ saves: "0", clicks: "0" }));
  assert.equal(r.ok && r.metrics.saves, 0);
  assert.equal(r.ok && r.metrics.clicks, 0);
});

test("clicks are captured", () => {
  const r = parseMetricDraft(draft({ clicks: "1,250" }));
  assert.equal(r.ok && r.metrics.clicks, 1250);
});

test("comma thousands parse correctly", () => {
  assert.equal(val("1,200"), 1200);
  assert.equal(val("12,345,678"), 12345678);
  assert.equal(val(" 1200 "), 1200);
  assert.equal(val("007"), 7);
});

test("abbreviations are rejected", () => {
  for (const s of ["1.2K", "1.2k", "3M", "12K", "1,2K", "5 k", "2b"]) assert.match(err(s), /exact number, not an abbreviation/);
});

test("decimals are rejected", () => {
  for (const s of ["1.5", "0.5", ".5", "1,200.50", "1."]) assert.match(err(s), /Whole numbers only/);
});

test("negative values are rejected", () => {
  for (const s of ["-1", "-0", "- 5", "-1,200", "-1.5"]) assert.match(err(s), /Can't be negative/);
});

test("invalid characters are rejected", () => {
  for (const s of ["abc", "12a", "1 200", "+5", "1e3", "RM50", "50%", "١٢"]) assert.match(err(s), /Numbers only/);
});

test("misplaced commas are rejected, never reinterpreted", () => {
  for (const s of ["12,00", "1,2,0,0", ",100", "100,"]) assert.match(err(s), /Check the commas/);
});

test("unsafely large numbers are rejected", () => {
  assert.match(err("99999999999999999999"), /too large/);
});

test("every invalid field is reported at once, and no metrics are produced", () => {
  const r = parseMetricDraft(draft({ reach: "", likes: "1.2K", saves: "-3", clicks: "x" }));
  assert.equal(r.ok, false);
  if (!r.ok) assert.deepEqual(Object.keys(r.errors).sort(), ["clicks", "likes", "reach", "saves"]);
});

test("stored numbers round-trip through the form unchanged", () => {
  const m = { reach: 1200, impressions: null, likes: 0, comments: 3, shares: 0, saves: 7, clicks: null };
  const r = parseMetricDraft(toMetricDraft(m));
  assert.equal(r.ok, true);
  if (r.ok) assert.ok(sameMetrics(r.metrics, m));
  assert.deepEqual(toMetricDraft(null), { reach: "", impressions: "", likes: "", comments: "", shares: "", saves: "", clicks: "" });
});

test("missing and null clicks count as the same 'not reported'", () => {
  const a = { reach: 1, impressions: null, likes: 1, comments: 1, shares: 1, saves: null };
  assert.ok(sameMetrics(a, { ...a, clicks: null }));
  assert.ok(!sameMetrics(a, { ...a, clicks: 0 }));
});

test("stored null clicks are kept as null when loading", () => {
  const item = {
    id: "u1", title: "t", pillar: "Promo", idea: "", assetUrl: "", notes: "",
    publications: [{ id: "p1", platform: "Instagram", caption: "", status: "Posted", scheduledDate: "2026-11-20", publishedDate: "2026-11-20", postUrl: "", postId: "",
      metrics: { reach: 10, impressions: null, likes: 1, comments: 0, shares: 0, saves: null, clicks: null }, metricsSource: "manual", lastSyncedAt: null, snapshots: [] }],
  };
  const [c] = migrateContent([item]);
  assert.equal(c.publications[0].metrics?.clicks, null);
  assert.equal(JSON.stringify(c.publications[0].metrics), JSON.stringify(item.publications[0].metrics));
});

/* ---------- published-date rule ---------- */

const TODAY = "2026-11-26";

test("an existing valid published date is preserved", () => {
  assert.equal(resolvePublishedDate({ publishedDate: "2026-11-01", scheduledDate: "2026-11-20" }, TODAY), "2026-11-01");
  // Even a future one the user typed on purpose.
  assert.equal(resolvePublishedDate({ publishedDate: "2026-12-05", scheduledDate: "2026-11-20" }, TODAY), "2026-12-05");
});

test("a past or today's scheduled date is used when there is no published date", () => {
  assert.equal(resolvePublishedDate({ publishedDate: "", scheduledDate: "2026-11-20" }, TODAY), "2026-11-20");
  assert.equal(resolvePublishedDate({ publishedDate: "", scheduledDate: TODAY }, TODAY), TODAY);
});

test("today is used when the scheduled date is in the future or unusable", () => {
  assert.equal(resolvePublishedDate({ publishedDate: "", scheduledDate: "2026-12-09" }, TODAY), TODAY);
  assert.equal(resolvePublishedDate({ publishedDate: "", scheduledDate: "" }, TODAY), TODAY);
  assert.equal(resolvePublishedDate({ publishedDate: "", scheduledDate: "2026-02-30" }, TODAY), TODAY);
});

test("an invalid published date is not kept", () => {
  assert.equal(resolvePublishedDate({ publishedDate: "2026-13-01", scheduledDate: "2026-11-20" }, TODAY), "2026-11-20");
  assert.equal(resolvePublishedDate({ publishedDate: "26/11/2026", scheduledDate: "2026-12-30" }, TODAY), TODAY);
});

test("date validation accepts only real YYYY-MM-DD dates", () => {
  for (const s of ["2026-11-26", "2024-02-29"]) assert.ok(isValidDate(s), s);
  for (const s of ["", "2026-1-5", "2026-02-30", "2025-02-29", "2026-11-26T00:00", null, 20261126]) assert.ok(!isValidDate(s), String(s));
});

test("local dates do not shift with UTC (Malaysia, UTC+8, early morning)", () => {
  const saved = process.env.TZ;
  process.env.TZ = "Asia/Kuala_Lumpur";
  try {
    const earlyMorning = new Date(2026, 10, 27, 1, 30); // 27 Nov, 01:30 local
    assert.equal(earlyMorning.toISOString().slice(0, 10), "2026-11-26", "UTC is still the previous day");
    assert.equal(localToday(earlyMorning), "2026-11-27");
    // A post scheduled for 27 Nov counts as "today", not as a future date.
    assert.equal(resolvePublishedDate({ publishedDate: "", scheduledDate: "2026-11-27" }, localToday(earlyMorning)), "2026-11-27");
    const lateNight = new Date(2026, 10, 27, 23, 59);
    assert.equal(localToday(lateNight), "2026-11-27");
  } finally {
    if (saved === undefined) delete process.env.TZ;
    else process.env.TZ = saved;
  }
});
