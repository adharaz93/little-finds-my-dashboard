import { expect, test } from "@playwright/test";
import { KEY_V2, expectNoOverflow, isDesktop, item, metrics, pub, seed, showPostedColumn, v2, watchProblems } from "./helpers";

// Phase 2 P4: capture timeline and the Day 7 basis. Page clock fixed to 27 Nov 2026.
const NOW = new Date(2026, 10, 27, 10, 0);
const snap = (id: string, capturedOn: string, reach: number, likes: number) =>
  ({ id, at: `${capturedOn}T02:00:00.000Z`, capturedOn, source: "manual", metrics: metrics(reach, likes) });

// Published 1 Nov. Day 7 reading = 8 Nov; latest = 25 Nov.
const withHistory = (id: string, title: string, pillar: string, day7Likes: number, latestLikes: number) =>
  item(id, title, [pub(`${id}-ig`, "Instagram", "2026-11-01", {
    metrics: metrics(1000, latestLikes), metricsSource: "manual",
    snapshots: [snap(`${id}-a`, "2026-11-02", 400, 10), snap(`${id}-b`, "2026-11-08", 1000, day7Likes), snap(`${id}-c`, "2026-11-25", 1000, latestLikes)],
  })], { pillar });
const data = v2([
  withHistory("a1", "Early A1", "Fast start", 50, 20), withHistory("a2", "Early A2", "Fast start", 50, 20), withHistory("a3", "Early A3", "Fast start", 50, 20),
  withHistory("b1", "Late B1", "Slow burn", 10, 60), withHistory("b2", "Late B2", "Slow burn", 10, 60), withHistory("b3", "Late B3", "Slow burn", 10, 60),
  item("one", "Single capture", [pub("one-ig", "Instagram", "2026-11-01", { metrics: metrics(500, 25), metricsSource: "manual", snapshots: [snap("one-a", "2026-11-20", 500, 25)] })]),
]);

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(NOW);
  await seed(page, { [KEY_V2]: data });
});

async function openPanel(page: import("@playwright/test").Page, title: string) {
  await page.goto("/posting");
  await showPostedColumn(page);
  await page.getByRole("button", { name: `Performance for ${title}, Instagram` }).click();
  return page.getByRole("dialog");
}

test("a post with 2+ dated captures shows the timeline; one capture shows the empty state", async ({ page }) => {
  const problems = watchProblems(page);
  let dialog = await openPanel(page, "Early A1");
  const timeline = dialog.getByRole("region", { name: "Timeline" });
  await expect(timeline).toContainText("Day 1 to Day 24 after publishing");
  await expect(timeline.getByRole("img", { name: /^Reach by day: Day 1 400, Day 7 1,000, Day 24 1,000$/ })).toBeVisible();
  // metrics() adds 1 comment: day 1 = (10 + 1) / 400 = 2.75% → 2.8%; day 7 = 51/1000; day 24 = 21/1000.
  await expect(timeline.getByRole("img", { name: /^Engagement rate by day: Day 1 2\.8%, Day 7 5\.1%, Day 24 2\.1%$/ })).toBeVisible();
  // Each chart's readout shows its maximum; keyboard focus on a point shows that point instead.
  await expect(timeline.getByRole("status")).toHaveText(["max 1,000", "max 5.1%"]);
  await timeline.getByRole("img", { name: "Day 7, 8 Nov: 1,000" }).focus();
  await expect(timeline.getByRole("status")).toHaveText(["Day 7 · 8 Nov · 1,000", "max 5.1%"]);
  await expectNoOverflow(page);
  await dialog.getByRole("button", { name: "Close" }).click();

  dialog = await openPanel(page, "Single capture");
  await expect(dialog).toContainText("Not enough history yet: the timeline appears once there are 2 dated captures.");
  expect(problems, problems.join("\n")).toEqual([]);
});

test("What's working: Day 7 reading compares posts at the same age", async ({ page }, info) => {
  test.skip(!isDesktop(info), "flow tests run at desktop width");
  await page.goto("/analytics");
  await page.getByRole("button", { name: "Last 90 days" }).click();
  const section = page.locator("section").filter({ has: page.getByRole("heading", { name: "What's working" }) });
  const pillars = section.locator("div.rounded-\\[20px\\]").filter({ has: page.getByRole("heading", { name: "Pillars", exact: true }) }).locator("li");

  await expect(pillars.nth(0)).toContainText("Slow burn"); // latest numbers: 6.1% vs 2.1%
  await section.getByRole("button", { name: "Day 7 reading" }).click();
  await expect(section.getByRole("button", { name: "Day 7 reading" })).toHaveAttribute("aria-pressed", "true");
  await expect(pillars.nth(0)).toContainText("Fast start"); // at day 7: 5.1% vs 1.1%
  await expect(section).toContainText("Each post's first capture from day 7–13 after publishing");
  await expect(section).toContainText("1 post has no capture from day 7–13, so it isn't compared here.");
  await section.getByRole("button", { name: "Latest numbers" }).click();
  await expect(pillars.nth(0)).toContainText("Slow burn");
});
