import { expect, test } from "@playwright/test";
import { KEY_V2, captureDialogs, isDesktop, item, metrics, pub, readStorage, seed, showPostedColumn, v2, watchProblems } from "./helpers";

// Performance panel flows (P1a–P1c). Desktop only; the smoke spec covers layout at every width.
const data = v2([
  item("h1", "History post", [
    pub("h1-ig", "Instagram", "2026-11-17", {
      metrics: metrics(1000, 250), metricsSource: "manual",
      snapshots: [{ id: "s-old", at: "2026-11-18T01:00:00.000Z", capturedOn: "2026-11-18", source: "manual", metrics: metrics(1000, 250), note: "IG Insights" }],
    }),
  ]),
]);
const stored = async (page: import("@playwright/test").Page) => JSON.parse((await readStorage(page, KEY_V2))!).content[0].publications[0];

test.beforeEach(async ({ page }, info) => {
  test.skip(!isDesktop(info), "flow tests run at desktop width");
  await page.clock.setFixedTime(new Date(2026, 10, 26, 10, 0)); // 26 Nov 2026
  await seed(page, { [KEY_V2]: data });
});

async function openPanel(page: import("@playwright/test").Page) {
  await page.goto("/posting");
  await showPostedColumn(page);
  await page.getByRole("button", { name: "Performance for History post, Instagram" }).click();
  return page.getByRole("dialog");
}

test("invalid numbers are blocked with messages; nothing is saved", async ({ page }) => {
  const dialog = await openPanel(page);
  await dialog.getByRole("button", { name: "+ Add capture" }).click();
  await dialog.getByLabel("Reach", { exact: true }).fill("1,200");
  await dialog.getByLabel("Comments", { exact: true }).fill("1.2K");
  await dialog.getByLabel("Shares", { exact: true }).fill("-1");
  await dialog.getByRole("button", { name: "Save capture" }).click();
  await expect(dialog.getByText("Enter a number (0 if there were none).")).toBeVisible(); // Likes left blank
  await expect(dialog.getByText(/not an abbreviation like 1\.2K/)).toBeVisible();
  await expect(dialog.getByText("Can't be negative.")).toBeVisible();
  expect((await stored(page)).snapshots).toHaveLength(1);
});

test("add, edit, remove and restore a capture", async ({ page }) => {
  const problems = watchProblems(page);
  const dialogs = captureDialogs(page);
  const dialog = await openPanel(page);

  // Add (24 Nov = Day 7).
  await dialog.getByRole("button", { name: "+ Add capture" }).click();
  await dialog.getByLabel("Numbers as of", { exact: true }).fill("2026-11-24");
  for (const [label, value] of [["Reach", "1,200"], ["Likes", "300"], ["Comments", "2"], ["Shares", "0"], ["Clicks (optional)", "15"]]) {
    await dialog.getByLabel(label, { exact: true }).fill(value);
  }
  await dialog.getByRole("button", { name: "Save capture" }).click();
  await expect(dialog.getByText("Latest · 24 Nov · Day 7")).toBeVisible();
  let p = await stored(page);
  expect(p.snapshots).toHaveLength(2);
  expect(p.metrics).toEqual({ reach: 1200, impressions: null, likes: 300, comments: 2, shares: 0, saves: null, clicks: 15 });

  // Edit the older capture: previous numbers go to its edit history; id and entry time stay.
  await dialog.getByRole("button", { name: "Edit capture from 18 Nov, Instagram" }).click();
  await dialog.getByLabel("Likes", { exact: true }).fill("260");
  await dialog.getByRole("button", { name: "Save changes" }).click();
  p = await stored(page);
  const old = p.snapshots.find((s: { id: string }) => s.id === "s-old");
  expect(old.at).toBe("2026-11-18T01:00:00.000Z");
  expect(old.edits).toEqual([{ at: expect.any(String), metrics: metrics(1000, 250) }]);
  expect(old.metrics.likes).toBe(260);

  // Remove the latest (asks first), then restore it.
  await dialog.getByRole("button", { name: "Remove capture from 24 Nov, Instagram" }).click();
  expect(dialogs.at(-1)).toBe('Remove the capture from 24 Nov? You can restore it later from "Removed".');
  await expect(dialog.getByText("Latest · 18 Nov · Day 1")).toBeVisible();
  p = await stored(page);
  expect(p.snapshots).toHaveLength(2); // soft delete: still stored
  expect(p.metrics.likes).toBe(260);
  await dialog.getByText(/^Removed \(1\)$/).click();
  await dialog.getByRole("button", { name: "Restore capture from 24 Nov" }).click();
  await expect(dialog.getByText("Latest · 24 Nov · Day 7")).toBeVisible();
  expect((await stored(page)).metrics.likes).toBe(300);
  expect(problems, problems.join("\n")).toEqual([]);
});

test("a capture dated before publishing shows 'Before publishing'", async ({ page }) => {
  const dialog = await openPanel(page);
  await dialog.getByRole("button", { name: "Edit capture from 18 Nov, Instagram" }).click();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  // Move the published date after the capture via the content form, then reopen.
  await dialog.getByRole("button", { name: "Close" }).click();
  await page.locator("main div.rounded-2xl").filter({ has: page.getByText("History post", { exact: true }) }).getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByRole("dialog").getByLabel("Published date", { exact: true }).fill("2026-11-20");
  await page.getByRole("dialog").getByRole("button", { name: "Save", exact: true }).click();
  const reopened = await openPanel(page);
  await expect(reopened.getByText("18 Nov").first()).toBeVisible();
  await expect(reopened.getByText("Before publishing").first()).toBeVisible();
  await expect(reopened.getByText(/Day -\d/)).toHaveCount(0);
});
