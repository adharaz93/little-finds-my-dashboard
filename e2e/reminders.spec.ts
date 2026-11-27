import { expect, test } from "@playwright/test";
import { KEY_V2, captureDialogs, isDesktop, item, pub, seed, showPostedColumn, todoRows, v2, watchProblems } from "./helpers";

// Reminder UI (P1d Task 5) with a fixed page clock: 25 Nov 2026, 10:00 local.
// Ages: 0, 3 (Day 1), 8 (Day 7), 31 (Day 30), 50 (expired); one Posted item without a date; one demo.
const NOW = new Date(2026, 10, 25, 10, 0);
const data = v2([
  item("a0", "Age 0 post", [pub("a0-ig", "Instagram", "2026-11-25")]),
  item("a3", "Age 3 post", [pub("a3-tt", "TikTok", "2026-11-22")]),
  item("a8", "Age 8 post", [pub("a8-ig", "Instagram", "2026-11-17")]),
  item("a31", "Age 31 post", [pub("a31-th", "Threads", "2026-10-25")]),
  item("a50", "Age 50 post", [pub("a50-ig", "Instagram", "2026-10-06")]),
  item("nd", "No date post", [pub("nd-ig", "Instagram", "")]),
  item("demo", "Demo sample post", [pub("demo-ig", "Instagram", "2026-11-22")], { isDemo: true }),
]);
const START = ["3 posts due for numbers", "1 posted items need a published date", "4 posts need performance data"];

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(NOW);
  await seed(page, { [KEY_V2]: data });
});

const card = (page: import("@playwright/test").Page, title: string) =>
  page.locator("main div.rounded-2xl").filter({ has: page.getByText(title, { exact: true }) });

test("Dashboard To-do counts, without double counting", async ({ page }) => {
  const problems = watchProblems(page);
  await page.goto("/");
  await expect.poll(() => todoRows(page)).toEqual(START);
  expect(problems, problems.join("\n")).toEqual([]);
});

test("Insights rail shows the same counts", async ({ page }, info) => {
  test.skip(!isDesktop(info), "the rail is visible from 1280 px");
  await page.goto("/");
  // The Pending tasks section only: the rail also holds other lists (e.g. Suggestions).
  const rail = page.locator("aside section").filter({ hasText: "Pending tasks" });
  await expect.poll(async () => (await rail.locator("li").allInnerTexts()).map((t) => t.replace(/\s+/g, " ").trim())).toEqual(START);
});

test("To-do links go to Posting and Content Bank", async ({ page }) => {
  await page.goto("/");
  const todo = page.locator("main section").filter({ has: page.getByRole("heading", { name: "To do", exact: true }) });
  await todo.getByRole("link", { name: /posts due for numbers/ }).click();
  await expect(page).toHaveURL("/posting");
  await page.goto("/");
  await todo.getByRole("link", { name: /need a published date/ }).click();
  await expect(page).toHaveURL("/bank");
});

test("Posting badges match their own publications", async ({ page }) => {
  await page.goto("/posting");
  await showPostedColumn(page);
  await expect(card(page, "Age 3 post").getByText("Day 1 numbers due")).toBeVisible();
  await expect(card(page, "Age 8 post").getByText("Day 7 numbers due")).toBeVisible();
  await expect(card(page, "Age 31 post").getByText("Day 30 numbers due")).toBeVisible();
  for (const title of ["Age 0 post", "Age 50 post", "No date post", "Demo sample post"]) {
    await expect(card(page, title).getByText(/numbers due/)).toHaveCount(0);
  }
});

test("a capture clears the reminder", async ({ page }) => {
  await captureDialogs(page);
  await page.goto("/posting");
  await showPostedColumn(page);
  await page.getByRole("button", { name: "Performance for Age 8 post, Instagram" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "+ Add capture" }).click();
  await expect(dialog.getByLabel("Numbers as of", { exact: true })).toHaveValue("2026-11-25");
  for (const [label, value] of [["Reach", "1000"], ["Likes", "10"], ["Comments", "1"], ["Shares", "0"]]) {
    await dialog.getByLabel(label, { exact: true }).fill(value);
  }
  await dialog.getByRole("button", { name: "Save capture" }).click();
  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(card(page, "Age 8 post").getByText(/numbers due/)).toHaveCount(0);
  await expect(card(page, "Age 3 post").getByText("Day 1 numbers due")).toBeVisible();
  await page.goto("/");
  await expect.poll(() => todoRows(page)).toEqual(["2 posts due for numbers", "1 posted items need a published date", "4 posts need performance data"]);
});

test("a tab shown again picks up a new date, with no timer", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => todoRows(page)).toEqual(START);
  await page.clock.setFixedTime(new Date(2026, 11, 1, 10, 0)); // 1 Dec
  await page.waitForTimeout(500);
  expect(await todoRows(page), "nothing changes without the event").toEqual(START);
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  // 1 Dec: ages 6 (Day 1), 9 (Day 7), 14 (Day 7), 37 (Day 30), 56 (expired).
  await expect.poll(() => todoRows(page)).toEqual(["4 posts due for numbers", "1 posted items need a published date", "3 posts need performance data"]);
});
