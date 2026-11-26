import { expect, test } from "@playwright/test";
import { KEY_V2, ROUTES, expectNoOverflow, item, pub, readStorage, seed, v2, watchProblems } from "./helpers";

// Runs at 375, 768 and 1440 px (one Playwright project per width).
const data = v2([
  item("s1", "Smoke posted item", [pub("s1-ig", "Instagram", "2026-11-17")]),
  item("s2", "Smoke idea", [pub("s2-th", "Threads", "", { status: "Idea" })]),
]);

for (const route of ROUTES) {
  test(`${route} loads cleanly`, async ({ page }) => {
    const problems = watchProblems(page);
    await seed(page, { [KEY_V2]: data });
    await page.goto(route);
    await expect(page.locator("main h1").first()).toBeVisible();
    await page.waitForLoadState("networkidle");
    await expectNoOverflow(page);
    expect(problems, problems.join("\n")).toEqual([]);
  });
}

test("navigation between all pages works without errors", async ({ page }) => {
  const problems = watchProblems(page);
  await seed(page, { [KEY_V2]: data });
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "Main" }).filter({ visible: true }).first();
  for (const route of ROUTES.slice(1)) {
    await nav.locator(`a[href="${route}"]`).click();
    await expect(page).toHaveURL(route);
    await expect(page.locator("main h1").first()).toBeVisible();
  }
  expect(problems, problems.join("\n")).toEqual([]);
});

test("viewing every page never changes stored data", async ({ page }) => {
  await seed(page, { [KEY_V2]: data });
  for (const route of ROUTES) {
    await page.goto(route);
    await page.waitForLoadState("networkidle");
  }
  expect(await readStorage(page, KEY_V2)).toBe(data);
});
