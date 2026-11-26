import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { KEY_V2, expectNoOverflow, isDesktop, item, metrics, pub, readStorage, seed, v2, watchProblems } from "./helpers";

// Suggestions (Phase 2 P3). Page clock fixed to 27 Nov 2026 (12.12 is 15 days away).
const KEY_PREFS = "lfm-studio-prefs";
const NOW = new Date(2026, 10, 27, 10, 0);
const ig = (id: string, likes: number, over: Record<string, unknown> = {}) => pub(id, "Instagram", "2026-11-10", { metrics: metrics(1000, likes), metricsSource: "manual", ...over });
const data = v2([
  item("g1", "Gift A", [ig("g1-ig", 90, { format: "Carousel" })], { pillar: "Product Finds", tags: ["gift guide"] }),
  item("g2", "Gift B", [ig("g2-ig", 90, { format: "Carousel" })], { pillar: "Product Finds", tags: ["gift guide"] }),
  item("g3", "Gift C", [ig("g3-ig", 90, { format: "Carousel" })], { pillar: "Product Finds", tags: ["gift guide"] }),
  item("t1", "Tip A", [ig("t1-ig", 30)], { pillar: "Parenting Tips" }),
  item("t2", "Tip B", [ig("t2-ig", 30)], { pillar: "Parenting Tips" }),
  item("t3", "Tip C", [ig("t3-ig", 30)], { pillar: "Parenting Tips" }),
  item("tt", "TikTok idea", [pub("tt-tt", "TikTok", "", { status: "Idea", scheduledDate: "2026-12-20" })]),
]);
const EXPECTED = ["Line up your next posts", "12.12 sale is in 15 days", "Do more Product Finds", "Try more Carousel posts", "Make another “gift guide” post", "Post “Gift A” on TikTok"];
const full = (page: import("@playwright/test").Page) => page.locator("section").filter({ has: page.getByRole("heading", { name: "Suggestions", exact: true }) });
const titles = async (page: import("@playwright/test").Page) => (await full(page).locator("li p.font-medium").allInnerTexts()).map((t) => t.trim());

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(NOW);
});

test("Analytics lists every suggestion, in a fixed order, at every width", async ({ page }) => {
  const problems = watchProblems(page);
  await seed(page, { [KEY_V2]: data });
  await page.goto("/analytics");
  await expect.poll(() => titles(page)).toEqual(EXPECTED);
  await expect(full(page)).toContainText("Product Finds posts get 1.5× your usual engagement over 3 posts (early signal).");
  await expectNoOverflow(page);
  expect(problems, problems.join("\n")).toEqual([]);
});

test("Add as idea creates the idea and hides the suggestion", async ({ page }, info) => {
  test.skip(!isDesktop(info), "flow tests run at desktop width");
  await seed(page, { [KEY_V2]: data });
  await page.goto("/analytics");
  await full(page).getByRole("button", { name: "Add as idea: Do more Product Finds" }).click();
  await expect(full(page)).toContainText("Added “New Product Finds post” to Content Bank as an idea.");
  await expect.poll(() => titles(page)).toEqual(EXPECTED.filter((t) => t !== "Do more Product Finds"));
  const content = JSON.parse((await readStorage(page, KEY_V2))!).content;
  const added = content.find((c: { title: string }) => c.title === "New Product Finds post");
  expect(added.pillar).toBe("Product Finds");
  expect(added.publications).toHaveLength(1);
  expect(added.publications[0]).toMatchObject({ platform: "Instagram", status: "Idea", scheduledDate: "2026-11-27", metrics: null });
  await page.goto("/bank");
  await expect(page.getByRole("heading", { name: "New Product Finds post" })).toBeVisible();
});

test("cross-post adds an Idea on the missing platform to the same item", async ({ page }, info) => {
  test.skip(!isDesktop(info), "flow tests run at desktop width");
  await seed(page, { [KEY_V2]: data });
  await page.goto("/analytics");
  await full(page).getByRole("button", { name: "Add TikTok idea: Post “Gift A” on TikTok" }).click();
  await expect.poll(async () => JSON.parse((await readStorage(page, KEY_V2))!).content.find((c: { id: string }) => c.id === "g1").publications.map((p: { platform: string; status: string }) => `${p.platform}/${p.status}`)).toEqual(["Instagram/Posted", "TikTok/Idea"]);
});

test("Dismiss hides a suggestion across reloads and never reaches a backup", async ({ page }, info) => {
  test.skip(!isDesktop(info), "flow tests run at desktop width");
  await seed(page, { [KEY_V2]: data });
  await page.goto("/analytics");
  await full(page).getByRole("button", { name: "Dismiss: 12.12 sale is in 15 days" }).click();
  await expect.poll(() => titles(page)).not.toContain("12.12 sale is in 15 days");
  expect(JSON.parse((await readStorage(page, KEY_PREFS))!)).toEqual({ dismissed: { "moment:12-12-2026": "2026-11-27" } });
  await page.reload();
  await expect.poll(() => titles(page)).toEqual(EXPECTED.filter((t) => t !== "12.12 sale is in 15 days"));
  await page.goto("/");
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Export backup" }).click()]);
  const text = readFileSync((await download.path())!, "utf8");
  expect(text).not.toContain("dismissed");
  expect(text).not.toContain(KEY_PREFS);
});

test("the Insights rail shows the top 3", async ({ page }, info) => {
  test.skip(!isDesktop(info), "the rail is visible from 1280 px");
  await seed(page, { [KEY_V2]: data });
  await page.goto("/");
  const rail = page.locator("aside section").filter({ hasText: "Suggestions" });
  await expect.poll(async () => (await rail.locator("li p.font-medium").allInnerTexts()).map((t) => t.trim())).toEqual(EXPECTED.slice(0, 3));
});

test("demo preview shows demo suggestions with actions turned off", async ({ page }, info) => {
  test.skip(!isDesktop(info), "flow tests run at desktop width");
  await seed(page, {}); // demo samples only
  await page.goto("/analytics");
  await page.getByRole("button", { name: "Demo preview" }).click();
  await expect(full(page)).toContainText("Demo preview: actions are turned off.");
  await expect(full(page).locator("li").first()).toBeVisible();
  await expect(full(page).getByRole("button", { name: /^(Add|Dismiss)/ })).toHaveCount(0);
});
