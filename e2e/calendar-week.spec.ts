import { expect, test, type Page } from "@playwright/test";
import { KEY_V2, expectNoOverflow, isDesktop, item, pub, seed, watchProblems } from "./helpers";

// Phase 3 P3-2: the Calendar week view. Page clock fixed to Friday 27 Nov 2026 (week of 23–29 Nov).
const NOW = new Date(2026, 10, 27, 10, 0);
const data = JSON.stringify({
  version: 2,
  assets: [],
  content: [
    item("w1", "Monday reel", [pub("w1-ig", "Instagram", "", { status: "Scheduled", scheduledDate: "2026-11-23" })]),
    item("w2", "Friday thread", [pub("w2-th", "Threads", "", { status: "Ready", scheduledDate: "2026-11-27" })]),
    item("w3", "Next week video", [pub("w3-tt", "TikTok", "", { status: "Idea", scheduledDate: "2026-12-02" })]),
  ],
});
const day = (page: Page, label: RegExp) => page.getByRole("region", { name: label });

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(NOW);
  await seed(page, { [KEY_V2]: data });
});

test("the week view opens first, marks today, and fits the screen", async ({ page }) => {
  const problems = watchProblems(page);
  await page.goto("/calendar");
  await expect(page.getByRole("button", { name: "week", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("heading", { name: "23 – 29 Nov 2026" })).toBeVisible();
  await expect(page.getByRole("region", { name: /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun) / })).toHaveCount(7);
  await expect(day(page, /^Fri 27 Nov, today$/)).toContainText("Today");
  await expect(day(page, /^Fri 27 Nov/)).toContainText("Friday thread");
  await expect(day(page, /^Mon 23 Nov/)).toContainText("Monday reel");
  await expect(page.getByLabel("Week summary")).toHaveText("2 posts this week · Instagram 1 · TikTok 0 · Threads 1");
  await expectNoOverflow(page);
  expect(problems, problems.join("\n")).toEqual([]);
});

test("moving between weeks, and back to this week", async ({ page }) => {
  await page.goto("/calendar");
  await page.getByRole("button", { name: "Next week" }).click();
  await expect(page.getByRole("heading", { name: "30 Nov – 6 Dec 2026" })).toBeVisible();
  await expect(day(page, /^Wed 2 Dec/)).toContainText("Next week video");
  await expect(page.getByLabel("Week summary")).toHaveText("1 post this week · Instagram 0 · TikTok 1 · Threads 0");
  await page.getByRole("button", { name: "This week" }).click();
  await expect(page.getByRole("heading", { name: "23 – 29 Nov 2026" })).toBeVisible();
  await expect(page.getByRole("button", { name: "This week" })).toHaveCount(0);
});

test("+ Add on a day opens a new post on that date; the header button uses today", async ({ page }) => {
  await page.goto("/calendar");
  await page.getByRole("button", { name: "Add content on Wed 25 Nov" }).click();
  const form = page.getByRole("dialog");
  await expect(form.getByLabel("Scheduled date")).toHaveValue("2026-11-25");
  await form.getByRole("button", { name: "Cancel" }).click();

  await page.getByRole("button", { name: "+ Add content" }).click();
  await expect(form.getByLabel("Scheduled date")).toHaveValue("2026-11-27");
});

test("the platform filter narrows the days; the summary still shows every platform", async ({ page }) => {
  await page.goto("/calendar");
  await page.getByLabel("Platform filter").selectOption("Instagram");
  await expect(day(page, /^Fri 27 Nov/)).not.toContainText("Friday thread");
  await expect(day(page, /^Mon 23 Nov/)).toContainText("Monday reel");
  await expect(page.getByLabel("Week summary")).toHaveText("2 posts this week · Instagram 1 · TikTok 0 · Threads 1");
});

test("month view: clicking an empty part of a day adds on that date; a post still opens", async ({ page }, info) => {
  test.skip(!isDesktop(info), "flow tests run at desktop width");
  await page.goto("/calendar");
  await page.getByRole("button", { name: "month", exact: true }).click();
  await page.locator('[data-date="2026-11-18"]').click({ position: { x: 40, y: 70 } });
  const form = page.getByRole("dialog");
  await expect(form.getByLabel("Scheduled date")).toHaveValue("2026-11-18");
  await form.getByRole("button", { name: "Cancel" }).click();

  await page.locator('[data-date="2026-11-23"]').getByRole("button", { name: "Monday reel" }).click();
  await expect(form.getByLabel("Title", { exact: true })).toHaveValue("Monday reel");
  await form.getByRole("button", { name: "Cancel" }).click();

  await page.getByRole("button", { name: "Next month" }).click();
  await page.getByRole("button", { name: "+ Add content" }).click();
  await expect(form.getByLabel("Scheduled date")).toHaveValue("2026-12-01");
});
