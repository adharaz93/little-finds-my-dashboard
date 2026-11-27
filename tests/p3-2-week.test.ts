import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultNewDate, postsOn, weekDays, weekLabel, weekStart, weekSummary } from "../src/lib/week";
import type { Post } from "../src/lib/posts";

const post = (id: string, date: string, platform: Post["platform"]) => ({ id, date, platform }) as unknown as Post;

test("weeks start on Monday, whatever the day", () => {
  assert.equal(weekStart("2026-11-30"), "2026-11-30", "Monday");
  assert.equal(weekStart("2026-12-02"), "2026-11-30", "Wednesday");
  assert.equal(weekStart("2026-12-06"), "2026-11-30", "Sunday belongs to the week before");
});

test("a week crossing a month or year has seven consecutive days", () => {
  assert.deepEqual(weekDays("2026-12-28"), ["2026-12-28", "2026-12-29", "2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02", "2027-01-03"]);
  assert.equal(weekStart("2027-01-01"), "2026-12-28");
});

test("week labels read naturally within a month, across months and across years", () => {
  assert.equal(weekLabel("2026-11-16"), "16 – 22 Nov 2026");
  assert.equal(weekLabel("2026-11-30"), "30 Nov – 6 Dec 2026");
  assert.equal(weekLabel("2026-12-28"), "28 Dec 2026 – 3 Jan 2027");
});

test("posts are found by their own date; the summary counts each platform, zeros included", () => {
  const posts = [post("a", "2026-12-01", "Instagram"), post("b", "2026-12-01", "TikTok"), post("c", "2026-12-07", "Instagram"), post("d", "2026-11-29", "Threads")];
  assert.deepEqual(postsOn(posts, "2026-12-01").map((p) => p.id), ["a", "b"]);
  assert.deepEqual(weekSummary(posts, weekDays("2026-11-30")), { total: 2, byPlatform: { Instagram: 1, TikTok: 1, Threads: 0 } });
});

test("+ Add content defaults to today, or to the 1st of another month shown in month view", () => {
  const today = "2026-11-27";
  assert.equal(defaultNewDate("week", today, { y: 2027, m: 0 }), today);
  assert.equal(defaultNewDate("list", today, { y: 2027, m: 0 }), today);
  assert.equal(defaultNewDate("month", today, { y: 2026, m: 10 }), today, "current month");
  assert.equal(defaultNewDate("month", today, { y: 2027, m: 0 }), "2027-01-01");
});
