import { expect, test } from "@playwright/test";
import { KEY_V2, expectNoOverflow, item, metrics, pub, seed, v2, watchProblems } from "./helpers";

// "What's working" (Phase 2 P2). Page clock fixed to 27 Nov 2026; Analytics defaults to the last 30 days.
const NOW = new Date(2026, 10, 27, 10, 0);
// metrics(reach, likes) with 1 comment: Instagram rates 9.1/9.1/9.1/3.1/3.1/3.1 → usual ≈ 6.1.
const ig = (id: string, likes: number, over: Record<string, unknown> = {}) => pub(id, "Instagram", "2026-11-10", { metrics: metrics(1000, likes), metricsSource: "manual", ...over });
const data = v2([
  item("g1", "Gift A", [ig("g1-ig", 90, { format: "Carousel" })], { pillar: "Product Finds", tags: ["gift guide"] }),
  item("g2", "Gift B", [ig("g2-ig", 90, { format: "Carousel" })], { pillar: "Product Finds", tags: ["gift guide"] }),
  item("g3", "Gift C", [ig("g3-ig", 90, { format: "Carousel" })], { pillar: "Product Finds", tags: ["gift guide"] }),
  item("t1", "Tip A", [ig("t1-ig", 30, { format: "Photo" })], { pillar: "Parenting Tips" }),
  item("t2", "Tip B", [ig("t2-ig", 30, { format: "Photo" })], { pillar: "Parenting Tips" }),
  item("t3", "Tip C", [ig("t3-ig", 30)], { pillar: "Parenting Tips" }),
  item("tt", "One TikTok", [pub("tt-tt", "TikTok", "2026-11-10", { metrics: metrics(5000, 100), metricsSource: "manual" })]),
  item("new", "Too new", [ig("new-ig", 300, { publishedDate: "2026-11-25" })], { pillar: "Promo" }),
]);
const section = (page: import("@playwright/test").Page) => page.locator("section").filter({ has: page.getByRole("heading", { name: "What's working" }) });
const card = (page: import("@playwright/test").Page, title: string) => section(page).locator("div.rounded-\\[20px\\]").filter({ has: page.getByRole("heading", { name: title, exact: true }) });

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(NOW);
});

test("ranks pillars, formats and topics by lift, with labels and coverage", async ({ page }) => {
  const problems = watchProblems(page);
  await seed(page, { [KEY_V2]: data });
  await page.goto("/analytics");
  const s = section(page);
  await expect(s).toBeVisible();

  const pillars = card(page, "Pillars").locator("li");
  await expect(pillars).toHaveCount(2);
  await expect(pillars.nth(0)).toContainText("Product Finds");
  await expect(pillars.nth(0)).toContainText("1.5×");
  await expect(pillars.nth(0)).toContainText("Early signal");
  await expect(pillars.nth(1)).toContainText("Parenting Tips");
  await expect(pillars.nth(1)).toContainText("0.5×");

  await expect(card(page, "Formats").locator("li")).toHaveCount(1); // Carousel ×3; Photo ×2 is hidden
  await expect(card(page, "Formats")).toContainText("Carousel");
  await expect(card(page, "Formats")).toContainText("1 more with fewer than 3 posts.");
  await expect(card(page, "Formats")).toContainText("1 of 6 compared posts have no format yet.");

  await expect(card(page, "Topics")).toContainText("gift guide");
  await expect(card(page, "Topics")).toContainText("3 of 6 compared posts have no topics yet.");

  await expect(s).toContainText("TikTok isn't compared yet (1 of 3 posts needed).");
  await expect(s).toContainText("1 newer post will count once 7 days old.");
  await expectNoOverflow(page);
  expect(problems, problems.join("\n")).toEqual([]);
});

test("Best-performing pillar card agrees with the table", async ({ page }) => {
  await seed(page, { [KEY_V2]: data });
  await page.goto("/analytics");
  const highlight = page.locator("div").filter({ has: page.getByText("Best-performing pillar", { exact: true }) }).last();
  await expect(highlight).toContainText("Product Finds");
  await expect(highlight).toContainText("1.5× your usual engagement rate, 3 posts");
});

test("not enough data shows the empty state", async ({ page }) => {
  await seed(page, { [KEY_V2]: v2([item("x", "Only one", [ig("x-ig", 50)])]) });
  await page.goto("/analytics");
  await expect(section(page)).toContainText("Not enough posts yet");
});

test("demo preview shows demo groups; real view never does", async ({ page }) => {
  await seed(page, {}); // demo samples only
  await page.goto("/analytics");
  await expect(section(page)).toContainText("Not enough posts yet"); // real view: demo numbers never count
  await page.getByRole("button", { name: "Demo preview" }).click();
  await page.getByRole("button", { name: "Last 90 days" }).click();
  await expect(card(page, "Topics")).toContainText("toddler play");
});
